// Casual clothes: what a player wears off the pitch. Each piece (top, bottoms,
// shoes) has a cut that shapes the cloth on the body (sleeve and hem lengths,
// thickness) and a painter that draws it texel by texel on the bind pose:
// fabric weave, seams, ribbing, pockets, zips, prints and soles. Runs inside
// the paint worker, so everything here is plain data.
import { A, KIT_CUT, PAINT_K, Region, type Cut } from './body.ts';
import { fbm, hash3, mixN, smooth, vnoise } from './noise.ts';
import type { RGB } from './paint.ts';

export interface Piece {
  style: string;
  print: string;
  c1: RGB;
  c2: RGB;
  c3: RGB;
}

export interface CasualPaint {
  top: Piece;
  bottom: Piece;
  shoes: Piece;
  sock: RGB;
}

/** Plain style names, for the cut. */
export interface CasualStyles { top: string; bottom: string; shoes: string }

const LONG = 0.465;
const SLEEVES: Record<string, number> = { tee: 0.14, polo: 0.15, tank: -1, jersey: 0.16, shirt: 0.15 };
const TOP_PUFF: Record<string, number> = { tee: 0.011, tank: 0.009, polo: 0.012, long: 0.012, shirt: 0.013, jersey: 0.013, hoodie: 0.022, knit: 0.024, bomber: 0.022, track: 0.016, denim: 0.02, varsity: 0.022, leather: 0.018, suit: 0.017, puffer: 0.05 };
const TOP_COLLAR: Record<string, [number, number]> = { tee: [1.772, 0.6], tank: [1.69, 1.3], polo: [1.8, 0.5], shirt: [1.8, 0.55], jersey: [1.79, 0.5], long: [1.772, 0.6], hoodie: [1.785, 0.55], knit: [1.79, 0.5], bomber: [1.795, 0.45], track: [1.8, 0.3], denim: [1.8, 0.5], varsity: [1.79, 0.5], leather: [1.81, 0.4], suit: [1.8, 0.5], puffer: [1.805, 0.25] };
/** Where the top ends: shirts hang over the waist, bombers and leathers stop at it. */
const TOP_WAIST: Record<string, number> = { bomber: 1.07, leather: 1.06, varsity: 1.05, track: 1.04, tank: 1.04, puffer: 1.0, suit: 0.98, denim: 1.04 };
const SHOE_TOP: Record<string, number> = { runner: 0.13, court: 0.12, high: 0.215, chunky: 0.14, slide: 0.07, chelsea: 0.215, loafer: 0.09 };
const SHORT = new Set(['shorts']);
export const SHOE_PUFF: Record<string, { puffShoe: number; sole: number; puffSole: number }> = {
  runner: { puffShoe: 0.02, sole: 0.04, puffSole: 0.008 },
  court: { puffShoe: 0.018, sole: 0.03, puffSole: 0.007 },
  high: { puffShoe: 0.02, sole: 0.032, puffSole: 0.007 },
  chunky: { puffShoe: 0.024, sole: 0.055, puffSole: 0.012 },
  slide: { puffShoe: 0.012, sole: 0.03, puffSole: 0.01 },
  chelsea: { puffShoe: 0.016, sole: 0.022, puffSole: 0.005 },
  loafer: { puffShoe: 0.014, sole: 0.022, puffSole: 0.004 },
};

/** The body cut for an outfit. */
export function casualCut(s: CasualStyles): Cut {
  const short = SHORT.has(s.bottom);
  const [collar, dip] = TOP_COLLAR[s.top] ?? TOP_COLLAR.tee;
  const shoe = SHOE_TOP[s.shoes] ?? 0.13;
  const hem = short ? 0.74 : 0.115;
  return {
    ...KIT_CUT,
    sleeve: SLEEVES[s.top] ?? LONG,
    hem,
    hemSide: short ? 0.1 : 0,
    shoe,
    // Shorts show crew socks; trousers hide them, except over slides.
    sock: short ? 0.23 : hem + 0.002,
    waist: TOP_WAIST[s.top] ?? 1.02,
    collar,
    dip,
    puffTop: TOP_PUFF[s.top] ?? 0.012,
    puffBottom: s.bottom === 'cargo' ? 0.02 : s.bottom === 'joggers' ? 0.017 : short ? 0.02 : 0.013,
    flare: short ? 0.05 : 0.012,
    // The modelled shoe goes over the foot; the foot itself stays slim inside it.
    puffShoe: 0,
    puffSole: 0,
    sole: (SHOE_PUFF[s.shoes] ?? SHOE_PUFF.court).sole,
  };
}

/** One painted texel. */
export interface Texel { c: RGB; bump: number; rough: number; coat: number }
const T: Texel = { c: [0, 0, 0], bump: 0.5, rough: 0.8, coat: 0 };
const set = (c: RGB, rough = 0.85, coat = 0) => {
  T.c = c;
  T.rough = rough;
  T.coat = coat;
  return T;
};
const k3 = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];
const mix3 = (a: RGB, b: RGB, t: number): RGB => [mixN(a[0], b[0], t), mixN(a[1], b[1], t), mixN(a[2], b[2], t)];
const METAL: RGB = [0.62, 0.64, 0.68];
const WHITE: RGB = [0.86, 0.86, 0.84];

/** Fine fabric surfaces: bump and roughness wobble. */
function jersey(x: number, y: number, z: number) {
  const k = Math.sin(x * 900 + y * 520) * Math.sin(z * 900 - y * 520);
  T.bump += k * 0.07;
  T.rough -= k * 0.03;
}
function twill(x: number, y: number, z: number, s = 1) {
  const d = Math.sin((y * 1.0 + (x + z) * 0.7) * 1500) * 0.5 + 0.5;
  T.bump += (d - 0.5) * 0.16 * s;
}
function rib(around: number, n = 60) {
  T.bump += Math.sin(around * n) * 0.14;
}
/** A raised seam line `d` from the edge (bump ridge with a soft shadow). */
function seam(d: number, w = 0.0035) {
  if (Math.abs(d) < w) T.bump += 0.18 * (1 - Math.abs(d) / w);
}
/** Dashed stitching along a line. */
function stitch(d: number, along: number, c: RGB, w = 0.0018) {
  if (Math.abs(d) < w && Math.sin(along * 900) > -0.2) T.c = c;
}

// ---------- Prints ----------

function printAt(p: Piece, x: number, y: number, z: number, armT: number, onArm: boolean, seed: number): RGB {
  const { c1, c2, c3 } = p;
  switch (p.print) {
    case 'stripes': {
      if (p.style === 'jersey') return Math.floor((x + 4.035) / 0.07) % 2 === 1 && !onArm ? c2 : c1;
      const v = onArm ? 1.75 - armT * 0.9 : y;
      return Math.floor(v / 0.045) % 2 === 0 ? c2 : c1;
    }
    case 'camo': {
      const n = fbm(x * 7 + seed, y * 7, z * 7, 3);
      const m = fbm(x * 9 + 31, y * 9 + seed, z * 9 + 7, 2);
      return n > 0.56 ? c2 : m > 0.55 ? c3 : c1;
    }
    case 'tiedye': {
      const a = Math.atan2(x, z) * 2 + Math.hypot(x, y - 1.3) * 26 + fbm(x * 6, y * 6 + seed, z * 6) * 5;
      const t = 0.5 + 0.5 * Math.sin(a);
      const u = 0.5 + 0.5 * Math.sin(a * 0.5 + 2);
      return mix3(mix3(c1, c2, t), c3, u * 0.7);
    }
    case 'check': {
      const u = onArm ? armT : x, v = onArm ? Math.atan2(x, z) * 0.05 : y;
      const a = Math.floor((u + 4) / 0.045) % 2, b = Math.floor((v + 4) / 0.045) % 2;
      const thin = Math.abs(((u + 4) % 0.045) - 0.0225) < 0.002 || Math.abs(((v + 4) % 0.045) - 0.0225) < 0.002;
      const base = a && b ? c2 : a || b ? mix3(c1, c2, 0.55) : c1;
      return thin ? mix3(base, [0.8, 0.75, 0.6], 0.35) : base;
    }
    case 'floral': {
      const n = vnoise(x * 55 + seed, y * 55, z * 55);
      const f = vnoise(x * 90 + 9, y * 90 + seed, z * 90);
      return f > 0.78 ? c3 : n > 0.62 ? c2 : n > 0.58 ? k3(c2, 0.6) : c1;
    }
    case 'flames': {
      const h = 1.06 + 0.22 * fbm(x * 9 + seed, y * 3 - x * 0.3, z * 9, 3) + 0.06 * Math.sin(x * 40);
      const v = onArm ? 1.3 - armT * 0.6 + 0.1 : y;
      if (v < h - 0.05) return c3;
      if (v < h) return mix3(c2, c3, smooth(h, h - 0.05, v));
      return c1;
    }
    case 'galaxy': {
      const n = fbm(x * 5 + seed, y * 5, z * 5, 4);
      let c = mix3(c1, c2, smooth(0.55, 0.8, n) * 0.55);
      c = mix3(c, c3, smooth(0.6, 0.85, fbm(x * 4 + 11, y * 4, z * 4 + seed, 3)) * 0.5);
      const s = hash3(Math.floor(x * 400), Math.floor(y * 400), Math.floor(z * 400));
      return s > 0.992 ? [1, 1, 1] : s > 0.985 ? k3(c2, 1.6) : c;
    }
    case 'chrome': {
      const b = 0.5 + 0.5 * Math.sin(y * 30 + Math.atan2(x, z) * 2);
      return mix3(c2, c1, b);
    }
    case 'brocade': {
      const s = Math.sin(x * 160) * Math.sin(y * 160) + Math.sin((x + y) * 113) * 0.5;
      return s > 0.6 ? c2 : mix3(c1, k3(c1, 0.75), smooth(-0.4, 0.4, s));
    }
    default:
      return c1;
  }
}

// ---------- Tops ----------

function top(p: Piece, x: number, y: number, z: number, armT: number, a: Float32Array, w: { arm: number }, cut: Cut, seed: number): Texel {
  const onArm = w.arm > 0.5;
  const ax = Math.abs(x);
  const front = z > 0;
  const nx = a[A.nrm] * Math.sign(x);
  const collarY = cut.collar - Math.max(0, z) * cut.dip - Math.max(0, 0.05 - ax) * 0.4;
  const toCollar = collarY - y;
  const toHem = y - cut.waist;
  const toCuff = cut.sleeve - armT;
  const around = Math.atan2(x, z);
  T.bump = 0.5;
  let c = printAt(p, x, y, z, armT, onArm, seed);
  const s = p.style;
  set(c, 0.86);
  const fold = fbm(x * 14 + seed, y * 30, z * 14, 3);
  T.bump += (fold - 0.5) * 0.3;

  // Open jackets show the tee underneath down the front.
  const openFront = (s === 'denim' || s === 'varsity' || s === 'suit') && front && !onArm;
  if (openFront) {
    const half = s === 'suit' ? Math.max(0, (y - 1.18) * 0.33) + 0.005 : 0.03 + Math.max(0, y - 1.5) * 0.1;
    if (ax < half) {
      if (s === 'suit') {
        // Dress shirt, buttons and a slim tie.
        set(p.c2, 0.6);
        if (ax < 0.014 + Math.max(0, 1.62 - y) * 0.012 && y > 1.28) set(p.c3, 0.4, 0.4);
        else if (ax < 0.002 && Math.sin(y * 90) > 0.9) set(k3(p.c2, 0.8), 0.4);
        return T;
      }
      set(p.c3, 0.88);
      jersey(x, y, z);
      return T;
    }
    // Lapels: a satin band along the opening of the suit, a facing on the jackets.
    if (ax < half + 0.03 && y > 1.2) {
      if (s === 'suit') {
        set(k3(c, 0.78), 0.3, 0.5);
        if (p.print === 'brocade') T.c = k3(p.c1, 0.5);
      } else T.c = k3(c, 0.9);
      seam(ax - half - 0.03);
    }
  }

  switch (s) {
    case 'tee': case 'long': case 'tank': case 'jersey': case 'polo': {
      jersey(x, y, z);
      if (toCollar < 0.016 && !onArm) {
        rib(around, 220);
        if (p.print === 'ringer' || s === 'polo' || s === 'jersey') T.c = p.c2;
        else T.c = k3(c, 0.93);
      }
      if (onArm && toCuff < 0.018) {
        if (p.print === 'ringer' || s === 'jersey') T.c = p.c2;
        seam(toCuff - 0.012);
      }
      if (toHem < 0.02) seam(toHem - 0.012);
      if (s === 'polo' && front && ax < 0.012 && y > collarY - 0.12) {
        T.c = k3(c, 0.92);
        seam(ax - 0.012);
        if (ax < 0.005 && (Math.abs(y - (collarY - 0.04)) < 0.005 || Math.abs(y - (collarY - 0.09)) < 0.005)) set(p.c2, 0.3, 0.6);
      }
      if (p.print === 'chest' && front && !onArm) {
        const d = Math.hypot(x - 0.09, y - 1.58);
        if (d < 0.024) T.c = d > 0.019 || (d < 0.011 && Math.abs(Math.atan2(y - 1.58, x - 0.09) % 1.26) < 0.6) ? p.c2 : T.c;
      }
      if (s === 'tank' && ax > 0.13 && y > 1.45) T.bump += 0.05;
      break;
    }
    case 'shirt': {
      twill(x, y, z, 0.5);
      if (front && ax < 0.014 && !onArm) {
        seam(ax - 0.014);
        if (ax < 0.004 && Math.sin(y * 92) > 0.88) set(k3(WHITE, 0.95), 0.3, 0.5);
      }
      if (toCollar < 0.025 && !onArm) seam(toCollar - 0.024);
      if (onArm && toCuff < 0.03) {
        // Rolled cuff (flannel) or a plain hem.
        T.c = p.print === 'check' ? k3(p.c1, 0.85) : T.c;
        seam(toCuff - 0.028);
        T.bump += Math.sin(toCuff * 300) * 0.06;
      }
      if (front && !onArm && Math.abs(x - 0.09) < 0.035 && y > 1.5 && y < 1.6) seam(Math.min(Math.abs(Math.abs(x - 0.09) - 0.035), Math.abs(y - 1.6)));
      break;
    }
    case 'hoodie': case 'knit': {
      if (s === 'knit') {
        // Cables: braided ridges running down the body and arms.
        const u = onArm ? around * 0.08 : x;
        const cell = ((u + 4) / 0.05) % 1;
        const braid = Math.sin(y * 120 + (cell > 0.5 ? 1 : -1) * cell * 6);
        T.bump += (Math.abs(cell - 0.5) < 0.3 ? braid * 0.22 : Math.sin(y * 900) * 0.08);
        T.rough = 0.95;
      } else {
        T.rough = 0.92;
        T.bump += (vnoise(x * 300, y * 300, z * 300) - 0.5) * 0.12;
      }
      if (!onArm && toHem < 0.05) { rib(around, 260); T.c = k3(T.c, 0.94); seam(toHem - 0.05); }
      if (onArm && toCuff < 0.04) { rib(Math.atan2(a[A.nrm + 1], a[A.nrm + 2]), 40); T.c = k3(T.c, 0.94); seam(toCuff - 0.04); }
      if (s === 'hoodie' && front && !onArm) {
        // Kangaroo pocket and drawstrings.
        const top2 = 1.32 - ax * 0.25;
        if (ax < 0.13 && y > cut.waist + 0.05 && y < top2) {
          T.c = k3(T.c, 0.97);
          seam(Math.min(top2 - y, 0.13 - ax, y - cut.waist - 0.05));
          if (ax > 0.1 && ax < 0.125) T.bump -= 0.06;
        }
        const sx = Math.abs(ax - 0.035);
        if (sx < 0.0045 && y > collarY - 0.17 && y < collarY + 0.01) set(y < collarY - 0.15 ? METAL : p.c2, 0.6, 0.2);
        if (toCollar < 0.012) seam(toCollar - 0.006, 0.006);
      }
      if (s === 'knit' && toCollar < 0.03 && !onArm) { rib(around, 200); T.c = k3(T.c, 0.92); }
      break;
    }
    case 'bomber': case 'track': case 'leather': case 'varsity': case 'denim': case 'suit': case 'puffer': {
      if (s === 'bomber') { T.rough = 0.32; T.coat = 0.55; }
      if (s === 'leather') {
        T.rough = 0.38;
        T.coat = 0.6;
        T.bump += (fbm(x * 60, y * 60 + seed, z * 60, 3) - 0.5) * 0.2;
      }
      if (s === 'track') { T.rough = 0.5; T.coat = 0.25; jersey(x, y, z); }
      if (s === 'denim') {
        twill(x, y, z, 1.2);
        T.c = k3(T.c, 0.9 + (vnoise(x * 30, y * 30 + seed, z * 30) - 0.5) * 0.25);
      }
      if (s === 'suit') { T.rough = 0.62; twill(x, y, z, 0.4); if (p.print === 'brocade') { T.rough = 0.35; T.coat = 0.5; } }
      if (s === 'puffer') {
        // Quilted baffles: each one swells between stitched lines.
        const b = ((y + (onArm ? -armT * 0.6 : 0)) / 0.075) % 1;
        T.bump += Math.sin(b * Math.PI) * 0.4 - 0.2;
        if (b < 0.06 || b > 0.94) T.c = k3(T.c, 0.82);
        T.rough = p.print === 'chrome' ? 0.12 : 0.28;
        T.coat = p.print === 'chrome' ? 1 : 0.7;
      }
      if (s === 'varsity' && onArm) { T.c = p.c2; T.rough = 0.42; T.coat = 0.5; }
      // Rib knit trims on bombers and varsity jackets.
      if (s === 'bomber' || s === 'varsity') {
        const ribC = s === 'varsity' ? p.c1 : p.c2;
        const band = (d: number, wdt: number) => {
          if (d >= wdt) return;
          T.c = ribC;
          T.rough = 0.9;
          T.coat = 0;
          rib(onArm ? Math.atan2(a[A.nrm + 1], a[A.nrm + 2]) : around, onArm ? 40 : 260);
          if (s === 'varsity' && Math.abs(d - wdt * 0.5) < wdt * 0.15) T.c = p.c2;
        };
        if (!onArm) band(toHem, 0.05);
        if (!onArm) band(toCollar, 0.035);
        if (onArm) band(toCuff, 0.04);
      }
      if (s === 'track') {
        // Two stripes down the outside of each sleeve.
        if (onArm && nx > 0.35) {
          const d = Math.abs(a[A.nrm + 2]);
          if (d < 0.11 || (d > 0.2 && d < 0.3)) T.c = p.c2;
        }
        if (toCollar < 0.04 && !onArm) { T.c = k3(T.c, 0.9); rib(around, 200); }
      }
      // A zip down the middle (the leather's runs across, biker style).
      if (front && !onArm && (s === 'bomber' || s === 'track' || s === 'puffer')) {
        if (ax < 0.006) set(s === 'puffer' ? p.c3 : METAL, 0.3, 0.6);
        if (ax < 0.0025) T.bump += Math.sin(y * 1400) * 0.2;
      }
      if (s === 'leather' && front && !onArm) {
        const zx = -0.1 + (y - 1.05) * 0.42;
        if (Math.abs(x - zx) < 0.005) set(METAL, 0.25, 0.8);
        if (Math.abs(x - zx) < 0.0025) T.bump += Math.sin(y * 1400) * 0.25;
        // Lapels.
        if (y > 1.58 && ax > 0.03 && ax < 0.1 && Math.abs(y - 1.58 - (ax - 0.03) * 1.5) < 0.006) seam(0);
        // A zipped chest pocket.
        if (Math.abs(y - (1.5 - (x + 0.09) * 0.4)) < 0.003 && x > -0.14 && x < -0.05) set(p.c2, 0.25, 0.8);
      }
      if (s === 'leather' && onArm && toCuff < 0.06 && nx > 0.4 && Math.abs(a[A.nrm + 2]) < 0.04) set(p.c2, 0.25, 0.8);
      if (s === 'denim') {
        stitch(Math.abs(x) - 0.04, y, p.c2);
        if (front && !onArm && Math.abs(ax - 0.09) < 0.04 && y > 1.47 && y < 1.6) {
          seam(Math.min(Math.abs(ax - 0.09) - 0.04, y - 1.47));
          stitch(Math.abs(y - 1.56) - 0.0, x, p.c2);
          if (Math.abs(ax - 0.09) < 0.004 && Math.abs(y - 1.57) < 0.004) set(METAL, 0.3, 0.6);
        }
        if (toHem < 0.045) { T.c = k3(T.c, 0.92); stitch(toHem - 0.04, x * 3 + z, p.c2); }
        if (onArm && toCuff < 0.04) { T.c = k3(T.c, 0.92); stitch(toCuff - 0.036, around, p.c2); }
        if (front && ax > 0.036 && ax < 0.042 && Math.sin(y * 70) > 0.93 && y < 1.6) set(METAL, 0.3, 0.6);
      }
      if (s === 'varsity' && front && !onArm && Math.abs(x + 0.085) < 0.045 && Math.abs(y - 1.53) < 0.06) {
        // A chest letter F in chenille.
        const lx = x + 0.085, ly = y - 1.53;
        const F = (Math.abs(lx + 0.02) < 0.009 && Math.abs(ly) < 0.05) || (Math.abs(ly - 0.042) < 0.009 && lx > -0.03 && lx < 0.03) || (Math.abs(ly - 0.0) < 0.008 && lx > -0.03 && lx < 0.018);
        if (F) { set(p.c2, 0.97); T.bump += 0.25; }
      }
      if (s === 'suit') {
        if (!onArm && front && ax > 0.035 && ax < 0.06 && Math.abs(y - 1.18) < 0.006) set(k3(p.c1, 0.5), 0.3, 0.6);
        if (!onArm && front && x > 0.06 && x < 0.13 && y > 1.53 && y < 1.56 && y - 1.53 < (0.13 - x) * 0.5 + 0.005) set(p.c2, 0.5);
        if (onArm && toCuff < 0.015) seam(toCuff - 0.012);
      }
      break;
    }
  }
  if (onArm && toCuff < 0.003) T.bump -= 0.1;
  return T;
}

// ---------- Bottoms ----------

function bottom(p: Piece, x: number, y: number, z: number, a: Float32Array, cut: Cut, seed: number): Texel | null {
  const ax = Math.abs(x);
  const nx = a[A.nrm] * Math.sign(x);
  const s = p.style;
  T.bump = 0.5;
  set(printAt(p, x, y, z, 0, false, seed), 0.86);
  const toWaist = cut.waist - y;
  const hemY = cut.hem - ax * cut.hemSide;
  const toHem = y - hemY;
  const leg = Math.atan2(x - Math.sign(x) * 0.1, z);
  // Folds behind the knees and at the ankles.
  T.bump += (fbm(x * 18, y * 22 + seed, z * 18, 3) - 0.5) * 0.3;
  if (y < 0.4 && s !== 'shorts') T.bump += Math.sin(y * 140 + Math.sin(leg * 3) * 2) * 0.06 * smooth(0.4, 0.15, y);
  const outer = nx > 0.55 && Math.abs(a[A.nrm + 2]) < 0.6;
  const outerD = 1 - nx;
  switch (s) {
    case 'jeans': case 'shorts': {
      const denim = s === 'jeans' || p.print === 'denim';
      if (denim) {
        twill(x, y, z, 1.4);
        // Fades: lighter thighs and knees, whiskers at the hips, darker seams.
        const fade = smooth(0.0, 0.07, z) * (Math.exp(-((y - 0.95) ** 2) / 0.02) * 0.35 + Math.exp(-((y - 0.6) ** 2) / 0.006) * 0.25);
        const whisk = z > 0.04 && y > 0.9 && y < 1.03 && ax > 0.03 ? Math.max(0, Math.sin(y * 260 + ax * 80)) ** 6 * 0.25 : 0;
        T.c = mix3(T.c, [0.6, 0.68, 0.78], (fade + whisk) * 0.6 + (vnoise(x * 40, y * 40 + seed, z * 40) - 0.5) * 0.08);
        if (outer) stitch(outerD - 0.06, y, p.c2, 0.004);
        if (p.print === 'ripped' && z > 0.03 && Math.abs(y - 0.6) < 0.035 && Math.abs(ax - 0.1) < 0.045) {
          const n = fbm(x * 70 + seed, y * 40, z * 70, 3);
          if (n > 0.6) return null;
          if (n > 0.52 && Math.sin(y * 1400) > 0) set(WHITE, 0.95);
        }
        // Back pockets and front coin pockets.
        if (z < 0 && y > 0.94 && y < toWaistLimit(cut) && ax > 0.03 && ax < 0.13) stitch(Math.min(ax - 0.035, 0.125 - ax, y - 0.95), y + x, p.c2, 0.003);
        if (z > 0 && ax > 0.1 && Math.abs(y - (cut.waist - 0.06) + (ax - 0.1) * 1.4) < 0.003) stitch(0, x, p.c2, 0.004);
      } else {
        // Mesh court shorts with a side panel.
        jersey(x, y, z);
        T.rough = 0.6;
        T.bump += Math.sin(x * 1500) * Math.sin(y * 1500) * 0.08;
        if (outer && outerD < 0.1) T.c = p.c2;
      }
      if (toWaist < 0.04) { T.c = k3(T.c, 0.92); seam(toWaist - 0.04); if (denim && z > 0.04 && ax < 0.008 && toWaist < 0.03) set(METAL, 0.3, 0.7); }
      if (s === 'shorts' && toHem < 0.02) {
        if (p.print === 'denim') { if (toHem < 0.012 && hash3(Math.floor(x * 900), Math.floor(z * 900), 3) > 0.4) set(WHITE, 0.95); }
        else seam(toHem - 0.015);
      }
      if (s === 'jeans' && toHem < 0.025) { T.c = k3(T.c, 0.85); stitch(toHem - 0.02, leg, p.c2); }
      return T;
    }
    case 'joggers': case 'track': {
      if (s === 'joggers') { T.rough = 0.95; T.bump += (vnoise(x * 300, y * 300, z * 300) - 0.5) * 0.14; }
      else { T.rough = 0.5; T.coat = 0.25; jersey(x, y, z); }
      if (s === 'track' && outer && (outerD < 0.035 || (outerD > 0.06 && outerD < 0.09))) T.c = p.c2;
      if (toWaist < 0.05) { rib(Math.atan2(x, z), 260); seam(toWaist - 0.05); }
      if (toHem < 0.06 && s === 'joggers') { rib(leg, 40); T.c = k3(T.c, 0.92); T.bump += 0.1 * Math.sin(toHem * 120); }
      if (z > 0.05 && Math.abs(ax - 0.02) < 0.003 && toWaist < 0.1) set(p.c2, 0.7);
      if (outer && s === 'joggers') seam(outerD - 0.01);
      return T;
    }
    case 'cargo': case 'chinos': case 'suit': case 'leather': {
      twill(x, y, z, s === 'cargo' ? 1 : 0.6);
      if (s === 'cargo') {
        T.bump += (Math.abs(Math.sin(x * 260)) > 0.97 || Math.abs(Math.sin(y * 260)) > 0.97 ? 0.08 : 0);
        if (outer && y > 0.68 && y < 0.9 && outerD < 0.25) {
          T.c = k3(T.c, 0.94);
          seam(Math.min(y - 0.68, 0.9 - y, 0.25 - outerD));
          if (Math.abs(y - 0.86) < 0.004) seam(0);
        }
      }
      if (s === 'chinos' || s === 'suit') {
        // A pressed crease down the front of each leg.
        const c0 = Math.abs(x - Math.sign(x) * 0.1);
        if (z > 0 && c0 < 0.004 && y < 0.95) T.bump += 0.2 * (1 - c0 / 0.004);
      }
      if (s === 'suit' && outer && outerD < 0.03) set(p.c2, 0.3, 0.6);
      if (s === 'leather') { T.rough = 0.35; T.coat = 0.6; T.bump += (fbm(x * 60, y * 60 + seed, z * 60, 3) - 0.5) * 0.2; }
      if (toWaist < 0.04) { seam(toWaist - 0.04); if (s !== 'suit' && Math.abs(Math.sin(Math.atan2(x, z) * 4)) < 0.08) T.c = k3(T.c, 0.85); }
      if (toHem < 0.02) seam(toHem - 0.015);
      return T;
    }
  }
  return T;
}
const toWaistLimit = (cut: Cut) => cut.waist - 0.02;

// ---------- Shoes ----------

function shoe(p: Piece, x: number, y: number, z: number, a: Float32Array, cut: Cut, sock: RGB): Texel {
  const ax = Math.abs(x);
  const s = p.style;
  const fx = ax - 0.1;
  const nx = a[A.nrm] * Math.sign(x);
  const outer = nx > 0.4;
  T.bump = 0.5;
  const soleH = s === 'chunky' ? 0.055 : s === 'runner' ? 0.04 : s === 'loafer' || s === 'chelsea' ? 0.022 : s === 'slide' ? 0.03 : 0.03;
  const top2 = cut.shoe;
  if (y < soleH) {
    set(p.c3, 0.7, 0.1);
    if (s === 'chunky') {
      if (y > soleH * 0.45 && y < soleH * 0.7) T.c = p.c2;
      if (p.print === 'lava') {
        const n = fbm(x * 50, y * 90, z * 50, 3);
        T.c = mix3(p.c2, p.c3, n);
        T.c = k3(T.c, 1.4);
        T.rough = 0.4;
      }
      T.bump += Math.sin(z * 260) * 0.1;
    }
    if (s === 'runner') T.bump += Math.sin(z * 180 + y * 300) * 0.08;
    if (y < 0.006) T.c = k3(T.c, 0.6);
    if (Math.abs(y - soleH + 0.004) < 0.0025) seam(0);
    return T;
  }
  switch (s) {
    case 'slide': {
      // A wide strap over the instep; the rest is sock.
      if (z > -0.005 && z < 0.07 && y > soleH) {
        set(p.c1, 0.5, 0.3);
        if (Math.abs(z - 0.032) < 0.008 && Math.abs(fx) < 0.02) T.bump += 0.2;
        return T;
      }
      set(sock, 0.95);
      rib(Math.atan2(fx, z), 40);
      return T;
    }
    case 'runner': {
      set(p.c1, 0.75);
      T.bump += Math.sin(x * 1600) * Math.sin(z * 1600 + y * 800) * 0.12;
      // A sweeping accent along the outer side.
      if (outer) {
        const cy = 0.06 + (z + 0.02) * 0.25 - Math.max(0, z - 0.06) * 0.6;
        if (Math.abs(y - cy) < 0.009 && z < 0.11 && z > -0.06) set(p.c2, 0.5, 0.3);
      }
      if (z < -0.04 && y > 0.06) set(p.c2, 0.6);
      break;
    }
    case 'court': {
      set(p.c1, 0.45, 0.35);
      if (z > 0.09 && y < 0.07 && hash3(Math.floor(x * 700), Math.floor(z * 700), Math.floor(y * 700)) > 0.85) T.bump -= 0.25;
      if (z < -0.035 && y > 0.05) set(p.c2, 0.45, 0.35);
      if (outer && Math.abs(y - 0.06) < 0.012 && z > -0.02 && z < 0.08) T.c = k3(p.c1, 0.92);
      break;
    }
    case 'high': {
      // Colour-blocked panels: toe and heel in the main colour, the middle in the accent.
      set(p.c1, 0.45, 0.4);
      const mid = z > -0.035 && z < 0.07 && y > 0.05 && y < 0.17;
      if (mid) T.c = p.c2;
      if (y > top2 - 0.025) { T.c = p.c2; T.rough = 0.8; T.bump += 0.1; }
      if (outer && Math.abs(y - 0.08 - (z - 0.02) * 0.4) < 0.012 && z > -0.04 && z < 0.08) T.c = p.c3;
      if (y > 0.05 && y < top2 - 0.03 && z > 0.02 && Math.abs(fx) < 0.016) T.bump += Math.sin(y * 300) * 0.25;
      if (T.c === p.c1) T.coat = 0.5;
      seam(Math.abs(z + 0.035) - 0.0);
      break;
    }
    case 'chunky': {
      set(p.c1, 0.7, 0.15);
      T.bump += (vnoise(x * 500, y * 500, z * 500) - 0.5) * 0.1;
      if (outer && (Math.abs(y - 0.08 - z * 0.3) < 0.014 || (z > 0.08 && y < 0.09))) set(p.c2, 0.5, 0.3);
      if (z < -0.04) set(p.c2, 0.6, 0.2);
      if (p.print === 'lava') { T.rough = 0.4; T.coat = 0.5; }
      break;
    }
    case 'chelsea': {
      set(p.c1, 0.95);
      T.bump += (vnoise(x * 700, y * 700, z * 700) - 0.5) * 0.18;
      // Elastic side gores.
      if (Math.abs(a[A.nrm] ) > 0.5 && y > 0.1 && Math.abs(z + 0.01) < (y - 0.1) * 0.35) { set(p.c2, 0.85); T.bump += Math.sin(y * 900) * 0.15; }
      if (z < -0.05 && y > top2 - 0.03) set(p.c2, 0.85);
      break;
    }
    case 'loafer': {
      set(p.c1, 0.97);
      T.bump += (vnoise(x * 900, y * 900, z * 900) - 0.5) * 0.1;
      // The gold bit across the vamp.
      if (Math.abs(z - 0.06) < 0.006 && Math.abs(fx) < 0.025 && y > 0.05) set(p.c2, 0.2, 1);
      break;
    }
  }
  // Laces down the front of lace-ups.
  if ((s === 'runner' || s === 'court' || s === 'chunky') && z > 0.04 && y > 0.06 && Math.abs(fx) < 0.016) {
    const lace = 0.5 + 0.5 * Math.sin(z * 380);
    set(s === 'court' ? p.c1 : p.c3, 0.8);
    T.bump += lace * 0.3;
  }
  if (y > top2 - 0.008 && s !== 'loafer') T.bump += 0.12;
  return T;
}

/**
 * The texel for a body point in a casual outfit, or null where skin shows
 * (arms below a short sleeve, a rip in the jeans).
 */
export function casualTexel(cp: CasualPaint, reg: Region, x: number, y: number, z: number, armT: number, a: Float32Array, w: { arm: number }, cut: Cut, seed: number): Texel | null {
  switch (reg) {
    case Region.Shirt:
      return top(cp.top, x, y, z, armT, a, w, cut, seed);
    case Region.Shorts:
      return bottom(cp.bottom, x, y, z, a, cut, seed);
    case Region.Sock:
      T.bump = 0.5 + Math.sin(Math.atan2(x - Math.sign(x) * 0.1, z) * 40) * 0.12;
      return set(y > cut.sock - 0.015 ? k3(cp.sock, 0.92) : cp.sock, 0.92);
    case Region.Boot:
      return shoe(cp.shoes, x, y, z, a, cut, cp.sock);
    default:
      return null;
  }
}


const fakeAttr = new Float32Array(PAINT_K);
/**
 * A shoe's colour at a point, for the modelled shoes (wear.ts): `x` is the
 * point's offset across the foot from its centre line (outward positive),
 * `y` its height off the ground, `u` how far from heel (0) to toe (1), and
 * `out` how much its surface faces outward.
 */
export function shoeColor(p: Piece, x: number, y: number, u: number, out: number, cut: Cut, sock: RGB): Texel {
  fakeAttr[A.nrm] = out;
  return shoe(p, 0.1 + x, y, -0.07 + u * 0.24, fakeAttr, cut, sock);
}
