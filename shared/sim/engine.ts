import type { Attr } from '../attributes.ts';
import { getFormation, roleFit, type Slot } from '../formations.ts';
import { Rng } from '../rng.ts';
import { distM, flip, slotPosition, toAbs, type Pt } from '../shape.ts';
import { buildTimeline } from '../timeline.ts';
import type { EventKind, MatchEvent, MatchResult, PlayerLine, SimTeam, TeamStats } from './types.ts';

/**
 * Deterministic, possession-based match engine.
 *
 * The ball moves between players chosen from the live team shape, and every
 * duel (pass vs. interception, dribble vs. tackle, shot vs. keeper, header vs.
 * marker) is resolved from the attributes involved, adjusted by role fit,
 * fatigue and tactics. The same inputs and seed always produce the same match.
 */
export const ENGINE_VERSION = 1;
const HALF = 2700;

type Side = 0 | 1;

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const r1 = (x: number) => Math.round(x * 10) / 10;

function emptyStats(): TeamStats {
  return { goals: 0, shots: 0, onTarget: 0, xg: 0, passes: 0, passesDone: 0, possession: 50, fouls: 0, yellow: 0, red: 0, corners: 0, tackles: 0, saves: 0, offsides: 0 };
}

function emptyLine(idx: number): PlayerLine {
  return { idx, goals: 0, assists: 0, shots: 0, onTarget: 0, passes: 0, passesDone: 0, keyPasses: 0, tackles: 0, interceptions: 0, saves: 0, yellow: 0, red: 0, rating: 6 };
}

export interface SimOptions {
  /** Effective attribute bonus for the home side (0.02 = +2%). */
  homeAdvantage?: number;
}

export function simulateMatch(home: SimTeam, away: SimTeam, seed: number, opts: SimOptions = {}): MatchResult {
  return new Engine(home, away, seed, opts).run();
}

class Engine {
  private rng: Rng;
  private teams: [SimTeam, SimTeam];
  private slots: [Slot[], Slot[]];
  private homeAdv: number;
  private events: MatchEvent[] = [];
  private stats: [TeamStats, TeamStats] = [emptyStats(), emptyStats()];
  private lines: PlayerLine[] = [];
  private sentOff: boolean[] = new Array(22).fill(false);
  private yellows: number[] = new Array(22).fill(0);
  private possTime: [number, number] = [0, 0];

  private t = 0;
  private half: 1 | 2 = 1;
  private halfEnd = HALF;
  private poss: Side = 0;
  private holder = 0;
  private ball: Pt = { u: 0.5, v: 0 };
  private score: [number, number] = [0, 0];
  /** Last completed pass in the current possession, for assists / key passes. */
  private lastPass: { from: number; t: number } | null = null;
  private firstKickoff: Side;

  private seed: number;

  constructor(home: SimTeam, away: SimTeam, seed: number, opts: SimOptions) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.teams = [home, away];
    this.slots = [getFormation(home.formation).slots, getFormation(away.formation).slots];
    this.homeAdv = opts.homeAdvantage ?? 0.012;
    for (let i = 0; i < 22; i++) this.lines.push(emptyLine(i));
    this.firstKickoff = this.rng.chance(0.5) ? 0 : 1;
  }

  // ---------- helpers ----------

  private sideOf(idx: number): Side {
    return idx < 11 ? 0 : 1;
  }

  private local(idx: number): number {
    return idx % 11;
  }

  private player(idx: number) {
    return this.teams[this.sideOf(idx)].players[this.local(idx)];
  }

  private dir(side: Side): 1 | -1 {
    const homeDir = this.half === 1 ? 1 : -1;
    return (side === 0 ? homeDir : -homeDir) as 1 | -1;
  }

  /** Effective attribute: raw × role fit × fatigue × home edge. */
  private a(idx: number, attr: Attr): number {
    const p = this.player(idx);
    const side = this.sideOf(idx);
    const fit = roleFit(p.natural, p.role);
    const fitK = attr === 'stamina' || attr === 'strength' || attr === 'pace' ? 1 : 0.55 + 0.45 * fit;
    const tac = this.teams[side].tactics;
    const load = (this.t / 5400) * (tac.pressing === 'high' ? 1.12 : tac.pressing === 'low' ? 0.9 : 1);
    const fatigue = Math.max(0, load * 0.95 - p.attrs.stamina / 150) * 0.16;
    const homeK = side === 0 ? 1 + this.homeAdv : 1;
    return p.attrs[attr] * fitK * (1 - fatigue) * homeK;
  }

  private mix(idx: number, w: Partial<Record<Attr, number>>): number {
    let s = 0;
    let tot = 0;
    for (const k in w) {
      s += this.a(idx, k as Attr) * w[k as Attr]!;
      tot += w[k as Attr]!;
    }
    return s / tot;
  }

  private active(side: Side): number[] {
    const out: number[] = [];
    for (let i = 0; i < 11; i++) if (!this.sentOff[side * 11 + i]) out.push(side * 11 + i);
    return out;
  }

  /** Positions of a side's players, in `side`'s frame, given the ball in that frame. */
  private shape(side: Side, ballInSide: Pt, inPoss: boolean): Map<number, Pt> {
    const m = new Map<number, Pt>();
    const tac = this.teams[side].tactics;
    // Short-handed teams pull in to cover.
    const short = 11 - this.active(side).length;
    for (const idx of this.active(side)) {
      const slot = this.slots[side][this.local(idx)];
      const p = slotPosition(slot, ballInSide, inPoss, tac);
      if (short > 0 && slot.role !== 'GK') p.v *= 1 - 0.06 * short;
      m.set(idx, p);
    }
    return m;
  }

  /** Both sides' positions, expressed in the possessing side's frame. */
  private positions(): { mates: Map<number, Pt>; opps: Map<number, Pt> } {
    const mates = this.shape(this.poss, this.ball, true);
    const oppRaw = this.shape((1 - this.poss) as Side, flip(this.ball), false);
    const opps = new Map<number, Pt>();
    for (const [k, v] of oppRaw) opps.set(k, flip(v));
    // The ball carrier is where the ball is.
    mates.set(this.holder, { ...this.ball });
    return { mates, opps };
  }

  private nearest(map: Map<number, Pt>, to: Pt, exclude = -1): { idx: number; d: number } {
    let best = -1;
    let bd = Infinity;
    for (const [k, p] of map) {
      if (k === exclude) continue;
      const d = distM(p, to);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return { idx: best, d: bd };
  }

  private gk(side: Side): number {
    return side * 11; // slot 0 is always the goalkeeper
  }

  private emit(k: EventKind, side: Side, at: Pt, frame: Side, extra: Partial<MatchEvent> = {}) {
    const abs = toAbs(at, this.dir(frame));
    const ev: MatchEvent = { t: Math.round(this.t), k, s: side, x: r1(abs.x), y: r1(abs.y), ...extra };
    this.events.push(ev);
  }

  private advance(dt: number) {
    this.possTime[this.poss] += dt;
    this.t += dt;
  }

  private turnover(newHolder: number, at: Pt) {
    // `at` is in the current possessing side's frame.
    this.poss = this.sideOf(newHolder);
    this.ball = flip(at);
    this.holder = newHolder;
    this.lastPass = null;
  }

  private giveBall(side: Side, holder: number, at: Pt) {
    // `at` is in `side`'s frame.
    this.poss = side;
    this.holder = holder;
    this.ball = { ...at };
    this.lastPass = null;
  }

  private pickByRole(side: Side, roles: string[], prefer: (idx: number) => number): number {
    const cands = this.active(side).filter((i) => roles.includes(this.slots[side][this.local(i)].role));
    const pool = cands.length ? cands : this.active(side).filter((i) => i !== this.gk(side));
    let best = pool[0];
    let bs = -Infinity;
    for (const i of pool) {
      const s = prefer(i) + this.rng.next() * 8;
      if (s > bs) {
        bs = s;
        best = i;
      }
    }
    return best;
  }

  // ---------- flow ----------

  run(): MatchResult {
    this.kickoff(this.firstKickoff);
    this.halfEnd = HALF + Math.round(this.rng.range(30, 150));
    const halftimeAt = { v: 0 };
    let guard = 0;
    while (guard++ < 20000) {
      if (this.t >= this.halfEnd) {
        if (this.half === 1) {
          this.emit('halftime', 0, { u: 0.5, v: 0 }, 0);
          halftimeAt.v = this.t;
          this.half = 2;
          // The clock stays monotonic: the second half starts where the first ended.
          this.halfEnd = this.t + HALF + Math.round(this.rng.range(60, 300));
          this.t += 1;
          this.kickoff((1 - this.firstKickoff) as Side);
          continue;
        }
        this.emit('fulltime', 0, { u: 0.5, v: 0 }, 0, { sc: [...this.score] as [number, number] });
        break;
      }
      this.step();
    }
    const total = this.possTime[0] + this.possTime[1] || 1;
    this.stats[0].possession = Math.round((this.possTime[0] / total) * 100);
    this.stats[1].possession = 100 - this.stats[0].possession;
    this.stats[0].goals = this.score[0];
    this.stats[1].goals = this.score[1];
    for (const s of this.stats) s.xg = Math.round(s.xg * 100) / 100;
    this.rate();
    let motm = 0;
    for (const l of this.lines) if (l.rating > this.lines[motm].rating) motm = l.idx;
    return {
      version: ENGINE_VERSION,
      seed: this.seed,
      score: this.score,
      events: this.events,
      stats: this.stats,
      players: this.lines,
      motm,
      duration: Math.round(this.t),
      halftimeAt: Math.round(halftimeAt.v),
      timeline: buildTimeline(this.events, Math.round(halftimeAt.v), Math.round(this.t)),
    };
  }

  private kickoff(side: Side) {
    const taker = this.pickByRole(side, ['ST', 'AM', 'CM'], (i) => this.slots[side][this.local(i)].x * 50);
    this.giveBall(side, taker, { u: 0.5, v: 0 });
    this.emit('kickoff', side, this.ball, side, { p: taker });
    this.advance(1);
  }

  private step() {
    const side = this.poss;
    const h = this.holder;
    const role = this.slots[side][this.local(h)].role;
    const tac = this.teams[side].tactics;
    const { mates, opps } = this.positions();
    const press = this.nearest(opps, this.ball);
    const u = this.ball.u;
    const cv = Math.abs(this.ball.v);

    if (role === 'GK') {
      this.pass(mates, opps, true);
      return;
    }

    const inBox = u > 0.84 && cv < 0.42;
    const ment = tac.mentality === 'attacking' ? 1.05 : tac.mentality === 'defensive' ? 0.96 : 1;
    const shootQ = (this.a(h, 'shooting') + this.a(h, 'finishing')) / 200;
    let shootW = 0;
    if (u > 0.72) shootW = (u - 0.72) * 1.55 * (1 - cv * 0.7) * (0.5 + shootQ) * ment;
    if (inBox) shootW *= 2.3;
    if (role === 'CB' || role === 'DM') shootW *= 0.5;

    const widthK = tac.width === 'wide' ? 1.5 : tac.width === 'narrow' ? 0.6 : 1;
    const crossW = u > 0.72 && cv > 0.42 ? (0.25 + this.a(h, 'crossing') / 140) * widthK : 0;

    const flair = role === 'WG' || role === 'AM' || role === 'ST' ? 1 : role === 'CB' ? 0.25 : 0.55;
    const dribbleW = press.d < 7 ? (0.25 + this.a(h, 'dribbling') / 110) * flair : 0;
    const carryW = press.d >= 7 ? 0.55 + (press.d > 14 ? 0.6 : 0) : 0;
    const passW = 2.3 + (tac.tempo === 'patient' ? 0.5 : 0);

    const choice = this.rng.weighted([shootW, crossW, dribbleW, carryW, passW]);
    if (choice === 0) this.shoot(opps, false);
    else if (choice === 1) this.cross(mates, opps, false);
    else if (choice === 2) this.dribble(opps, press.idx);
    else if (choice === 3) this.carry(press.d);
    else this.pass(mates, opps, false);
  }

  private pass(mates: Map<number, Pt>, opps: Map<number, Pt>, fromKeeper: boolean) {
    const side = this.poss;
    const h = this.holder;
    const tac = this.teams[side].tactics;
    const oppTac = this.teams[1 - side].tactics;
    const fwd = (tac.tempo === 'direct' ? 1.7 : tac.tempo === 'patient' ? 0.75 : 1.15) * (tac.mentality === 'attacking' ? 1.08 : tac.mentality === 'defensive' ? 0.92 : 1);

    const cands: number[] = [];
    const weights: number[] = [];
    for (const [j, pj] of mates) {
      if (j === h) continue;
      const d = distM(this.ball, pj);
      if (d < 6) continue;
      const gain = pj.u - this.ball.u;
      const open = this.nearest(opps, pj).d;
      let w = 1 + gain * fwd * 4.5 - (d > 30 ? (d - 30) / 22 : 0);
      w *= 0.35 + Math.min(open, 12) / 12;
      if (fromKeeper && this.slots[side][this.local(j)].role === 'ST') w *= 1 + this.a(h, 'distribution') / 100;
      cands.push(j);
      weights.push(Math.max(0.03, w) ** 2);
    }
    if (!cands.length) {
      this.carry(10);
      return;
    }
    const to = cands[this.rng.weighted(weights)];
    const pTo = mates.get(to)!;
    const d = distM(this.ball, pTo);
    const toRole = this.slots[side][this.local(to)].role;
    const through = !fromKeeper && (toRole === 'ST' || toRole === 'WG' || toRole === 'AM') && pTo.u - this.ball.u > 0.1 && this.ball.u > 0.45 && this.rng.chance(0.45);
    const long = d > 32 || fromKeeper && d > 25;
    const target: Pt = through ? { u: clamp(pTo.u + 0.07, 0, 0.97), v: pTo.v } : pTo;

    let q: number;
    let base: number;
    if (fromKeeper) {
      q = this.mix(h, { distribution: 3, decisions: 1 });
      base = long ? 0.7 : 0.94;
    } else if (through) {
      q = this.mix(h, { keyPassing: 4, vision: 3, passing: 2, decisions: 1 });
      base = 0.56;
    } else if (long) {
      q = this.mix(h, { passing: 4, vision: 3, keyPassing: 1, decisions: 1 });
      base = 0.73;
    } else {
      q = this.mix(h, { passing: 5, ballControl: 2, decisions: 2 });
      base = 0.93;
    }
    const def = this.nearest(opps, target);
    const dq = through
      ? this.mix(def.idx, { defPositioning: 3, pace: 2, interception: 2, acceleration: 1 })
      : this.mix(def.idx, { interception: 4, defPositioning: 3, marking: 2 });
    const pressK = oppTac.pressing === 'high' ? 0.05 * (1 - this.ball.u) + 0.015 : oppTac.pressing === 'low' ? -0.012 : 0;
    const tempoK = tac.tempo === 'direct' ? -0.03 : tac.tempo === 'patient' ? 0.025 : 0;
    let p = base + (q - dq) * 0.0024 + (Math.min(def.d, 14) - 6) * 0.011 - pressK + tempoK - (d > 40 ? (d - 40) * 0.004 : 0);
    // Opponents with a high line are easier to get in behind.
    // Opponents with a high line are easier to get in behind; a deep block isn't.
    if (through && oppTac.mentality === 'attacking') p += 0.09;
    if (through && oppTac.mentality === 'defensive') p -= 0.08;
    // Committing bodies forward makes passing riskier, sitting deep makes it safer.
    if (tac.mentality === 'attacking') p -= 0.015;
    if (tac.mentality === 'defensive') p += 0.01;
    p = clamp(p, 0.15, 0.97);

    const st = this.stats[side];
    st.passes++;
    this.lines[h].passes++;
    const dt = 1.1 + d * 0.085 + (tac.tempo === 'patient' ? 0.9 : tac.tempo === 'direct' ? -0.3 : 0.3);
    const z = long || through ? r1(clamp(d / 6, 2, 9)) : undefined;
    const kind: EventKind = 'pass';
    const o = fromKeeper ? 'gk' : through ? 'through' : long ? 'long' : 'short';

    if (this.rng.chance(p)) {
      // Offside trap on balls in behind.
      const offsideP = through ? 0.11 * (oppTac.mentality === 'attacking' || oppTac.pressing === 'high' ? 1.5 : 1) : 0;
      if (this.rng.chance(offsideP)) {
        this.advance(dt);
        this.emit(kind, side, target, side, { p: h, q: to, z, o });
        this.stats[side].offsides++;
        this.advance(1);
        this.emit('offside', side, target, side, { p: to });
        const dSide = (1 - side) as Side;
        const taker = this.pickByRole(dSide, ['CB'], (i) => this.a(i, 'passing'));
        this.advance(this.rng.range(10, 18));
        this.giveBall(dSide, taker, flip(target));
        this.emit('freekick', dSide, this.ball, dSide, { p: taker });
        return;
      }
      st.passesDone++;
      this.lines[h].passesDone++;
      this.advance(dt);
      this.ball = { ...target };
      this.holder = to;
      this.lastPass = { from: h, t: this.t };
      const danger = this.ball.u > 0.8 && Math.abs(this.ball.v) < 0.5;
      this.emit(kind, side, target, side, { p: h, q: to, z, o, hl: danger && through ? 1 : undefined });
      return;
    }

    // Failed pass.
    this.advance(dt * 0.8);
    const outWide = Math.abs(target.v) > 0.82 && this.rng.chance(0.45);
    const outLong = (long || through) && target.u > 0.9 && this.rng.chance(0.4);
    if (outWide) {
      const at = { u: target.u, v: Math.sign(target.v) * 1 };
      this.emit(kind, side, at, side, { p: h, q: to, z, o: o + '-out' });
      this.restartThrow(at);
      return;
    }
    if (outLong) {
      const at = { u: 1.02, v: target.v };
      this.emit(kind, side, at, side, { p: h, q: to, z, o: o + '-out' });
      this.goalKick((1 - side) as Side);
      return;
    }
    const k = this.rng.range(0.55, 0.92);
    const at: Pt = { u: this.ball.u + (target.u - this.ball.u) * k, v: this.ball.v + (target.v - this.ball.v) * k };
    this.emit('intercept', (1 - side) as Side, at, side, { p: def.idx, q: h, z: z ? r1(z * 0.6) : undefined });
    this.lines[def.idx].interceptions++;
    this.turnover(def.idx, at);
  }

  private restartThrow(at: Pt) {
    // Ball went out off the attacking side → throw to the other team. `at` in current poss frame.
    const side = (1 - this.poss) as Side;
    const inFrame = flip(at);
    const roles = inFrame.u < 0.4 ? ['FB', 'CB'] : ['FB', 'WG', 'CM'];
    const taker = this.pickByRole(side, roles, (i) => -Math.abs(this.slots[side][this.local(i)].y * Math.sign(inFrame.v) - 1) * 20);
    this.advance(this.rng.range(8, 15));
    this.giveBall(side, taker, { u: clamp(inFrame.u, 0.05, 0.95), v: Math.sign(inFrame.v) * 0.98 });
    this.emit('throwin', side, this.ball, side, { p: taker });
  }

  private goalKick(side: Side) {
    this.advance(this.rng.range(10, 18));
    this.giveBall(side, this.gk(side), { u: 0.05, v: 0 });
    this.emit('goalkick', side, this.ball, side, { p: this.gk(side) });
  }

  private carry(space: number) {
    const side = this.poss;
    const h = this.holder;
    const speed = this.mix(h, { pace: 2, acceleration: 1, ballControl: 1 });
    const du = clamp(this.rng.range(0.03, 0.08) * (0.6 + speed / 90) * (space > 14 ? 1.4 : 1), 0.02, 0.14);
    const dv = this.rng.range(-0.08, 0.08) - this.ball.v * 0.08;
    this.ball = { u: clamp(this.ball.u + du, 0.02, 0.96), v: clamp(this.ball.v + dv, -0.97, 0.97) };
    this.advance(2 + du * 14);
    const danger = this.ball.u > 0.78 && Math.abs(this.ball.v) < 0.5;
    this.emit('carry', side, this.ball, side, { p: h, hl: danger ? 1 : undefined });
  }

  private dribble(opps: Map<number, Pt>, defender: number) {
    const side = this.poss;
    const h = this.holder;
    const att = this.mix(h, { dribbling: 4, ballControl: 2, acceleration: 2, pace: 1 });
    const def = this.mix(defender, { tackling: 4, defPositioning: 2, strength: 1.5, pace: 1, acceleration: 1 });
    const p = clamp(0.5 + (att - def) * 0.004, 0.2, 0.8);
    this.advance(this.rng.range(1.8, 3.2));
    if (this.rng.chance(p)) {
      const du = this.rng.range(0.05, 0.11);
      this.ball = { u: clamp(this.ball.u + du, 0.02, 0.97), v: clamp(this.ball.v + this.rng.range(-0.12, 0.12), -0.95, 0.95) };
      const danger = this.ball.u > 0.75;
      this.emit('dribble', side, this.ball, side, { p: h, q: defender, o: 'beat', hl: danger ? 1 : undefined });
      return;
    }
    // Lost it: clean tackle or foul.
    const oppTac = this.teams[1 - side].tactics;
    const foulP = 0.2 * (oppTac.pressing === 'high' ? 1.3 : oppTac.pressing === 'low' ? 0.8 : 1) * (1 + (60 - this.a(defender, 'tackling')) / 120);
    if (this.rng.chance(foulP)) {
      this.foul(defender, h);
      return;
    }
    this.stats[(1 - side) as Side].tackles++;
    this.lines[defender].tackles++;
    void opps;
    this.emit('tackle', (1 - side) as Side, this.ball, side, { p: defender, q: h });
    this.turnover(defender, this.ball);
  }

  private foul(offender: number, victim: number) {
    const side = this.poss; // fouled team
    const oSide = this.sideOf(offender);
    this.stats[oSide].fouls++;
    this.emit('foul', oSide, this.ball, side, { p: offender, q: victim });
    // Cards.
    const danger = this.ball.u > 0.6 ? 1.5 : 1;
    if (this.rng.chance(0.012)) {
      this.card(offender, 'red');
    } else if (this.rng.chance(0.17 * danger)) {
      this.yellows[offender]++;
      this.card(offender, this.yellows[offender] >= 2 ? 'second' : 'yellow');
    }
    this.advance(this.rng.range(12, 26));
    const u = this.ball.u;
    const cv = Math.abs(this.ball.v);
    this.lastPass = null;
    if (u > 0.84 && cv < 0.4) {
      this.penalty();
      return;
    }
    if (u > 0.7 && cv < 0.55 && this.rng.chance(0.45)) {
      const taker = this.bestOf(side, (i) => this.mix(i, { shooting: 3, finishing: 1, decisions: 1 }));
      this.holder = taker;
      this.emit('freekick', side, this.ball, side, { p: taker, o: 'direct' });
      this.advance(2);
      this.shoot(this.positions().opps, false, 'freekick');
      return;
    }
    if (u > 0.68) {
      const taker = this.bestOf(side, (i) => this.a(i, 'crossing'));
      this.holder = taker;
      this.emit('freekick', side, this.ball, side, { p: taker, o: 'cross' });
      const { mates, opps } = this.positions();
      this.cross(mates, opps, true);
      return;
    }
    this.emit('freekick', side, this.ball, side, { p: victim });
  }

  private card(idx: number, kind: 'yellow' | 'second' | 'red') {
    const side = this.sideOf(idx);
    if (kind === 'yellow') {
      this.stats[side].yellow++;
      this.lines[idx].yellow++;
    } else {
      if (kind === 'second') {
        this.stats[side].yellow++;
        this.lines[idx].yellow++;
      }
      this.stats[side].red++;
      this.lines[idx].red++;
      this.sentOff[idx] = true;
    }
    this.emit('card', side, this.ball, this.poss, { p: idx, o: kind, hl: kind !== 'yellow' ? 1 : undefined });
  }

  private bestOf(side: Side, score: (i: number) => number): number {
    let best = -1;
    let bs = -Infinity;
    for (const i of this.active(side)) {
      if (i === this.gk(side)) continue;
      const s = score(i);
      if (s > bs) {
        bs = s;
        best = i;
      }
    }
    return best;
  }

  private penalty() {
    const side = this.poss;
    const taker = this.bestOf(side, (i) => this.mix(i, { finishing: 3, shooting: 1, decisions: 2 }));
    this.holder = taker;
    this.ball = { u: 1 - 11 / 105, v: 0 };
    this.emit('penalty', side, this.ball, side, { p: taker, hl: 1 });
    this.advance(30);
    this.shoot(this.positions().opps, false, 'penalty');
  }

  private cross(mates: Map<number, Pt>, opps: Map<number, Pt>, setPiece: boolean, corner = false) {
    const side = this.poss;
    const h = this.holder;
    const dSide = (1 - side) as Side;
    const target: Pt = { u: this.rng.range(0.88, 0.95), v: this.rng.range(-0.3, 0.3) };
    // Attackers in the box contest the ball.
    const attackers = [...mates.entries()].filter(([j, p]) => j !== h && p.u > 0.62 && this.slots[side][this.local(j)].role !== 'GK').map(([j]) => j);
    const st = this.stats[side];
    st.passes++;
    this.lines[h].passes++;
    this.advance(this.rng.range(2, 3.5));
    const quality = this.mix(h, { crossing: 4, vision: 1, decisions: 1 });
    const gk = this.gk(dSide);
    const claimP = clamp(0.1 + (this.a(gk, 'aerialReach') - 55) * 0.004, 0.04, 0.3);
    const z = r1(this.rng.range(3, 6));
    if (!attackers.length || !this.rng.chance(clamp(0.4 + (quality - 55) * 0.0035 + (setPiece ? 0.08 : 0), 0.2, 0.75))) {
      // Overhit / cut out.
      if (this.rng.chance(claimP * 2)) {
        this.emit('cross', side, target, side, { p: h, z, o: 'claimed', q: gk });
        this.turnover(gk, { u: 0.96, v: 0 });
        return;
      }
      const clearer = this.nearest(opps, target).idx;
      this.emit('cross', side, target, side, { p: h, z, o: 'cleared' });
      this.clearance(clearer, target);
      return;
    }
    if (this.rng.chance(claimP)) {
      this.emit('cross', side, target, side, { p: h, z, o: 'claimed', q: gk });
      this.turnover(gk, { u: 0.96, v: 0 });
      return;
    }
    // Aerial duel.
    const weights = attackers.map((j) => this.mix(j, { heading: 3, offPositioning: 2, strength: 1 }) ** 2);
    const att = attackers[this.rng.weighted(weights)];
    const marker = this.nearest(opps, target).idx;
    const aq = this.mix(att, { heading: 3, offPositioning: 2, strength: 1.5 });
    const dq = this.mix(marker, { heading: 3, marking: 2, strength: 1.5 });
    const p = clamp(0.36 + (aq - dq) * 0.004 + (corner ? -0.04 : 0), 0.15, 0.75);
    st.passesDone++;
    this.lines[h].passesDone++;
    if (this.rng.chance(p)) {
      this.emit('cross', side, target, side, { p: h, q: att, z, o: 'won' });
      this.ball = target;
      this.holder = att;
      this.lastPass = { from: h, t: this.t };
      this.advance(0.6);
      this.shoot(opps, true);
      return;
    }
    this.emit('cross', side, target, side, { p: h, q: marker, z, o: 'cleared' });
    this.clearance(marker, target);
  }

  private clearance(clearer: number, at: Pt) {
    // `at` in current poss frame, clearer is a defender.
    const side = this.poss;
    const dSide = (1 - side) as Side;
    this.advance(this.rng.range(1.5, 3));
    const land: Pt = { u: this.rng.range(0.35, 0.62), v: clamp(at.v * 0.5 + this.rng.range(-0.6, 0.6), -0.9, 0.9) }; // attacking frame
    this.emit('clear', dSide, land, side, { p: clearer, z: r1(this.rng.range(5, 12)) });
    // Second ball.
    const { mates, opps } = this.positions();
    const m = this.nearest(mates, land, this.holder);
    const o = this.nearest(opps, land);
    const mq = m.idx >= 0 ? this.mix(m.idx, { heading: 1, strength: 1, decisions: 1, acceleration: 1 }) - m.d * 2 : -999;
    const oq = this.mix(o.idx, { heading: 1, strength: 1, decisions: 1, acceleration: 1 }) - o.d * 2;
    this.advance(2);
    if (mq + this.rng.range(-15, 15) > oq + this.rng.range(-15, 15)) {
      this.ball = land;
      this.holder = m.idx;
      this.lastPass = null;
      this.emit('carry', side, land, side, { p: m.idx });
    } else {
      this.emit('carry', dSide, land, side, { p: o.idx });
      this.turnover(o.idx, land);
    }
  }

  private shoot(opps: Map<number, Pt>, header: boolean, setPiece?: 'freekick' | 'penalty') {
    const side = this.poss;
    const dSide = (1 - side) as Side;
    const h = this.holder;
    const gk = this.gk(dSide);
    const goal: Pt = { u: 1, v: 0 };
    const d = Math.max(3, distM(this.ball, goal));
    const lateral = (Math.abs(this.ball.v) * 68) / 2;
    let xg = 0.85 * Math.exp(-d / 8) * (1 - 0.55 * Math.min(1, lateral / (d + 2)));
    if (header) xg *= 0.42;
    if (setPiece === 'penalty') xg = 0.76;
    if (setPiece === 'freekick') xg = Math.min(xg, 0.07);
    // Pressure reduces quality.
    const press = this.nearest(opps, this.ball).d;
    if (!setPiece) xg *= clamp(0.6 + press / 10, 0.6, 1.15);
    // A deep block crowds the box; a side pushing forward leaves gaps behind.
    const dTac = this.teams[dSide].tactics;
    if (!setPiece && dTac.mentality === 'defensive') xg *= 0.82;
    if (!setPiece && dTac.mentality === 'attacking') xg *= 1.3;
    if (!setPiece && dTac.pressing === 'low') xg *= 0.86;

    const sq = header
      ? this.mix(h, { heading: 4, offPositioning: 2, strength: 1 })
      : d > 18 || setPiece === 'freekick'
        ? this.mix(h, { shooting: 4, finishing: 2, decisions: 1 })
        : this.mix(h, { finishing: 4, shooting: 2, decisions: 1, ...(d < 12 ? { offPositioning: 1 } : {}) });
    const kq = header
      ? this.mix(gk, { aerialReach: 3, reflexes: 2, gkPositioning: 2 })
      : d < 12
        ? this.mix(gk, { oneOnOne: 3, reflexes: 3, gkPositioning: 2 })
        : this.mix(gk, { reflexes: 3, gkPositioning: 3, oneOnOne: 1 });
    const pGoal = clamp(xg * Math.exp((sq - kq) / 70), 0.01, 0.9);
    const st = this.stats[side];
    st.shots++;
    st.xg += xg;
    this.lines[h].shots++;
    const assist = this.lastPass && this.sideOf(this.lastPass.from) === side && this.t - this.lastPass.t < 15 ? this.lastPass.from : -1;
    if (assist >= 0) this.lines[assist].keyPasses++;
    this.advance(this.rng.range(1, 2));

    const blockP = (setPiece === 'penalty' ? 0 : setPiece === 'freekick' ? 0.25 : d > 13 ? 0.22 : 0.1) * (dTac.mentality === 'defensive' && !setPiece ? 1.35 : 1);
    const xgR = Math.round(xg * 100) / 100;
    const o = header ? 'header' : setPiece ?? (d > 20 ? 'long' : 'close');
    const r = this.rng.next();
    const dirSign = this.rng.chance(0.5) ? 1 : -1;
    if (r < blockP) {
      const blocker = this.nearest(opps, this.ball).idx;
      const at: Pt = { u: this.ball.u + 0.02, v: this.ball.v };
      this.emit('shot', side, at, side, { p: h, q: blocker, o: 'blocked', xg: xgR, hl: 1 });
      if (this.rng.chance(0.4)) {
        this.corner();
      } else {
        this.clearance(blocker, at);
      }
      return;
    }
    if (this.rng.next() < pGoal / (1 - blockP)) {
      st.onTarget++;
      this.lines[h].onTarget++;
      this.lines[h].goals++;
      this.score[side]++;
      const at: Pt = { u: 1.01, v: dirSign * this.rng.range(0.005, 0.1) };
      this.emit('shot', side, at, side, { p: h, q: gk, o: 'goal', xg: xgR, z: r1(this.rng.range(0.2, 2.2)), hl: 1 });
      if (assist >= 0) this.lines[assist].assists++;
      this.emit('goal', side, at, side, { p: h, q: assist >= 0 ? assist : undefined, sc: [...this.score] as [number, number], o, hl: 1 });
      this.advance(this.rng.range(45, 70));
      this.kickoff(dSide);
      return;
    }
    const onTargetP = clamp(0.36 + (sq - 55) * 0.005, 0.2, 0.6);
    if (this.rng.chance(onTargetP)) {
      st.onTarget++;
      this.lines[h].onTarget++;
      this.stats[dSide].saves++;
      this.lines[gk].saves++;
      const parry = this.rng.chance(0.35);
      const at: Pt = { u: 0.985, v: dirSign * this.rng.range(0.01, 0.08) };
      this.emit('shot', side, at, side, { p: h, q: gk, o: parry ? 'parried' : 'saved', xg: xgR, z: r1(this.rng.range(0.3, 2)), hl: 1 });
      if (parry) {
        this.corner();
      } else {
        this.advance(this.rng.range(4, 8));
        this.turnover(gk, { u: 0.96, v: 0 });
      }
      return;
    }
    const post = this.rng.chance(0.06);
    const at: Pt = { u: 1.03, v: dirSign * (post ? 0.11 : this.rng.range(0.13, 0.3)) };
    this.emit('shot', side, at, side, { p: h, o: post ? 'post' : 'wide', xg: xgR, z: r1(this.rng.range(0.5, 4)), hl: 1 });
    this.goalKick(dSide);
  }

  private corner() {
    const side = this.poss;
    this.stats[side].corners++;
    this.advance(this.rng.range(15, 28));
    const v = this.rng.chance(0.5) ? 0.99 : -0.99;
    const taker = this.bestOf(side, (i) => this.a(i, 'crossing'));
    this.ball = { u: 0.995, v };
    this.holder = taker;
    this.lastPass = null;
    this.emit('corner', side, this.ball, side, { p: taker });
    const { mates, opps } = this.positions();
    // Everyone attacks the box for a corner.
    for (const [k, p] of mates) if (this.slots[side][this.local(k)].role !== 'GK' && k !== taker && this.slots[side][this.local(k)].role !== 'FB') p.u = Math.max(p.u, 0.8);
    this.cross(mates, opps, true, true);
  }

  // ---------- ratings ----------

  private rate() {
    for (const l of this.lines) {
      const side = this.sideOf(l.idx);
      const role = this.slots[side][this.local(l.idx)].role;
      let r = 6.0;
      r += l.goals * 0.95 + l.assists * 0.55 + Math.min(0.6, l.keyPasses * 0.1);
      r += l.onTarget * 0.05 + Math.min(0.7, l.tackles * 0.05 + l.interceptions * 0.035);
      r += l.passes ? ((l.passesDone / l.passes) - 0.8) * 1.5 : 0;
      r -= l.yellow * 0.3 + l.red * 1.4;
      if (role === 'GK') {
        r += l.saves * 0.28 - this.score[1 - side] * 0.35;
        if (this.score[1 - side] === 0) r += 0.6;
      }
      if (role === 'CB' || role === 'FB') r += this.score[1 - side] === 0 ? 0.4 : -this.score[1 - side] * 0.12;
      const diff = this.score[side] - this.score[1 - side];
      r += clamp(diff, -3, 3) * 0.12;
      l.rating = Math.round(clamp(r, 3, 10) * 10) / 10;
    }
  }
}
