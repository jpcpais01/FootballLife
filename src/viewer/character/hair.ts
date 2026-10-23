// Hair and beards with real volume: stacked shells grown out of the scalp,
// each cut by a strand texture so the hair thins to loose strands toward its
// surface (one draw call, opaque, alpha-tested). Strands radiate from each
// style's whorl or part, so they comb the way the style does. Long styles add
// a hanging curtain; buns, ponytails, dreads and twists add their own shapes.
// Everything is built in bind space around the fitted head, then rides on the
// Head bone.
import * as THREE from 'three';
import type { Appearance } from '../../../shared/appearance.ts';
import { A, baseLand, type BodyBuild } from './body.ts';
import { hash3, mixN, rng, smooth, vnoise } from './noise.ts';
import type { RGB } from './paint.ts';
import { BEARD, SCALP, beardCover, scalpCover } from './styles.ts';

type Tex = 'straight' | 'wavy' | 'curly' | 'coily';
type V3 = [number, number, number];

interface Style {
  /** Where strands radiate from (head-space direction). */
  whorl: V3;
  /** Thickness on top and at the sides (head units). */
  top: number;
  side: number;
  /** Extra height at the front top (a quiff), or a flat top this far above the crown. */
  lift?: number;
  flat?: number;
  /** A rounded outline: an ellipsoid [centre y, radius x, y, z] the hair fills out to. */
  round?: [number, number, number, number];
  spikes?: number;
  /** Cornrow ridges. */
  rows?: boolean;
  tex: Tex;
  /** Hanging hair: around which part of the head, down to where. */
  hang?: 'long' | 'mullet';
  fringe?: boolean;
  extra?: 'bun' | 'manbun' | 'ponytail' | 'dreads' | 'twists';
}

const CROWN: V3 = [0, 0.72, -0.7];
const FRONT: V3 = [0, 0.75, 0.66];
const PART: V3 = [0.42, 0.88, 0.22];

/** In the order of HAIR_STYLES. Null: no modelled hair (painted only). */
const STYLES: (Style | null)[] = [
  { whorl: CROWN, top: 0.005, side: 0.004, tex: 'coily' }, // buzz
  { whorl: CROWN, top: 0.024, side: 0.012, tex: 'straight' }, // short
  { whorl: CROWN, top: 0.02, side: 0.006, tex: 'straight', fringe: true }, // crop
  { whorl: CROWN, top: 0.024, side: 0.006, lift: 0.045, tex: 'straight' }, // quiff
  { whorl: CROWN, top: 0.04, side: 0.03, tex: 'curly' }, // curls
  { whorl: CROWN, top: 0.03, side: 0.03, round: [0.04, 0.18, 0.23, 0.21], tex: 'coily' }, // afro
  { whorl: PART, top: 0.024, side: 0.02, tex: 'wavy', hang: 'long' }, // long
  { whorl: FRONT, top: 0.012, side: 0.01, tex: 'straight', extra: 'bun' }, // bun
  { whorl: FRONT, top: 0.055, side: 0.004, tex: 'straight' }, // mohawk
  null, // bald
  { whorl: CROWN, top: 0.022, side: 0.002, tex: 'straight' }, // fade
  { whorl: FRONT, top: 0.018, side: 0.012, tex: 'straight' }, // slick back
  { whorl: PART, top: 0.022, side: 0.012, tex: 'straight' }, // side part
  { whorl: CROWN, top: 0.026, side: 0.016, tex: 'straight', fringe: true }, // fringe
  { whorl: CROWN, top: 0.034, side: 0.01, spikes: 1, tex: 'straight' }, // spiky
  { whorl: CROWN, top: 0.005, side: 0.004, tex: 'coily' }, // waves
  { whorl: CROWN, top: 0.012, side: 0.01, tex: 'coily', extra: 'dreads' }, // dreads
  { whorl: FRONT, top: 0.008, side: 0.008, rows: true, tex: 'straight' }, // cornrows
  { whorl: FRONT, top: 0.014, side: 0.004, tex: 'straight', extra: 'manbun' }, // man bun
  { whorl: CROWN, top: 0.022, side: 0.014, tex: 'wavy', hang: 'mullet' }, // mullet
  { whorl: FRONT, top: 0.034, side: 0.0015, tex: 'straight' }, // undercut
  { whorl: CROWN, top: 0.012, side: 0.01, tex: 'coily', extra: 'twists' }, // twists
  { whorl: FRONT, top: 0.012, side: 0.01, tex: 'straight', extra: 'ponytail' }, // ponytail
  { whorl: CROWN, top: 0.03, side: 0.006, flat: 0.075, tex: 'coily' }, // high top
];

// ---------- Strand textures ----------

const texCache = new Map<Tex, THREE.DataTexture>();
/** Grey strand shading in RGB, strand length (0..1) in alpha; tiles both ways. */
function strandTexture(kind: Tex) {
  let t = texCache.get(kind);
  if (t) return t;
  const W = 256, H = 128;
  const d = new Uint8Array(W * H * 4);
  const r = rng(kind.length * 977);
  // Each column of texels is a strand with its own length and tone.
  const len = Array.from({ length: W }, () => 0.25 + r() * 0.75);
  const tone = Array.from({ length: W }, () => 0.86 + r() * 0.26);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const v = j / H;
    let a: number, g: number;
    if (kind === 'curly' || kind === 'coily') {
      // Clumps of tight curls: blobs that loop round, brighter on their crests.
      // Round clumps that tile: tall in the middle, so the outer shells make bumpy curls.
      const f = kind === 'coily' ? 8 : 5;
      const fu = (i / W) * f, fv = v * f;
      let best = 9;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const cu = Math.floor(fu) + di, cv = Math.floor(fv) + dj;
        const h = (q: number) => ((q % f) + f) % f;
        const px = cu + 0.2 + 0.6 * hash3(h(cu), h(cv), 1), py = cv + 0.2 + 0.6 * hash3(h(cu), h(cv), 2);
        best = Math.min(best, Math.hypot(fu - px, fv - py));
      }
      const fine = vnoise((i / W) * f * 12, v * f * 12, 9);
      const dome = 1 - smooth(0.0, 0.75, best);
      // Mostly solid, so the hair reads as a mass; only the outer shells break into curls.
      a = Math.min(1, 0.6 + dome * 0.4 + (fine - 0.5) * 0.12);
      g = 0.7 + dome * 0.4 + (fine - 0.5) * 0.3;
    } else {
      // Strands, wavering a little (more for wavy hair), in clumps of similar length.
      const wave = kind === 'wavy' ? Math.sin(v * Math.PI * 8 + i * 0.05) * 2.5 : Math.sin(v * Math.PI * 2 + i * 0.3) * 0.8;
      const c = (i + Math.round(wave) + W) % W;
      const clump = vnoise((c / W) * 40, v * 3, 1);
      // Roughly uniform lengths, so the hair thins evenly from root to surface, in tufts.
      a = Math.min(1, len[c] * 0.65 + clump * 0.4);
      g = tone[c] * (0.9 + clump * 0.2);
    }
    const o = (j * W + i) * 4;
    const gs = Math.max(0, Math.min(255, Math.round((g / 1.25) * 255)));
    d[o] = d[o + 1] = d[o + 2] = gs;
    d[o + 3] = Math.max(0, Math.min(255, Math.round(a * 255)));
  }
  t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  texCache.set(kind, t);
  return t;
}

const matCache = new Map<string, THREE.MeshPhysicalMaterial>();
/** Hair material: shells cut by the strand alpha (`shell` >= 0), solid shapes (`shell` < 0). */
export function hairMaterial(color: RGB, kind: Tex, matte = false) {
  const key = `${color.join(',')}|${kind}|${matte}`;
  let m = matCache.get(key);
  if (m) return m;
  // The texture's grey runs up to 1.25x; keep the base colour so the average reads true.
  const c = new THREE.Color().setRGB(color[0] * 1.05, color[1] * 1.05, color[2] * 1.05);
  m = new THREE.MeshPhysicalMaterial({
    color: c,
    map: strandTexture(kind),
    roughness: matte ? 0.78 : kind === 'coily' ? 0.62 : 0.42,
    anisotropy: matte ? 0.2 : kind === 'coily' ? 0.3 : 0.75,
    sheen: 0.4,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color().setRGB(color[0] * 0.9 + 0.02, color[1] * 0.9 + 0.02, color[2] * 0.9 + 0.02),
    specularIntensity: matte ? 0.35 : 0.6,
    side: THREE.DoubleSide,
    alphaToCoverage: true,
  });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float shell;\nvarying float vShell;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShell = shell;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShell;')
      .replace(
        '#include <alphatest_fragment>',
        // Each shell keeps only the strands long enough to reach it; inner shells sit in the hair's own shadow.
        // With multisampling the cut is softened into coverage, so strand edges don't stair-step.
        'if ( vShell >= 0.0 ) {\n\tfloat th = vShell * 0.9 + 0.04;\n\tfloat cov = smoothstep( th - 0.05, th + 0.05, diffuseColor.a );\n\tif ( cov < 0.02 ) discard;\n\tdiffuseColor.rgb *= mix( 0.38, 1.0, vShell );\n\tdiffuseColor.a = cov;\n} else diffuseColor.a = 1.0;',
      );
  };
  m.customProgramCacheKey = () => 'hair-shells';
  matCache.set(key, m);
  return m;
}

// ---------- The skull ----------

const NU = 72, NV = 36;

/** Radius of the head surface by direction from the head centre (head units), ears left out. */
function skullMap(body: BodyBuild, kc: number) {
  const R = new Float32Array(NU * NV);
  const p = body.geometry.attributes.position.array as Float32Array;
  const at = body.paint.attr;
  const K = body.paint.k;
  const c = body.headC;
  const n = p.length / 3;
  for (let i = 0; i < n; i++) {
    if (at[i * K + A.head] < 0.5 || at[i * K + A.ear] > 0.25) continue;
    const x = (p[i * 3] - c.x) * kc, y = (p[i * 3 + 1] - c.y) * kc, z = (p[i * 3 + 2] - c.z) * kc;
    const l = Math.hypot(x, y, z);
    const k = bin(x / l, y / l, z / l);
    if (l > R[k]) R[k] = l;
  }
  // Fill empty bins from their neighbours, then close small dips.
  for (let pass = 0; pass < 40; pass++) {
    let empty = 0;
    const next = R.slice();
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
      const k = j * NU + i;
      if (R[k]) continue;
      let s = 0, m = 0;
      for (const [di, dj] of NB4) {
        const jj = j + dj;
        if (jj < 0 || jj >= NV) continue;
        const v = R[jj * NU + ((i + di + NU) % NU)];
        if (v) {
          s += v;
          m++;
        }
      }
      if (m) next[k] = s / m;
      else empty++;
    }
    R.set(next);
    if (!empty) break;
  }
  const S = R.slice();
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    let s = 0, m = 0;
    for (const [di, dj] of NB4) {
      const jj = j + dj;
      if (jj < 0 || jj >= NV) continue;
      s += R[jj * NU + ((i + di + NU) % NU)];
      m++;
    }
    S[j * NU + i] = Math.max(R[j * NU + i], s / m);
  }
  return (x: number, y: number, z: number) => {
    const fu = ((Math.atan2(x, z) + Math.PI) / (2 * Math.PI)) * NU - 0.5;
    const fv = ((Math.asin(Math.max(-1, Math.min(1, y))) + Math.PI / 2) / Math.PI) * NV - 0.5;
    const i0 = Math.floor(fu), j0 = Math.max(0, Math.min(NV - 2, Math.floor(fv)));
    const a = fu - i0, b = Math.max(0, Math.min(1, fv - j0));
    const g = (i: number, j: number) => S[j * NU + ((i + NU) % NU)];
    return (g(i0, j0) * (1 - a) + g(i0 + 1, j0) * a) * (1 - b) + (g(i0, j0 + 1) * (1 - a) + g(i0 + 1, j0 + 1) * a) * b;
  };
}
const NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function bin(x: number, y: number, z: number) {
  const i = Math.min(NU - 1, Math.floor(((Math.atan2(x, z) + Math.PI) / (2 * Math.PI)) * NU));
  const j = Math.min(NV - 1, Math.max(0, Math.floor(((Math.asin(Math.max(-1, Math.min(1, y))) + Math.PI / 2) / Math.PI) * NV)));
  return j * NU + i;
}

// ---------- Geometry helpers ----------

class Mesh {
  pos: number[] = [];
  uv: number[] = [];
  shell: number[] = [];
  idx: number[] = [];
  get n() {
    return this.pos.length / 3;
  }
  v(p: V3, u: number, v: number, s: number) {
    return this.vx(p[0], p[1], p[2], u, v, s);
  }
  vx(x: number, y: number, z: number, u: number, v: number, s: number) {
    this.pos.push(x, y, z);
    this.uv.push(u, v);
    this.shell.push(s);
    return this.n - 1;
  }
  quad(a: number, b: number, c: number, d: number) {
    this.idx.push(a, b, c, a, c, d);
  }
}

/** A tube along a path (head units), tapering from r0 to r1; strand UVs run along it. */
function tube(m: Mesh, path: V3[], r0: number, r1: number, segs: number, twist = 0) {
  const base = m.n;
  const up = new THREE.Vector3();
  const t = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let len = 0;
  for (let i = 0; i < path.length; i++) {
    const p = new THREE.Vector3(...path[i]);
    const q = new THREE.Vector3(...path[Math.min(path.length - 1, i + 1)]);
    const o = new THREE.Vector3(...path[Math.max(0, i - 1)]);
    t.subVectors(q, o).normalize();
    up.set(0, 1, 0);
    if (Math.abs(t.y) > 0.9) up.set(1, 0, 0);
    a.crossVectors(t, up).normalize();
    b.crossVectors(t, a).normalize();
    if (i) len += p.distanceTo(new THREE.Vector3(...path[i - 1]));
    const f = i / (path.length - 1);
    const r = mixN(r0, r1, f);
    for (let k = 0; k <= segs; k++) {
      const ang = (k / segs) * Math.PI * 2 + f * twist;
      const x = p.x + (a.x * Math.cos(ang) + b.x * Math.sin(ang)) * r;
      const y = p.y + (a.y * Math.cos(ang) + b.y * Math.sin(ang)) * r;
      const z = p.z + (a.z * Math.cos(ang) + b.z * Math.sin(ang)) * r;
      m.v([x, y, z], k / segs + f * twist * 0.2, len * 18, -1);
    }
  }
  for (let i = 0; i < path.length - 1; i++) for (let k = 0; k < segs; k++) {
    const p0 = base + i * (segs + 1) + k;
    const p1 = p0 + segs + 1;
    m.quad(p0, p1, p1 + 1, p0 + 1);
  }
}

/** A squashed, slightly lumpy ball (a bun). */
function ball(m: Mesh, c: V3, r: number, squash: number, segs: number, seed: number) {
  const base = m.n;
  const rows = Math.max(6, segs >> 1);
  for (let j = 0; j <= rows; j++) {
    const th = (j / rows) * Math.PI;
    for (let k = 0; k <= segs; k++) {
      const ph = (k / segs) * Math.PI * 2;
      const lump = 1 + (vnoise(Math.cos(ph) * 2 + seed, Math.sin(ph) * 2, th * 2) - 0.5) * 0.25;
      const s = Math.sin(th) * r * lump;
      m.v([c[0] + Math.cos(ph) * s, c[1] + Math.cos(th) * r * squash * lump, c[2] + Math.sin(ph) * s], (k / segs) * 3 + th * 0.4, th * 2.5, -1);
    }
  }
  for (let j = 0; j < rows; j++) for (let k = 0; k < segs; k++) {
    const a = base + j * (segs + 1) + k;
    const b = a + segs + 1;
    m.quad(a, b, b + 1, a + 1);
  }
}

// ---------- Build ----------

export interface HairKit {
  band: string | null;
  earring: boolean;
}

/** Hair, beard volume and head accessories for a look, in bind space. */
export function buildHair(a: Appearance, body: BodyBuild, hair: RGB, kit: HairKit, hi: boolean): THREE.Mesh[] {
  const L = baseLand();
  const kc = L.crown / body.land.crown;
  const C = body.headC;
  const R = skullMap(body, kc);
  const toBind = (m: Mesh) => {
    for (let i = 0; i < m.pos.length; i += 3) {
      m.pos[i] = m.pos[i] / kc + C.x;
      m.pos[i + 1] = m.pos[i + 1] / kc + C.y;
      m.pos[i + 2] = m.pos[i + 2] / kc + C.z;
    }
  };
  const out: THREE.Mesh[] = [];
  const st = STYLES[a.hair] ?? null;
  const spec = SCALP[a.hair] ?? SCALP[0];
  const seed = a.hair * 31 + a.hairColor * 7;
  const nShell = hi ? 14 : 6;

  const thick = (x: number, y: number, z: number, cov: number, s: Style, ga: number, gr: number) => {
    const sideK = smooth(0.075, 0.0, y);
    let t = mixN(s.top, s.side, sideK);
    if (s.lift) t += s.lift * smooth(-0.02, 0.09, z) * smooth(0.04, 0.11, y) * (1 - sideK);
    const l = Math.hypot(x, y, z) || 1;
    if (s.flat) {
      // A cylinder with a flat top: grow out along the strand until either face is reached.
      const h = Math.hypot(x, z);
      const tTop = (L.crown + s.flat - y) / Math.max(0.08, y / l);
      const tSide = (0.118 - h) / Math.max(0.08, h / l);
      t = Math.max(t, Math.max(0, Math.min(tTop, tSide)) * smooth(0.0, 0.07, y));
    }
    if (s.round) {
      // Out to the ellipsoid along the line from its centre, pulled in toward the ears and nape.
      const [cy, rx, ry, rz] = s.round;
      const dx = x, dy = y - cy, dz = z + 0.015;
      const q = Math.hypot(dx / rx, dy / ry, dz / rz) || 1;
      t = Math.max(t, Math.max(0, 1 / q - 1) * Math.hypot(dx, dy, dz) * smooth(-0.07, 0.03, y));
    }
    if (s.spikes) {
      // Cones: each cell of the grid a spike, peaking at its centre.
      const fu = ga * 9, fv = gr * 9;
      const cu = Math.floor(fu), cv = Math.floor(fv);
      const d = Math.hypot(fu - cu - 0.5, fv - cv - 0.5) * 2;
      t *= 0.5 + (1 - smooth(0, 1, d)) * (0.6 + hash3(cu, cv, 3) * 0.9);
    }
    if (s.rows) t *= 0.25 + 0.75 * (0.5 + 0.5 * Math.cos(Math.atan2(x, z) * 15));
    return t * cov;
  };

  if (st) {
    const m = new Mesh();
    // ---- The cap: shells over the scalp on a polar grid around the whorl ----
    const W = new THREE.Vector3(...st.whorl).normalize();
    const e1 = new THREE.Vector3().crossVectors(W, Math.abs(W.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0)).normalize();
    const e2 = new THREE.Vector3().crossVectors(W, e1);
    const NA = hi ? 100 : 48, NR = hi ? 54 : 26;
    const RHO = 2.6;
    const d = new THREE.Vector3();
    const grid: { s: V3; dir: V3; t: number; c: number }[] = [];
    let any = false;
    for (let j = 0; j <= NR; j++) {
      const rho = 0.02 + (j / NR) * RHO;
      for (let i = 0; i <= NA; i++) {
        const al = (i / NA) * Math.PI * 2;
        d.copy(W).multiplyScalar(Math.cos(rho)).addScaledVector(e1, Math.sin(rho) * Math.cos(al)).addScaledVector(e2, Math.sin(rho) * Math.sin(al));
        const r = R(d.x, d.y, d.z);
        const x = d.x * r, y = d.y * r, z = d.z * r;
        const jit = (vnoise(Math.atan2(x, z) * 30 + seed, y * 120, 1) - 0.5) * 2;
        let cov = scalpCover(x, y, z, spec, jit);
        if (st.fringe) {
          // Strands over the forehead ending in an uneven line above the brows.
          const end = L.eyeY + 0.05 + Math.abs(x) * 0.25 + (vnoise(x * 90 + seed, 1, 2) - 0.5) * 0.014;
          cov = Math.max(cov, smooth(0.075, 0.05, Math.abs(x)) * smooth(end - 0.004, end + 0.02, y) * smooth(0.02, 0.06, z));
        }
        grid.push({ s: [x, y, z], dir: [d.x, d.y, d.z], t: thick(x, y, z, 1, st, i / NA, j / NR), c: cov });
      }
    }
    // Hair thins toward its edge: thickness follows the coverage a little way further out
    // (rows run away from the whorl), so the hairline slopes instead of ending in a wall.
    const TAPER = hi ? 6 : 3;
    for (let j = 0; j <= NR; j++) for (let i = 0; i <= NA; i++) {
      let c = 0;
      for (let k = 0; k <= TAPER; k++) c += grid[Math.min(NR, j + k) * (NA + 1) + i].c;
      const g = grid[j * (NA + 1) + i];
      g.t *= smooth(0.05, 0.9, c / (TAPER + 1)) * smooth(0.02, 0.3, g.c);
      if (g.t > 0.0006) any = true;
    }
    if (any) {
      const tilesU = hi ? 10 : 8;
      // Only the grid points some haired quad uses get vertices (bare scalp gets none).
      const hasHair = (k: number) => Math.max(grid[k].t, grid[k + 1].t, grid[k + NA + 1].t, grid[k + NA + 2].t) >= 0.0006;
      const slot = new Int32Array(grid.length).fill(-1);
      const pts: number[] = [];
      for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) {
        const k = j * (NA + 1) + i;
        if (!hasHair(k)) continue;
        for (const c of [k, k + 1, k + NA + 1, k + NA + 2]) if (slot[c] < 0) slot[c] = pts.push(c) - 1;
      }
      for (let sh = 0; sh < nShell; sh++) {
        const f = sh / (nShell - 1);
        const base = m.n;
        for (const k of pts) {
          const g = grid[k];
          const off = 0.0012 + g.t * f;
          m.vx(g.s[0] + g.dir[0] * off, g.s[1] + g.dir[1] * off, g.s[2] + g.dir[2] * off, ((k % (NA + 1)) / NA) * tilesU, (Math.floor(k / (NA + 1)) / NR) * RHO * 2.2, f);
        }
        for (let j = 0; j < NR; j++) for (let i = 0; i < NA; i++) {
          const k = j * (NA + 1) + i;
          if (!hasHair(k)) continue;
          m.quad(base + slot[k], base + slot[k + NA + 1], base + slot[k + NA + 2], base + slot[k + 1]);
        }
      }
    }

    // ---- Hanging hair: a curtain from above the ears down past the jaw ----
    if (st.hang) {
      const long = st.hang === 'long';
      const th0 = long ? 1.2 : 2.0;
      // It starts high, under the cap, so the cap hides where it joins.
      const yTop = long ? 0.085 : L.earY + 0.02;
      const NT = hi ? 72 : 28, NY = hi ? 26 : 10;
      const cols: { p: V3; n: V3; e: number }[][] = [];
      for (let i = 0; i <= NT; i++) {
        const th = th0 + (i / NT) * (Math.PI * 2 - 2 * th0);
        const sx = Math.sin(th), sz = Math.cos(th);
        // Longest at the back, in a soft V, with uneven ends.
        const back = 1 - Math.abs(th - Math.PI) / (Math.PI - th0);
        const yEnd = (long ? L.chinY - 0.05 - back * 0.1 : L.chinY - 0.03 - back * 0.03) + (vnoise(th * 6 + seed, 3, 1) - 0.5) * 0.035;
        const over = mixN(st.top, st.side, 0.7) * 0.6 + 0.003;
        // Its side edges thin out to loose strands.
        const e = smooth(0.25, 0, back);
        const col: { p: V3; n: V3; e: number }[] = [];
        // It drapes over the skull, never moving back in once past its widest point.
        let wide = 0;
        for (let j = 0; j <= NY; j++) {
          const f = j / NY;
          const y = mixN(yTop, yEnd, f);
          if (y > L.chinY + 0.02) {
            const s = surf2(R, sx, y, sz);
            wide = Math.max(wide, Math.hypot(s[0], s[2]));
          }
          // Flaring a little and tucking in at the very ends.
          const flare = wide + over + f * 0.012 - f * f * 0.008;
          col.push({ p: [sx * flare, y, sz * flare], n: [sx, 0, sz], e });
        }
        cols.push(col);
      }
      const layers = hi ? 8 : 4;
      const depth = long ? 0.03 : 0.018;
      for (let sh = 0; sh < layers; sh++) {
        const f = sh / (layers - 1);
        const base = m.n;
        for (let i = 0; i <= NT; i++) for (let j = 0; j <= NY; j++) {
          const c = cols[i][j];
          // The ends thin out: the tips are only the longest strands.
          const tip = smooth(0.7, 1, j / NY);
          const off = -depth * 0.5 + depth * f * (1 - tip * 0.5);
          m.v([c.p[0] + c.n[0] * off, c.p[1], c.p[2] + c.n[2] * off], (i / NT) * (long ? 9 : 5), (j / NY) * 3.2 + 0.3, Math.max(f, tip * 0.85, c.e * 0.8));
        }
        for (let i = 0; i < NT; i++) for (let j = 0; j < NY; j++) {
          const k = base + i * (NY + 1) + j;
          m.quad(k, k + 1, k + NY + 2, k + NY + 1);
        }
      }
    }

    // ---- Shapes ----
    const r = rng(seed + 5);
    const surf = (dx: number, dy: number, dz: number, extra = 0): V3 => {
      d.set(dx, dy, dz).normalize();
      const rr = R(d.x, d.y, d.z) + extra;
      return [d.x * rr, d.y * rr, d.z * rr];
    };
    // Locks are rope, not curls: they get an even strand texture of their own.
    const locks = new Mesh();
    switch (st.extra) {
      case 'bun':
      case 'manbun': {
        const at = st.extra === 'bun' ? surf(0, 0.45, -0.89, 0.035) : surf(0, 0.86, -0.5, 0.03);
        ball(m, at, 0.042, 0.82, hi ? 20 : 10, seed);
        break;
      }
      case 'ponytail': {
        const root = surf(0, 0.12, -1, 0.012);
        const path: V3[] = [];
        for (let i = 0; i <= 10; i++) {
          const f = i / 10;
          path.push([Math.sin(f * 2) * 0.006, root[1] - f * 0.22 + (1 - f) * (1 - f) * 0.02, root[2] - 0.02 - Math.sin(f * 1.6) * 0.04]);
        }
        tube(m, path, 0.022, 0.006, hi ? 12 : 6, 2);
        ball(m, root, 0.016, 0.9, 8, seed);
        break;
      }
      case 'dreads':
      case 'twists': {
        const dreads = st.extra === 'dreads';
        const n = dreads ? (hi ? 46 : 26) : hi ? 110 : 56;
        for (let k = 0; k < n * 3 && n > 0; k++) {
          // Roots spread over the covered scalp (a golden-angle spiral).
          const yy = 1 - ((k + 0.5) / (n * 3)) * 1.6;
          const rad = Math.sqrt(Math.max(0, 1 - yy * yy));
          const ph = k * 2.39996 + r() * 0.2;
          const root = surf(Math.sin(ph) * rad, yy, Math.cos(ph) * rad, 0.004);
          if (scalpCover(root[0], root[1], root[2], spec) < 0.6) continue;
          const path: V3[] = [];
          const len = dreads ? 0.17 + r() * 0.09 : 0.026 + r() * 0.014;
          const o = new THREE.Vector3(...root);
          const nrm = o.clone().normalize();
          let dir = nrm.clone();
          // Dreads leave the scalp along it, combed down (and back and aside at the front), then fall.
          const front = smooth(0.0, 0.06, o.z);
          const pull = new THREE.Vector3(o.x + front * (Math.sign(o.x) * 0.9 + o.x * 4), -1, mixN(o.z, -0.7, front)).normalize();
          if (dreads) {
            dir = pull.clone().addScaledVector(nrm, -pull.dot(nrm));
            if (dir.lengthSq() < 1e-4) dir.set(Math.sin(ph), 0, Math.cos(ph));
            dir.normalize().addScaledVector(nrm, 0.15).normalize();
          } else dir.addScaledVector(pull.clone().addScaledVector(nrm, -pull.dot(nrm)), 0.8).normalize();
          const steps = dreads ? 12 : 4;
          for (let i = 0; i <= steps; i++) {
            path.push([o.x, o.y, o.z]);
            if (dreads) dir.lerp(pull, 0.14).normalize();
            o.addScaledVector(dir, len / steps);
            const hx = Math.hypot(o.x, o.z);
            const need = R(o.x / (o.length() || 1), Math.max(-1, Math.min(1, o.y / (o.length() || 1))), o.z / (o.length() || 1)) * 1.02 + (dreads ? 0.011 : 0.006);
            if (o.y > L.chinY && o.length() < need && hx > 1e-4) {
              const k2 = need / o.length();
              o.multiplyScalar(k2);
            }
          }
          if (dreads) tube(locks, path, 0.0085, 0.006, hi ? 7 : 4, 4);
          // A twist is a short rope of coils.
          else for (let i = 0; i < path.length - 1; i++) ball(locks, path[i], 0.0105 - i * 0.0012, 1.1, hi ? 7 : 5, seed + k * 3 + i);
        }
        break;
      }
    }
    if (m.idx.length) {
      toBind(m);
      out.push(finish(m, hairMaterial(hair, st.tex)));
    }
    if (locks.idx.length) {
      toBind(locks);
      out.push(finish(locks, hairMaterial(hair, 'wavy', true)));
    }
  }

  // ---- Beard volume ----
  const bs = BEARD[a.beard] ?? BEARD[0];
  if (bs.volume > 0) {
    const m = new Mesh();
    const p = body.geometry.attributes.position.array as Float32Array;
    const nr = body.geometry.attributes.normal.array as Float32Array;
    const at = body.paint.attr;
    const K = body.paint.k;
    const tri = body.paint.headTri;
    const cover = new Map<number, number>();
    const cov = (i: number) => {
      let c = cover.get(i);
      if (c === undefined) {
        const b = i * K;
        const lips = Math.max(at[b + A.lipU], at[b + A.lipL]);
        c = beardCover(at[b], at[b + 1], at[b + 2], bs, L) * smooth(0.6, 0.2, lips);
        cover.set(i, c);
      }
      return c;
    };
    const keep: number[] = [];
    for (let t = 0; t < tri.length; t += 3) if (Math.max(cov(tri[t]), cov(tri[t + 1]), cov(tri[t + 2])) > 0.05) keep.push(tri[t], tri[t + 1], tri[t + 2]);
    const verts = [...new Set(keep)];
    const local = new Map(verts.map((v, i) => [v, i]));
    const layers = hi ? 9 : 4;
    for (let sh = 0; sh < layers; sh++) {
      const f = sh / (layers - 1);
      const base = m.n;
      for (const v of verts) {
        const c = cov(v);
        const y = at[v * K + 1];
        // Thicker over the chin; a long beard grows down past it.
        let t = bs.volume * 0.011 * smooth(0.1, 0.7, c);
        t += bs.volume * bs.volume * 0.05 * smooth(L.chinY + 0.04, L.chinY - 0.01, y) * smooth(0.1, 0.7, c);
        const off = 0.0006 + t * f;
        m.v([p[v * 3] + nr[v * 3] * off / kc, p[v * 3 + 1] + nr[v * 3 + 1] * off / kc - (bs.volume > 0.8 ? t * f * 0.6 / kc : 0), p[v * 3 + 2] + nr[v * 3 + 2] * off / kc], at[v * K] * 6, -y * 9, f);
      }
      for (let t = 0; t < keep.length; t += 3) m.idx.push(base + local.get(keep[t])!, base + local.get(keep[t + 1])!, base + local.get(keep[t + 2])!);
    }
    out.push(finish(m, hairMaterial([hair[0] * 0.85, hair[1] * 0.85, hair[2] * 0.85], 'wavy')));
  }

  // ---- Headband and earring ----
  if (kit.band) {
    const m = new Mesh();
    const segs = hi ? 64 : 28;
    const capT = st ? (x: number, y: number, z: number) => thick(x, y, z, scalpCover(x, y, z, spec), st, 0, 0) : () => 0;
    const ring = (dy: number, out2: number): V3[] => {
      const pts: V3[] = [];
      for (let k = 0; k <= segs; k++) {
        const th = (k / segs) * Math.PI * 2;
        // Across the forehead, rising a little toward the back.
        const y = 0.062 + dy + (1 - Math.cos(th)) * 0.012;
        const s = surf2(R, Math.sin(th), y, Math.cos(th));
        const t = capT(s[0], s[1], s[2]) * 0.5 + 0.004 + out2;
        const l = Math.hypot(s[0], s[2]);
        pts.push([s[0] + (s[0] / l) * t, s[1], s[2] + (s[2] / l) * t]);
      }
      return pts;
    };
    const rows = [ring(-0.012, 0), ring(-0.01, 0.003), ring(0.01, 0.003), ring(0.012, 0)];
    for (let k = 0; k <= segs; k++) rows.forEach((row, j) => m.v(row[k], k / segs, j / 3, -1));
    for (let k = 0; k < segs; k++) for (let j = 0; j < 3; j++) m.quad(k * 4 + j, (k + 1) * 4 + j, (k + 1) * 4 + j + 1, k * 4 + j + 1);
    toBind(m);
    out.push(finish(m, bandMaterial(kit.band)));
  }
  if (kit.earring) {
    const g = new THREE.TorusGeometry(0.0085, 0.0022, 8, 18).rotateY(Math.PI / 2);
    const lobe = body.land;
    g.translate(C.x + lobe.earX * 1.02, C.y + lobe.earY - 0.038 / kc, C.z + lobe.earZ + 0.008 / kc);
    out.push(new THREE.Mesh(g, GOLD));
  }
  return out;
}

/** Surface point at height `y` (head units) in a horizontal direction. */
function surf2(R: (x: number, y: number, z: number) => number, sx: number, y: number, sz: number): V3 {
  // Solve for the elevation whose surface point sits at height y.
  let el = 0.5;
  for (let i = 0; i < 8; i++) {
    const c = Math.cos(el), s = Math.sin(el);
    const r = R(sx * c, s, sz * c);
    el = Math.asin(Math.max(-1, Math.min(1, y / r)));
  }
  const c = Math.cos(el), s = Math.sin(el);
  const r = R(sx * c, s, sz * c);
  return [sx * c * r, s * r, sz * c * r];
}

function finish(m: Mesh, mat: THREE.Material) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(m.pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(m.uv, 2));
  g.setAttribute('shell', new THREE.Float32BufferAttribute(m.shell, 1));
  g.setIndex(m.idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

const bandMats = new Map<string, THREE.MeshStandardMaterial>();
function bandMaterial(c: string) {
  let m = bandMats.get(c);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.75, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffffff) });
    bandMats.set(c, m);
  }
  return m;
}
const GOLD = new THREE.MeshStandardMaterial({ color: 0xffcf3d, roughness: 0.22, metalness: 1 });
