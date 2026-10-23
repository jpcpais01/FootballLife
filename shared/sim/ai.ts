// Off-ball football for the match engine: where every player wants to be,
// and how urgently, given the ball, the phase of play and the restart.
// The engine steers bodies toward these targets, so the shape you see in the
// 3D view is the shape the simulation played with.
//
// Out of possession a team defends as a block of lines that slides with the
// ball, presses on triggers and marks in its own third. In possession it
// spreads into lanes, keeps a rest defence behind the ball, and the players
// near the ball keep moving into pockets of space where a pass can find them.
//
// On top of the shapes sit a few habits that make it look like football
// rather than a formation diagram: possession is trusted gradually, so shapes
// blend instead of flipping on every turnover; players commit to a job (the
// press, a man to mark, the height of the line) and keep it until something
// clearly better comes along; and nobody jogs for the sake of it. Off the
// ball a player stands when he is in position, walks small adjustments and
// saves his running for the moments that need it.
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
  /** When the side in possession won the ball. */
  possSince: number;
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
  /** The last pass played: who hit it and when (for give-and-go runs). */
  lastPass: { from: number; t: number } | null;
  /** Remembered support spots (x, y per player; NaN when none), so runs don't flicker. */
  mem: Float64Array;
}

const hyp = (x: number, y: number) => Math.sqrt(x * x + y * y);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const BOX_PRIORITY: Partial<Record<Position, number>> = { CB: 3, ST: 3, WG: 2, AM: 2, CM: 1.5, DM: 1, FB: 0.5 };
const L = 105;
/** Urgency for a brisk walk (any urgency above zero paces the move rather than settling into it). */
const WALK = 0.002;

/**
 * What each side remembers between thinks: where it last told everyone to go,
 * who is settled in position, who is pressing and who is marking whom.
 * Memory is what turns a formula into a footballer: players commit to a job,
 * drift rather than snap, and stand still when they are where they need to be.
 */
interface Mind {
  tx: Float64Array;
  ty: Float64Array;
  settled: Uint8Array;
  presser: [number, number];
  mark: Int16Array;
  /** The back line's height per side (own frame), moved in steps like a real line. */
  line: [number, number];
  /** A movement a player has committed to: kind (0 none), until when, and where. */
  move: Float64Array;
  /** When each player may make another such movement. */
  cool: Float64Array;
  t: number;
}
const minds = new WeakMap<Float64Array, Mind>();
function mindOf(w: World): Mind {
  let m = minds.get(w.mem);
  if (!m) {
    m = { tx: new Float64Array(22).fill(NaN), ty: new Float64Array(22).fill(NaN), settled: new Uint8Array(22), presser: [-1, -1], mark: new Int16Array(22).fill(-1), line: [NaN, NaN], move: new Float64Array(22 * 5), cool: new Float64Array(22), t: -1 };
    minds.set(w.mem, m);
  }
  return m;
}
/** A fixed personal trait in [0, 1) per player, so no two react quite alike. */
const trait = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * An attacking corner is a rehearsed move. While the ball is dead the
 * attackers stand in a pack, one of them in front of the keeper; as the
 * delivery is struck they burst out to the zones the routine gives them, so
 * runs cross, markers get dragged and the space appears where the ball lands.
 */
interface Routine { key: Restart; side: Side; from: number; job: Float64Array }
const routines = new WeakMap<Float64Array, Routine>();
/** How long after the delivery the runs are attacked flat out. */
const DELIVERY = 2.2;

export function plan(w: World, tx: Float64Array, ty: Float64Array, urg: Float64Array) {
  const { slots, sentOff } = w;
  const mind = mindOf(w);
  // A long gap (half-time, a restart) wipes the short-term memory.
  if (w.t - mind.t > 1 || w.restart || w.celebrating >= 0 || w.phase !== 'play') {
    mind.tx.fill(NaN);
    mind.settled.fill(0);
    mind.presser = [-1, -1];
    mind.mark.fill(-1);
    mind.line = [NaN, NaN];
    mind.move.fill(0);
    mind.cool.fill(0);
  }
  mind.t = w.t;
  let routine = routines.get(w.mem);
  if (routine && w.restart && w.restart !== routine.key) routine = undefined;
  if (routine && !w.restart && Number.isNaN(routine.from)) routine.from = w.t;
  if (routine && !w.restart && w.t - routine.from > DELIVERY) routine = undefined;
  if (!routine) routines.delete(w.mem);
  /** Players doing a job right now (pressing, tracking, receiving, chasing): they skip the pacing pass. */
  const busy = new Uint8Array(22);
  const role = (i: number) => slots[i < 11 ? 0 : 1][i % 11].role;
  const sideOf = (i: number) => (i < 11 ? 0 : 1) as Side;
  const teams: number[][] = [[], []];
  const outs: number[][] = [[], []];
  for (let i = 0; i < 22; i++) {
    if (sentOff[i]) continue;
    teams[sideOf(i)].push(i);
    if (role(i) !== 'GK') outs[sideOf(i)].push(i);
  }
  // Copies, since callers sort and pop them.
  const team = (s: Side) => teams[s].slice();
  const outfield = (s: Side) => outs[s].slice();
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
  const nearestOpp = (s: Side, x: number, y: number) => {
    let bd = 99;
    for (const j of teams[1 - s]) {
      const d = d2(j, x, y);
      if (d < bd) bd = d;
    }
    return bd;
  };
  /** Closest an opponent stands to the line from (x0,y0) to (x1,y1), ignoring the ends. */
  const laneGap = (s: Side, x0: number, y0: number, x1: number, y1: number) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L2 = dx * dx + dy * dy || 1;
    let best = 99;
    for (const j of teams[1 - s]) {
      const k = ((w.px[j] - x0) * dx + (w.py[j] - y0) * dy) / L2;
      if (k < 0.1 || k > 0.92) continue;
      const d = hyp(w.px[j] - (x0 + dx * k), w.py[j] - (y0 + dy * k));
      if (d < best) best = d;
    }
    return best;
  };

  const kickoff = w.restart?.k === 'kickoff';
  const A = w.poss;
  const D = (1 - A) as Side;
  const ballA = frame(w.bx, w.by, A);
  const ballD = frame(w.bx, w.by, D);
  // Offside line in the attackers' frame: the second-last defender, the ball, or halfway.
  const defUs = team(D).map((i) => frame(w.px[i], w.py[i], A).u).sort((a, b) => b - a);
  const lineA = Math.max(ballA.u, 0.5, defUs[1] ?? 0.5);
  /** The offside line a side would be attacking (second-last opponent, ball or halfway). */
  const lineFor = (s: Side) => {
    const o = team((1 - s) as Side).map((i) => frame(w.px[i], w.py[i], s).u).sort((a, b) => b - a);
    return Math.max(frame(w.bx, w.by, s).u, 0.5, o[1] ?? 0.5);
  };
  const carrier = w.owner >= 0 && sideOf(w.owner) === A ? w.owner : -1;
  const carrierPress = carrier >= 0 ? nearestOpp(A, w.bx, w.by) : 99;
  // A carrier with time and his head up: the moment for runs in behind (and for the line to drop).
  const carrierFree = carrier >= 0 && carrierPress > 5;
  const sinceWon = w.t - w.possSince;

  // ---- Base shape: each side's block relative to the ball ----
  if (kickoff || w.restart) {
    for (const s of [0, 1] as Side[]) {
      const inPoss = w.poss === s;
      const b = frame(w.bx, w.by, s);
      const ball: Pt = { u: clamp(b.u, 0.02, 0.98), v: clamp(b.v, -1, 1) };
      for (const i of teams[s]) {
        const slot = slots[s][i % 11];
        let p = kickoff ? slotPosition(slot, { u: 0.5, v: 0 }, false, w.tactics[s]) : slotPosition(slot, ball, inPoss, w.tactics[s]);
        if (kickoff) p = { u: Math.min(p.u, 0.47), v: p.v };
        set(i, p, s);
      }
    }
  } else {
    // Possession is not a switch. A team that has just won the ball needs a
    // couple of seconds to trust it before the full-backs fly and the shape
    // stretches, and the side that lost it peels back from its attacking
    // shape as it realises. Both shapes are worked out and blended by how
    // settled the possession is, so a scrappy spell of back-and-forth no
    // longer whips twenty players from one shape to the other.
    // How long each job takes to switch. Forwards spring the moment the ball
    // is won and defenders snap back the moment it is lost; the full-backs and
    // holding players wait to see it kept before they commit.
    const SWITCH_A: Partial<Record<Position, number>> = { ST: 0.5, WG: 0.7, AM: 0.8, CM: 1.5, FB: 2.2, DM: 2.4, CB: 2.6 };
    const SWITCH_D: Partial<Record<Position, number>> = { CB: 0.8, FB: 1.0, DM: 0.9, CM: 1.4, AM: 2.0, WG: 2.2, ST: 2.6 };
    const blendOf = (i: number) => {
      const T = (sideOf(i) === A ? SWITCH_A : SWITCH_D)[role(i)] ?? 1.5;
      const c0 = clamp(sinceWon / T, 0, 1);
      return c0 * c0 * (3 - 2 * c0);
    };
    const mixing = sinceWon < 2.6;
    if (mixing) {
      defendShape(A);
      attackShape(D, lineFor(D));
    }
    const ox = Float64Array.from(tx);
    const oy = Float64Array.from(ty);
    defendShape(D);
    attackShape(A, lineA);
    if (mixing) {
      for (const i of [...outs[0], ...outs[1]]) {
        const c = blendOf(i);
        tx[i] = ox[i] + (tx[i] - ox[i]) * c;
        ty[i] = oy[i] + (ty[i] - oy[i]) * c;
      }
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

  keepers();
  defend();
  attack();
  deliveryRuns();

  // Interceptor or second-ball racers go for the ball.
  for (const i of w.chase) {
    if (sentOff[i]) continue;
    const at = w.landing ?? { x: w.bx, y: w.by };
    setAbs(i, at.x, at.y, 1);
    busy[i] = 1;
  }
  if (w.owner >= 0) busy[w.owner] = 1;
  pace();
  (globalThis as { __aiTap?: (w: World, tx: Float64Array, ty: Float64Array, urg: Float64Array) => void }).__aiTap?.(w, tx, ty, urg);

  // ---------------------------------------------------------------------------
  /** Out of possession: three lines that slide with the ball and squeeze the space between them. */
  function defendShape(s: Side) {
    const tac = w.tactics[s];
    const b = frame(w.bx, w.by, s);
    const press = tac.pressing === 'high' ? 0.06 : tac.pressing === 'low' ? -0.06 : 0;
    const ment = tac.mentality === 'attacking' ? 0.015 : tac.mentality === 'defensive' ? -0.02 : 0;
    const widthK = tac.width === 'wide' ? 1.08 : tac.width === 'narrow' ? 0.9 : 1;
    const back = clamp(b.u - 0.21 + press + ment, 0.075, 0.42 + press);
    const mid = back + clamp(0.1 + (b.u - 0.3) * 0.06, 0.09, 0.125);
    const front = Math.max(mid + 0.06, Math.min(mid + 0.13, b.u + 0.02));
    const shift = clamp(b.v, -1, 1) * 0.42;
    const short = 11 - team(s).length;
    const flatMid = slots[s].some((sl) => sl.role === 'WG' && sl.x < 0.62);
    for (const i of teams[s]) {
      const slot = slots[s][i % 11];
      const r = slot.role;
      let u: number;
      let v: number;
      if (r === 'GK') continue;
      if (r === 'CB' || r === 'FB') {
        u = back;
        v = slot.y * 0.8 * widthK + shift;
        // The far full-back tucks in to make the back line narrow.
        if (r === 'FB' && Math.sign(slot.y) !== Math.sign(b.v) && Math.abs(b.v) > 0.2) v = slot.y * 0.62 + shift;
      } else if (r === 'DM') {
        u = back + 0.055;
        v = slot.y * 0.6 + shift * 0.9;
      } else if (r === 'CM') {
        u = mid;
        v = slot.y * 0.95 * widthK + shift * 1.05;
      } else if (r === 'AM') {
        u = mid + 0.04;
        v = slot.y * 0.6 + shift;
      } else if (r === 'WG') {
        u = flatMid ? mid : mid + 0.05;
        v = slot.y * 0.88 * widthK + shift * 1.05;
      } else {
        u = front;
        v = slot.y * 0.7 + b.v * 0.3;
      }
      if (short > 0) v *= 1 - 0.05 * short;
      // A little personal variation so lines are never ruler-straight.
      u += Math.sin(i * 12.9898 + w.t * 0.031) * 0.006;
      set(i, { u, v: clamp(v, -0.92, 0.92) }, s);
    }
  }

  /** In possession: width in every lane, a rest defence behind the ball, forwards on the last line. */
  function attackShape(s: Side, last: number) {
    const tac = w.tactics[s];
    const b = frame(w.bx, w.by, s);
    const ment = tac.mentality === 'attacking' ? 0.03 : tac.mentality === 'defensive' ? -0.03 : 0;
    const widthK = tac.width === 'wide' ? 1.06 : tac.width === 'narrow' ? 0.88 : 1;
    const buildUp = b.u < 0.33;
    const back = clamp(b.u - 0.26 + ment, 0.1, 0.56);
    const ballSide = Math.sign(b.v) || 1;
    for (const i of teams[s]) {
      const slot = slots[s][i % 11];
      const r = slot.role;
      if (r === 'GK') continue;
      let u: number;
      let v: number;
      const sameFlank = Math.sign(slot.y) === ballSide;
      if (r === 'CB') {
        u = back;
        v = slot.y * (buildUp ? 1.65 : 1.2);
      } else if (r === 'FB') {
        const wingBack = slot.x > 0.35;
        if (buildUp) u = clamp(b.u + 0.06, 0.24, 0.42);
        else if (sameFlank || wingBack) u = clamp(b.u + (wingBack ? 0.04 : -0.02), back + 0.08, 0.8);
        // The far full-back holds back and tucks in: part of the rest defence.
        else u = clamp(b.u - 0.14, back + 0.04, 0.6);
        v = Math.sign(slot.y) * (sameFlank || wingBack || buildUp ? 0.9 : 0.62) * widthK;
      } else if (r === 'DM') {
        u = clamp(b.u - 0.12, back + 0.06, 0.64);
        v = slot.y * 0.8 + b.v * 0.25;
      } else if (r === 'CM') {
        u = clamp(b.u + (slot.x - 0.46) * 0.5 + 0.01 + ment, back + 0.1, last - 0.07);
        v = Math.sign(slot.y || 1) * Math.max(0.3, Math.abs(slot.y) * 1.1) + b.v * 0.12;
      } else if (r === 'AM') {
        u = clamp(Math.max(b.u + 0.1, last - 0.11), back + 0.15, last - 0.05);
        v = b.v * 0.3;
      } else if (r === 'WG') {
        u = clamp(last - 0.035, b.u - 0.12, 0.92);
        v = Math.sign(slot.y) * 0.86 * widthK;
        // The far winger comes narrower to attack the back post.
        if (!sameFlank && b.u > 0.62) v = Math.sign(slot.y) * 0.55;
      } else {
        u = last - 0.014;
        v = clamp(slot.y * 1.2 + b.v * 0.22, -0.4, 0.4);
      }
      u += Math.sin(i * 12.9898 + w.t * 0.029) * 0.008;
      set(i, { u, v: clamp(v, -0.93, 0.93) }, s);
    }
  }

  /** Keepers: on the angle, higher behind a high line, and out to narrow the angle one-on-one. */
  function keepers() {
    for (const s of [0, 1] as Side[]) {
      const gk = keeper(s);
      if (gk < 0 || gk === w.owner || w.chase.includes(gk) || (w.pass && w.pass.to === gk)) continue;
      const g = ownGoal(s);
      const db = hyp(w.bx - g.x, w.by - g.y);
      const ux = (w.bx - g.x) / (db || 1);
      const uy = (w.by - g.y) / (db || 1);
      if (s === A) {
        // In possession: an outlet just outside the box, or the sweeper behind a high line.
        const b = frame(w.bx, w.by, s);
        set(gk, { u: clamp(0.06 + (b.u - 0.3) * 0.12, 0.04, 0.13), v: clamp(b.v * 0.15, -0.12, 0.12) }, s, 0.3);
        continue;
      }
      // Off his line by how far away the ball is; behind a high line he sweeps.
      const backU = Math.min(...outfield(s).map((i) => frame(tx[i], ty[i], s).u));
      const sweep = Math.max(0, backU * L - 16);
      let d = clamp(1 + db * 0.07, 1, 6);
      if (db > 35) d = Math.max(d, Math.min(sweep, 18));
      // One-on-one: a runner through on goal with nobody left to stop him.
      const c = w.owner >= 0 && sideOf(w.owner) !== s ? w.owner : -1;
      if (c >= 0 && db < 22 && Math.abs(w.by) < 18) {
        let cover = 0;
        for (const j of outs[s]) if (d2(j, g.x, g.y) < db - 1 && hyp(w.px[j] - w.bx, w.py[j] - w.by) < db) cover++;
        if (cover === 0) {
          d = clamp(db - 3.5, 2, 11);
          setAbs(gk, g.x + ux * d, g.y + uy * d, 1);
          continue;
        }
      }
      setAbs(gk, g.x + ux * d, g.y + uy * d * 0.8, db < 30 ? 0.7 : 0.4);
    }
  }

  /** The defending side: a line that holds together, a press on the ball, cover, and marking near goal. */
  function defend() {
    const g = ownGoal(D);
    const tac = w.tactics[D];
    const pressK = tac.pressing === 'high' ? 1.25 : tac.pressing === 'low' ? 0.75 : 1;
    // Outnumbered on the break: nobody dives in. The line backs off and the
    // man on the ball is shown away and slowed down until help gets back.
    const ahead = outs[A].filter((i) => frame(w.px[i], w.py[i], A).u > ballA.u - 0.02).length;
    const goalSide = outs[D].filter((i) => frame(w.px[i], w.py[i], D).u < ballD.u).length;
    const delay = carrier >= 0 && ballD.u < 0.62 && ahead + 1 >= goalSide;
    // Back line moves as one: flat, and drops off when the man on the ball can play over it.
    const back = outfield(D).filter((i) => role(i) === 'CB' || role(i) === 'FB');
    if (back.length >= 3) {
      const us = back.map((i) => frame(tx[i], ty[i], D).u);
      let line = us.reduce((a, b) => a + b, 0) / us.length;
      if (carrierFree && ballD.u > line + 0.12) line -= 0.03;
      // A ball played backwards: step up together.
      if (w.pass && frame(w.pass.x, w.pass.y, D).u > ballD.u + 0.05) line += 0.03;
      line = Math.min(line, Math.max(0.06, ballD.u - 0.04));
      // The line moves on a call, a few metres at a time, not with every touch of the ball.
      // Dropping is quicker to trigger than stepping up, as every defender knows.
      const held = mind.line[D];
      if (!Number.isNaN(held) && line < held + 0.022 && line > held - 0.016 && held <= Math.max(0.06, ballD.u - 0.02)) line = held;
      mind.line[D] = line;
      if (delay) line = Math.max(0.05, line - 0.04);
      for (const i of back) {
        const p = frame(tx[i], ty[i], D);
        set(i, { u: line * 0.9 + p.u * 0.1, v: p.v }, D, 0.18 + 0.3 * clamp((0.5 - ballD.u) / 0.3, 0, 1));
      }
    }

    const taken = new Set<number>();
    const dBall = new Float64Array(22);
    for (let i = 0; i < 22; i++) dBall[i] = d2(i, w.bx, w.by);
    const defenders = outfield(D).sort((a, b) => dBall[a] - dBall[b]);
    // Aim where the ball is going to be, not where it was.
    const target = carrier >= 0 ? { x: w.bx + w.vx[carrier] * 0.6, y: w.by + w.vy[carrier] * 0.6 } : w.pass ? { x: w.pass.x, y: w.pass.y } : null;
    if (target && defenders.length) {
      // The nearest man goes, and once he has gone he sees it through unless a team-mate is clearly better placed.
      const byTarget = defenders.slice().sort((a, b) => d2(a, target.x, target.y) - d2(b, target.x, target.y));
      let press = byTarget[0];
      const prev = mind.presser[D];
      if (prev >= 0 && prev !== press && !sentOff[prev] && defenders.includes(prev) && d2(prev, target.x, target.y) < d2(press, target.x, target.y) + 3) press = prev;
      mind.presser[D] = press;
      defenders.splice(defenders.indexOf(press), 1);
      defenders.unshift(press);
      const dist = d2(press, target.x, target.y);
      // Triggers: a heavy touch, a pass still on its way, the ball near the touchline, or just lost it.
      const trigger = carrier < 0 || Math.abs(w.by) > 26 || w.t - w.possSince < 3 || ballD.u < 0.25;
      const counterPress = w.t - w.possSince < 3 && ballD.u > 0.4;
      if (dist < 15 * pressK || (pressK > 1 && ballD.u > 0.5 && dist < 26) || counterPress || (trigger && dist < 22)) {
        // Approach goal-side, bending the run to shut off the easiest pass.
        const gx = g.x - target.x;
        const gy = g.y - target.y;
        const gl = hyp(gx, gy) || 1;
        let ax = target.x + (gx / gl) * 1.2;
        let ay = target.y + (gy / gl) * 1.2;
        let mate: number | undefined;
        let md = Infinity;
        for (const i of outs[A]) {
          if (i === carrier) continue;
          const d = d2(i, target.x, target.y);
          if (d < md) {
            md = d;
            mate = i;
          }
        }
        if (mate !== undefined && dist > 4) {
          const mx = w.px[mate] - target.x;
          const my = w.py[mate] - target.y;
          const ml = hyp(mx, my) || 1;
          ax += (mx / ml) * 0.9;
          ay += (my / ml) * 0.9;
        }
        // Close down fast, then slow and jockey: the last few metres are a stalk, not a charge.
        if (delay && carrier >= 0 && dist < 9 && ballD.u > 0.2) {
          // Stand him up three metres off, goal-side, and backpedal with him.
          ax = target.x + (gx / gl) * 3;
          ay = target.y + (gy / gl) * 3;
          setAbs(press, ax, ay, 0.6);
        } else if (carrier >= 0 && dist < 4.5) {
          ax = target.x + (gx / gl) * 1.7;
          ay = target.y + (gy / gl) * 1.7;
          setAbs(press, ax, ay, trigger ? 0.7 : 0.55);
        } else setAbs(press, ax, ay, trigger ? 0.95 : 0.8);
        taken.add(press);
        busy[press] = 1;
        const cover = defenders[1];
        if (cover !== undefined) {
          if ((counterPress || ballD.u < 0.2) && d2(cover, target.x, target.y) < 12) {
            // Counter-press, or the ball in our box: the second man goes too.
            setAbs(cover, target.x + (gx / gl) * 2.5, target.y + (gy / gl) * 2.5, 0.9);
          } else if (mate !== undefined && d2(mate, w.bx, w.by) < 18 && pressK >= 1) {
            // Stand in the lane to the nearest team-mate.
            setAbs(cover, w.bx + (w.px[mate] - w.bx) * 0.6, w.by + (w.py[mate] - w.by) * 0.6, 0.7);
          } else {
            // Cover behind the presser.
            setAbs(cover, tx[cover] * 0.4 + (target.x + (gx / gl) * 7.5) * 0.6, ty[cover] * 0.4 + (target.y + (gy / gl) * 7.5) * 0.6, 0.6);
          }
          taken.add(cover);
          busy[cover] = 1;
        }
      }
    } else mind.presser[D] = -1;
    // The runner in behind is tracked by the nearest free defender.
    const runner = w.runner[A];
    if (runner >= 0 && !sentOff[runner]) {
      let best = -1;
      let bd = 25;
      for (const i of defenders) {
        if (taken.has(i)) continue;
        const d = d2(i, w.px[runner], w.py[runner]);
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
      if (best >= 0) {
        const gx = g.x - w.px[runner];
        const gy = g.y - w.py[runner];
        const gl = hyp(gx, gy) || 1;
        setAbs(best, w.px[runner] + (gx / gl) * 1.5 + w.vx[runner] * 0.4, w.py[runner] + (gy / gl) * 1.5 + w.vy[runner] * 0.4, 0.85);
        taken.add(best);
        busy[best] = 1;
      }
    }
    // Zonal marking: each man picks up the attacker in his zone, goal-side; tighter near goal.
    const deep = ballD.u < 0.36;
    const claimed = new Set<number>();
    for (const i of defenders) {
      if (taken.has(i)) continue;
      let best = -1;
      const reach = deep ? 11 : 8;
      let bd = reach;
      for (const a of outs[A]) {
        if (claimed.has(a) || a === carrier) continue;
        const d = hyp(w.px[a] - tx[i], w.py[a] - ty[i]);
        if (d < bd) {
          bd = d;
          best = a;
        }
      }
      // Stay with your man while he is still around your zone, rather than swapping every time someone drifts past.
      const had = mind.mark[i];
      if (had >= 0 && had !== best && !claimed.has(had) && had !== carrier && !sentOff[had] && hyp(w.px[had] - tx[i], w.py[had] - ty[i]) < reach * 1.35) best = had;
      mind.mark[i] = best;
      if (best < 0) continue;
      claimed.add(best);
      const ax = w.px[best] + w.vx[best] * 0.3;
      const ay = w.py[best] + w.vy[best] * 0.3;
      const gx = g.x - ax;
      const gy = g.y - ay;
      const gl = hyp(gx, gy) || 1;
      const inBox = frame(ax, ay, D).u < 0.18 && Math.abs(frame(ax, ay, D).v) < 0.62;
      const gap = inBox ? 1 : 1.8;
      const mx = ax + (gx / gl) * gap;
      const my = ay + (gy / gl) * gap;
      const k = inBox ? 0.85 : deep ? 0.6 : 0.4;
      setAbs(i, tx[i] * (1 - k) + mx * k, ty[i] * (1 - k) + my * k, inBox ? 0.7 : deep ? 0.4 : 0.22);
    }
    // Screening: a midfielder or forward with nobody to mark doesn't just hold
    // his spot. He edges into the passing lane from the ball to the most
    // dangerous man in his area, so the pass forward is shadowed.
    if (carrier >= 0) {
      for (const i of defenders) {
        if (taken.has(i) || mind.mark[i] >= 0 || busy[i]) continue;
        const r = role(i);
        if (r === 'CB' || r === 'FB') continue;
        let best = -1;
        let bs = 0;
        for (const a of outs[A]) {
          if (a === carrier || claimed.has(a)) continue;
          const da = hyp(w.px[a] - tx[i], w.py[a] - ty[i]);
          // Further forward (towards our goal) is more dangerous.
          const fwd = ballD.u - frame(w.px[a], w.py[a], D).u;
          if (da > 15 || fwd < -0.04) continue;
          const sc = fwd * 10 + (15 - da) * 0.2;
          if (sc > bs) { bs = sc; best = a; }
        }
        if (best < 0) continue;
        const lx = w.bx + (w.px[best] - w.bx) * 0.55;
        const ly = w.by + (w.py[best] - w.by) * 0.55;
        setAbs(i, tx[i] * 0.5 + lx * 0.5, ty[i] * 0.5 + ly * 0.5, 0.28);
      }
    }
    // Caught upfield of the ball: get back goal-side. Defenders and midfielders near the play sprint;
    // forwards and anyone far from it jog back and pick up the shape.
    const danger = clamp((0.55 - ballD.u) / 0.35, 0, 1);
    for (const i of outs[D]) {
      if (taken.has(i) || w.chase.includes(i)) continue;
      const u = frame(w.px[i], w.py[i], D).u;
      // Only when his job is behind the ball and he isn't: a forward leading the press is where he should be.
      const tu = frame(tx[i], ty[i], D).u;
      if (!(u > ballD.u + 0.03 && tu < ballD.u && tu < u - 0.05)) continue;
      const r = role(i);
      const forward = r === 'ST' || r === 'WG' || (r === 'AM' && danger < 0.5);
      const far = clamp((dBall[i] - 25) / 30, 0, 1);
      const need = forward ? 0.4 + danger * 0.25 : 0.65 + danger * 0.3 + (sinceWon < 6 ? 0.1 : 0);
      urg[i] = Math.max(urg[i], need * (1 - far * 0.35));
      busy[i] = 1;
    }
  }

  /** The side on the ball: runs in behind, support angles into space, overlaps, box runs, counters. */
  function attack() {
    const recv = w.pass ? w.pass.to : -1;
    const runner = w.runner[A];
    const counter = sinceWon < 7 && ballA.u > 0.25 && ballA.u < 0.8 && defUs.filter((u) => u > ballA.u).length < 6;
    for (const i of outs[A]) {
      if (i === carrier || i === recv) continue;
      const r = role(i);
      const p = frame(tx[i], ty[i], A);
      if (i === runner) {
        // On the shoulder of the last man, then off when the ball can be played.
        p.u = carrierFree ? Math.min(0.94, lineA + 0.07) : lineA - 0.006;
        p.v = clamp(frame(w.px[i], w.py[i], A).v * 0.85 + ballA.v * 0.1, -0.8, 0.8);
        set(i, p, A, carrierFree ? 1 : 0.7);
        busy[i] = 1;
        continue;
      }
      if (counter && (r === 'ST' || r === 'WG' || r === 'AM')) {
        // Breaking at speed into the space the other team left.
        set(i, { u: Math.min(lineA - 0.01, Math.max(p.u, ballA.u + 0.12)), v: p.v }, A, 0.9);
        busy[i] = 1;
        continue;
      }
      if (r === 'FB' && ballA.u > 0.58 && Math.sign(p.v) === Math.sign(ballA.v) && Math.abs(ballA.v) > 0.45 && carrier >= 0 && role(carrier) === 'WG') {
        // Overlap round the outside of the winger on the ball.
        set(i, { u: Math.min(0.9, ballA.u + 0.07), v: Math.sign(p.v) * 0.92 }, A, 0.75);
        busy[i] = 1;
        continue;
      }
      if (r === 'WG' && ballA.u > 0.45) {
        // Rotation: with his full-back bombing on outside him, the winger comes inside into the half-space.
        const fb = outs[A].find((j) => role(j) === 'FB' && Math.sign(frame(w.px[j], w.py[j], A).v) === Math.sign(p.v) && Math.abs(frame(w.px[j], w.py[j], A).v) > Math.abs(frame(w.px[i], w.py[i], A).v) + 0.1 && frame(w.px[j], w.py[j], A).u > ballA.u - 0.03);
        if (fb !== undefined) set(i, { u: p.u, v: Math.sign(p.v) * 0.48 }, A, 0.3);
      }
    }
    // Give and go: the passer carries on into the space ahead.
    const lp = w.lastPass;
    if (lp && w.t - lp.t < 2.6 && sideOf(lp.from) === A && lp.from !== carrier && lp.from !== recv && !sentOff[lp.from]) {
      const r = role(lp.from);
      const p = frame(w.px[lp.from], w.py[lp.from], A);
      if (r !== 'CB' && r !== 'GK' && r !== 'DM' && p.u > 0.42 && p.u < lineA - 0.02) {
        set(lp.from, { u: Math.min(lineA - 0.01, p.u + 0.12), v: p.v * 0.8 }, A, 0.85);
        busy[lp.from] = 1;
      }
    }
    // Wide in the final third: bodies attack the box for the cross.
    const boxers = new Set<number>();
    if (ballA.u > 0.7 && Math.abs(ballA.v) > 0.45) {
      const spots: Pt[] = [{ u: 0.955, v: -0.06 }, { u: 0.95, v: 0.14 }, { u: 0.885, v: 0.0 }, { u: 0.86, v: 0.28 }];
      const far = -Math.sign(ballA.v);
      const cands = outfield(A)
        .filter((i) => i !== carrier && ['ST', 'AM', 'WG', 'CM'].includes(role(i)))
        .sort((a, b) => (BOX_PRIORITY[role(b)] ?? 0) - (BOX_PRIORITY[role(a)] ?? 0))
        .slice(0, 4);
      cands.forEach((i, k) => {
        boxers.add(i);
        const s = spots[k];
        // Hold just onside until the cross is struck.
        set(i, { u: Math.min(s.u, w.pass ? 1 : lineA - 0.005), v: s.v * far * (k === 0 ? -1 : 1) }, A, 0.65);
        busy[i] = 1;
      });
    }
    // Balance: when bodies have flooded forward, someone holds back. A team
    // keeps at least three outfield players behind the ball, and the deepest
    // spare midfielder or full-back drops into the gap left by whoever went.
    if (ballA.u > 0.45) {
      const behind = outs[A].filter((i) => frame(w.px[i], w.py[i], A).u < ballA.u - 0.08).length;
      if (behind < 3) {
        const spare = outs[A]
          .filter((i) => i !== carrier && i !== recv && i !== runner && !busy[i] && !boxers.has(i) && ['DM', 'CM', 'FB'].includes(role(i)))
          .sort((a, b) => frame(w.px[a], w.py[a], A).u - frame(w.px[b], w.py[b], A).u)[0];
        if (spare !== undefined) {
          set(spare, { u: clamp(ballA.u - 0.17, 0.3, 0.7), v: clamp(ballA.v * 0.3, -0.35, 0.35) }, A, 0.5);
          busy[spare] = 1;
        }
      }
    }
    if (carrier < 0 && recv < 0) return;
    // Support: the players around the ball keep moving into pockets where a pass can find them.
    const bx = recv >= 0 && w.pass ? w.pass.x : w.bx;
    const by = recv >= 0 && w.pass ? w.pass.y : w.by;
    const near = outfield(A)
      .filter((i) => i !== carrier && i !== recv && i !== runner && !boxers.has(i) && w.boxRun.indexOf(i) < 0)
      .sort((a, b) => d2(a, bx, by) - d2(b, bx, by))
      .slice(0, 4);
    const placed: { x: number; y: number }[] = [];
    // A fresh look for space a few times a second; in between, keep going to the spot.
    const look = Math.round(w.t * 10) % 4 === 0;
    for (const i of near) {
      const base = { x: tx[i], y: ty[i] };
      const mx0 = w.mem[i * 2];
      if (!look && !Number.isNaN(mx0)) {
        placed.push({ x: mx0, y: w.mem[i * 2 + 1] });
        setAbs(i, mx0, w.mem[i * 2 + 1], d2(i, bx, by) < 16 ? 0.5 : 0.35);
        continue;
      }
      const score = (x: number, y: number) => {
        if (Math.abs(x) > 51 || Math.abs(y) > 32.5) return -99;
        const f = frame(x, y, A);
        if (f.u > lineA - 0.004) return -99;
        const db = hyp(x - bx, y - by);
        let s = Math.min(nearestOpp(A, x, y), 7) * 0.6 + Math.min(laneGap(A, bx, by, x, y), 4) * 1.0;
        s += clamp(f.u - ballA.u, -0.15, 0.2) * 9;
        s -= hyp(x - base.x, y - base.y) * 0.13;
        // Close enough for a simple ball (8-16 m is ideal), never on top of the man on the ball.
        // Leave the carrier the grass in front of him to run into.
        if (carrier >= 0) {
          const fu = f.u - ballA.u;
          const fv = Math.abs(f.v - ballA.v) * 34;
          if (fu > 0.01 && fu < 0.12 && fv < 3.5) s -= 1.4;
        }
        if (db < 5) s -= (5 - db) * 1.2;
        else if (db < 8) s -= (8 - db) * 0.15;
        else if (db > 18) s -= (db - 18) * 0.06;
        if (db > 32) s -= (db - 32) * 0.25;
        for (const q of placed) {
          const dq = hyp(x - q.x, y - q.y);
          if (dq < 8) s -= (8 - dq) * 0.5;
        }
        return s;
      };
      let bx2 = base.x;
      let by2 = base.y;
      let bs = score(base.x, base.y);
      for (let k = 0; k < 10; k++) {
        const ang = (k / 10) * Math.PI * 2 + i;
        const rad = k % 2 ? 9 : 5;
        const x = base.x + Math.cos(ang) * rad;
        const y = base.y + Math.sin(ang) * rad;
        const s = score(x, y);
        if (s > bs) {
          bs = s;
          bx2 = x;
          by2 = y;
        }
      }
      // Stick with the spot he was already making for unless the new one is clearly better.
      const mx = w.mem[i * 2];
      const my = w.mem[i * 2 + 1];
      if (!Number.isNaN(mx) && hyp(mx - base.x, my - base.y) < 12) {
        const ms = score(mx, my);
        if (ms > bs - 0.8) {
          bx2 = mx;
          by2 = my;
        }
      }
      w.mem[i * 2] = bx2;
      w.mem[i * 2 + 1] = by2;
      placed.push({ x: bx2, y: by2 });
      setAbs(i, bx2, by2, d2(i, bx, by) < 16 ? 0.5 : 0.35);
    }
    // Everyone else forgets their old support spot.
    for (const i of teams[A]) if (near.indexOf(i) < 0) w.mem[i * 2] = w.mem[i * 2 + 1] = NaN;
    movements(near, bx, by);
    // The receiver attacks the pass.
    if (w.pass && recv >= 0) {
      setAbs(recv, w.pass.x, w.pass.y, 1);
      busy[recv] = 1;
    }
  }

  /**
   * Movements with a purpose, each one committed to for a second or two:
   *
   * - Third-man run: as a pass travels, a team-mate beyond it reads where the
   *   next ball will go and runs into the space past the receiver.
   * - Check away, then show: a supporting player with a man tight on him
   *   takes a couple of steps away to drag the marker, then comes sharply
   *   towards the ball. The marker follows a beat late, and the gap that
   *   opens is the pass.
   *
   * Nothing scripts the pass itself: the engine sees a free man and finds him.
   */
  function movements(near: number[], bx: number, by: number) {
    const M = mind.move;
    const recv = w.pass ? w.pass.to : -1;
    const runner = w.runner[A];
    const passer = w.lastPass && w.t - w.lastPass.t < 1.5 ? w.lastPass.from : -1;
    const free = (i: number) => i !== carrier && i !== recv && i !== runner && i !== passer && !busy[i] && w.boxRun.indexOf(i) < 0;
    // Carry on with moves already under way.
    let thirdMan = -1;
    for (const i of outs[A]) {
      const k = M[i * 5];
      if (!k) continue;
      if (w.t > M[i * 5 + 1] || !free(i)) { M[i * 5] = 0; continue; }
      if (k === 1) thirdMan = i;
      if (k === 2 && w.t > M[i * 5 + 4]) {
        // Second half of the check: the sharp move towards the ball.
        const dx = bx - w.px[i];
        const dy = by - w.py[i];
        const dl = hyp(dx, dy) || 1;
        const step = Math.min(7, Math.max(0, dl - 9));
        M[i * 5] = 3;
        M[i * 5 + 2] = w.px[i] + (dx / dl) * step;
        M[i * 5 + 3] = w.py[i] + (dy / dl) * step;
      }
      setAbs(i, M[i * 5 + 2], M[i * 5 + 3], k === 1 ? 0.85 : M[i * 5] === 3 ? 0.8 : 0.4);
      busy[i] = 1;
    }
    // Third-man run, read off a pass in flight.
    if (w.pass && recv >= 0 && thirdMan < 0 && runner < 0 && frame(w.pass.x, w.pass.y, A).u > 0.4 && trait(recv, Math.floor(w.t)) < 0.3) {
      const pt = frame(w.pass.x, w.pass.y, A);
      let best = -1;
      let bs = 0;
      let spot = { x: 0, y: 0 };
      for (const i of outs[A]) {
        if (!free(i) || mind.cool[i] > w.t || !['CM', 'AM', 'WG', 'ST'].includes(role(i))) continue;
        const p = frame(w.px[i], w.py[i], A);
        const d = hyp(w.px[i] - w.pass.x, w.py[i] - w.pass.y);
        if (d < 8 || d > 26 || p.u < pt.u - 0.04 || p.u > lineA - 0.03) continue;
        // Into the space beyond the receiver, staying onside.
        const u = Math.min(lineA - 0.01, Math.max(p.u, pt.u) + 0.1);
        const v = clamp(p.v * 0.7 + pt.v * 0.3, -0.85, 0.85);
        const a = toAbs({ u, v }, w.dir[A]);
        const sc = Math.min(nearestOpp(A, a.x, a.y), 9) + Math.min(laneGap(A, w.pass.x, w.pass.y, a.x, a.y), 4) - (d - 12) * 0.08 + trait(i, 5) * 1.5;
        if (sc > bs) { bs = sc; best = i; spot = a; }
      }
      // Not every pass: only when there is real space to run into.
      if (best >= 0 && bs > 10) {
        M.set([1, w.t + 2.4, spot.x, spot.y, 0], best * 5);
        mind.cool[best] = w.t + 14;
        setAbs(best, spot.x, spot.y, 0.85);
        busy[best] = 1;
      }
    }
    // Check away, then show, for a tightly marked supporter near the ball.
    if (carrier >= 0) {
      for (const i of near) {
        if (!free(i) || M[i * 5] || mind.cool[i] > w.t) continue;
        if (nearestOpp(A, w.px[i], w.py[i]) > 2.6) continue;
        const db = d2(i, bx, by);
        if (db < 10 || db > 28) continue;
        // Not everyone at once, and not all the time.
        if (trait(i, Math.floor(w.t / 3)) > 0.2) continue;
        mind.cool[i] = w.t + 12;
        const dx = w.px[i] - bx;
        const dy = w.py[i] - by;
        const dl = hyp(dx, dy) || 1;
        M.set([2, w.t + 2.6, w.px[i] + (dx / dl) * 2.5, w.py[i] + (dy / dl) * 2.5, w.t + 0.7], i * 5);
        setAbs(i, M[i * 5 + 2], M[i * 5 + 3], 0.4);
        busy[i] = 1;
        break;
      }
    }
  }

  /**
   * How a footballer actually moves off the ball. He reads the play with a
   * moment's lag, so his idea of where to be drifts rather than snaps. When he
   * is roughly where he should be he stands and watches, and only sets off
   * again once the game has really moved away from him. The further he is
   * from the ball the lazier he is about it: the far side ambles, the players
   * around the ball stay on their toes. Jobs with a purpose (pressing,
   * tracking a runner, attacking a pass, chasing a loose ball) skip all this.
   */
  function pace() {
    for (let i = 0; i < 22; i++) {
      if (sentOff[i] || busy[i] || urg[i] >= 0.8) {
        mind.tx[i] = tx[i];
        mind.ty[i] = ty[i];
        mind.settled[i] = 0;
        continue;
      }
      const s = sideOf(i);
      const gk = i % 11 === 0;
      const dBall = d2(i, w.bx, w.by);
      // Reading the play: a personal reaction speed, quicker when it matters.
      const px = mind.tx[i];
      if (!Number.isNaN(px)) {
        const k = clamp(0.22 + trait(i, 1) * 0.14 + urg[i] * 0.3 + (dBall < 15 ? 0.12 : 0), 0.2, 0.7);
        tx[i] = px + (tx[i] - px) * k;
        ty[i] = mind.ty[i] + (ty[i] - mind.ty[i]) * k;
      }
      mind.tx[i] = tx[i];
      mind.ty[i] = ty[i];
      // Holding a line is a team job: defenders in the back line stay tight to it.
      const r = role(i);
      const lineJob = s === D && (r === 'CB' || r === 'FB');
      const e = d2(i, tx[i], ty[i]);
      const tol = gk ? 0.8 : (lineJob ? 0.9 : 1.3 + clamp((dBall - 12) * 0.07, 0, 3.2)) * (0.85 + trait(i, 2) * 0.3);
      if (mind.settled[i] ? e > tol * 1.9 : e > tol * 0.55) mind.settled[i] = 0;
      else mind.settled[i] = 1;
      if (mind.settled[i]) {
        // In position: stand and watch, turning with the play.
        tx[i] = w.px[i];
        ty[i] = w.py[i];
        urg[i] = 0;
        continue;
      }
      // Football is walking punctuated by bursts, not a steady jog. Small
      // adjustments are walked; a real gap, or a moment that matters, gets a
      // proper run. The far side of the play is never in a hurry.
      // Work rate is personal: some keep busy wherever the ball is, others save their legs.
      const lazy = clamp(((dBall - 22) / 35) * (0.7 + trait(i, 3) * 0.6), 0, 1);
      const need = urg[i] * (1 - lazy * 0.5);
      if (need < 0.42 && e < 7 + lazy * 5) urg[i] = WALK;
      else if (e > 14 || need >= 0.42) urg[i] = Math.max(need, 0.5 - lazy * 0.15);
      else urg[i] = Math.max(need, 0.28);
    }
  }

  function celebrate(scorer: number) {
    const s = sideOf(scorer);
    const cx = w.dir[s] * 50;
    const cy = (w.by >= 0 ? 1 : -1) * 31;
    for (const i of teams[s]) {
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
      const mate = outfield(S).filter((i) => i !== taker).sort((a, b) => hyp(tx[a], ty[a]) - hyp(tx[b], ty[b]))[0];
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
      const corner = e.k === 'corner';
      if (corner && !routine) {
        routine = { key: e, side: S, from: NaN, job: cornerRoutine(atk.slice(0, box.length), sgn) };
        routines.set(w.mem, routine);
      }
      atk.forEach((i, k) => {
        let p: Pt;
        if (k < box.length) { p = corner ? packSpot(k, sgn) : box[k]; inBox.push(i); }
        else if (k < box.length + 2) p = { u: 0.78, v: k % 2 ? 0.2 : -0.2 };
        else p = { u: 0.55, v: k % 2 ? 0.3 : -0.3 };
        set(i, p, S, urgAll);
      });
      // The pack shuffles while the taker places the ball: little steps, nobody still.
      if (corner) {
        for (const i of inBox) {
          const j = 0.55 * Math.sin(w.t * (0.9 + trait(i, 6)) + trait(i, 7) * 6.3);
          setAbs(i, tx[i] + j * 0.6, ty[i] + j, 0.3);
        }
      }
      if (gkS >= 0) set(gkS, { u: 0.14, v: 0 }, S, urgAll);
      if (gkO >= 0) set(gkO, { u: 0.008, v: 0 }, O, urgAll);
      // The defending side leaves its quickest forward up as an outlet for the counter,
      // puts one on the near post, two zonal on the six-yard line, and marks the rest.
      const def = outfield(O);
      const outletIdx = def.findIndex((i) => role(i) === 'ST') >= 0 ? def.findIndex((i) => role(i) === 'ST') : def.findIndex((i) => role(i) === 'WG');
      if (outletIdx >= 0) {
        const o = def.splice(outletIdx, 1)[0];
        set(o, { u: 0.4, v: -sgn * 0.15 }, O, urgAll);
      }
      const nearPost = def.pop();
      if (nearPost !== undefined) set(nearPost, { u: 0.012, v: -sgn * 0.11 }, O, urgAll);
      for (const zv of [-0.02, 0.16]) {
        const z = def.pop();
        if (z !== undefined) set(z, { u: 0.05, v: -sgn * zv }, O, urgAll);
      }
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
      if (taker >= 0) set(taker, { u: 1 - 11 / 105 - 0.045, v: 0.012 }, S, 0.4);
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
      for (const i of outs[S]) {
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
      for (const i of outs[S]) {
        const r = role(i);
        const v = Math.sign(frame(tx[i], ty[i], S).v || 1);
        if (r === 'CB') set(i, { u: 0.08, v: v * 0.45 }, S, urgAll);
        if (r === 'FB') set(i, { u: 0.24, v: v * 0.86 }, S, urgAll);
      }
      // The opposition drops off to the halfway line.
      for (const i of outs[O]) {
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

  /**
   * Where the pack stands before the kick: a loose huddle around the penalty
   * spot, leaning to the far side, and the last man on the keeper's toes.
   */
  function packSpot(k: number, sgn: number): Pt {
    if (k === 5) return { u: 0.982, v: 0.02 * sgn };
    const ring = [{ u: 0.9, v: -0.03 }, { u: 0.888, v: -0.08 }, { u: 0.905, v: -0.13 }, { u: 0.877, v: -0.01 }, { u: 0.892, v: -0.18 }];
    return { u: ring[k].u, v: ring[k].v * sgn };
  }

  /**
   * The zones each man attacks once the corner is struck. Three routines:
   * flood the near post, overload the far post, or spread across the goal.
   * The best header in the pack always takes the routine's key zone.
   */
  function cornerRoutine(pack: number[], sgn: number) {
    const Z = {
      near: { u: 0.965, v: 0.1 }, nearFront: { u: 0.945, v: 0.17 }, six: { u: 0.955, v: 0 },
      far: { u: 0.955, v: -0.13 }, farBack: { u: 0.915, v: -0.25 }, spot: { u: 0.895, v: -0.02 },
      edge: { u: 0.83, v: 0.05 }, keeper: { u: 0.98, v: 0.03 },
    };
    const plans = [
      [Z.nearFront, Z.near, Z.six, Z.far, Z.edge, Z.keeper],
      [Z.far, Z.farBack, Z.six, Z.near, Z.spot, Z.keeper],
      [Z.spot, Z.near, Z.far, Z.six, Z.farBack, Z.keeper],
    ];
    const pick = plans[Math.floor(trait(Math.floor(w.t * 10) % 9973, 8) * plans.length)];
    const job = new Float64Array(44).fill(NaN);
    pack.forEach((i, k) => {
      const z = pick[k];
      const a = toAbs({ u: z.u, v: z.v * sgn }, w.dir[w.restart!.s]);
      job[i * 2] = a.x;
      job[i * 2 + 1] = a.y;
    });
    return job;
  }

  /** As the corner comes in, everyone in the pack attacks his zone at full tilt. */
  function deliveryRuns() {
    if (!routine || w.restart || routine.side !== A) return;
    const flying = w.pass?.cross || w.landing || w.bz > 1;
    if (!flying) return;
    for (let i = routine.side * 11; i < routine.side * 11 + 11; i++) {
      const x = routine.job[i * 2];
      if (Number.isNaN(x) || sentOff[i] || busy[i] || i === w.pass?.to || w.chase.indexOf(i) >= 0) continue;
      setAbs(i, x, routine.job[i * 2 + 1], 0.85 + 0.12 * trait(i, 9));
      busy[i] = 1;
    }
  }
}
