// Animation clips in one compact form, whether hand-made in code or converted
// from mocap: per frame, a local rotation for every bone and the hips offset.
// Loops are analysed once for their speed, direction and foot contacts, which
// the animator uses for stride sync and foot locking.
import { ANKLE_Y, B, MIRROR, NB, PARENT, REST } from './skeleton.ts';

export interface Clip {
  name: string;
  fps: number;
  frames: number;
  loop: boolean;
  /** frames × NB × 4: local rotations (x, y, z, w) from the T-pose rest. */
  rot: Float32Array;
  /** frames × 3: hips offset from rest, body units. */
  pos: Float32Array;
  /** Seconds into the clip when the foot, head or hands meet the ball. */
  contact?: number;
  // Filled by analyse() for loops:
  /** Travel speed (body units / s) and direction in the body's x-z plane. */
  speed?: number;
  dirX?: number;
  dirZ?: number;
  /** frames × 2: 1 while the left / right foot is planted. */
  feet?: Float32Array;
  /** Frame where the left foot strikes the ground, so cycles share a phase. */
  phase0?: number;
}

export const duration = (c: Clip) => (c.loop ? c.frames : Math.max(1, c.frames - 1)) / c.fps;

export class Pose {
  q = new Float32Array(NB * 4);
  p = new Float32Array(3);
  constructor() {
    for (let i = 0; i < NB; i++) this.q[i * 4 + 3] = 1;
  }
  copy(o: Pose) {
    this.q.set(o.q);
    this.p.set(o.p);
    return this;
  }
}

/** Samples a clip at `t` seconds (wrapped for loops, clamped otherwise). */
export function sample(c: Clip, t: number, out: Pose) {
  let f = t * c.fps;
  let i0: number;
  let i1: number;
  if (c.loop) {
    f = ((f % c.frames) + c.frames) % c.frames;
    i0 = Math.floor(f);
    i1 = (i0 + 1) % c.frames;
  } else {
    f = Math.min(c.frames - 1, Math.max(0, f));
    i0 = Math.floor(f);
    i1 = Math.min(c.frames - 1, i0 + 1);
  }
  const k = f - i0;
  sampleFrames(c, i0, i1, k, out);
}

/** Samples a loop at normalised phase 0..1, counted from its left foot strike. */
export function sampleLoopPhase(c: Clip, phase: number, out: Pose) {
  const f = (((phase - Math.floor(phase)) * c.frames + (c.phase0 ?? 0)) % c.frames + c.frames) % c.frames;
  const i0 = Math.floor(f);
  sampleFrames(c, i0, (i0 + 1) % c.frames, f - i0, out);
}

function sampleFrames(c: Clip, i0: number, i1: number, k: number, out: Pose) {
  const r = c.rot;
  const q = out.q;
  const a0 = i0 * NB * 4;
  const b0 = i1 * NB * 4;
  for (let j = 0; j < NB * 4; j += 4) {
    const ax = r[a0 + j], ay = r[a0 + j + 1], az = r[a0 + j + 2], aw = r[a0 + j + 3];
    let bx = r[b0 + j], by = r[b0 + j + 1], bz = r[b0 + j + 2], bw = r[b0 + j + 3];
    if (ax * bx + ay * by + az * bz + aw * bw < 0) {
      bx = -bx; by = -by; bz = -bz; bw = -bw;
    }
    const x = ax + (bx - ax) * k, y = ay + (by - ay) * k, z = az + (bz - az) * k, w = aw + (bw - aw) * k;
    const n = 1 / Math.hypot(x, y, z, w);
    q[j] = x * n; q[j + 1] = y * n; q[j + 2] = z * n; q[j + 3] = w * n;
  }
  for (let j = 0; j < 3; j++) out.p[j] = c.pos[i0 * 3 + j] + (c.pos[i1 * 3 + j] - c.pos[i0 * 3 + j]) * k;
}

/** Sets `out` to zero weight, ready for accumulate(). */
export function clearPose(out: Pose) {
  out.q.fill(0);
  out.p.fill(0);
}

/** Adds `w` of `src` into an accumulator (call normalisePose after). */
export function accumulate(acc: Pose, src: Pose, w: number) {
  if (w <= 0) return;
  const a = acc.q;
  const s = src.q;
  for (let j = 0; j < NB * 4; j += 4) {
    // Keep every contribution in the same hemisphere as what's accumulated so far.
    const d = a[j] * s[j] + a[j + 1] * s[j + 1] + a[j + 2] * s[j + 2] + a[j + 3] * s[j + 3];
    const sw = d < 0 ? -w : w;
    a[j] += s[j] * sw; a[j + 1] += s[j + 1] * sw; a[j + 2] += s[j + 2] * sw; a[j + 3] += s[j + 3] * sw;
  }
  for (let j = 0; j < 3; j++) acc.p[j] += src.p[j] * w;
}

export function normalisePose(acc: Pose, totalW: number) {
  const a = acc.q;
  for (let j = 0; j < NB * 4; j += 4) {
    const n = Math.hypot(a[j], a[j + 1], a[j + 2], a[j + 3]);
    if (n < 1e-6) {
      a[j] = a[j + 1] = a[j + 2] = 0;
      a[j + 3] = 1;
    } else {
      a[j] /= n; a[j + 1] /= n; a[j + 2] /= n; a[j + 3] /= n;
    }
  }
  if (totalW > 0) for (let j = 0; j < 3; j++) acc.p[j] /= totalW;
}

/** out = a blended toward b by w (per-bone nlerp). `out` may be `a`. */
export function mixPose(out: Pose, a: Pose, b: Pose, w: number) {
  if (w <= 0) {
    if (out !== a) out.copy(a);
    return;
  }
  if (w >= 1) {
    out.copy(b);
    return;
  }
  for (let j = 0; j < NB * 4; j += 4) {
    const ax = a.q[j], ay = a.q[j + 1], az = a.q[j + 2], aw = a.q[j + 3];
    let bx = b.q[j], by = b.q[j + 1], bz = b.q[j + 2], bw = b.q[j + 3];
    if (ax * bx + ay * by + az * bz + aw * bw < 0) {
      bx = -bx; by = -by; bz = -bz; bw = -bw;
    }
    const x = ax + (bx - ax) * w, y = ay + (by - ay) * w, z = az + (bz - az) * w, ww = aw + (bw - aw) * w;
    const n = 1 / Math.hypot(x, y, z, ww);
    out.q[j] = x * n; out.q[j + 1] = y * n; out.q[j + 2] = z * n; out.q[j + 3] = ww * n;
  }
  for (let j = 0; j < 3; j++) out.p[j] = a.p[j] + (b.p[j] - a.p[j]) * w;
}

/** The same motion on the other side of the body (a dive left from a dive right). */
export function mirrorClip(c: Clip, name: string): Clip {
  const rot = new Float32Array(c.rot.length);
  const pos = new Float32Array(c.pos.length);
  for (let f = 0; f < c.frames; f++) {
    for (let i = 0; i < NB; i++) {
      const s = (f * NB + MIRROR[i]) * 4;
      const d = (f * NB + i) * 4;
      rot[d] = c.rot[s];
      rot[d + 1] = -c.rot[s + 1];
      rot[d + 2] = -c.rot[s + 2];
      rot[d + 3] = c.rot[s + 3];
    }
    pos[f * 3] = -c.pos[f * 3];
    pos[f * 3 + 1] = c.pos[f * 3 + 1];
    pos[f * 3 + 2] = c.pos[f * 3 + 2];
  }
  const m: Clip = { ...c, name, rot, pos, dirX: c.dirX === undefined ? undefined : -c.dirX };
  delete m.feet;
  if (c.loop) analyse(m);
  return m;
}

// ---------- Forward kinematics on plain arrays ----------

const OFF = REST.map((r, i) => (PARENT[i] < 0 ? r : [r[0] - REST[PARENT[i]][0], r[1] - REST[PARENT[i]][1], r[2] - REST[PARENT[i]][2]]));

/** World (body-space) joint positions for one frame: NB × 3. */
export function fkFrame(c: Clip, f: number, outPos: Float32Array, wq = new Float32Array(NB * 4)) {
  for (let i = 0; i < NB; i++) {
    const q0 = (f * NB + i) * 4;
    const lx = c.rot[q0], ly = c.rot[q0 + 1], lz = c.rot[q0 + 2], lw = c.rot[q0 + 3];
    const p = PARENT[i];
    if (p < 0) {
      wq.set([lx, ly, lz, lw], 0);
      outPos[0] = REST[0][0] + c.pos[f * 3];
      outPos[1] = REST[0][1] + c.pos[f * 3 + 1];
      outPos[2] = REST[0][2] + c.pos[f * 3 + 2];
      continue;
    }
    const px = wq[p * 4], py = wq[p * 4 + 1], pz = wq[p * 4 + 2], pw = wq[p * 4 + 3];
    // world rotation = parent world * local
    wq[i * 4] = pw * lx + px * lw + py * lz - pz * ly;
    wq[i * 4 + 1] = pw * ly - px * lz + py * lw + pz * lx;
    wq[i * 4 + 2] = pw * lz + px * ly - py * lx + pz * lw;
    wq[i * 4 + 3] = pw * lw - px * lx - py * ly - pz * lz;
    // position = parent position + parent world rotation applied to the rest offset
    const [ox, oy, oz] = OFF[i];
    const tx = 2 * (py * oz - pz * oy), ty = 2 * (pz * ox - px * oz), tz = 2 * (px * oy - py * ox);
    outPos[i * 3] = outPos[p * 3] + ox + pw * tx + (py * tz - pz * ty);
    outPos[i * 3 + 1] = outPos[p * 3 + 1] + oy + pw * ty + (pz * tx - px * tz);
    outPos[i * 3 + 2] = outPos[p * 3 + 2] + oz + pw * tz + (px * ty - py * tx);
  }
  return outPos;
}

const TOE_Y = REST[B.LeftToeBase][1];

/** Measures a loop's travel speed, direction, foot contacts and left-foot strike. */
export function analyse(c: Clip) {
  if (!c.loop) return c;
  const n = c.frames;
  const P = new Float32Array(NB * 3);
  const foot = new Float32Array(n * 4 * 3); // per frame: L ankle, R ankle, L toe, R toe
  const ids = [B.LeftFoot, B.RightFoot, B.LeftToeBase, B.RightToeBase];
  for (let f = 0; f < n; f++) {
    fkFrame(c, f, P);
    ids.forEach((id, k) => foot.set([P[id * 3], P[id * 3 + 1], P[id * 3 + 2]], (f * 4 + k) * 3));
  }
  // How high each foot is off its own planted height, per frame.
  const h = new Float32Array(n * 2);
  let lo = Infinity;
  for (let f = 0; f < n; f++) {
    for (let s = 0; s < 2; s++) {
      const ankle = foot[(f * 4 + s) * 3 + 1] - ANKLE_Y;
      const toe = foot[(f * 4 + 2 + s) * 3 + 1] - TOE_Y;
      h[f * 2 + s] = Math.min(ankle, toe);
      lo = Math.min(lo, h[f * 2 + s]);
    }
  }
  const feet = new Float32Array(n * 2);
  for (let i = 0; i < n * 2; i++) feet[i] = h[i] < lo + 0.045 ? 1 : 0;
  // A planted foot slides backwards in an in-place loop at the speed the body travels.
  let vx = 0;
  let vz = 0;
  let cnt = 0;
  for (let f = 0; f < n; f++) {
    const g = (f + 1) % n;
    for (let s = 0; s < 2; s++) {
      if (!feet[f * 2 + s] || !feet[g * 2 + s]) continue;
      vx += foot[(g * 4 + s) * 3] - foot[(f * 4 + s) * 3];
      vz += foot[(g * 4 + s) * 3 + 2] - foot[(f * 4 + s) * 3 + 2];
      cnt++;
    }
  }
  // Mocap measured with its root motion keeps that speed; in-place loops use the feet.
  if (c.speed === undefined) {
    const sp = cnt ? Math.hypot(vx, vz) / cnt * c.fps : 0;
    c.speed = sp < 0.05 ? 0 : sp;
    c.dirX = sp ? -vx / Math.hypot(vx, vz) : 0;
    c.dirZ = sp ? -vz / Math.hypot(vx, vz) : 1;
  }
  c.feet = feet;
  c.phase0 = 0;
  for (let f = 0; f < n; f++) {
    if (feet[f * 2] && !feet[((f - 1 + n) % n) * 2]) {
      c.phase0 = f;
      break;
    }
  }
  return c;
}

/** Planted weight of each foot at a loop phase (from the left strike). */
export function feetAt(c: Clip, phase: number, out: [number, number]) {
  if (!c.feet) {
    out[0] = out[1] = 0;
    return out;
  }
  const f = Math.floor(((phase - Math.floor(phase)) * c.frames + (c.phase0 ?? 0)) % c.frames);
  out[0] = c.feet[f * 2];
  out[1] = c.feet[f * 2 + 1];
  return out;
}

// ---------- Compact storage (mocap bundles) ----------

export interface PackedClip {
  name: string;
  fps: number;
  frames: number;
  loop: boolean;
  contact?: number;
  /** Travel speed (body units / s) and direction measured from the mocap's root motion. */
  speed?: number;
  dirX?: number;
  dirZ?: number;
  /** base64 Int16: frames × NB × 3 (x, y, z of a w ≥ 0 quaternion, × 32767). */
  rot: string;
  /** base64 Int16: frames × 3 hips offset in millimetres of body space. */
  pos: string;
}

function b64ToI16(s: string) {
  const bin = typeof atob === 'function' ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Int16Array(u8.buffer);
}

function i16ToB64(a: Int16Array) {
  const u8 = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
}

export function unpack(p: PackedClip): Clip {
  const r = b64ToI16(p.rot);
  const h = b64ToI16(p.pos);
  const rot = new Float32Array(p.frames * NB * 4);
  for (let i = 0; i < p.frames * NB; i++) {
    const x = r[i * 3] / 32767, y = r[i * 3 + 1] / 32767, z = r[i * 3 + 2] / 32767;
    rot.set([x, y, z, Math.sqrt(Math.max(0, 1 - x * x - y * y - z * z))], i * 4);
  }
  const pos = new Float32Array(p.frames * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = h[i] / 1000;
  return analyse({ name: p.name, fps: p.fps, frames: p.frames, loop: p.loop, contact: p.contact, speed: p.speed, dirX: p.dirX, dirZ: p.dirZ, rot, pos });
}

export function pack(c: Clip): PackedClip {
  const r = new Int16Array(c.frames * NB * 3);
  for (let i = 0; i < c.frames * NB; i++) {
    const s = c.rot[i * 4 + 3] < 0 ? -1 : 1;
    for (let k = 0; k < 3; k++) r[i * 3 + k] = Math.round(Math.max(-1, Math.min(1, c.rot[i * 4 + k] * s)) * 32767);
  }
  const h = new Int16Array(c.frames * 3);
  for (let i = 0; i < h.length; i++) h[i] = Math.round(Math.max(-32, Math.min(32, c.pos[i])) * 1000);
  const round = (x: number | undefined) => (x === undefined ? undefined : Math.round(x * 1000) / 1000);
  return { name: c.name, fps: c.fps, frames: c.frames, loop: c.loop, contact: round(c.contact), speed: round(c.speed), dirX: round(c.dirX), dirZ: round(c.dirZ), rot: i16ToB64(r), pos: i16ToB64(h) };
}
