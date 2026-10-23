// The player's body: the MakeHuman base mesh (CC0) shaped by the look's
// targets, fitted onto our skeleton's bind pose, and dressed: kit regions get
// a little cloth thickness. Returns skinned geometry with a body group (kit
// texture, MakeHuman UVs) and a head group (face texture, our own face-dense
// projection), plus the eyes, lashes and the landmarks the painters need.
import * as THREE from 'three';
import type { Appearance } from '../../../shared/appearance.ts';
import { B, BONES, NB, makeBones, setBindPose, type BoneName } from '../rig/skeleton.ts';
import { morphWeights } from './look.ts';
import { rasterMax } from './raster.ts';
import { dirToUV } from './uv.ts';

interface Target { s: number; idx: Uint16Array; d: Int16Array }
interface Bundle {
  nv: number;
  pos: Float32Array;
  rv: Uint16Array;
  ruv: Float32Array;
  tri: Uint16Array;
  lash: Uint16Array;
  eyes: { l: number[]; r: number[] };
  skinI: Uint8Array;
  skinW: Uint8Array;
  land: Record<string, number[]>;
  masks: Record<'lipU' | 'lipL' | 'brow' | 'ear' | 'lid', Uint8Array>;
  targets: Record<string, Target>;
  /** Shape-vertex adjacency (CSR), for normals, smoothing and cavities. */
  adjStart: Uint32Array;
  adj: Uint16Array;
}

let bundle: Bundle | null = null;
/** The base mesh's head frame: MakeHuman units → canonical head space (crown at 0.155 above the eyes). */
let baseFrame: { c: THREE.Vector3; k: number; land: FaceLand } | null = null;
/** Face landmarks of the base mesh in canonical head space. */
export const baseLand = () => baseFrame!.land;

function frameOf(b: Bundle) {
  const eyes = (['l', 'r'] as const).map((s) => {
    const c = new THREE.Vector3();
    for (const i of b.eyes[s]) c.x += b.pos[i * 3], c.y += b.pos[i * 3 + 1], c.z += b.pos[i * 3 + 2];
    c.divideScalar(b.eyes[s].length);
    let r = 0;
    for (const i of b.eyes[s]) r = Math.max(r, Math.hypot(b.pos[i * 3] - c.x, b.pos[i * 3 + 1] - c.y, b.pos[i * 3 + 2] - c.z));
    return { c, r };
  });
  // Head centre: eye height, midway front to back over the skull above the eyes.
  let zMin = 1e9, zMax = -1e9;
  for (let i = 0; i < b.nv; i++) {
    if (b.pos[i * 3 + 1] > eyes[0].c.y && Math.abs(b.pos[i * 3]) < 0.3) {
      zMin = Math.min(zMin, b.pos[i * 3 + 2]);
      zMax = Math.max(zMax, b.pos[i * 3 + 2]);
    }
  }
  const c = new THREE.Vector3(0, eyes[0].c.y, (zMin + zMax) / 2);
  const raw = faceLandmarks(b, b.pos, c, eyes);
  const k = 0.155 / raw.crown;
  const Q = new Float32Array(b.pos.length);
  for (let i = 0; i < Q.length; i += 3) {
    Q[i] = (b.pos[i] - c.x) * k;
    Q[i + 1] = (b.pos[i + 1] - c.y) * k;
    Q[i + 2] = (b.pos[i + 2] - c.z) * k;
  }
  const eyesK = eyes.map((e) => ({ c: e.c.clone().sub(c).multiplyScalar(k), r: e.r * k }));
  return { c, k, land: faceLandmarks(b, Q, new THREE.Vector3(), eyesK) };
}
let loading: Promise<void> | null = null;
const waiters: (() => void)[] = [];

const dec = <T extends ArrayBufferView>(s: string, C: new (b: ArrayBuffer) => T): T => {
  const bin = atob(s);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new C(u8.buffer);
};

/** Loads the character bundle once. Figures made before it arrives fill in when it does. */
export function loadCharacters(): Promise<void> {
  if (!loading) {
    const url = `${import.meta.env.BASE_URL}character/body.json`;
    loading = fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`character ${r.status}`))))
      .then((j) => {
        const tri = dec(j.render.tri, Uint16Array);
        const rv = dec(j.render.v, Uint16Array);
        const b: Bundle = {
          nv: j.nv,
          pos: dec(j.pos, Float32Array),
          rv,
          ruv: dec(j.render.uv, Float32Array),
          tri,
          lash: dec(j.lash, Uint16Array),
          eyes: j.eyes,
          skinI: dec(j.skinI, Uint8Array),
          skinW: dec(j.skinW, Uint8Array),
          land: j.land,
          masks: Object.fromEntries(Object.entries(j.masks as Record<string, string>).map(([k, v]) => [k, dec(v, Uint8Array)])) as Bundle['masks'],
          targets: Object.fromEntries(Object.entries(j.targets as Record<string, { s: number; idx: string; d: string }>).map(([k, t]) => [k, { s: t.s, idx: dec(t.idx, Uint16Array), d: dec(t.d, Int16Array) }])),
          adjStart: new Uint32Array(0),
          adj: new Uint16Array(0),
        };
        buildAdjacency(b);
        bundle = b;
        baseFrame = frameOf(b);
        for (const w of waiters.splice(0)) w();
      });
    loading.catch((e) => console.warn('[character] bundle unavailable', e));
  }
  return loading;
}
export const characterReady = () => bundle !== null;
/** Calls `fn` once the bundle is in (right away if it already is). */
export function whenCharacterReady(fn: () => void) {
  if (bundle) fn();
  else {
    waiters.push(fn);
    void loadCharacters();
  }
}

function buildAdjacency(b: Bundle) {
  const sets: Set<number>[] = Array.from({ length: b.nv }, () => new Set());
  const t = b.tri;
  for (let i = 0; i < t.length; i += 3) {
    const a = b.rv[t[i]], c = b.rv[t[i + 1]], d = b.rv[t[i + 2]];
    sets[a].add(c).add(d);
    sets[c].add(a).add(d);
    sets[d].add(a).add(c);
  }
  b.adjStart = new Uint32Array(b.nv + 1);
  let n = 0;
  sets.forEach((s, i) => {
    b.adjStart[i] = n;
    n += s.size;
  });
  b.adjStart[b.nv] = n;
  b.adj = new Uint16Array(n);
  sets.forEach((s, i) => b.adj.set([...s], b.adjStart[i]));
}

// ---------- Fitting MakeHuman onto our skeleton ----------

/** Our joints in the bind pose (arms lowered), body units. */
const BIND = (() => {
  const bones = makeBones();
  setBindPose(bones);
  bones[0].updateMatrixWorld(true);
  const out: Record<string, THREE.Vector3> = {};
  BONES.forEach((n, i) => (out[n] = new THREE.Vector3().setFromMatrixPosition(bones[i].matrixWorld)));
  for (const s of ['Left', 'Right']) {
    const hand = out[`${s}Hand`];
    const fore = out[`${s}ForeArm`];
    out[`${s}HandTip`] = hand.clone().add(hand.clone().sub(fore).normalize().multiplyScalar(0.2));
    out[`${s}ToeTip`] = out[`${s}ToeBase`].clone().add(new THREE.Vector3(0, -0.012, 0.075));
  }
  out.HeadTop = out.Head.clone().add(new THREE.Vector3(0, 0.2, 0));
  return out;
})();
export { BIND as BIND_JOINTS };

const CHILD: Record<string, string> = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head', Head: 'HeadTop' };
for (const s of ['Left', 'Right']) {
  Object.assign(CHILD, { [`${s}Shoulder`]: `${s}Arm`, [`${s}Arm`]: `${s}ForeArm`, [`${s}ForeArm`]: `${s}Hand`, [`${s}Hand`]: `${s}HandTip`, [`${s}UpLeg`]: `${s}Leg`, [`${s}Leg`]: `${s}Foot`, [`${s}Foot`]: `${s}ToeBase`, [`${s}ToeBase`]: `${s}ToeTip` });
}

/** Head scale over the fitted body: a touch larger reads better at game distances. */
const HEAD_K = 1.1;

/** Palm-down in the T-pose (Mixamo's rest, which the mocap is measured from), carried into the bind pose. */
const PALM = (['Left', 'Right'] as const).map((s) => {
  const bones = makeBones();
  setBindPose(bones);
  bones[0].updateMatrixWorld(true);
  const q = bones[B[`${s}Hand`]].getWorldQuaternion(new THREE.Quaternion());
  return new THREE.Vector3(0, -1, 0).applyQuaternion(q);
});

/**
 * The MakeHuman hand's own frame: where the back of the hand points from the
 * wrist (to the knuckles, not the curled fingertips) and the palm's normal,
 * from the flat of the hand between the wrist and the knuckles.
 */
function handFrame(P: Float32Array, bd: Bundle, bone: number, wrist: THREE.Vector3, tip: THREE.Vector3) {
  const len = wrist.distanceTo(tip);
  const c = new THREE.Vector3();
  const pts: number[] = [];
  for (let i = 0; i < bd.nv; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (bd.skinI[i * 4 + k] === bone) w += bd.skinW[i * 4 + k];
    if (w < 200) continue;
    const d = Math.hypot(P[i * 3] - wrist.x, P[i * 3 + 1] - wrist.y, P[i * 3 + 2] - wrist.z) / len;
    if (d < 0.25 || d > 0.55) continue;
    pts.push(i);
    c.x += P[i * 3], c.y += P[i * 3 + 1], c.z += P[i * 3 + 2];
  }
  c.divideScalar(pts.length);
  const C = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const i of pts) {
    const d = [P[i * 3] - c.x, P[i * 3 + 1] - c.y, P[i * 3 + 2] - c.z];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) C[a * 3 + b] += d[a] * d[b];
  }
  // The palm is flat: its normal is the axis it varies least along (inverse power iteration).
  const M = new THREE.Matrix3().fromArray(C);
  const tr = (C[0] + C[4] + C[8]) * 1e-6;
  M.elements[0] += tr, M.elements[4] += tr, M.elements[8] += tr;
  M.invert();
  const n = new THREE.Vector3(1, 1, 1).normalize();
  for (let it = 0; it < 40; it++) n.applyMatrix3(M).normalize();
  const dir = c.sub(wrist);
  dir.addScaledVector(n, -dir.dot(n)).normalize();
  return { dir, n };
}

function fitMatrices(P: Float32Array, bd: Bundle) {
  const land = bd.land;
  const L = (k: string) => {
    const v = new THREE.Vector3();
    for (const i of land[k]) v.x += P[i * 3], v.y += P[i * 3 + 1], v.z += P[i * 3 + 2];
    return v.divideScalar(land[k].length);
  };
  const mh: Record<string, THREE.Vector3> = {};
  for (const k of Object.keys(land)) mh[k] = L(k);
  // Spread MakeHuman's spine to our proportions between the hips and the neck.
  for (const k of ['Spine', 'Spine1', 'Spine2']) {
    const t = (BIND[k].y - BIND.Hips.y) / (BIND.Neck.y - BIND.Hips.y);
    mh[k] = mh.Hips.clone().lerp(mh.Neck, t);
  }
  const s0 = BIND.Hips.distanceTo(BIND.Head) / mh.Hips.distanceTo(mh.Head);
  // Each bone turns MakeHuman's segment onto ours.
  const turn = BONES.map((n) => {
    if (n === 'Head') return new THREE.Quaternion();
    const c = CHILD[n];
    return new THREE.Quaternion().setFromUnitVectors(mh[c].clone().sub(mh[n]).normalize(), BIND[c].clone().sub(BIND[n]).normalize());
  });
  // MakeHuman rests with the elbows bent and the hands cocked forward. The forearm is
  // straightened above; the hand has to follow it, in line, with the palm where the T-pose
  // has it. Kept as MakeHuman had it, the hands were cocked forward against the mocap and
  // the palms faced forward in every pose.
  (['Left', 'Right'] as const).forEach((s, si) => {
    const hb = B[`${s}Hand`];
    const fb = B[`${s}ForeArm`];
    const axis = BIND[`${s}HandTip`].clone().sub(BIND[`${s}Hand`]).normalize();
    const hf = handFrame(P, bd, hb, mh[`${s}Hand`], mh[`${s}HandTip`]);
    const q = turn[hb];
    q.setFromUnitVectors(hf.dir.clone().applyQuaternion(turn[fb]), axis).multiply(turn[fb]);
    // Of the flat of the hand's two faces, the one that lands nearer the T-pose palm is the palm.
    const n1 = hf.n.applyQuaternion(q);
    if (n1.dot(PALM[si]) < 0) n1.negate();
    n1.addScaledVector(axis, -n1.dot(axis)).normalize();
    const roll = Math.atan2(n1.clone().cross(PALM[si]).dot(axis), n1.dot(PALM[si]));
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, roll));
    // The forearm takes half that twist, as its two bones share it in life.
    turn[fb].premultiply(new THREE.Quaternion().setFromAxisAngle(axis, roll / 2));
  });
  const mats: THREE.Matrix4[] = [];
  const a = new THREE.Vector3();
  for (let i = 0; i < NB; i++) {
    const n = BONES[i];
    const H = mh[n];
    const h = BIND[n];
    const c = CHILD[n];
    a.subVectors(mh[c], H);
    const head = n === 'Head';
    const rigid = head || n.endsWith('Hand');
    const lat = head ? s0 * HEAD_K : s0;
    // The head and hands keep their own proportions; limbs stretch along their length only.
    const k = rigid ? lat : BIND[c].distanceTo(h) / a.length();
    a.normalize();
    const S = new THREE.Matrix4().set(
      lat + (k - lat) * a.x * a.x, (k - lat) * a.x * a.y, (k - lat) * a.x * a.z, 0,
      (k - lat) * a.y * a.x, lat + (k - lat) * a.y * a.y, (k - lat) * a.y * a.z, 0,
      (k - lat) * a.z * a.x, (k - lat) * a.z * a.y, lat + (k - lat) * a.z * a.z, 0,
      0, 0, 0, 1,
    );
    mats[i] = new THREE.Matrix4().makeTranslation(h.x, h.y, h.z)
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(turn[i]))
      .multiply(S)
      .multiply(new THREE.Matrix4().makeTranslation(-H.x, -H.y, -H.z));
  }
  return { mats, s0 };
}

// ---------- Dressing ----------

export const Region = { Skin: 0, Shirt: 1, Shorts: 2, Sock: 3, Boot: 4, Glove: 5 } as const;
export type Region = (typeof Region)[keyof typeof Region];
/** Where the shorts meet the shirt, and the kit's other edges (bind-pose y). */
export const SHORTS_TOP = 1.13;
/** The shirt number on the back (bind pose): half width, top edge, height. */
export const NUM = { x: 0.105, top: 1.63, h: 0.25 };
const SLEEVE = 0.14;

/** Body part per bone: 0 torso, 1 arm, 2 hand, 3 leg, 4 foot, 5 head. */
const GROUP = BONES.map((n: BoneName) => {
  if (n.endsWith('Arm')) return 1;
  if (n.endsWith('Hand')) return 2;
  if (n.endsWith('Leg')) return 3;
  if (n.endsWith('Foot') || n.endsWith('ToeBase')) return 4;
  return n === 'Head' ? 5 : 0;
});

/**
 * How the clothes are cut: where sleeves, hems, socks and shoes end, and how
 * thick the cloth sits. The club kit and the keeper's kit are two cuts; casual
 * outfits make their own (shared/cosmetics.ts → figures.ts).
 */
export interface Cut {
  /** Sleeve end down the arm (armT): 0.14 short, about 0.45 to the wrist. */
  sleeve: number;
  gloves: boolean;
  /** Bottoms' hem height at the centre line, and how much it rises toward the outside of the leg. */
  hem: number;
  hemSide: number;
  /** Top of the socks and of the shoes (y). */
  sock: number;
  shoe: number;
  /** Where the top meets the bottoms. */
  waist: number;
  /** Collar height at the back, and how far it drops toward the front. */
  collar: number;
  dip: number;
  /** Cloth thickness of the top and the bottoms, and how much the bottoms widen below the waist. */
  puffTop: number;
  puffBottom: number;
  flare: number;
  /** Shoes: upper thickness, sole height and how far the sole stands proud of the upper. */
  puffShoe: number;
  sole: number;
  puffSole: number;
}

export const KIT_CUT: Cut = { sleeve: SLEEVE, gloves: false, hem: 0.8, hemSide: 0.15, sock: 0.52, shoe: 0.13, waist: SHORTS_TOP, collar: 1.775, dip: 0.6, puffTop: 0.013, puffBottom: 0.02, flare: 0.05, puffShoe: 0.012, sole: 0.028, puffSole: 0.004 };
export const KEEPER_CUT: Cut = { ...KIT_CUT, sleeve: SLEEVE + 0.45, gloves: true };

/** Kit region for a bind-pose point, given how much of it is arm/hand/leg/foot. */
export function regionAt(x: number, y: number, z: number, armT: number, w: { arm: number; hand: number; leg: number; foot: number; head: number }, cut: Cut): Region {
  if (w.hand > 0.5) return cut.gloves ? Region.Glove : Region.Skin;
  if (w.arm > 0.5) return armT < cut.sleeve ? Region.Shirt : Region.Skin;
  if (w.foot > 0.5 || y < cut.shoe) return Region.Boot;
  if (y < cut.sock) return Region.Sock;
  if (y < cut.hem - Math.abs(x) * cut.hemSide) return Region.Skin;
  if (y < cut.waist + (z > 0 ? 0 : 0.01)) return Region.Shorts;
  // The collar dips at the front.
  const collar = cut.collar - Math.max(0, z) * cut.dip - Math.max(0, 0.05 - Math.abs(x)) * 0.4;
  return y < collar ? Region.Shirt : Region.Skin;
}

const PUFF = [0, 0.013, 0.02, 0.005, 0.012, 0.012];

// ---------- Build ----------

export interface BodyBuild {
  geometry: THREE.BufferGeometry;
  /** Lash cards, eyes: in bind space. */
  lashes: THREE.BufferGeometry;
  eyes: { c: THREE.Vector3; r: number }[];
  /** Per render-vertex attributes for the painters (body and head groups share indices). */
  paint: {
    uv: Float32Array;
    tri: Uint32Array;
    headTri: Uint32Array;
    /** Bind position (before cloth), normal, armT, weights arm/hand/leg/foot/head, masks lipU/lipL/brow/lid, cavity. */
    attr: Float32Array;
    k: number;
  };
  /** Head frame: centre (bind space) the face projection and head painter use. */
  headC: THREE.Vector3;
  land: FaceLand;
  /** Club crest spot on the left chest, and the neck's ring at the collar (bind space). */
  crestAt: THREE.Vector3;
  neck: { y: number; z: number; r: number };
  /** Front surface depth of the chest (bind z on a grid), for draping chains over the clothes. */
  chest: { x0: number; y0: number; step: number; nx: number; ny: number; z: Float32Array };
  /** The same for the back (its outermost, most negative z). */
  back: { x0: number; y0: number; step: number; nx: number; ny: number; z: Float32Array };
  /** Each wrist (left, right): centre, along the forearm toward the hand, and girth. */
  wrists: { c: THREE.Vector3; dir: THREE.Vector3; r: number }[];
  /** Each foot (left, right) sliced heel to toe: its outline per slice, for fitting shoes round it. */
  feet: FootShape[];
  s0: number;
}

export interface FootShape {
  z0: number;
  z1: number;
  /** Per slice along z: min x, max x, max y. */
  x0: Float32Array;
  x1: Float32Array;
  y1: Float32Array;
  /** Lowest point of the foot. */
  bottom: number;
}

/** The chest's front depth at (x, y), from the grid in a BodyBuild. */
export function chestZ(b: BodyBuild, x: number, y: number, back = false) {
  const c = back ? b.back : b.chest;
  const fx = Math.max(0, Math.min(c.nx - 1.001, (x - c.x0) / c.step));
  const fy = Math.max(0, Math.min(c.ny - 1.001, (y - c.y0) / c.step));
  const i = Math.floor(fx), j = Math.floor(fy);
  const u = fx - i, v = fy - j;
  const at = (a: number, b2: number) => c.z[b2 * c.nx + a];
  return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
}

/**
 * Painter attributes per render vertex: base-mesh position in canonical head space (features
 * stick to the surface whatever the sliders do), bind-pose skin position, normal, distance
 * down the arm, arm/hand/leg/foot/head weights, lip/brow/lid masks, cavity, ear, and whether
 * the vertex is cloth (so kit edges follow the cloth's step, not the texel grid).
 */
export const PAINT_K = 22;
export const A = { base: 0, pos: 3, nrm: 6, armT: 9, arm: 10, hand: 11, leg: 12, foot: 13, head: 14, lipU: 15, lipL: 16, brow: 17, lid: 18, cav: 19, ear: 20, cloth: 21 } as const;

/** The head layout's strips for inner surfaces (straight down: inside the neck, never seen): the mouth and nostrils, and the eyelids' inner rims. */
export const INNER_V = 0.003;
export const INNER_EYE_V = 0.011;

export function buildBody(a: Appearance, cut: Cut): BodyBuild {
  const bd = bundle!;
  const nv = bd.nv;
  // 1. Shape: the baked base plus the look's targets.
  const P = new Float32Array(bd.pos);
  for (const [name, w0] of Object.entries(morphWeights(a))) {
    if (!w0) continue;
    // Single targets take the weight as is; slider pairs pick their side by sign.
    const single = bd.targets[name];
    const tg = single ?? bd.targets[`${name}${w0 > 0 ? '+' : '-'}`];
    if (!tg) continue;
    const k = tg.s * (single ? w0 : Math.abs(w0));
    for (let j = 0; j < tg.idx.length; j++) {
      const i = tg.idx[j] * 3;
      P[i] += tg.d[j * 3] * k;
      P[i + 1] += tg.d[j * 3 + 1] * k;
      P[i + 2] += tg.d[j * 3 + 2] * k;
    }
  }

  // 2. Fit onto our bind pose with MakeHuman's weights folded onto our bones.
  const { mats, s0 } = fitMatrices(P, bd);
  const Q = new Float32Array(nv * 3);
  const v = new THREE.Vector3();
  const me = mats.map((m) => m.elements);
  for (let i = 0; i < nv; i++) {
    let x = 0, y = 0, z = 0;
    const px = P[i * 3], py = P[i * 3 + 1], pz = P[i * 3 + 2];
    for (let c = 0; c < 4; c++) {
      const w = bd.skinW[i * 4 + c] / 255;
      if (!w) continue;
      const e = me[bd.skinI[i * 4 + c]];
      x += (e[0] * px + e[4] * py + e[8] * pz + e[12]) * w;
      y += (e[1] * px + e[5] * py + e[9] * pz + e[13]) * w;
      z += (e[2] * px + e[6] * py + e[10] * pz + e[14]) * w;
    }
    Q[i * 3] = x;
    Q[i * 3 + 1] = y;
    Q[i * 3 + 2] = z;
  }

  // 3. Smooth normals per shape vertex.
  const N = shapeNormals(bd, Q);

  // 4. Regions, cloth thickness.
  const groupW = new Float32Array(nv * 5);
  const armT = new Float32Array(nv);
  const region = new Uint8Array(nv);
  const jArm = [BIND.LeftArm, BIND.RightArm];
  const dirArm = [BIND.LeftForeArm.clone().sub(BIND.LeftArm).normalize(), BIND.RightForeArm.clone().sub(BIND.RightArm).normalize()];
  const g = { arm: 0, hand: 0, leg: 0, foot: 0, head: 0 };
  for (let i = 0; i < nv; i++) {
    const gw = [0, 0, 0, 0, 0, 0];
    for (let c = 0; c < 4; c++) gw[GROUP[bd.skinI[i * 4 + c]]] += bd.skinW[i * 4 + c] / 255;
    g.arm = gw[1];
    g.hand = gw[2];
    g.leg = gw[3];
    g.foot = gw[4];
    g.head = gw[5];
    // Shoulders' outer skin counts as arm for the sleeve.
    const side = Q[i * 3] > 0 ? 0 : 1;
    v.set(Q[i * 3], Q[i * 3 + 1], Q[i * 3 + 2]).sub(jArm[side]);
    armT[i] = v.dot(dirArm[side]);
    for (let c = 0; c < 5; c++) groupW[i * 5 + c] = gw[c + 1];
    region[i] = regionAt(Q[i * 3], Q[i * 3 + 1], Q[i * 3 + 2], armT[i], g, cut);
  }
  const P0 = Q.slice();
  const puff = new Float32Array(nv);
  const cloth = new Float32Array(nv);
  for (let i = 0; i < nv; i++) {
    const rg = region[i];
    let p = rg === Region.Shirt ? cut.puffTop : rg === Region.Shorts ? cut.puffBottom : rg === Region.Boot ? cut.puffShoe + (Q[i * 3 + 1] < cut.sole ? cut.puffSole : 0) : PUFF[rg];
    // Shorts flare toward the hem (trousers only a little); the shirt hangs a little off the belly and back.
    if (rg === Region.Shorts) p += Math.min(0.35, Math.max(0, cut.waist - Q[i * 3 + 1])) * cut.flare;
    if (region[i] === Region.Shirt && Q[i * 3 + 1] < 1.45) p += 0.004;
    puff[i] = p;
    cloth[i] = p > 0 ? 1 : 0;
  }
  // The cloth thins to nothing over its last centimetre or two at every hem, so the
  // painted hem line (exact, per texel) never sits on a stepped edge of the mesh.
  const edge = smoothField(bd, cloth, 3);
  for (let i = 0; i < nv; i++) {
    const p = puff[i] * smoothstep(0.55, 0.95, edge[i]) * cloth[i];
    puff[i] = p;
    Q[i * 3] += N[i * 3] * p;
    Q[i * 3 + 1] += N[i * 3 + 1] * p;
    Q[i * 3 + 2] += N[i * 3 + 2] * p;
  }
  const N2 = shapeNormals(bd, Q);

  // 5. Cavities (concave creases darken) for the painters.
  const cav = cavity(bd, Q, N2);

  // 6. Eyes from the helpers (in bind space).
  const eyes = (['l', 'r'] as const).map((s) => {
    const ids = bd.eyes[s];
    const c = new THREE.Vector3();
    for (const i of ids) c.x += Q[i * 3], c.y += Q[i * 3 + 1], c.z += Q[i * 3 + 2];
    c.divideScalar(ids.length);
    let r = 0;
    for (const i of ids) r = Math.max(r, c.distanceTo(v.set(Q[i * 3], Q[i * 3 + 1], Q[i * 3 + 2])));
    return { c, r };
  });

  // 7. Head frame and the head group: the head down to just under the jaw. The neck below
  // is on the body texture; both paint the same skin there, so the seam doesn't show.
  let zMin = 1e9, zMax = -1e9;
  for (let i = 0; i < nv; i++) {
    if (groupW[i * 5 + 4] > 0.5) {
      zMin = Math.min(zMin, Q[i * 3 + 2]);
      zMax = Math.max(zMax, Q[i * 3 + 2]);
    }
  }
  const headC = new THREE.Vector3(0, (eyes[0].c.y + eyes[1].c.y) / 2, (zMin + zMax) / 2);
  const land = faceLandmarks(bd, Q, headC, eyes);
  const headV = new Uint8Array(nv);
  const neckY = headC.y + land.chinY - 0.012;
  for (let i = 0; i < nv; i++) {
    const y = Q[i * 3 + 1];
    if (y > neckY && groupW[i * 5 + 4] > 0.3 && bd.masks.ear[i] < 200) headV[i] = 1;
  }

  // Inner surfaces (the mouth, nostrils, behind the eyes) share directions with the face, so
  // they would overlap it in the head layout: they get a thin strip of their own, painted dark.
  // A depth buffer in the layout keeps the outermost surface per texel; anything well under it is inner.
  const IB = 256;
  const depth = new Float32Array(IB * IB);
  const hU = new Float32Array(nv), hV = new Float32Array(nv), rad = new Float32Array(nv);
  for (let i = 0; i < nv; i++) {
    if (!headV[i]) continue;
    const dx = Q[i * 3] - headC.x, dy = Q[i * 3 + 1] - headC.y, dz = Q[i * 3 + 2] - headC.z;
    const w = dirToUV(dx, dy, dz);
    hU[i] = w[0];
    hV[i] = w[1];
    rad[i] = Math.hypot(dx, dy, dz);
  }
  {
    const tu = [0, 0, 0], tv = [0, 0, 0], tr = [0, 0, 0];
    const t = bd.tri;
    for (let i = 0; i < t.length; i += 3) {
      const a = bd.rv[t[i]], b = bd.rv[t[i + 1]], c = bd.rv[t[i + 2]];
      if (!headV[a] || !headV[b] || !headV[c]) continue;
      const lo = Math.min(hU[a], hU[b], hU[c]);
      const seam = Math.max(hU[a], hU[b], hU[c]) - lo > 0.5;
      for (let k = 0; k < 3; k++) {
        const sv = k === 0 ? a : k === 1 ? b : c;
        tu[k] = hU[sv] + (seam && hU[sv] < 0.5 ? 1 : 0);
        tv[k] = hV[sv];
        tr[k] = rad[sv];
      }
      rasterMax(IB, tu, tv, tr, depth);
      if (seam) {
        for (let k = 0; k < 3; k++) tu[k] -= 1;
        rasterMax(IB, tu, tv, tr, depth);
      }
    }
  }
  const inner = new Uint8Array(nv);
  for (let i = 0; i < nv; i++) {
    if (!headV[i]) continue;
    const o = Math.min(IB - 1, Math.floor(hV[i] * IB)) * IB + Math.min(IB - 1, Math.floor(hU[i] * IB));
    // Only in the face: lower down, the neck inside the collar is meant to show.
    const fy = Q[i * 3 + 1] - headC.y;
    if (rad[i] < depth[o] - 0.005 && fy > land.mouthY - 0.03 && fy < land.eyeY + 0.03 && Math.abs(Q[i * 3]) < land.eyeX + 0.035) inner[i] = 1;
  }

  // 8. Render arrays: body triangles on MakeHuman UVs, head triangles on our projection.
  const rv = bd.rv;
  const nr = rv.length;
  const headMap = new Map<number, number>();
  // Head-group copies: the shape vertex, and whether its u is pushed past 1 (triangles across the back seam).
  const extra: number[] = [];
  /** 0 plain, 1 u pushed past 1, 2 in the inner strip. */
  const shifted: number[] = [];
  const bodyTri: number[] = [];
  const headTri: number[] = [];
  const t = bd.tri;
  const sv3 = [0, 0, 0];
  for (let i = 0; i < t.length; i += 3) {
    const a = rv[t[i]], b = rv[t[i + 1]], c = rv[t[i + 2]];
    if (headV[a] && headV[b] && headV[c]) {
      sv3[0] = a;
      sv3[1] = b;
      sv3[2] = c;
      const seam = Math.max(hU[a], hU[b], hU[c]) - Math.min(hU[a], hU[b], hU[c]) > 0.5;
      const ins = inner[a] || inner[b] || inner[c];
      for (const sv of sv3) {
        const sh = ins ? 2 : seam && hU[sv] < 0.5 ? 1 : 0;
        const key = sh === 2 ? -(1 << 20) - sv : sh ? -1 - sv : sv;
        let r = headMap.get(key);
        if (r === undefined) {
          r = nr + extra.length;
          headMap.set(key, r);
          extra.push(sv);
          shifted.push(sh);
        }
        headTri.push(r);
      }
    } else bodyTri.push(t[i], t[i + 1], t[i + 2]);
  }
  const total = nr + extra.length;
  const shapeOf = (r: number) => (r < nr ? rv[r] : extra[r - nr]);
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const si = new Uint16Array(total * 4);
  const sw = new Float32Array(total * 4);
  const attr = new Float32Array(total * PAINT_K);
  const m = bd.masks;
  const bf = baseFrame!;
  for (let r = 0; r < total; r++) {
    const i = shapeOf(r);
    for (let c = 0; c < 3; c++) {
      pos[r * 3 + c] = Q[i * 3 + c];
      nrm[r * 3 + c] = N2[i * 3 + c];
    }
    if (r < nr) {
      uv[r * 2] = bd.ruv[r * 2];
      uv[r * 2 + 1] = bd.ruv[r * 2 + 1];
    } else {
      const sh = shifted[r - nr];
      if (sh === 2) {
        v.set(Q[i * 3], Q[i * 3 + 1], Q[i * 3 + 2]);
        const nearEye = eyes[0].c.distanceTo(v) < eyes[0].r * 1.7 || eyes[1].c.distanceTo(v) < eyes[1].r * 1.7;
        uv[r * 2] = hU[i];
        uv[r * 2 + 1] = nearEye ? INNER_EYE_V : INNER_V;
      } else {
        uv[r * 2] = hU[i] + sh;
        uv[r * 2 + 1] = hV[i];
      }
    }
    for (let c = 0; c < 4; c++) {
      si[r * 4 + c] = bd.skinI[i * 4 + c];
      sw[r * 4 + c] = bd.skinW[i * 4 + c] / 255;
    }
    const k = r * PAINT_K;
    attr[k + A.base] = (bd.pos[i * 3] - bf.c.x) * bf.k;
    attr[k + A.base + 1] = (bd.pos[i * 3 + 1] - bf.c.y) * bf.k;
    attr[k + A.base + 2] = (bd.pos[i * 3 + 2] - bf.c.z) * bf.k;
    // Kit regions are read off the bind-pose skin, before the cloth's thickness.
    for (let c = 0; c < 3; c++) {
      attr[k + A.pos + c] = Q[i * 3 + c] - N2[i * 3 + c] * puff[i];
      attr[k + A.nrm + c] = N2[i * 3 + c];
    }
    attr[k + A.armT] = armT[i];
    for (let c = 0; c < 5; c++) attr[k + A.arm + c] = groupW[i * 5 + c];
    attr[k + A.lipU] = m.lipU[i] / 255;
    attr[k + A.lipL] = m.lipL[i] / 255;
    attr[k + A.brow] = m.brow[i] / 255;
    attr[k + A.lid] = m.lid[i] / 255;
    attr[k + A.cav] = cav[i];
    attr[k + A.ear] = m.ear[i] / 255;
    attr[k + A.cloth] = cloth[i];
  }
  // Seams: the head-group copies keep identical position and normal, so no crack shows.
  // The shirt number's own coordinates across the back (the shader draws it).
  const numUv = new Float32Array(total * 2).fill(-9);
  for (let r = 0; r < total; r++) {
    const x = attr[r * PAINT_K + A.pos], y = attr[r * PAINT_K + A.pos + 1], z = attr[r * PAINT_K + A.pos + 2];
    if (z < 0 && y > 1.2 && y < 1.8 && Math.abs(x) < 0.3) {
      numUv[r * 2] = (NUM.x - x) / (2 * NUM.x);
      numUv[r * 2 + 1] = (NUM.top - y) / NUM.h;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('numUv', new THREE.BufferAttribute(numUv, 2));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  const index = new Uint32Array(bodyTri.length + headTri.length);
  index.set(bodyTri);
  index.set(headTri, bodyTri.length);
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.addGroup(0, bodyTri.length, 0);
  geometry.addGroup(bodyTri.length, headTri.length, 1);

  // Lashes: cards from the base mesh, in bind space.
  const lashes = new THREE.BufferGeometry();
  const lp = new Float32Array(bd.lash.length * 3);
  bd.lash.forEach((i, k) => lp.set([Q[i * 3], Q[i * 3 + 1], Q[i * 3 + 2]], k * 3));
  lashes.setAttribute('position', new THREE.BufferAttribute(lp, 3));
  lashes.computeVertexNormals();

  // Crest on the left chest; the neck's girth where a chain or snood sits.
  let front = 0;
  let ny = 0, nz = 0, nn = 0;
  for (let i = 0; i < nv; i++) {
    const x = Q[i * 3], y = Q[i * 3 + 1], z = Q[i * 3 + 2];
    if (region[i] === Region.Shirt && Math.abs(x - 0.095) < 0.02 && Math.abs(y - 1.565) < 0.02 && z > front) front = z;
    if (Math.abs(y - 1.785) < 0.012 && Math.abs(x) < 0.12) {
      ny += y;
      nz += z;
      nn++;
    }
  }
  nz /= nn || 1;
  let neckR = 0;
  for (let i = 0; i < nv; i++) {
    const x = Q[i * 3], y = Q[i * 3 + 1], z = Q[i * 3 + 2];
    if (Math.abs(y - 1.785) < 0.012 && Math.abs(x) < 0.12) neckR += Math.hypot(x, z - nz);
  }
  // Chest and back depth (chains, the hood): the outermost torso surface on a grid.
  const depthGrid = (sgn: number) => {
    const gr = { x0: -0.2, y0: 1.36, step: 0.01, nx: 41, ny: 50, z: new Float32Array(41 * 50).fill(-9) };
    for (let i = 0; i < nv; i++) {
      const x = Q[i * 3], y = Q[i * 3 + 1], z = Q[i * 3 + 2] * sgn;
      if (z <= 0 || groupW[i * 5] > 0.5 || groupW[i * 5 + 4] > 0.6) continue;
      const a = Math.round((x - gr.x0) / gr.step), b = Math.round((y - gr.y0) / gr.step);
      if (a < 0 || b < 0 || a >= gr.nx || b >= gr.ny) continue;
      const k = b * gr.nx + a;
      if (z > gr.z[k]) gr.z[k] = z;
    }
    // Gaps (between the arms and body, above the shoulders) take their nearest row-mate.
    for (let b = 0; b < gr.ny; b++) {
      for (let pass = 0; pass < 2; pass++) for (let a0 = 0; a0 < gr.nx; a0++) {
        const a = pass ? gr.nx - 1 - a0 : a0;
        const k = b * gr.nx + a;
        if (gr.z[k] > -9) continue;
        const n = pass ? k + 1 : k - 1;
        if ((pass ? a < gr.nx - 1 : a > 0) && gr.z[n] > -9) gr.z[k] = gr.z[n];
      }
    }
    for (let k = 0; k < gr.z.length; k++) gr.z[k] = gr.z[k] <= -9 ? nz + 0.05 * sgn : gr.z[k] * sgn;
    return gr;
  };
  const chest = depthGrid(1);
  const back = depthGrid(-1);
  // Wrist girth where a watch or bracelet sits.
  const wrists = (['Left', 'Right'] as const).map((sd) => {
    const hand = BIND[`${sd}Hand`], fore = BIND[`${sd}ForeArm`];
    const dir = hand.clone().sub(fore).normalize();
    const c = hand.clone().addScaledVector(dir, -0.045);
    let r = 0, n = 0;
    for (let i = 0; i < nv; i++) {
      v.set(Q[i * 3], Q[i * 3 + 1], Q[i * 3 + 2]).sub(c);
      const along = v.dot(dir);
      if (Math.abs(along) > 0.008) continue;
      const d = v.addScaledVector(dir, -along).length();
      if (d > 0.08 || groupW[i * 5] + groupW[i * 5 + 1] < 0.5) continue;
      r += d;
      n++;
    }
    return { c, dir, r: n ? (r / n) * 1.02 : 0.03 };
  });
  // Foot outlines for shoes (skin positions, before any cloth).
  const feet = (['Left', 'Right'] as const).map((sd): FootShape => {
    const sx = Math.sign(BIND[`${sd}Foot`].x);
    const NZ = 24;
    let z0 = 1e9, z1 = -1e9, bottom = 1e9;
    const ids: number[] = [];
    for (let i = 0; i < nv; i++) {
      if (groupW[i * 5 + 3] < 0.5 || Math.sign(P0[i * 3]) !== sx) continue;
      ids.push(i);
      z0 = Math.min(z0, P0[i * 3 + 2]);
      z1 = Math.max(z1, P0[i * 3 + 2]);
      bottom = Math.min(bottom, P0[i * 3 + 1]);
    }
    const x0 = new Float32Array(NZ).fill(1e9), x1 = new Float32Array(NZ).fill(-1e9), y1 = new Float32Array(NZ).fill(-1e9);
    for (const i of ids) {
      const k = Math.min(NZ - 1, Math.floor(((P0[i * 3 + 2] - z0) / (z1 - z0 + 1e-6)) * NZ));
      x0[k] = Math.min(x0[k], P0[i * 3]);
      x1[k] = Math.max(x1[k], P0[i * 3]);
      y1[k] = Math.max(y1[k], P0[i * 3 + 1]);
    }
    for (let k = 0; k < NZ; k++) if (x0[k] > 1e8) { const n = k ? k - 1 : k + 1; x0[k] = x0[n]; x1[k] = x1[n]; y1[k] = y1[n]; }
    return { z0, z1, x0, x1, y1, bottom };
  });
  return {
    feet,
    chest,
    back,
    wrists,
    geometry,
    lashes,
    eyes,
    paint: { uv, tri: new Uint32Array(bodyTri), headTri: new Uint32Array(headTri), attr, k: PAINT_K },
    headC,
    land,
    crestAt: new THREE.Vector3(0.095, 1.565, front),
    neck: { y: ny / (nn || 1), z: nz, r: neckR / (nn || 1) },
    s0,
  };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function shapeNormals(b: Bundle, Q: Float32Array) {
  const N = new Float32Array(b.nv * 3);
  const t = b.tri;
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), p0 = new THREE.Vector3();
  for (let i = 0; i < t.length; i += 3) {
    const a = b.rv[t[i]], c = b.rv[t[i + 1]], d = b.rv[t[i + 2]];
    p0.fromArray(Q, a * 3);
    e1.fromArray(Q, c * 3).sub(p0);
    e2.fromArray(Q, d * 3).sub(p0);
    e1.cross(e2);
    for (const k of [a, c, d]) {
      N[k * 3] += e1.x;
      N[k * 3 + 1] += e1.y;
      N[k * 3 + 2] += e1.z;
    }
  }
  for (let i = 0; i < b.nv; i++) {
    const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
    N[i * 3] /= l;
    N[i * 3 + 1] /= l;
    N[i * 3 + 2] /= l;
  }
  return N;
}

function smoothField(b: Bundle, f: Float32Array, passes: number) {
  let cur = f;
  for (let p = 0; p < passes; p++) {
    const next = new Float32Array(b.nv);
    for (let i = 0; i < b.nv; i++) {
      const s = b.adjStart[i], e = b.adjStart[i + 1];
      if (s === e) {
        next[i] = cur[i];
        continue;
      }
      let acc = 0;
      for (let j = s; j < e; j++) acc += cur[b.adj[j]];
      next[i] = (cur[i] + acc / (e - s)) / 2;
    }
    cur = next;
  }
  return cur;
}

/** 0 flat or convex, toward 1 in creases: how far neighbours rise above the tangent plane. */
function cavity(b: Bundle, Q: Float32Array, N: Float32Array) {
  const c = new Float32Array(b.nv);
  for (let i = 0; i < b.nv; i++) {
    const s = b.adjStart[i], e = b.adjStart[i + 1];
    let acc = 0;
    let len = 0;
    for (let j = s; j < e; j++) {
      const n = b.adj[j];
      const dx = Q[n * 3] - Q[i * 3], dy = Q[n * 3 + 1] - Q[i * 3 + 1], dz = Q[n * 3 + 2] - Q[i * 3 + 2];
      acc += dx * N[i * 3] + dy * N[i * 3 + 1] + dz * N[i * 3 + 2];
      len += Math.hypot(dx, dy, dz);
    }
    c[i] = e > s ? Math.max(0, acc / (len || 1)) : 0;
  }
  // Spread a little so creases read as soft shadow.
  const sm = smoothField(b, c, 2);
  for (let i = 0; i < b.nv; i++) sm[i] = Math.min(1, sm[i] * 6);
  return sm;
}

/** Face landmarks relative to the head centre, for the painters and the hair. */
export interface FaceLand {
  eyeX: number;
  eyeY: number;
  eyeZ: number;
  eyeR: number;
  mouthY: number;
  mouthW: number;
  tipY: number;
  tipZ: number;
  chinY: number;
  crown: number;
  /** Lips' forward depth, and the ear's centre (x is outward). */
  lipZ: number;
  earX: number;
  earY: number;
  earZ: number;
}

function faceLandmarks(b: Bundle, Q: Float32Array, c: THREE.Vector3, eyes: { c: THREE.Vector3; r: number }[]): FaceLand {
  let my = 0, mw = 0, wsum = 0, lipZ = 0, tipY = 0, tipZ = -1, chinY = 0, crown = -1e9;
  let ex = 0, ey = 0, ez = 0, en = 0;
  const X = (i: number) => Q[i * 3] - c.x, Y = (i: number) => Q[i * 3 + 1] - c.y, Z = (i: number) => Q[i * 3 + 2] - c.z;
  for (let i = 0; i < b.nv; i++) {
    const lip = Math.max(b.masks.lipU[i], b.masks.lipL[i]) / 255;
    if (lip > 0.5) {
      my += Y(i) * lip;
      lipZ += Z(i) * lip;
      wsum += lip;
      mw = Math.max(mw, Math.abs(X(i)));
    }
    if (Math.abs(X(i)) < 0.03 && Y(i) > crown) crown = Y(i);
    const ear = b.masks.ear[i] / 255;
    if (ear > 0.5) {
      ex += Math.abs(X(i)) * ear;
      ey += Y(i) * ear;
      ez += Z(i) * ear;
      en += ear;
    }
  }
  my = wsum ? my / wsum : -0.09;
  lipZ = wsum ? lipZ / wsum : 0.1;
  for (let i = 0; i < b.nv; i++) {
    if (Math.abs(X(i)) < 0.006 && Y(i) < -0.01 && Y(i) > my + 0.01 && Z(i) > tipZ) {
      tipZ = Z(i);
      tipY = Y(i);
    }
  }
  for (let i = 0; i < b.nv; i++) {
    if (Math.abs(X(i)) < 0.01 && Z(i) > tipZ - 0.06 && Y(i) < my - 0.02 && Y(i) > my - 0.1 && Y(i) < chinY) chinY = Y(i);
  }
  const e = eyes[0];
  return { eyeX: Math.abs(e.c.x - c.x), eyeY: e.c.y - c.y, eyeZ: e.c.z - c.z, eyeR: e.r, mouthY: my, mouthW: mw, tipY, tipZ, chinY, crown, lipZ, earX: ex / (en || 1), earY: ey / (en || 1), earZ: ez / (en || 1) };
}
