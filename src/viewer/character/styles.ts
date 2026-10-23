// Where hair grows: the hairline and scalp coverage for each hairstyle, and the
// beard regions. The skin painter and the hair builder both read these, so the
// painted roots always sit under the modelled hair.
import { smooth } from './noise.ts';

export interface ScalpSpec {
  /** Hairline height at the forehead (head space y). */
  front: number;
  /** Temple recession, 0..1. */
  recede: number;
  /** Sideburn bottom (y). */
  burns: number;
  /** Nape hairline (y). */
  nape: number;
  /** Hair density on the sides below `fadeHi` (1 = full, 0.25 = skin fade). */
  sides: number;
  fadeLo: number;
  fadeHi: number;
  /** Mohawk: only a strip this wide (x) keeps full density. */
  strip?: number;
  /** Overall density (a shaved head is low). */
  density: number;
  /** 0 = stubble dots, 1 = short visible strands. */
  len: number;
  /** Painted 360 waves. */
  waves?: boolean;
  /** Painted braid rows. */
  rows?: boolean;
}

const S = (o: Partial<ScalpSpec>): ScalpSpec => ({ front: 0.08, recede: 0.1, burns: -0.012, nape: -0.075, sides: 1, fadeLo: -0.05, fadeHi: 0.02, density: 1, len: 1, ...o });

/** Scalp coverage per hairstyle, in the order of HAIR_STYLES. */
export const SCALP: ScalpSpec[] = [
  S({ len: 0.25, sides: 0.85, fadeLo: -0.03, fadeHi: 0.05 }), // buzz
  S({ sides: 0.8, fadeLo: -0.02, fadeHi: 0.05 }), // short
  S({ sides: 0.45, fadeLo: -0.02, fadeHi: 0.06, front: 0.078 }), // crop
  S({ sides: 0.35, fadeLo: -0.02, fadeHi: 0.06, front: 0.082 }), // quiff
  S({}), // curls
  S({ front: 0.076, recede: 0 }), // afro
  S({ recede: 0, burns: -0.03 }), // long
  S({ recede: 0, front: 0.082 }), // bun
  S({ strip: 0.026, sides: 0.18, fadeLo: 0.15, fadeHi: 0.16, len: 0.3 }), // mohawk
  S({ density: 0.14, len: 0, sides: 1 }), // bald
  S({ sides: 0.12, fadeLo: -0.01, fadeHi: 0.065, len: 0.6 }), // fade
  S({ sides: 0.7, fadeLo: -0.02, fadeHi: 0.04, front: 0.084 }), // slick back
  S({ sides: 0.75, fadeLo: -0.02, fadeHi: 0.04 }), // side part
  S({ recede: 0 }), // fringe
  S({ sides: 0.5, fadeLo: -0.02, fadeHi: 0.05 }), // spiky
  S({ len: 0.35, sides: 0.85, fadeLo: -0.03, fadeHi: 0.04, waves: true }), // waves
  S({ recede: 0 }), // dreads
  S({ recede: 0, rows: true, len: 0.4 }), // cornrows
  S({ recede: 0, front: 0.083, sides: 0.6, fadeLo: -0.02, fadeHi: 0.04 }), // man bun
  S({ burns: -0.025 }), // mullet
  S({ sides: 0.1, fadeLo: 0.01, fadeHi: 0.07, len: 0.5 }), // undercut
  S({ recede: 0, front: 0.078 }), // twists
  S({ recede: 0, front: 0.082 }), // ponytail
  S({ sides: 0.18, fadeLo: -0.01, fadeHi: 0.06, front: 0.078 }), // high top
];

/** Hairline height around the head, by |angle| from the front (atan2(x, z)). */
function hairline(phi: number, s: ScalpSpec) {
  const f = s.front;
  const pts: [number, number][] = [
    [0, f],
    [0.46, f + 0.003 + s.recede * 0.022],
    [0.86, f - 0.014 + s.recede * 0.012],
    [1.08, 0.042],
    [1.2, s.burns],
    [1.31, s.burns],
    [1.42, 0.03],
    [1.95, 0.028],
    [2.25, -0.012],
    [2.6, s.nape],
    [Math.PI + 0.01, s.nape],
  ];
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, ya] = pts[i];
    const [b, yb] = pts[i + 1];
    if (phi <= b) {
      const t = (phi - a) / (b - a);
      return ya + (yb - ya) * t * t * (3 - 2 * t);
    }
  }
  return s.nape;
}

/**
 * Hair density at a scalp point (head space), 0..1. `jit` (-1..1) roughens
 * the hairline so it never reads as a painted edge.
 */
export function scalpCover(x: number, y: number, z: number, s: ScalpSpec, jit = 0, w = 1) {
  const phi = Math.abs(Math.atan2(x / w, z));
  const line = hairline(phi, s) + jit * 0.0035;
  let d = smooth(line - 0.0035, line + 0.004, y);
  // Faded or shaved sides.
  const side = smooth(0.5, 1.1, phi);
  const fade = s.sides + (1 - s.sides) * smooth(s.fadeLo, s.fadeHi, y);
  d *= 1 - side * (1 - fade);
  if (s.strip !== undefined) {
    const keep = smooth(s.strip + 0.006, s.strip - 0.004, Math.abs(x));
    d *= s.sides + (1 - s.sides) * keep;
  }
  return d * s.density;
}

/** Beards: painted regions, density, and whether there is modelled volume. */
export interface BeardSpec { region: '' | 'full' | 'goatee' | 'tache' | 'strap' | 'circle' | 'patch'; density: number; volume: number; tache: boolean }

/** In the order of BEARDS. */
export const BEARD: BeardSpec[] = [
  { region: '', density: 0, volume: 0, tache: false }, // none
  { region: 'full', density: 0.45, volume: 0, tache: true }, // stubble
  { region: 'goatee', density: 1, volume: 0.35, tache: true }, // goatee
  { region: 'full', density: 1, volume: 0.6, tache: true }, // full
  { region: 'tache', density: 1, volume: 0.4, tache: true }, // moustache
  { region: 'full', density: 0.8, volume: 0, tache: true }, // heavy stubble
  { region: 'strap', density: 1, volume: 0.2, tache: false }, // chin strap
  { region: 'circle', density: 1, volume: 0.3, tache: true }, // circle
  { region: 'full', density: 1, volume: 1, tache: true }, // long beard
  { region: 'patch', density: 1, volume: 0.25, tache: false }, // soul patch
];

/** Face landmarks the beard regions hang off (head space, from the base mesh). */
export interface BeardFrame { mouthY: number; mouthW: number; tipY: number; chinY: number; lipZ: number; earY: number }

/**
 * Beard density at a face point (head space), 0..1, with soft edges. The lips
 * themselves are left to the painter's lip mask.
 */
export function beardCover(x: number, y: number, z: number, b: BeardSpec, f: BeardFrame) {
  if (!b.region) return 0;
  const ax = Math.abs(x);
  const my = f.mouthY;
  const mw = f.mouthW;
  const front = smooth(f.lipZ - 0.075, f.lipZ - 0.045, z);
  // Upper lip: between the nose and the lip, a little past the mouth corners.
  const tache = smooth(mw * 1.35, mw * 1.08, ax) * smooth(my + 0.004, my + 0.009, y) * smooth(f.tipY - 0.01, f.tipY - 0.019, y) * front;
  // Chin: below the lower lip, down and just under the chin.
  const chinBand = smooth(my - 0.012, my - 0.019, y) * smooth(f.chinY - 0.03, f.chinY - 0.012, y);
  const goatee = smooth(mw * 1.05, mw * 0.8, ax) * chinBand * front;
  switch (b.region) {
    case 'tache': return tache;
    case 'patch': return smooth(0.0085, 0.0055, ax) * smooth(my - 0.012, my - 0.017, y) * smooth(my - 0.038, my - 0.03, y) * front;
    case 'goatee': return Math.max(goatee, b.tache ? tache : 0);
    case 'circle': {
      // Down from the moustache's ends round the mouth to the chin.
      const sides = smooth(mw * 1.4, mw * 1.12, ax) * smooth(mw * 0.75, mw * 0.95, ax) * smooth(f.tipY - 0.012, f.tipY - 0.02, y) * front;
      return Math.max(goatee, tache, sides * smooth(f.chinY - 0.02, f.chinY, y));
    }
  }
  // Full and strap: below a line from the sideburn to the cheek above the mouth corner,
  // in front of the ear, down to where the jaw turns into the neck.
  const phi = Math.atan2(ax, z);
  const c0 = f.tipY - 0.018;
  const cheek = c0 + smooth(0.35, 1.35, phi) * (f.earY + 0.03 - c0);
  let full = smooth(cheek + 0.006, cheek - 0.008, y);
  const back = y > f.earY - 0.035 ? 1.4 : 1.58;
  full *= smooth(back + 0.05, back - 0.03, phi);
  const neck = f.chinY - 0.03 + smooth(0.3, 1.5, phi) * (f.earY - 0.085 - (f.chinY - 0.03));
  full *= smooth(neck - 0.012, neck + 0.006, y);
  if (b.region === 'strap') {
    // A band hugging the jawline.
    const jaw = f.chinY + 0.006 + smooth(0.2, 1.5, phi) * (f.earY - 0.055 - f.chinY);
    return full * smooth(0.016, 0.009, Math.abs(y - jaw));
  }
  return Math.max(full, b.tache ? tache : 0);
}
