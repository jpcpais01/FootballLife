// Avatar options, rendered by the 3D player model (on the pitch and in every
// portrait). Lists only ever grow at the end so saved looks keep their meaning.

export const SKIN_TONES = ['#f6d7c3', '#e9b994', '#d39a6a', '#b07548', '#8a5530', '#6b4228', '#fbe6d6', '#f1c9a6', '#c88b5c', '#9d6541', '#7a4b2c', '#5a3521'];
/** Skin swatches from lightest to darkest, for the editor. */
export const SKIN_ORDER = [6, 0, 7, 1, 2, 8, 3, 9, 4, 10, 5, 11];
export const HAIR_COLORS = ['#1b1714', '#3b2619', '#6b4423', '#a8743f', '#d9b26b', '#b8452c', '#d8d4cc', '#2b3a8c', '#0c0a09', '#8a5a2b', '#efe2b8', '#7c7f86', '#c8662f', '#d94f8a'];
export const HAIR_ORDER = [8, 0, 1, 2, 9, 3, 4, 10, 12, 5, 11, 6, 7, 13];
export const HAIR_STYLES = ['Buzz', 'Short', 'Crop', 'Quiff', 'Curls', 'Afro', 'Long', 'Bun', 'Mohawk', 'Bald', 'Fade', 'Slick back', 'Side part', 'Fringe', 'Spiky', 'Waves', 'Dreads', 'Cornrows', 'Man bun', 'Mullet'];
export const BEARDS = ['None', 'Stubble', 'Goatee', 'Full', 'Moustache', 'Heavy stubble', 'Chin strap', 'Circle', 'Long beard', 'Soul patch'];
export const FACES = ['Calm', 'Focused', 'Smiley', 'Fierce', 'Cheeky', 'Determined'];
export const FACE_SHAPES = ['Oval', 'Round', 'Square', 'Long', 'Heart', 'Angular'];
export const EYES = ['Round', 'Almond', 'Narrow', 'Hooded', 'Wide', 'Upturned'];
export const EYE_COLORS = ['#3b2414', '#17110d', '#7a5a2e', '#4f7a3a', '#3f78b8', '#7e8c96'];
export const EYE_COLOR_NAMES = ['Brown', 'Dark', 'Hazel', 'Green', 'Blue', 'Grey'];
export const BROWS = ['Natural', 'Thick', 'Thin', 'Arched', 'Straight', 'Bushy'];
export const NOSES = ['Straight', 'Button', 'Broad', 'Long', 'Roman', 'Small'];
export const MOUTHS = ['Medium', 'Full', 'Thin', 'Wide', 'Small'];
export const MARKS = ['None', 'Freckles', 'Mole', 'Scar', 'Rosy cheeks'];
export const ACCESSORIES = ['None', 'Headband', 'Earring', 'Sweatband', 'Gold chain'];
export const BOOT_COLORS = ['#c6ff3d', '#ffffff', '#111111', '#ff4d6d', '#3dd6ff', '#ffb020'];

export interface Appearance {
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
}

export const DEFAULT_APPEARANCE: Appearance = { skin: 1, hair: 1, hairColor: 1, beard: 0, face: 0, accessory: 0, boots: 0, faceShape: 0, eyes: 1, eyeColor: 0, brows: 0, nose: 0, mouth: 0, marks: 0 };

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
};

/** Facial features added after launch; older looks get a stable pick derived from their other choices. */
const LATER: (keyof Appearance)[] = ['faceShape', 'eyes', 'eyeColor', 'brows', 'nose', 'mouth'];

export function sanitizeAppearance(a: unknown): Appearance {
  const out = { ...DEFAULT_APPEARANCE };
  const src = a && typeof a === 'object' ? (a as Record<string, unknown>) : {};
  for (const k of Object.keys(LIMITS) as (keyof Appearance)[]) {
    const v = src[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < LIMITS[k]) out[k] = v;
  }
  let h = (out.skin * 73856093) ^ (out.hair * 19349663) ^ (out.hairColor * 83492791) ^ (out.beard * 2654435761) ^ (out.face * 97);
  for (const k of LATER) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    if (typeof src[k] !== 'number') out[k] = k === 'eyeColor' ? darkEyes(out.skin, h) : h % LIMITS[k];
  }
  return out;
}

// Darker skin tones mostly get brown or dark eyes.
function darkEyes(skin: number, h: number) {
  const dark = [3, 4, 5, 9, 10, 11].includes(skin);
  return dark ? h % 3 : h % EYE_COLORS.length;
}

export function randomAppearance(rnd: () => number): Appearance {
  const r = (n: number) => Math.floor(rnd() * n);
  const skin = r(SKIN_TONES.length);
  return {
    skin,
    hair: r(HAIR_STYLES.length),
    hairColor: rnd() < 0.85 ? HAIR_ORDER[r(9)] : r(HAIR_COLORS.length),
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
    marks: rnd() < 0.7 ? 0 : 1 + r(MARKS.length - 1),
  };
}
