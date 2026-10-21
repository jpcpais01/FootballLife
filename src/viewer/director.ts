// Off-ball football: turns the formation-slot targets from the shared shape
// model into the movement you'd see from two real teams. Runners attack the
// space behind the defensive line, team-mates offer angles to the ball carrier,
// defenders hold a flat line, track runners goal-side, press and cover, the
// keeper sets his angle, and every restart has its own shape: corners, walls,
// penalties, goal kicks and throw-ins. Presentation only; the simulation's
// result never depends on this.
import type { Slot } from '../../shared/formations.ts';
import type { Position } from '../../shared/attributes.ts';
import { fromAbs, toAbs, type Pt } from '../../shared/shape.ts';
import type { MatchEvent } from '../../shared/sim/types.ts';

export interface V2 { x: number; y: number }

export interface DirectorInput {
  t: number;
  ball: V2;
  holder: number;
  poss: 0 | 1;
  phase: 'play' | 'dead' | 'flight';
  prev: MatchEvent | null;
  next: MatchEvent | null;
  /** 0..1 while the holder shapes to pass, null otherwise. */
  holdK: number | null;
  slots: [Slot[], Slot[]];
  sentOff: boolean[];
  dir: (side: 0 | 1) => 1 | -1;
}

const RESTARTS = new Set(['goalkick', 'throwin', 'corner', 'freekick', 'penalty']);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const mix = (a: V2, b: V2, k: number): V2 => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const dist = (a: V2, b: V2) => Math.hypot(a.x - b.x, a.y - b.y);
const unit = (from: V2, to: V2): V2 => {
  const d = dist(from, to) || 1;
  return { x: (to.x - from.x) / d, y: (to.y - from.y) / d };
};
const frac = (x: number) => x - Math.floor(x);

const BOX_PRIORITY: Partial<Record<Position, number>> = { CB: 3, ST: 3, WG: 2, AM: 2, CM: 1.5, DM: 1, FB: 0.5 };

export function direct(inp: DirectorInput, targets: V2[]) {
  const { t, ball, slots, sentOff } = inp;
  const role = (idx: number) => slots[idx < 11 ? 0 : 1][idx % 11].role;
  const sideOf = (idx: number) => (idx < 11 ? 0 : 1) as 0 | 1;
  const team = (side: 0 | 1) => Array.from({ length: 11 }, (_, k) => side * 11 + k).filter((i) => !sentOff[i]);
  const outfield = (side: 0 | 1) => team(side).filter((i) => role(i) !== 'GK');
  const keeper = (side: 0 | 1) => team(side).find((i) => role(i) === 'GK') ?? -1;
  const inFrame = (p: V2, side: 0 | 1) => fromAbs(p.x, p.y, inp.dir(side));
  const toPitch = (p: Pt, side: 0 | 1) => toAbs({ u: clamp(p.u, 0.005, 0.995), v: clamp(p.v, -0.98, 0.98) }, inp.dir(side));
  const ownGoal = (side: 0 | 1) => toAbs({ u: 0, v: 0 }, inp.dir(side));

  // ---- Restarts ----
  const sp =
    inp.next && inp.phase === 'dead' && RESTARTS.has(inp.next.k) ? inp.next
    : inp.prev && RESTARTS.has(inp.prev.k) && t - inp.prev.t < 2.2 ? inp.prev
    : null;
  if (sp) {
    setPiece(sp);
    return;
  }

  const A = inp.poss;
  const D = (1 - A) as 0 | 1;
  const ballA = inFrame(ball, A);

  // ---- Keepers ----
  for (const side of [0, 1] as const) {
    const gk = keeper(side);
    if (gk < 0 || gk === inp.holder) continue;
    const g = ownGoal(side);
    if (side === D) {
      const db = dist(g, ball);
      const d = clamp(1 + db * 0.075, 1, 6);
      const u = unit(g, ball);
      targets[gk] = { x: g.x + u.x * d, y: g.y + u.y * d };
    }
    if (inp.phase === 'flight' && inp.next?.k === 'shot' && side === D) {
      // Set on the line, shifting toward where the shot is going.
      targets[gk] = { x: g.x + inp.dir(side) * 0.6, y: clamp(inp.next.y * 0.65, -3, 3) };
    }
  }

  // ---- Defending side: a flat back line ----
  const back = outfield(D).filter((i) => role(i) === 'CB' || role(i) === 'FB');
  if (back.length >= 3) {
    const us = back.map((i) => inFrame(targets[i], D).u);
    const line = us.reduce((a, b) => a + b, 0) / us.length;
    for (const i of back) {
      const p = inFrame(targets[i], D);
      targets[i] = toPitch({ u: line * 0.85 + p.u * 0.15, v: p.v }, D);
    }
  }
  // Offside line in the attackers' frame: the deepest defending outfielder.
  const lineA = Math.max(ballA.u, ...outfield(D).map((i) => inFrame(targets[i], A).u));

  // ---- Attacking side ----
  const receiver = inp.next && (inp.next.k === 'pass' || inp.next.k === 'cross') ? inp.next.q ?? -1 : -1;
  for (const i of outfield(A)) {
    if (i === inp.holder || i === receiver) continue;
    const r = role(i);
    const p = inFrame(targets[i], A);
    if ((r === 'ST' || r === 'WG' || r === 'AM') && ballA.u > 0.36) {
      // Runs in behind on a rhythm, otherwise hold the line or check toward the ball.
      const ph = frac(t / 13 + (i % 11) * 0.29 + A * 0.5);
      if (ph < 0.28 && ballA.u > 0.45) p.u = Math.min(0.965, lineA + 0.015 + 0.07 * Math.sin((ph / 0.28) * Math.PI));
      else {
        p.u = Math.min(p.u, lineA - 0.012);
        if (ph > 0.28 && ph < 0.42) p.u -= 0.05 * Math.sin(((ph - 0.28) / 0.14) * Math.PI);
      }
      if (r === 'ST') p.v = p.v * 0.6 + ballA.v * 0.25;
    }
    if (r === 'FB' && ballA.u > 0.55 && Math.sign(p.v) === Math.sign(ballA.v) && Math.abs(ballA.v) > 0.25) {
      // Overlap down the same flank.
      p.u = Math.max(p.u, Math.min(0.9, ballA.u + 0.06));
      p.v = Math.sign(p.v) * 0.88;
    }
    targets[i] = toPitch(p, A);
  }
  // Two team-mates show for the ball: one behind and across, one ahead in the lane.
  if (inp.holder >= 0 && sideOf(inp.holder) === A && inp.phase === 'play') {
    const near = outfield(A)
      .filter((i) => i !== inp.holder && i !== receiver)
      .sort((a, b) => dist(targets[a], ball) - dist(targets[b], ball))
      .slice(0, 2);
    const across = ballA.v > 0 ? -1 : 1;
    const spots: Pt[] = [
      { u: ballA.u - 0.1, v: ballA.v + across * 0.3 },
      { u: ballA.u + 0.1, v: ballA.v * 0.75 + across * 0.12 },
    ];
    near.forEach((i, k) => {
      targets[i] = mix(targets[i], toPitch(spots[k], A), 0.55);
    });
  }
  // The receiver moves to meet the pass while the passer shapes to play it.
  if (inp.holdK !== null && receiver >= 0 && inp.next) {
    const meet = { x: inp.next.x - inp.dir(sideOf(receiver)) * 0.5, y: inp.next.y };
    targets[receiver] = mix(targets[receiver], meet, Math.min(1, inp.holdK * 1.3) * 0.85);
  }

  // ---- Defending side: press, cover, track runners goal-side ----
  const g = ownGoal(D);
  const defenders = outfield(D).sort((a, b) => dist(targets[a], ball) - dist(targets[b], ball));
  const taken = new Set<number>();
  if (inp.phase === 'play' && inp.holder >= 0 && sideOf(inp.holder) === A && defenders.length) {
    const press = defenders[0];
    if (dist(targets[press], ball) < 24) {
      const u = unit(ball, g);
      targets[press] = { x: ball.x + u.x * 1.5, y: ball.y + u.y * 1.5 };
      taken.add(press);
      const cover = defenders[1];
      if (cover !== undefined) {
        targets[cover] = mix(targets[cover], { x: ball.x + u.x * 7.5, y: ball.y + u.y * 7.5 }, 0.6);
        taken.add(cover);
      }
    }
  }
  const attackers = outfield(A).map((i) => targets[i]);
  for (const i of defenders) {
    if (taken.has(i)) continue;
    let best: V2 | null = null;
    let bd = 10;
    for (const a of attackers) {
      const d = dist(a, targets[i]);
      if (d < bd) { bd = d; best = a; }
    }
    if (best) {
      const u = unit(best, g);
      targets[i] = mix(targets[i], { x: best.x + u.x * 1.8, y: best.y + u.y * 1.8 }, 0.5);
    }
  }

  // ---------------------------------------------------------------------------
  function setPiece(e: MatchEvent) {
    const S = e.s;
    const O = (1 - S) as 0 | 1;
    const spot = { x: e.x, y: e.y };
    const spotS = inFrame(spot, S);
    const taker = e.p ?? -1;
    const sgn = spotS.v >= 0 ? 1 : -1;
    const gkS = keeper(S);
    const gkO = keeper(O);
    const behind = (p: V2, side: 0 | 1, m: number) => ({ x: p.x - inp.dir(side) * m, y: p.y });
    if (taker >= 0) targets[taker] = e.k === 'throwin' ? { x: spot.x, y: spot.y + Math.sign(spot.y || 1) * 0.6 } : behind(spot, S, 0.9);

    if (e.k === 'corner' || (e.k === 'freekick' && e.o === 'cross')) {
      const box: Pt[] = [
        { u: 0.955, v: -0.1 }, { u: 0.95, v: 0.06 }, { u: 0.935, v: 0.2 },
        { u: 0.905, v: -0.02 }, { u: 0.92, v: -0.24 }, { u: 0.89, v: 0.14 },
      ].map((p) => ({ u: p.u, v: p.v * sgn }));
      const atk = outfield(S).filter((i) => i !== taker).sort((a, b) => (BOX_PRIORITY[role(b)] ?? 0) - (BOX_PRIORITY[role(a)] ?? 0));
      const inBox: number[] = [];
      atk.forEach((i, k) => {
        let p: Pt;
        if (k < box.length) { p = box[k]; inBox.push(i); }
        else if (k < box.length + 2) p = { u: 0.8, v: (k % 2 ? 0.2 : -0.2) };
        else p = { u: 0.55, v: (k % 2 ? 0.3 : -0.3) };
        targets[i] = toPitch(p, S);
      });
      if (gkS >= 0) targets[gkS] = toPitch({ u: 0.12, v: 0 }, S);
      if (gkO >= 0) targets[gkO] = toPitch({ u: 0.008, v: 0 }, O);
      const def = outfield(O);
      const nearPost = def.pop();
      if (nearPost !== undefined) targets[nearPost] = toPitch({ u: 0.012, v: -sgn * 0.11 }, O);
      def.forEach((i, k) => {
        if (k < inBox.length) {
          const a = targets[inBox[k]];
          const u = unit(a, ownGoal(O));
          targets[i] = { x: a.x + u.x * 1.1, y: a.y + u.y * 1.1 };
        } else targets[i] = toPitch({ u: k % 2 ? 0.17 : 0.07, v: ((k % 3) - 1) * 0.25 }, O);
      });
      return;
    }
    if (e.k === 'penalty') {
      const arc = [...outfield(S), ...outfield(O)].filter((i) => i !== taker);
      arc.forEach((i, k) => {
        const v = -0.5 + (k / Math.max(1, arc.length - 1)) * 1.0;
        targets[i] = toPitch({ u: 0.79 - Math.abs(v) * 0.04, v }, S);
      });
      if (taker >= 0) targets[taker] = toPitch({ u: 1 - 11 / 105 - 0.012, v: 0 }, S);
      if (gkO >= 0) targets[gkO] = toPitch({ u: 0.004, v: 0 }, O);
      if (gkS >= 0) targets[gkS] = toPitch({ u: 0.06, v: 0 }, S);
      return;
    }
    if (e.k === 'freekick' && e.o === 'direct') {
      // A four-man wall 9.15 m from the ball, on the line to goal.
      const g = ownGoal(O);
      const u = unit(spot, g);
      const perp = { x: -u.y, y: u.x };
      const wall = outfield(O).sort((a, b) => dist(targets[a], spot) - dist(targets[b], spot)).slice(0, 4);
      wall.forEach((i, k) => {
        const o = (k - 1.5) * 0.75;
        targets[i] = { x: spot.x + u.x * 9.15 + perp.x * o, y: spot.y + u.y * 9.15 + perp.y * o };
      });
      for (const i of outfield(S)) {
        if (i === taker) continue;
        const p = inFrame(targets[i], S);
        if (role(i) !== 'CB' && role(i) !== 'FB') targets[i] = toPitch({ u: Math.max(p.u, 0.84), v: p.v * 0.6 }, S);
      }
      if (gkO >= 0) targets[gkO] = { x: g.x + inp.dir(O) * 0.8, y: clamp(spot.y * 0.15, -2, 2) };
      return;
    }
    if (e.k === 'goalkick') {
      for (const i of outfield(S)) {
        const r = role(i);
        if (r === 'CB') targets[i] = toPitch({ u: 0.07, v: Math.sign(inFrame(targets[i], S).v || 1) * 0.48 }, S);
        if (r === 'FB') targets[i] = toPitch({ u: 0.22, v: Math.sign(inFrame(targets[i], S).v || 1) * 0.88 }, S);
      }
      return;
    }
    if (e.k === 'throwin') {
      const near = outfield(S).filter((i) => i !== taker).sort((a, b) => dist(targets[a], spot) - dist(targets[b], spot)).slice(0, 2);
      near.forEach((i, k) => {
        targets[i] = toPitch({ u: spotS.u + (k ? -0.07 : 0.06), v: spotS.v * 0.62 }, S);
      });
      const mark = outfield(O).sort((a, b) => dist(targets[a], spot) - dist(targets[b], spot)).slice(0, 2);
      mark.forEach((i, k) => {
        const a = targets[near[k] ?? near[0]];
        if (a) targets[i] = mix(targets[i], a, 0.75);
      });
    }
  }
}
