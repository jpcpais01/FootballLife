// Turns the match event stream into continuous positions for the ball and all
// 22 players at any clock time. Pure math, no three.js.
import { getFormation, type Slot, type Tactics } from '../../shared/formations.ts';
import { fromAbs, slotPosition, toAbs } from '../../shared/shape.ts';
import type { MatchEvent } from '../../shared/sim/types.ts';
import { direct } from './director.ts';

export interface TeamInfo {
  formation: string;
  tactics: Tactics;
}

export interface Frame {
  ball: { x: number; y: number; z: number };
  /** Index of the player with the ball at their feet (-1 when it's travelling or dead). */
  holder: number;
  /** Side considered in possession for shape purposes. */
  poss: 0 | 1;
  targets: { x: number; y: number }[];
  sentOff: boolean[];
  score: [number, number];
  /** Event index that is "current" (last event at or before t). */
  index: number;
  /** True during a goal celebration. */
  celebrating: number; // scorer index or -1
  phase: 'play' | 'dead' | 'flight';
  /** Who strikes the ball for the coming (or current) flight, and when. */
  kicker: number;
  kickAt: number;
  /** Progress of the current flight, 0..1 (0 when not in flight). */
  flightF: number;
  /** Where the ball carrier is about to play it. */
  aim: { x: number; y: number } | null;
}

const FLIGHT_SPEED: Record<string, number> = { short: 15, long: 21, through: 19, gk: 24, cross: 21, clear: 24, shot: 30, intercept: 17 };
const TRAVEL = new Set(['pass', 'cross', 'clear', 'shot', 'intercept']);
const RESTART = new Set(['kickoff', 'goalkick', 'throwin', 'corner', 'freekick', 'penalty']);

export class Playback {
  events: MatchEvent[] = [];
  private slots: [Slot[], Slot[]];
  private tactics: [Tactics, Tactics];
  halftimeAt: number;
  private scoreAt: [number, number][] = [];
  private redAt: { idx: number; t: number }[] = [];

  constructor(teams: [TeamInfo, TeamInfo], halftimeAt: number) {
    this.slots = [getFormation(teams[0].formation).slots, getFormation(teams[1].formation).slots];
    this.tactics = [teams[0].tactics, teams[1].tactics];
    this.halftimeAt = halftimeAt;
  }

  setEvents(events: MatchEvent[]) {
    this.events = events;
    this.scoreAt = [];
    this.redAt = [];
    let sc: [number, number] = [0, 0];
    events.forEach((e) => {
      if (e.k === 'goal' && e.sc) sc = [e.sc[0], e.sc[1]];
      this.scoreAt.push(sc);
      if (e.k === 'card' && e.o !== 'yellow' && e.p !== undefined) this.redAt.push({ idx: e.p, t: e.t });
    });
  }

  dir(side: 0 | 1, t: number): 1 | -1 {
    const homeDir = t <= this.halftimeAt ? 1 : -1;
    return (side === 0 ? homeDir : -homeDir) as 1 | -1;
  }

  /** Last event index with ev.t <= t. */
  indexAt(t: number): number {
    const ev = this.events;
    let lo = 0;
    let hi = ev.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (ev[mid].t <= t) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }

  scoreBefore(i: number): [number, number] {
    return i >= 0 ? this.scoreAt[i] : [0, 0];
  }

  frame(t: number): Frame {
    const ev = this.events;
    const i = this.indexAt(t);
    const prev = i >= 0 ? ev[i] : null;
    const next = i + 1 < ev.length ? ev[i + 1] : null;
    const sentOff = new Array(22).fill(false);
    for (const r of this.redAt) if (r.t <= t) sentOff[r.idx] = true;

    // ---- ball ----
    let ball = { x: prev?.x ?? 0, y: prev?.y ?? 0, z: 0 };
    let holder = prev ? holderAfter(prev) : -1;
    let phase: Frame['phase'] = 'play';
    let poss: 0 | 1 = prev ? possDuring(prev) : 0;
    let kicker = -1;
    let kickAt = Infinity;
    let flightF = 0;
    let holdK: number | null = null;
    let aim: { x: number; y: number } | null = null;
    if (prev && next) {
      poss = possDuring(next);
      const dt = Math.max(0.001, next.t - prev.t);
      const s = Math.min(1, Math.max(0, (t - prev.t) / dt));
      const dist = Math.hypot(next.x - prev.x, next.y - prev.y);
      if (TRAVEL.has(next.k)) {
        const kind = next.k === 'pass' ? (next.o ?? 'short').replace('-out', '') : next.k;
        const travel = Math.min(dt * 0.92, dist / (FLIGHT_SPEED[kind] ?? 18) + 0.05);
        const startFly = next.t - travel;
        kicker = next.k === 'intercept' ? holderAfter(prev) : next.p ?? -1;
        kickAt = startFly;
        aim = { x: next.x, y: next.y };
        if (t < startFly) {
          // Ball at the passer's feet: a couple of touches to set it, then the strike.
          const k = (t - prev.t) / Math.max(0.001, startFly - prev.t);
          holdK = k;
          const d = this.dir(prev.s, t);
          const settle = Math.sin(Math.min(1, k * 1.4) * Math.PI) * 0.6;
          ball = { x: prev.x + d * settle, y: prev.y + Math.sin(k * 2.3) * 0.25, z: 0 };
        } else {
          const f = Math.min(1, (t - startFly) / travel);
          // Passes decelerate as they roll; shots stay fast.
          const ef = next.k === 'shot' ? f : 1 - Math.pow(1 - f, 1.6);
          const apex = next.z ?? 0;
          let z: number;
          if (next.k === 'shot') z = (next.z ?? 0.4) * f + Math.sin(f * Math.PI) * Math.min(2, dist / 18);
          else z = apex > 0 ? apex * 4 * ef * (1 - ef) : 0.11;
          ball = { x: prev.x + (next.x - prev.x) * ef, y: prev.y + (next.y - prev.y) * ef, z };
          holder = -1;
          phase = 'flight';
          flightF = f;
        }
      } else if (RESTART.has(next.k)) {
        // Ball goes dead, then appears at the restart spot.
        phase = 'dead';
        if (s < 0.7) ball = { x: prev.x, y: prev.y, z: 0.11 };
        else ball = { x: next.x, y: next.y, z: 0.11 };
        holder = s < 0.7 ? -1 : next.p ?? -1;
      } else {
        // Carry, dribble, tackle, foul…: the carrier knocks the ball ahead and runs onto it.
        const dx = next.x - prev.x;
        const dy = next.y - prev.y;
        const len = Math.hypot(dx, dy) || 1;
        const touch = 1 - frac(t * 1.6 + prev.t);
        const lead = len > 1.5 ? 0.35 + 0.9 * touch * touch : 0;
        if (next.k === 'carry' || next.k === 'dribble') aim = { x: next.x, y: next.y };
        ball = { x: prev.x + dx * s + (dx / len) * lead, y: prev.y + dy * s + (dy / len) * lead, z: 0.11 };
        holder = next.k === 'tackle' || next.k === 'foul' ? next.q ?? holder : next.p ?? holder;
        if (next.k === 'card' || next.k === 'offside' || next.k === 'halftime' || next.k === 'fulltime') phase = 'dead';
      }
    } else if (prev) {
      ball.z = 0.11;
    }
    if (ball.z < 0.11) ball.z = 0.11;

    // ---- celebration ----
    let celebrating = -1;
    if (prev && (prev.k === 'goal' || (prev.k === 'shot' && prev.o === 'goal' && next?.k === 'goal'))) {
      const g = prev.k === 'goal' ? prev : next!;
      if (t - g.t < 40) celebrating = g.p ?? -1;
    }

    // ---- players ----
    const targets: { x: number; y: number }[] = [];
    for (let side = 0 as 0 | 1; side < 2; side = (side + 1) as 0 | 1) {
      const dir = this.dir(side, t);
      const inPoss = poss === side;
      const ballF = fromAbs(ball.x, ball.y, dir);
      const kickoffPhase = phase === 'dead' && next?.k === 'kickoff';
      for (let k = 0; k < 11; k++) {
        const idx = side * 11 + k;
        const slot = this.slots[side][k];
        let p = slotPosition(slot, { u: Math.min(0.98, Math.max(0.02, ballF.u)), v: Math.max(-1, Math.min(1, ballF.v)) }, inPoss, this.tactics[side]);
        if (kickoffPhase) p = slotPosition(slot, { u: 0.5, v: 0 }, false, this.tactics[side]);
        if (kickoffPhase || (prev?.k === 'kickoff' && t - prev.t < 1.5)) p.u = Math.min(p.u, 0.48);
        // Personal jitter so lines aren't perfectly straight.
        const j = Math.sin(idx * 12.9898 + t * 0.07) * 0.012;
        const abs = toAbs({ u: p.u + j, v: p.v + Math.cos(idx * 7.3 + t * 0.05) * 0.015 }, dir);
        targets.push(abs);
      }
    }
    // Off-ball movement: runs, support, the back line, pressing, marking and set pieces.
    direct({ t, ball, holder, poss, phase, prev, next, holdK, slots: this.slots, sentOff, dir: (side) => this.dir(side, t) }, targets);
    // The ball carrier is on the ball; the receiver runs onto the pass.
    if (holder >= 0) {
      const d = this.dir(holder < 11 ? 0 : 1, t);
      const toward = aim ? Math.atan2(aim.y - ball.y, aim.x - ball.x) : d > 0 ? 0 : Math.PI;
      targets[holder] = { x: ball.x - Math.cos(toward) * 0.6, y: ball.y - Math.sin(toward) * 0.6 };
    }
    if (phase === 'flight' && next) {
      const recv = next.k === 'pass' || next.k === 'cross' ? next.q : next.k === 'intercept' ? next.p : undefined;
      if (recv !== undefined && recv >= 0) targets[recv] = { x: next.x - this.dir(recv < 11 ? 0 : 1, t) * 0.5, y: next.y };
    }
    // Shot / corner set-ups: keeper on the line.
    if (celebrating >= 0) {
      const side = celebrating < 11 ? 0 : 1;
      const corner = { x: this.dir(side, t) * 50, y: (ball.y >= 0 ? 1 : -1) * 31 };
      for (let k = 1; k < 11; k++) {
        const idx = side * 11 + k;
        const d = idx === celebrating ? 0 : 1.2 + (k % 4) * 0.9;
        const a = k * 2.1;
        if (idx === celebrating || k % 3 !== 0) targets[idx] = { x: corner.x - this.dir(side, t) * (d + 1), y: corner.y - Math.sign(corner.y) * (Math.abs(Math.sin(a)) * d + 1) };
      }
    }
    return { ball, holder, poss, targets, sentOff, score: this.scoreBefore(i), index: i, celebrating, phase, kicker, kickAt, flightF, aim };
  }
}

const frac = (x: number) => x - Math.floor(x);

function holderAfter(e: MatchEvent): number {
  switch (e.k) {
    case 'pass':
      return e.o?.endsWith('-out') ? -1 : e.q ?? -1;
    case 'cross':
      return e.o === 'claimed' ? e.q ?? -1 : -1;
    case 'intercept':
    case 'tackle':
    case 'carry':
    case 'dribble':
    case 'kickoff':
    case 'goalkick':
    case 'throwin':
    case 'freekick':
    case 'corner':
    case 'penalty':
      return e.p ?? -1;
    default:
      return -1;
  }
}

/** Which side has the ball during the run-up to event e. */
function possDuring(e: MatchEvent): 0 | 1 {
  if (e.k === 'intercept' || e.k === 'tackle' || e.k === 'foul' || e.k === 'clear') return (1 - e.s) as 0 | 1;
  return e.s;
}
