// Modelled accessories for the casual look: hats and glasses (head units or
// bind space, riding the Head bone), chains and pendants draped over the
// chest, watches and bracelets on the wrists, and a hoodie's hood. Built in
// bind space from the fitted body, so they sit right on every body shape and
// over whatever the player wears.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BIND_JOINTS, chestZ, type BodyBuild, type Cut, type FaceLand } from './body.ts';
import { SHOE_PUFF, shoeColor, type Piece } from './casual.ts';
import { B } from '../rig/skeleton.ts';
import { fbm, smooth } from './noise.ts';
import type { GlassesSpec, HatSpec } from './character.ts';

// ---------- Materials ----------

const mats = new Map<string, THREE.Material>();
function cached<T extends THREE.Material>(key: string, make: () => T): T {
  let m = mats.get(key) as T | undefined;
  if (!m) {
    m = make();
    mats.set(key, m);
  }
  return m;
}
export const metalMat = (c: string, rough = 0.18) => cached(`metal|${c}|${rough}`, () => new THREE.MeshPhysicalMaterial({ color: c, metalness: 1, roughness: rough, clearcoat: 0.6, clearcoatRoughness: 0.1 }));
/** Stones: bright, glassy and a little rainbow at the edges. */
export const gemMat = (c: string) => cached(`gem|${c}`, () => new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.15, roughness: 0.02, clearcoat: 1, clearcoatRoughness: 0, iridescence: 1, iridescenceIOR: 1.8, specularIntensity: 1, envMapIntensity: 2.6, emissive: new THREE.Color(c).multiplyScalar(0.08) }));
const fabricMat = (c: string, gloss = false) => cached(`fab|${c}|${gloss}`, () => gloss
  ? new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.2, sheen: 0.4, sheenColor: new THREE.Color(0xffffff) })
  : new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.85, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffffff) }));
const hatMat = (gloss: boolean, metal: boolean) => cached(`hat|${gloss}|${metal}`, () => new THREE.MeshPhysicalMaterial({
  vertexColors: true,
  roughness: metal ? 0.2 : gloss ? 0.25 : 0.86,
  metalness: metal ? 1 : 0,
  clearcoat: gloss || metal ? 0.8 : 0,
  sheen: metal ? 0 : 0.6,
  sheenRoughness: 0.5,
  sheenColor: new THREE.Color(0xffffff),
  side: THREE.DoubleSide,
}));
const colorMat = (rough: number) => cached(`vc|${rough}`, () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: rough, clearcoat: 0.4 }));

/** Paints every vertex of a geometry one colour (for merging differently coloured parts). */
function tint(g: THREE.BufferGeometry, c: string | THREE.Color) {
  const col = new THREE.Color(c);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
/** Merges parts into one geometry (positions, and colours when any part has them), with fresh normals. */
function merge(gs: THREE.BufferGeometry[]) {
  const colored = gs.some((g) => g.attributes.color);
  const parts = gs.map((g) => {
    if (colored && !g.attributes.color) tint(g, '#ffffff');
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && !(colored && k === 'color')) g.deleteAttribute(k);
    return g.index ? g.toNonIndexed() : g;
  });
  const m = mergeGeometries(parts, false)!;
  m.computeVertexNormals();
  return m;
}

// ---------- Hats (head units) ----------

/** How much hair is left under a hat (the rest is pressed flat). */
export const HAT_SQUASH = 0.15;

/** Height of a hat's rim (head units) at `th` round the head (0 is the front). */
export function hatRim(style: string, th: number) {
  const back = (1 - Math.cos(th)) / 2;
  const side = Math.sin(th) ** 2;
  switch (style) {
    case 'beanie': case 'pom': return 0.052 - 0.03 * back - 0.022 * side;
    case 'durag': return 0.085 - 0.11 * back - 0.03 * side;
    case 'bucket': return 0.066 - 0.016 * back - 0.016 * side;
    case 'crown': return 0.12;
    default: return 0.074 - 0.026 * back - 0.02 * side;
  }
}

type Skull = (x: number, y: number, z: number) => number;
/** The skull's surface at height `y` in a horizontal direction. */
function surfAt(R: Skull, sx: number, y: number, sz: number): [number, number, number] {
  let el = 0.5;
  for (let i = 0; i < 8; i++) {
    const r = R(sx * Math.cos(el), Math.sin(el), sz * Math.cos(el));
    el = Math.asin(Math.max(-1, Math.min(1, y / r)));
  }
  const c = Math.cos(el), s = Math.sin(el);
  const r = R(sx * c, s, sz * c);
  return [sx * c * r, s * r, sz * c * r];
}

class Geo {
  pos: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  v(p: ArrayLike<number>, c: THREE.Color) {
    this.pos.push(p[0], p[1], p[2]);
    this.col.push(c.r, c.g, c.b);
    return this.pos.length / 3 - 1;
  }
  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    return g;
  }
}

/** A hat in head units; `capT` is the hair's thickness at a scalp point. */
export function buildHat(h: HatSpec, R: Skull, capT: (x: number, y: number, z: number) => number, L: FaceLand, hi: boolean): THREE.Mesh[] {
  const st = h.style;
  const c1 = new THREE.Color(h.c1), c2 = new THREE.Color(h.c2);
  const c3 = new THREE.Color(h.c1).lerp(new THREE.Color('#000'), 0.35);
  const NA = hi ? 72 : 36, NR = hi ? 16 : 8;
  const g = new Geo();
  if (st === 'crown') return [crown(h, R, capT, L, hi)];
  const front = st === 'backcap' ? Math.PI : 0;

  const dir = new THREE.Vector3();
  const dome = (th: number, f: number) => {
    const p0 = surfAt(R, Math.sin(th), hatRim(st, th), Math.cos(th));
    const el0 = Math.atan2(p0[1], Math.hypot(p0[0], p0[2]));
    const el = el0 + (Math.PI / 2 - 0.03 - el0) * f;
    dir.set(Math.sin(th) * Math.cos(el), Math.sin(el), Math.cos(th) * Math.cos(el));
    const r = R(dir.x, dir.y, dir.z);
    const hair = capT(dir.x * r, dir.y * r, dir.z * r) * HAT_SQUASH;
    let off = 0.006 + hair;
    if (st === 'cap' || st === 'backcap') off += 0.012 * Math.sin(f * Math.PI * 0.5) * (0.55 + 0.45 * Math.cos(th - front));
    if (st === 'beanie' || st === 'pom') off += 0.004 + 0.02 * f * f + (f < 0.28 ? 0.006 : 0);
    if (st === 'bucket') off += 0.004 + 0.004 * f;
    if (st === 'durag') off = 0.003 + hair * 0.6;
    return dir.clone().multiplyScalar(r + off).toArray();
  };
  const colAt = (_th: number, f: number, p: number[]) => {
    if (h.print === 'camo') {
      const n = fbm(p[0] * 40, p[1] * 40, p[2] * 40, 3);
      return n > 0.56 ? c2 : n < 0.42 ? c3 : c1;
    }
    if (st === 'pom') return Math.floor(f * 7) % 2 ? c2 : c1;
    if (st === 'beanie' && f < 0.28) return c1.clone().multiplyScalar(0.9);
    if ((st === 'cap' || st === 'backcap') && f > 0.97) return c2;
    return c1;
  };
  // Dome rows from the rim up.
  for (let j = 0; j <= NR; j++) {
    const f = j / NR;
    for (let i = 0; i <= NA; i++) {
      const th = (i / NA) * Math.PI * 2;
      const p = dome(th, f);
      // Ribbed knit and cap panels show in the shading as small ridges.
      if (st === 'beanie' || st === 'pom') {
        const k = 1 + Math.sin(th * 60) * 0.004;
        p[0] *= k;
        p[2] *= k;
      }
      g.v(p, colAt(th, f, p));
    }
  }
  for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) {
    const a = j * (NA + 1) + i;
    g.quad(a, a + 1, a + NA + 2, a + NA + 1);
  }
  // The rim turns under, so the edge has thickness.
  const base = g.pos.length / 3;
  for (let i = 0; i <= NA; i++) {
    const th = (i / NA) * Math.PI * 2;
    const p = dome(th, 0);
    const l = Math.hypot(p[0], p[2]);
    g.v([p[0] - (p[0] / l) * 0.006, p[1] - 0.002, p[2] - (p[2] / l) * 0.006], c3);
  }
  for (let i = 0; i < NA; i++) g.quad(i, base + i, base + i + 1, i + 1);

  // Brims: a curved peak on caps, all the way round on a bucket hat.
  if (st === 'cap' || st === 'backcap' || st === 'bucket') {
    const all = st === 'bucket';
    const span = all ? Math.PI : 1.15;
    const NK = all ? NA : hi ? 28 : 14;
    const NJ = 4;
    const top: number[] = [], bot: number[] = [];
    for (let k = 0; k <= NK; k++) {
      const u = -1 + (2 * k) / NK;
      const th = front + u * span;
      const inner = dome(th, 0);
      const len = all ? 0.046 : 0.088 * Math.sqrt(Math.max(0, 1 - u * u * 0.92));
      for (let j = 0; j <= NJ; j++) {
        const t = j / NJ;
        const d = len * t;
        // Caps curve down at the sides; bucket brims slope down all round.
        const drop = all ? 0.022 * t : 0.012 * t + 0.022 * u * u * t;
        const p = [inner[0] + Math.sin(th) * d, inner[1] - drop - 0.002, inner[2] + Math.cos(th) * d];
        const bc = all ? colAt(th, 0.5, p) : c2;
        top.push(g.v(p, bc));
        bot.push(g.v([p[0], p[1] - 0.0045, p[2]], bc.clone().multiplyScalar(0.7)));
      }
    }
    for (let k = 0; k < NK; k++) for (let j = 0; j < NJ; j++) {
      const a = k * (NJ + 1) + j;
      g.quad(top[a], top[a + 1], top[a + NJ + 2], top[a + NJ + 1]);
      g.quad(bot[a], bot[a + NJ + 1], bot[a + NJ + 2], bot[a + 1]);
    }
    for (let k = 0; k < NK; k++) {
      const a = k * (NJ + 1) + NJ, b = a + NJ + 1;
      g.quad(top[a], bot[a], bot[b], top[b]);
    }
  }
  const out: THREE.Mesh[] = [new THREE.Mesh(g.build(), hatMat(st === 'durag', false))];
  if (st === 'pom') {
    // The bobble on top: a fluffy ball.
    const top = dome(0, 1);
    const ball = new THREE.IcosahedronGeometry(0.03, hi ? 3 : 2);
    const p = ball.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      v.multiplyScalar(1 + (fbm(v.x * 260, v.y * 260, v.z * 260, 2) - 0.5) * 0.35);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    ball.translate(top[0], top[1] + 0.024, top[2]);
    out.push(new THREE.Mesh(tint(ball, h.c2), hatMat(false, false)));
  }
  if (st === 'durag') {
    // Two tails hanging down the back of the neck.
    const nape = dome(Math.PI, 0);
    for (const s of [-1, 1]) {
      const path: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        path.push(new THREE.Vector3(nape[0] + s * (0.012 + t * 0.012), nape[1] - t * 0.16, nape[2] - 0.01 - Math.sin(t * 2) * 0.03));
      }
      const tail = ribbon(path, 0.022, 0.002);
      out.push(new THREE.Mesh(tint(tail, h.c1), hatMat(true, false)));
    }
  }
  return out;
}

function crown(h: HatSpec, R: Skull, capT: (x: number, y: number, z: number) => number, L: FaceLand, hi: boolean): THREE.Mesh {
  const NA = hi ? 96 : 48;
  const g = new Geo();
  const gold = new THREE.Color(h.c1), dark = gold.clone().multiplyScalar(0.6);
  const y0 = L.crown * 0.62;
  const ring: number[][] = [];
  for (let i = 0; i <= NA; i++) {
    const th = (i / NA) * Math.PI * 2;
    const p = surfAt(R, Math.sin(th), y0, Math.cos(th));
    const t = capT(p[0], p[1], p[2]) + 0.006;
    const l = Math.hypot(p[0], p[2]);
    ring.push([p[0] + (p[0] / l) * t, p[1], p[2] + (p[2] / l) * t]);
  }
  // A band with eight points, flaring out a little as it rises.
  const rows = 6;
  for (let j = 0; j <= rows; j++) {
    const f = j / rows;
    for (let i = 0; i <= NA; i++) {
      const th = (i / NA) * Math.PI * 2;
      const spike = Math.max(0, Math.cos(th * 8)) ** 3;
      const hgt = 0.028 + spike * 0.05;
      const p = ring[i];
      const l = Math.hypot(p[0], p[2]);
      const out = 1 + f * 0.1;
      g.v([(p[0] / l) * l * out, p[1] + hgt * f, (p[2] / l) * l * out], j === 0 || j === rows ? dark : gold);
    }
  }
  for (let j = 0; j < rows; j++) for (let i = 0; i < NA; i++) {
    const a = j * (NA + 1) + i;
    g.quad(a, a + 1, a + NA + 2, a + NA + 1);
  }
  const band = g.build();
  const parts: THREE.BufferGeometry[] = [band];
  // Jewels round the band and on each point.
  for (let k = 0; k < 8; k++) {
    const i = Math.round((k / 8) * NA);
    const p = ring[i];
    const l = Math.hypot(p[0], p[2]);
    const jewel = new THREE.IcosahedronGeometry(0.009, 1);
    jewel.translate(p[0] + (p[0] / l) * 0.004, p[1] + 0.014, p[2] + (p[2] / l) * 0.004);
    parts.push(tint(jewel, h.c2));
    const tip = new THREE.SphereGeometry(0.006, 8, 6);
    tip.translate(p[0] * 1.1, p[1] + 0.082, p[2] * 1.1);
    parts.push(tint(tip, '#ffffff'));
  }
  return new THREE.Mesh(merge(parts), hatMat(false, true));
}

/** A flat strip along a path: width `w`, thickness `t`. */
function ribbon(path: THREE.Vector3[], w: number, t: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const k = 1 - (i / (path.length - 1)) * 0.4;
    pos.push(p.x - (w / 2) * k, p.y, p.z, p.x + (w / 2) * k, p.y, p.z, p.x - (w / 2) * k, p.y, p.z - t, p.x + (w / 2) * k, p.y, p.z - t);
    if (i) {
      const a = (i - 1) * 4, b = i * 4;
      idx.push(a, a + 1, b + 1, a, b + 1, b, a + 2, b + 3, a + 3, a + 2, b + 2, b + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------- Glasses (bind space) ----------

function lensShape(style: string, w: number, h: number): THREE.Shape {
  const s = new THREE.Shape();
  if (style === 'round') {
    s.absellipse(0, 0, w, h, 0, Math.PI * 2, false, 0);
    return s;
  }
  if (style === 'aviator') {
    // A teardrop: flat-ish top, deep rounded bottom toward the nose.
    s.moveTo(-w, h * 0.55);
    s.bezierCurveTo(-w * 0.2, h * 0.75, w * 0.6, h * 0.75, w, h * 0.5);
    s.bezierCurveTo(w * 1.1, -h * 0.2, w * 0.7, -h * 1.05, w * 0.05, -h * 1.0);
    s.bezierCurveTo(-w * 0.7, -h * 0.95, -w * 1.05, -h * 0.2, -w, h * 0.55);
    return s;
  }
  const r = Math.min(w, h) * 0.32;
  s.moveTo(-w + r, h);
  s.lineTo(w - r, h);
  s.quadraticCurveTo(w, h, w, h - r);
  s.lineTo(w * 0.94, -h + r);
  s.quadraticCurveTo(w * 0.92, -h, w * 0.92 - r, -h);
  s.lineTo(-w * 0.9 + r, -h);
  s.quadraticCurveTo(-w * 0.9, -h, -w * 0.92, -h + r);
  s.lineTo(-w, h - r);
  s.quadraticCurveTo(-w, h, -w + r, h);
  return s;
}

function rimOf(shape: THREE.Shape, thick: number) {
  const pts = shape.getPoints(48);
  const outer = new THREE.Shape(pts.map((p) => p.clone().multiplyScalar(1 + thick)));
  outer.holes.push(new THREE.Path(pts.slice().reverse()));
  return outer;
}

export function buildGlasses(gs: GlassesSpec, body: BodyBuild): THREE.Mesh[] {
  const [e0, e1] = body.eyes;
  const half = Math.abs(e0.c.x - e1.c.x) / 2;
  const cx = (e0.c.x + e1.c.x) / 2;
  const y = (e0.c.y + e1.c.y) / 2 + 0.002;
  const fz = Math.max(e0.c.z, e1.c.z) + Math.max(e0.r, e1.r) + 0.016;
  const w = half * (gs.style === 'square' ? 0.8 : 0.84);
  const h = gs.style === 'square' ? w * 0.74 : gs.style === 'aviator' ? w * 0.82 : w * 0.86;
  const frames: THREE.BufferGeometry[] = [];
  const lenses: THREE.BufferGeometry[] = [];
  const C = body.headC;
  const L = body.land;
  const ear = (s: number) => new THREE.Vector3(C.x + s * (Math.abs(L.earX) + 0.006), C.y + L.earY + 0.014, C.z + L.earZ);
  const place = (g: THREE.BufferGeometry, s: number, x: number) => {
    g.rotateY(s * 0.14);
    g.translate(cx + x, y, fz - Math.abs(x) * 0.06);
    return g;
  };
  const thick = gs.style === 'square' ? 0.16 : gs.style === 'round' ? 0.1 : 0.12;
  if (gs.style === 'shield') {
    // One wraparound visor across both eyes, curved round the face.
    const W = half + w * 1.05;
    const geo = new THREE.PlaneGeometry(W * 2, h * 1.7, 24, 4);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), yy = p.getY(i);
      const bend = (x / W) ** 2;
      // Taper the outline toward the temples and notch it over the nose.
      const k = 1 - 0.35 * bend;
      const notch = yy < 0 ? smooth(0.03, 0, Math.abs(x)) * h * 0.6 : 0;
      p.setXYZ(i, x, yy * k + notch * Math.sign(-yy), -bend * 0.05);
    }
    geo.translate(cx, y + 0.004, fz);
    geo.computeVertexNormals();
    lenses.push(geo);
    const bar = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([-1, -0.5, 0, 0.5, 1].map((t) => new THREE.Vector3(cx + t * W, y + h * 0.85 * (1 - 0.3 * t * t), fz - t * t * 0.05 + 0.002))), 24, 0.0025, 6);
    frames.push(bar);
  } else {
    for (const s of [-1, 1]) {
      const shape = lensShape(gs.style, w, h);
      // Mirror the teardrop so its deep end sits by the nose on both sides.
      const lens = new THREE.ShapeGeometry(shape, 12);
      if (s < 0) lens.scale(-1, 1, 1);
      lenses.push(place(lens, s, s * half));
      const rim = new THREE.ExtrudeGeometry(rimOf(shape, thick), { depth: gs.style === 'square' ? 0.006 : 0.003, bevelEnabled: false, curveSegments: 16 });
      if (s < 0) rim.scale(-1, 1, 1);
      rim.translate(0, 0, -0.002);
      frames.push(place(rim, s, s * half));
    }
    // Bridge.
    frames.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(cx - half + w * 0.95, y + h * 0.3, fz), new THREE.Vector3(cx, y + h * 0.55, fz + 0.004), new THREE.Vector3(cx + half - w * 0.95, y + h * 0.3, fz)), 8, 0.0022, 6));
    if (gs.style === 'aviator') frames.push(new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(cx - half + w * 0.6, y + h * 0.62, fz), new THREE.Vector3(cx + half - w * 0.6, y + h * 0.62, fz)), 2, 0.0016, 6));
  }
  // Temples back to the ears.
  for (const s of [-1, 1]) {
    const from = new THREE.Vector3(cx + s * (half + w * 1.02), y + h * 0.45, fz - 0.012);
    const to = ear(s);
    const mid = from.clone().lerp(to, 0.5);
    mid.x += s * 0.008;
    frames.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, mid, to), 10, gs.style === 'square' ? 0.0035 : 0.0022, 6));
  }
  const frameMat = gs.metal ? (gs.c1.toLowerCase() === '#eaf6ff' ? gemMat(gs.c1) : metalMat(gs.c1, 0.15)) : cached(`acetate|${gs.c1}`, () => new THREE.MeshPhysicalMaterial({ color: gs.c1, roughness: 0.18, clearcoat: 1 }));
  const lensMat = cached(`lens|${gs.c2}|${gs.style}`, () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(gs.c2).multiplyScalar(gs.style === 'shield' ? 1 : 0.6), roughness: 0.03, metalness: gs.style === 'shield' ? 0.9 : 0.55, clearcoat: 1, transparent: true, opacity: 0.96, side: THREE.DoubleSide, envMapIntensity: 1.4 }));
  return [new THREE.Mesh(merge(frames), frameMat), new THREE.Mesh(merge(lenses), lensMat)];
}

// ---------- Chains (bind space, on the chest) ----------

/** Where a chain lies: round the back of the neck and down onto the chest, over the clothes. */
function chainPath(b: BodyBuild, drop: number, n: number, lift = 0.004): THREE.Vector3[] {
  const N = b.neck;
  const pts: THREE.Vector3[] = [];
  const yBack = N.y - 0.035;
  for (let i = 0; i < n; i++) {
    const ph = -Math.PI + (i / n) * Math.PI * 2;
    const c = Math.cos(ph);
    const fr = Math.max(0, c);
    const y = yBack + (drop - yBack) * fr ** 1.6;
    const wide = N.r * (1.28 + 0.25 * fr) * (1 - 0.35 * fr ** 4);
    const x = Math.sin(ph) * wide;
    let z = N.z + c * N.r * 1.18;
    if (c > -0.2) z = Math.max(z, chestZ(b, x, y) + lift);
    pts.push(new THREE.Vector3(x, y, z));
  }
  return pts;
}

function linkChain(path: THREE.Vector3[], r: number, tube: number, flat: number, hi: boolean, gemmed = false) {
  const curve = new THREE.CatmullRomCurve3(path, true);
  const len = curve.getLength();
  const n = Math.floor(len / (r * 1.55));
  const base = new THREE.TorusGeometry(r, tube, hi ? 6 : 4, hi ? 12 : 8);
  base.scale(1.25, 1, flat);
  const parts: THREE.BufferGeometry[] = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const t = new THREE.Vector3(), up = new THREE.Vector3(), side = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const p = curve.getPointAt(u);
    curve.getTangentAt(u, t);
    // Out of the chest: from the neck's axis to the link.
    up.set(p.x, 0, p.z - 0).normalize();
    side.crossVectors(t, up).normalize();
    up.crossVectors(side, t).normalize();
    // Alternate links lie flat and on edge; Cuban links all lie flat, twisted a little.
    const basis = new THREE.Matrix4().makeBasis(t, i % 2 && flat > 0.6 ? side : up, i % 2 && flat > 0.6 ? up : side);
    q.setFromRotationMatrix(basis);
    if (flat <= 0.6) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.5));
    m.compose(p, q, new THREE.Vector3(1, 1, 1));
    parts.push(base.clone().applyMatrix4(m));
    if (gemmed && i % 1 === 0) {
      const g = new THREE.IcosahedronGeometry(tube * 0.9, 0);
      g.translate(p.x + up.x * tube, p.y + up.y * tube, p.z + up.z * tube);
      parts.push(g);
    }
  }
  return merge(parts);
}

function ropeChain(path: THREE.Vector3[], r: number, hi: boolean) {
  const curve = new THREE.CatmullRomCurve3(path, true);
  const len = curve.getLength();
  const strands: THREE.BufferGeometry[] = [];
  const N = Math.floor(len / 0.004);
  const t = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
  for (let s = 0; s < 2; s++) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const p = curve.getPointAt(u);
      curve.getTangentAt(u, t);
      a.set(p.x, 0, p.z).normalize().cross(t).normalize();
      b.crossVectors(t, a);
      const ang = u * len * 900 + s * Math.PI;
      pts.push(p.clone().addScaledVector(a, Math.cos(ang) * r * 0.5).addScaledVector(b, Math.sin(ang) * r * 0.5));
    }
    strands.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), N * 2, r * 0.62, hi ? 6 : 4, true));
  }
  return merge(strands);
}

function beadChain(path: THREE.Vector3[], r: number, colors: string[], gap = 1) {
  const curve = new THREE.CatmullRomCurve3(path, true);
  const n = Math.floor(curve.getLength() / (r * 2 * gap));
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const p = curve.getPointAt(i / n);
    const g = new THREE.IcosahedronGeometry(r, 1);
    g.translate(p.x, p.y, p.z);
    parts.push(tint(g, colors[i % colors.length]));
  }
  return merge(parts);
}

/** A football: gold with dark patches. */
function footballGeo(r: number, c1: string, c2: string) {
  const g = new THREE.IcosahedronGeometry(r, 2).toNonIndexed();
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const dirs: THREE.Vector3[] = [];
  const ip = ico.attributes.position;
  for (let i = 0; i < ip.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(ip, i).normalize();
    if (!dirs.some((d) => d.distanceTo(v) < 1e-3)) dirs.push(v);
  }
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const a = new THREE.Color(c1), b = new THREE.Color(c2);
  const cen = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    cen.set(0, 0, 0);
    for (let k = 0; k < 3; k++) cen.add(new THREE.Vector3().fromBufferAttribute(p, i + k));
    cen.normalize();
    const dark = dirs.some((d) => d.dot(cen) > 0.93);
    for (let k = 0; k < 3; k++) col.set(dark ? [b.r, b.g, b.b] : [a.r, a.g, a.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function starGeo(r: number, depth: number) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.4, bevelSize: r * 0.08, bevelSegments: 2 });
}

/** Neckwear in bind space: chains, pendants, beads, a snood or the champion's medal. */
export function buildNeckwear(style: string, c1: string, c2: string | undefined, b: BodyBuild, hi: boolean): THREE.Object3D {
  const g = new THREE.Group();
  const N = b.neck;
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    g.add(m);
  };
  const pend = (path: THREE.Vector3[], size: number) => {
    const bottom = path[Math.floor(path.length / 2)];
    const y = bottom.y - size * 1.1;
    return new THREE.Vector3(bottom.x, y, chestZ(b, 0, y) + size * 0.5 + 0.004);
  };
  switch (style) {
    case 'snood': {
      add(new THREE.CylinderGeometry(N.r * 1.12, N.r * 1.3, 0.12, 24, 1, true).translate(0, N.y + 0.04, N.z), fabricMat(c1));
      break;
    }
    case 'medal': {
      const path = chainPath(b, 1.62, 90, 0.004);
      add(beadChain(path, 0.006, [c2 ?? '#c6ff3d'], 0.9), colorMat(0.8));
      const at = pend(path, 0.05);
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.012, 32).rotateX(Math.PI / 2).translate(at.x, at.y, at.z), metalMat(c1));
      add(starGeo(0.026, 0.004).translate(at.x, at.y, at.z + 0.006), metalMat(c1, 0.35));
      break;
    }
    case 'beads': {
      const path = chainPath(b, 1.66, 100, 0.006);
      add(beadChain(path, 0.0075, [c1, c1, c1, c2 ?? '#efe6d2']), colorMat(0.45));
      break;
    }
    case 'dogtag': {
      const path = chainPath(b, 1.6, 120, 0.003);
      add(beadChain(path, 0.0028, [c1], 1.1), metalMat(c1, 0.3));
      const at = pend(path, 0.03);
      const tag = new THREE.ExtrudeGeometry(new THREE.Shape().moveTo(-0.017, 0.028).lineTo(0.017, 0.028).quadraticCurveTo(0.022, 0.028, 0.022, 0.022).lineTo(0.022, -0.022).quadraticCurveTo(0.022, -0.028, 0.017, -0.028).lineTo(-0.017, -0.028).quadraticCurveTo(-0.022, -0.028, -0.022, -0.022).lineTo(-0.022, 0.022).quadraticCurveTo(-0.022, 0.028, -0.017, 0.028), { depth: 0.002, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 1 });
      add(tag.translate(at.x, at.y, at.z), metalMat(c1, 0.32));
      break;
    }
    case 'tennis': {
      const path = chainPath(b, 1.63, 140, 0.004);
      add(ropeChain(path, 0.0028, hi), metalMat('#e8edf2', 0.15));
      add(beadChain(path, 0.0042, ['#ffffff'], 1.05), gemMat(c1));
      break;
    }
    case 'cuban': case 'icecuban': case 'star': {
      const drop = style === 'star' ? 1.6 : 1.655;
      const path = chainPath(b, drop, 120, 0.006);
      const ice = style === 'icecuban';
      add(linkChain(path, 0.0085, 0.0034, 0.45, hi, false), ice ? metalMat('#e8edf2', 0.12) : metalMat(c1));
      if (ice) {
        const curve = new THREE.CatmullRomCurve3(path, true);
        const n = Math.floor(curve.getLength() / 0.006);
        const gems: THREE.BufferGeometry[] = [];
        for (let i = 0; i < n; i++) {
          const p = curve.getPointAt(i / n);
          const gm = new THREE.IcosahedronGeometry(0.0034, 0);
          gm.translate(p.x, p.y + 0.002, p.z + 0.0035);
          gems.push(gm);
        }
        add(merge(gems), gemMat(c1));
      }
      if (style === 'star') {
        const at = pend(path, 0.04);
        add(starGeo(0.04, 0.006).translate(at.x, at.y, at.z - 0.004), metalMat(c1));
        const gems: THREE.BufferGeometry[] = [];
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * Math.PI * 2;
          const rr = 0.012 + (i % 3) * 0.006;
          const gm = new THREE.IcosahedronGeometry(0.0032, 0);
          gm.translate(at.x + Math.cos(a) * rr, at.y + Math.sin(a) * rr, at.z + 0.006);
          gems.push(gm);
        }
        add(merge(gems), gemMat(c2 ?? '#eef6ff'));
      }
      break;
    }
    case 'ball': {
      const path = chainPath(b, 1.6, 120, 0.004);
      add(ropeChain(path, 0.0034, hi), metalMat(c1));
      const at = pend(path, 0.022);
      add(footballGeo(0.02, c1, c2 ?? '#16181b').translate(at.x, at.y, at.z), cached(`ball|${c1}`, () => new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 0.9, roughness: 0.2, clearcoat: 0.6 })));
      break;
    }
    default: {
      // A rope chain.
      const path = chainPath(b, 1.645, 120, 0.004);
      add(ropeChain(path, 0.0036, hi), metalMat(c1));
    }
  }
  return g;
}

// ---------- Wrists (bind space) ----------

/**
 * A watch or bracelet round a wrist. `side` 0 is the left wrist, 1 the right;
 * `extra` widens it over a long sleeve.
 */
export function buildWristwear(style: string, c1: string, c2: string | undefined, b: BodyBuild, side: 0 | 1, extra: number, hi: boolean): THREE.Object3D {
  const w = b.wrists[side];
  const g = new THREE.Group();
  const dir = w.dir.clone();
  // The back of the wrist faces out from the body (palms face the thighs).
  const out = new THREE.Vector3(side === 0 ? 1 : -1, 0, 0);
  out.addScaledVector(dir, -out.dot(dir)).normalize();
  const third = new THREE.Vector3().crossVectors(dir, out);
  const at = w.c.clone().addScaledVector(dir, 0.018);
  const r = w.r + 0.003 + extra;
  const frame = new THREE.Matrix4().makeBasis(out, dir, third).setPosition(at);
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    const m = new THREE.Mesh(geo.applyMatrix4(frame), mat);
    m.castShadow = true;
    g.add(m);
  };
  const seg = hi ? 32 : 18;
  // Local frame: y runs along the forearm, x out of the back of the wrist.
  const ring = (rr: number, h: number) => new THREE.CylinderGeometry(rr, rr, h, seg, 1, true);
  const watch = (bandMat: THREE.Material, caseMat: THREE.Material, dial: string, linked: boolean) => {
    if (linked) {
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        const box = new THREE.BoxGeometry(0.004, 0.018, (2 * Math.PI * r) / 22 - 0.0006);
        box.translate(r, 0, 0).rotateY(a);
        parts.push(box);
      }
      add(merge(parts), bandMat);
    } else add(ring(r, 0.018), bandMat);
    const cs = new THREE.CylinderGeometry(0.016, 0.017, 0.008, seg).rotateZ(Math.PI / 2).translate(r + 0.004, 0, 0);
    add(cs, caseMat);
    const face = new THREE.CircleGeometry(0.0128, seg).rotateY(Math.PI / 2).translate(r + 0.0082, 0, 0);
    add(face, cached(`dial|${dial}`, () => new THREE.MeshPhysicalMaterial({ color: dial, roughness: 0.25, clearcoat: 1, metalness: 0.3 })));
    // Hands and hour marks.
    const marks: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      marks.push(new THREE.BoxGeometry(0.0006, 0.0006, i % 3 ? 0.0016 : 0.0028).translate(r + 0.0086, Math.cos(a) * 0.0105, Math.sin(a) * 0.0105));
    }
    marks.push(new THREE.BoxGeometry(0.0006, 0.0075, 0.0009).translate(r + 0.0088, 0.0034, 0).rotateX(0.0));
    marks.push(new THREE.BoxGeometry(0.0006, 0.0009, 0.0095).translate(r + 0.0088, 0, 0.004));
    add(merge(marks), metalMat('#f4f4f0', 0.2));
  };
  switch (style) {
    case 'watch':
      watch(cached(`rubber|${c1}`, () => new THREE.MeshPhysicalMaterial({ color: c1, roughness: 0.6, clearcoat: 0.3 })), metalMat('#2a2d31', 0.35), c2 ?? '#c6ff3d', false);
      break;
    case 'goldwatch':
      watch(metalMat(c1, 0.2), metalMat(c1, 0.15), c2 ?? '#1f5a3a', true);
      break;
    case 'icewatch': {
      watch(gemMat(c1), gemMat(c1), c2 ?? '#bfe8ff', true);
      break;
    }
    case 'cuban':
      add(linkChain(Array.from({ length: 24 }, (_, i) => new THREE.Vector3(Math.cos((i / 24) * Math.PI * 2) * r, 0, Math.sin((i / 24) * Math.PI * 2) * r)), 0.0058, 0.0024, 0.45, hi), metalMat(c1));
      break;
    case 'tennis': {
      const pts = Array.from({ length: 24 }, (_, i) => new THREE.Vector3(Math.cos((i / 24) * Math.PI * 2) * r, 0, Math.sin((i / 24) * Math.PI * 2) * r));
      add(beadChain(pts, 0.0032, ['#ffffff'], 1.05), gemMat(c1));
      add(new THREE.TorusGeometry(r - 0.001, 0.0012, 4, seg).rotateX(Math.PI / 2), metalMat('#e8edf2'));
      break;
    }
    case 'beads': {
      const pts = Array.from({ length: 24 }, (_, i) => new THREE.Vector3(Math.cos((i / 24) * Math.PI * 2) * (r + 0.002), 0, Math.sin((i / 24) * Math.PI * 2) * (r + 0.002)));
      add(beadChain(pts, 0.0045, [c1, c1, c1, c1, c1, c2 ?? c1]), colorMat(0.3));
      break;
    }
    case 'string': {
      const parts: THREE.BufferGeometry[] = [];
      [c1, c2 ?? c1, '#f4f4f0'].forEach((c, i) => parts.push(tint(new THREE.TorusGeometry(r + 0.0005, 0.0016, 5, seg).rotateX(Math.PI / 2).translate(0, (i - 1) * 0.0045, 0), c)));
      add(merge(parts), colorMat(0.9));
      break;
    }
    default: {
      // A wide cuff with a gap on the inside of the wrist.
      add(new THREE.CylinderGeometry(r + 0.001, r + 0.001, 0.02, seg, 1, true, Math.PI * 0.15, Math.PI * 1.7).rotateY(-Math.PI * 0.35 + Math.PI), metalMat(c1, 0.3));
    }
  }
  return g;
}

// ---------- Hood ----------

/** A hoodie's hood, lying folded on the upper back round the neck. */
export function buildHood(c: string, b: BodyBuild, hi: boolean): THREE.Object3D {
  const N = b.neck;
  const n = hi ? 40 : 20;
  const ring = hi ? 14 : 8;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const th = (t - 0.5) * 3.4;
    const back = Math.cos(th);
    const bk = Math.max(0, back);
    const cx = Math.sin(th) * N.r * (1.35 + 0.35 * bk);
    // Down the back at the middle, up to the collar at the sides.
    const cy = N.y - 0.04 - bk ** 2 * 0.075;
    const rad = 0.011 + 0.026 * bk ** 1.5;
    const surf = back > 0.2 ? chestZ(b, cx, cy, true) : N.z - back * N.r * 1.25;
    const cz = Math.min(N.z - back * N.r * 1.25, surf) - rad * 0.55;
    for (let j = 0; j <= ring; j++) {
      const a = (j / ring) * Math.PI * 2;
      const nx = Math.sin(th), nz = -back;
      const lx = Math.cos(a) * rad, ly = Math.sin(a) * rad * 0.6;
      pos.push(cx + nx * lx * 0.4, cy + ly + lx * 0.6 * bk, cz + nz * lx * 0.4 - Math.abs(lx) * 0.2 * bk);
    }
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < ring; j++) {
    const a = i * (ring + 1) + j, bb = a + ring + 1;
    idx.push(a, bb, a + 1, a + 1, bb, bb + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, fabricMat(c));
  m.castShadow = true;
  return m;
}

// ---------- Shoes (skinned to the feet) ----------

const shoeCache = new Map<string, THREE.BufferGeometry>();

/**
 * A pair of modelled shoes fitted round the feet: a lofted upper (heel cup,
 * toe box, collar) on a sole that stands proud of it, coloured by the shoe
 * painter. Skinned to the Foot and ToeBase bones so the toe bends when he runs.
 */
export function buildShoes(p: Piece, sock: [number, number, number], body: BodyBuild, cut: Cut, key: string, hi: boolean): THREE.BufferGeometry {
  const ck = `${key}|${hi}`;
  const hit = shoeCache.get(ck);
  if (hit) return hit;
  const NU = hi ? 44 : 26, NA = hi ? 30 : 16;
  const pos: number[] = [], col: number[] = [], si: number[] = [], sw: number[] = [], idx: number[] = [];
  const style = p.style;
  const soleTop = cut.sole;
  const top = cut.shoe;
  const slide = style === 'slide';
  const bulk = SHOE_PUFF[style] ?? SHOE_PUFF.court;
  const c = new THREE.Color();
  const lin = (rgb: [number, number, number]) => c.setRGB(rgb[0], rgb[1], rgb[2], THREE.LinearSRGBColorSpace);
  for (const [fi, sd] of (['Left', 'Right'] as const).entries()) {
    const f = body.feet[fi];
    const foot = BIND_JOINTS[`${sd}Foot`], toe = BIND_JOINTS[`${sd}ToeBase`];
    const sx = Math.sign(foot.x) || 1;
    const bFoot = B[`${sd}Foot`], bToe = B[`${sd}ToeBase`], bLeg = B[`${sd}Leg`];
    const NZ = f.x0.length;
    const slice = (z: number) => {
      const t = Math.max(0, Math.min(NZ - 1.001, ((z - f.z0) / (f.z1 - f.z0)) * NZ - 0.5));
      const k = Math.floor(t), w = t - k, k2 = Math.min(NZ - 1, k + 1);
      return { x0: f.x0[k] * (1 - w) + f.x0[k2] * w, x1: f.x1[k] * (1 - w) + f.x1[k2] * w, y1: f.y1[k] * (1 - w) + f.y1[k2] * w };
    };
    const zA = f.z0 - 0.014, zB = f.z1 + 0.016;
    let cxm = 0;
    for (let k = 0; k < NZ; k++) cxm += (f.x0[k] + f.x1[k]) / 2 / NZ;
    const bottom = Math.min(f.bottom, 0) - 0.002;
    const vert = (x: number, y: number, z: number, u: number, out: number, sole: boolean) => {
      // Painter space: across the foot (outward +), height off the ground, heel to toe.
      const t = sole ? null : shoeColor(p, (x - cxm) * sx, y - bottom, u, out, cut, sock);
      if (t) lin(t.c);
      else lin(p.c3);
      if (sole && style === 'chunky' && y - bottom > (soleTop - bottom) * 0.45 && y - bottom < (soleTop - bottom) * 0.7) lin(p.c2);
      if (sole && p.print === 'lava') lin([Math.min(1, p.c2[0] * 1.5), p.c2[1] * 1.2, p.c2[2]]);
      pos.push(x, y, z);
      col.push(c.r, c.g, c.b);
      const wt = smooth(toe.z - 0.02, toe.z + 0.02, z);
      const wl = sole ? 0 : smooth(foot.y + 0.02, foot.y + 0.09, y);
      si.push(bFoot, bToe, bLeg, 0);
      sw.push((1 - wt) * (1 - wl), wt * (1 - wl), wl, 0);
      return pos.length / 3 - 1;
    };
    // ---- Upper: superellipse sections from the heel to the toe ----
    const uA = slide ? 0.46 : 0, uB = slide ? 0.72 : 1;
    const base = pos.length / 3;
    for (let i = 0; i <= NU; i++) {
      const u = uA + ((uB - uA) * i) / NU;
      const z = zA + u * (zB - zA);
      const sl = slice(z);
      const e = Math.pow(Math.max(0, 1 - Math.abs(2 * u - 1) ** 5), 0.35);
      const hw = ((sl.x1 - sl.x0) / 2 + 0.011 + bulk.puffShoe * 0.4) * (0.35 + 0.65 * e);
      const cx = (sl.x0 + sl.x1) / 2;
      // Toward the heel the collar stops at the shoe's top; the toe box rounds over the toes.
      let ht = sl.y1 + 0.016 + bulk.puffShoe * 0.6;
      if (u < 0.55) ht = Math.min(ht, top);
      if (slide) ht = sl.y1 + 0.008;
      const h = Math.max(0.01, (ht - (soleTop - 0.006)) * (0.25 + 0.75 * e));
      for (let j = 0; j <= NA; j++) {
        const a = (j / NA) * Math.PI;
        const ca = Math.cos(a), sa = Math.sin(a);
        const x = cx + hw * Math.sign(ca) * Math.abs(ca) ** 0.6;
        const y = soleTop - 0.006 + h * sa ** 0.7;
        vert(x, y, z, u, ca * sx, false);
      }
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NA; j++) {
      const a = base + i * (NA + 1) + j, b = a + NA + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    if (!slide) {
      // Close the heel and toe ends.
      for (const end of [0, NU]) {
        const ring = base + end * (NA + 1);
        const cen = vert((pos[ring * 3] + pos[(ring + NA) * 3]) / 2, soleTop - 0.006, pos[ring * 3 + 2], end ? 1 : 0, 0, false);
        for (let j = 0; j < NA; j++) end ? idx.push(cen, ring + j, ring + j + 1) : idx.push(cen, ring + j + 1, ring + j);
      }
    }
    // ---- Sole: a rounded slab a little wider than the upper ----
    const NS = 12;
    const sBase = pos.length / 3;
    for (let i = 0; i <= NU; i++) {
      const u = i / NU;
      const z = zA - 0.004 + u * (zB - zA + 0.008);
      const sl = slice(z);
      const e = Math.pow(Math.max(0, 1 - Math.abs(2 * u - 1) ** 6), 0.3);
      const hw = ((sl.x1 - sl.x0) / 2 + 0.011 + bulk.puffShoe * 0.4 + bulk.puffSole) * (0.3 + 0.7 * e);
      const cx = (sl.x0 + sl.x1) / 2;
      // A loop round the slab's cross-section: top, outer side, bottom, inner side.
      for (let j = 0; j <= NS; j++) {
        const a = (j / NS) * Math.PI * 2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const x = cx + hw * Math.sign(ca) * Math.abs(ca) ** 0.25;
        const y = bottom + (soleTop - bottom) * (0.5 + 0.5 * Math.sign(sa) * Math.abs(sa) ** 0.25);
        vert(x, y, z, u, ca * sx, true);
      }
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NS; j++) {
      const a = sBase + i * (NS + 1) + j, b = a + NS + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
    for (const end of [0, NU]) {
      const ring = sBase + end * (NS + 1);
      let mx = 0, my = 0;
      for (let j = 0; j < NS; j++) { mx += pos[(ring + j) * 3] / NS; my += pos[(ring + j) * 3 + 1] / NS; }
      const cen = vert(mx, my, pos[ring * 3 + 2] + (end ? 0.004 : -0.004), end ? 1 : 0, 0, true);
      for (let j = 0; j < NS; j++) end ? idx.push(cen, ring + j + 1, ring + j) : idx.push(cen, ring + j, ring + j + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  shoeCache.set(ck, g);
  if (shoeCache.size > 30) {
    const [k0, g0] = shoeCache.entries().next().value as [string, THREE.BufferGeometry];
    shoeCache.delete(k0);
    g0.dispose();
  }
  return g;
}

export function shoeMaterial(style: string, metal: boolean) {
  const suede = style === 'chelsea' || style === 'loafer';
  const leather = style === 'court' || style === 'high';
  return cached(`shoe|${style}|${metal}`, () => new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    roughness: metal ? 0.22 : suede ? 0.92 : leather ? 0.42 : 0.62,
    metalness: metal ? 0.85 : 0,
    clearcoat: metal || leather ? 0.7 : 0.2,
    clearcoatRoughness: 0.2,
    sheen: suede ? 0.8 : 0.3,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(0xffffff),
  }));
}
