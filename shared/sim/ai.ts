// Off-ball football for the match engine: where every player wants to be,
// and how urgently, given the ball, the score of the move and the restart.
// The engine steers bodies toward these targets, so the shape you see in the
// 3D view is the shape the simulation played with.
//
// Everything is in absolute pitch metres (x along the pitch, y across).
import type { Position } from '../attributes.ts';
import type { Slot, Tactics } from '../formations.ts';
import { fromAbs, slotPosition, toAbs, type Pt } from '../shape.ts';

export type Side = 0 | 1;

export interface Restart {
  k: 'kickoff' | 'goalkick' | 'throwin' | 'corner' | 'freekick' | 'penalty';
  o?: string;
  x: number;
  y: number;
  s: Side;
  p: number;
}

export interface World {
  t: number;
  px: Float64Array;
  py: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  bx: number;
  by: number;
  bz: number;
  /** Player with the ball at their feet, -1 when it's travelling, loose or dead. */
  owner: number;
  /** Side in possession (or that last had it). */
  poss: Side;
  phase: 'play' | 'dead' | 'celebrate';
  /** A pass in flight: who it's for and where it will be met. */
  pass: { to: number; x: number; y: number; cross: boolean } | null;
  /** Where a lofted or loose ball will come down. */
  landing: { x: number; y: number } | null;
  restart: Restart | null;
  slots: [Slot[], Slot[]];
  tactics: [Tactics, Tactics];
  sentOff: boolean[];
  dir: [1 | -1, 1 | -1];
  /** The forward currently running in behind, per side (-1 none). */
  runner: [number, number];
  /** Players racing for a loose ball or a landing spot. */
  chase: number[];
  /** Goalscorer while the team celebrates, else -1. */
  celebrating: number;
  /** Players committed to the box for a cross. */
  boxRun: number[];
}

const hyp = (x: number, y: number) => Math.sqrt(x * x + y * y);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const BOX_PRIORITY: Partial<Record<Position, number>> = { CB: 3, ST: 3, WG: 2, AM: 2, CM: 1.5, DM: 1, FB: 0.5 };

export function plan(w: World, tx: Float64Array, ty: Float64Array, urg: Float64Array) {
  const { slots, sentOff } = w;
  const role = (i: number) => slots[i < 11 ? 0 : 1][i % 11].role;
  const sideOf = (i: number) => (i < 11 ? 0 : 1) as Side;
  const team = (s: Side) => {
    const out: number[] = [];
    for (let k = 0; k < 11; k++) if (!sentOff[s * 11 + k]) out.push(s * 11 + k);
    return out;
  };
  const outfield = (s: Side) => team(s).filter((i) => role(i) !== 'GK');
  const keeper = (s: Side) => (sentOff[s * 11] ? -1 : s * 11);
  const frame = (x: number, y: number, s: Side) => fromAbs(x, y, w.dir[s]);
  const set = (i: number, p: Pt, s: Side, u = 0) => {
    const a = toAbs({ u: clamp(p.u, 0.005, 0.995), v: clamp(p.v, -0.98, 0.98) }, w.dir[s]);
    tx[i] = a.x;
    ty[i] = a.y;
    urg[i] = u;
  };
  const setAbs = (i: number, x: number, y: number, u = 0) => {
    tx[i] = clamp(x, -54, 54);
    ty[i] = clamp(y, -35, 35);
    urg[i] = u;
  };
  const d2 = (i: number, x: number, y: number) => hyp(w.px[i] - x, w.py[i] - y);
  const ownGoal = (s: Side) => ({ x: -w.dir[s] * 52.5, y: 0 });

  // ---- Base shape: each side's block relative to the ball ----
  const kickoff = w.restart?.k === 'kickoff';
  for (const s of [0, 1] as Side[]) {
    const inPoss = w.poss === s;
    const b = frame(w.bx, w.by, s);
    const ball: Pt = { u: clamp(b.u, 0.02, 0.98), v: clamp(b.v, -1, 1) };
    const short = 11 - team(s).length;
    for (const i of team(s)) {
      const slot = slots[s][i % 11];
      let p = kickoff ? slotPosition(slot, { u: 0.5, v: 0 }, false, w.tactics[s]) : slotPosition(slot, ball, inPoss, w.tactics[s]);
      if (kickoff) p = { u: Math.min(p.u, 0.47), v: p.v };
      if (short > 0 && slot.role !== 'GK') p.v *= 1 - 0.06 * short;
      // A little personal variation so lines are never ruler-straight.
      const j = Math.sin(i * 12.9898 + w.t * 0.031) * 0.01;
      set(i, { u: p.u + j, v: p.v + Math.cos(i * 7.3 + w.t * 0.023) * 0.012 }, s);
    }
  }

  if (w.celebrating >= 0) {
    celebrate(w.celebrating);
    return;
  }
  if (w.restart) {
    setPiece(w.restart);
    return;
  }

  const A = w.poss;
  const D = (1 - A) as Side;
  const ballA = frame(w.bx, w.by, A);

  // ---- Keepers: on the angle, a few metres off the line ----
  for (const s of [0, 1] as Side[]) {
    const gk = keeper(s);
    if (gk < 0 || gk === w.owner) continue;
    const g = ownGoal(s);
    const db = hyp(w.bx - g.x, w.by - g.y);
    if (s === D || db < 40) {
      const d = clamp(1 + db * 0.075, 1, 6);
      const ux = (w.bx - g.x) / (db || 1);
      const uy = (w.by - g.y) / (db || 1);
      setAbs(gk, g.x + ux * d, g.y + uy * d * 0.8, 0.6);
    }
  }

  // ---- Defending side: one flat line that steps up together ----
  const back = outfield(D).filter((i) => role(i) === 'CB' || role(i) === 'FB');
  let lineD = 0;
  if (back.length >= 3) {
    const us = back.map((i) => frame(tx[i], ty[i], D).u);
    lineD = us.reduce((a, b) => a + b, 0) / us.length;
    // Never deeper than needed, never so high a ball over the top is free.
    const ballD = frame(w.bx, w.by, D).u;
    lineD = Math.min(lineD, Math.max(0.1, ballD - 0.04));
    for (const i of back) {
      const p = frame(tx[i], ty[i], D);
      set(i, { u: lineD * 0.88 + p.u * 0.12, v: p.v }, D, 0.3);
    }
  }
  // Offside line in the attackers' frame: the second-last defender or the ball.
  const defUs = team(D).map((i) => frame(w.px[i], w.py[i], A).u).sort((a, b) => b - a);
  const lineA = Math.max(ballA.u, 0.5, defUs[1] ?? 0.5);

  // ---- Attacking side ----
  const recv = w.pass ? w.pass.to : -1;
  const runner = w.runner[A];
  for (const i of outfield(A)) {
    if (i === w.owner || i === recv) continue;
    const r = role(i);
    const p = frame(tx[i], ty[i], A);
    if (i === runner) {
      // On the shoulder of the last man, in his channel, ready to go in behind.
      p.u = Math.min(0.95, lineA - 0.006);
      p.v = clamp(p.v * 0.8 + ballA.v * 0.15, -0.8, 0.8);
      set(i, p, A, 0.85);
      continue;
    }
    if (r === 'ST' || r === 'WG' || r === 'AM') {
      // Hold onside, and check back toward the ball now and then to offer a pass.
      p.u = Math.min(p.u, lineA - 0.02);
      const check = Math.sin(w.t * 0.37 + i * 1.7);
      if (check > 0.6) p.u -= 0.04 * (check - 0.6) / 0.4;
      if (r === 'ST') p.v = p.v * 0.6 + ballA.v * 0.25;
    }
    if (r === 'FB' && ballA.u > 0.55 && Math.sign(p.v) === Math.sign(ballA.v) && Math.abs(ballA.v) > 0.3) {
      // Overlap down the same flank.
      p.u = Math.max(p.u, Math.min(0.88, ballA.u + 0.05));
      p.v = Math.sign(p.v) * 0.9;
      set(i, p, A, 0.5);
      continue;
    }
    set(i, p, A);
  }
  // Wide in the final third: bodies attack the box for the cross.
  if (ballA.u > 0.7 && Math.abs(ballA.v) > 0.45) {
    const spots: Pt[] = [{ u: 0.955, v: -0.06 }, { u: 0.95, v: 0.14 }, { u: 0.9, v: 0.0 }, { u: 0.86, v: 0.25 }];
    const far = -Math.sign(ballA.v);
    const cands = outfield(A)
      .filter((i) => i !== w.owner && ['ST', 'AM', 'WG', 'CM'].includes(role(i)))
      .sort((a, b) => (BOX_PRIORITY[role(b)] ?? 0) - (BOX_PRIORITY[role(a)] ?? 0))
      .slice(0, 3);
    cands.forEach((i, k) => {
      const s = spots[k];
      // Hold just onside until the cross is struck.
      set(i, { u: Math.min(s.u, w.pass ? 1 : lineA - 0.005), v: s.v * far * (k === 0 ? -1 : 1) }, A, 0.6);
    });
  }
  // Two team-mates show for the ball: one behind and across, one ahead in the lane.
  if (w.owner >= 0 && sideOf(w.owner) === A) {
    const near = outfield(A)
      .filter((i) => i !== w.owner && i !== runner)
      .sort((a, b) => d2(a, w.bx, w.by) - d2(b, w.bx, w.by))
      .slice(0, 2);
    const across = ballA.v > 0 ? -1 : 1;
    const spots: Pt[] = [
      { u: ballA.u - 0.09, v: ballA.v + across * 0.28 },
      { u: Math.min(ballA.u + 0.1, lineA - 0.02), v: ballA.v * 0.75 + across * 0.12 },
    ];
    near.forEach((i, k) => {
      const cur = frame(tx[i], ty[i], A);
      set(i, { u: cur.u * 0.4 + spots[k].u * 0.6, v: cur.v * 0.4 + spots[k].v * 0.6 }, A, 0.45);
    });
  }
  // The receiver attacks the pass.
  if (w.pass && recv >= 0) setAbs(recv, w.pass.x, w.pass.y, 1);

  // ---- Defending side: press the ball, cover, track runners goal-side ----
  const g = ownGoal(D);
  const taken = new Set<number>();
  const defenders = outfield(D).sort((a, b) => d2(a, w.bx, w.by) - d2(b, w.bx, w.by));
  const pressK = w.tactics[D].pressing === 'high' ? 1.25 : w.tactics[D].pressing === 'low' ? 0.75 : 1;
  if (w.owner >= 0 && sideOf(w.owner) === A && defenders.length) {
    const press = defenders[0];
    const dist = d2(press, w.bx, w.by);
    const ballD = frame(w.bx, w.by, D).u;
    // Press when close, or anywhere up the pitch for a high-pressing side.
    if (dist < 16 * pressK || (pressK > 1 && ballD > 0.55 && dist < 26)) {
      const gx = g.x - w.bx;
      const gy = g.y - w.by;
      const gl = hyp(gx, gy) || 1;
      setAbs(press, w.bx + (gx / gl) * 1.2, w.by + (gy / gl) * 1.2, 0.9);
      taken.add(press);
      const cover = defenders[1];
      if (cover !== undefined) {
        setAbs(cover, tx[cover] * 0.4 + (w.bx + (gx / gl) * 7.5) * 0.6, ty[cover] * 0.4 + (w.by + (gy / gl) * 7.5) * 0.6, 0.6);
        taken.add(cover);
      }
    }
  }
  // The runner in behind is tracked by the nearest defender.
  if (runner >= 0 && !sentOff[runner]) {
    let best = -1;
    let bd = 25;
    for (const i of defenders) {
      if (taken.has(i)) continue;
      const d = d2(i, w.px[runner], w.py[runner]);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) {
      const gx = g.x - w.px[runner];
      const gy = g.y - w.py[runner];
      const gl = hyp(gx, gy) || 1;
      setAbs(best, w.px[runner] + (gx / gl) * 1.5, w.py[runner] + (gy / gl) * 1.5, 0.75);
      taken.add(best);
    }
  }
  for (const i of defenders) {
    if (taken.has(i)) continue;
    // Pick up the nearest attacker in the zone, goal-side.
    let best = -1;
    let bd = 9;
    for (const a of outfield(A)) {
      const d = hyp(w.px[a] - tx[i], w.py[a] - ty[i]);
      if (d < bd) { bd = d; best = a; }
    }
    if (best >= 0) {
      const gx = g.x - w.px[best];
      const gy = g.y - w.py[best];
      const gl = hyp(gx, gy) || 1;
      const mx = w.px[best] + (gx / gl) * 1.8;
      const my = w.py[best] + (gy / gl) * 1.8;
      setAbs(i, tx[i] * 0.5 + mx * 0.5, ty[i] * 0.5 + my * 0.5, 0.3);
    }
  }
  // Interceptor or second-ball racers go for the ball.
  for (const i of w.chase) {
    if (sentOff[i]) continue;
    const at = w.landing ?? { x: w.bx, y: w.by };
    setAbs(i, at.x, at.y, 1);
  }

  // ---------------------------------------------------------------------------
  function celebrate(scorer: number) {
    const s = sideOf(scorer);
    const cx = w.dir[s] * 50;
    const cy = (w.by >= 0 ? 1 : -1) * 31;
    for (const i of team(s)) {
      const k = i % 11;
      if (i === scorer) setAbs(i, cx - w.dir[s] * 1.5, cy - Math.sign(cy) * 1.5, 0.8);
      else if (k % 3 !== 0 && role(i) !== 'GK') {
        const a = k * 2.1;
        const d = 1.6 + (k % 4) * 0.9;
        setAbs(i, cx - w.dir[s] * (d + 2), cy - Math.sign(cy) * (Math.abs(Math.sin(a)) * d + 2), 0.7);
      }
    }
  }

  function setPiece(e: Restart) {
    const S = e.s;
    const O = (1 - S) as Side;
    const spotS = frame(e.x, e.y, S);
    const taker = e.p;
    const sgn = spotS.v >= 0 ? 1 : -1;
    const gkS = keeper(S);
    const gkO = keeper(O);
    const urgAll = 0.35;
    for (let i = 0; i < 22; i++) urg[i] = urgAll;
    if (e.k === 'kickoff') {
      if (taker >= 0) setAbs(taker, e.x - w.dir[S] * 0.4, e.y, 0.5);
      const mate = outfield(S).filter((i) => i !== taker).sort((a, b) => d2(a, 0, 0) - d2(b, 0, 0))[0];
      if (mate !== undefined) setAbs(mate, -w.dir[S] * 0.6, 2.2, 0.5);
      return;
    }
    if (taker >= 0) {
      if (e.k === 'throwin') setAbs(taker, e.x, e.y + Math.sign(e.y || 1) * 0.6, 0.6);
      else if (e.k === 'goalkick') setAbs(taker, e.x - w.dir[S] * 1.5, e.y, 0.6);
      else setAbs(taker, e.x - w.dir[S] * 0.9, e.y, 0.6);
    }

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
        else if (k < box.length + 2) p = { u: 0.78, v: k % 2 ? 0.2 : -0.2 };
        else p = { u: 0.55, v: k % 2 ? 0.3 : -0.3 };
        set(i, p, S, urgAll);
      });
      if (gkS >= 0) set(gkS, { u: 0.14, v: 0 }, S, urgAll);
      if (gkO >= 0) set(gkO, { u: 0.008, v: 0 }, O, urgAll);
      const def = outfield(O);
      const nearPost = def.pop();
      if (nearPost !== undefined) set(nearPost, { u: 0.012, v: -sgn * 0.11 }, O, urgAll);
      def.forEach((i, k) => {
        if (k < inBox.length) {
          const a = inBox[k];
          const ax = tx[a];
          const ay = ty[a];
          const g = ownGoal(O);
          const gl = hyp(g.x - ax, g.y - ay) || 1;
          setAbs(i, ax + ((g.x - ax) / gl) * 1.1, ay + ((g.y - ay) / gl) * 1.1, urgAll);
        } else set(i, { u: k % 2 ? 0.17 : 0.07, v: ((k % 3) - 1) * 0.25 }, O, urgAll);
      });
      return;
    }
    if (e.k === 'penalty') {
      const edge: Pt[] = [
        { u: 0.818, v: -0.34 }, { u: 0.818, v: 0.35 }, { u: 0.8, v: -0.5 }, { u: 0.8, v: 0.52 },
        { u: 0.772, v: -0.13 }, { u: 0.776, v: 0.15 }, { u: 0.79, v: -0.68 }, { u: 0.79, v: 0.7 },
      ];
      const atk = outfield(S).filter((i) => i !== taker).sort((a, b) => (BOX_PRIORITY[role(b)] ?? 0) - (BOX_PRIORITY[role(a)] ?? 0));
      const up = atk.slice(0, 6);
      up.forEach((i, k) => set(i, edge[k], S, urgAll));
      atk.slice(6).forEach((i, k) => set(i, { u: 0.52 + (k % 2) * 0.05, v: (k % 2 ? 0.28 : -0.28) * (1 + k * 0.2) }, S, urgAll));
      const def = outfield(O).sort((a, b) => (BOX_PRIORITY[role(a)] ?? 0) - (BOX_PRIORITY[role(b)] ?? 0));
      const outlet = def.pop();
      if (outlet !== undefined) set(outlet, { u: 0.44, v: 0.08 }, S, urgAll);
      def.forEach((i, k) => {
        if (k < up.length) {
          const a = frame(tx[up[k]], ty[up[k]], S);
          set(i, { u: a.u + 0.012, v: a.v - Math.sign(a.v || 1) * 0.035 }, S, urgAll);
        } else set(i, edge[Math.min(edge.length - 1, 6 + (k - up.length))], S, urgAll);
      });
      if (taker >= 0) set(taker, { u: 1 - 11 / 105 - 0.03, v: 0 }, S, 0.4);
      if (gkO >= 0) set(gkO, { u: 0.004, v: 0 }, O, urgAll);
      if (gkS >= 0) set(gkS, { u: 0.07, v: 0 }, S, urgAll);
      return;
    }
    if (e.k === 'freekick' && e.o === 'direct') {
      // A four-man wall 9.15 m from the ball, on the line to goal.
      const g = ownGoal(O);
      const gl = hyp(g.x - e.x, g.y - e.y) || 1;
      const ux = (g.x - e.x) / gl;
      const uy = (g.y - e.y) / gl;
      const wall = outfield(O).sort((a, b) => d2(a, e.x, e.y) - d2(b, e.x, e.y)).slice(0, 4);
      wall.forEach((i, k) => {
        const o = (k - 1.5) * 0.75;
        setAbs(i, e.x + ux * 9.15 - uy * o, e.y + uy * 9.15 + ux * o, urgAll);
      });
      const runners: number[] = [];
      for (const i of outfield(S)) {
        if (i === taker) continue;
        const p = frame(tx[i], ty[i], S);
        if (role(i) !== 'CB' && role(i) !== 'FB') {
          set(i, { u: Math.max(p.u, 0.86), v: p.v * 0.5 }, S, urgAll);
          runners.push(i);
        }
      }
      const inWall = new Set(wall);
      outfield(O).filter((i) => !inWall.has(i)).forEach((i, k) => {
        const r = runners[k];
        if (r !== undefined) {
          const rl = hyp(g.x - tx[r], g.y - ty[r]) || 1;
          setAbs(i, tx[r] + ((g.x - tx[r]) / rl) * 1.2, ty[r] + ((g.y - ty[r]) / rl) * 1.2, urgAll);
        } else set(i, { u: 0.1 + (k % 2) * 0.05, v: ((k % 3) - 1) * 0.22 }, O, urgAll);
      });
      if (gkO >= 0) setAbs(gkO, g.x + w.dir[O] * 0.8, clamp(e.y * 0.15, -2, 2), urgAll);
      return;
    }
    if (e.k === 'goalkick') {
      for (const i of outfield(S)) {
        const r = role(i);
        const v = Math.sign(frame(tx[i], ty[i], S).v || 1);
        if (r === 'CB') set(i, { u: 0.08, v: v * 0.45 }, S, urgAll);
        if (r === 'FB') set(i, { u: 0.24, v: v * 0.86 }, S, urgAll);
      }
      // The opposition drops off to the halfway line.
      for (const i of outfield(O)) {
        const p = frame(tx[i], ty[i], O);
        set(i, { u: Math.min(p.u, 0.62), v: p.v }, O, urgAll);
      }
      return;
    }
    if (e.k === 'throwin') {
      const near = outfield(S).filter((i) => i !== taker).sort((a, b) => d2(a, e.x, e.y) - d2(b, e.x, e.y)).slice(0, 2);
      near.forEach((i, k) => set(i, { u: spotS.u + (k ? -0.07 : 0.06), v: spotS.v * 0.62 }, S, urgAll));
      const mark = outfield(O).sort((a, b) => d2(a, e.x, e.y) - d2(b, e.x, e.y)).slice(0, 2);
      mark.forEach((i, k) => {
        const a = near[k] ?? near[0];
        if (a !== undefined) setAbs(i, tx[i] * 0.25 + tx[a] * 0.75, ty[i] * 0.25 + ty[a] * 0.75, urgAll);
      });
    }
  }
}
