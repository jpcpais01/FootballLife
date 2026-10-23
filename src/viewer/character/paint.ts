// Paints the head's skin texture: every texel is painted from the surface
// point it shows, in the base mesh's head space, so features stay on the
// face whatever the sliders do. Skin tone with natural variation and baked
// creases, lips, lash lines, brows hair by hair, stubble and beard shadow,
// the scalp under the hair, and marks. A second texture carries the fine bump
// (pores, stubble, brow hairs) in red and roughness in green.
import { A, INNER_EYE_V, INNER_V, type FaceLand } from './body.ts';
import { dilate, rasterize } from './raster.ts';
import { fbm, mixN, smooth, vnoise } from './noise.ts';
import { beardCover, scalpCover, type BeardSpec, type ScalpSpec } from './styles.ts';

export type RGB = [number, number, number];

export interface HeadPaint {
  size: number;
  uv: Float32Array;
  tri: Uint32Array;
  attr: Float32Array;
  k: number;
  /** Base-mesh landmarks (head space). */
  land: FaceLand;
  skin: RGB;
  hair: RGB;
  scalp: ScalpSpec;
  beard: BeardSpec;
  brows: number;
  marks: number;
  /** The kit colour at a bind-pose point inside the collar, or null for skin. */
  collar: (a: Float32Array) => RGB | null;
  seed: number;
  /** Small textures skip detail too fine to show (pores, single hairs). */
  lite: boolean;
}

/** sRGB hex → linear RGB. */
export function linear(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)];
}
export const toS = (c: number) => {
  const v = c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
};

/** Writes a texel: linear colour to sRGB (and alpha), plus bump, roughness and clearcoat. */
export function write(color: Uint8Array, detail: Uint8Array, o: number, r: number, g: number, b: number, bump: number, rough: number, coat = 0, alpha = 1) {
  const c = o * 4;
  color[c] = toS(r);
  color[c + 1] = toS(g);
  color[c + 2] = toS(b);
  color[c + 3] = Math.round(alpha * 255);
  detail[c] = Math.max(0, Math.min(255, Math.round(bump * 255)));
  detail[c + 1] = Math.max(0, Math.min(255, Math.round(rough * 255)));
  detail[c + 2] = Math.round(coat * 255);
  detail[c + 3] = 255;
}

// Brow presets: thickness, arch, length, density, tail drop.
const BROW_K: [number, number, number, number, number][] = [
  [0.0056, 0.0042, 1, 0.84, 0.002],
  [0.0078, 0.0034, 1.03, 0.97, 0.002],
  [0.0036, 0.0046, 0.95, 0.85, 0.0025],
  [0.0052, 0.008, 1, 0.86, 0.0045],
  [0.0058, 0.0008, 1.03, 0.9, 0.0],
  [0.009, 0.0036, 1.06, 1, 0.003],
];

const gau2 = (dx: number, dy: number, r: number) => Math.exp(-(dx * dx + dy * dy) / (r * r));

export function paintHead(inp: HeadPaint): { color: Uint8Array; detail: Uint8Array } {
  const { size, land: L } = inp;
  const color = new Uint8Array(size * size * 4);
  const detail = new Uint8Array(size * size * 4);
  const skin = inp.skin;
  const hair = inp.hair;
  const hairLum = hair[0] * 0.3 + hair[1] * 0.59 + hair[2] * 0.11;
  // Darker skin shows less redness and has deeper lips.
  const skinLum = skin[0] * 0.3 + skin[1] * 0.59 + skin[2] * 0.11;
  const lip: RGB = skinLum < 0.12 ? [skin[0] * 0.66, skin[1] * 0.48, skin[2] * 0.52] : [skin[0] * 0.8, skin[1] * 0.5, skin[2] * 0.52];
  const brow: RGB = [hair[0] * 0.78 + 0.002, hair[1] * 0.76 + 0.002, hair[2] * 0.76 + 0.002];
  const shadow: RGB = [mixN(skin[0], hair[0], 0.5) * 0.72, mixN(skin[1], hair[1], 0.5) * 0.74, mixN(skin[2], hair[2], 0.5) * 0.8];
  const bk = BROW_K[inp.brows] ?? BROW_K[0];
  // Every man with dark hair has a faint beard shadow.
  const baseShadow = inp.beard.region ? 0 : 0.12 * smooth(0.5, 0.02, hairLum);
  const seed = inp.seed;
  const eyeR = L.eyeR;
  const browY = L.eyeY + 0.028;

  const lite = inp.lite;
  const covered = rasterize(size, inp.uv, inp.tri, inp.attr, inp.k, (o, a) => {
    const kit = inp.collar(a);
    if (kit) {
      // Inside the collar: the shirt, shaded by the neck's creases.
      const w = 1 - a[A.cav] * 0.4;
      write(color, detail, o, kit[0] * w, kit[1] * w, kit[2] * w, 0.5, 0.8);
      return;
    }
    const x = a[A.base], y = a[A.base + 1], z = a[A.base + 2];
    const nz = a[A.nrm + 2], ny = a[A.nrm + 1];
    const ax = Math.abs(x);
    const front = smooth(0.0, 0.5, nz);
    let r = skin[0], g = skin[1], b = skin[2];
    let bump = 0.5;
    let rough = 0.55;

    // --- Skin variation ---
    const mott = (lite ? vnoise(x * 60 + seed, y * 60, z * 60) : fbm(x * 60 + seed, y * 60, z * 60, 3)) - 0.5;
    r *= 1 + mott * 0.09;
    g *= 1 + mott * 0.08;
    b *= 1 + mott * 0.07;
    // Redness: cheeks, nose, chin and ears.
    const red = 0.6 * gau2(ax - (L.eyeX + 0.008), y - (L.eyeY - 0.045), 0.03) * front
      + 0.6 * gau2(x, y - L.tipY, 0.018) * front
      + 0.25 * gau2(x, y - (L.chinY + 0.02), 0.022) * front
      + 0.5 * a[A.ear];
    const redK = red * (0.17 + 0.1 * smooth(0.25, 0.6, skinLum)) * (inp.marks === 4 ? 2.2 : 1);
    r *= 1 + redK * 0.4;
    g *= 1 - redK * 0.55;
    b *= 1 - redK * 0.45;
    // Darker, cooler skin round the eyes; lighter on the forehead and the nose bridge.
    const eyeA = gau2(ax - L.eyeX, y - L.eyeY + 0.004, 0.026) * front;
    r *= 1 - eyeA * 0.14;
    g *= 1 - eyeA * 0.17;
    b *= 1 - eyeA * 0.1;
    const hi = (gau2(x, y - 0.06, 0.035) * 0.05 + gau2(x, y - (L.eyeY - 0.02), 0.012) * 0.05) * front;
    r *= 1 + hi;
    g *= 1 + hi;
    b *= 1 + hi * 0.9;
    // T-zone sheen; pores on the face.
    rough -= (gau2(x, y - 0.05, 0.04) + gau2(x, y - L.tipY, 0.02)) * 0.1 * front;
    if (!lite) bump += (vnoise(x * 1500, y * 1500, z * 1500) - 0.5) * 0.12 * front;

    // --- Eyelids: a little pinker, with a dark lash line along the margin ---
    const lid = a[A.lid];
    if (lid > 0.02) {
      const ex = x > 0 ? L.eyeX : -L.eyeX;
      const d = Math.hypot(x - ex, y - L.eyeY, z - L.eyeZ) / eyeR;
      const up = y > L.eyeY ? 1 : 0.3;
      r *= 1 - lid * 0.05;
      g *= 1 - lid * 0.1;
      b *= 1 - lid * 0.08;
      const line = smooth(1.11, 1.03, d) * lid * up;
      r = mixN(r, 0.012, line * 0.85);
      g = mixN(g, 0.009, line * 0.85);
      b = mixN(b, 0.008, line * 0.85);
      rough = mixN(rough, 0.35, smooth(1.1, 1.0, d) * lid);
    }

    // --- Lips ---
    const lipM = smooth(0.25, 0.7, Math.max(a[A.lipU], a[A.lipL]));
    if (lipM > 0) {
      const lines = lite ? 0 : (vnoise(x * 2400, y * 280, 3) - 0.5) * 0.25;
      r = mixN(r, lip[0] * (1 + lines * 0.3), lipM);
      g = mixN(g, lip[1] * (1 + lines * 0.3), lipM);
      b = mixN(b, lip[2] * (1 + lines * 0.3), lipM);
      bump += lines * lipM * 0.5;
      rough = mixN(rough, 0.34, lipM);
    }
    // Where the lips meet, and inside the mouth.
    const meet = smooth(0.25, 0.5, Math.min(a[A.lipU], a[A.lipL]) * 2) + smooth(L.lipZ - 0.006, L.lipZ - 0.02, z) * smooth(L.mouthW * 1.1, L.mouthW * 0.8, ax) * smooth(0.016, 0.008, Math.abs(y - L.mouthY));
    if (meet > 0) {
      const k = Math.min(1, meet);
      r = mixN(r, lip[0] * 0.25, k);
      g = mixN(g, lip[1] * 0.18, k);
      b = mixN(b, lip[2] * 0.2, k);
    }
    // Mouth corners and nostrils.
    const corner = gau2(ax - L.mouthW * 1.02, y - L.mouthY, 0.0045) * front;
    const nos = gau2(ax - 0.011, y - (L.tipY - 0.012), 0.007) * smooth(-0.1, -0.6, ny);
    const dk = corner * 0.35 + nos * 0.8;
    r *= 1 - dk;
    g *= 1 - dk * 1.08;
    b *= 1 - dk * 1.04;

    // --- Beard shadow and stubble ---
    const lips = Math.max(lipM, Math.min(1, meet));
    const bc = beardCover(x, y, z, inp.beard, L) * (1 - lips);
    const bd = Math.max(bc * inp.beard.density, beardCover(x, y, z, FULL, L) * (1 - lips) * baseShadow);
    if (bd > 0.002) {
      const dots = lite ? 0.45 : smooth(0.52, 0.72, vnoise(x * 1300 + 7, y * 1300, z * 1300));
      const fine = lite ? 0.45 : smooth(0.5, 0.66, vnoise(x * 2300, y * 2300 + 3, z * 2300));
      const sh = bd * (inp.beard.volume ? 0.62 : 0.44);
      r = mixN(r, shadow[0], sh);
      g = mixN(g, shadow[1], sh);
      b = mixN(b, shadow[2], sh);
      const k = Math.min(1, bd * (inp.beard.volume ? 1.3 : 1)) * Math.max(dots, fine * 0.8) * 0.85;
      r = mixN(r, hair[0] * 0.7, k);
      g = mixN(g, hair[1] * 0.7, k);
      b = mixN(b, hair[2] * 0.7, k);
      bump += (dots - 0.5) * bd * 0.35;
      rough = mixN(rough, 0.72, bd);
    }

    // --- Brows ---
    if (front > 0 && y > browY - 0.03 && y < browY + 0.035 && ax < 0.085) {
      const m = browMask(x, y, browY, L.eyeX, bk, seed) * front;
      if (m > 0) {
        r = mixN(r, brow[0], m);
        g = mixN(g, brow[1], m);
        b = mixN(b, brow[2], m);
        bump += m * 0.18;
        rough = mixN(rough, 0.75, m);
      }
    }

    // --- Scalp ---
    if (y > -0.12) {
      const jit = (vnoise(Math.atan2(x, z) * 30 + seed, y * 120, 1) - 0.5) * 2;
      const cov = scalpCover(x, y, z, inp.scalp, jit) * (1 - smooth(0.2, 0.6, a[A.ear]));
      if (cov > 0.002) {
        const len = inp.scalp.len;
        // Strands run down the head's meridians.
        const az = Math.atan2(x, z);
        const el = Math.atan2(y, Math.hypot(x, z));
        const strand = lite ? 0.5 : vnoise(az * 260 + seed, el * (len > 0.5 ? 40 : 120), 5);
        const dots = lite ? 0.5 : smooth(0.48, 0.7, vnoise(x * 1500, y * 1500, z * 1500 + 9));
        let tex = len > 0.5 ? 0.6 + strand * 0.6 : 0.35 + dots * 0.75;
        if (inp.scalp.waves) {
          const crownD = Math.hypot(x, y - 0.14, z + 0.04);
          tex *= 0.75 + 0.45 * (0.5 + 0.5 * Math.sin(crownD * 520 + Math.atan2(x, z + 0.04) * 3));
        }
        if (inp.scalp.rows) tex *= 0.35 + 0.9 * (0.5 + 0.5 * Math.cos(az * 15));
        const sh = cov * 0.7;
        r = mixN(r, shadow[0] * 0.85, sh);
        g = mixN(g, shadow[1] * 0.85, sh);
        b = mixN(b, shadow[2] * 0.85, sh);
        const k = Math.min(1, cov * (0.7 + len * 0.3));
        r = mixN(r, hair[0] * tex, k);
        g = mixN(g, hair[1] * tex, k);
        b = mixN(b, hair[2] * tex, k);
        bump += (dots - 0.5) * cov * 0.3;
        rough = mixN(rough, 0.7, cov);
      }
    }

    // --- Marks ---
    switch (inp.marks) {
      case 1: { // freckles over the nose and cheeks
        const zone = (gau2(ax - 0.035, y - (L.tipY + 0.01), 0.035) + gau2(x, y - (L.tipY + 0.025), 0.02)) * front;
        if (zone > 0.05) {
          const dot = smooth(0.66, 0.8, vnoise(x * 900 + 11, y * 900, z * 900));
          const k = dot * Math.min(1, zone) * 0.55;
          r *= 1 - k * 0.3;
          g *= 1 - k * 0.45;
          b *= 1 - k * 0.55;
        }
        break;
      }
      case 2: { // a mole on the cheek
        const k = smooth(0.0026, 0.0014, Math.hypot(x - (L.mouthW + 0.014), y - (L.tipY - 0.004))) * front;
        r *= 1 - k * 0.65;
        g *= 1 - k * 0.7;
        b *= 1 - k * 0.7;
        bump += k * 0.2;
        break;
      }
      case 3: { // a pale scar through the left brow
        const x0 = -L.eyeX - 0.008, y0 = browY - 0.016;
        const t = Math.max(0, Math.min(1, ((x - x0) * 0.3 + (y - y0) * 0.95) / 0.034));
        const d = Math.hypot(x - (x0 + 0.3 * 0.034 * t), y - (y0 + 0.95 * 0.034 * t));
        const k = smooth(0.0016, 0.0006, d) * front;
        r = mixN(r, skin[0] * 1.12 + 0.03, k);
        g = mixN(g, skin[1] * 0.98 + 0.02, k);
        b = mixN(b, skin[2] * 0.98 + 0.02, k);
        bump += k * 0.25;
        rough = mixN(rough, 0.35, k);
        break;
      }
      case 5: { // eye black
        const k = smooth(0.003, 0.0, Math.abs(y - (L.eyeY - 0.036)) - 0.006) * smooth(L.eyeX + 0.03, L.eyeX + 0.024, ax) * smooth(L.eyeX - 0.022, L.eyeX - 0.014, ax) * front;
        r = mixN(r, 0.004, k);
        g = mixN(g, 0.004, k);
        b = mixN(b, 0.005, k);
        rough = mixN(rough, 0.85, k);
        break;
      }
    }

    // Baked creases, reddish like light through skin.
    const occ = a[A.cav];
    r *= 1 - occ * 0.38;
    g *= 1 - occ * 0.55;
    b *= 1 - occ * 0.58;
    write(color, detail, o, r, g, b, bump, rough);
  });
  dilate(color, covered, size);
  dilate(detail, covered, size);
  // The inner strips: the mouth and nostrils in deep shadow, the lids' rims a moist pink.
  const row = (v: number) => Math.floor(v * size);
  const eyeRow = row(INNER_EYE_V);
  for (let j = 0; j <= eyeRow + 1; j++) {
    const eye = Math.abs(j - eyeRow) < Math.abs(j - row(INNER_V));
    for (let i = 0; i < size; i++) {
      const o = j * size + i;
      if (eye) write(color, detail, o, lip[0] * 0.75, lip[1] * 0.62, lip[2] * 0.62, 0.5, 0.3);
      else write(color, detail, o, lip[0] * 0.14, lip[1] * 0.09, lip[2] * 0.09, 0.5, 0.5);
    }
  }
  return { color, detail };
}

const FULL: BeardSpec = { region: 'full', density: 1, volume: 0, tache: true };

/** Brow density at a face point: a tapered, arched band painted as individual hairs. */
function browMask(x: number, y: number, browY: number, eyeX: number, k: [number, number, number, number, number], seed: number) {
  const [thick, arch, len, dens, tail] = k;
  const ax = Math.abs(x);
  const x0 = 0.011;
  const x1 = (eyeX + 0.026) * len;
  const t = (ax - x0) / (x1 - x0);
  if (t < -0.08 || t > 1.06) return 0;
  const tc = Math.max(0, Math.min(1, t));
  const peak = 0.62;
  const cy = browY + (tc < peak ? Math.sin((tc / peak) * Math.PI / 2) : Math.cos(((tc - peak) / (1 - peak)) * Math.PI / 2) * 0.75 + 0.25) * arch - tail * tc;
  const h = thick * (tc < 0.18 ? 0.75 + tc * 1.4 : 1 - 0.6 * smooth(0.45, 1, tc));
  const across = y - cy;
  const band = smooth(h, h * 0.45, Math.abs(across)) * smooth(-0.08, 0.04, t) * smooth(1.06, 0.92, t);
  if (band <= 0) return 0;
  // Hairs: inner ones grow upward, then outward, the tail slightly down.
  const ang = tc < 0.25 ? mixN(1.25, 0.45, tc / 0.25) : mixN(0.3, -0.2, (tc - 0.25) / 0.75);
  const dx = Math.cos(ang);
  const dy = Math.sin(ang);
  const along = ax * dx + y * dy;
  const perp = -ax * dy + y * dx;
  const s = vnoise(perp * 1300 + seed, along * 170, 2) * 0.65 + vnoise(perp * 700, along * 90 + seed, 7) * 0.35;
  const hairs = smooth(0.4, 0.62, s);
  // Denser through the body of the brow, wispy at its edges.
  const core = smooth(h * 0.9, h * 0.2, Math.abs(across));
  return Math.min(1, band * dens * (0.35 + 0.65 * Math.max(hairs, core * 0.85)));
}
