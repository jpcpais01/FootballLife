import type { Attr } from '../attributes.ts';
import { getFormation, roleFit, type Slot, type Tactics } from '../formations.ts';
import { Rng } from '../rng.ts';
import { fromAbs, toAbs, type Pt } from '../shape.ts';
import { buildTimeline } from '../timeline.ts';
import { plan, type Restart, type Side, type World } from './ai.ts';
import { lineFromEvents, rateLine } from './rating.ts';
import { pack, type Act, type ActKind, type TrackWindow } from './tracks.ts';
import type { EventKind, MatchEvent, MatchResult, PlayerLine, SimTeam, TeamStats } from './types.ts';

/**
 * Deterministic, spatial match engine.
 *
 * All 22 players and the ball live on a real pitch and are stepped ten times a
 * second: players run with their own pace and acceleration toward where the
 * team shape (ai.ts) wants them, the ball rolls, flies and bounces, and the
 * man on the ball reads the actual space around him to pass, carry, dribble,
 * cross or shoot. Every duel (pass vs. interception, dribble vs. tackle, shot
 * vs. keeper, header vs. marker) is resolved from the attributes involved,
 * adjusted by role fit, fatigue and tactics, and the ball then travels
 * physically to where that outcome happens. The same inputs and seed always
 * produce the same match.
 *
 * The highlight windows of the broadcast are recorded frame by frame, so the
 * 3D view replays exactly what was simulated.
 */
export const ENGINE_VERSION = 3;
const HALF = 2700;
const DT = 0.1;
const TRACK_HZ = 5;
const GOAL_X = 52.5;
const GOAL_HALF = 3.66;
const BALL_R = 0.11;

const hyp = (x: number, y: number) => Math.sqrt(x * x + y * y);
const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);
const r1 = (x: number) => Math.round(x * 10) / 10;

export interface SimOptions {
  /** Effective attribute bonus for the home side (0.02 = +2%). */
  homeAdvantage?: number;
}

export function simulateMatch(home: SimTeam, away: SimTeam, seed: number, opts: SimOptions = {}): MatchResult {
  return new Engine(home, away, seed, opts).run();
}

interface Flight {
  t0: number;
  T: number;
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  apex: number;
  kind: 'ground' | 'air' | 'shot';
  /** Sideways bend at mid-flight (metres, to the left of the line of flight). */
  curl: number;
  done: () => void;
}

interface PendingRestart extends Restart {
  at: number;
  announceAt: number;
  announced: boolean;
  take: () => void;
}

class Engine {
  private rng: Rng;
  private teams: [SimTeam, SimTeam];
  private slots: [Slot[], Slot[]];
  private tactics: [Tactics, Tactics];
  private homeAdv: number;
  private seed: number;
  private events: MatchEvent[] = [];
  private acts: Act[] = [];
  private sentOff: boolean[] = new Array(22).fill(false);
  private yellows: number[] = new Array(22).fill(0);
  private possTime: [number, number] = [0, 0];
  private score: [number, number] = [0, 0];

  // ---- clock ----
  private n = 0; // ticks
  private t = 0;
  private half: 1 | 2 = 1;
  private halfEnd = HALF;
  private halftimeAt = 0;

  // ---- bodies ----
  private px = new Float64Array(22);
  private py = new Float64Array(22);
  private vx = new Float64Array(22);
  private vy = new Float64Array(22);
  private tx = new Float64Array(22);
  private ty = new Float64Array(22);
  private urg = new Float64Array(22);
  /** Until when a player is recovering (slide, stumble, fall) and can't act or run. */
  private busy = new Float64Array(22);

  // ---- ball ----
  private bx = 0;
  private by = 0;
  private bz = BALL_R;
  private bvx = 0;
  private bvy = 0;
  private bvz = 0;
  private owner = -1;
  private ownerSince = 0;
  private flight: Flight | null = null;
  private loose = false;
  private lastTouch: Side = 0;

  // ---- play state ----
  private poss: Side = 0;
  private phase: World['phase'] = 'play';
  private restart: PendingRestart | null = null;
  private celebrating = -1;
  private passInfo: World['pass'] = null;
  private landing: World['landing'] = null;
  private runner: [number, number] = [-1, -1];
  private runnerUntil: [number, number] = [0, 0];
  private chase: number[] = [];
  private boxRun: number[] = [];
  /** When the man on the ball has the ball under control and can play it. */
  private decideAt = 0;
  private carryX = 0;
  private carryY = 0;
  private lastEvX = 0;
  private lastEvY = 0;
  private lastPass: { from: number; t: number } | null = null;
  private firstKickoff: Side;

  // ---- recording ----
  private rec: Float32Array;

  constructor(home: SimTeam, away: SimTeam, seed: number, opts: SimOptions) {
    this.seed = seed;
    this.rng = new Rng(seed);
    this.teams = [home, away];
    this.slots = [getFormation(home.formation).slots, getFormation(away.formation).slots];
    this.tactics = [home.tactics, away.tactics];
    this.homeAdv = opts.homeAdvantage ?? 0.03;
    this.firstKickoff = this.rng.chance(0.5) ? 0 : 1;
    this.rec = new Float32Array(Math.ceil(6600 / DT) * 47);
  }

  // =====================================================================
  // helpers
  // =====================================================================

  private sideOf(i: number): Side {
    return i < 11 ? 0 : 1;
  }

  private player(i: number) {
    return this.teams[this.sideOf(i)].players[i % 11];
  }

  private role(i: number) {
    return this.slots[this.sideOf(i)][i % 11].role;
  }

  private dir(side: Side): 1 | -1 {
    const homeDir = this.half === 1 ? 1 : -1;
    return (side === 0 ? homeDir : -homeDir) as 1 | -1;
  }

  /** A point in `side`'s attacking frame. */
  private fr(x: number, y: number, side: Side): Pt {
    return fromAbs(x, y, this.dir(side));
  }

  private abs(p: Pt, side: Side) {
    return toAbs(p, this.dir(side));
  }

  /** Effective attribute: raw × role fit × fatigue × home edge. */
  private a(i: number, attr: Attr): number {
    const p = this.player(i);
    const side = this.sideOf(i);
    const fit = roleFit(p.natural, p.role);
    const fitK = attr === 'stamina' || attr === 'strength' || attr === 'pace' ? 1 : 0.55 + 0.45 * fit;
    const tac = this.tactics[side];
    const load = (this.t / 5400) * (tac.pressing === 'high' ? 1.12 : tac.pressing === 'low' ? 0.9 : 1);
    const fatigue = Math.max(0, load * 0.95 - p.attrs.stamina / 150) * 0.16;
    const homeK = side === 0 ? 1 + this.homeAdv : 1;
    return p.attrs[attr] * fitK * (1 - fatigue) * homeK;
  }

  private mix(i: number, w: Partial<Record<Attr, number>>): number {
    let s = 0;
    let tot = 0;
    for (const k in w) {
      s += this.a(i, k as Attr) * w[k as Attr]!;
      tot += w[k as Attr]!;
    }
    return s / tot;
  }

  private active(side: Side): number[] {
    const out: number[] = [];
    for (let k = 0; k < 11; k++) if (!this.sentOff[side * 11 + k]) out.push(side * 11 + k);
    return out;
  }

  private gk(side: Side): number {
    return side * 11; // slot 0 is always the goalkeeper
  }

  private dist(i: number, x: number, y: number) {
    return hyp(this.px[i] - x, this.py[i] - y);
  }

  private nearest(side: Side, x: number, y: number, exclude = -1): { idx: number; d: number } {
    let best = -1;
    let bd = Infinity;
    for (const i of this.active(side)) {
      if (i === exclude) continue;
      const d = this.dist(i, x, y);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return { idx: best, d: bd };
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

  private emit(k: EventKind, side: Side, x: number, y: number, extra: Partial<MatchEvent> = {}) {
    const ev: MatchEvent = { t: r1(this.t), k, s: side, x: r1(clamp(x, -56, 56)), y: r1(clamp(y, -37, 37)), ...extra };
    for (const key of Object.keys(ev) as (keyof MatchEvent)[]) if (ev[key] === undefined) delete ev[key];
    this.events.push(ev);
    this.lastEvX = this.bx;
    this.lastEvY = this.by;
  }

  private act(i: number, kind: ActKind, detail = 0) {
    if (i >= 0) this.acts.push([r1(this.t), i, kind, detail]);
  }

  /** Seconds for `i` to get to (x, y) at a run. */
  private reach(i: number, x: number, y: number) {
    const dx = x - this.px[i];
    const dy = y - this.py[i];
    const d = hyp(dx, dy);
    if (d < 0.3) return 0;
    const top = this.topSpeed(i) * 0.95;
    const a = this.accel(i);
    // Speed already carried toward the spot, then accelerate up to top speed.
    const v0 = clamp((this.vx[i] * dx + this.vy[i] * dy) / d, 0, top);
    const dAcc = (top * top - v0 * v0) / (2 * a);
    const t = d <= dAcc ? (-v0 + Math.sqrt(v0 * v0 + 2 * a * d)) / a : (top - v0) / a + (d - dAcc) / top;
    // A little slack for easing into the spot.
    return t + 0.35;
  }

  private topSpeed(i: number) {
    const p = this.player(i).attrs;
    const fatigue = Math.max(0, this.t / 5400 - p.stamina / 130) * 0.12;
    return (6.3 + this.a(i, 'pace') * 0.032) * (1 - fatigue);
  }

  private accel(i: number) {
    return 3 + this.a(i, 'acceleration') * 0.038;
  }

  // =====================================================================
  // main loop
  // =====================================================================

  run(): MatchResult {
    this.kickoffSetup(this.firstKickoff, true);
    this.halfEnd = HALF + Math.round(this.rng.range(30, 150));
    const maxTicks = this.rec.length / 47 - 2;
    while (this.n < maxTicks) {
      if (this.t >= this.halfEnd && !this.flight && this.phase !== 'celebrate' && !(this.restart && this.restart.announced)) {
        if (this.half === 1) {
          this.t = Math.ceil(this.t);
          this.n = Math.round(this.t / DT);
          this.emit('halftime', 0, 0, 0);
          this.halftimeAt = this.t;
          this.record();
          this.half = 2;
          this.t += 1;
          this.n = Math.round(this.t / DT);
          this.halfEnd = this.t + HALF + Math.round(this.rng.range(60, 300));
          this.kickoffSetup((1 - this.firstKickoff) as Side, true);
          continue;
        }
        this.t = Math.ceil(this.t);
        this.emit('fulltime', 0, this.bx, this.by, { sc: [...this.score] as [number, number] });
        this.record();
        break;
      }
      this.tick();
    }
    return this.result();
  }

  private tick() {
    if (this.n % 2 === 0) this.think();
    this.steer();
    this.moveBall();
    if (this.restart) {
      const r = this.restart;
      if (!r.announced && this.t >= r.announceAt) {
        r.announced = true;
        this.emit(r.k, r.s, r.x, r.y, { p: r.p, o: r.k === 'freekick' && r.o ? r.o : undefined, hl: r.k === 'penalty' ? 1 : undefined });
      }
      if (this.t >= r.at) {
        this.restart = null;
        this.phase = 'play';
        this.place(r.x, r.y, r.k === 'throwin' ? 2.1 : BALL_R);
        if (r.p >= 0 && !this.sentOff[r.p]) {
          this.px[r.p] = r.x - (r.k === 'throwin' ? 0 : this.dir(r.s) * 0.6);
          this.py[r.p] = r.y + (r.k === 'throwin' ? Math.sign(r.y || 1) * 0.6 : 0);
        }
        this.poss = r.s;
        r.take();
      }
    } else if (this.phase === 'celebrate') {
      if (this.pendingParty && this.t >= this.pendingParty.until) {
        const p = this.pendingParty;
        this.pendingParty = null;
        p.then();
      }
    } else if (this.owner >= 0) {
      this.onBall();
    } else if (this.loose) {
      this.pickup();
    }
    this.possTime[this.poss] += DT;
    this.record();
    this.n++;
    this.t = Math.round(this.n) * DT;
    this.t = Math.round(this.t * 10) / 10;
  }

  /** Recompute where everyone wants to be. */
  private think() {
    for (const s of [0, 1] as Side[]) if (this.runner[s] >= 0 && (this.t > this.runnerUntil[s] || this.poss !== s)) this.runner[s] = -1;
    // A forward goes in behind when a team-mate has time on the ball in a good area.
    const A = this.poss;
    if (this.owner >= 0 && this.sideOf(this.owner) === A && this.runner[A] < 0 && this.phase === 'play') {
      const b = this.fr(this.bx, this.by, A);
      const press = this.nearest((1 - A) as Side, this.bx, this.by).d;
      if (b.u > 0.38 && press > 4 && this.rng.chance(0.08)) {
        const cands = this.active(A).filter((i) => i !== this.owner && ['ST', 'WG', 'AM'].includes(this.role(i)));
        if (cands.length) {
          this.runner[A] = cands[this.rng.weighted(cands.map((i) => this.a(i, 'offPositioning') ** 2))];
          this.runnerUntil[A] = this.t + this.rng.range(3, 6);
        }
      }
    }
    const w: World = {
      t: this.t,
      px: this.px,
      py: this.py,
      vx: this.vx,
      vy: this.vy,
      bx: this.bx,
      by: this.by,
      bz: this.bz,
      owner: this.owner,
      poss: this.poss,
      phase: this.phase,
      pass: this.passInfo,
      landing: this.landing,
      restart: this.restart,
      slots: this.slots,
      tactics: this.tactics,
      sentOff: this.sentOff,
      dir: [this.dir(0), this.dir(1)],
      runner: this.runner,
      chase: this.chase,
      celebrating: this.celebrating,
      boxRun: this.boxRun,
    };
    plan(w, this.tx, this.ty, this.urg);
    if (this.owner >= 0 && !this.restart) {
      this.tx[this.owner] = this.carryX;
      this.ty[this.owner] = this.carryY;
      this.urg[this.owner] = 0.75;
    }
  }

  /**
   * Moves every player toward their target like a body: speed builds and bleeds
   * off with limited acceleration, players ease into position, sprint when the
   * play needs them, and keep a little personal space.
   */
  private topC = new Float64Array(22);
  private accC = new Float64Array(22);

  private steer() {
    if (this.n % 20 === 0) for (let i = 0; i < 22; i++) {
      this.topC[i] = this.topSpeed(i);
      this.accC[i] = this.accel(i);
    }
    for (let i = 0; i < 22; i++) {
      if (this.sentOff[i]) continue;
      const dx = this.tx[i] - this.px[i];
      const dy = this.ty[i] - this.py[i];
      const d = hyp(dx, dy);
      let top = this.topC[i];
      if (i === this.owner) top *= 0.84;
      if (this.busy[i] > this.t) top *= 0.25;
      const u = this.urg[i];
      const cruise = u > 0 ? top * (0.5 + 0.5 * u) : d > 15 ? top * 0.7 : Math.min(top * 0.5, 1 + d * 0.4);
      const want = Math.min(cruise, d * 1.7);
      const wx = d > 0.05 ? (dx / d) * want : 0;
      const wy = d > 0.05 ? (dy / d) * want : 0;
      let ax = wx - this.vx[i];
      let ay = wy - this.vy[i];
      const al = hyp(ax, ay);
      const speeding = this.vx[i] * ax + this.vy[i] * ay >= 0;
      const amax = (speeding ? this.accC[i] : this.accC[i] * 1.6) * DT;
      if (al > amax) {
        ax *= amax / al;
        ay *= amax / al;
      }
      this.vx[i] += ax;
      this.vy[i] += ay;
    }
    for (let i = 0; i < 22; i++) {
      if (this.sentOff[i]) continue;
      this.px[i] += this.vx[i] * DT;
      this.py[i] += this.vy[i] * DT;
    }
    // Personal space: overlapping players ease apart (the man on the ball holds his line).
    for (let i = 0; i < 22; i++) {
      if (this.sentOff[i]) continue;
      for (let j = i + 1; j < 22; j++) {
        if (this.sentOff[j]) continue;
        const dx = this.px[j] - this.px[i];
        const dy = this.py[j] - this.py[i];
        const d = hyp(dx, dy);
        if (d > 1.1 || d < 1e-4) continue;
        const push = ((1.1 - d) / d) * 0.3;
        const wi = i === this.owner ? 0.1 : 1;
        const wj = j === this.owner ? 0.1 : 1;
        // Nudge velocities, not positions, so nobody jumps sideways.
        this.vx[i] -= dx * push * wi * 3;
        this.vy[i] -= dy * push * wi * 3;
        this.vx[j] += dx * push * wj * 3;
        this.vy[j] += dy * push * wj * 3;
      }
    }
  }

  private moveBall() {
    if (this.flight) {
      const f = this.flight;
      const s = clamp((this.t + DT - f.t0) / f.T, 0, 1);
      let e: number;
      if (f.kind === 'ground') {
        const k = 0.75;
        e = (1 - Math.exp(-k * s * f.T)) / (1 - Math.exp(-k * f.T));
      } else if (f.kind === 'air') {
        const k = 0.3;
        e = (1 - Math.exp(-k * s * f.T)) / (1 - Math.exp(-k * f.T));
      } else {
        // Struck balls lose a little pace through the air.
        const k = 0.35;
        e = (1 - Math.exp(-k * s * f.T)) / (1 - Math.exp(-k * f.T));
      }
      this.bx = f.x0 + (f.x1 - f.x0) * e;
      this.by = f.y0 + (f.y1 - f.y0) * e;
      if (f.curl) {
        // Spin bends the flight off the straight line and back onto the target.
        const L = hyp(f.x1 - f.x0, f.y1 - f.y0) || 1;
        const c = f.curl * 4 * e * (1 - e);
        this.bx -= ((f.y1 - f.y0) / L) * c;
        this.by += ((f.x1 - f.x0) / L) * c;
      }
      this.bz = f.kind === 'ground' ? BALL_R + (f.z0 - BALL_R) * Math.max(0, 1 - s * 4) : f.z0 + (f.z1 - f.z0) * s + f.apex * 4 * s * (1 - s);
      if (s >= 1) {
        // Velocity on arrival, for whatever happens next.
        const T = f.T;
        this.bvx = ((f.x1 - f.x0) / T) * (f.kind === 'ground' ? 0.45 : 0.75);
        this.bvy = ((f.y1 - f.y0) / T) * (f.kind === 'ground' ? 0.45 : 0.75);
        this.bvz = f.kind === 'ground' ? 0 : -(f.apex * 4) / T;
        this.flight = null;
        this.passInfo = null;
        f.done();
      }
      return;
    }
    if (this.owner >= 0 && this.receiving) {
      // The ball rolls on and the receiver runs onto it; first touch when he gets there.
      const i = this.owner;
      this.rollFree();
      this.carryX = this.bx + this.bvx * 0.35;
      this.carryY = this.by + this.bvy * 0.35;
      if (this.dist(i, this.bx, this.by) < 0.7) {
        this.receiving = false;
        this.ownerSince = this.t;
        this.setCarry(i, 6);
        if (this.pendingTouch) this.act(i, this.touchKind(this.pendingTouch));
        this.decideAt = Math.max(this.decideAt, this.t + 0.3);
      }
      return;
    }
    if (this.owner >= 0) {
      // At the carrier's feet: knocked a little ahead on each touch while running.
      const i = this.owner;
      const sp = hyp(this.vx[i], this.vy[i]);
      let hx: number;
      let hy: number;
      if (sp > 0.6) {
        hx = this.vx[i] / sp;
        hy = this.vy[i] / sp;
      } else {
        const d = this.dir(this.sideOf(i));
        hx = d;
        hy = 0;
      }
      const ph = ((this.t - this.ownerSince) * (0.9 + sp * 0.12)) % 1;
      // Close control: small touches, and the ball is tight to him when he's about to play it.
      const ready = this.t >= this.decideAt ? 0.3 : 1;
      const knock = sp > 2.5 ? (ph < 0.2 ? ph / 0.2 : (1 - ph) / 0.8) * Math.min(0.55, sp * 0.07) * ready : 0;
      const gx = this.px[i] + hx * (0.4 + knock);
      const gy = this.py[i] + hy * (0.4 + knock);
      // Glide onto the foot rather than snapping.
      const k = Math.min(1, (this.t - this.ownerSince) / 0.25);
      this.bx += (gx - this.bx) * (0.35 + 0.65 * k);
      this.by += (gy - this.by) * (0.35 + 0.65 * k);
      this.bz += (BALL_R - this.bz) * 0.5;
      return;
    }
    if (this.loose) {
      this.rollFree();
      this.outOfPlay();
      return;
    }
    // Dead ball (in the net, or out of play before the restart): it runs on and settles.
    if (this.bz > BALL_R + 0.01 || Math.abs(this.bvx) + Math.abs(this.bvy) > 0.05) {
      const net = Math.abs(this.bx) > GOAL_X - 0.2 && Math.abs(this.by) < GOAL_HALF + 0.1 && this.bz < 2.5;
      this.rollFree();
      const back = net ? GOAL_X + 1.8 : GOAL_X + 5;
      if (Math.abs(this.bx) > back) {
        this.bx = Math.sign(this.bx) * back;
        this.bvx *= -0.15;
        this.bvy *= 0.4;
        this.bvz *= 0.4;
      }
      if (net) this.by = clamp(this.by, -GOAL_HALF + 0.15, GOAL_HALF - 0.15);
      if (Math.abs(this.by) > 37) {
        this.by = Math.sign(this.by) * 37;
        this.bvy *= -0.15;
      }
    }
  }

  /** Free ball: gravity, bounce and grass friction. */
  private rollFree() {
    {
      if (this.bz > BALL_R + 0.01 || this.bvz > 0) {
        this.bvz -= 9.81 * DT;
        this.bz += this.bvz * DT;
        if (this.bz < BALL_R) {
          this.bz = BALL_R;
          this.bvz = Math.abs(this.bvz) > 1.2 ? -this.bvz * 0.45 : 0;
          this.bvx *= 0.8;
          this.bvy *= 0.8;
        }
        this.bvx *= Math.exp(-0.15 * DT);
        this.bvy *= Math.exp(-0.15 * DT);
      } else {
        this.bvx *= Math.exp(-0.9 * DT);
        this.bvy *= Math.exp(-0.9 * DT);
      }
      this.bx += this.bvx * DT;
      this.by += this.bvy * DT;
    }
  }

  private place(x: number, y: number, z = BALL_R) {
    this.bx = x;
    this.by = y;
    this.bz = z;
    this.bvx = this.bvy = this.bvz = 0;
    this.flight = null;
    this.loose = false;
    this.owner = -1;
  }

  private record() {
    const o = this.n * 47;
    if (o + 47 > this.rec.length) return;
    for (let i = 0; i < 22; i++) {
      this.rec[o + i * 2] = this.px[i];
      this.rec[o + i * 2 + 1] = this.py[i];
    }
    this.rec[o + 44] = this.bx;
    this.rec[o + 45] = this.by;
    this.rec[o + 46] = this.bz;
  }

  // =====================================================================
  // ball control
  // =====================================================================

  /** True while a receiver is still running onto a ball that has arrived ahead of him. */
  private receiving = false;
  private pendingTouch: ActKind | null = null;
  /** The keeper has the ball in his hands. */
  private inHands = false;

  private touchKind(k: ActKind): ActKind {
    if (k !== 'trap') return k;
    return this.bz > 1.7 ? 'header' : this.bz > 0.9 ? 'chest' : 'trap';
  }

  /**
   * `i` takes the ball. If it arrived a step ahead of him he runs onto it, and
   * the first touch (`touch`) happens when he actually reaches it.
   */
  private give(i: number, touch: ActKind | null = 'trap') {
    const side = this.sideOf(i);
    if (side !== this.poss) this.lastPass = null;
    this.poss = side;
    this.owner = i;
    this.ownerSince = this.t;
    this.loose = false;
    this.flight = null;
    this.lastTouch = side;
    this.chase = [];
    this.landing = null;
    this.boxRun = [];
    // First touch: better technique and less pressure → ready sooner.
    const press = this.nearest((1 - side) as Side, this.bx, this.by).d;
    const settle = 0.25 + (1 - this.a(i, 'ballControl') / 100) * 0.45 + (press < 3 ? 0.1 : 0.25) + this.rng.range(0, 0.35);
    this.decideAt = this.t + (this.role(i) === 'GK' ? this.rng.range(1.2, 3) : settle);
    this.setCarry(i, 6);
    this.lastEvX = this.bx;
    this.lastEvY = this.by;
    this.inHands = this.role(i) === 'GK' && touch === 'catch';
    if (this.dist(i, this.bx, this.by) > 0.85 && !this.inHands) {
      this.receiving = true;
      this.pendingTouch = touch;
      this.decideAt = Math.max(this.decideAt, this.t + 0.4);
    } else {
      this.receiving = false;
      if (touch) this.act(i, this.touchKind(touch));
    }
  }

  /** Points the man on the ball at the most open space ahead of him. */
  private setCarry(i: number, len: number) {
    const side = this.sideOf(i);
    const D = (1 - side) as Side;
    const d = this.dir(side);
    let best = 0;
    let bs = -Infinity;
    const yBias = -this.by / 34;
    // In the final third, wide players cut inside toward goal.
    const f = this.fr(this.px[i], this.py[i], side);
    const inside = f.u > 0.68 ? -Math.sign(f.v) * Math.min(1, Math.abs(f.v) * 1.5) * this.dir(side) : 0;
    for (let k = -3; k <= 3; k++) {
      const ang = k * 0.38 + this.rng.range(-0.1, 0.1);
      const x = this.px[i] + Math.cos(ang) * len * d;
      const y = this.py[i] + Math.sin(ang) * len + yBias * 1.5;
      if (Math.abs(y) > 32 || Math.abs(x) > 51) continue;
      const space = Math.min(10, this.nearest(D, x, y).d);
      const s = space - Math.abs(k) * 0.6 + inside * Math.sin(ang) * d * 2.5;
      if (s > bs) {
        bs = s;
        best = ang;
      }
    }
    this.carryX = clamp(this.px[i] + Math.cos(best) * len * d, -51, 51);
    this.carryY = clamp(this.py[i] + Math.sin(best) * len, -32, 32);
  }

  /** The man on the ball: keep going, or play. */
  private onBall() {
    const h = this.owner;
    const side = this.sideOf(h);
    const D = (1 - side) as Side;
    // Keep the carry going (a receiver is still running onto the ball).
    if (!this.receiving && this.dist(h, this.carryX, this.carryY) < 2.5) this.setCarry(h, 6);
    const press = this.nearest(D, this.bx, this.by);
    // A defender who gets tight can win it before the attacker plays.
    if (this.role(h) !== 'GK' && press.d < 1.4 && this.t - this.ownerSince > 0.45 && this.busy[press.idx] <= this.t) {
      const pressK = this.tactics[D].pressing === 'high' ? 1.25 : this.tactics[D].pressing === 'low' ? 0.8 : 1;
      if (this.rng.chance(DT * 0.2 * pressK * (0.6 + this.a(press.idx, 'tackling') / 100))) {
        this.duel(press.idx, false);
        return;
      }
    }
    if (this.receiving || this.t < this.decideAt || this.busy[h] > this.t) return;
    const tac = this.tactics[side];
    let mean = press.d < 2.5 ? 0.45 : press.d < 6 ? 0.9 : 1.7;
    if (tac.tempo === 'direct') mean *= 0.8;
    if (tac.tempo === 'patient') mean *= 1.25;
    if (this.role(h) === 'GK') mean = 0.3;
    if (!this.rng.chance(DT / mean)) return;
    this.decide(press);
  }

  private decide(press: { idx: number; d: number }) {
    const h = this.owner;
    const side = this.sideOf(h);
    const role = this.role(h);
    const tac = this.tactics[side];
    // A carry that covered ground gets its own line in the log.
    if (hyp(this.bx - this.lastEvX, this.by - this.lastEvY) > 12) this.emit('carry', side, this.bx, this.by, { p: h });
    if (role === 'GK') {
      this.pass(true);
      return;
    }
    const b = this.fr(this.bx, this.by, side);
    const u = b.u;
    const cv = Math.abs(b.v);
    const inBox = u > 0.84 && cv < 0.42;
    const ment = tac.mentality === 'attacking' ? 1.05 : tac.mentality === 'defensive' ? 0.96 : 1;
    const shootQ = (this.a(h, 'shooting') + this.a(h, 'finishing')) / 200;
    let shootW = 0;
    if (u > 0.72) {
      // How much of the goal he can see, and whether there's a body in the way.
      const gx = this.dir(side) * GOAL_X;
      const dx = Math.abs(gx - this.bx);
      const view = Math.abs(Math.atan2(GOAL_HALF - this.by, dx) - Math.atan2(-GOAL_HALF - this.by, dx));
      const lane = this.laneGap((1 - side) as Side, this.bx, this.by, gx, clamp(-this.by * 0.3, -2.5, 2.5));
      shootW = (u - 0.72) * 0.75 * clamp(view / 0.45, 0.12, 1.4) * (lane < 0.8 ? 0.55 : lane > 2.5 ? 1.15 : 1) * (0.5 + shootQ) * ment;
    }
    if (inBox) shootW *= 2.3;
    if (role === 'CB' || role === 'DM') shootW *= 0.5;

    const widthK = tac.width === 'wide' ? 1.5 : tac.width === 'narrow' ? 0.6 : 1;
    const crossW = u > 0.72 && cv > 0.42 ? (0.25 + this.a(h, 'crossing') / 140) * widthK : 0;

    const flair = role === 'WG' || role === 'AM' || role === 'ST' ? 1 : role === 'CB' ? 0.25 : 0.55;
    const dribbleW = press.d < 3.5 ? (0.25 + this.a(h, 'dribbling') / 110) * flair : 0;
    const carryW = press.d >= 3.5 ? 0.55 + (press.d > 10 ? 0.6 : 0) : 0;
    const passW = 2.3 + (tac.tempo === 'patient' ? 0.5 : 0);

    const choice = this.rng.weighted([shootW, crossW, dribbleW, carryW, passW]);
    if (choice === 0) this.shoot(false);
    else if (choice === 1) this.cross(false, false);
    else if (choice === 2) this.duel(press.idx, true);
    else if (choice === 3) {
      this.setCarry(h, 8 + Math.min(8, press.d * 0.6));
      this.decideAt = this.t + this.rng.range(0.8, 1.8);
    } else this.pass(false);
  }

  // =====================================================================
  // actions
  // =====================================================================

  private launch(kind: Flight['kind'], x1: number, y1: number, T: number, apex: number, z1: number, done: () => void, curl = 0) {
    this.flight = { t0: this.t, T: Math.max(0.25, T), x0: this.bx, y0: this.by, z0: this.bz, x1, y1, z1, apex, kind, curl, done };
    this.owner = -1;
    this.receiving = false;
    this.inHands = false;
    this.loose = false;
  }

  private pass(fromKeeper: boolean, kind: 'pass' | 'throw' = 'pass') {
    const side = this.poss;
    const D = (1 - side) as Side;
    const h = this.owner;
    const tac = this.tactics[side];
    const oppTac = this.tactics[D];
    const fwd = (tac.tempo === 'direct' ? 1.7 : tac.tempo === 'patient' ? 0.75 : 1.15) * (tac.mentality === 'attacking' ? 1.08 : tac.mentality === 'defensive' ? 0.92 : 1);
    const ball = this.fr(this.bx, this.by, side);
    // Offside line: the second-last defender, or the ball, or halfway.
    const defUs = this.active(D).map((i) => this.fr(this.px[i], this.py[i], side).u).sort((a, b) => b - a);
    const line = Math.max(ball.u, 0.5, defUs[1] ?? 0.5);

    const cands: number[] = [];
    const weights: number[] = [];
    for (const j of this.active(side)) {
      if (j === h) continue;
      const pj = this.fr(this.px[j], this.py[j], side);
      const d = hyp(this.px[j] - this.bx, this.py[j] - this.by);
      if (d < 5) continue;
      if (kind === 'throw' && d > 28) continue;
      const gain = pj.u - ball.u;
      const open = this.nearest(D, this.px[j], this.py[j]).d;
      const lane = this.laneGap(D, this.bx, this.by, this.px[j], this.py[j]);
      let w = 1 + gain * fwd * 4.5 - (d > 30 ? (d - 30) / 22 : 0);
      w *= 0.35 + Math.min(open, 10) / 10;
      w *= clamp(lane / 2.5, 0.2, 1);
      if (pj.u > line + 0.005 && pj.u > 0.5) w *= 0.05; // offside: almost never picked
      if (fromKeeper && this.role(j) === 'ST') w *= 1 + this.a(h, 'distribution') / 100;
      if (j === this.runner[side]) w *= 1.6;
      cands.push(j);
      weights.push(Math.max(0.03, w) ** 2);
    }
    if (!cands.length) {
      this.setCarry(h, 8);
      this.decideAt = this.t + 1;
      return;
    }
    const to = cands[this.rng.weighted(weights)];
    const toRole = this.role(to);
    const pTo = this.fr(this.px[to], this.py[to], side);
    const offside = pTo.u > line + 0.005 && pTo.u > 0.5;
    const through = !fromKeeper && kind === 'pass' && (toRole === 'ST' || toRole === 'WG' || toRole === 'AM') && pTo.u - ball.u > 0.08 && ball.u > 0.45 && (to === this.runner[side] || this.rng.chance(0.35));

    // Where the ball is played: ahead of a runner into space, or to feet a step ahead of him.
    let tgt: { x: number; y: number };
    if (through) {
      const ahead = this.abs({ u: clamp(Math.max(pTo.u, line) + 0.075, 0, 0.965), v: clamp(pTo.v, -0.85, 0.85) }, side);
      tgt = ahead;
    } else {
      const lead = 0.5;
      tgt = { x: this.px[to] + this.vx[to] * lead, y: this.py[to] + this.vy[to] * lead };
    }
    const d = hyp(tgt.x - this.bx, tgt.y - this.by);
    const long = d > 32 || (fromKeeper && d > 25);

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
    const def = this.nearest(D, tgt.x, tgt.y);
    const dq = through
      ? this.mix(def.idx, { defPositioning: 3, pace: 2, interception: 2, acceleration: 1 })
      : this.mix(def.idx, { interception: 4, defPositioning: 3, marking: 2 });
    const pressK = oppTac.pressing === 'high' ? 0.05 * (1 - ball.u) + 0.015 : oppTac.pressing === 'low' ? -0.012 : 0;
    const tempoK = tac.tempo === 'direct' ? -0.03 : tac.tempo === 'patient' ? 0.025 : 0;
    let p = base + (q - dq) * 0.0024 + (Math.min(def.d, 12) - 5) * 0.012 - pressK + tempoK - (d > 40 ? (d - 40) * 0.004 : 0);
    if (through && oppTac.mentality === 'attacking') p += 0.09;
    if (through && oppTac.mentality === 'defensive') p -= 0.08;
    if (tac.mentality === 'attacking') p -= 0.015;
    if (tac.mentality === 'defensive') p += 0.01;
    p = clamp(p, 0.15, 0.97);

    const lofted = long || fromKeeper || (through && this.laneGap(D, this.bx, this.by, tgt.x, tgt.y) < 1.5);
    const z = lofted ? r1(clamp(d / 6, 2, 9)) : undefined;
    const o = fromKeeper ? 'gk' : through ? 'through' : long ? 'long' : 'short';
    const speed = lofted ? 17 + d * 0.12 : 11 + d * 0.22 + this.a(h, 'passing') * 0.03;
    const T = d / speed + (lofted ? 0.5 : 0.1);
    const kicker = h;
    const gkHands = this.role(h) === 'GK' && this.inHands;
    const kickAct: ActKind = kind === 'throw'
      ? 'throwIn'
      : this.role(h) === 'GK'
        ? gkHands ? (d < 32 ? 'keeperThrow' : 'keeperKick') : lofted ? 'keeperKick' : 'pass'
        : lofted ? (d > 30 ? 'cross' : 'chip') : 'pass';
    this.act(kicker, kickAct);
    this.lastTouch = side;

    if (this.rng.chance(p)) {
      const mistimed = through && this.rng.chance(0.08 * (oppTac.mentality === 'attacking' || oppTac.pressing === 'high' ? 1.5 : 1));
      this.passInfo = { to, x: tgt.x, y: tgt.y, cross: false };
      // Played so he can get there: the ball and the runner arrive together.
      this.launch(lofted ? 'air' : 'ground', tgt.x, tgt.y, Math.max(T, this.reach(to, tgt.x, tgt.y)), lofted ? (z ?? 2) : 0, BALL_R, () => {
        if (offside || mistimed) {
          this.emit('pass', side, this.bx, this.by, { p: kicker, q: to, z, o });
          this.t += 0.6;
          this.emit('offside', side, this.bx, this.by, { p: to });
          this.t -= 0.6;
          const taker = this.bestOf(D, (i) => (this.role(i) === 'CB' ? 100 : 0) + this.a(i, 'passing'));
          const at = { x: this.bx, y: this.by };
          this.loose = true;
          this.bvx *= 0.5;
          this.bvy *= 0.5;
          this.deadBall({ k: 'freekick', x: at.x, y: at.y, s: D, p: taker }, this.rng.range(10, 18), () => this.pass(false));
          return;
        }
        this.emit('pass', side, this.bx, this.by, { p: kicker, q: to, z, o, hl: through && this.fr(this.bx, this.by, side).u > 0.8 ? 1 : undefined });
        this.lastPass = { from: kicker, t: this.t };
        this.give(to);
      });
      return;
    }

    // Failed: out of play down the flank / over the line, or picked off.
    const cvT = Math.abs(this.fr(tgt.x, tgt.y, side).v);
    const outWide = this.rng.chance(cvT > 0.62 ? 0.24 + (cvT - 0.62) * 1.1 : long ? 0.06 : 0.02);
    const outLong = (long || through) && this.fr(tgt.x, tgt.y, side).u > 0.9 && this.rng.chance(0.4);
    if (outWide || outLong) {
      const tf = this.fr(tgt.x, tgt.y, side);
      const at = outWide
        ? this.abs({ u: clamp(tf.u, 0.03, 0.97), v: Math.sign(tf.v || (this.rng.chance(0.5) ? 1 : -1)) * 1.03 }, side)
        : this.abs({ u: 1.03, v: clamp(tf.v, -0.9, 0.9) }, side);
      this.launch(lofted ? 'air' : 'ground', at.x, at.y, T * 1.1, lofted ? (z ?? 2) : 0, BALL_R, () => {
        this.emit('pass', side, this.bx, this.by, { p: kicker, q: to, z, o: o + '-out' });
        this.loose = true;
        this.outOfPlay(true);
      });
      return;
    }
    // Interception: the defender best placed to step into the lane.
    const icp = this.interceptor(D, tgt.x, tgt.y);
    const k = icp.k;
    const ix = this.bx + (tgt.x - this.bx) * k;
    const iy = this.by + (tgt.y - this.by) * k;
    this.passInfo = null;
    this.chase = [icp.idx];
    this.landing = { x: ix, y: iy };
    this.launch(lofted ? 'air' : 'ground', ix, iy, Math.max(T * k, this.reach(icp.idx, ix, iy)), lofted ? (z ?? 2) * 0.9 : 0, lofted ? 0.9 : BALL_R, () => {
      this.emit('intercept', D, this.bx, this.by, { p: icp.idx, q: kicker, z: z ? r1(z * 0.6) : undefined });
      this.give(icp.idx, lofted ? 'header' : 'trap');
    });
  }

  /** Smallest distance from an opponent to the passing lane (ignoring the ends). */
  private laneGap(D: Side, x0: number, y0: number, x1: number, y1: number): number {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const L2 = dx * dx + dy * dy || 1;
    let best = 99;
    for (const i of this.active(D)) {
      const k = ((this.px[i] - x0) * dx + (this.py[i] - y0) * dy) / L2;
      if (k < 0.12 || k > 0.92) continue;
      const d = hyp(this.px[i] - (x0 + dx * k), this.py[i] - (y0 + dy * k));
      if (d < best) best = d;
    }
    return best;
  }

  /** Who cuts out a pass from the ball to (x, y), and how far along it. */
  private interceptor(D: Side, x: number, y: number): { idx: number; k: number } {
    const dx = x - this.bx;
    const dy = y - this.by;
    const L2 = dx * dx + dy * dy || 1;
    let best = -1;
    let bs = Infinity;
    let bk = 0.8;
    for (const i of this.active(D)) {
      const k = clamp(((this.px[i] - this.bx) * dx + (this.py[i] - this.by) * dy) / L2, 0.3, 0.95);
      const d = hyp(this.px[i] - (this.bx + dx * k), this.py[i] - (this.by + dy * k));
      const s = d - this.a(i, 'interception') * 0.03 + this.rng.range(0, 2);
      if (s < bs) {
        bs = s;
        best = i;
        bk = k;
      }
    }
    return { idx: best, k: bk };
  }

  /** Dribble (attacker takes him on) or tackle (defender steps in): one duel. */
  private duel(defender: number, attackerStarted: boolean) {
    const side = this.poss;
    const D = (1 - side) as Side;
    const h = this.owner;
    if (defender < 0 || h < 0) return;
    const att = this.mix(h, { dribbling: 4, ballControl: 2, acceleration: 2, pace: 1 });
    const def = this.mix(defender, { tackling: 4, defPositioning: 2, strength: 1.5, pace: 1, acceleration: 1 });
    const p = clamp(0.5 + (att - def) * 0.004 + (attackerStarted ? 0 : 0.08), 0.2, 0.85);
    if (this.rng.chance(p)) {
      // Beaten: the defender is left on his heels, the attacker bursts past.
      this.busy[defender] = this.t + this.rng.range(0.8, 1.4);
      this.act(defender, 'tackle');
      const d = this.dir(side);
      const sideStep = (this.py[defender] > this.py[h] ? -1 : 1) * this.rng.range(2, 4);
      this.carryX = clamp(this.px[h] + d * this.rng.range(6, 10), -51, 51);
      this.carryY = clamp(this.py[h] + sideStep, -32, 32);
      this.decideAt = this.t + this.rng.range(0.6, 1.2);
      if (attackerStarted || this.rng.chance(0.5)) {
        const danger = this.fr(this.bx, this.by, side).u > 0.75;
        this.emit('dribble', side, this.bx, this.by, { p: h, q: defender, o: 'beat', hl: danger ? 1 : undefined });
      }
      return;
    }
    const slide = this.rng.chance(0.3);
    this.act(defender, slide ? 'slide' : 'tackle');
    if (slide) this.busy[defender] = this.t + 1.3;
    const oppTac = this.tactics[D];
    const foulP = 0.2 * (oppTac.pressing === 'high' ? 1.3 : oppTac.pressing === 'low' ? 0.8 : 1) * (1 + (60 - this.a(defender, 'tackling')) / 120) * (slide ? 1.4 : 1);
    // Defenders are far more careful inside their own box.
    const inBox = this.fr(this.bx, this.by, side).u > 0.84 && Math.abs(this.fr(this.bx, this.by, side).v) < 0.42;
    if (this.rng.chance(foulP * (inBox ? 0.06 : 1))) {
      this.act(h, 'fall');
      this.acts.push([r1(this.t + 1.3), h, 'getUp', 0]);
      this.busy[h] = this.t + 1.6;
      this.foul(defender, h);
      return;
    }
    this.emit('tackle', D, this.bx, this.by, { p: defender, q: h });
    this.busy[h] = this.t + 0.5;
    this.lastTouch = D;
    if (Math.abs(this.by) > 27 && this.rng.chance(0.45)) {
      // Nicked off his toes and over the touchline.
      this.owner = -1;
      this.loose = true;
      this.bvx = 0;
      this.bvy = Math.sign(this.by) * 9;
      return;
    }
    if (this.rng.chance(0.3)) {
      // Poked loose: a scramble for it.
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(3, 8);
      this.owner = -1;
      this.loose = true;
      this.bvx = Math.cos(a) * sp;
      this.bvy = Math.sin(a) * sp;
      this.bvz = 0;
      this.startScramble();
      return;
    }
    this.give(defender, null);
  }

  private foul(offender: number, victim: number) {
    const side = this.poss; // fouled team
    const oSide = this.sideOf(offender);
    this.emit('foul', oSide, this.bx, this.by, { p: offender, q: victim });
    const at = { x: this.bx, y: this.by };
    const b = this.fr(at.x, at.y, side);
    const danger = b.u > 0.6 ? 1.5 : 1;
    if (this.rng.chance(0.004)) this.card(offender, 'red');
    else if (this.rng.chance(0.095 * danger)) {
      this.yellows[offender]++;
      this.card(offender, this.yellows[offender] >= 2 ? 'second' : 'yellow');
    }
    this.lastPass = null;
    this.owner = -1;
    this.loose = false;
    const delay = this.rng.range(12, 26);
    const cv = Math.abs(b.v);
    if (b.u > 0.84 && cv < 0.4) {
      const taker = this.bestOf(side, (i) => this.mix(i, { finishing: 3, shooting: 1, decisions: 2 }));
      const spot = this.abs({ u: 1 - 11 / 105, v: 0 }, side);
      this.deadBall({ k: 'penalty', x: spot.x, y: spot.y, s: side, p: taker }, delay + 10, () => this.shoot(false, 'penalty'), 10);
      return;
    }
    if (b.u > 0.7 && cv < 0.55 && this.rng.chance(0.45)) {
      const taker = this.bestOf(side, (i) => this.mix(i, { shooting: 3, finishing: 1, decisions: 1 }));
      this.deadBall({ k: 'freekick', o: 'direct', x: at.x, y: at.y, s: side, p: taker }, delay, () => this.shoot(false, 'freekick'));
      return;
    }
    if (b.u > 0.68) {
      const taker = this.bestOf(side, (i) => this.a(i, 'crossing'));
      this.deadBall({ k: 'freekick', o: 'cross', x: at.x, y: at.y, s: side, p: taker }, delay, () => this.cross(true, false));
      return;
    }
    this.deadBall({ k: 'freekick', x: at.x, y: at.y, s: side, p: victim }, delay * 0.6, () => this.pass(false));
  }

  private card(i: number, kind: 'yellow' | 'second' | 'red') {
    const side = this.sideOf(i);
    this.t += 1;
    if (kind !== 'yellow') this.sentOff[i] = true;
    this.emit('card', side, this.bx, this.by, { p: i, o: kind, hl: kind !== 'yellow' ? 1 : undefined });
    this.t -= 1;
    if (this.sentOff[i]) {
      // Off he goes, toward the tunnel.
      this.px[i] = 0;
      this.py[i] = -38;
      this.vx[i] = this.vy[i] = 0;
    }
  }

  private cross(setPiece: boolean, corner: boolean) {
    const side = this.poss;
    const D = (1 - side) as Side;
    const h = this.owner;
    const tgtF: Pt = { u: this.rng.range(0.88, 0.95), v: this.rng.range(-0.3, 0.3) };
    const tgt = this.abs(tgtF, side);
    const attackers = this.active(side).filter((j) => {
      if (j === h || this.role(j) === 'GK') return false;
      const p = this.fr(this.px[j], this.py[j], side);
      return p.u > 0.76 && Math.abs(p.v) < 0.55;
    });
    const quality = this.mix(h, { crossing: 4, vision: 1, decisions: 1 });
    const gk = this.gk(D);
    const claimP = this.sentOff[gk] ? 0 : clamp(0.1 + (this.a(gk, 'aerialReach') - 55) * 0.004, 0.04, 0.3);
    const z = r1(this.rng.range(3, 6));
    const d = hyp(tgt.x - this.bx, tgt.y - this.by);
    const T = d / 19 + 0.5;
    this.act(h, 'cross');
    this.lastTouch = side;
    const fly = (to: number, done: () => void) => {
      this.passInfo = to >= 0 ? { to, x: tgt.x, y: tgt.y, cross: true } : null;
      this.launch('air', tgt.x, tgt.y, to >= 0 ? Math.max(T, this.reach(to, tgt.x, tgt.y)) : T, z, to >= 0 && this.role(to) !== 'GK' ? 1.9 : 1.6, done);
    };
    const clear = (marker: number, withQ: boolean) => {
      this.chase = [marker];
      this.landing = { x: tgt.x, y: tgt.y };
      this.passInfo = null;
      this.launch('air', tgt.x, tgt.y, Math.max(T, this.reach(marker, tgt.x, tgt.y)), z, 1.9, () => {
        this.emit('cross', side, this.bx, this.by, { p: h, z, o: 'cleared', q: withQ ? marker : undefined });
        this.act(marker, 'header');
        this.lastTouch = D;
        if (this.rng.chance(withQ ? 0.14 : 0.12)) {
          this.loose = true;
          this.bvx = this.bvy = 0;
          this.outOfPlay(true, 'corner');
          return;
        }
        this.clearance(marker);
      });
    };
    if (!attackers.length || !this.rng.chance(clamp(0.4 + (quality - 55) * 0.0035 + (setPiece ? 0.08 : 0), 0.2, 0.75))) {
      // Overhit or cut out.
      if (this.rng.chance(claimP * 2)) {
        fly(gk, () => {
          this.emit('cross', side, this.bx, this.by, { p: h, z, o: 'claimed', q: gk });
          this.give(gk, 'catch');
        });
        return;
      }
      clear(this.nearestTo(D, tgt.x, tgt.y), false);
      return;
    }
    if (this.rng.chance(claimP)) {
      fly(gk, () => {
        this.emit('cross', side, this.bx, this.by, { p: h, z, o: 'claimed', q: gk });
        this.give(gk, 'catch');
      });
      return;
    }
    // Aerial duel.
    const att = attackers[this.rng.weighted(attackers.map((j) => this.mix(j, { heading: 3, offPositioning: 2, strength: 1 }) ** 2))];
    const marker = this.nearestTo(D, tgt.x, tgt.y);
    const aq = this.mix(att, { heading: 3, offPositioning: 2, strength: 1.5 });
    const dq = this.mix(marker, { heading: 3, marking: 2, strength: 1.5 });
    const p = clamp(0.36 + (aq - dq) * 0.004 + (corner ? -0.04 : 0), 0.15, 0.75);
    if (this.rng.chance(p)) {
      this.chase = [marker];
      this.landing = { x: tgt.x, y: tgt.y };
      fly(att, () => {
        this.emit('cross', side, this.bx, this.by, { p: h, q: att, z, o: 'won' });
        this.lastPass = { from: h, t: this.t };
        this.owner = att;
        this.ownerSince = this.t;
        this.shoot(true);
      });
      return;
    }
    this.boxRun = [att];
    clear(marker, true);
  }

  private nearestTo(side: Side, x: number, y: number): number {
    return this.nearest(side, x, y).idx;
  }

  /** A defender hacks it clear: into the stands, or up the pitch for a second ball. */
  private clearance(clearer: number) {
    const side = this.poss; // attacking side
    const D = (1 - side) as Side;
    this.act(clearer, this.bz > 1.2 ? 'header' : 'shot');
    this.lastTouch = D;
    if (this.rng.chance(0.2)) {
      const out = this.abs({ u: this.rng.range(0.5, 0.85), v: (this.fr(this.bx, this.by, side).v >= 0 ? 1 : -1) * (this.rng.chance(0.75) ? 1.04 : -1.04) }, side);
      const z = r1(this.rng.range(6, 14));
      const d = hyp(out.x - this.bx, out.y - this.by);
      this.launch('air', out.x, out.y, d / 20 + 0.6, z, BALL_R, () => {
        this.emit('clear', D, this.bx, this.by, { p: clearer, z });
        this.loose = true;
        this.outOfPlay(true);
      });
      return;
    }
    const landF: Pt = { u: this.rng.range(0.35, 0.62), v: clamp(this.fr(this.bx, this.by, side).v * 0.5 + this.rng.range(-0.6, 0.6), -0.9, 0.9) };
    const land = this.abs(landF, side);
    const z = r1(this.rng.range(5, 12));
    const d = hyp(land.x - this.bx, land.y - this.by);
    this.landing = land;
    this.chase = [this.nearestTo(side, land.x, land.y), this.nearestTo(D, land.x, land.y)];
    this.launch('air', land.x, land.y, d / 20 + 0.6, z, BALL_R, () => {
      this.emit('clear', D, this.bx, this.by, { p: clearer, z });
      this.loose = true;
      this.startScramble();
    });
  }

  /** The nearest player from each side goes for a loose ball. */
  private startScramble() {
    const x = this.bx + this.bvx * 0.6;
    const y = this.by + this.bvy * 0.6;
    this.landing = null;
    this.chase = [this.nearestTo(0, x, y), this.nearestTo(1, x, y)].filter((i) => i >= 0);
  }

  /** Loose ball: whoever gets there first and can control it has it. */
  private pickup() {
    if (this.bz > 1.4) return;
    let best = -1;
    let bs = Infinity;
    for (let i = 0; i < 22; i++) {
      if (this.sentOff[i] || this.busy[i] > this.t) continue;
      const d = this.dist(i, this.bx, this.by);
      const reach = this.role(i) === 'GK' && this.inOwnBox(i) ? 1.6 : 1.1;
      if (d > reach) continue;
      const s = d - this.mix(i, { ballControl: 1, strength: 1, decisions: 1 }) * 0.004 + this.rng.range(0, 0.4);
      if (s < bs) {
        bs = s;
        best = i;
      }
    }
    if (best < 0) {
      if (this.chase.length === 0 || this.n % 10 === 0) this.startScramble();
      return;
    }
    const side = this.sideOf(best);
    this.emit('carry', side, this.bx, this.by, { p: best });
    this.give(best, 'trap');
  }

  private inOwnBox(i: number) {
    const p = this.fr(this.px[i], this.py[i], this.sideOf(i));
    return p.u < 0.16 && Math.abs(p.v) < 0.6;
  }

  /**
   * A free ball that has crossed a line, or `force` for one played out on purpose:
   * award the throw-in, corner or goal kick.
   */
  private outOfPlay(force = false, award?: 'corner') {
    const outSide = Math.abs(this.by) > 34;
    const outEnd = Math.abs(this.bx) > GOAL_X;
    if (!force && !outSide && !outEnd) return;
    const x = clamp(this.bx, -52, 52);
    const y = clamp(this.by, -33.6, 33.6);
    this.loose = false;
    this.owner = -1;
    this.chase = [];
    this.landing = null;
    this.lastPass = null;
    const toward = (s: Side) => Math.sign(this.bx) === this.dir(s); // ball went out at the end s attacks
    if (award === 'corner' || (!outSide && (outEnd || force) && Math.abs(this.bx) > 45)) {
      // Over the goal line: corner if the defenders put it out, otherwise a goal kick.
      const attacker = (toward(0) ? 0 : 1) as Side;
      const def = (1 - attacker) as Side;
      if (award === 'corner' || this.lastTouch === def) {
        this.corner(attacker);
        return;
      }
      this.goalKick(def);
      return;
    }
    const thrower = (1 - this.lastTouch) as Side;
    const spot = { x: clamp(x, -50, 50), y: Math.sign(y || 1) * 34 };
    const f = this.fr(spot.x, spot.y, thrower);
    const roles = f.u < 0.4 ? ['FB', 'CB'] : ['FB', 'WG', 'CM'];
    const taker = this.pickNear(thrower, roles, spot.x, spot.y);
    this.deadBall({ k: 'throwin', x: spot.x, y: spot.y, s: thrower, p: taker }, this.rng.range(8, 15), () => {
      this.owner = taker;
      this.pass(false, 'throw');
    });
  }

  private pickNear(side: Side, roles: string[], x: number, y: number): number {
    const cands = this.active(side).filter((i) => roles.includes(this.role(i)));
    const pool = cands.length ? cands : this.active(side).filter((i) => i !== this.gk(side));
    let best = pool[0];
    let bs = Infinity;
    for (const i of pool) {
      const s = this.dist(i, x, y) + this.rng.next() * 6;
      if (s < bs) {
        bs = s;
        best = i;
      }
    }
    return best;
  }

  private goalKick(side: Side) {
    const spot = this.abs({ u: 0.05, v: this.rng.range(-0.2, 0.2) }, side);
    const gk = this.gk(side);
    const taker = this.sentOff[gk] ? this.bestOf(side, (i) => this.a(i, 'passing')) : gk;
    this.deadBall({ k: 'goalkick', x: spot.x, y: spot.y, s: side, p: taker }, this.rng.range(10, 18), () => {
      this.owner = taker;
      this.pass(true);
    });
  }

  private corner(side: Side) {
    const v = this.fr(this.bx, this.by, side).v >= 0 ? 1 : -1;
    const spot = this.abs({ u: 0.995, v: v * 0.99 }, side);
    const taker = this.bestOf(side, (i) => this.a(i, 'crossing'));
    this.deadBall({ k: 'corner', x: spot.x, y: spot.y, s: side, p: taker }, this.rng.range(15, 28), () => {
      this.owner = taker;
      this.cross(true, true);
    });
  }

  /** The ball is dead: players take up the restart shape, then the taker plays it. */
  private deadBall(r: Restart, delay: number, take: () => void, announceBefore = 0) {
    this.phase = 'dead';
    this.owner = -1;
    this.flight = null;
    this.passInfo = null;
    this.chase = [];
    this.landing = null;
    this.boxRun = [];
    this.runner = [-1, -1];
    const at = this.t + delay;
    this.restart = {
      ...r,
      at,
      announceAt: at - announceBefore,
      announced: false,
      take: () => {
        this.lastEvX = this.bx;
        this.lastEvY = this.by;
        if (r.p >= 0) {
          this.owner = r.p;
          this.ownerSince = this.t;
        }
        take();
      },
    };
  }

  private shoot(header: boolean, setPiece?: 'freekick' | 'penalty') {
    const side = this.poss;
    const D = (1 - side) as Side;
    const h = this.owner;
    const gk = this.gk(D);
    const gx = this.dir(side) * GOAL_X;
    const d = Math.max(3, hyp(gx - this.bx, this.by));
    const lateral = Math.abs(this.by);
    let xg = 0.85 * Math.exp(-d / 8) * (1 - 0.55 * Math.min(1, lateral / (d + 2)));
    if (header) xg *= 0.42;
    if (setPiece === 'penalty') xg = 0.76;
    if (setPiece === 'freekick') xg = Math.min(xg, 0.07);
    const press = this.nearest(D, this.bx, this.by, gk).d;
    if (!setPiece) xg *= clamp(0.6 + press / 6, 0.6, 1.15);
    const dTac = this.tactics[D];
    if (!setPiece && dTac.mentality === 'defensive') xg *= 0.82;
    if (!setPiece && dTac.mentality === 'attacking') xg *= 1.3;
    if (!setPiece && dTac.pressing === 'low') xg *= 0.86;
    if (this.sentOff[gk]) xg = Math.min(0.95, xg * 1.8);

    const sq = header
      ? this.mix(h, { heading: 4, offPositioning: 2, strength: 1 })
      : d > 18 || setPiece === 'freekick'
        ? this.mix(h, { shooting: 4, finishing: 2, decisions: 1 })
        : this.mix(h, { finishing: 4, shooting: 2, decisions: 1, ...(d < 12 ? { offPositioning: 1 } : {}) });
    const kq = this.sentOff[gk]
      ? 20
      : header
        ? this.mix(gk, { aerialReach: 3, reflexes: 2, gkPositioning: 2 })
        : d < 12
          ? this.mix(gk, { oneOnOne: 3, reflexes: 3, gkPositioning: 2 })
          : this.mix(gk, { reflexes: 3, gkPositioning: 3, oneOnOne: 1 });
    const pGoal = clamp(xg * Math.exp((sq - kq) / 70), 0.01, 0.9);
    const assist = this.lastPass && this.sideOf(this.lastPass.from) === side && this.t - this.lastPass.t < 15 ? this.lastPass.from : -1;
    const xgR = Math.round(xg * 100) / 100;
    const o = header ? 'header' : setPiece ?? (d > 20 ? 'long' : 'close');
    this.act(h, header ? 'header' : 'shot');
    this.lastTouch = side;

    // ---- What kind of strike, where he's aiming, and how it flies ----
    const gkY = this.py[gk];
    const near = Math.sign(this.by) || (this.rng.chance(0.5) ? 1 : -1);
    const keeperOut = !this.sentOff[gk] && Math.abs(this.px[gk] - gx) > 4 && this.dist(gk, this.bx, this.by) < 9;
    type Style = 'header' | 'pen' | 'fk' | 'placed' | 'drive' | 'curler' | 'chip';
    let style: Style;
    if (header) style = 'header';
    else if (setPiece === 'penalty') style = 'pen';
    else if (setPiece === 'freekick') style = 'fk';
    else if (keeperOut && d < 16 && this.rng.chance(0.3)) style = 'chip';
    else if (d < 11) style = this.rng.chance(0.72) ? 'placed' : 'drive';
    else if (d < 20) style = (['placed', 'curler', 'drive'] as const)[this.rng.weighted([0.3, 0.35 + this.a(h, 'shooting') / 300, 0.35])];
    else style = this.rng.chance(0.38 + this.a(h, 'shooting') / 400) ? 'curler' : 'drive';
    const shotPow = this.a(h, 'shooting');
    const speed =
      style === 'header' ? this.rng.range(10, 14)
      : style === 'pen' ? this.rng.range(20, 26)
      : style === 'fk' ? this.rng.range(21, 25)
      : style === 'chip' ? this.rng.range(11, 13.5)
      : style === 'placed' ? this.rng.range(16, 21) + shotPow * 0.02
      : style === 'curler' ? this.rng.range(20, 24) + shotPow * 0.02
      : this.rng.range(24, 29) + shotPow * 0.04;
    // Corner he goes for: across the keeper to the far post, or beat him at his near post.
    let aimSide: number;
    if (style === 'pen' || style === 'chip') aimSide = this.rng.chance(0.5) ? 1 : -1;
    else if (style === 'drive') aimSide = Math.abs(gkY) > 0.4 && this.rng.chance(0.7) ? -Math.sign(gkY) : this.rng.chance(0.5) ? 1 : -1;
    else aimSide = this.rng.chance(style === 'curler' || style === 'fk' ? 0.75 : 0.62) ? -near : near;
    const aimY = aimSide * (style === 'drive' ? this.rng.range(1.4, 3.2) : this.rng.range(2.4, 3.3));
    const aimZ =
      style === 'header' ? this.rng.range(0.2, 1.3)
      : style === 'chip' ? this.rng.range(1.2, 2.2)
      : style === 'fk' ? this.rng.range(1.3, 2.3)
      : style === 'curler' ? (this.rng.chance(0.6) ? this.rng.range(1.5, 2.3) : this.rng.range(0.3, 1))
      : style === 'placed' ? (this.rng.chance(0.75) ? this.rng.range(0.12, 0.55) : this.rng.range(1.4, 2.2))
      : this.rng.range(0.25, 2.2);
    // Bend: curlers and free kicks start outside the target and swing in.
    const bendMag =
      style === 'curler' || style === 'fk' ? this.rng.range(1.1, 2.2) * (d / 20)
      : style === 'placed' ? this.rng.range(0.15, 0.5)
      : style === 'drive' ? this.rng.range(-0.25, 0.25)
      : 0;
    const fly = (x: number, y: number, z1: number, done: () => void) => {
      const dd = hyp(x - this.bx, y - this.by);
      const T = dd / speed;
      // Gravity sets how much a struck ball rises and dips over its flight time;
      // low finishes are kept down, curlers and chips get more arc.
      const lift = style === 'header' ? 0.15 : style === 'chip' ? 2 : style === 'fk' || style === 'curler' ? 1.15 : z1 < 0.6 ? 0.35 : 0.85;
      const apex = (9.81 * T * T) / 8 * lift;
      const curl = Math.sign(y || 1) * this.dir(side) * bendMag;
      this.launch('shot', x, y, T, apex, z1, done, curl);
    };
    const flightT = (y: number) => hyp(gx - this.bx, y - this.by) / speed;
    const keeperGoes = (y: number, z: number, save: boolean, wrongWay = false) => {
      if (this.sentOff[gk]) return;
      const dy = y - this.py[gk];
      // Times the dive to meet the ball (later for a near-post reaction save).
      const tAt = this.t + Math.max(0.1, flightT(y) - 0.4);
      // Local side for the figure: +1 is the keeper's own left as he faces the play.
      let sideSign = -Math.sign(dy || 1) * this.dir(D);
      if (wrongWay) sideSign = -sideSign;
      if (Math.abs(dy) > 0.8 || z > 1.9 || wrongWay) this.acts.push([r1(tAt), gk, 'dive', sideSign]);
      else if (save) this.acts.push([r1(tAt + 0.2), gk, 'catch', 0]);
    };

    const blockP = (setPiece === 'penalty' ? 0 : setPiece === 'freekick' ? 0.25 : d > 13 ? 0.22 : 0.1) * (dTac.mentality === 'defensive' && !setPiece ? 1.35 : 1);
    const r = this.rng.next();
    if (r < blockP) {
      const blocker = this.nearestTo(D, this.bx + (gx - this.bx) * 0.15, this.by * 0.85);
      const bx = this.bx + (gx - this.bx) * clamp(1.5 / d, 0.05, 0.3);
      const by = this.by + (aimY - this.by) * clamp(1.5 / d, 0.05, 0.3);
      this.chase = [blocker];
      this.landing = { x: bx, y: by };
      fly(bx, by, 0.6, () => {
        this.emit('shot', side, this.bx, this.by, { p: h, q: blocker, o: 'blocked', xg: xgR, hl: 1 });
        this.act(blocker, 'tackle');
        this.lastTouch = D;
        if (this.rng.chance(0.4)) {
          this.loose = true;
          this.outOfPlay(true, 'corner');
          return;
        }
        // Ricochet.
        const a = Math.atan2(-this.bvy, -this.bvx) + this.rng.range(-1.2, 1.2);
        const sp = this.rng.range(6, 14);
        this.loose = true;
        this.bvx = Math.cos(a) * sp;
        this.bvy = Math.sin(a) * sp;
        this.bvz = this.rng.range(0, 5);
        this.startScramble();
      });
      return;
    }
    if (this.rng.next() < pGoal / (1 - blockP)) {
      // Finds the corner.
      const y = clamp(aimY + this.rng.range(-0.3, 0.3), -GOAL_HALF + 0.2, GOAL_HALF - 0.2);
      const z = r1(clamp(aimZ + this.rng.range(-0.15, 0.15), 0.12, 2.3));
      keeperGoes(y, z, false, style === 'pen' && this.rng.chance(0.4));
      fly(gx + this.dir(side) * 0.8, y, z, () => {
        this.score[side]++;
        this.emit('shot', side, this.bx, this.by, { p: h, q: gk, o: 'goal', xg: xgR, z, hl: 1 });
        this.emit('goal', side, this.bx, this.by, { p: h, q: assist >= 0 ? assist : undefined, sc: [...this.score] as [number, number], o, hl: 1 });
        // Into the net: the ball keeps going and drops in the goal.
        this.celebrate(h, D);
      });
      return;
    }
    const onTargetP = clamp(0.36 + (sq - 55) * 0.005, 0.2, 0.6);
    if (this.rng.chance(onTargetP)) {
      // On target, but close enough to the keeper for him to get there.
      const parry = this.rng.chance(style === 'drive' || style === 'curler' ? 0.45 : 0.3);
      const y = clamp(gkY + (aimY - gkY) * this.rng.range(0.15, 0.8), -GOAL_HALF + 0.3, GOAL_HALF - 0.3);
      const z = r1(clamp(aimZ, 0.2, 2.1));
      keeperGoes(y, z, !parry);
      fly(gx - this.dir(side) * 0.6, y, z, () => {
        this.emit('shot', side, this.bx, this.by, { p: h, q: gk, o: parry ? 'parried' : 'saved', xg: xgR, z, hl: 1 });
        this.lastTouch = D;
        if (parry) {
          this.loose = true;
          this.outOfPlay(true, 'corner');
          return;
        }
        this.give(gk, null);
        this.inHands = true;
        this.receiving = false;
        this.decideAt = this.t + this.rng.range(4, 8);
      });
      return;
    }
    // Off target: dragged wide of the post he aimed for, or over the bar.
    const post = this.rng.chance(0.06);
    const overP = style === 'drive' ? 0.5 : style === 'curler' || style === 'fk' ? 0.45 : style === 'header' || style === 'chip' ? 0.4 : 0.25;
    const over = !post && this.rng.chance(overP);
    let y: number;
    let z: number;
    if (post) {
      const bar = this.rng.chance(0.3);
      y = bar ? clamp(aimY, -3.2, 3.2) : Math.sign(aimY) * GOAL_HALF;
      z = bar ? 2.44 : r1(this.rng.range(0.3, 2.2));
    } else if (over) {
      y = aimY + this.rng.range(-0.8, 0.8);
      z = r1(2.6 + this.rng.range(0, 0.6 + d / 25));
    } else {
      y = Math.sign(aimY) * (GOAL_HALF + 0.25 + this.rng.range(0, 0.6 + d / 10));
      z = r1(clamp(aimZ + this.rng.range(-0.3, 0.3), 0.15, 2.4));
    }
    keeperGoes(clamp(y, -3.5, 3.5), Math.min(z, 2.4), false);
    fly(gx + this.dir(side) * (post ? 0 : 1.5), y, z, () => {
      this.emit('shot', side, this.bx, this.by, { p: h, o: post ? 'post' : 'wide', xg: xgR, z, hl: 1 });
      this.lastTouch = side;
      this.goalKick(D);
    });
  }

  private celebrate(scorer: number, kickoffSide: Side) {
    this.phase = 'celebrate';
    this.celebrating = scorer;
    this.owner = -1;
    this.loose = false;
    this.chase = [];
    this.landing = null;
    this.runner = [-1, -1];
    const party = this.rng.range(16, 24);
    const total = this.rng.range(45, 70);
    const t0 = this.t;
    // The party, then everyone walks back for the restart.
    this.pendingParty = {
      until: t0 + party,
      then: () => {
        this.celebrating = -1;
        this.kickoffSetup(kickoffSide, false, t0 + total);
      },
    };
  }

  private pendingParty: { until: number; then: () => void } | null = null;

  /** Sets up a kickoff; `snap` puts everyone straight on their spots. */
  private kickoffSetup(side: Side, snap: boolean, at = this.t) {
    const taker = this.bestOf(side, (i) => (['ST', 'AM', 'CM'].includes(this.role(i)) ? 50 : 0) + this.slots[side][i % 11].x * 50 + this.rng.next() * 8);
    this.place(0, 0);
    this.poss = side;
    this.lastPass = null;
    this.phase = 'dead';
    this.restart = {
      k: 'kickoff',
      x: 0,
      y: 0,
      s: side,
      p: taker,
      at,
      announceAt: at,
      announced: false,
      take: () => {
        this.owner = taker;
        this.ownerSince = this.t;
        // Rolled back to a team-mate.
        const mate = this.nearest(side, -this.dir(side) * 8, 0, taker).idx;
        const tgt = { x: this.px[mate], y: this.py[mate] };
        const d = hyp(tgt.x, tgt.y);
        this.act(taker, 'pass');
        this.passInfo = { to: mate, x: tgt.x, y: tgt.y, cross: false };
        this.launch('ground', tgt.x, tgt.y, d / 11 + 0.2, 0, BALL_R, () => {
          this.give(mate);
        });
      },
    };
    if (snap) {
      this.think();
      for (let i = 0; i < 22; i++) {
        if (this.sentOff[i]) continue;
        this.px[i] = this.tx[i];
        this.py[i] = this.ty[i];
        this.vx[i] = this.vy[i] = 0;
      }
    }
  }

  // =====================================================================
  // result
  // =====================================================================

  private result(): MatchResult {
    const duration = Math.round(this.t);
    const halftimeAt = Math.round(this.halftimeAt);
    const lines: PlayerLine[] = [];
    const last = this.events.length - 1;
    for (let i = 0; i < 22; i++) lines.push(lineFromEvents(this.events, last, i).line);
    const stats: [TeamStats, TeamStats] = [emptyStats(), emptyStats()];
    for (const l of lines) {
      const s = stats[this.sideOf(l.idx)];
      s.passes += l.passes;
      s.passesDone += l.passesDone;
      s.shots += l.shots;
      s.onTarget += l.onTarget;
      s.tackles += l.tackles;
      s.saves += l.saves;
      s.yellow += l.yellow;
      s.red += l.red;
    }
    for (const e of this.events) {
      const s = stats[e.s];
      if (e.k === 'shot') s.xg += e.xg ?? 0;
      else if (e.k === 'foul') s.fouls++;
      else if (e.k === 'corner') s.corners++;
      else if (e.k === 'offside') s.offsides++;
    }
    const total = this.possTime[0] + this.possTime[1] || 1;
    stats[0].possession = Math.round((this.possTime[0] / total) * 100);
    stats[1].possession = 100 - stats[0].possession;
    stats[0].goals = this.score[0];
    stats[1].goals = this.score[1];
    for (const s of stats) s.xg = Math.round(s.xg * 100) / 100;
    for (const l of lines) {
      const side = this.sideOf(l.idx);
      l.rating = rateLine(l, this.slots[side][l.idx % 11].role, this.score[side], this.score[1 - side]);
    }
    let motm = 0;
    for (const l of lines) if (l.rating > lines[motm].rating) motm = l.idx;
    const timeline = buildTimeline(this.events, halftimeAt, duration);
    return {
      version: ENGINE_VERSION,
      seed: this.seed,
      score: this.score,
      events: this.events,
      stats,
      players: lines,
      motm,
      duration,
      halftimeAt,
      timeline,
      tracks: this.windows(timeline),
    };
  }

  /** Packs the recorded motion for every stretch the broadcast shows at true speed. */
  private windows(timeline: MatchResult['timeline']): TrackWindow[] {
    const out: TrackWindow[] = [];
    const maxN = this.n;
    for (const [g0, g1, r0, r1_] of timeline) {
      if (g1 <= g0 || (g1 - g0) / Math.max(1e-6, r1_ - r0) > 3) continue;
      const t0 = Math.max(0, g0 - 1);
      const t1 = Math.min(maxN * DT, g1 + 1);
      const step = Math.round(1 / (TRACK_HZ * DT));
      const n0 = Math.round(t0 / DT);
      const n1 = Math.round(t1 / DT);
      const p: number[] = [];
      for (let n = n0; n <= n1; n += step) for (let k = 0; k < 44; k++) p.push(this.rec[n * 47 + k]);
      const b: number[] = [];
      const bstep = Math.max(1, step / 2);
      for (let n = n0; n <= n1; n += bstep) for (let k = 44; k < 47; k++) b.push(this.rec[n * 47 + k]);
      const acts = this.acts.filter((a) => a[0] >= t0 && a[0] <= t1);
      out.push({ t0: r1(n0 * DT), t1: r1(n1 * DT), hz: TRACK_HZ, p: pack(p, 44), b: pack(b, 3), acts });
    }
    return out;
  }
}

function emptyStats(): TeamStats {
  return { goals: 0, shots: 0, onTarget: 0, xg: 0, passes: 0, passesDone: 0, possession: 50, fouls: 0, yellow: 0, red: 0, corners: 0, tackles: 0, saves: 0, offsides: 0 };
}
