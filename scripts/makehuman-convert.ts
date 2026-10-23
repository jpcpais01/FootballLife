// Converts the MakeHuman base mesh, its shape targets and its skeleton weights
// (all CC0) into the game's compact character bundle.
//
//   node --experimental-strip-types scripts/makehuman-convert.ts <makehuman/data dir>
//
// The data dir is makehuman/data from github.com/makehumancommunity/makehuman
// (3dobjs/base.obj, targets/, rigs/default.mhskel, rigs/default_weights.mhw).
// The base is baked as a young adult man; the targets the creator uses are
// kept as sparse deltas, MakeHuman's 163 bones are folded onto our 22, and a
// few target footprints are kept as masks (lips, brows, ears) for the painter.
// Writes public/character/body.json.
import fs from 'node:fs';
import path from 'node:path';
import { B, type BoneName } from '../src/viewer/rig/skeleton.ts';

const dir = process.argv[2];
if (!dir) throw new Error('usage: makehuman-convert.ts <makehuman/data dir>');
const rd = (p: string) => fs.readFileSync(path.join(dir, p), 'utf8');

// ---------- Mesh ----------

const V: number[][] = [];
const T: number[][] = [];
const groups: Record<string, [number, number][][]> = {};
let g = '';
for (const line of rd('3dobjs/base.obj').split('\n')) {
  const p = line.trim().split(/\s+/);
  if (p[0] === 'v') V.push(p.slice(1, 4).map(Number));
  else if (p[0] === 'vt') T.push(p.slice(1, 3).map(Number));
  else if (p[0] === 'g') g = p[1];
  else if (p[0] === 'f') (groups[g] ??= []).push(p.slice(1).map((q) => q.split('/').map((n) => Number(n) - 1) as [number, number]));
}

const skel = JSON.parse(rd('rigs/default.mhskel'));
const joints: Record<string, number[]> = skel.joints;

// Vertices we keep: the body, eyelashes, the eye helpers and every joint's vertices.
const keep = new Set<number>();
const use = (gr: string) => groups[gr].forEach((f) => f.forEach(([v]) => keep.add(v)));
for (const gr of ['body', 'helper-l-eyelashes-1', 'helper-l-eyelashes-2', 'helper-r-eyelashes-1', 'helper-r-eyelashes-2', 'helper-l-eye', 'helper-r-eye']) use(gr);
for (const list of Object.values(joints)) list.forEach((v) => keep.add(v));
const orig = [...keep].sort((a, b) => a - b);
const cIdx = new Map(orig.map((v, i) => [v, i]));
const NV = orig.length;

// ---------- Targets ----------

function target(name: string): Map<number, [number, number, number]> {
  const out = new Map<number, [number, number, number]>();
  for (const line of rd(`targets/${name}.target`).split('\n')) {
    if (!line || line[0] === '#') continue;
    const p = line.trim().split(/\s+/).map(Number);
    if (p.length < 4) continue;
    const c = cIdx.get(p[0]);
    if (c !== undefined) out.set(c, [p[1], p[2], p[3]]);
  }
  return out;
}
const add = (a: Map<number, number[]>, b: Map<number, number[]>, k = 1) => {
  for (const [i, d] of b) {
    const e = a.get(i) ?? [0, 0, 0];
    a.set(i, [e[0] + d[0] * k, e[1] + d[1] * k, e[2] + d[2] * k]);
  }
  return a;
};
const sum = (...parts: [string, number][]) => parts.reduce((m, [n, k]) => add(m, target(n), k), new Map<number, number[]>());

// The baked base: a young man of average muscle and weight, European features.
const U = (m: string, w: string) => `macrodetails/universal-male-young-${m}muscle-${w}weight`;
const base = sum([U('average', 'average'), 1], ['macrodetails/caucasian-male-young', 1]);
const P = new Float32Array(NV * 3);
orig.forEach((v, i) => {
  const d = base.get(i) ?? [0, 0, 0];
  P[i * 3] = V[v][0] + d[0];
  P[i * 3 + 1] = V[v][1] + d[1];
  P[i * 3 + 2] = V[v][2] + d[2];
});

// Creator targets. A slider pair is [decrease, increase]; left/right files are summed.
const LR = (n: string) => [n.replace('#', 'l'), n.replace('#', 'r')];
const pair = (folder: string, stem: string, lo: string, hi: string, lr = false): [string[], string[]] => {
  const f = (s: string) => (lr ? LR(`${folder}/#-${stem}-${s}`) : [`${folder}/${stem}-${s}`]);
  return [f(lo), f(hi)];
};
const SLIDERS: Record<string, [string[], string[]]> = {
  headFat: pair('head', 'head-fat', 'decr', 'incr'),
  headW: pair('head', 'head-scale-horiz', 'decr', 'incr'),
  headH: pair('head', 'head-scale-vert', 'decr', 'incr'),
  headAge: pair('head', 'head-age', 'decr', 'incr'),
  foreH: pair('forehead', 'forehead-scale-vert', 'decr', 'incr'),
  temple: pair('forehead', 'forehead-temple', 'decr', 'incr'),
  browY: pair('eyebrows', 'eyebrows-trans', 'down', 'up'),
  browA: pair('eyebrows', 'eyebrows-angle', 'down', 'up'),
  eyeS: pair('eyes', 'eye-scale', 'decr', 'incr', true),
  eyeX: pair('eyes', 'eye-trans', 'in', 'out', true),
  eyeY: pair('eyes', 'eye-trans', 'down', 'up', true),
  eyeIn: pair('eyes', 'eye-corner1', 'down', 'up', true),
  eyeOut: pair('eyes', 'eye-corner2', 'down', 'up', true),
  eyeOpen: pair('eyes', 'eye-height2', 'decr', 'incr', true),
  eyeFold: pair('eyes', 'eye-eyefold', 'down', 'up', true),
  eyeBag: pair('eyes', 'eye-bag', 'decr', 'incr', true),
  epic: pair('eyes', 'eye-epicanthus', 'in', 'out', true),
  noseW: pair('nose', 'nose-scale-horiz', 'decr', 'incr'),
  noseL: pair('nose', 'nose-scale-vert', 'decr', 'incr'),
  noseP: pair('nose', 'nose-scale-depth', 'decr', 'incr'),
  noseHump: pair('nose', 'nose-hump', 'decr', 'incr'),
  noseTip: pair('nose', 'nose-point-width', 'decr', 'incr'),
  noseUp: pair('nose', 'nose-point', 'down', 'up'),
  nostril: pair('nose', 'nose-nostrils-width', 'decr', 'incr'),
  noseFlare: pair('nose', 'nose-flaring', 'decr', 'incr'),
  noseCurve: pair('nose', 'nose-curve', 'concave', 'convex'),
  noseVol: pair('nose', 'nose-volume', 'decr', 'incr'),
  mouthW: pair('mouth', 'mouth-scale-horiz', 'decr', 'incr'),
  mouthY: pair('mouth', 'mouth-trans', 'down', 'up'),
  mouthP: pair('mouth', 'mouth-scale-depth', 'decr', 'incr'),
  lipU: pair('mouth', 'mouth-upperlip-volume', 'decr', 'incr'),
  lipL: pair('mouth', 'mouth-lowerlip-volume', 'decr', 'incr'),
  smile: pair('mouth', 'mouth-angles', 'down', 'up'),
  bow: pair('mouth', 'mouth-cupidsbow', 'decr', 'incr'),
  dimple: pair('mouth', 'mouth-dimples', 'in', 'out'),
  cheekB: pair('cheek', 'cheek-bones', 'decr', 'incr', true),
  cheekV: pair('cheek', 'cheek-volume', 'decr', 'incr', true),
  cheekIn: pair('cheek', 'cheek-inner', 'decr', 'incr', true),
  chinP: pair('chin', 'chin-prominent', 'decr', 'incr'),
  chinW: pair('chin', 'chin-width', 'decr', 'incr'),
  chinH: pair('chin', 'chin-height', 'decr', 'incr'),
  jaw: pair('chin', 'chin-bones', 'decr', 'incr'),
  cleft: pair('chin', 'chin-cleft', 'decr', 'incr'),
  earS: pair('ears', 'ear-scale', 'decr', 'incr', true),
  earOut: pair('ears', 'ear-wing', 'decr', 'incr', true),
  earLobe: pair('ears', 'ear-lobe', 'decr', 'incr', true),
  neckW: pair('neck', 'neck-scale-horiz', 'decr', 'incr'),
};
// Single targets (0..1): head shape presets.
const SINGLES: Record<string, string> = Object.fromEntries(
  ['oval', 'round', 'square', 'rectangular', 'triangular', 'invertedtriangular', 'diamond'].map((s) => [`shape_${s}`, `head/head-${s}`]),
);

// Body build and heritage, relative to the baked base.
const avg = target(U('average', 'average'));
const minus = (a: Map<number, number[]>, b: Map<number, number[]>) => add(new Map(a), b, -1);
const cauc = target('macrodetails/caucasian-male-young');
const BODY: Record<string, Map<number, number[]>> = {
  musclePlus: minus(target(U('max', 'average')), avg),
  muscleMinus: minus(target(U('min', 'average')), avg),
  weightPlus: minus(target(U('average', 'max')), avg),
  weightMinus: minus(target(U('average', 'min')), avg),
  african: minus(target('macrodetails/african-male-young'), cauc),
  asian: minus(target('macrodetails/asian-male-young'), cauc),
};

function packTarget(m: Map<number, number[]>) {
  const rows = [...m].filter(([, d]) => Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]) > 1e-5).sort((a, b) => a[0] - b[0]);
  const max = Math.max(1e-6, ...rows.map(([, d]) => Math.max(Math.abs(d[0]), Math.abs(d[1]), Math.abs(d[2]))));
  const s = max / 32767;
  const idx = new Uint16Array(rows.map(([i]) => i));
  const d = new Int16Array(rows.length * 3);
  rows.forEach(([, v], k) => v.forEach((x, c) => (d[k * 3 + c] = Math.round(x / s))));
  return { s, idx: b64(idx), d: b64(d) };
}
const b64 = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');

const targets: Record<string, ReturnType<typeof packTarget>> = {};
for (const [k, [lo, hi]] of Object.entries(SLIDERS)) {
  targets[`${k}-`] = packTarget(lo.reduce((m, n) => add(m, target(n)), new Map()));
  targets[`${k}+`] = packTarget(hi.reduce((m, n) => add(m, target(n)), new Map()));
}
for (const [k, n] of Object.entries(SINGLES)) targets[k] = packTarget(target(n));
for (const [k, m] of Object.entries(BODY)) targets[k] = packTarget(m);

// ---------- Masks from target footprints ----------

function mask(names: string[]) {
  const m = new Float32Array(NV);
  for (const n of names) for (const [i, d] of target(n)) m[i] += Math.hypot(d[0], d[1], d[2]);
  const max = Math.max(...m) || 1;
  return b64(new Uint8Array([...m].map((x) => Math.round((x / max) * 255))));
}
const masks = {
  lipU: mask(['mouth/mouth-upperlip-volume-incr']),
  lipL: mask(['mouth/mouth-lowerlip-volume-incr']),
  brow: mask(['eyebrows/eyebrows-trans-up']),
  ear: mask([...LR('ears/#-ear-scale-incr')]),
  lid: mask([...LR('eyes/#-eye-height2-incr')]),
};

// ---------- Skeleton: fold MakeHuman's bones onto ours ----------

function ours(mh: string): BoneName {
  const s = mh.endsWith('.L') ? 'Left' : mh.endsWith('.R') ? 'Right' : '';
  const n = mh.replace(/\.(L|R)$/, '');
  if (n === 'root' || n === 'spine05' || n === 'pelvis') return 'Hips';
  if (n === 'spine04') return 'Spine';
  if (n === 'spine03') return 'Spine1';
  if (n === 'spine02' || n === 'spine01' || n === 'breast') return 'Spine2';
  if (n === 'neck01' || n === 'neck02') return 'Neck';
  if (n === 'clavicle' || n === 'shoulder01') return `${s}Shoulder` as BoneName;
  if (n.startsWith('upperarm')) return `${s}Arm` as BoneName;
  if (n.startsWith('lowerarm')) return `${s}ForeArm` as BoneName;
  if (n === 'wrist' || n.startsWith('finger') || n.startsWith('metacarpal')) return `${s}Hand` as BoneName;
  if (n.startsWith('upperleg')) return `${s}UpLeg` as BoneName;
  if (n.startsWith('lowerleg')) return `${s}Leg` as BoneName;
  if (n === 'foot') return `${s}Foot` as BoneName;
  if (n.startsWith('toe')) return `${s}ToeBase` as BoneName;
  return 'Head';
}

const W = JSON.parse(rd('rigs/default_weights.mhw')).weights as Record<string, [number, number][]>;
const acc: Map<number, number>[] = Array.from({ length: NV }, () => new Map());
for (const [bone, list] of Object.entries(W)) {
  const b = B[ours(bone)];
  for (const [v, w] of list) {
    const c = cIdx.get(v);
    if (c === undefined) continue;
    acc[c].set(b, (acc[c].get(b) ?? 0) + w);
  }
}
const skinI = new Uint8Array(NV * 4);
const skinW = new Uint8Array(NV * 4);
acc.forEach((m, i) => {
  const top = [...m].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const tot = top.reduce((s, [, w]) => s + w, 0) || 1;
  if (!top.length) top.push([B.Head, 1]);
  top.forEach(([b, w], k) => {
    skinI[i * 4 + k] = b;
    skinW[i * 4 + k] = Math.round((w / tot) * 255);
  });
});

// Joint landmarks our bones are fitted to: each is the mean of a set of vertices.
const J = (name: string) => joints[`${name}____head`] ?? joints[name];
const jointOf = (bone: string, end: 'head' | 'tail') => (joints[`${bone}____${end}`] ?? []).map((v) => cIdx.get(v)!);
const LAND: Record<string, number[]> = {};
const want: [string, string, 'head' | 'tail'][] = [
  ['Hips', 'spine05', 'head'], ['Spine', 'spine04', 'head'], ['Spine1', 'spine03', 'head'], ['Spine2', 'spine02', 'head'],
  ['Neck', 'neck01', 'head'], ['Head', 'head', 'head'], ['HeadTop', 'head', 'tail'],
];
for (const s of ['L', 'R']) {
  const S = s === 'L' ? 'Left' : 'Right';
  want.push(
    [`${S}Shoulder`, `clavicle.${s}`, 'head'], [`${S}Arm`, `upperarm01.${s}`, 'head'], [`${S}ForeArm`, `lowerarm01.${s}`, 'head'],
    [`${S}Hand`, `wrist.${s}`, 'head'], [`${S}HandTip`, `finger3-3.${s}`, 'tail'],
    [`${S}UpLeg`, `upperleg01.${s}`, 'head'], [`${S}Leg`, `lowerleg01.${s}`, 'head'], [`${S}Foot`, `foot.${s}`, 'head'],
    [`${S}ToeBase`, `toe3-1.${s}`, 'head'], [`${S}ToeTip`, `toe3-3.${s}`, 'tail'],
  );
}
for (const [k, bone, end] of want) {
  const l = jointOf(bone, end);
  if (!l.length || l.some((x) => x === undefined)) throw new Error(`joint ${bone} ${end}`);
  LAND[k] = l;
}
void J;

// ---------- Render mesh ----------

// Split vertices on UV seams; each render vertex points back at its shape vertex.
const rKey = new Map<string, number>();
const rv: number[] = [];
const ruv: number[] = [];
const tri: number[] = [];
for (const f of groups.body) {
  const ids = f.map(([v, t]) => {
    const k = `${v}/${t}`;
    let r = rKey.get(k);
    if (r === undefined) {
      r = rv.length;
      rKey.set(k, r);
      rv.push(cIdx.get(v)!);
      ruv.push(T[t][0], T[t][1]);
    }
    return r;
  });
  for (let i = 1; i < ids.length - 1; i++) tri.push(ids[0], ids[i], ids[i + 1]);
}
const lash: number[] = [];
for (const gr of ['helper-l-eyelashes-1', 'helper-l-eyelashes-2', 'helper-r-eyelashes-1', 'helper-r-eyelashes-2']) {
  for (const f of groups[gr]) {
    const ids = f.map(([v]) => cIdx.get(v)!);
    for (let i = 1; i < ids.length - 1; i++) lash.push(ids[0], ids[i], ids[i + 1]);
  }
}
const eyeVerts = (gr: string) => [...new Set(groups[gr].flatMap((f) => f.map(([v]) => cIdx.get(v)!)))];

const out = {
  license: 'Derived from the MakeHuman base mesh, targets and default skeleton weights (CC0 1.0, makehumancommunity.org).',
  nv: NV,
  pos: b64(P),
  render: { v: b64(new Uint16Array(rv)), uv: b64(new Float32Array(ruv)), tri: b64(new Uint16Array(tri)) },
  lash: b64(new Uint16Array(lash)),
  eyes: { l: eyeVerts('helper-l-eye'), r: eyeVerts('helper-r-eye') },
  skinI: b64(skinI),
  skinW: b64(skinW),
  land: LAND,
  masks,
  targets,
};
fs.mkdirSync('public/character', { recursive: true });
const json = JSON.stringify(out);
fs.writeFileSync('public/character/body.json', json);
console.log(`verts ${NV}, render ${rv.length}, tris ${tri.length / 3}, targets ${Object.keys(targets).length}, ${(json.length / 1024).toFixed(0)} KB`);
