// The match officials: a referee and two assistants, for the 3D match only.
// They never touch play: each frame they read where the ball and players are
// and what the event stream says happened, then move and signal like real
// officials. The referee works the diagonal, keeping play between himself and
// the assistant on that half; the assistants hold the offside line on opposite
// touchlines. Fouls, cards, penalties, offsides, goals and restarts each get the
// signal a real official gives, timed to the moment in the match.
import * as THREE from 'three';
import { randomAppearance } from '../../shared/appearance.ts';
import type { MatchEvent } from '../../shared/sim/types.ts';
import { type ActionKind, Figure, type Kit } from './figures.ts';
import { hashOf, seeded } from './rig/animator.ts';
import { B } from './rig/skeleton.ts';
import type { Frame, Playback } from './playback.ts';

const HALF_L = 52.5;
const HALF_W = 34;
/** Assistants run just outside the touchline. */
const AR_Y = HALF_W + 0.9;
/** Shirt colours an official can wear, in order of preference: the first that both teams' kits leave clear. */
const SHIRTS = ['#17191d', '#d9ef2f', '#e8508c', '#25b8ad', '#ff8a1f'];

interface Official {
  f: Figure;
  accel: THREE.Vector2;
  /** Smoothed target, so a ball pinging about never has him zig-zagging. */
  goal: THREE.Vector2;
  /** A point he turns to face until game time `faceUntil` (the way he points, the player he books). */
  faceAt: { x: number; y: number } | null;
  faceUntil: number;
}

/** One signal: who gives it, which, when its key frame lands (game time), and what it shows. */
interface Cue {
  key: string;
  who: 0 | 1 | 2;
  kind: ActionKind;
  at: number;
  face?: { x: number; y: number };
  card?: 'yellow' | 'red';
  /** Play the mirrored take (the left arm). */
  left?: boolean;
}

export interface OfficialsInput {
  fr: Frame;
  t: number;
  gameDt: number;
  realDt: number;
  rate: number;
  jumped: boolean;
  elapsed: number;
  ball: THREE.Vector3;
  camera: THREE.Camera;
}

export class Officials {
  /** 0 the referee, 1 the assistant on the near touchline (covers x > 0), 2 the far one (x < 0). */
  private crew: Official[] = [];
  private playback: Playback;
  private fired = new Set<string>();
  private card: THREE.Mesh;
  private cardFrom = Infinity;
  private cardUntil = -Infinity;
  private flags: THREE.Group[] = [];
  /** Which hand each assistant holds his flag in (switches for a left-arm signal). */
  private flagLeft = [false, false];
  private flagLeftUntil = [0, 0];
  private ballV = new THREE.Vector2();
  private lastBall = new THREE.Vector2();

  constructor(scene: THREE.Scene, playback: Playback, kits: string[], seed: number) {
    this.playback = playback;
    const shirt = SHIRTS.find((c) => kits.every((k) => !clash(c, k))) ?? SHIRTS[0];
    const kit: Kit = { primary: shirt, secondary: '#121316' };
    const rnd = seeded(seed);
    for (let i = 0; i < 3; i++) {
      const look = randomAppearance(rnd);
      look.accessory = 0;
      const f = new Figure(kit, look, false, kit, undefined, { base: false, official: true, seed: hashOf(`official${seed}:${i}`) });
      scene.add(f.root);
      const start = i === 0 ? new THREE.Vector2(0, -10) : new THREE.Vector2(0, i === 1 ? AR_Y : -AR_Y);
      f.pos.copy(start);
      this.crew.push({ f, accel: new THREE.Vector2(), goal: start.clone(), faceAt: null, faceUntil: 0 });
    }
    this.card = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.105), new THREE.MeshBasicMaterial({ color: 0xffd400, side: THREE.DoubleSide }));
    this.card.visible = false;
    scene.add(this.card);
    const flagTex = flagTexture();
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.62, 6).translate(0, 0.25, 0), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }));
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.26).translate(0.17, 0.42, 0), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 }));
      stick.castShadow = cloth.castShadow = true;
      g.add(stick, cloth);
      scene.add(g);
      this.flags.push(g);
    }
  }

  update(inp: OfficialsInput) {
    const { fr, t, gameDt, realDt, rate, jumped } = inp;
    if (jumped) this.fired.clear();
    // The ball's pace, for reading where play is heading.
    if (gameDt > 0 && !jumped) {
      const k = Math.min(1, realDt * 2);
      this.ballV.x += (((fr.ball.x - this.lastBall.x) / gameDt) - this.ballV.x) * k;
      this.ballV.y += (((fr.ball.y - this.lastBall.y) / gameDt) - this.ballV.y) * k;
    } else this.ballV.set(0, 0);
    this.lastBall.set(fr.ball.x, fr.ball.y);
    const targets = [this.refereeSpot(fr, t), this.assistantSpot(fr, t, 1), this.assistantSpot(fr, t, -1)];
    const B_ = Math.max(1, Math.pow(rate, 0.85));
    for (let i = 0; i < 3; i++) {
      const o = this.crew[i];
      const tg = targets[i];
      if (jumped) o.goal.set(tg.x, tg.y);
      else {
        // The referee reads the play and eases over; assistants have to stay right on the line.
        const k = 1 - Math.exp(-Math.max(0, gameDt) * (i === 0 ? 1.1 : 3));
        o.goal.x += (tg.x - o.goal.x) * k;
        o.goal.y += (tg.y - o.goal.y) * k;
      }
      this.steer(o, Math.max(0, gameDt), jumped, B_, i === 0 ? 7.2 : 7.8);
    }
    if (rate <= 3) this.signals(fr, t, rate);
    for (let i = 0; i < 3; i++) this.pose(this.crew[i], i, inp, B_);
    this.props(inp);
  }

  /** Where the referee wants to be: on the diagonal, 11 to 24 m from the ball, off the passing lanes. */
  private refereeSpot(fr: Frame, t: number) {
    const b = fr.ball;
    const pb = this.playback;
    // Booking a player: he goes to him.
    const card = this.cardAround(t);
    if (card && card.p !== undefined) {
      const off = fr.targets[card.p];
      const me = this.crew[0].f.pos;
      const dx = me.x - off.x;
      const dy = me.y - off.y;
      const d = Math.hypot(dx, dy) || 1;
      return { x: off.x + (dx / d) * 2.6, y: off.y + (dy / d) * 2.6 };
    }
    // After a goal he heads back toward the centre circle for the kick-off.
    if (fr.celebrating >= 0) return { x: b.x * 0.3, y: -8 };
    const r = fr.restart;
    if (r) {
      const dir = pb.dir(r.s, t);
      const gx = dir * HALF_L;
      if (r.k === 'penalty') return { x: gx - dir * 14, y: -Math.sign(gx) * 9 };
      if (r.k === 'corner') return { x: gx - dir * 13, y: -Math.sign(r.y || 1) * 10 };
      if (r.k === 'freekick' && (r.o === 'direct' || r.o === 'cross')) {
        // By the wall, to the side of it, where he can see the kick and the box.
        const ux = gx - r.x;
        const uy = -r.y;
        const ul = Math.hypot(ux, uy) || 1;
        let px = -uy / ul;
        let py = ux / ul;
        if (py * -Math.sign(gx) < 0) {
          px = -px;
          py = -py;
        }
        return clampPitch(r.x + (ux / ul) * 9.5 + px * 5, r.y + (uy / ul) * 9.5 + py * 5);
      }
    }
    // The diagonal: corner to corner, away from the assistant who covers that half.
    const lx = b.x + Math.max(-6, Math.min(6, this.ballV.x * 0.6));
    const ly = b.y + Math.max(-4, Math.min(4, this.ballV.y * 0.4));
    let x = Math.max(-38, Math.min(38, lx * 0.85));
    let y = -0.42 * x * 0.55 + ly * 0.45;
    let dx = x - b.x;
    let dy = y - b.y;
    let d = Math.hypot(dx, dy);
    if (d < 1e-3) {
      dx = 0;
      dy = b.x >= 0 ? -1 : 1;
      d = 1;
    }
    const want = Math.max(11, Math.min(24, d));
    x = b.x + (dx / d) * want;
    y = b.y + (dy / d) * want;
    // Out of the way of the players around that spot.
    for (let i = 0; i < 22; i++) {
      if (fr.sentOff[i]) continue;
      const p = fr.targets[i];
      const ex = x - p.x;
      const ey = y - p.y;
      const e = Math.hypot(ex, ey);
      if (e < 3 && e > 1e-3) {
        x += (ex / e) * (3 - e) * 0.7;
        y += (ey / e) * (3 - e) * 0.7;
      }
    }
    return clampPitch(x, y);
  }

  /**
   * An assistant's spot on his touchline: level with the second-last defender
   * of the team defending his half, or with the ball when it is closer to goal.
   * `half` is 1 for the near assistant (x > 0), -1 for the far one (x < 0).
   */
  private assistantSpot(fr: Frame, t: number, half: 1 | -1) {
    const pb = this.playback;
    // The team whose goal is in this half.
    const def: 0 | 1 = pb.dir(0, t) === half ? 1 : 0;
    const xs: number[] = [];
    for (let k = 0; k < 11; k++) {
      const i = def * 11 + k;
      if (!fr.sentOff[i]) xs.push(fr.targets[i].x * half);
    }
    xs.sort((a, b) => b - a);
    let line = xs.length > 1 ? xs[1] : xs[0] ?? 0;
    const r = fr.restart;
    const inHalf = (r ? r.x : fr.ball.x) * half > 0;
    if (r && r.k === 'penalty' && inHalf) line = HALF_L;
    else if (r && r.k === 'goalkick' && inHalf) line = Math.min(line, HALF_L - 16.5);
    else line = Math.max(line, fr.ball.x * half);
    line = Math.max(0, Math.min(HALF_L, line));
    return { x: line * half, y: half * AR_Y };
  }

  /** The booking the referee is busy with around game time `t`, if any. */
  private cardAround(t: number): MatchEvent | null {
    const ev = this.playback.events;
    for (let k = Math.max(0, this.playback.indexAt(t - 6)); k < ev.length && ev[k].t <= t + 1.2; k++) {
      const e = ev[k];
      if (e.k !== 'card') continue;
      const end = e.t + (e.o === 'second' ? 5.4 : 3.2);
      if (t >= e.t - 1.2 && t <= end) return e;
    }
    return null;
  }

  /** Moves an official toward his spot like a body: limited acceleration, easing in on arrival. */
  private steer(o: Official, gameDt: number, jumped: boolean, B_: number, top: number) {
    const f = o.f;
    if (jumped) {
      f.pos.copy(o.goal);
      f.vel.set(0, 0);
      o.accel.set(0, 0);
      return;
    }
    const steps = Math.max(1, Math.ceil(gameDt / 0.04));
    const h = gameDt / steps;
    o.accel.set(0, 0);
    for (let s = 0; s < steps && h > 0; s++) {
      const dx = o.goal.x - f.pos.x;
      const dy = o.goal.y - f.pos.y;
      const d = Math.hypot(dx, dy);
      if (d > 70) {
        f.pos.copy(o.goal);
        f.vel.set(0, 0);
        continue;
      }
      const want = Math.min(top * B_, d * 1.2 * B_);
      const wx = d > 0.05 ? (dx / d) * want : 0;
      const wy = d > 0.05 ? (dy / d) * want : 0;
      let ax = wx - f.vel.x;
      let ay = wy - f.vel.y;
      const al = Math.hypot(ax, ay);
      const amax = (f.vel.x * ax + f.vel.y * ay >= 0 ? 5 : 8) * h * B_ * B_;
      if (al > amax) {
        ax *= amax / al;
        ay *= amax / al;
      }
      f.vel.x += ax;
      f.vel.y += ay;
      f.pos.x += f.vel.x * h;
      f.pos.y += f.vel.y * h;
      o.accel.set(ax / h / (B_ * B_), ay / h / (B_ * B_));
    }
  }

  /** The signals due around now, read from the events, each played so its key frame lands on its moment. */
  private signals(fr: Frame, t: number, rate: number) {
    const ev = this.playback.events;
    const cues: Cue[] = [];
    const ref = this.crew[0].f.pos;
    const pb = this.playback;
    for (let k = Math.max(0, pb.indexAt(t - 9)); k < ev.length && ev[k].t <= t + 10; k++) {
      const e = ev[k];
      const id = `${k}`;
      switch (e.k) {
        case 'foul': {
          cues.push({ key: `${id}w`, who: 0, kind: 'refWhistle', at: e.t + 0.15 });
          // What follows: a booking first, then the free kick's direction or the spot.
          let card: MatchEvent | null = null;
          let pen: MatchEvent | null = null;
          for (let j = k + 1; j < ev.length && ev[j].t <= e.t + 2; j++) {
            if (ev[j].k === 'card') card = ev[j];
            if (ev[j].k === 'penalty') pen = ev[j];
          }
          const fouled = (1 - e.s) as 0 | 1;
          if (pen) cues.push({ key: `${id}p`, who: 0, kind: 'refSpot', at: e.t + 1.1, face: { x: pen.x, y: pen.y } });
          else {
            const after = card ? (card.o === 'second' ? 7.6 : 5.3) : 1.1;
            cues.push({ key: `${id}d`, who: 0, kind: 'refPoint', at: e.t + after, face: { x: ref.x + pb.dir(fouled, e.t) * 20, y: ref.y } });
          }
          break;
        }
        case 'card': {
          const off = e.p !== undefined ? fr.targets[e.p] : undefined;
          const face = off ? { x: off.x, y: off.y } : undefined;
          cues.push({ key: `${id}c`, who: 0, kind: 'refCard', at: e.t + 1.8, face, card: e.o === 'yellow' || e.o === 'second' ? 'yellow' : 'red' });
          if (e.o === 'second') cues.push({ key: `${id}r`, who: 0, kind: 'refCard', at: e.t + 4.1, face, card: 'red' });
          break;
        }
        case 'offside': {
          // The assistant on that half flags as the pass is played; the referee blows and signals an indirect free kick.
          const half = pb.dir(e.s, e.t);
          cues.push({ key: `${id}f`, who: half > 0 ? 1 : 2, kind: 'refArmUp', at: e.t - 0.45, face: { x: e.x, y: 0 } });
          cues.push({ key: `${id}w`, who: 0, kind: 'refWhistle', at: e.t + 0.2 });
          cues.push({ key: `${id}u`, who: 0, kind: 'refArmUp', at: e.t + 1.4 });
          break;
        }
        case 'goal':
          cues.push({ key: `${id}w`, who: 0, kind: 'refWhistle', at: e.t + 0.4 });
          cues.push({ key: `${id}c`, who: 0, kind: 'refPoint', at: e.t + 1.9, face: { x: 0, y: 0 } });
          break;
        case 'kickoff':
        case 'halftime':
        case 'fulltime':
          cues.push({ key: `${id}w`, who: 0, kind: 'refWhistle', at: e.t - (e.k === 'kickoff' ? 0.35 : 0) });
          break;
        case 'penalty': {
          // The whistle for the kick, just before the run-up.
          for (let j = k + 1; j < ev.length && ev[j].t <= e.t + 25; j++) {
            if (ev[j].k !== 'shot') continue;
            cues.push({ key: `${id}w`, who: 0, kind: 'refWhistle', at: ev[j].t - 1.7, face: { x: e.x, y: e.y } });
            break;
          }
          break;
        }
        case 'freekick':
          if (e.o === 'direct' || e.o === 'cross') cues.push({ key: `${id}w`, who: 0, kind: 'refWhistle', at: e.t - 1.6 });
          break;
        case 'corner':
        case 'goalkick':
        case 'throwin': {
          // Signalled as the ball goes out (the event before the restart).
          const out = ev[k - 1];
          if (!out || e.t - out.t < 2) break;
          const at = Math.max(out.t + 1.1, e.t - 9);
          if (e.k === 'throwin') {
            // The assistant on that half flags which way it goes.
            const half: 1 | -1 = e.x >= 0 ? 1 : -1;
            const a = this.crew[half > 0 ? 1 : 2].f;
            const way = pb.dir(e.s, e.t);
            const right = -Math.cos(a.heading) * way;
            cues.push({ key: `${id}t`, who: half > 0 ? 1 : 2, kind: 'refArmOut', at, left: right < 0 });
          } else {
            // The referee points to the corner arc or the goal area.
            const gx = Math.sign(e.x || 1) * HALF_L;
            const face = e.k === 'corner' ? { x: gx, y: Math.sign(e.y || 1) * HALF_W } : { x: gx, y: 0 };
            cues.push({ key: `${id}g`, who: 0, kind: 'refPoint', at, face });
          }
          break;
        }
      }
    }
    for (const c of cues) {
      if (this.fired.has(c.key)) continue;
      const o = this.crew[c.who];
      const side: 1 | -1 = c.left ? -1 : 1;
      const lead = (c.at - t) / Math.max(0.05, rate);
      if (lead < -0.25) continue;
      if (lead > o.f.contactTime(c.kind, side) / Math.max(1, rate)) continue;
      this.fired.add(c.key);
      if (c.face) {
        o.faceAt = c.face;
        o.faceUntil = c.at + (o.f.actLength(c.kind, side) - o.f.contactTime(c.kind, side)) * 0.85;
      }
      o.f.act(c.kind, { contactIn: Math.max(0, lead), side, seed: hashOf(c.key) });
      if (c.card) {
        (this.card.material as THREE.MeshBasicMaterial).color.set(c.card === 'red' ? 0xe0201c : 0xffd400);
        this.cardFrom = this.nowReal + Math.max(0, lead) - 0.12;
        this.cardUntil = this.cardFrom + 1.25;
      }
      if (c.who > 0) {
        this.flagLeft[c.who - 1] = !!c.left;
        this.flagLeftUntil[c.who - 1] = this.nowReal + Math.max(0, lead) + 1.6;
      }
    }
  }

  private nowReal = 0;

  /** Facing, lean and animation for one official. */
  private pose(o: Official, i: number, inp: OfficialsInput, B_: number) {
    const { fr, t, gameDt, realDt, rate } = inp;
    const f = o.f;
    const speed = gameDt > 0 ? f.vel.length() / B_ : 0;
    const toBall = Math.atan2(fr.ball.x - f.pos.x, fr.ball.y - f.pos.y);
    const run = Math.atan2(f.vel.x, f.vel.y);
    let face: number;
    if (o.faceAt && t < o.faceUntil) face = Math.atan2(o.faceAt.x - f.pos.x, o.faceAt.y - f.pos.y);
    else {
      o.faceAt = null;
      // Assistants side-step along the line watching play; anyone sprints facing the run.
      face = speed > (i === 0 ? 3.4 : 5.2) && Math.cos(run - toBall) > -0.4 ? run : toBall;
    }
    f.heading = turnToward(f.heading, face, realDt, speed > 5 ? 6 : 9, speed > 5 ? 5 : 8);
    f.root.position.set(f.pos.x, 0, f.pos.y);
    f.root.rotation.y = f.heading;
    const sh = Math.sin(f.heading);
    const ch = Math.cos(f.heading);
    const vs = speed / Math.max(0.001, f.vel.length());
    f.fwd = gameDt > 0 ? (f.vel.x * sh + f.vel.y * ch) * vs : 0;
    f.side = gameDt > 0 ? (f.vel.x * ch - f.vel.y * sh) * vs : 0;
    const a = o.accel;
    f.leanX += (Math.max(-0.12, Math.min(0.12, (a.x * sh + a.y * ch) * 0.02)) - f.leanX) * Math.min(1, realDt * 6);
    f.leanZ += (Math.max(-0.1, Math.min(0.1, -(a.x * ch - a.y * sh) * 0.016)) - f.leanZ) * Math.min(1, realDt * 6);
    f.look = rate < 6 ? inp.ball : null;
    f.animate(realDt, Math.min(9, speed), inp.elapsed);
  }

  /** The card in the referee's raised hand, and the assistants' flags. */
  private props(inp: OfficialsInput) {
    this.nowReal = inp.elapsed;
    const now = inp.elapsed;
    const ref = this.crew[0].f;
    const showCard = now >= this.cardFrom && now <= this.cardUntil;
    this.card.visible = showCard;
    if (showCard) {
      ref.root.updateMatrixWorld(true);
      ref.bones[B.RightHand].getWorldPosition(tmpA);
      this.card.position.copy(tmpA).add(tmpUp.set(0, 0.07, 0));
      this.card.quaternion.copy(inp.camera.quaternion);
    }
    for (let k = 0; k < 2; k++) {
      const f = this.crew[k + 1].f;
      const g = this.flags[k];
      const left = this.flagLeft[k] && now <= this.flagLeftUntil[k];
      f.root.updateMatrixWorld(true);
      f.bones[left ? B.LeftHand : B.RightHand].getWorldPosition(tmpA);
      f.bones[left ? B.LeftForeArm : B.RightForeArm].getWorldPosition(tmpB);
      // The flag carries on the line of the forearm, out past the fist.
      const d = tmpB.subVectors(tmpA, tmpB).normalize();
      // The cloth hangs below the stick when it's held out; held down, it falls to the side.
      const side = tmpC.copy(d).multiplyScalar(d.y).add(tmpUp.set(0, -1, 0));
      if (side.lengthSq() < 0.09) side.crossVectors(d, tmpUp.set(0, 1, 0));
      if (side.lengthSq() < 1e-4) side.set(Math.cos(f.heading), 0, -Math.sin(f.heading));
      side.normalize();
      const z = tmpD.crossVectors(side, d).normalize();
      tmpM.makeBasis(side, d, z);
      g.quaternion.setFromRotationMatrix(tmpM);
      g.position.copy(tmpA).addScaledVector(d, -0.06);
    }
  }
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpUp = new THREE.Vector3();
const tmpM = new THREE.Matrix4();

function clampPitch(x: number, y: number) {
  return { x: Math.max(-HALF_L + 4, Math.min(HALF_L - 4, x)), y: Math.max(-HALF_W + 2.5, Math.min(HALF_W - 2.5, y)) };
}

/** Eases an angle toward a target, never turning faster than `maxRate` radians a second. */
function turnToward(a: number, b: number, dt: number, k: number, maxRate: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  const step = d * Math.min(1, dt * k);
  const lim = maxRate * dt;
  return a + Math.max(-lim, Math.min(lim, step));
}

/** True when two colours are too close to tell apart across a pitch. */
function clash(a: string, b: string) {
  const x = new THREE.Color(a);
  const y = new THREE.Color(b);
  return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b) < 0.45;
}

/** The assistant's flag: red and yellow quarters. */
function flagTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 48;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffd21f';
  g.fillRect(0, 0, 64, 48);
  g.fillStyle = '#e3241b';
  g.fillRect(0, 0, 32, 24);
  g.fillRect(32, 24, 32, 24);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
