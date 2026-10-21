// Attribute model shared by server (sim, progression) and client (UI).
// Every player carries all attributes on a 1–100 scale; the overall rating is
// a position-weighted fit, not a plain average.

export const POSITIONS = ['GK', 'CB', 'FB', 'DM', 'CM', 'AM', 'WG', 'ST'] as const;
export type Position = (typeof POSITIONS)[number];

export const POSITION_NAMES: Record<Position, string> = {
  GK: 'Goalkeeper',
  CB: 'Centre-back',
  FB: 'Full-back',
  DM: 'Defensive midfielder',
  CM: 'Central midfielder',
  AM: 'Attacking midfielder',
  WG: 'Winger',
  ST: 'Striker',
};

export const ATTRIBUTES = [
  // Goalkeeping
  'reflexes', 'gkPositioning', 'aerialReach', 'oneOnOne', 'distribution',
  // Defending
  'marking', 'tackling', 'defPositioning', 'interception',
  // Physical
  'pace', 'acceleration', 'stamina', 'strength', 'heading',
  // Playmaking
  'passing', 'vision', 'keyPassing', 'ballControl', 'decisions', 'crossing',
  // Attacking
  'dribbling', 'shooting', 'finishing', 'offPositioning',
] as const;
export type Attr = (typeof ATTRIBUTES)[number];
export type Attributes = Record<Attr, number>;

export const ATTR_LABELS: Record<Attr, string> = {
  reflexes: 'Reflexes', gkPositioning: 'Positioning', aerialReach: 'Aerial reach', oneOnOne: 'One-on-one',
  distribution: 'Distribution', marking: 'Marking', tackling: 'Tackling', defPositioning: 'Def. positioning',
  interception: 'Interception', pace: 'Pace', acceleration: 'Acceleration', stamina: 'Stamina',
  strength: 'Strength', heading: 'Heading', passing: 'Passing', vision: 'Vision', keyPassing: 'Key passing',
  ballControl: 'Ball control', decisions: 'Decisions', crossing: 'Crossing', dribbling: 'Dribbling',
  shooting: 'Shooting', finishing: 'Finishing', offPositioning: 'Att. positioning',
};

export const ATTR_GROUPS: { name: string; attrs: Attr[] }[] = [
  { name: 'Goalkeeping', attrs: ['reflexes', 'gkPositioning', 'aerialReach', 'oneOnOne', 'distribution'] },
  { name: 'Defending', attrs: ['marking', 'tackling', 'defPositioning', 'interception'] },
  { name: 'Physical', attrs: ['pace', 'acceleration', 'stamina', 'strength', 'heading'] },
  { name: 'Playmaking', attrs: ['passing', 'vision', 'keyPassing', 'ballControl', 'decisions', 'crossing'] },
  { name: 'Attacking', attrs: ['dribbling', 'shooting', 'finishing', 'offPositioning'] },
];

/** The five key attributes for each position (from the design spec). */
export const KEY_ATTRS: Record<Position, Attr[]> = {
  GK: ['reflexes', 'gkPositioning', 'aerialReach', 'oneOnOne', 'distribution'],
  CB: ['marking', 'tackling', 'defPositioning', 'strength', 'heading'],
  FB: ['pace', 'acceleration', 'stamina', 'tackling', 'crossing'],
  DM: ['interception', 'passing', 'defPositioning', 'stamina', 'ballControl'],
  CM: ['passing', 'vision', 'ballControl', 'stamina', 'decisions'],
  AM: ['vision', 'keyPassing', 'dribbling', 'shooting', 'ballControl'],
  WG: ['acceleration', 'pace', 'dribbling', 'crossing', 'finishing'],
  ST: ['finishing', 'offPositioning', 'strength', 'heading', 'acceleration'],
};

/** Secondary attributes that still matter a little for the position. */
const SECONDARY_ATTRS: Record<Position, Attr[]> = {
  GK: ['decisions', 'strength'],
  CB: ['interception', 'pace', 'passing', 'decisions'],
  FB: ['marking', 'defPositioning', 'dribbling', 'passing'],
  DM: ['tackling', 'marking', 'strength', 'decisions'],
  CM: ['keyPassing', 'tackling', 'shooting', 'interception'],
  AM: ['passing', 'decisions', 'finishing', 'acceleration'],
  WG: ['ballControl', 'keyPassing', 'stamina', 'shooting'],
  ST: ['shooting', 'ballControl', 'dribbling', 'pace'],
};

export function ratingWeights(pos: Position): Partial<Record<Attr, number>> {
  const w: Partial<Record<Attr, number>> = {};
  for (const a of KEY_ATTRS[pos]) w[a] = 3;
  for (const a of SECONDARY_ATTRS[pos]) w[a] = 1;
  return w;
}

/** Position fit rating, 1–99. */
export function overall(attrs: Attributes, pos: Position): number {
  const w = ratingWeights(pos);
  let sum = 0;
  let tot = 0;
  for (const k in w) {
    const a = k as Attr;
    sum += attrs[a] * w[a]!;
    tot += w[a]!;
  }
  return Math.max(1, Math.min(99, Math.round(sum / tot)));
}

export const ATTR_MIN = 1;
export const ATTR_MAX = 99;

/** Hash-based deterministic noise in [-1, 1) from a string seed. */
export function hashNoise(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/**
 * Builds an attribute set tuned for a position around a target level.
 * Key attributes sit above the level, unrelated ones well below, so the
 * player's overall lands close to `level`.
 */
export function generateAttributes(pos: Position, level: number, seed: string, spread = 5): Attributes {
  const rnd = hashNoise(seed);
  const key = new Set(KEY_ATTRS[pos]);
  const sec = new Set(SECONDARY_ATTRS[pos]);
  const out = {} as Attributes;
  for (const a of ATTRIBUTES) {
    let base: number;
    if (key.has(a)) base = level + 3;
    else if (sec.has(a)) base = level - 6;
    else if (pos === 'GK' || ATTR_GROUPS[0].attrs.includes(a)) base = Math.min(level - 25, 25);
    else base = level - 14;
    out[a] = clampAttr(Math.round(base + rnd() * spread));
  }
  return out;
}

export function clampAttr(v: number): number {
  return Math.max(ATTR_MIN, Math.min(ATTR_MAX, v));
}

/** Starting human players: modest but balanced, with room to grow. */
export const STARTING_LEVEL = 46;

/** XP needed to raise an attribute from `value` to `value + 1`. Rises steeply with level. */
export function xpToNext(value: number): number {
  return Math.round(40 + Math.pow(Math.max(0, value - 30), 1.55) * 2.2);
}
