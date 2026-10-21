// Avatar options. Rendered as layered SVG portraits in the UI and used to
// tint the toy figures in the 3D match viewer.

export const SKIN_TONES = ['#f6d7c3', '#e9b994', '#d39a6a', '#b07548', '#8a5530', '#5e3a20'];
export const HAIR_COLORS = ['#1b1714', '#3b2619', '#6b4423', '#a8743f', '#d9b26b', '#b8452c', '#d8d4cc', '#2b3a8c'];
export const HAIR_STYLES = ['Buzz', 'Short', 'Crop', 'Quiff', 'Curls', 'Afro', 'Long', 'Bun', 'Mohawk', 'Bald'];
export const BEARDS = ['None', 'Stubble', 'Goatee', 'Full', 'Moustache'];
export const FACES = ['Calm', 'Focused', 'Smiley', 'Fierce'];
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
}

export const DEFAULT_APPEARANCE: Appearance = { skin: 1, hair: 1, hairColor: 1, beard: 0, face: 0, accessory: 0, boots: 0 };

const LIMITS: Record<keyof Appearance, number> = {
  skin: SKIN_TONES.length,
  hair: HAIR_STYLES.length,
  hairColor: HAIR_COLORS.length,
  beard: BEARDS.length,
  face: FACES.length,
  accessory: ACCESSORIES.length,
  boots: BOOT_COLORS.length,
};

export function sanitizeAppearance(a: unknown): Appearance {
  const out = { ...DEFAULT_APPEARANCE };
  if (!a || typeof a !== 'object') return out;
  for (const k of Object.keys(LIMITS) as (keyof Appearance)[]) {
    const v = (a as Record<string, unknown>)[k];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < LIMITS[k]) out[k] = v;
  }
  return out;
}

export function randomAppearance(rnd: () => number): Appearance {
  const r = (n: number) => Math.floor(rnd() * n);
  return {
    skin: r(SKIN_TONES.length),
    hair: r(HAIR_STYLES.length),
    hairColor: r(6),
    beard: rnd() < 0.55 ? 0 : r(BEARDS.length),
    face: r(FACES.length),
    accessory: rnd() < 0.75 ? 0 : r(ACCESSORIES.length),
    boots: r(BOOT_COLORS.length),
  };
}
