// Footballers: athletic figures in club kits. The whole body is one skinned
// mesh over a Mixamo-named skeleton (rig/skeleton.ts), its triangles indexing
// into a small per-player palette texture, so a player is a single draw call
// and one material. Motion comes from rig/animator.ts: mocap or hand-made
// clips blended by velocity, timed actions, head tracking and foot IK.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BOOT_COLORS, EYE_COLORS, HAIR_COLORS, SKIN_TONES, sanitizeAppearance, type Appearance } from '../../shared/appearance.ts';
import { gear, type Equipped, type Item } from '../../shared/cosmetics.ts';
import { type ActOpts, type ActionKind, type AnimInput, Animator } from './rig/animator.ts';
import { duration } from './rig/clip.ts';
import { getClip, hasClip, loadMocap } from './rig/library.ts';
import { ARM_BIND, B, REST, makeBones, setBindPose } from './rig/skeleton.ts';

export interface Kit {
  primary: string;
  secondary: string;
}

/**
 * World metres per body unit. The body is modelled about 2.2 units tall, so
 * this makes a 1.8 m player against the real 105 x 68 m pitch, 7.32 m goals
 * and 22 cm ball. Showcase scenes (portraits, the kit turntable) pass their own.
 */
export const LIFE_SCALE = 0.82;
/** The larger, closer-up size the drills, portraits and kit turntable are framed for. */
export const SHOWCASE_SCALE = 1.45;

// ---------- Palette ----------

const S = {Shirt: 0, Trim: 1, Shorts: 2, Sock: 3, Skin: 4, Hair: 5, Boot: 6, BootAccent: 7, Dark: 8, EyeWhite: 9, Lip: 10, Glove: 11, Wrist: 12, Band: 13, Neck: 14, Gold: 15, Stubble: 16, Base: 17, Sole: 18, Iris: 19, Brow: 20, Socket: 21, Teeth: 22, Mark: 23, Scar: 24, Blush: 25, StubbleDark: 26, Count: 27} as const;
const uvOf = (slot: number) => (slot + 0.5) / S.Count;

/** Slot per triangle, from its centroid in the piece's own frame (and its index). */
type Paint = number | ((c: THREE.Vector3, tri: number) => number);

/** Smooths a piece, then gives every triangle a single palette slot. */
function paint(g: THREE.BufferGeometry, slot: Paint): THREE.BufferGeometry {
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  let m = mergeVertices(g, 1e-4);
  m.computeVertexNormals();
  m = m.toNonIndexed();
  const pos = m.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  const c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    c.set(
      (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3,
      (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3,
      (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3,
    );
    const u = uvOf(typeof slot === 'number' ? slot : slot(c, i / 3));
    for (let k = 0; k < 3; k++) {
      uv[(i + k) * 2] = u;
      uv[(i + k) * 2 + 1] = 0.5;
    }
  }
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return m;
}

function ball(r: number, w = 14, h = 10) {
  return new THREE.SphereGeometry(r, w, h);
}
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
const merge = (parts: THREE.BufferGeometry[]) => mergeGeometries(parts)!;

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.computeBoundingSphere();
    geoCache.set(key, g);
  }
  return g;
}

// ---------- Head ----------

const HEAD_C = new THREE.Vector3(0, 0.17, 0.01);
const HEAD_R = 0.155;

/** Face proportions: width, jaw taper, height, chin flattening and cheekbone width. */
interface FaceK { w: number; jaw: number; h: number; flat: number; cheek: number }
const FACE_K: FaceK[] = [
  { w: 1, jaw: 0.2, h: 1.15, flat: 0, cheek: 0 }, // oval
  { w: 1.06, jaw: 0.1, h: 1.08, flat: 0, cheek: 0.03 }, // round
  { w: 1.04, jaw: 0.04, h: 1.12, flat: 0.55, cheek: 0 }, // square
  { w: 0.95, jaw: 0.18, h: 1.24, flat: 0, cheek: 0 }, // long
  { w: 1.04, jaw: 0.34, h: 1.13, flat: 0, cheek: 0.04 }, // heart
  { w: 1.0, jaw: 0.3, h: 1.17, flat: 0.25, cheek: 0.07 }, // angular
];
let fk: FaceK = FACE_K[0];

/** Shapes a sphere around the head centre into a skull with a jaw and chin. */
function sculpt(g: THREE.BufferGeometry, r = HEAD_R) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    let y = p.getY(i);
    let z = p.getZ(i);
    const low = Math.max(0, -y / r);
    const mid = Math.max(0, 1 - Math.abs(y / r + 0.1) * 3);
    x *= fk.w * (1 - fk.jaw * low * low) * (1 + fk.cheek * mid);
    if (z > 0) z *= 1 + 0.08 * low;
    if (z < 0 && y > -0.2 * r) z *= 1.06;
    // A flatter, broader chin for square and angular faces.
    if (fk.flat && low > 0.72) y = -r * (0.72 + (low - 0.72) * (1 - fk.flat));
    p.setXYZ(i, x, y * fk.h, z * 1.04);
  }
  return g;
}

/** Point on the face surface at (x, yRel) from the head centre, nudged out by `out`. */
function onFace(x: number, yRel: number, out = 0) {
  const y0 = yRel / fk.h;
  const low = Math.max(0, -y0 / HEAD_R);
  const mid = Math.max(0, 1 - Math.abs(y0 / HEAD_R + 0.1) * 3);
  const x0 = x / (fk.w * (1 - fk.jaw * low * low) * (1 + fk.cheek * mid));
  const zz = Math.sqrt(Math.max(0, HEAD_R * HEAD_R - x0 * x0 - y0 * y0));
  return HEAD_C.z + zz * (1 + 0.08 * low) * 1.04 + out;
}

/** Puts a small part on the face at (x, y), turned to follow the surface. */
function onSkin(g: THREE.BufferGeometry, x: number, y: number, out = 0, turn = 1) {
  const z = onFace(x, y, out);
  g.rotateY(Math.asin(Math.max(-0.9, Math.min(0.9, x / HEAD_R))) * 0.8 * turn);
  return at(g, x, HEAD_C.y + y, z);
}

/**
 * A hair shell around the skull. Vertices below the hairline (high at the
 * forehead, low at the nape) tuck inside the head, which leaves a soft edge.
 */
function hairCap(r: number, front: number, back: number, opts: { segs?: number; puff?: number; dy?: number; dz?: number; sides?: number; ripple?: number; slot?: number } = {}) {
  const segs = opts.segs ?? 60;
  // Poles turned to the ears, where they sink under the hairline, so the crown has no pinch.
  const g = new THREE.SphereGeometry(r, segs, Math.round(segs * 0.7)).rotateZ(Math.PI / 2);
  const p = g.attributes.position;
  const d = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    const phi = Math.atan2(d.x, d.z);
    // Around the ears the line dips a little less, framing the face; `sides` lifts it for fades.
    const side = Math.max(0, Math.cos(Math.abs(phi) - Math.PI / 2));
    const line = front - (front - back) * (1 - Math.cos(phi)) * 0.5 + side * (0.08 + (opts.sides ?? 0));
    // Below the line the shell sinks into the skull over a short band, so the hairline is a smooth curve.
    const t = Math.min(1, Math.max(0, (d.y - line + 0.1) / 0.14));
    const k = t * t * (3 - 2 * t);
    const rip = opts.ripple ? 1 + opts.ripple * Math.sin(d.z * 38 + d.x * 6) * Math.min(1, Math.max(0, d.y - line) * 6) : 1;
    const full = r * (1 + (opts.puff ?? 0) * Math.max(0, d.y - line)) * rip;
    d.multiplyScalar(HEAD_R * 0.95 + (full - HEAD_R * 0.95) * k);
    p.setXYZ(i, d.x, d.y, d.z);
  }
  sculpt(g, r);
  return paint(at(g, HEAD_C.x, HEAD_C.y + (opts.dy ?? 0), HEAD_C.z + (opts.dz ?? 0)), opts.slot ?? S.Hair);
}

function hairGeo(style: number): THREE.BufferGeometry[] {
  const C = HEAD_C;
  const blob = (r: number, sx: number, sy: number, sz: number, x: number, y: number, z: number) => paint(at(ball(r, 16, 12).scale(sx, sy, sz), C.x + x, C.y + y, C.z + z), S.Hair);
  const R = HEAD_R;
  // Points over the crown (Fibonacci spread), kept behind the hairline.
  const crown = (n: number, margin: number, each: (d: THREE.Vector3, i: number) => void) => {
    for (let i = 0; i < n; i++) {
      const yv = 1 - (i / (n - 1)) * 1.1;
      const rr = Math.sqrt(Math.max(0, 1 - yv * yv));
      const a = i * 2.39996;
      const d = new THREE.Vector3(Math.sin(a) * rr, yv, Math.cos(a) * rr);
      const line = 0.46 - 0.91 * (1 - Math.cos(Math.atan2(d.x, d.z))) * 0.5;
      if (d.y < line + margin) continue;
      each(d, i);
    }
  };
  switch (style) {
    case 0: return [hairCap(R * 1.018, 0.5, -0.5)];
    case 1: return [hairCap(R * 1.06, 0.46, -0.48, { puff: 0.06 }), blob(0.07, 1.55, 0.5, 0.95, 0, 0.135, 0.055)];
    case 2: return [hairCap(R * 1.05, 0.5, -0.45, { puff: 0.12 })];
    case 3: return [hairCap(R * 1.05, 0.5, -0.5, { puff: 0.05 }), blob(0.075, 1.35, 0.85, 1.5, 0, 0.16, 0.075)];
    case 4: {
      const out = [hairCap(R * 1.06, 0.46, -0.45)];
      crown(30, 0.08, (d) => out.push(blob(0.04, 1, 1, 1, d.x * 0.168, d.y * 0.19, d.z * 0.172)));
      return out;
    }
    case 5: return [hairCap(0.19, 0.44, -0.3, { segs: 44, puff: 0.3, dy: 0.02, dz: -0.02 })];
    case 6: {
      const back = paint(at(new THREE.CapsuleGeometry(0.12, 0.17, 6, 16).scale(1.32, 1, 0.55), C.x, C.y - 0.1, C.z - 0.105), S.Hair);
      return [hairCap(R * 1.06, 0.44, -0.75, { puff: 0.07 }), back];
    }
    case 7: return [hairCap(R * 1.04, 0.48, -0.5), blob(0.07, 1, 0.92, 1, 0, 0.17, -0.12)];
    case 8: {
      const out = [hairCap(R * 1.012, 0.5, -0.5)];
      out.push(blob(0.05, 0.5, 1.1, 2.6, 0, 0.13, -0.03));
      for (let i = 0; i < 7; i++) {
        const a = -1.25 + i * 0.3;
        const spike = new THREE.ConeGeometry(0.036, 0.14 - Math.abs(i - 3) * 0.012, 8).rotateX(a);
        out.push(paint(at(spike, C.x, C.y + Math.cos(a) * 0.19, C.z + Math.sin(a) * 0.17), S.Hair));
      }
      return out;
    }
    case 10: // fade: a fuller top over skin-tight sides
      return [hairCap(R * 1.008, 0.5, -0.55, { slot: S.StubbleDark }), hairCap(R * 1.06, 0.5, -0.1, { puff: 0.1, sides: 0.42 })];
    case 11: // slick back
      return [hairCap(R * 1.05, 0.56, -0.5, { puff: 0.04 }), blob(0.08, 1.45, 0.6, 1.6, 0, 0.14, -0.02)];
    case 12: // side part: volume swept to one side
      return [hairCap(R * 1.055, 0.5, -0.5, { puff: 0.08 }), blob(0.072, 1.35, 0.55, 1.35, 0.03, 0.145, 0.02)];
    case 13: // fringe: the hairline comes down over the forehead
      return [hairCap(R * 1.065, 0.26, -0.5, { puff: 0.04 })];
    case 14: { // spiky
      const out = [hairCap(R * 1.04, 0.48, -0.5)];
      crown(26, 0.12, (d) => {
        const cone = new THREE.ConeGeometry(0.024, 0.07, 6);
        const up = d.clone().add(new THREE.Vector3(0, 1.1, 0)).normalize();
        cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up));
        out.push(paint(at(cone, C.x + d.x * 0.17, C.y + d.y * 0.19 + 0.01, C.z + d.z * 0.175), S.Hair));
      });
      return out;
    }
    case 15: // waves
      return [hairCap(R * 1.035, 0.5, -0.48, { puff: 0.04, ripple: 0.035, segs: 56 })];
    case 16: { // dreads
      const out = [hairCap(R * 1.05, 0.46, -0.5, { puff: 0.05 })];
      for (let i = 0; i < 18; i++) {
        const a = Math.PI * 0.3 + (i / 17) * Math.PI * 1.4;
        const len = 0.15 + (i % 3) * 0.025;
        const x = Math.sin(a) * 0.158 * fk.w;
        const z = Math.cos(a) * 0.15;
        const lock = new THREE.CapsuleGeometry(0.017, len, 4, 8).translate(0, -len / 2, 0).rotateX(-z * 0.9).rotateZ(x * 0.9);
        out.push(paint(at(lock, C.x + x, C.y + 0.07, C.z + z), S.Hair));
      }
      return out;
    }
    case 17: { // cornrows: braided rows running from the hairline back over the crown
      const beads: THREE.BufferGeometry[] = [];
      for (let i = -3; i <= 3; i++) {
        const th = i * 0.19;
        for (let ph = 0.92 - Math.abs(i) * 0.06; ph > -1.95; ph -= 0.075) {
          const d = new THREE.Vector3(Math.sin(th), Math.cos(th) * Math.cos(ph), Math.cos(th) * Math.sin(ph)).multiplyScalar(R * 1.03);
          beads.push(ball(0.0105, 6, 4).translate(d.x, d.y, d.z));
        }
      }
      const rows = paint(at(sculpt(merge(beads), R), C.x, C.y, C.z), S.Hair);
      return [hairCap(R * 1.012, 0.5, -0.5), rows];
    }
    case 18: // man bun
      return [hairCap(R * 1.045, 0.54, -0.55, { puff: 0.03 }), blob(0.058, 1, 0.9, 1, 0, 0.19, -0.06)];
    case 19: { // mullet
      const back = paint(at(new THREE.CapsuleGeometry(0.1, 0.11, 6, 14).scale(1.25, 1, 0.5), C.x, C.y - 0.13, C.z - 0.11), S.Hair);
      return [hairCap(R * 1.05, 0.48, -0.7, { puff: 0.06 }), back];
    }
    default: return [];
  }
}

function beardGeo(kind: number): THREE.BufferGeometry[] {
  if (!kind) return [];
  const C = HEAD_C;
  const shell = (r: number, phiLen: number, thStart: number, thLen: number, slot: number) => {
    const g = new THREE.SphereGeometry(r, 26, 10, Math.PI / 2 - phiLen / 2, phiLen, thStart, thLen);
    // SphereGeometry's front (+z) is at phi = PI/2 with x mirrored; flip x so it wraps the face.
    g.scale(-1, 1, 1);
    return paint(at(sculpt(g, r), C.x, C.y, C.z), slot);
  };
  const tache = (slot: number = S.Hair) => paint(at(new THREE.CapsuleGeometry(0.012, 0.055, 4, 8).rotateZ(Math.PI / 2), 0, C.y - 0.07, onFace(0, -0.07, 0.006)), slot);
  const goatee = () => paint(at(ball(0.035, 12, 8).scale(1, 1.2, 0.8), 0, C.y - 0.155, onFace(0, -0.155, -0.006)), S.Hair);
  switch (kind) {
    case 1: return [shell(HEAD_R * 1.012, 3.4, Math.PI * 0.6, Math.PI * 0.36, S.Stubble)];
    case 2: return [tache(), goatee()];
    case 3: return [shell(HEAD_R * 1.05, 3.6, Math.PI * 0.58, Math.PI * 0.4, S.Hair), tache()];
    case 4: return [tache()];
    case 5: return [shell(HEAD_R * 1.016, 3.5, Math.PI * 0.58, Math.PI * 0.38, S.StubbleDark), tache(S.StubbleDark)];
    case 6: return [shell(HEAD_R * 1.03, 3.7, Math.PI * 0.62, Math.PI * 0.08, S.Hair), shell(HEAD_R * 1.03, 1.1, Math.PI * 0.7, Math.PI * 0.28, S.Hair)];
    case 7: {
      const side = (sx: number) => paint(at(new THREE.CapsuleGeometry(0.008, 0.06, 4, 6).rotateZ(sx * 0.12), sx * 0.04, C.y - 0.11, onFace(sx * 0.04, -0.11, 0.004)), S.Hair);
      return [tache(), goatee(), side(-1), side(1)];
    }
    case 8: {
      const long = paint(at(new THREE.CapsuleGeometry(0.06, 0.06, 6, 14).scale(1.25, 1, 0.75), 0, C.y - 0.21, onFace(0, -0.16, -0.03)), S.Hair);
      return [shell(HEAD_R * 1.06, 3.6, Math.PI * 0.56, Math.PI * 0.42, S.Hair), tache(), long];
    }
    case 9: return [paint(at(ball(0.013, 10, 8).scale(1, 1.3, 0.6), 0, C.y - 0.115, onFace(0, -0.115, 0.002)), S.Hair)];
    default: return [];
  }
}

/** Eye shapes: white size and tilt, iris size, and how far the lid comes down. */
const EYE_K = [
  { sx: 1, sy: 0.86, tilt: 0, iris: 0.0125, lid: 0 },
  { sx: 1.12, sy: 0.64, tilt: 0.1, iris: 0.0118, lid: 0.15 },
  { sx: 1.12, sy: 0.48, tilt: 0.04, iris: 0.011, lid: 0.3 },
  { sx: 1.02, sy: 0.6, tilt: -0.06, iris: 0.0118, lid: 0.55 },
  { sx: 1.22, sy: 0.82, tilt: 0, iris: 0.0132, lid: 0 },
  { sx: 1.06, sy: 0.62, tilt: 0.3, iris: 0.0118, lid: 0.1 },
];

function eyesGeo(app: Appearance): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const e = EYE_K[app.eyes] ?? EYE_K[1];
  const focused = app.face === 1 || app.face === 5;
  const sy = e.sy * (focused ? 0.82 : 1);
  for (const sx of [-1, 1]) {
    const ey = 0.022;
    const ex = sx * 0.054 * (fk.w > 1.02 ? 1.03 : 1);
    const tilt = sx * e.tilt;
    // Socket shadow, then the eyeball, iris, pupil and a catchlight.
    out.push(onSkin(paint(ball(0.03, 12, 8).scale(1.15 * e.sx, 0.85, 0.3).rotateZ(tilt), S.Socket), ex, ey + 0.002, -0.009));
    out.push(onSkin(paint(ball(0.024, 14, 10).scale(e.sx, 0.72 * sy, 0.45).rotateZ(tilt), S.EyeWhite), ex, ey, -0.004));
    out.push(onSkin(paint(ball(e.iris, 12, 8).scale(1, 1, 0.45), S.Iris), ex, ey - 0.001, 0.0035));
    out.push(onSkin(paint(ball(e.iris * 0.5, 8, 6).scale(1, 1, 0.4), S.Dark), ex, ey - 0.001, 0.0058));
    out.push(onSkin(paint(ball(0.0032, 6, 4), S.EyeWhite), ex + 0.004, ey + 0.004, 0.0072));
    // Upper lash line (and a heavier lid for hooded eyes).
    const lash = new THREE.CapsuleGeometry(0.0034, 0.036 * e.sx, 3, 6).rotateZ(Math.PI / 2 + tilt);
    out.push(onSkin(paint(lash, S.Dark), ex, ey + 0.0155 * sy - e.lid * 0.004, 0.001));
    if (e.lid > 0.2) out.push(onSkin(paint(ball(0.026, 12, 6, ).scale(e.sx * 1.08, 0.36 + e.lid * 0.2, 0.45).rotateZ(tilt), S.Skin), ex, ey + 0.015, -0.002));
  }
  return out;
}

/** Brow shapes: length, thickness, arch and a little puff. */
const BROW_K = [
  { w: 0.052, t: 0.012, arch: 0.25, d: 0.016 },
  { w: 0.056, t: 0.019, arch: 0.15, d: 0.02 },
  { w: 0.05, t: 0.0075, arch: 0.3, d: 0.012 },
  { w: 0.054, t: 0.011, arch: 0.62, d: 0.016 },
  { w: 0.054, t: 0.013, arch: 0, d: 0.016 },
  { w: 0.06, t: 0.022, arch: 0.18, d: 0.026 },
];

function browsGeo(app: Appearance): THREE.BufferGeometry[] {
  const b = BROW_K[app.brows] ?? BROW_K[0];
  const tilt = [0, 0.14, -0.1, 0.3, -0.04, 0.22][app.face] ?? 0;
  const by = 0.058 - (app.face === 3 || app.face === 5 ? 0.006 : 0) + (app.face === 2 ? 0.004 : 0);
  const out: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    // Two segments meeting at the arch, tapering towards the temple.
    const inner = new THREE.CapsuleGeometry(b.t * 0.5, b.w * 0.5, 3, 6).rotateZ(Math.PI / 2 + sx * (tilt - b.arch * 0.35));
    const outer = new THREE.CapsuleGeometry(b.t * 0.4, b.w * 0.45, 3, 6).rotateZ(Math.PI / 2 - sx * (b.arch * 0.9 - tilt * 0.5));
    // A cheeky look raises one brow.
    const lift = app.face === 4 && sx > 0 ? 0.006 : 0;
    const x0 = sx * 0.04;
    out.push(onSkin(paint(inner.scale(1, 1, b.d / b.t), S.Brow), x0, by + lift, 0.002));
    out.push(onSkin(paint(outer.scale(1, 1, b.d / b.t), S.Brow), sx * 0.069, by + lift - b.arch * 0.003 + 0.002, 0.0005));
  }
  return out;
}

/** Nose shapes: bridge length and width, tip size and drop, nostril width and a bump. */
const NOSE_K = [
  { len: 0.05, bw: 0.011, tip: 0.02, drop: 0, wing: 0.016, bump: 0 },
  { len: 0.032, bw: 0.01, tip: 0.022, drop: -0.004, wing: 0.016, bump: 0 },
  { len: 0.046, bw: 0.014, tip: 0.024, drop: 0.002, wing: 0.024, bump: 0 },
  { len: 0.062, bw: 0.011, tip: 0.02, drop: 0.008, wing: 0.016, bump: 0 },
  { len: 0.056, bw: 0.012, tip: 0.021, drop: 0.004, wing: 0.017, bump: 1 },
  { len: 0.036, bw: 0.009, tip: 0.016, drop: -0.002, wing: 0.013, bump: 0 },
];

function noseGeo(app: Appearance): THREE.BufferGeometry[] {
  const n = NOSE_K[app.nose] ?? NOSE_K[0];
  const tipY = -0.026 - n.drop;
  const out: THREE.BufferGeometry[] = [];
  const bridge = new THREE.CapsuleGeometry(n.bw, n.len, 4, 8).rotateX(0.38);
  out.push(paint(at(bridge, 0, HEAD_C.y + tipY + n.len * 0.55, onFace(0, tipY + n.len * 0.55, -0.002)), S.Skin));
  if (n.bump) out.push(paint(at(ball(0.012, 8, 6).scale(1, 1.4, 1), 0, HEAD_C.y + tipY + n.len * 0.62, onFace(0, tipY + n.len * 0.62, 0.006)), S.Skin));
  out.push(paint(at(ball(n.tip, 12, 10).scale(0.9, 0.85, 1.05), 0, HEAD_C.y + tipY, onFace(0, tipY, 0.008)), S.Skin));
  for (const sx of [-1, 1]) {
    out.push(paint(at(ball(n.wing * 0.62, 10, 8).scale(0.9, 0.75, 0.9), sx * n.wing, HEAD_C.y + tipY - 0.006, onFace(sx * n.wing, tipY - 0.006, 0.0)), S.Skin));
    out.push(paint(at(ball(0.0045, 6, 4).scale(1.3, 0.7, 1), sx * n.wing * 0.55, HEAD_C.y + tipY - 0.014, onFace(sx * n.wing * 0.55, tipY - 0.014, 0.006)), S.Socket));
  }
  return out;
}

/** Mouth shapes: width and lip fullness. */
const MOUTH_K = [
  { w: 0.046, up: 0.0062, lo: 0.0078 },
  { w: 0.048, up: 0.0085, lo: 0.011 },
  { w: 0.044, up: 0.0042, lo: 0.0052 },
  { w: 0.058, up: 0.0062, lo: 0.0078 },
  { w: 0.036, up: 0.0058, lo: 0.0072 },
];

function mouthGeo(app: Appearance): THREE.BufferGeometry[] {
  const m = MOUTH_K[app.mouth] ?? MOUTH_K[0];
  const my = -0.085;
  const out: THREE.BufferGeometry[] = [];
  const lip = (r: number, w: number, y: number, rotZ: number, x = 0, slot: number = S.Lip) =>
    out.push(onSkin(paint(new THREE.CapsuleGeometry(r, w, 3, 8).rotateZ(Math.PI / 2 + rotZ), slot), x, y, -0.003 + r * 0.3));
  switch (app.face) {
    case 2: { // smile: curved lips and a glimpse of teeth
      out.push(onSkin(paint(new THREE.TorusGeometry(m.w * 0.55, m.lo * 0.75, 6, 16, Math.PI).rotateZ(Math.PI), S.Lip), 0, my + 0.008, -0.003));
      out.push(onSkin(paint(ball(m.w * 0.42, 12, 6).scale(1, 0.32, 0.4), S.Teeth), 0, my + 0.0025, -0.0055));
      lip(m.up * 0.8, m.w * 0.85, my + 0.0075, 0);
      break;
    }
    case 3: // fierce: wide, tight, teeth set
      out.push(onSkin(paint(ball(m.w * 0.5, 12, 6).scale(1.1, 0.22, 0.4), S.Teeth), 0, my, -0.005));
      lip(m.up * 0.8, m.w * 1.15, my + 0.0055, 0);
      lip(m.lo * 0.8, m.w * 1.1, my - 0.0055, 0);
      break;
    case 4: // cheeky smirk: one corner up
      lip(m.up, m.w * 0.9, my + 0.003, 0.14, 0.003);
      lip(m.lo, m.w * 0.85, my - 0.0045, 0.1, 0.002);
      break;
    case 5: // determined: pressed, corners down
      lip(m.up * 0.85, m.w * 0.95, my + 0.002, 0);
      lip(m.lo * 0.85, m.w * 0.9, my - 0.004, 0);
      for (const sx of [-1, 1]) out.push(onSkin(paint(ball(0.0036, 6, 4), S.Socket), sx * m.w * 0.66, my - 0.004, 0));
      break;
    default: // calm and focused
      lip(m.up, m.w * (app.face === 1 ? 0.95 : 0.9), my + 0.0035, 0);
      lip(m.lo, m.w * 0.85, my - 0.005, 0);
  }
  return out;
}

function marksGeo(app: Appearance): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const dot = (x: number, y: number, r: number, slot: number) => out.push(onSkin(paint(ball(r, 6, 4).scale(1, 1, 0.3), slot), x, y, 0.0008));
  switch (app.marks) {
    case 1: // freckles over the nose and cheeks
      for (let i = 0; i < 22; i++) {
        const sx = i % 2 ? 1 : -1;
        const k = Math.floor(i / 2);
        dot(sx * (0.018 + (k % 4) * 0.012 + (k > 7 ? 0.01 : 0)), -0.012 - Math.floor(k / 4) * 0.01 + ((k * 7) % 3) * 0.002, 0.0026, S.Mark);
      }
      break;
    case 2: dot(0.052, -0.06, 0.0045, S.Mark); break;
    case 3: { // a pale scar through the left brow
      const scar = new THREE.CapsuleGeometry(0.0025, 0.03, 3, 6).rotateZ(0.35);
      out.push(onSkin(paint(scar, S.Scar), -0.058, 0.05, 0.004));
      break;
    }
    case 4:
      for (const sx of [-1, 1]) out.push(onSkin(paint(ball(0.024, 10, 6).scale(1.2, 0.8, 0.25), S.Blush), sx * 0.075, -0.035, -0.002));
      break;
  }
  return out;
}

function headGeo(app: Appearance, band: '' | 'band' | 'alice', earring: boolean) {
  const key = `head|${app.hair}|${app.beard}|${app.face}|${app.faceShape}|${app.eyes}|${app.brows}|${app.nose}|${app.mouth}|${app.marks}|${band}|${earring}`;
  return cached(key, () => {
    fk = FACE_K[app.faceShape] ?? FACE_K[0];
    const C = HEAD_C;
    const parts: THREE.BufferGeometry[] = [];
    parts.push(paint(at(sculpt(new THREE.SphereGeometry(HEAD_R, 40, 30)), C.x, C.y, C.z), S.Skin));
    for (const sx of [-1, 1]) {
      // Ears with a darker inner bowl.
      const ex = sx * 0.15 * fk.w;
      parts.push(paint(at(ball(0.036, 12, 10).scale(0.45, 1, 0.8), ex, C.y - 0.01, C.z - 0.005), S.Skin));
      parts.push(paint(at(ball(0.022, 8, 6).scale(0.3, 0.8, 0.6), ex + sx * 0.008, C.y - 0.01, C.z + 0.002), S.Socket));
    }
    parts.push(...eyesGeo(app), ...browsGeo(app), ...noseGeo(app), ...mouthGeo(app), ...marksGeo(app));
    parts.push(...hairGeo(app.hair));
    parts.push(...beardGeo(app.beard));
    if (band) {
      const t = new THREE.TorusGeometry(0.168 * fk.w, band === 'alice' ? 0.009 : 0.02, 8, 36).rotateX(Math.PI / 2 - 0.3);
      parts.push(paint(at(t.scale(1, 1, 1.06), C.x, C.y + 0.08, C.z - 0.01), S.Band));
    }
    if (earring) parts.push(paint(at(new THREE.TorusGeometry(0.013, 0.004, 6, 12), -0.152 * fk.w, C.y - 0.045, C.z), S.Gold));
    fk = FACE_K[0];
    return merge(parts);
  });
}

const baseGeo = (() => {
  const base = paint(at(new THREE.CylinderGeometry(0.55, 0.62, 0.12, 36), 0, 0.06, 0), S.Base);
  return base;
})();

// ---------- Materials ----------

interface SlotLook { color: string; rough: number; metal?: number; coat?: number }

const texCache = new Map<string, THREE.MeshPhysicalMaterial>();
function paletteMaterial(slots: SlotLook[]): THREE.MeshPhysicalMaterial {
  const key = slots.map((s) => `${s.color}${s.rough}${s.metal ?? 0}${s.coat ?? 0}`).join('|');
  let m = texCache.get(key);
  if (m) return m;
  const col = new Uint8Array(S.Count * 4);
  const orm = new Uint8Array(S.Count * 4);
  const c = new THREE.Color();
  slots.forEach((s, i) => {
    c.set(s.color);
    col.set([Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255), 255], i * 4);
    // R: clearcoat, G: roughness, B: metalness (three's channel layout for these maps).
    orm.set([Math.round((s.coat ?? 0) * 255), Math.round(s.rough * 255), Math.round((s.metal ?? 0) * 255), 255], i * 4);
  });
  const tex = (data: Uint8Array, srgb: boolean) => {
    const t = new THREE.DataTexture(data, S.Count, 1, THREE.RGBAFormat);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  const ormTex = tex(orm, false);
  m = new THREE.MeshPhysicalMaterial({
    map: tex(col, true),
    roughness: 1,
    roughnessMap: ormTex,
    metalness: 1,
    metalnessMap: ormTex,
    clearcoat: 1,
    clearcoatMap: ormTex,
    clearcoatRoughness: 0.18,
    sheen: 0.18,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color(0xffffff),
  });
  texCache.set(key, m);
  return m;
}

function gearLook(it: Item | undefined, fallback: string, rough = 0.6): SlotLook {
  if (!it) return { color: fallback, rough };
  const color = it.c1 ?? fallback;
  return it.metal ? { color, rough: 0.22, metal: 1, coat: 0.6 } : { color, rough: 0.55, coat: 0.15 };
}

/** Brightens darker colours more than light ones (a gamma curve, `k` < 1). */
function lift(hex: string, k: number) {
  const c = new THREE.Color(hex);
  return '#' + new THREE.Color(c.r ** k, c.g ** k, c.b ** k).getHexString();
}

function mix(a: string, b: string, t: number) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

/** A colour that reads against `c`: white on dark, near-black on light. */
function contrast(c: string) {
  const col = new THREE.Color(c);
  return col.r * 0.3 + col.g * 0.59 + col.b * 0.11 > 0.5 ? '#141414' : '#f4f4f4';
}

// ---------- Body (one skinned mesh over the skeleton in rig/skeleton.ts) ----------

type Pattern = 'plain' | 'stripes' | 'hoops';

function kitPattern(k: Kit): Pattern {
  let h = 0;
  for (const ch of k.primary + k.secondary) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const r = h % 10;
  return r < 6 ? 'plain' : r < 9 ? 'stripes' : 'hoops';
}

/** A cross-section: position along the axis, side radius, front and back depth, front offset. */
interface Ring { at: number; r: number; f: number; b: number; c?: number }

/**
 * A smooth tube through elliptical rings, closed at both ends and painted
 * quad by quad. Along y the section lies in x-z; along x (arms) it lies in
 * y-z, running toward `dir`. Angle 0 is the front (+z).
 */
function loft(rings: Ring[], segs: number, axis: 'y' | 'x', o: [number, number, number], slot: (ang: number, at: number, seg: number) => number, dir = 1) {
  const pos: number[] = [];
  const slots: number[] = [];
  const idx: number[] = [];
  const point = (rg: Ring, ang: number) => {
    const s = Math.sin(ang);
    const c = Math.cos(ang);
    const z = o[2] + (rg.c ?? 0) + c * (c > 0 ? rg.f : rg.b);
    return axis === 'y' ? [o[0] + s * rg.r, o[1] + rg.at, z] : [o[0] + dir * rg.at, o[1] + s * rg.r, z];
  };
  rings.forEach((rg) => {
    for (let k = 0; k < segs; k++) pos.push(...point(rg, (k / segs) * Math.PI * 2));
  });
  // Domed caps at each end.
  const cap = (rg: Ring, out: number) => {
    const p = point({ ...rg, r: 0, f: 0, b: 0 }, 0);
    if (axis === 'y') p[1] += out;
    else p[0] += dir * out;
    pos.push(p[0], p[1], p[2] + ((rg.f - rg.b) * 0.5));
    return pos.length / 3 - 1;
  };
  const first = rings[0];
  const last = rings[rings.length - 1];
  const c0 = cap(first, -Math.sign(last.at - first.at) * Math.min(first.r, first.f) * 0.45);
  const c1 = cap(last, Math.sign(last.at - first.at) * Math.min(last.r, last.f) * 0.45);
  const v = (ri: number, k: number) => ri * segs + (k % segs);
  const tri = (a: number, b: number, c: number, sl: number) => {
    idx.push(a, b, c);
    slots.push(sl);
  };
  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let k = 0; k < segs; k++) {
      const ang = ((k + 0.5) / segs) * Math.PI * 2;
      const sl = slot(Math.atan2(Math.sin(ang), Math.cos(ang)), (rings[ri].at + rings[ri + 1].at) / 2, k);
      tri(v(ri, k), v(ri + 1, k), v(ri + 1, k + 1), sl);
      tri(v(ri, k), v(ri + 1, k + 1), v(ri, k + 1), sl);
    }
  }
  for (let k = 0; k < segs; k++) {
    const ang = ((k + 0.5) / segs) * Math.PI * 2;
    tri(c0, v(0, k + 1), v(0, k), slot(ang, first.at, k));
    tri(c1, v(rings.length - 1, k), v(rings.length - 1, k + 1), slot(ang, last.at, k));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // Wind outward whichever way the axis runs.
  const probe = new THREE.Vector3().fromArray(pos, 0);
  const a = new THREE.Vector3().fromArray(pos, idx[0] * 3);
  const b = new THREE.Vector3().fromArray(pos, idx[1] * 3);
  const c = new THREE.Vector3().fromArray(pos, idx[2] * 3);
  const n = b.clone().sub(a).cross(c.clone().sub(a));
  const centre = axis === 'y' ? new THREE.Vector3(o[0], probe.y, o[2] + (first.c ?? 0)) : new THREE.Vector3(probe.x, o[1], o[2] + (first.c ?? 0));
  if (n.dot(a.clone().sub(centre)) < 0) for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = g.toNonIndexed();
  const uv = new Float32Array(m.attributes.position.count * 2);
  for (let t = 0; t < slots.length; t++) for (let k = 0; k < 3; k++) {
    uv[(t * 3 + k) * 2] = uvOf(slots[t]);
    uv[(t * 3 + k) * 2 + 1] = 0.5;
  }
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return m;
}

/** Blends bones along a coordinate: [bone, where it starts], ascending, with soft joints. */
function chain(t: number, joints: [number, number][], blend: number): [number, number][] {
  const out: [number, number][] = [];
  const u = (j: number) => (j === 0 ? 1 : j >= joints.length ? 0 : smoothstep(joints[j][1] - blend, joints[j][1] + blend, t));
  for (let j = 0; j < joints.length; j++) {
    const w = u(j) * (1 - u(j + 1));
    if (w > 1e-3) out.push([joints[j][0], w]);
  }
  return out;
}
const smoothstep = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

type Weigh = (p: THREE.Vector3) => [number, number][];

/** Writes skin indices and weights (up to four bones) onto a part. */
function skin(g: THREE.BufferGeometry, weigh: Weigh) {
  const pos = g.attributes.position;
  const si = new Uint16Array(pos.count * 4);
  const sw = new Float32Array(pos.count * 4);
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const ws = weigh(p).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = ws.reduce((s, w) => s + w[1], 0) || 1;
    ws.forEach(([bone, w], k) => {
      si[i * 4 + k] = bone;
      sw[i * 4 + k] = w / tot;
    });
    if (!ws.length) sw[i * 4] = 1;
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}

const rigid = (bone: number): Weigh => () => [[bone, 1]];

// Torso cross-sections, crotch to collar.
const TORSO: Ring[] = [
  { at: 0.98, r: 0.085, f: 0.07, b: 0.075 },
  { at: 1.03, r: 0.158, f: 0.105, b: 0.125 },
  { at: 1.09, r: 0.186, f: 0.114, b: 0.136 },
  { at: 1.15, r: 0.187, f: 0.113, b: 0.12 },
  { at: 1.22, r: 0.172, f: 0.11, b: 0.106 },
  { at: 1.32, r: 0.178, f: 0.118, b: 0.108 },
  { at: 1.42, r: 0.198, f: 0.13, b: 0.114, c: 0.004 },
  { at: 1.52, r: 0.214, f: 0.138, b: 0.118, c: 0.008 },
  { at: 1.6, r: 0.222, f: 0.128, b: 0.116, c: 0.006 },
  { at: 1.67, r: 0.216, f: 0.114, b: 0.108 },
  { at: 1.725, r: 0.19, f: 0.1, b: 0.098 },
  { at: 1.77, r: 0.13, f: 0.088, b: 0.088 },
  { at: 1.8, r: 0.088, f: 0.078, b: 0.08 },
];
const SHORTS_TOP = 1.14;

/** The torso's front (+1) or back (-1) surface depth at (x, y), for things worn on it. */
function torsoZ(x: number, y: number, side: 1 | -1) {
  let i = 0;
  while (i < TORSO.length - 2 && TORSO[i + 1].at < y) i++;
  const a = TORSO[i];
  const b = TORSO[i + 1];
  const k = Math.min(1, Math.max(0, (y - a.at) / (b.at - a.at)));
  const L = (p: number, q: number) => p + (q - p) * k;
  const r = L(a.r, b.r);
  const d = side > 0 ? L(a.f, b.f) : L(a.b, b.b);
  return L(a.c ?? 0, b.c ?? 0) + side * d * Math.sqrt(Math.max(0, 1 - (x / r) ** 2));
}

function torsoPart(pattern: Pattern, keeper: boolean) {
  const g = loft(TORSO, 36, 'y', [0, 0, -0.01], (ang, y, seg) => {
    if (y < SHORTS_TOP) return S.Shorts;
    if (y > 1.785 || y < SHORTS_TOP + 0.025) return S.Trim;
    const side = Math.abs(Math.sin(ang));
    if (keeper) return Math.abs(y - 1.5) < 0.04 && Math.cos(ang) > 0.2 ? S.Trim : S.Shirt;
    if (side > 0.97 && y < 1.6) return S.Trim;
    if (pattern === 'stripes') return Math.floor(seg / 3) % 2 ? S.Trim : S.Shirt;
    if (pattern === 'hoops') return Math.floor((y - SHORTS_TOP) / 0.11) % 2 ? S.Trim : S.Shirt;
    return S.Shirt;
  });
  return skin(g, (p) => {
    const w = chain(p.y, [[B.Hips, 0], [B.Spine, 1.24], [B.Spine1, 1.37], [B.Spine2, 1.49], [B.Neck, 1.79]], 0.04);
    // The outer shoulders ride on the collarbones.
    const sh = smoothstep(0.13, 0.21, Math.abs(p.x)) * smoothstep(1.56, 1.66, p.y) * 0.7;
    if (sh > 0) {
      w.forEach((x) => (x[1] *= 1 - sh));
      w.push([p.x > 0 ? B.LeftShoulder : B.RightShoulder, sh]);
    }
    return w;
  });
}

function neckPart() {
  const g = loft([{ at: 1.72, r: 0.086, f: 0.084, b: 0.086 }, { at: 1.82, r: 0.08, f: 0.077, b: 0.08 }, { at: 1.9, r: 0.072, f: 0.068, b: 0.074 }, { at: 1.96, r: 0.066, f: 0.062, b: 0.064 }], 18, 'y', [0, 0, 0.004], () => S.Skin);
  return skin(g, (p) => chain(p.y, [[B.Spine2, 0], [B.Neck, 1.79], [B.Head, 1.9]], 0.035));
}

function legPart(side: 1 | -1, keeper: boolean) {
  const x = REST[B.LeftUpLeg][0] * side;
  const rings: Ring[] = [
    { at: 1.17, r: 0.11, f: 0.1, b: 0.11 },
    { at: 1.08, r: 0.132, f: 0.122, b: 0.132 },
    { at: 0.95, r: 0.132, f: 0.12, b: 0.125 },
    { at: 0.815, r: 0.127, f: 0.116, b: 0.118 },
    { at: 0.8, r: 0.105, f: 0.1, b: 0.1 },
    { at: 0.71, r: 0.1, f: 0.1, b: 0.094 },
    { at: 0.63, r: 0.082, f: 0.086, b: 0.076 },
    { at: 0.575, r: 0.072, f: 0.08, b: 0.07, c: 0.004 },
    { at: 0.51, r: 0.07, f: 0.07, b: 0.084 },
    { at: 0.41, r: 0.074, f: 0.068, b: 0.094 },
    { at: 0.29, r: 0.062, f: 0.06, b: 0.074 },
    { at: 0.19, r: 0.051, f: 0.052, b: 0.056 },
    { at: 0.12, r: 0.048, f: 0.05, b: 0.05 },
    { at: 0.07, r: 0.044, f: 0.044, b: 0.044 },
  ];
  // The shorts leg tilts out a touch, like the cut of real shorts.
  const g = loft(rings, 20, 'y', [x, 0, 0], (_a, y) => {
    if (y > 0.81) return S.Shorts;
    if (y > 0.795) return keeper ? S.Shorts : S.Shirt;
    if (y > 0.52) return S.Skin;
    if (y > 0.48) return S.Trim;
    if (y > 0.11) return S.Sock;
    return S.Boot;
  });
  const up = side > 0 ? B.LeftUpLeg : B.RightUpLeg;
  const kn = side > 0 ? B.LeftLeg : B.RightLeg;
  const ft = side > 0 ? B.LeftFoot : B.RightFoot;
  return skin(g, (p) => chain(-p.y, [[B.Hips, -9], [up, -1.1], [kn, -0.585], [ft, -0.115]], 0.05));
}

function bootPart(side: 1 | -1) {
  const x = REST[B.LeftFoot][0] * side;
  const shoe = (yMin: number, yMax: number, sx: number, sz: number) => {
    const g = ball(0.07, 20, 14);
    const bp = g.attributes.position;
    for (let i = 0; i < bp.count; i++) bp.setXYZ(i, bp.getX(i) * sx, Math.min(yMax, Math.max(yMin, bp.getY(i) * 0.75)), bp.getZ(i) * sz);
    return g;
  };
  // Upper, then a slightly wider sole plate following the same outline.
  const boot = paint(shoe(-0.03, 1, 0.86, 1.95), S.Boot);
  const sole = paint(shoe(-0.044, -0.026, 0.9, 2.0), S.Sole);
  const stripe = paint(new THREE.TorusGeometry(0.058, 0.007, 4, 18, Math.PI * 0.7).rotateY(Math.PI / 2).rotateX(-0.2), S.BootAccent);
  at(stripe, side * 0.05, 0.02, 0.04);
  const g = merge([boot, sole, stripe]);
  at(g, x, 0.044, 0.045);
  const ft = side > 0 ? B.LeftFoot : B.RightFoot;
  const toe = side > 0 ? B.LeftToeBase : B.RightToeBase;
  return skin(g, (p) => chain(p.z, [[ft, -9], [toe, 0.11]], 0.04));
}

/** Arm from the shoulder to the wrist, built in the T-pose along ±x. */
function armPart(side: 1 | -1, keeper: boolean, band: boolean) {
  const o = REST[B.LeftArm];
  const rings: Ring[] = [
    { at: -0.03, r: 0.06, f: 0.062, b: 0.062 },
    { at: 0.0, r: 0.084, f: 0.082, b: 0.084 },
    { at: 0.06, r: 0.08, f: 0.077, b: 0.079 },
    { at: 0.135, r: 0.071, f: 0.068, b: 0.07 },
    { at: 0.15, r: 0.07, f: 0.067, b: 0.069 },
    { at: 0.155, r: 0.058, f: 0.056, b: 0.058 },
    { at: 0.22, r: 0.057, f: 0.058, b: 0.054 },
    { at: 0.29, r: 0.048, f: 0.046, b: 0.048 },
    { at: 0.31, r: 0.046, f: 0.045, b: 0.047 },
    { at: 0.37, r: 0.05, f: 0.05, b: 0.048 },
    { at: 0.46, r: 0.042, f: 0.041, b: 0.04 },
    { at: 0.545, r: 0.034, f: 0.034, b: 0.032 },
    { at: 0.585, r: 0.031, f: 0.031, b: 0.03 },
  ];
  const g = loft(rings, 18, 'x', [o[0] * side, o[1], o[2]], (_a, s) => {
    if (keeper) return s > 0.53 ? S.Trim : S.Shirt;
    if (s < 0.13) return S.Shirt;
    if (s < 0.155) return S.Trim;
    if (band && s > 0.47 && s < 0.53) return S.Wrist;
    return S.Skin;
  }, side);
  const [sh, arm, fore, hand] = side > 0 ? [B.LeftShoulder, B.LeftArm, B.LeftForeArm, B.LeftHand] : [B.RightShoulder, B.RightArm, B.RightForeArm, B.RightHand];
  skin(g, (p) => chain((p.x * side) - o[0], [[sh, -9], [arm, -0.005], [fore, 0.31], [hand, 0.57]], 0.04));
  if (band && !keeper) {
    const wb = paint(new THREE.CylinderGeometry(0.046, 0.046, 0.06, 16).rotateZ(Math.PI / 2), S.Wrist);
    at(wb, side * (o[0] + 0.5), o[1], o[2]);
    return [g, skin(wb, rigid(fore))];
  }
  return [g];
}

function handPart(side: 1 | -1, keeper: boolean) {
  const o = REST[B.LeftHand];
  const k = keeper ? 1.2 : 1;
  const palm = paint(ball(0.046 * k, 12, 10).scale(1.15, 0.62, 0.9), keeper ? S.Glove : S.Skin);
  at(palm, side * (o[0] + 0.062), o[1] - 0.004, o[2] + 0.004);
  const thumb = paint(ball(0.018 * k, 8, 6).scale(1.6, 1, 1), keeper ? S.Glove : S.Skin);
  at(thumb, side * (o[0] + 0.03), o[1] - 0.01, o[2] + 0.036);
  const hand = side > 0 ? B.LeftHand : B.RightHand;
  return [skin(palm, rigid(hand)), skin(thumb, rigid(hand))];
}

/** Rotates a T-pose arm part down into the skinning pose. */
function lower(g: THREE.BufferGeometry, side: 1 | -1) {
  const o = REST[B.LeftArm];
  const m = new THREE.Matrix4().makeTranslation(side * o[0], o[1], o[2])
    .multiply(new THREE.Matrix4().makeRotationZ(-side * ARM_BIND))
    .multiply(new THREE.Matrix4().makeTranslation(-side * o[0], -o[1], -o[2]));
  return g.applyMatrix4(m);
}

const HEAD_K = 0.94;

/** Head and face, carried by the head bone. */
function headPart(app: Appearance, band: '' | 'band' | 'alice', earring: boolean) {
  const g = headGeo(app, band, earring).clone();
  // Slightly smaller than the old figure's head: athletic proportions, same face.
  g.translate(-HEAD_C.x, -HEAD_C.y, -HEAD_C.z).scale(HEAD_K, HEAD_K, HEAD_K).translate(HEAD_C.x, HEAD_C.y, HEAD_C.z);
  g.translate(...REST[B.Head]);
  return skin(g, rigid(B.Head));
}

function neckwearPart(style: string) {
  let g: THREE.BufferGeometry;
  if (style === 'snood') g = paint(at(new THREE.CylinderGeometry(0.09, 0.104, 0.12, 20, 1, true), 0, 1.85, 0.004), S.Neck);
  else if (style === 'medal') {
    const ribbon = paint(new THREE.TorusGeometry(0.105, 0.012, 6, 28).rotateX(Math.PI / 2 - 0.6).scale(1, 1.5, 1), S.Trim);
    at(ribbon, 0, 1.75, 0.05);
    const disc = paint(new THREE.CylinderGeometry(0.05, 0.05, 0.014, 20).rotateX(Math.PI / 2), S.Neck);
    at(disc, 0, 1.6, torsoZ(0, 1.6, 1) + 0.01);
    g = merge([ribbon, disc]);
  } else g = paint(at(new THREE.TorusGeometry(0.096, 0.011, 6, 30).rotateX(Math.PI / 2 - 0.5), 0, 1.785, 0.05), S.Neck);
  return skin(g, (p) => (p.y > 1.8 ? [[B.Neck, 1]] : [[B.Spine2, 1]]));
}

function crestPart() {
  const crest = paint(ball(0.03, 10, 8).scale(1, 1.15, 0.35), S.Trim);
  at(crest, 0.095, 1.565, torsoZ(0.095, 1.565, 1) - 0.004);
  return skin(crest, rigid(B.Spine2));
}

/** The whole body as one geometry, cached per look. */
function bodyGeo(app: Appearance, pattern: Pattern, keeper: boolean, band: boolean, bandKind: '' | 'band' | 'alice', earring: boolean, neck: string) {
  const key = `body|${pattern}|${keeper}|${band}|${bandKind}|${earring}|${neck}|${app.hair}|${app.beard}|${app.face}|${app.faceShape}|${app.eyes}|${app.brows}|${app.nose}|${app.mouth}|${app.marks}`;
  return cached(key, () => {
    const parts = [torsoPart(pattern, keeper), neckPart(), headPart(app, bandKind, earring), crestPart()];
    for (const s of [1, -1] as const) {
      parts.push(legPart(s, keeper), bootPart(s));
      for (const g of [...armPart(s, keeper, band), ...handPart(s, keeper)]) parts.push(lower(g, s));
    }
    if (neck) parts.push(neckwearPart(neck));
    return merge(parts);
  });
}

const geo = { ring: new THREE.RingGeometry(0.72, 0.9, 40).rotateX(-Math.PI / 2) };
const numberPlane = new THREE.PlaneGeometry(0.2, 0.2);

/**
 * Training pose names → clip, and where in the 0..1 progress the contact sits.
 * The drill dive stays hand-made: it springs back to the spot where the drill expects the keeper.
 */
const SCRUB: Record<string, [string, number]> = { kick: ['shot', 0.45], slide: ['slide', 0.3], dive: ['ph:dive', 0.45], header: ['header', 0.5] };

const tmpScale = new THREE.Vector3();
const tmpOff = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();

/** Where a timed action should meet the ball. */
export interface ActAim {
  /** The ball's position at contact (world, y up). */
  ball: THREE.Vector3;
  /** The player's ground position at contact (world x, z) and facing then. */
  x: number;
  z: number;
  heading: number;
}

export type { ActionKind, ActOpts };

export class Figure {
  root = new THREE.Group();
  /** Holds the skinned body; leans with acceleration. */
  body = new THREE.Group();
  /** Local velocity (m/s): forward and to the player's left. Set by the match viewer. */
  fwd = 0;
  side = 0;
  /** Lean from acceleration (radians), forward and into turns. */
  leanX = 0;
  leanZ = 0;
  ring: THREE.Mesh;
  pos = new THREE.Vector2();
  vel = new THREE.Vector2();
  heading = 0;
  visible = true;
  celebrate = 0;
  celStyle = '';
  /** True for the goalscorer, who does their own celebration. */
  star = false;
  /** One-shot training pose held at progress `poseK` (0..1; juggling counts beats). */
  pose: '' | 'kick' | 'juggle' | 'slide' | 'dive' | 'header' = '';
  poseK = 0;
  poseSide = 1;
  /** A heading the match viewer holds the player to until game time `faceUntil` (lining up a strike). */
  faceTo: number | null = null;
  faceUntil = 0;
  /** A world point the head and chest turn toward (usually the ball). */
  look: THREE.Vector3 | null = null;
  readonly keeper: boolean;
  readonly bones: THREE.Bone[];
  private anim: Animator;
  /** Body height above the root: on a base, or standing on the grass. */
  private lift: number;
  /**
   * The body's offset from the root, in world metres: `carry` is travel an
   * action took it on (a dive) that eases back to the player's spot, `reach`
   * is the small step that puts the foot, head or hands on the ball at contact.
   */
  private carry = new THREE.Vector3();
  private reach = new THREE.Vector3();
  private reachT = 0;
  private reachLead = 0;
  private reachOn = false;
  /** The reach shown last frame, and what was left of it when a new action took over (eases out). */
  private reached = new THREE.Vector3();
  private reachRest = new THREE.Vector3();
  /** Height the body rises to meet the ball (a keeper's dive or jump), metres. */
  private reachY = 0;
  /** Keeper saves keep their reach: he lands where he stretched to and walks back from there. */
  private reachKeep = false;
  /** A keeper with the ball in his hands. Set by the match viewer. */
  hold = false;

  constructor(kit: Kit, look: Appearance, isKeeper: boolean, gkKit: Kit, eq?: Equipped, opts: { base?: boolean; number?: number; scale?: number } = {}) {
    loadMocap(`${import.meta.env.BASE_URL}anims/mocap.json`);
    // Older and bot looks may lack newer features; fill them in consistently.
    const app = sanitizeAppearance(look);
    const withBase = opts.base !== false;
    this.keeper = isKeeper;
    this.lift = withBase ? 0.12 : 0;
    const g = gear(eq);
    this.celStyle = g.celebration?.style ?? '';
    const k = isKeeper ? gkKit : kit;
    // Deeper tones lose their warmth under the lights; lift them so they read as rich browns.
    const skinTone = lift(SKIN_TONES[app.skin] ?? SKIN_TONES[1], 0.7);
    const hair = lift(HAIR_COLORS[app.hairColor] ?? HAIR_COLORS[0], 0.85);
    const boot = g.boots?.c1 ?? BOOT_COLORS[app.boots] ?? BOOT_COLORS[0];
    const fabric = (color: string, rough = 0.78): SlotLook => ({ color, rough, coat: 0.04 });
    const looks: SlotLook[] = [];
    looks[S.Shirt] = fabric(k.primary);
    looks[S.Trim] = fabric(k.secondary);
    looks[S.Shorts] = isKeeper ? fabric('#1b1d21', 0.7) : fabric(k.secondary, 0.7);
    looks[S.Sock] = fabric(k.primary, 0.85);
    looks[S.Skin] = { color: skinTone, rough: 0.6, coat: 0.04 };
    looks[S.Hair] = { color: hair, rough: 0.68, coat: 0.08 };
    looks[S.Boot] = g.boots?.metal ? { color: boot, rough: 0.2, metal: 1, coat: 0.8 } : { color: boot, rough: 0.28, coat: 0.85 };
    looks[S.BootAccent] = { color: g.boots?.c2 ?? contrast(boot), rough: 0.35, coat: 0.6 };
    looks[S.Dark] = { color: '#17110d', rough: 0.15, coat: 1 };
    looks[S.EyeWhite] = { color: '#f2eee8', rough: 0.2, coat: 0.9 };
    looks[S.Lip] = { color: mix(skinTone, '#6b2a22', 0.38), rough: 0.45, coat: 0.2 };
    looks[S.Glove] = { color: '#eef2f4', rough: 0.55, coat: 0.2 };
    looks[S.Wrist] = gearLook(g.wrist, k.secondary);
    looks[S.Band] = gearLook(g.head, k.secondary);
    looks[S.Neck] = gearLook(g.neck, '#ffcf3d');
    if (!g.neck) Object.assign(looks[S.Neck], { rough: 0.25, metal: 1, coat: 0.6 });
    looks[S.Gold] = { color: '#ffcf3d', rough: 0.2, metal: 1, coat: 0.6 };
    looks[S.Stubble] = { color: mix(skinTone, hair, 0.42), rough: 0.85 };
    looks[S.StubbleDark] = { color: mix(skinTone, hair, 0.68), rough: 0.9 };
    looks[S.Iris] = { color: EYE_COLORS[app.eyeColor] ?? EYE_COLORS[0], rough: 0.15, coat: 1 };
    looks[S.Brow] = { color: mix(hair, '#120c08', 0.25), rough: 0.8 };
    looks[S.Socket] = { color: mix(skinTone, '#3a1d12', 0.16), rough: 0.6 };
    looks[S.Teeth] = { color: '#f4efe6', rough: 0.3, coat: 0.6 };
    looks[S.Mark] = { color: mix(skinTone, '#5a2e18', 0.45), rough: 0.6 };
    looks[S.Scar] = { color: mix(skinTone, '#f0c9bd', 0.55), rough: 0.4, coat: 0.3 };
    looks[S.Blush] = { color: mix(skinTone, '#e0605a', 0.3), rough: 0.55 };
    looks[S.Base] = { color: k.secondary, rough: 0.35, coat: 0.8 };
    looks[S.Sole] = { color: g.boots?.c2 ?? mix(boot, '#101010', 0.55), rough: 0.5, coat: 0.3 };
    const mat = paletteMaterial(looks);

    // Base (team-coloured puck) and a selection ring.
    if (withBase) {
      const base = new THREE.Mesh(baseGeo, mat);
      base.castShadow = base.receiveShadow = true;
      this.root.add(base);
    }
    this.ring = new THREE.Mesh(geo.ring, new THREE.MeshBasicMaterial({ color: 0xc6ff3d, transparent: true, opacity: 0, depthWrite: false }));
    this.ring.position.y = 0.03;
    this.root.add(this.ring);

    // One skinned mesh for the whole player, bound with the arms lowered.
    const headIt = g.head;
    const bandKind = headIt ? (headIt.style === 'alice' ? 'alice' : 'band') : app.accessory === 1 ? 'band' : '';
    const neck = g.neck ? g.neck.style ?? 'chain' : app.accessory === 4 ? 'chain' : '';
    const geom = bodyGeo(app, isKeeper ? 'plain' : kitPattern(kit), isKeeper, !!g.wrist || app.accessory === 3, bandKind, app.accessory === 2, neck);
    this.bones = makeBones();
    setBindPose(this.bones);
    const mesh = new THREE.SkinnedMesh(geom, mat);
    mesh.add(this.bones[0]);
    mesh.updateMatrixWorld(true);
    mesh.bind(new THREE.Skeleton(this.bones));
    // Dives and slides reach well beyond the standing pose.
    mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.1, 0), 2.6);
    mesh.castShadow = true;
    this.body.position.y = this.lift;
    this.body.add(mesh);
    this.root.add(this.body);

    if (opts.number !== undefined) {
      // Shirt number on the back, riding on the upper spine.
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g2 = c.getContext('2d')!;
      g2.font = '800 100px "Barlow Condensed", Impact, sans-serif';
      g2.textAlign = 'center';
      g2.textBaseline = 'middle';
      g2.lineWidth = 8;
      g2.strokeStyle = 'rgba(0,0,0,0.22)';
      g2.strokeText(String(opts.number), 64, 70);
      g2.fillStyle = isKeeper ? '#111111' : contrast(k.primary) === '#141414' && kitPattern(kit) === 'plain' ? k.secondary : contrast(k.primary);
      g2.fillText(String(opts.number), 64, 70);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const num = new THREE.Mesh(numberPlane, new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }));
      const s2 = REST[B.Spine2];
      num.position.set(0, 1.47 - s2[1], torsoZ(0, 1.47, -1) - 0.006 - s2[2]);
      num.rotation.set(-0.08, Math.PI, 0);
      this.bones[B.Spine2].add(num);
    }
    this.anim = new Animator(this.bones, this.root);
    this.root.scale.setScalar(opts.scale ?? LIFE_SCALE);
  }

  /**
   * Plays a one-shot action (kick, trap, header, tackle, keeper set, dive,
   * catch…), warped so its contact lands `contactIn` real seconds from now.
   * `side` -1 is the left foot, or a dive to the player's right.
   */
  act(kind: ActionKind, opts?: ActOpts, aim?: ActAim) {
    const eff = this.anim.act(kind, opts);
    // A new action never snaps the body off the step the last one took toward the ball.
    this.reachRest.copy(this.reached);
    this.reachOn = false;
    if (!eff || !aim) return;
    // Where that body part will be at contact, if the player is where the game puts him.
    const s = this.root.scale.x;
    tmpQ.setFromAxisAngle(UP, aim.heading);
    eff.multiplyScalar(s).applyQuaternion(tmpQ);
    this.reach.set(aim.ball.x - aim.x - eff.x, 0, aim.ball.z - aim.z - eff.z);
    // Only small corrections: a gap wider than a stride (a keeper's extra lunge) is the play's, not the animation's.
    const save = KEEPER_SAVES.has(kind);
    const len = this.reach.length();
    const most = kind === 'dive' || kind === 'diveHigh' ? 1.6 : save ? 1.1 : 0.9;
    if (len > most) this.reach.multiplyScalar(most / len);
    // Keepers also rise to a high ball (a spring in the dive, a jump for the catch), or get down to a low one.
    this.reachY = save ? Math.max(-0.25, Math.min(0.75, aim.ball.y - (eff.y + this.lift * s))) : 0;
    this.reachKeep = save;
    this.reachLead = Math.max(0.2, opts?.contactIn ?? 0.3);
    this.reachT = opts?.contactIn ?? 0;
    this.reachOn = true;
  }

  get acting() {
    return this.anim.acting;
  }

  /** Put straight onto a new spot (a reset between phases): whatever he was doing ends there. */
  teleport(heading: number) {
    this.anim.reset();
    this.carry.set(0, 0, 0);
    this.reachOn = false;
    this.reachRest.set(0, 0, 0);
    this.reached.set(0, 0, 0);
    this.faceTo = null;
    this.heading = heading;
  }

  /** Seconds an action takes from its start to the moment it meets the ball, at natural speed. */
  contactTime(kind: ActionKind, side: 1 | -1 = 1) {
    return this.anim.contactOf(kind, side);
  }

  /** Advances the animation. `speed` in m/s. */
  animate(dt: number, speed: number, _time = 0) {
    this.body.position.y = this.lift;
    this.body.rotation.set(this.leanX, 0, this.leanZ);
    let scrub: AnimInput['scrub'] = null;
    if (this.pose === 'juggle') {
      scrub = { name: 'juggle', t: (((this.poseK / 2) % 1) + 1) % 1, mirror: false };
    } else if (this.pose) {
      const [name, at] = SCRUB[this.pose];
      const clip = getClip(name, this.pose === 'dive' && this.poseSide < 0);
      const dur = duration(clip);
      const c = clip.contact ?? dur * 0.4;
      const k = Math.min(1, Math.max(0, this.poseK));
      scrub = { name, t: k < at ? (k / at) * c : c + ((k - at) / (1 - at)) * (dur - c), mirror: this.pose === 'dive' && this.poseSide < 0 };
    }
    // Walking back after a dive: the body's way home drives the legs.
    let fwd = this.fwd;
    let side = this.side;
    let speed2 = speed;
    if (!this.anim.acting && this.carry.lengthSq() > 0.01) {
      const vx = -this.carry.x / CARRY_T;
      const vz = -this.carry.z / CARRY_T;
      const h = this.root.rotation.y;
      fwd += vx * Math.sin(h) + vz * Math.cos(h);
      side += vx * Math.cos(h) - vz * Math.sin(h);
      speed2 = Math.hypot(fwd, side);
    }
    let cel: string | null = null;
    if (this.celebrate > 0) {
      const style = this.star && this.celStyle ? `cel_${this.celStyle}` : 'cel_cheer';
      cel = hasClip(style) ? style : 'cel_cheer';
    }
    this.root.getWorldScale(tmpScale);
    this.anim.update(dt, {
      speed: speed2,
      fwd,
      side,
      scale: tmpScale.x,
      keeper: this.keeper,
      celebrate: cel,
      scrub,
      look: this.look,
      lift: this.lift,
      hold: this.hold,
    });
    const sh = this.anim.shift;
    if (sh.lengthSq() > 0) {
      // Keep the body where an action's travel (a dive) took it, then ease it back once it's up.
      sh.applyQuaternion(this.root.quaternion).multiplyScalar(this.root.scale.x);
      this.carry.add(sh);
      sh.set(0, 0, 0);
    }
    if (!this.anim.acting && this.carry.lengthSq() > 1e-6) this.carry.multiplyScalar(Math.exp(-dt / CARRY_T));
    tmpOff.copy(this.carry);
    let up = 0;
    if (this.reachOn) {
      this.reachT -= dt;
      // Step into it on the way to contact, then let go (a keeper keeps the ground he covered).
      const into = smoothstep(0, 1, 1 - this.reachT / this.reachLead);
      const out = 1 - smoothstep(0, 1, -this.reachT / 0.45);
      if (this.reachT > 0) {
        tmpOff.addScaledVector(this.reach, into);
        up = this.reachY * into;
      } else if (this.reachKeep) {
        this.carry.add(this.reach);
        tmpOff.add(this.reach);
        this.reach.set(0, 0, 0);
        this.reachKeep = false;
      } else tmpOff.addScaledVector(this.reach, out);
      if (this.reachT <= 0) up = this.reachY * out;
      if (this.reachT < -0.45) this.reachOn = false;
    }
    this.reached.set(tmpOff.x - this.carry.x, up, tmpOff.z - this.carry.z);
    if (this.reachRest.lengthSq() > 1e-6) {
      this.reachRest.multiplyScalar(Math.exp(-dt / 0.15));
      this.reached.add(this.reachRest);
      tmpOff.x += this.reachRest.x;
      tmpOff.z += this.reachRest.z;
      up += this.reachRest.y;
    }
    // Into the root's own frame.
    tmpOff.y = up;
    tmpOff.applyQuaternion(tmpQ.copy(this.root.quaternion).invert()).divideScalar(this.root.scale.x || 1);
    this.body.position.set(tmpOff.x, this.lift + tmpOff.y, tmpOff.z);
  }
}

const UP = new THREE.Vector3(0, 1, 0);
/** Seconds for a keeper to walk back to his spot after a dive (time constant). */
const CARRY_T = 0.8;
const KEEPER_SAVES = new Set<ActionKind>(['dive', 'diveHigh', 'catch', 'keeperGather', 'keeperScoop', 'keeperHigh']);

export const GK_KITS: Kit[] = [
  { primary: '#ffb020', secondary: '#1b1b1b' },
  { primary: '#3dd6ff', secondary: '#0b2540' },
];
