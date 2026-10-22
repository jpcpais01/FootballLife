// Drives one player's skeleton every frame:
//  1. Locomotion: idle, walk, jog, run, sprint, strafes and backpedals blended
//     by the player's real local velocity, all on one shared stride phase so
//     the feet keep time with the ground.
//  2. Layers on top: celebrations, scrubbed training poses, and one-shot
//     actions time-warped so the strike lands on the frame the game asks for.
//  3. Procedural touches: head and chest tracking a target, then leg IK that
//     locks planted feet to the grass and keeps them out of it.
// Whenever the source of the motion changes at once (an action starts or
// replaces another), the last pose shown is held and blended out, so the body
// never pops from one motion to the next.
import * as THREE from 'three';
import { type Clip, Pose, accumulate, clearPose, duration, feetAt, fkFrame, mixPose, normalisePose, sample, sampleLoopPhase } from './clip.ts';
import { getClip, hasClip, libraryVersion } from './library.ts';
import { ANKLE_Y, B, NB, REST } from './skeleton.ts';

export type ActionKind = 'pass' | 'passLong' | 'shot' | 'chip' | 'cross' | 'trap' | 'chest' | 'header' | 'slide' | 'tackle' | 'keeperSet' | 'dive' | 'catch' | 'fall' | 'getUp' | 'throwIn' | 'keeperThrow' | 'keeperKick';

export interface ActOpts {
  /** Real seconds from now until the contact frame (foot on ball, hands on ball…). */
  contactIn?: number;
  /** -1 plays the mirrored clip: left foot, or a dive to the player's right. */
  side?: 1 | -1;
}

export interface AnimInput {
  /** Ground speed in world m/s and its split along the facing (fwd) and to the player's left (side). */
  speed: number;
  fwd: number;
  side: number;
  /** World units per body unit (the figure's scale). */
  scale: number;
  keeper: boolean;
  /** Looping celebration clip name, or null. */
  celebrate: string | null;
  /** A clip held at a given time (training drills drive poses this way). */
  scrub: { name: string; t: number; mirror: boolean } | null;
  look: THREE.Vector3 | null;
  /** Height of the body above the root (a display base). */
  lift: number;
}

interface Running {
  clip: Clip;
  t: number;
  contact: number;
  rate: number;
  w: number;
  /** Travel already handed to the root (body units), taken off the clip's hips from then on. */
  sx: number;
  sz: number;
  shifted: boolean;
}

const LOCO = { fwd: ['walk', 'jog', 'run', 'sprint'], back: ['walkBack', 'runBack'] };

/** Clip per action where it isn't simply the action's own name. */
const CLIP_OF: Partial<Record<ActionKind, string>> = { passLong: 'cross' };

/** Which part of the body meets the ball in each action. */
const EFFECTOR: Partial<Record<ActionKind, 'foot' | 'head' | 'chest' | 'hands'>> = {
  pass: 'foot', passLong: 'foot', shot: 'foot', chip: 'foot', cross: 'foot', trap: 'foot', slide: 'foot', tackle: 'foot', keeperKick: 'foot',
  header: 'head', chest: 'chest', catch: 'hands', dive: 'hands',
};

const fkPos = new Float32Array(NB * 3);
const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const v3 = new THREE.Vector3();
const vt = new THREE.Vector3();
const va = new THREE.Vector3();
const vb = new THREE.Vector3();
const vc = new THREE.Vector3();
const vk = new THREE.Vector3();
const q1 = new THREE.Quaternion();
const q2 = new THREE.Quaternion();
const qf = new THREE.Quaternion();
const qSaved = new THREE.Quaternion();
const vd = new THREE.Vector3();
const qy = new THREE.Quaternion();
const qx = new THREE.Quaternion();
const X = new THREE.Vector3(1, 0, 0);
const Y = new THREE.Vector3(0, 1, 0);
const feetTmp: [number, number] = [0, 0];

/** Rotates `bone` (in world space) so its `from` direction points along `to`. */
function aimBone(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  q1.setFromUnitVectors(from.normalize(), to.normalize());
  bone.getWorldQuaternion(q2);
  q2.premultiply(q1);
  bone.parent!.getWorldQuaternion(qf).invert();
  bone.quaternion.copy(qf.multiply(q2));
  bone.updateMatrixWorld(true);
}

interface FootLock {
  up: THREE.Bone;
  knee: THREE.Bone;
  foot: THREE.Bone;
  locked: boolean;
  w: number;
  at: THREE.Vector3;
}

export class Animator {
  private bones: THREE.Bone[];
  private root: THREE.Object3D;
  private phase = Math.random();
  private idleT = Math.random() * 10;
  private celT = 0;
  private celW = 0;
  private celName = '';
  private scrubW = 0;
  private scrubPose = new Pose();
  private action: Running | null = null;
  private lookYaw = 0;
  private lookPitch = 0;
  private lookW = 0;
  private lastRoot = new THREE.Vector3();
  private hasLast = false;
  private feet: FootLock[];
  private pose = new Pose();
  private acc = new Pose();
  private tmp = new Pose();
  private ver = -1;
  private cache = new Map<string, Clip>();
  /** The pose shown last frame, and a held copy being blended out after a cut. */
  private last = new Pose();
  private hasPose = false;
  private from = new Pose();
  private fromT = 1;
  private fromDur = 0;
  /** Smoothed local velocity (body units / s), so gait changes ease in. */
  private vF = 0;
  private vS = 0;

  constructor(bones: THREE.Bone[], root: THREE.Object3D) {
    this.bones = bones;
    this.root = root;
    const lock = (u: number, k: number, f: number): FootLock => ({ up: bones[u], knee: bones[k], foot: bones[f], locked: false, w: 0, at: new THREE.Vector3() });
    this.feet = [lock(B.LeftUpLeg, B.LeftLeg, B.LeftFoot), lock(B.RightUpLeg, B.RightLeg, B.RightFoot)];
  }

  private clip(name: string, mirror = false) {
    if (this.ver !== libraryVersion) {
      this.cache.clear();
      this.ver = libraryVersion;
    }
    const key = mirror ? `${name}|m` : name;
    let c = this.cache.get(key);
    if (!c) {
      c = getClip(name, mirror);
      this.cache.set(key, c);
    }
    return c;
  }

  /** Holds the current pose and blends from it over `dur` seconds. */
  private cut(dur: number) {
    if (!this.hasPose) return;
    // Mid-blend: keep blending from what is on screen now.
    this.from.copy(this.last);
    this.fromT = 0;
    this.fromDur = dur;
  }

  /**
   * Starts a one-shot action, warped so its contact frame lands `contactIn`
   * seconds from now. Returns where the body part that meets the ball is at
   * that frame (body units, in the player's own frame), or null.
   */
  act(kind: ActionKind, opts: ActOpts = {}): THREE.Vector3 | null {
    const clip = this.clip(CLIP_OF[kind] ?? kind, opts.side === -1);
    const dur = duration(clip);
    const contact = clip.contact ?? dur * 0.4;
    let rate = 1;
    let t = 0;
    if (opts.contactIn !== undefined) {
      const ci = Math.max(0, opts.contactIn);
      rate = ci > 0 ? Math.min(1.8, Math.max(0.6, contact / ci)) : 1.8;
      // Too early: wait before starting. Too late: start partway through the wind-up.
      t = contact - ci * rate;
    }
    // Cutting in on another action: blend from the pose on screen. Otherwise it blends in when it starts.
    const busy = !!this.action && this.action.t >= 0;
    if (busy) this.cut(0.22);
    this.action = { clip, t, contact, rate, w: busy && t >= 0 ? 1 : 0, sx: 0, sz: 0, shifted: false };
    return this.effector(clip, contact, EFFECTOR[kind]);
  }

  /** Seconds from the start of an action's clip to its contact frame. */
  contactOf(kind: ActionKind, side: 1 | -1 = 1) {
    const clip = this.clip(CLIP_OF[kind] ?? kind, side === -1);
    return clip.contact ?? duration(clip) * 0.4;
  }

  private effector(clip: Clip, at: number, part: (typeof EFFECTOR)[ActionKind]) {
    if (!part) return null;
    fkFrame(clip, Math.min(clip.frames - 1, Math.round(at * clip.fps)), fkPos);
    const P = (b: number) => new THREE.Vector3(fkPos[b * 3], fkPos[b * 3 + 1], fkPos[b * 3 + 2]);
    if (part === 'head') return P(B.Head).setY(REST[B.Head][1] + 0.17);
    if (part === 'chest') return P(B.Spine2);
    if (part === 'hands') return P(B.LeftHand).add(P(B.RightHand)).multiplyScalar(0.5);
    // The striking foot is the one out in front; the ball sits just beyond the toe.
    const l = P(B.LeftToeBase);
    const r = P(B.RightToeBase);
    const toe = l.z > r.z ? l : r;
    return toe.add(new THREE.Vector3(0, 0, 0.1));
  }

  /**
   * Travel an action carried the body (a dive across the goal), in body units
   * along the player's own x and z. The figure moves its root by this and clears it.
   */
  shift = new THREE.Vector3();

  /** True while a one-shot action is playing. */
  get acting() {
    return !!this.action;
  }

  update(dt: number, inp: AnimInput) {
    const scale = inp.scale || 1;
    // Ease the gait toward the body's velocity: recorded motion steps at its sample rate.
    const kv = dt > 0 ? 1 - Math.exp(-dt * 9) : 1;
    this.vF += (inp.fwd / scale - this.vF) * kv;
    this.vS += (inp.side / scale - this.vS) * kv;
    const v = Math.min(inp.speed / scale, Math.hypot(this.vF, this.vS));
    const pose = this.pose;

    // ---- Locomotion blend ----
    this.idleT += dt;
    const acc = this.acc;
    clearPose(acc);
    let totalW = 0;
    let moveW = 0;
    let strideW = 0;
    let footL = 0;
    let footR = 0;
    const len = Math.hypot(this.vF, this.vS);
    const fx = len > 1e-3 ? this.vF / len : 1;
    const sx = len > 1e-3 ? this.vS / len : 0;
    const wF = fx > 0 ? fx * fx : 0;
    const wB = fx < 0 ? fx * fx : 0;
    const wS = sx * sx;
    const weights: [Clip, number][] = [];
    let idleW = 0;
    const along = (names: string[], w: number) => {
      if (w <= 1e-3) return;
      const cs = names.filter(hasClip).map((n) => this.clip(n));
      const s0 = cs[0].speed || 1;
      if (v <= s0) {
        weights.push([cs[0], (w * v) / s0]);
        idleW += w * (1 - v / s0);
        return;
      }
      for (let i = 1; i < cs.length; i++) {
        const a = cs[i - 1].speed || 1;
        // Two takes at much the same pace still hand over gradually as the player speeds up.
        const b = Math.max(cs[i].speed || 0, a + 1.2);
        if (v <= b) {
          const k = (v - a) / Math.max(1e-3, b - a);
          weights.push([cs[i - 1], w * (1 - k)], [cs[i], w * k]);
          return;
        }
      }
      weights.push([cs[cs.length - 1], w]);
    };
    along(LOCO.fwd, wF);
    along(LOCO.back, wB);
    const dir = sx > 0 ? 'Left' : 'Right';
    along(inp.keeper && hasClip(`keeperShuffle${dir}`) ? [`keeperShuffle${dir}`] : [`strafeWalk${dir}`, `strafe${dir}`], wS);
    for (const [c, w] of weights) {
      if (w <= 1e-3) continue;
      moveW += w;
      strideW += w * (c.speed || 1) * duration(c);
    }
    // One shared phase: it advances at the body's speed over the blended stride length.
    if (moveW > 1e-3) this.phase = (this.phase + (dt * v) / (strideW / moveW)) % 1;
    for (const [c, w] of weights) {
      if (w <= 1e-3) continue;
      sampleLoopPhase(c, this.phase, this.tmp);
      accumulate(acc, this.tmp, w);
      totalW += w;
      feetAt(c, this.phase, feetTmp);
      footL += feetTmp[0] * w;
      footR += feetTmp[1] * w;
    }
    if (idleW > 1e-3) {
      sample(this.clip(inp.keeper ? 'keeperIdle' : 'idle'), this.idleT, this.tmp);
      accumulate(acc, this.tmp, idleW);
      totalW += idleW;
    }
    normalisePose(acc, totalW);
    pose.copy(acc);
    if (totalW > 0) {
      footL /= totalW;
      footR /= totalW;
    }

    // ---- Celebration ----
    if (inp.celebrate) {
      if (inp.celebrate !== this.celName) {
        this.celName = inp.celebrate;
        this.celT = Math.random() * 0.3;
      }
      this.celW = Math.min(1, this.celW + dt * 5);
    } else this.celW = Math.max(0, this.celW - dt * 4);
    if (this.celW > 0 && this.celName) {
      this.celT += dt;
      sample(this.clip(this.celName), this.celT, this.tmp);
      mixPose(pose, pose, this.tmp, this.celW);
    }

    // ---- Scrubbed pose (training) ----
    if (inp.scrub) {
      sample(this.clip(inp.scrub.name, inp.scrub.mirror), inp.scrub.t, this.scrubPose);
      this.scrubW = dt > 0 ? Math.min(1, this.scrubW + dt * 14) : 1;
    } else this.scrubW = Math.max(0, this.scrubW - dt * 6);
    if (this.scrubW > 0) mixPose(pose, pose, this.scrubPose, this.scrubW);

    // ---- One-shot action ----
    const a = this.action;
    if (a) {
      const dur = duration(a.clip);
      a.t += dt * (a.t < a.contact ? a.rate : 1);
      if (a.t >= dur) this.action = null;
      else if (a.t >= 0) {
        // Starting: the held pose blends into the action, so the wind-up begins from where the body is.
        if (a.w === 0) {
          this.cut(Math.max(0.08, Math.min(0.2, ((a.contact - a.t) / a.rate) * 0.6)));
          a.w = 1;
        }
        const fadeOut = Math.min(1, (dur - a.t) / 0.35);
        a.w = Math.min(fadeOut, a.w + dt / 0.1);
        sample(a.clip, a.t, this.tmp);
        if (!a.shifted && fadeOut < 1) {
          // As it blends out, the player is now where the action took them.
          a.shifted = true;
          a.sx = this.tmp.p[0];
          a.sz = this.tmp.p[2];
          if (Math.hypot(a.sx, a.sz) > 0.05) {
            this.shift.set(a.sx, 0, a.sz);
            // The held pose moves with the body.
            this.from.p[0] -= a.sx;
            this.from.p[2] -= a.sz;
          } else a.sx = a.sz = 0;
        }
        this.tmp.p[0] -= a.sx;
        this.tmp.p[2] -= a.sz;
        mixPose(pose, pose, this.tmp, a.w);
      }
    }
    const actW = this.action && this.action.t >= 0 ? this.action.w : 0;
    const override = Math.max(actW, this.celW, this.scrubW);

    // ---- Blend out of a cut ----
    if (this.fromT < this.fromDur) {
      this.fromT += dt;
      mixPose(pose, this.from, pose, smooth(this.fromT / this.fromDur));
    }
    this.last.copy(pose);
    this.hasPose = true;

    // ---- Write the pose ----
    const bones = this.bones;
    const q = pose.q;
    for (let i = 0; i < NB; i++) bones[i].quaternion.set(q[i * 4], q[i * 4 + 1], q[i * 4 + 2], q[i * 4 + 3]);
    bones[0].position.set(REST[0][0] + pose.p[0], REST[0][1] + pose.p[1], REST[0][2] + pose.p[2]);

    // ---- Head and chest follow the target ----
    let yaw = 0;
    let pitch = 0;
    let want = 0;
    if (inp.look) {
      this.root.updateMatrixWorld();
      v1.copy(inp.look);
      this.root.worldToLocal(v1);
      yaw = Math.atan2(v1.x, v1.z);
      pitch = Math.atan2(inp.lift + 2.0 - v1.y, Math.max(0.5, Math.hypot(v1.x, v1.z)));
      // Behind the player: let go rather than snapping the head round.
      want = Math.abs(yaw) > 2.3 ? 0 : 1 - override * 0.75;
      const lim = 1.25 - Math.min(0.55, v * 0.08);
      yaw = Math.max(-lim, Math.min(lim, yaw));
      pitch = Math.max(-0.5, Math.min(0.6, pitch));
    }
    const k = dt > 0 ? Math.min(1, dt * 7) : 1;
    this.lookW += (want - this.lookW) * k;
    this.lookYaw += (yaw - this.lookYaw) * k;
    this.lookPitch += (pitch - this.lookPitch) * k;
    if (this.lookW > 0.01) {
      const share: [number, number, number][] = [[B.Spine1, 0.12, 0], [B.Spine2, 0.18, 0.08], [B.Neck, 0.3, 0.35], [B.Head, 0.4, 0.57]];
      for (const [b, ky, kp] of share) {
        qy.setFromAxisAngle(Y, this.lookYaw * ky * this.lookW);
        qx.setFromAxisAngle(X, this.lookPitch * kp * this.lookW);
        bones[b].quaternion.premultiply(qy.multiply(qx));
      }
    }

    // ---- Feet: lock planted feet, keep them on the grass ----
    this.root.updateMatrixWorld(true);
    const locoW = 1 - override;
    this.root.getWorldPosition(v1);
    const moved = this.hasLast && dt > 0 ? v1.distanceTo(this.lastRoot) / dt : 0;
    this.lastRoot.copy(v1);
    // Fast-forward or a teleport: the root moves faster than the legs could carry it.
    const skating = !this.hasLast || dt <= 0 || moved > inp.speed * 1.6 + 1.5 * scale;
    this.hasLast = true;
    const canLock = locoW > 0.5 && moveW > 0.35 && !skating;
    const minY = inp.lift + ANKLE_Y - 0.004;
    const contact = [footL, footR];
    for (let s = 0; s < 2; s++) {
      const f = this.feet[s];
      f.foot.getWorldPosition(vc);
      if (f.locked) {
        if (!canLock || contact[s] < 0.4 || vc.distanceTo(f.at) > 0.32 * scale) f.locked = false;
      } else if (canLock && contact[s] > 0.6) {
        f.locked = true;
        f.at.copy(vc);
        // Plant it exactly on the ground.
        this.root.worldToLocal(f.at);
        f.at.y = Math.max(minY, Math.min(f.at.y, minY + 0.01));
        this.root.localToWorld(f.at);
      }
      f.w = f.locked ? Math.min(1, f.w + dt / 0.06) : Math.max(0, f.w - dt / 0.14);
      if (!canLock && skating) f.w = 0;
      vt.copy(vc).lerp(f.at, f.w);
      if (locoW > 0) {
        this.root.worldToLocal(vt);
        if (vt.y < minY) vt.y += (minY - vt.y) * locoW;
        this.root.localToWorld(vt);
      }
      if (vt.distanceToSquared(vc) > 1e-8) this.solveLeg(f, vt);
    }
  }

  /** Two-bone IK: bends hip and knee so the ankle reaches `target`, keeping the knee's plane and the foot's angle. */
  private solveLeg(f: FootLock, target: THREE.Vector3) {
    f.up.getWorldPosition(va);
    f.knee.getWorldPosition(vb);
    f.foot.getWorldPosition(vc);
    f.foot.getWorldQuaternion(qSaved);
    const saved = qSaved;
    const l1 = va.distanceTo(vb);
    const l2 = vb.distanceTo(vc);
    v1.subVectors(target, va);
    const d = Math.max(Math.abs(l1 - l2) + 1e-3, Math.min(l1 + l2 - 1e-3, v1.length()));
    v1.normalize();
    // Knee direction: where it points now, square to the hip-ankle line.
    v2.subVectors(vb, va);
    v2.addScaledVector(v1, -v2.dot(v1));
    if (v2.lengthSq() < 1e-8) v2.set(0, 0, 1).applyQuaternion(this.root.quaternion);
    v2.normalize();
    const cosA = Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
    vk.copy(va).addScaledVector(v1, l1 * cosA).addScaledVector(v2, l1 * Math.sqrt(1 - cosA * cosA));
    aimBone(f.up, v3.subVectors(vb, va), vd.subVectors(vk, va));
    f.foot.getWorldPosition(vc);
    v2.copy(va).addScaledVector(v1, d);
    aimBone(f.knee, v3.subVectors(vc, vk), v2.sub(vk));
    // Foot keeps the orientation it had before the legs moved.
    f.knee.getWorldQuaternion(qf).invert();
    f.foot.quaternion.copy(qf.multiply(saved));
    f.foot.updateMatrixWorld(true);
  }
}
