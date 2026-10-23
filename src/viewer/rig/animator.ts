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

export type ActionKind = 'pass' | 'passLong' | 'shot' | 'chip' | 'cross' | 'trap' | 'chest' | 'header' | 'slide' | 'tackle' | 'keeperSet' | 'dive' | 'diveHigh' | 'catch' | 'keeperGather' | 'keeperScoop' | 'keeperHigh' | 'fall' | 'getUp' | 'throwIn' | 'keeperThrow' | 'keeperKick'
  | 'keeperPass' | 'keeperMiss' | 'keeperDirect' | 'scissor' | 'jump' | 'turnL90' | 'turnR90' | 'turnL' | 'turnR'
  | 'kickUp' | 'kneeA' | 'kneeB' | 'stallA' | 'stallB' | 'stallC' | 'stallD';

export interface ActOpts {
  /** Real seconds from now until the contact frame (foot on ball, hands on ball…). */
  contactIn?: number;
  /** -1 plays the mirrored clip: left foot, or a dive to the player's right. */
  side?: 1 | -1;
  /**
   * Seeds this take's own variation (follow-through tempo, arm carriage, and
   * for moves either side can play, the side), so a replay plays it the same way.
   */
  seed?: number;
}

/** A small seeded generator: the same seed always gives the same numbers. */
export function seeded(seed: number) {
  let a = (seed | 0) ^ 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable number for a string (a player's name, a moment in the match). */
export function hashOf(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * How one player carries himself, the same every match: stride length (and so
 * cadence), how far he leans into his running, how wide he holds his arms, how
 * he holds his head, and the tempo of his celebrations.
 */
interface Style {
  stride: number;
  lean: number;
  arms: number;
  nod: number;
  tilt: number;
  celRate: number;
  /** Follow-throughs: some players snap through a strike, others let it flow. */
  tempo: number;
}

function styleOf(r: () => number): Style {
  const n = () => r() * 2 - 1;
  return {
    stride: 1 + n() * 0.07,
    lean: 0.02 + r() * 0.07,
    arms: n() * 0.09,
    nod: n() * 0.06,
    tilt: n() * 0.05,
    celRate: 0.9 + r() * 0.22,
    tempo: 0.92 + r() * 0.16,
  };
}

/** Moves either side can play just as well: a take picks its side from its seed. */
const EITHER_SIDE = new Set<ActionKind>(['trap', 'chest', 'header', 'keeperSet', 'keeperMiss', 'keeperDirect', 'jump']);
export const eitherSide = (kind: ActionKind) => EITHER_SIDE.has(kind);

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
  /** A keeper holding the ball: arms gather it in front of the chest. */
  hold?: boolean;
}

/** Bones that carry the ball in a keeper's hold. */
const ARMS = [B.LeftShoulder, B.LeftArm, B.LeftForeArm, B.LeftHand, B.RightShoulder, B.RightArm, B.RightForeArm, B.RightHand];

interface Running {
  clip: Clip;
  t: number;
  contact: number;
  rate: number;
  /** Playback rate after contact (or for a take with no contact), the take's own. */
  after: number;
  /** Extra arm spread for this take (radians). */
  flare: number;
  /** The hands meet the ball: no arm styling on top. */
  hands: boolean;
  w: number;
  /** Travel already handed to the root (body units), taken off the clip's hips from then on. */
  sx: number;
  sz: number;
  /** Turn already handed to the root (radians about up), taken off the clip's hips from then on. */
  syaw: number;
  shifted: boolean;
  /** Legs that keep running underneath the action when the player is moving (0 left, 1 right). */
  legs: number[];
}

const LOCO = { fwd: ['walk', 'jog', 'run', 'sprint'], back: ['walkBack', 'runBack'] };

/** Clip per action where it isn't simply the action's own name. */
const CLIP_OF: Partial<Record<ActionKind, string>> = { passLong: 'cross' };

/** Actions the whole body commits to: no running legs underneath. */
const WHOLE_BODY = new Set<ActionKind>([
  'slide', 'dive', 'diveHigh', 'fall', 'getUp', 'header', 'keeperScoop', 'keeperSet', 'throwIn', 'keeperThrow',
  'keeperPass', 'scissor', 'jump', 'turnL90', 'turnR90', 'turnL', 'turnR',
  'kickUp', 'kneeA', 'kneeB', 'stallA', 'stallB', 'stallC', 'stallD',
]);
const LEG_BONES = [[B.LeftUpLeg, B.LeftLeg, B.LeftFoot, B.LeftToeBase], [B.RightUpLeg, B.RightLeg, B.RightFoot, B.RightToeBase]];

/** Which part of the body meets the ball in each action. */
const EFFECTOR: Partial<Record<ActionKind, 'foot' | 'head' | 'chest' | 'hands'>> = {
  pass: 'foot', passLong: 'foot', shot: 'foot', chip: 'foot', cross: 'foot', trap: 'foot', slide: 'foot', tackle: 'foot', keeperKick: 'foot',
  scissor: 'foot', keeperPass: 'hands',
  header: 'head', chest: 'chest', catch: 'hands', dive: 'hands', diveHigh: 'hands', keeperGather: 'hands', keeperScoop: 'hands', keeperHigh: 'hands',
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

/** Takes travel (sx, sz) and a turn (yaw about up) off a pose's hips, once the root has taken them over. */
function rebase(pose: Pose, sx: number, sz: number, yaw: number) {
  const x = pose.p[0] - sx;
  const z = pose.p[2] - sz;
  if (!yaw) {
    pose.p[0] = x;
    pose.p[2] = z;
    return;
  }
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  pose.p[0] = x * c - z * s;
  pose.p[2] = x * s + z * c;
  // Hips rotation: the inverse turn about up, applied in front.
  const hy = Math.sin(-yaw / 2);
  const hw = Math.cos(-yaw / 2);
  const [qx, qy, qz, qw] = [pose.q[0], pose.q[1], pose.q[2], pose.q[3]];
  pose.q[0] = hw * qx + hy * qz;
  pose.q[1] = hw * qy + hy * qw;
  pose.q[2] = hw * qz - hy * qx;
  pose.q[3] = hw * qw - hy * qy;
}

/** Turns bone `b` of `pose` by `angle` about the unit axis (x, y, z) of its parent's frame. */
function turnBone(pose: Pose, b: number, x: number, y: number, z: number, angle: number) {
  if (!angle) return;
  const j = b * 4;
  const s = Math.sin(angle / 2);
  const ox = x * s, oy = y * s, oz = z * s, ow = Math.cos(angle / 2);
  const qx = pose.q[j], qy = pose.q[j + 1], qz = pose.q[j + 2], qw = pose.q[j + 3];
  pose.q[j] = ow * qx + ox * qw + oy * qz - oz * qy;
  pose.q[j + 1] = ow * qy - ox * qz + oy * qw + oz * qx;
  pose.q[j + 2] = ow * qz + ox * qy - oy * qx + oz * qw;
  pose.q[j + 3] = ow * qw - ox * qx - oy * qy - oz * qz;
}

/** Moves one bone of `pose` toward `src` by w (nlerp). */
function nlerpBone(pose: Pose, src: Pose, b: number, w: number) {
  const j = b * 4;
  let x = src.q[j], y = src.q[j + 1], z = src.q[j + 2], ww = src.q[j + 3];
  if (x * pose.q[j] + y * pose.q[j + 1] + z * pose.q[j + 2] + ww * pose.q[j + 3] < 0) { x = -x; y = -y; z = -z; ww = -ww; }
  const ox = pose.q[j] + (x - pose.q[j]) * w, oy = pose.q[j + 1] + (y - pose.q[j + 1]) * w;
  const oz = pose.q[j + 2] + (z - pose.q[j + 2]) * w, ow = pose.q[j + 3] + (ww - pose.q[j + 3]) * w;
  const n = 1 / Math.hypot(ox, oy, oz, ow);
  pose.q[j] = ox * n; pose.q[j + 1] = oy * n; pose.q[j + 2] = oz * n; pose.q[j + 3] = ow * n;
}

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
  private rng: () => number;
  private style: Style;
  private phase: number;
  private idleT: number;
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
  private holdW = 0;
  /** Each keeper has his own way of waiting. */
  private keeperIdle: string;
  /** The locomotion pose on its own, for legs that keep running under an action. */
  private loco = new Pose();

  /** `seed` makes the player's style and timing his own and the same every time (a hash of who he is). */
  constructor(bones: THREE.Bone[], root: THREE.Object3D, seed = Math.floor(Math.random() * 2 ** 31)) {
    this.bones = bones;
    this.root = root;
    this.rng = seeded(seed);
    this.style = styleOf(this.rng);
    this.phase = this.rng();
    this.idleT = this.rng() * 10;
    this.keeperIdle = this.rng() < 0.5 || !hasClip('keeperIdle2') ? 'keeperIdle' : 'keeperIdle2';
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

  /** A hard cut (the player was put on a new spot): no action, blend or planted foot carries over. */
  reset() {
    this.action = null;
    this.fromT = this.fromDur;
    this.hasLast = false;
    for (const f of this.feet) {
      f.locked = false;
      f.w = 0;
    }
  }

  /**
   * Layers the player's own way of carrying himself over whatever is playing:
   * a forward lean that grows as he runs, arms held wider or tighter (plus this
   * take's own flare during an action), and a slight tilt and nod of the head.
   */
  private carriage(pose: Pose, v: number, actW: number) {
    const st = this.style;
    const run = Math.min(1, v / 4);
    const free = 1 - actW * 0.6;
    // Hands that meet the ball (a save, a throw) keep exactly where the take puts them.
    const handsFree = this.action?.hands ? 1 - actW : 1;
    const flare = this.action && !this.action.hands ? this.action.flare * actW : 0;
    turnBone(pose, B.Spine, 1, 0, 0, st.lean * (0.3 + 0.7 * run) * free);
    turnBone(pose, B.LeftArm, 0, 0, 1, -(st.arms * free + flare) * handsFree);
    turnBone(pose, B.RightArm, 0, 0, 1, (st.arms * free + flare) * handsFree);
    turnBone(pose, B.Head, 1, 0, 0, st.nod * free);
    turnBone(pose, B.Head, 0, 0, 1, st.tilt * free);
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
    const vr = seeded(opts.seed ?? Math.floor(this.rng() * 2 ** 31));
    const side = opts.side ?? (EITHER_SIDE.has(kind) && vr() < 0.5 ? -1 : 1);
    const clip = this.clip(CLIP_OF[kind] ?? kind, side === -1);
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
    const part = EFFECTOR[kind];
    const eff = this.effector(clip, contact, part);
    // On the move, the support leg (or both legs for a catch) keeps the stride while the rest plays the action.
    const legs = WHOLE_BODY.has(kind) ? [] : part === 'foot' ? [1 - this.kickSide] : [0, 1];
    // This take's own touch: the follow-through runs a little quicker or slower (contact stays where the game puts it),
    // and the arms are held a shade wider or tighter.
    const after = this.style.tempo * (0.92 + vr() * 0.16);
    const flare = (vr() * 2 - 1) * 0.12;
    this.action = { clip, t, contact, rate, after, flare, hands: part === 'hands' || kind === 'throwIn' || kind === 'keeperThrow', w: busy && t >= 0 ? 1 : 0, sx: 0, sz: 0, syaw: 0, shifted: false, legs };
    return eff;
  }

  /** The striking foot of the last foot action planned (0 left, 1 right). */
  private kickSide = 1;

  /** Where bone `b` is at clip time `t` of an action (body units, in the player's own frame). */
  pointOf(kind: ActionKind, b: number, t: number, side: 1 | -1 = 1) {
    const clip = this.clip(CLIP_OF[kind] ?? kind, side === -1);
    fkFrame(clip, Math.max(0, Math.min(clip.frames - 1, Math.round(t * clip.fps))), fkPos);
    return new THREE.Vector3(fkPos[b * 3], fkPos[b * 3 + 1], fkPos[b * 3 + 2]);
  }

  /** Length of an action's clip in seconds. */
  lengthOf(kind: ActionKind, side: 1 | -1 = 1) {
    return duration(this.clip(CLIP_OF[kind] ?? kind, side === -1));
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
    this.kickSide = l.z > r.z ? 0 : 1;
    const toe = l.z > r.z ? l : r;
    return toe.add(new THREE.Vector3(0, 0, 0.1));
  }

  /**
   * Travel an action carried the body (a dive across the goal), in body units
   * along the player's own x and z. The figure moves its root by this and clears it.
   */
  shift = new THREE.Vector3();
  /** Turn an action (a turn on the spot) carried the body, radians about up. The figure turns by this and clears it. */
  shiftYaw = 0;

  /** True while a one-shot action is playing. */
  get acting() {
    return !!this.action;
  }

  /** True while the whole body is committed to an action (a dive, a slide, on the ground): he can't turn. */
  get committed() {
    return !!this.action && this.action.t >= 0 && this.action.legs.length === 0;
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
    let wF = fx > 0 ? fx * fx : 0;
    let wB = fx < 0 ? fx * fx : 0;
    let wS = sx * sx;
    // At a jog, running at an angle uses the real diagonal takes (forward or back), not a forward and sideways mix.
    const diag = 2 * Math.abs(fx * sx);
    const dName = `${fx >= 0 ? 'jogDiag' : 'backDiag'}${sx > 0 ? 'Left' : 'Right'}`;
    const dClip = hasClip(dName) ? this.clip(dName) : null;
    let wD = 0;
    if (dClip && diag > 0.3) {
      const ds = dClip.speed || 3;
      const pace = Math.max(0, Math.min(1, (v - ds * 0.55) / (ds * 0.3))) * Math.max(0, Math.min(1, (ds * 1.5 - v) / (ds * 0.3)));
      wD = pace * Math.min(1, (diag - 0.3) / 0.5);
      wF *= 1 - wD;
      wB *= 1 - wD;
      wS *= 1 - wD;
    }
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
    if (wD > 1e-3) weights.push([dClip!, wD]);
    for (const [c, w] of weights) {
      if (w <= 1e-3) continue;
      moveW += w;
      strideW += w * (c.speed || 1) * duration(c);
    }
    // One shared phase: it advances at the body's speed over the blended stride length.
    if (moveW > 1e-3) this.phase = (this.phase + (dt * v) / ((strideW / moveW) * this.style.stride)) % 1;
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
      sample(this.clip(inp.keeper ? this.keeperIdle : 'idle'), this.idleT, this.tmp);
      accumulate(acc, this.tmp, idleW);
      totalW += idleW;
      // Standing: both feet are planted.
      footL += idleW;
      footR += idleW;
    }
    normalisePose(acc, totalW);
    pose.copy(acc);
    this.loco.copy(pose);
    if (totalW > 0) {
      footL /= totalW;
      footR /= totalW;
    }

    // ---- Celebration ----
    if (inp.celebrate) {
      if (inp.celebrate !== this.celName) {
        this.celName = inp.celebrate;
        this.celT = this.rng() * 0.6;
      }
      // Running to the scorer or the corner flag is running; the celebration plays once he gets there.
      const want = Math.max(0, Math.min(1, 1 - (inp.speed - 1.2) / 1.6));
      this.celW = this.celW < want ? Math.min(want, this.celW + dt * 4) : Math.max(want, this.celW - dt * 4);
    } else this.celW = Math.max(0, this.celW - dt * 4);
    if (this.celW > 0 && this.celName) {
      this.celT += dt * this.style.celRate;
      const cc = this.clip(this.celName);
      // One-off takes (a jump for joy) repeat.
      sample(cc, cc.loop ? this.celT : this.celT % duration(cc), this.tmp);
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
      a.t += dt * (a.t < a.contact ? a.rate : a.after);
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
          if (Math.hypot(a.sx, a.sz) > 0.05) this.shift.set(a.sx, 0, a.sz);
          else a.sx = a.sz = 0;
          // A turn on the spot: the body now faces where the turn took it.
          const yaw = 2 * Math.atan2(this.tmp.q[1], this.tmp.q[3]);
          a.syaw = Math.abs(yaw) > 0.35 ? yaw : 0;
          this.shiftYaw = a.syaw;
          // The held pose moves with the body.
          rebase(this.from, a.sx, a.sz, a.syaw);
        }
        rebase(this.tmp, a.sx, a.sz, a.syaw);
        mixPose(pose, pose, this.tmp, a.w);
      }
    }
    const actW = this.action && this.action.t >= 0 ? this.action.w : 0;
    const override = Math.max(actW, this.celW, this.scrubW);

    // ---- Running legs under an action ----
    const run = this.action && this.action.legs.length ? actW * Math.max(0, Math.min(0.9, (inp.speed - 0.8) / 3)) : 0;
    const legW = [0, 0];
    if (run > 0) {
      for (const leg of this.action!.legs) {
        legW[leg] = run;
        for (const b of LEG_BONES[leg]) nlerpBone(pose, this.loco, b, run);
      }
      pose.p[1] += (this.loco.p[1] - pose.p[1]) * run * 0.6;
    }

    // ---- Keeper's hold: arms only, under any action ----
    this.holdW = inp.hold ? Math.min(1, this.holdW + dt * 5) : Math.max(0, this.holdW - dt * 5);
    const hw = this.holdW * (1 - actW);
    if (hw > 0) {
      const c = this.clip('catch');
      sample(c, Math.min(duration(c), 0.8), this.tmp);
      for (const b of ARMS) nlerpBone(pose, this.tmp, b, hw);
    }

    // ---- His own carriage ----
    this.carriage(pose, v, actW);

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
    void moveW;
    const minY = inp.lift + ANKLE_Y - 0.004;
    const contact = [footL, footR];
    // A slow or standing body re-plants sooner, in small steps.
    const reach = (inp.speed < 1.5 ? 0.2 : 0.32) * scale;
    for (let s = 0; s < 2; s++) {
      const f = this.feet[s];
      const canLock = locoW + legW[s] > 0.5 && !skating;
      f.foot.getWorldPosition(vc);
      if (f.locked) {
        if (!canLock || contact[s] < 0.4 || vc.distanceTo(f.at) > reach) f.locked = false;
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
      // Letting go of a planted foot: lift it through the step instead of dragging it.
      if (!f.locked && f.w > 0 && f.w < 1) vt.y += Math.sin(Math.PI * f.w) * 0.07 * scale;
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
