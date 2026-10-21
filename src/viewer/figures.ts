// Footballers: sculpted athletic figures in club kits. Each body part is one
// mesh whose triangles index into a small per-player palette texture, so a
// whole player shares one material and a handful of draw calls.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BOOT_COLORS, HAIR_COLORS, SKIN_TONES, type Appearance } from '../../shared/appearance.ts';
import { gear, type Equipped, type Item } from '../../shared/cosmetics.ts';

export interface Kit {
  primary: string;
  secondary: string;
}

const SCALE = 1.45;

// ---------- Palette ----------

const S = {Shirt: 0, Trim: 1, Shorts: 2, Sock: 3, Skin: 4, Hair: 5, Boot: 6, BootAccent: 7, Dark: 8, EyeWhite: 9, Lip: 10, Glove: 11, Wrist: 12, Band: 13, Neck: 14, Gold: 15, Stubble: 16, Base: 17, Sole: 18, Count: 19} as const;
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

/** A solid of revolution from [radius, y] pairs (bottom to top), seam at the back. */
function lathe(profile: [number, number][], segs = 18): THREE.BufferGeometry {
  // Faces point outward only when the profile runs bottom to top.
  const pts = profile[0][1] > profile[profile.length - 1][1] ? [...profile].reverse() : profile;
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.0005), y)), segs, Math.PI, Math.PI * 2);
}
/**
 * A lathe painted quad by quad: `fn` gets each quad's centre angle (0 = front,
 * PI/2 = +x), its height and its segment, so panels and stripes follow the
 * mesh lines instead of zig-zagging across triangles.
 */
function latheP(profile: [number, number][], segs: number, fn: (ang: number, y: number, seg: number) => number) {
  if (profile[0][1] > profile[profile.length - 1][1]) profile = [...profile].reverse();
  const rows = profile.length - 1;
  const d = (Math.PI * 2) / segs;
  return paint(lathe(profile, segs), (_c, tri) => {
    const q = Math.floor(tri / 2);
    const seg = Math.floor(q / rows);
    const row = q % rows;
    const phi = Math.PI + (seg + 0.5) * d;
    return fn(Math.atan2(Math.sin(phi), Math.cos(phi)), (profile[row][1] + profile[row + 1][1]) / 2, seg);
  });
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

// ---------- Body parts (metres in body space; the player is ~2.25 tall before scaling) ----------

const HIP_Y = 1.04;
const WAIST_Y = 1.18;
const SHOULDER = { x: 0.245, y: 0.47 };
const NECK_TOP = 0.68;
const THIGH = 0.5;
const SHIN = 0.54;
const UPPER_ARM = 0.33;

type Pattern = 'plain' | 'stripes' | 'hoops';

function kitPattern(k: Kit): Pattern {
  let h = 0;
  for (const ch of k.primary + k.secondary) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const r = h % 10;
  return r < 6 ? 'plain' : r < 9 ? 'stripes' : 'hoops';
}

/** Hips and shorts, in body space. */
function pelvisGeo() {
  return cached('pelvis', () => {
    const p = latheP([[0.06, 0.93], [0.15, 0.94], [0.185, 0.96], [0.192, 1.0], [0.188, 1.1], [0.17, 1.18], [0.1, 1.22]], 24, (a, y) =>
      Math.abs(Math.sin(a)) > 0.97 && y > 0.92 ? S.Shirt : S.Shorts);
    return p.scale(1.1, 1, 0.8);
  });
}

/** Shirt, neck and collar, in waist space. */
function torsoGeo(pattern: Pattern, keeper: boolean) {
  return cached(`torso|${pattern}|${keeper}`, () => {
    const sx = 1.28;
    const sz = 0.82;
    const prof: [number, number][] = [[0.16, -0.16], [0.196, -0.15], [0.194, -0.1], [0.186, -0.04], [0.18, 0.04], [0.184, 0.13], [0.198, 0.23], [0.215, 0.33], [0.225, 0.41], [0.222, 0.47], [0.2, 0.525], [0.15, 0.57], [0.098, 0.6], [0.078, 0.612]];
    const torso = latheP(prof, 32, (ang, y, seg) => {
      if (y > 0.59 || y < -0.135) return S.Trim;
      const side = Math.abs(Math.sin(ang));
      if (keeper) return Math.abs(y - 0.3) < 0.04 && Math.cos(ang) > 0.2 ? S.Trim : S.Shirt;
      if (side > 0.97 && y < 0.47) return S.Trim;
      if (pattern === 'stripes') return Math.floor(seg / 2) % 2 ? S.Trim : S.Shirt;
      if (pattern === 'hoops') return Math.floor((y + 0.16) / 0.12) % 2 ? S.Trim : S.Shirt;
      return S.Shirt;
    }).scale(sx, 1, sz);
    const neck = paint(at(lathe([[0.076, 0.5], [0.074, 0.6], [0.068, 0.68], [0.062, 0.72]], 16), 0, 0, 0.008), S.Skin);
    const collar = paint(new THREE.TorusGeometry(0.085, 0.019, 8, 28).rotateX(Math.PI / 2), S.Trim);
    at(collar, 0, 0.603, 0.004);
    // Crest on the chest.
    const crest = paint(ball(0.03, 10, 8).scale(1, 1.15, 0.35), S.Trim);
    at(crest, 0.1, 0.43, 0.178);
    return merge([torso, neck, collar, crest]);
  });
}

/** Shoulder, sleeve and upper arm, hanging from the shoulder joint. */
function upperArmGeo(keeper: boolean) {
  return cached(`uarm|${keeper}`, () => {
    const s = latheP([[0.0, 0.07], [0.035, 0.066], [0.06, 0.05], [0.075, 0.02], [0.079, -0.03], [0.075, -0.1], [0.071, -0.15], [0.07, -0.175]], 18, (_a, y) => (!keeper && y < -0.15 ? S.Trim : S.Shirt));
    const arm = paint(lathe([[0.058, -0.12], [0.06, -0.18], [0.055, -0.26], [0.049, -0.32], [0.046, -0.35], [0.038, -0.375], [0.015, -0.385]], 16), keeper ? S.Shirt : S.Skin);
    return merge([s, arm]);
  });
}

/** Forearm and hand, hanging from the elbow. */
function forearmGeo(keeper: boolean, band: boolean) {
  return cached(`farm|${keeper}|${band}`, () => {
    const fore = lathe([[0.015, 0.055], [0.036, 0.045], [0.046, 0.02], [0.051, -0.04], [0.052, -0.08], [0.045, -0.17], [0.037, -0.25], [0.035, -0.27]], 16);
    const parts = [paint(fore, (c) => (keeper ? (c.y < -0.22 ? S.Trim : S.Shirt) : S.Skin))];
    const hand = paint(ball(keeper ? 0.056 : 0.046, 12, 10).scale(0.62, 1, 0.9), keeper ? S.Glove : S.Skin);
    parts.push(at(hand, 0, -0.32, 0.004));
    const thumb = paint(ball(keeper ? 0.024 : 0.018, 8, 6).scale(1, 1.6, 1), keeper ? S.Glove : S.Skin);
    parts.push(at(thumb, 0, -0.3, 0.035));
    if (band && !keeper) parts.push(at(paint(new THREE.CylinderGeometry(0.044, 0.044, 0.06, 14), S.Wrist), 0, -0.235, 0));
    return merge(parts);
  });
}

/** Shorts leg and thigh, hanging from the hip joint. */
function thighGeo(keeper: boolean) {
  return cached(`thigh|${keeper}`, () => {
    const shortsLeg = latheP([[0.1, 0.1], [0.126, 0.03], [0.13, -0.08], [0.13, -0.18], [0.127, -0.25], [0.12, -0.27]], 20, (_a, y) =>
      !keeper && y < -0.24 ? S.Shirt : S.Shorts);
    const thigh = paint(lathe([[0.1, -0.12], [0.102, -0.2], [0.094, -0.3], [0.078, -0.43], [0.068, -0.49], [0.06, -0.54], [0.025, -0.565]], 16), S.Skin);
    thigh.scale(1, 1, 1.06);
    return merge([shortsLeg, thigh]);
  });
}

/** Knee, sock, shin pad bulge and boot, hanging from the knee joint. */
function shinGeo() {
  return cached('shin', () => {
    const knee = paint(ball(0.05, 12, 10).scale(0.9, 1.2, 0.7), S.Skin);
    at(knee, 0, -0.01, 0.025);
    const shin = paint(lathe([[0.02, 0.06], [0.05, 0.05], [0.06, 0.02], [0.059, -0.04], [0.06, -0.1]], 14), S.Skin);
    const sock = lathe([[0.062, -0.08], [0.068, -0.12], [0.073, -0.19], [0.066, -0.27], [0.054, -0.36], [0.05, -0.41]], 16);
    const s = paint(sock, (c) => (c.y > -0.115 ? S.Trim : S.Sock));
    s.scale(1, 1, 1.04);
    const ankle = paint(lathe([[0.057, -0.37], [0.063, -0.41], [0.063, -0.46]], 16), S.Boot);
    const shoe = (yMin: number, yMax: number, sx: number, sz: number) => {
      const g = ball(0.07, 20, 14);
      const bp = g.attributes.position;
      for (let i = 0; i < bp.count; i++) bp.setXYZ(i, bp.getX(i) * sx, Math.min(yMax, Math.max(yMin, bp.getY(i) * 0.75)), bp.getZ(i) * sz);
      return g;
    };
    // Upper, then a slightly wider sole plate following the same outline.
    const boot = paint(shoe(-0.03, 1, 0.86, 1.95), S.Boot);
    const sole = paint(shoe(-0.044, -0.026, 0.9, 2.0), S.Sole);
    for (const g of [boot, sole]) at(g, 0, -SHIN + 0.044, 0.05);
    return merge([knee, shin, s, ankle, boot, sole]);
  });
}

// ---------- Head ----------

const HEAD_C = new THREE.Vector3(0, 0.17, 0.01);
const HEAD_R = 0.155;

/** Shapes a sphere around the head centre into a skull with a jaw and chin. */
function sculpt(g: THREE.BufferGeometry, r = HEAD_R) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    const y = p.getY(i);
    let z = p.getZ(i);
    const low = Math.max(0, -y / r);
    x *= 1 - 0.2 * low * low;
    if (z > 0) z *= 1 + 0.08 * low;
    if (z < 0 && y > -0.2 * r) z *= 1.06;
    p.setXYZ(i, x, y * 1.15, z * 1.04);
  }
  return g;
}

/** Point on the face surface at (x, yRel) from the head centre, nudged out by `out`. */
function onFace(x: number, yRel: number, out = 0) {
  const y0 = yRel / 1.15;
  const zz = Math.sqrt(Math.max(0, HEAD_R * HEAD_R - x * x - y0 * y0));
  const low = Math.max(0, -y0 / HEAD_R);
  return HEAD_C.z + zz * (1 + 0.08 * low) * 1.04 + out;
}

/**
 * A hair shell around the skull. Vertices below the hairline (high at the
 * forehead, low at the nape) tuck inside the head, which leaves a soft edge.
 */
function hairCap(r: number, front: number, back: number, opts: { segs?: number; puff?: number; dy?: number; dz?: number } = {}) {
  const segs = opts.segs ?? 40;
  const g = new THREE.SphereGeometry(r, segs, Math.round(segs * 0.7));
  const p = g.attributes.position;
  const d = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    d.fromBufferAttribute(p, i).normalize();
    const phi = Math.atan2(d.x, d.z);
    // Around the ears the line dips a little less, framing the face.
    const line = front - (front - back) * (1 - Math.cos(phi)) * 0.5 + Math.max(0, Math.cos(Math.abs(phi) - Math.PI / 2)) * 0.08;
    if (d.y < line) d.multiplyScalar(HEAD_R * 0.86);
    else d.multiplyScalar(r * (1 + (opts.puff ?? 0) * Math.max(0, d.y - line) ));
    p.setXYZ(i, d.x, d.y, d.z);
  }
  sculpt(g, r);
  return paint(at(g, HEAD_C.x, HEAD_C.y + (opts.dy ?? 0), HEAD_C.z + (opts.dz ?? 0)), S.Hair);
}

function hairGeo(style: number): THREE.BufferGeometry[] {
  const C = HEAD_C;
  const blob = (r: number, sx: number, sy: number, sz: number, x: number, y: number, z: number) => paint(at(ball(r, 16, 12).scale(sx, sy, sz), C.x + x, C.y + y, C.z + z), S.Hair);
  const R = HEAD_R;
  switch (style) {
    case 0: return [hairCap(R * 1.018, 0.5, -0.5)];
    case 1: return [hairCap(R * 1.06, 0.46, -0.48, { puff: 0.06 }), blob(0.075, 1.6, 0.5, 0.8, 0, 0.125, 0.085)];
    case 2: return [hairCap(R * 1.05, 0.5, -0.45, { puff: 0.12 })];
    case 3: return [hairCap(R * 1.05, 0.5, -0.5, { puff: 0.05 }), blob(0.075, 1.35, 0.85, 1.5, 0, 0.16, 0.075)];
    case 4: {
      const out = [hairCap(R * 1.06, 0.46, -0.45)];
      const n = 30;
      for (let i = 0; i < n; i++) {
        // Fibonacci points over the crown, kept off the forehead.
        const yv = 1 - (i / (n - 1)) * 1.1;
        const rr = Math.sqrt(Math.max(0, 1 - yv * yv));
        const a = i * 2.39996;
        const d = new THREE.Vector3(Math.sin(a) * rr, yv, Math.cos(a) * rr);
        const line = 0.46 - 0.91 * (1 - Math.cos(Math.atan2(d.x, d.z))) * 0.5;
        if (d.y < line + 0.08) continue;
        out.push(blob(0.04, 1, 1, 1, d.x * 0.168, d.y * 0.19, d.z * 0.172));
      }
      return out;
    }
    case 5: return [hairCap(0.19, 0.44, -0.3, { segs: 44, puff: 0.3, dy: 0.02, dz: -0.02 })];
    case 6: {
      const back = paint(at(new THREE.CapsuleGeometry(0.12, 0.17, 6, 16).scale(1.32, 1, 0.55), C.x, C.y - 0.1, C.z - 0.105), S.Hair);
      return [hairCap(R * 1.06, 0.44, -0.75, { puff: 0.05 }), back, blob(0.08, 1.7, 0.42, 0.85, 0.02, 0.125, 0.085)];
    }
    case 7: return [hairCap(R * 1.04, 0.48, -0.5), blob(0.07, 1, 0.92, 1, 0, 0.17, -0.12)];
    case 8: {
      const out = [hairCap(R * 1.012, 0.5, -0.5)];
      for (let i = 0; i < 6; i++) {
        const a = -0.6 + i * 0.36;
        const spike = new THREE.ConeGeometry(0.034, 0.11, 8).rotateX(a);
        out.push(paint(at(spike, C.x, C.y + Math.cos(a) * 0.19, C.z + Math.sin(a) * 0.17), S.Hair));
      }
      return out;
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
  const tache = () => paint(at(new THREE.CapsuleGeometry(0.012, 0.055, 4, 8).rotateZ(Math.PI / 2), 0, C.y - 0.07, onFace(0, -0.07, 0.006)), S.Hair);
  switch (kind) {
    case 1: return [shell(HEAD_R * 1.012, 3.4, Math.PI * 0.6, Math.PI * 0.36, S.Stubble)];
    case 2: return [tache(), paint(at(ball(0.035, 12, 8).scale(1, 1.2, 0.8), 0, C.y - 0.155, onFace(0, -0.155, -0.006)), S.Hair)];
    case 3: return [shell(HEAD_R * 1.05, 3.6, Math.PI * 0.58, Math.PI * 0.4, S.Hair), tache()];
    case 4: return [tache()];
    default: return [];
  }
}

function headGeo(app: Appearance, band: '' | 'band' | 'alice', earring: boolean) {
  const key = `head|${app.hair}|${app.beard}|${app.face}|${band}|${earring}`;
  return cached(key, () => {
    const C = HEAD_C;
    const parts: THREE.BufferGeometry[] = [];
    parts.push(paint(at(sculpt(new THREE.SphereGeometry(HEAD_R, 32, 24)), C.x, C.y, C.z), S.Skin));
    for (const sx of [-1, 1]) {
      parts.push(paint(at(ball(0.036, 10, 8).scale(0.45, 1, 0.8), sx * 0.15, C.y - 0.01, C.z - 0.005), S.Skin));
      // Eyes: white, then the iris on top.
      const ey = 0.022;
      const ex = sx * 0.054;
      parts.push(paint(at(ball(0.024, 12, 8).scale(1, 0.72, 0.45), ex, C.y + ey, onFace(ex, ey, -0.004)), S.EyeWhite));
      parts.push(paint(at(ball(0.0125, 10, 8).scale(1, 1, 0.5), ex, C.y + ey, onFace(ex, ey, 0.004)), S.Dark));
      // Brows set the mood.
      const tilt = [0, 0.14, -0.1, 0.3][app.face] ?? 0;
      const brow = new THREE.BoxGeometry(0.052, 0.013, 0.016).rotateZ(sx * tilt).rotateY(-sx * 0.25);
      const by = 0.058 - (app.face === 3 ? 0.006 : 0) + (app.face === 2 ? 0.004 : 0);
      parts.push(paint(at(brow, sx * 0.056, C.y + by, onFace(sx * 0.056, by, 0.002)), S.Hair));
    }
    parts.push(paint(at(ball(0.026, 10, 8).scale(0.8, 1.05, 1.25), 0, C.y - 0.018, onFace(0, -0.018, 0.004)), S.Skin));
    // Mouth.
    const my = -0.085;
    if (app.face === 2) {
      parts.push(paint(at(new THREE.TorusGeometry(0.028, 0.006, 6, 14, Math.PI).rotateZ(Math.PI), 0, C.y + my + 0.012, onFace(0, my, -0.002)), S.Lip));
    } else {
      const w = app.face === 3 ? 0.06 : 0.046;
      parts.push(paint(at(new THREE.CapsuleGeometry(0.0065, w, 3, 6).rotateZ(Math.PI / 2), 0, C.y + my, onFace(0, my, -0.003)), S.Lip));
    }
    parts.push(...hairGeo(app.hair));
    parts.push(...beardGeo(app.beard));
    if (band) {
      const t = new THREE.TorusGeometry(0.168, band === 'alice' ? 0.009 : 0.02, 8, 36).rotateX(Math.PI / 2 - 0.3);
      parts.push(paint(at(t.scale(1, 1, 1.06), C.x, C.y + 0.08, C.z - 0.01), S.Band));
    }
    if (earring) parts.push(paint(at(new THREE.TorusGeometry(0.013, 0.004, 6, 12), -0.152, C.y - 0.045, C.z), S.Gold));
    return merge(parts);
  });
}

function neckwearGeo(style: string) {
  return cached(`neck|${style}`, () => {
    if (style === 'snood') return paint(at(new THREE.CylinderGeometry(0.085, 0.1, 0.12, 20, 1, true), 0, 0.66, 0.004), S.Neck);
    if (style === 'medal') {
      const ribbon = paint(new THREE.TorusGeometry(0.11, 0.012, 6, 28).rotateX(Math.PI / 2 - 0.55).scale(1, 1.5, 1), S.Trim);
      at(ribbon, 0, 0.56, 0.06);
      const disc = paint(new THREE.CylinderGeometry(0.05, 0.05, 0.014, 20).rotateX(Math.PI / 2), S.Neck);
      at(disc, 0, 0.42, 0.19);
      return merge([ribbon, disc]);
    }
    return paint(at(new THREE.TorusGeometry(0.1, 0.011, 6, 30).rotateX(Math.PI / 2 - 0.5), 0, 0.585, 0.05), S.Neck);
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
    sheen: 0.35,
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

function mix(a: string, b: string, t: number) {
  return '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
}

/** A colour that reads against `c`: white on dark, near-black on light. */
function contrast(c: string) {
  const col = new THREE.Color(c);
  return col.r * 0.3 + col.g * 0.59 + col.b * 0.11 > 0.5 ? '#141414' : '#f4f4f4';
}

const geo = { ring: new THREE.RingGeometry(0.72, 0.9, 40).rotateX(-Math.PI / 2) };
const numberPlane = new THREE.PlaneGeometry(0.21, 0.21);

export class Figure {
  root = new THREE.Group();
  body = new THREE.Group();
  /** Chest, arms and head: twists against the hips when running. */
  private upper = new THREE.Group();
  private head = new THREE.Group();
  private legL: THREE.Group;
  private legR: THREE.Group;
  private kneeL: THREE.Group;
  private kneeR: THREE.Group;
  private elbowL: THREE.Group;
  private elbowR: THREE.Group;
  /** Body height above the root: on a base, or standing on the grass. */
  private lift: number;
  /** Local velocity (m/s): forward and sideways. Set by the match viewer for backpedals and side-steps. */
  fwd = 0;
  side = 0;
  /** Lean from acceleration (radians), forward and into turns. */
  leanX = 0;
  leanZ = 0;
  private armL: THREE.Group;
  private armR: THREE.Group;
  ring: THREE.Mesh;
  phase = Math.random() * 10;
  pos = new THREE.Vector2();
  vel = new THREE.Vector2();
  heading = 0;
  visible = true;
  celebrate = 0;
  celStyle = '';
  /** True for the goalscorer, who does their own celebration. */
  star = false;
  private celT = 0;
  /** One-shot training pose layered over the run cycle; `poseK` is its 0..1 progress. */
  pose: '' | 'kick' | 'juggle' | 'slide' | 'dive' | 'header' = '';
  poseK = 0;
  poseSide = 1;

  constructor(kit: Kit, app: Appearance, isKeeper: boolean, gkKit: Kit, eq?: Equipped, opts: { base?: boolean; number?: number } = {}) {
    const withBase = opts.base !== false;
    this.lift = withBase ? 0.12 : 0;
    const g = gear(eq);
    this.celStyle = g.celebration?.style ?? '';
    const k = isKeeper ? gkKit : kit;
    const skin = SKIN_TONES[app.skin] ?? SKIN_TONES[1];
    const hair = HAIR_COLORS[app.hairColor] ?? HAIR_COLORS[0];
    const boot = g.boots?.c1 ?? BOOT_COLORS[app.boots] ?? BOOT_COLORS[0];
    const fabric = (color: string, rough = 0.78): SlotLook => ({ color, rough, coat: 0.04 });
    const looks: SlotLook[] = [];
    looks[S.Shirt] = fabric(k.primary);
    looks[S.Trim] = fabric(k.secondary);
    looks[S.Shorts] = isKeeper ? fabric('#1b1d21', 0.7) : fabric(k.secondary, 0.7);
    looks[S.Sock] = fabric(k.primary, 0.85);
    looks[S.Skin] = { color: skin, rough: 0.52, coat: 0.12 };
    looks[S.Hair] = { color: hair, rough: 0.68, coat: 0.08 };
    looks[S.Boot] = g.boots?.metal ? { color: boot, rough: 0.2, metal: 1, coat: 0.8 } : { color: boot, rough: 0.28, coat: 0.85 };
    looks[S.BootAccent] = { color: g.boots?.c2 ?? contrast(boot), rough: 0.35, coat: 0.6 };
    looks[S.Dark] = { color: '#17110d', rough: 0.15, coat: 1 };
    looks[S.EyeWhite] = { color: '#f2eee8', rough: 0.2, coat: 0.9 };
    looks[S.Lip] = { color: mix(skin, '#6b2a22', 0.38), rough: 0.45, coat: 0.2 };
    looks[S.Glove] = { color: '#eef2f4', rough: 0.55, coat: 0.2 };
    looks[S.Wrist] = gearLook(g.wrist, k.secondary);
    looks[S.Band] = gearLook(g.head, k.secondary);
    looks[S.Neck] = gearLook(g.neck, '#ffcf3d');
    if (!g.neck) Object.assign(looks[S.Neck], { rough: 0.25, metal: 1, coat: 0.6 });
    looks[S.Gold] = { color: '#ffcf3d', rough: 0.2, metal: 1, coat: 0.6 };
    looks[S.Stubble] = { color: mix(skin, hair, 0.42), rough: 0.85 };
    looks[S.Base] = { color: k.secondary, rough: 0.35, coat: 0.8 };
    looks[S.Sole] = { color: g.boots?.c2 ?? mix(boot, '#101010', 0.55), rough: 0.5, coat: 0.3 };
    const mat = paletteMaterial(looks);

    const mesh = (geom: THREE.BufferGeometry, parent: THREE.Object3D, shadow = true) => {
      const x = new THREE.Mesh(geom, mat);
      x.castShadow = shadow;
      parent.add(x);
      return x;
    };

    // Base (team-coloured puck) and a selection ring.
    if (withBase) mesh(baseGeo, this.root).receiveShadow = true;
    this.ring = new THREE.Mesh(geo.ring, new THREE.MeshBasicMaterial({ color: 0xc6ff3d, transparent: true, opacity: 0, depthWrite: false }));
    this.ring.position.y = 0.03;
    this.root.add(this.ring);

    this.body.position.y = this.lift;
    this.root.add(this.body);
    mesh(pelvisGeo(), this.body);

    const mkLeg = (side: number) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.105, HIP_Y, 0);
      mesh(thighGeo(isKeeper), hip);
      const knee = new THREE.Group();
      knee.position.y = -THIGH;
      mesh(shinGeo(), knee);
      hip.add(knee);
      this.body.add(hip);
      return [hip, knee] as const;
    };
    [this.legL, this.kneeL] = mkLeg(-1);
    [this.legR, this.kneeR] = mkLeg(1);

    this.upper.position.y = WAIST_Y;
    this.body.add(this.upper);
    mesh(torsoGeo(isKeeper ? 'plain' : kitPattern(kit), isKeeper), this.upper);
    if (g.neck || app.accessory === 4) mesh(neckwearGeo(g.neck?.style ?? 'chain'), this.upper);
    if (opts.number !== undefined) {
      // Shirt number on the back.
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
      num.position.set(0, 0.32, -0.181);
      num.rotation.y = Math.PI;
      this.upper.add(num);
    }

    const band = !!g.wrist || app.accessory === 3;
    const mkArm = (side: number) => {
      const sh = new THREE.Group();
      sh.position.set(side * SHOULDER.x, SHOULDER.y, 0);
      mesh(upperArmGeo(isKeeper), sh);
      const elbow = new THREE.Group();
      elbow.position.y = -UPPER_ARM;
      mesh(forearmGeo(isKeeper, band), elbow);
      sh.add(elbow);
      sh.rotation.z = side * 0.1;
      this.upper.add(sh);
      return [sh, elbow] as const;
    };
    [this.armL, this.elbowL] = mkArm(-1);
    [this.armR, this.elbowR] = mkArm(1);

    this.head.position.y = NECK_TOP;
    const headIt = g.head;
    const bandKind = headIt ? (headIt.style === 'alice' ? 'alice' : 'band') : app.accessory === 1 ? 'band' : '';
    mesh(headGeo(app, bandKind, app.accessory === 2), this.head);
    this.upper.add(this.head);
    this.root.scale.setScalar(SCALE);
  }

  /** Advances the run cycle. `speed` in m/s. */
  animate(dt: number, speed: number, time: number) {
    const run = Math.min(1, speed / 7);
    // Strides lengthen with speed; cadence rises more slowly. Standing still the legs settle.
    const moving = speed > 0.25 ? 1 : 0;
    this.phase += dt * (speed > 0.25 ? 5.2 + speed * 0.95 : 0);
    const shuffle = Math.abs(this.side) > Math.abs(this.fwd) * 1.3 && speed < 4.5 && speed > 0.25;
    const back = !shuffle && this.fwd < -0.4;
    const amp = (0.12 + run * 0.95) * moving * (back ? 0.6 : 1) * (shuffle ? 0.25 : 1);
    const sp = Math.sin(this.phase);
    const cp = Math.cos(this.phase);
    const sw = sp * amp * (back ? -1 : 1);
    const b = this.body;
    this.legL.rotation.set(sw, 0, 0);
    this.legR.rotation.set(-sw, 0, 0);
    // Knees fold as each leg swings through: deep at a sprint, soft at a jog.
    const flex = (0.2 + run * 1.35) * moving;
    const fl = back ? Math.max(0, cp) : Math.max(0, -cp);
    const fr = back ? Math.max(0, -cp) : Math.max(0, cp);
    this.kneeL.rotation.x = 0.06 + flex * fl * fl;
    this.kneeR.rotation.x = 0.06 + flex * fr * fr;
    if (shuffle) {
      // Side-step: legs open and close, a little hop.
      const open = Math.abs(sp) * 0.32;
      const sgn = Math.sign(this.side);
      this.legL.rotation.z = -open * (sgn > 0 ? 0.6 : 1);
      this.legR.rotation.z = open * (sgn > 0 ? 1 : 0.6);
    }
    this.armL.rotation.set(-sw * 0.85, 0, -0.1 - run * 0.08);
    this.armR.rotation.set(sw * 0.85, 0, 0.1 + run * 0.08);
    // Elbows bend more the faster they pump; shoulders counter-rotate against the hips.
    const elbow = -(0.28 + run * 1.0) * (shuffle ? 0.8 : 1) - (moving ? 0 : 0.05);
    this.elbowL.rotation.set(elbow + Math.max(0, sw) * 0.25, 0, 0);
    this.elbowR.rotation.set(elbow + Math.max(0, -sw) * 0.25, 0, 0);
    this.upper.rotation.set(0, sw * 0.16 * (back ? -1 : 1), 0);
    this.head.rotation.set(0, -sw * 0.12, 0);
    const bounce = shuffle ? Math.abs(sp) * 0.06 : Math.abs(cp) * (0.025 + run * 0.06) * moving;
    b.position.set(0, this.lift + bounce, 0);
    b.rotation.set((back ? -0.06 : run * 0.2) + this.leanX, 0, this.leanZ);
    // Eyes stay on the play: the head counters most of the body lean.
    this.head.rotation.x = -b.rotation.x * 0.65;
    if (this.celebrate <= 0) {
      this.celT = 0;
      // Idle breathing.
      if (speed < 0.25) b.rotation.z = Math.sin(time * 1.7 + this.phase) * 0.015;
      this.applyPose();
      return;
    }
    this.celT += dt;
    const t = this.celT;
    switch (this.star ? this.celStyle : '') {
      case 'plane': {
        // Arms out, banking left and right.
        this.armL.rotation.set(0, 0, -1.5);
        this.armR.rotation.set(0, 0, 1.5);
        this.elbowL.rotation.x = this.elbowR.rotation.x = -0.05;
        b.rotation.z = Math.sin(t * 2.2) * 0.38;
        b.rotation.x = 0.22;
        break;
      }
      case 'slide': {
        // Drop to the knees, lean back, arms wide.
        const k = Math.min(1, t / 0.35);
        b.position.y = this.lift - 0.42 * k;
        b.rotation.x = -0.32 * k;
        this.legL.rotation.x = 1.45 * k;
        this.legR.rotation.x = 1.45 * k;
        this.armL.rotation.set(-0.6, 0, -2.3 * k);
        this.armR.rotation.set(-0.6, 0, 2.3 * k);
        this.kneeL.rotation.x = this.kneeR.rotation.x = 1.5 * k;
        this.elbowL.rotation.x = this.elbowR.rotation.x = -0.3;
        break;
      }
      case 'spin': {
        const u = (t % 1.3) / 1.3;
        const hop = Math.sin(Math.min(1, u / 0.7) * Math.PI);
        b.position.y = this.lift + hop * 0.65;
        b.rotation.y = u < 0.7 ? (u / 0.7) * Math.PI * 2 : 0;
        this.armL.rotation.set(0, 0, -1.2 - hop);
        this.armR.rotation.set(0, 0, 1.2 + hop);
        this.elbowL.rotation.x = this.elbowR.rotation.x = -0.2;
        break;
      }
      case 'flip': {
        // A backflip every 1.8s, rotating around the hips.
        const u = (t % 1.8) / 1.8;
        const air = Math.min(1, Math.max(0, (u - 0.1) / 0.5));
        const th = -air * Math.PI * 2;
        const h = Math.sin(air * Math.PI) * 1.1;
        const c = 0.95;
        b.rotation.set(th, 0, 0);
        b.position.set(0, this.lift + h + c - c * Math.cos(th), -c * Math.sin(th));
        const tuck = Math.sin(air * Math.PI);
        this.legL.rotation.x = -1.2 * tuck;
        this.legR.rotation.x = -1.2 * tuck;
        this.armL.rotation.set(-2.6 + tuck * 1.4, 0, -0.3);
        this.armR.rotation.set(-2.6 + tuck * 1.4, 0, 0.3);
        if (u > 0.6) {
          this.armL.rotation.set(-2.8, 0, -0.4);
          this.armR.rotation.set(-2.8, 0, 0.4);
        }
        break;
      }
      default: {
        // Arms up, fists pumping, little hops.
        this.armL.rotation.x = -2.6 + Math.sin(time * 9) * 0.25;
        this.armR.rotation.x = -2.6 + Math.cos(time * 9) * 0.25;
        this.elbowL.rotation.x = -0.5 - Math.max(0, Math.sin(time * 9)) * 0.6;
        this.elbowR.rotation.x = -0.5 - Math.max(0, Math.cos(time * 9)) * 0.6;
        this.upper.rotation.y = 0;
        b.position.y = this.lift + Math.abs(Math.sin(time * 7 + this.phase)) * 0.25;
      }
    }
  }

  private applyPose() {
    const k = this.poseK;
    const b = this.body;
    switch (this.pose) {
      case 'kick': {
        // Wind up, strike through the ball, follow through.
        const th = k < 0.35 ? 0.9 * (k / 0.35) : k < 0.55 ? 0.9 - 2.3 * ((k - 0.35) / 0.2) : -1.4 * (1 - (k - 0.55) / 0.45);
        this.legR.rotation.x = th;
        this.legL.rotation.x = 0.1;
        this.kneeR.rotation.x = k < 0.4 ? 1.3 * (k / 0.4) : Math.max(0.05, 1.3 * (1 - (k - 0.4) / 0.15));
        this.kneeL.rotation.x = 0.2;
        this.armL.rotation.z = -0.75;
        this.armR.rotation.z = 0.5;
        this.elbowL.rotation.x = -0.35;
        this.elbowR.rotation.x = -0.5;
        this.upper.rotation.y = k < 0.45 ? 0.25 * (k / 0.45) : 0.25 - 0.55 * Math.min(1, (k - 0.45) / 0.3);
        b.rotation.x = k > 0.35 && k < 0.75 ? -0.12 : 0.04;
        break;
      }
      case 'juggle': {
        // Foot up as the ball drops to it on each whole beat, alternating feet.
        const s = Math.pow(Math.max(0, Math.cos(k * Math.PI * 2)), 2);
        const right = Math.floor(k + 0.5) % 2 === 0;
        this.legR.rotation.x = right ? -0.85 * s : 0;
        this.legL.rotation.x = right ? 0 : -0.85 * s;
        this.armL.rotation.z = -0.45;
        this.armR.rotation.z = 0.45;
        break;
      }
      case 'slide': {
        const d = Math.min(1, k * 3) * (k > 0.8 ? (1 - k) / 0.2 : 1);
        b.position.y = this.lift - 0.45 * d;
        b.rotation.x = -0.75 * d;
        this.legR.rotation.x = -1.45 * d;
        this.legL.rotation.x = -0.9 * d;
        this.kneeR.rotation.x = 0.05;
        this.kneeL.rotation.x = 0.9 * d;
        this.armL.rotation.set(0.6 * d, 0, -1.2 * d);
        this.armR.rotation.set(0.6 * d, 0, 1.0 * d);
        this.elbowL.rotation.x = this.elbowR.rotation.x = -0.2;
        this.upper.rotation.y = 0;
        break;
      }
      case 'header': {
        // Leap, arch back, snap the head through the ball.
        const j = Math.sin(Math.min(1, k) * Math.PI);
        b.position.y = this.lift + j * 0.75;
        b.rotation.x = k < 0.45 ? -0.35 * (k / 0.45) : -0.35 + 0.75 * Math.min(1, (k - 0.45) / 0.2);
        this.legL.rotation.x = 0.3 * j;
        this.legR.rotation.x = -0.2 * j;
        this.kneeL.rotation.x = 1.1 * j;
        this.kneeR.rotation.x = 0.7 * j;
        this.armL.rotation.set(-1.2 * j, 0, -0.9 * j);
        this.armR.rotation.set(-1.2 * j, 0, 0.9 * j);
        this.elbowL.rotation.x = this.elbowR.rotation.x = -1.1 * j;
        this.upper.rotation.y = 0;
        this.head.rotation.x = b.rotation.x < 0 ? 0.2 : -0.35;
        break;
      }
      case 'dive': {
        const d = Math.sin((Math.min(1, k * 1.4) * Math.PI) / 2) * (k > 0.85 ? (1 - k) / 0.15 : 1);
        const s = this.poseSide;
        b.rotation.z = -s * 1.35 * d;
        b.position.set(s * 1.1 * d, this.lift + 0.45 * Math.sin(Math.min(1, k * 1.6) * Math.PI), 0);
        this.armL.rotation.set(0, 0, -2.8 * d);
        this.armR.rotation.set(0, 0, 2.8 * d);
        this.elbowL.rotation.x = this.elbowR.rotation.x = -0.1;
        this.upper.rotation.y = 0;
        this.kneeL.rotation.x = 0.5 * d;
        this.kneeR.rotation.x = 0.2 * d;
        break;
      }
    }
  }
}

export const GK_KITS: Kit[] = [
  { primary: '#ffb020', secondary: '#1b1b1b' },
  { primary: '#3dd6ff', secondary: '#0b2540' },
];
