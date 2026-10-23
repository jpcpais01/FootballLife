// A player's look: preset picks plus fine-tuning sliders. The 3D character
// (src/viewer/character) turns these into face and body shape, skin, hair and
// eyes. Preset lists only ever grow at the end so saved looks keep their
// meaning; sliders run 0..20 with 10 as neutral.

export const SKIN_TONES = ['#f6d7c3', '#e9b994', '#d39a6a', '#b07548', '#8a5530', '#6b4228', '#fbe6d6', '#f1c9a6', '#c88b5c', '#9d6541', '#7a4b2c', '#5a3521'];
/** Skin swatches from lightest to darkest, for the editor. */
export const SKIN_ORDER = [6, 0, 7, 1, 2, 8, 3, 9, 4, 10, 5, 11];
export const HAIR_COLORS = ['#1b1714', '#3b2619', '#6b4423', '#a8743f', '#d9b26b', '#b8452c', '#d8d4cc', '#2b3a8c', '#0c0a09', '#8a5a2b', '#efe2b8', '#7c7f86', '#c8662f', '#d94f8a'];
export const HAIR_ORDER = [8, 0, 1, 2, 9, 3, 4, 10, 12, 5, 11, 6, 7, 13];
export const HAIR_STYLES = [
  'Buzz', 'Short', 'Crop', 'Quiff', 'Curls', 'Afro', 'Long', 'Bun', 'Mohawk', 'Bald', 'Fade', 'Slick back', 'Side part', 'Fringe', 'Spiky', 'Waves', 'Dreads', 'Cornrows', 'Man bun', 'Mullet',
  'Undercut', 'Twists', 'Ponytail', 'High top',
];
export const BEARDS = ['None', 'Stubble', 'Goatee', 'Full', 'Moustache', 'Heavy stubble', 'Chin strap', 'Circle', 'Long beard', 'Soul patch'];
export const FACES = ['Calm', 'Focused', 'Smiley', 'Fierce', 'Cheeky', 'Determined'];
export const FACE_SHAPES = ['Oval', 'Round', 'Square', 'Long', 'Heart', 'Angular', 'Triangle'];
export const EYES = ['Round', 'Almond', 'Narrow', 'Hooded', 'Wide', 'Upturned'];
export const EYE_COLORS = ['#3b2414', '#17110d', '#7a5a2e', '#4f7a3a', '#3f78b8', '#7e8c96', '#a8741e', '#7fb2d8'];
export const EYE_COLOR_NAMES = ['Brown', 'Dark', 'Hazel', 'Green', 'Blue', 'Grey', 'Amber', 'Light blue'];
export const BROWS = ['Natural', 'Thick', 'Thin', 'Arched', 'Straight', 'Bushy'];
export const NOSES = ['Straight', 'Button', 'Broad', 'Long', 'Roman', 'Small'];
export const MOUTHS = ['Medium', 'Full', 'Thin', 'Wide', 'Small'];
export const MARKS = ['None', 'Freckles', 'Mole', 'Scar', 'Rosy cheeks', 'Eye black'];
export const ACCESSORIES = ['None', 'Headband', 'Earring', 'Sweatband', 'Gold chain'];
export const BOOT_COLORS = ['#c6ff3d', '#ffffff', '#111111', '#ff4d6d', '#3dd6ff', '#ffb020'];
/** Facial heritage: the overall cast of the features, blended in the face model. */
export const HERITAGE = ['European', 'African', 'East Asian', 'South Asian', 'Latin', 'Mixed'];

/** Fine-tuning sliders, grouped for the editor. */
export const SLIDERS = {
  headW: 'Head width',
  jaw: 'Jaw',
  chinL: 'Chin length',
  chinP: 'Chin forward',
  chinW: 'Chin width',
  cheekB: 'Cheekbones',
  cheekV: 'Cheeks',
  eyeSize: 'Eye size',
  eyeSep: 'Eye spacing',
  eyeY: 'Eye height',
  eyeTilt: 'Eye tilt',
  eyeOpen: 'Eye opening',
  eyeFold: 'Eyelid fold',
  browH: 'Brow height',
  browA: 'Brow angle',
  noseW: 'Nose width',
  noseL: 'Nose length',
  noseP: 'Nose projection',
  noseHump: 'Nose bridge',
  noseTip: 'Nose tip',
  noseUp: 'Tip up',
  mouthW: 'Mouth width',
  lipU: 'Upper lip',
  lipL: 'Lower lip',
  earS: 'Ear size',
  earOut: 'Ears out',
  neckW: 'Neck',
  muscle: 'Muscle',
  mass: 'Build',
} as const;
export type SliderKey = keyof typeof SLIDERS;
export const SLIDER_KEYS = Object.keys(SLIDERS) as SliderKey[];
export const SLIDER_STEPS = 21;

export interface Appearance extends Record<SliderKey, number> {
  skin: number;
  hair: number;
  hairColor: number;
  beard: number;
  face: number;
  accessory: number;
  boots: number;
  faceShape: number;
  eyes: number;
  eyeColor: number;
  brows: number;
  nose: number;
  mouth: number;
  marks: number;
  heritage: number;
}

const NEUTRAL = Object.fromEntries(SLIDER_KEYS.map((k) => [k, 10])) as Record<SliderKey, number>;

export const DEFAULT_APPEARANCE: Appearance = {
  skin: 1, hair: 1, hairColor: 1, beard: 0, face: 0, accessory: 0, boots: 0, faceShape: 0, eyes: 1, eyeColor: 0, brows: 0, nose: 0, mouth: 0, marks: 0, heritage: 0,
  ...NEUTRAL,
  muscle: 13,
};

export const LIMITS: Record<keyof Appearance, number> = {
  skin: SKIN_TONES.length,
  hair: HAIR_STYLES.length,
  hairColor: HAIR_COLORS.length,
  beard: BEARDS.length,
  face: FACES.length,
  accessory: ACCESSORIES.length,
  boots: BOOT_COLORS.length,
  faceShape: FACE_SHAPES.length,
  eyes: EYES.length,
  eyeColor: EYE_COLORS.length,
  brows: BROWS.length,
  nose: NOSES.length,
  mouth: MOUTHS.length,
  marks: MARKS.length,
  heritage: HERITAGE.length,
  ...(Object.fromEntries(SLIDER_KEYS.map((k) => [k, SLIDER_STEPS])) as Record<SliderKey, number>),
};

/** Features added after launch; older looks get a stable pick derived from their other choices. */
const LATER: (keyof Appearance)[] = ['faceShape', 'eyes', 'eyeColor', 'brows', 'nose', 'mouth'];

const DARK = [3, 4, 5, 9, 10, 11];

export function sanitizeAppearance(a: unknown): Appearance {
  const out = { ...DEFAULT_APPEARANCE };
  const src = a && typeof a === 'object' ? (a as Record<string, unknown>) : {};
  for (const k of Object.keys(LIMITS) as (keyof Appearance)[]) {
    const v = src[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < LIMITS[k]) out[k] = v;
  }
  let h = (out.skin * 73856093) ^ (out.hair * 19349663) ^ (out.hairColor * 83492791) ^ (out.beard * 2654435761) ^ (out.face * 97);
  const next = () => (h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0);
  for (const k of LATER) {
    next();
    if (typeof src[k] !== 'number') out[k] = k === 'eyeColor' ? darkEyes(out.skin, h) : h % LIMITS[k];
  }
  // Looks saved before heritage and sliders: a likely heritage from the skin tone, and gentle variety.
  next();
  if (typeof src.heritage !== 'number') out.heritage = heritageFor(out.skin, h);
  for (const k of SLIDER_KEYS) {
    next();
    if (typeof src[k] !== 'number') out[k] = Math.max(0, Math.min(20, DEFAULT_APPEARANCE[k] + ((h % 9) - 4)));
  }
  return out;
}

function heritageFor(skin: number, h: number) {
  if (DARK.includes(skin)) return skin === 3 || skin === 9 ? [4, 5, 3][h % 3] : h % 4 === 0 ? 5 : 1;
  if (skin === 2 || skin === 8) return [4, 3, 2, 0][h % 4];
  return h % 7 === 0 ? 2 : 0;
}

// Darker skin tones mostly get brown or dark eyes.
function darkEyes(skin: number, h: number) {
  return DARK.includes(skin) ? h % 3 : h % 6;
}

export function randomAppearance(rnd: () => number): Appearance {
  const r = (n: number) => Math.floor(rnd() * n);
  // Sliders cluster around neutral, so random players look like real people.
  const s = () => Math.max(0, Math.min(20, Math.round(10 + (rnd() + rnd() + rnd() - 1.5) * 7)));
  const skin = r(SKIN_TONES.length);
  const sliders = Object.fromEntries(SLIDER_KEYS.map((k) => [k, s()])) as Record<SliderKey, number>;
  sliders.muscle = Math.max(8, Math.min(20, sliders.muscle + 3));
  return {
    skin,
    hair: r(HAIR_STYLES.length),
    hairColor: DARK.includes(skin) ? (rnd() < 0.9 ? [8, 0, 1][r(3)] : r(HAIR_COLORS.length)) : rnd() < 0.85 ? HAIR_ORDER[r(9)] : r(HAIR_COLORS.length),
    beard: rnd() < 0.5 ? 0 : r(BEARDS.length),
    face: r(FACES.length),
    accessory: rnd() < 0.75 ? 0 : r(ACCESSORIES.length),
    boots: r(BOOT_COLORS.length),
    faceShape: r(FACE_SHAPES.length),
    eyes: r(EYES.length),
    eyeColor: darkEyes(skin, r(1e6)),
    brows: r(BROWS.length),
    nose: r(NOSES.length),
    mouth: r(MOUTHS.length),
    marks: rnd() < 0.75 ? 0 : 1 + r(MARKS.length - 1),
    heritage: heritageFor(skin, r(1e6)),
    ...sliders,
  };
}
