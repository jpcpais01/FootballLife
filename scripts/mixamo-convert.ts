// Converts Mixamo FBX clips into the game's compact clip bundle.
//
//   node --experimental-strip-types scripts/mixamo-convert.ts <fbx dir>... [--inspect]
//
// Each clip is retargeted by world-space rotation deltas from Mixamo's T-pose
// onto our skeleton (whose rest frames are the T-pose), hips travel is scaled
// by leg length, and loops keep their measured speed while their root motion
// is taken out (the game moves the player). Writes public/anims/mocap.json.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { type Clip, analyse, fkFrame, mirrorClip, pack } from '../src/viewer/rig/clip.ts';
import { B, BONES, HIP_Y, NB, PARENT } from '../src/viewer/rig/skeleton.ts';

(globalThis as unknown as { self: unknown }).self = globalThis;
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');

interface Spec {
  /** File name without extension (first match across the input folders). */
  file: string;
  loop?: boolean;
  /** Keep sideways travel (dives carry the keeper across the goal). */
  keepX?: boolean;
  /** Seconds to keep: [start, end]. */
  trim?: [number, number];
  /** Which body part meets the ball, to find the contact frame. */
  contact?: 'rfoot' | 'lfoot' | 'foot' | 'head' | 'hands' | 'reach' | 'flight' | 'low' | number;
  /** Mirror so the canonical clip is right-footed / dives to the left. */
  mirror?: boolean;
  /** Seconds of leg draw-back to add before a strike that starts from a standstill. */
  backswing?: number;
}

/** Game clip name → source. Names ending in _m are the mirrored-side variant of the same action. */
const SPECS: Record<string, Spec> = {
  idle: { file: 'offensive idle', loop: true },
  keeperIdle: { file: 'goalkeeper idle', loop: true },
  walk: { file: 'walking', loop: true },
  jog: { file: 'jog forward', loop: true },
  run: { file: 'running', loop: true },
  sprint: { file: 'standard run', loop: true },
  walkBack: { file: 'jog backward', loop: true },
  runBack: { file: 'jog backward', loop: true },
  strafeWalkLeft: { file: 'left strafe walking', loop: true },
  strafeWalkRight: { file: 'right strafe walking', loop: true },
  strafeLeft: { file: 'jog strafe left', loop: true },
  strafeRight: { file: 'jog strafe right', loop: true },
  keeperShuffleLeft: { file: 'goalkeeper sidestep', loop: true },
  keeperShuffleRight: { file: 'goalkeeper sidestep (2)', loop: true },
  pass: { file: 'kick soccerball (2)', contact: 'rfoot', backswing: 0.3 },
  cross: { file: 'kick soccerball', contact: 'lfoot', mirror: true, backswing: 0.32 },
  shot: { file: 'strike foward jog', contact: 'rfoot' },
  chip: { file: 'soccer penalty kick', contact: 'rfoot' },
  // First touch: the sole reaches out and stops the ball, then the player moves off with it.
  trap: { file: 'receive soccerball', trim: [0.05, 1.1], contact: 0.37 },
  // A standing header; the jumping one stays hand-made.
  headerStand: { file: 'header soccerball', contact: 'head' },
  slide: { file: 'soccer tackle (2)', contact: 0.45 },
  // Keeper saves, all reaching to the keeper's left (mirrored for the right). Dives run
  // through the landing and getting back up; contact is the full stretch in the air.
  dive: { file: 'goalkeeper diving save', keepX: true, contact: 1.05 },
  diveHigh: { file: 'goalkeeper diving save (2)', keepX: true, mirror: true, contact: 0.9 },
  catch: { file: 'goalkeeper catch (2)', contact: 0.4 },
  keeperGather: { file: 'goalkeeper catch', contact: 0.72 },
  keeperScoop: { file: 'goalkeeper scoop', contact: 0.8 },
  keeperHigh: { file: 'goalkeeper catch (4)', contact: 0.78 },
  fall: { file: 'soccer trip', contact: 'low' },
  getUp: { file: 'standing up' },
  throwIn: { file: 'throw in', contact: 'hands' },
  keeperThrow: { file: 'goalkeeper overhand throw', contact: 'hands' },
  keeperKick: { file: 'goalkeeper drop kick', contact: 'rfoot' },
};

const args = process.argv.slice(2);
const inspect = args.includes('--inspect');
const specArg = args.find((a) => a.startsWith('--specs='));
const dirs = args.filter((a) => !a.startsWith('--'));
if (!dirs.length) {
  console.error('usage: mixamo-convert.ts <fbx dir>... [--inspect] [--specs=overrides.json]');
  process.exit(1);
}
if (specArg) Object.assign(SPECS, JSON.parse(fs.readFileSync(specArg.slice(8), 'utf8')));

const files = new Map<string, string>();
for (const d of dirs) for (const f of fs.readdirSync(d)) if (f.toLowerCase().endsWith('.fbx')) {
  const key = f.slice(0, -4).toLowerCase();
  if (!files.has(key)) files.set(key, path.join(d, f));
}

/**
 * three's FBX parser decides where the content ends from the file size, which
 * fails for some Mixamo exports; cut the buffer right after the last record.
 */
function tidy(buf: Buffer) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const v = dv.getUint32(23, true);
  let pos = 27;
  for (;;) {
    const end = v >= 7500 ? Number(dv.getBigUint64(pos, true)) : dv.getUint32(pos, true);
    if (!end) break;
    pos = end;
  }
  let n = pos + 176;
  if (n % 16 === 0) n++;
  const out = new Uint8Array(n);
  out.set(new Uint8Array(buf.buffer, buf.byteOffset, pos));
  return out.buffer;
}

function load(file: string) {
  return new FBXLoader().parse(tidy(fs.readFileSync(file)), '') as THREE.Group & { animations: THREE.AnimationClip[] };
}

/** Bones by our names, plus the Mixamo T-pose world rotations and hips height. */
function rig(obj: THREE.Object3D) {
  const byName = new Map<string, THREE.Bone>();
  obj.traverse((o) => {
    if ((o as THREE.Bone).isBone) byName.set(o.name.replace(/^mixamorig\d*:?/, ''), o as THREE.Bone);
  });
  const bones = BONES.map((n) => {
    const b = byName.get(n);
    if (!b) throw new Error(`missing bone ${n}`);
    return b;
  });
  return bones;
}

// The T-pose reference comes from the first file's skeleton before any animation is applied.
const refFile = files.get('x bot') ?? files.get('y bot') ?? [...files.values()][0];
const ref = load(refFile);
const refBones = rig(ref);
ref.updateMatrixWorld(true);
const restQ = refBones.map((b) => b.getWorldQuaternion(new THREE.Quaternion()).invert());
const restHips = refBones[0].getWorldPosition(new THREE.Vector3());
const unit = HIP_Y / restHips.y;
{
  // Sanity: in the T-pose the left arm points along +x and the legs straight down.
  const a = refBones[B.LeftArm].getWorldPosition(new THREE.Vector3());
  const f = refBones[B.LeftForeArm].getWorldPosition(new THREE.Vector3());
  console.log(`reference ${path.basename(refFile)}: hips ${restHips.y.toFixed(1)}cm, left arm dir ${f.sub(a).normalize().toArray().map((x) => x.toFixed(2))}`);
}

function convert(name: string, spec: Spec): Clip {
  const file = files.get(spec.file.toLowerCase());
  if (!file) throw new Error(`no file "${spec.file}"`);
  const obj = load(file);
  const bones = rig(obj);
  const anim = obj.animations[0];
  const mixer = new THREE.AnimationMixer(obj);
  // Hold the last frame instead of wrapping to the first when sampling the end.
  const action = mixer.clipAction(anim).setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();
  const fps = 30;
  const t0 = spec.trim?.[0] ?? 0;
  const t1 = Math.min(anim.duration, spec.trim?.[1] ?? anim.duration);
  const len = t1 - t0;
  const frames = spec.loop ? Math.max(2, Math.round(len * fps)) : Math.round(len * fps) + 1;
  const rot = new Float32Array(frames * NB * 4);
  const pos = new Float32Array(frames * 3);
  const D = bones.map(() => new THREE.Quaternion());
  const inv = new THREE.Quaternion();
  const hp = new THREE.Vector3();
  const start = new THREE.Vector3();
  for (let f = 0; f < frames; f++) {
    mixer.setTime(Math.min(anim.duration - 1e-4, t0 + (spec.loop ? (f / frames) * len : Math.min(len, f / fps))));
    obj.updateMatrixWorld(true);
    bones.forEach((b, i) => b.getWorldQuaternion(D[i]).multiply(restQ[i]));
    for (let i = 0; i < NB; i++) {
      const q = PARENT[i] < 0 ? D[i] : inv.copy(D[PARENT[i]]).invert().multiply(D[i]);
      rot.set([q.x, q.y, q.z, q.w], (f * NB + i) * 4);
    }
    bones[0].getWorldPosition(hp);
    if (f === 0) start.copy(hp);
    pos.set([(hp.x - restHips.x) * unit, (hp.y - restHips.y) * unit, (hp.z - restHips.z) * unit], f * 3);
  }
  // Root travel: measured over the whole take, then taken out so the game drives position.
  mixer.setTime(Math.min(t1, anim.duration - 1e-4));
  obj.updateMatrixWorld(true);
  const end = bones[0].getWorldPosition(new THREE.Vector3());
  const tx = (end.x - start.x) * unit;
  const tz = (end.z - start.z) * unit;
  const clip: Clip = { name, fps, frames, loop: !!spec.loop, rot, pos };
  const x0 = pos[0];
  const z0 = pos[2];
  for (let f = 0; f < frames; f++) {
    const u = spec.loop ? f / frames : f / (frames - 1);
    if (spec.loop) {
      pos[f * 3] -= x0 + tx * u;
      pos[f * 3 + 2] -= z0 + tz * u;
    } else {
      // Actions play where the game puts the player: no travel of their own (dives keep their sideways flight).
      pos[f * 3] = spec.keepX ? pos[f * 3] - x0 : 0;
      pos[f * 3 + 2] = 0;
    }
  }
  if (spec.loop) {
    const sp = Math.hypot(tx, tz) / len;
    clip.speed = sp < 0.05 ? 0 : sp;
    clip.dirX = sp ? tx / Math.hypot(tx, tz) : 0;
    clip.dirZ = sp ? tz / Math.hypot(tx, tz) : 1;
  }
  let out = clip;
  if (spec.contact !== undefined) out.contact = typeof spec.contact === 'number' ? spec.contact : findContact(out, spec.contact);
  if (spec.backswing && out.contact !== undefined) out = addBackswing(out, spec.contact === 'lfoot' ? 'Left' : 'Right', spec.backswing);
  if (spec.mirror) {
    const at = out.contact;
    out = mirrorClip(out, name);
    out.contact = at;
  }
  return analyse(out);
}

/**
 * Mixamo's standing kicks swing straight from a standstill. This draws the
 * kicking leg back first (hip extended, knee folded, toe pointed), then
 * swings it through into the original strike, so a pass has a wind-up.
 */
function addBackswing(c: Clip, side: 'Left' | 'Right', secs: number): Clip {
  const nb = Math.round(secs * c.fps);
  const cf = Math.max(1, Math.round(c.contact! * c.fps));
  const leg = [B[`${side}UpLeg`], B[`${side}Leg`], B[`${side}Foot`]];
  const bend = [0.6, 1.35, 0.35];
  const frames = c.frames + nb;
  const rot = new Float32Array(frames * NB * 4);
  const pos = new Float32Array(frames * 3);
  const q = (f: number, b: number) => new THREE.Quaternion().fromArray(c.rot, (f * NB + b) * 4);
  const back = leg.map((b, k) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), bend[k]).multiply(q(0, b)));
  const ease = (u: number) => u * u * (3 - 2 * u);
  for (let f = 0; f < frames; f++) {
    const src = Math.max(0, f - nb);
    rot.set(c.rot.subarray(src * NB * 4, (src + 1) * NB * 4), f * NB * 4);
    pos.set(c.pos.subarray(src * 3, src * 3 + 3), f * 3);
    leg.forEach((b, k) => {
      let r: THREE.Quaternion;
      if (f < nb) r = q(0, b).slerp(back[k], ease((f + 1) / nb));
      else if (src < cf) r = back[k].clone().slerp(q(src, b), ease(src / cf));
      else return;
      rot.set([r.x, r.y, r.z, r.w], (f * NB + b) * 4);
    });
  }
  return { ...c, frames, rot, pos, contact: c.contact! + nb / c.fps };
}

/** Joint paths over a clip in body space. */
function track(c: Clip) {
  const P = new Float32Array(NB * 3);
  const out: Float32Array[] = [];
  for (let f = 0; f < c.frames; f++) out.push(Float32Array.from(fkFrame(c, f, P)));
  return out;
}

function speedOf(T: Float32Array[], bone: number, f: number, fps: number) {
  const a = T[Math.max(0, f - 1)];
  const b = T[Math.min(T.length - 1, f + 1)];
  const span = (Math.min(T.length - 1, f + 1) - Math.max(0, f - 1)) / fps;
  return Math.hypot(b[bone * 3] - a[bone * 3], b[bone * 3 + 1] - a[bone * 3 + 1], b[bone * 3 + 2] - a[bone * 3 + 2]) / span;
}

function peak(T: Float32Array[], fps: number, score: (f: number) => number) {
  let best = -Infinity;
  let at = 0;
  for (let f = 0; f < T.length; f++) {
    const s = score(f);
    if (s > best) {
      best = s;
      at = f;
    }
  }
  return at / fps;
}

/**
 * A strike meets the ball while the swing is at full pace, low to the ground
 * and out in front of the body: the frame that best combines the three
 * (the follow-through is just as fast, but high and done).
 */
function strike(T: Float32Array[], fps: number, toe: number) {
  let top = 0;
  for (let f = 0; f < T.length; f++) top = Math.max(top, speedOf(T, toe, f, fps));
  return peak(T, fps, (f) => {
    const y = T[f][toe * 3 + 1];
    const z = T[f][toe * 3 + 2] - T[f][B.Hips * 3 + 2];
    const g = T[Math.min(T.length - 1, f + 1)][toe * 3 + 2] - T[Math.max(0, f - 1)][toe * 3 + 2];
    // Only on the way through: the foot coming back down is quick and low too.
    if (g <= 0) return -Infinity;
    return speedOf(T, toe, f, fps) / top + z * 2 - Math.max(0, y - 0.3) * 6;
  });
}

function findContact(c: Clip, kind: Exclude<Spec['contact'], number | undefined>) {
  const T = track(c);
  const fps = c.fps;
  switch (kind) {
    case 'rfoot': return strike(T, fps, B.RightToeBase);
    case 'lfoot': return strike(T, fps, B.LeftToeBase);
    case 'foot': return peak(T, fps, (f) => Math.max(speedOf(T, B.RightToeBase, f, fps), speedOf(T, B.LeftToeBase, f, fps)));
    case 'head': return peak(T, fps, (f) => speedOf(T, B.Head, f, fps));
    case 'hands': return peak(T, fps, (f) => speedOf(T, B.LeftHand, f, fps) + speedOf(T, B.RightHand, f, fps));
    case 'reach': return peak(T, fps, (f) => Math.abs(T[f][B.LeftHand * 3] + T[f][B.RightHand * 3]));
    case 'flight': return peak(T, fps, (f) => Math.abs(speedOf(T, B.Hips, f, fps)) * (T[f][1] > 0.35 ? 1 : 0));
    case 'low': return peak(T, fps, (f) => -T[f][1]);
  }
}

/** Prints what each file does, to choose the mapping. */
function inspectAll() {
  for (const [key] of [...files].sort()) {
    if (key.includes('bot')) continue;
    try {
      const c = convert(key, { file: key });
      const T = track(c);
      const fps = c.fps;
      const pk = (b: number) => {
        let best = 0, at = 0;
        for (let f = 0; f < T.length; f++) {
          const s = speedOf(T, b, f, fps);
          if (s > best) { best = s; at = f; }
        }
        return `${best.toFixed(1)}@${(at / fps).toFixed(2)}`;
      };
      let lowHips = Infinity;
      for (const t of T) lowHips = Math.min(lowHips, t[1]);
      console.log(`${key.padEnd(30)} ${(c.frames / fps).toFixed(2)}s  hipsMin ${lowHips.toFixed(2)}  Rtoe ${pk(B.RightToeBase)}  Ltoe ${pk(B.LeftToeBase)}  head ${pk(B.Head)}  Rhand ${pk(B.RightHand)}  Lhand ${pk(B.LeftHand)}`);
    } catch (e) {
      console.log(key, 'ERR', (e as Error).message);
    }
  }
}

if (inspect) {
  inspectAll();
} else {
  const out: ReturnType<typeof pack>[] = [];
  for (const [name, spec] of Object.entries(SPECS)) {
    try {
      const c = convert(name, spec);
      out.push(pack(c));
      console.log(`${name.padEnd(16)} ← ${spec.file.padEnd(28)} ${c.frames} frames${c.loop ? `  speed ${(c.speed ?? 0).toFixed(2)} dir (${(c.dirX ?? 0).toFixed(2)}, ${(c.dirZ ?? 0).toFixed(2)})` : ''}${c.contact !== undefined ? `  contact ${c.contact.toFixed(2)}s` : ''}`);
    } catch (e) {
      console.log(`${name.padEnd(16)} skipped: ${(e as Error).message}`);
    }
  }
  const dest = path.resolve('public/anims/mocap.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify({ version: 1, clips: out }));
  console.log(`wrote ${out.length} clips, ${(fs.statSync(dest).size / 1024).toFixed(0)} KB → ${dest}`);
}
