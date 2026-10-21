import { ATTR_MAX, KEY_ATTRS, xpToNext, type Attr, type Attributes, type Position } from '../shared/attributes.ts';

export interface XpResult {
  attrs: Attributes;
  xp: Partial<Record<Attr, number>>;
  levelUps: { attr: Attr; to: number }[];
}

/** Adds development XP to one attribute, levelling it up as thresholds are crossed. */
export function addXp(attrs: Attributes, xp: Partial<Record<Attr, number>>, attr: Attr, amount: number, into?: XpResult): XpResult {
  const out: XpResult = into ?? { attrs: { ...attrs }, xp: { ...xp }, levelUps: [] };
  let pool = (out.xp[attr] ?? 0) + amount;
  while (out.attrs[attr] < ATTR_MAX && pool >= xpToNext(out.attrs[attr])) {
    pool -= xpToNext(out.attrs[attr]);
    out.attrs[attr]++;
    out.levelUps.push({ attr, to: out.attrs[attr] });
  }
  if (out.attrs[attr] >= ATTR_MAX) pool = 0;
  out.xp[attr] = Math.round(pool);
  return out;
}

/** Training focus options: a single attribute, or a position-based category. */
export const TRAINING_FOCI = ['position', 'physical', 'technical', 'defending', 'attacking'] as const;
export type TrainingFocus = (typeof TRAINING_FOCI)[number] | Attr;

const CATEGORY_ATTRS: Record<string, Attr[]> = {
  physical: ['pace', 'acceleration', 'stamina', 'strength'],
  technical: ['passing', 'ballControl', 'dribbling', 'vision'],
  defending: ['marking', 'tackling', 'defPositioning', 'interception'],
  attacking: ['finishing', 'shooting', 'offPositioning', 'keyPassing'],
};

/** XP multiplier for a drill score (0–100). A quick session without the drill counts as 40. */
export function drillMultiplier(score: number | null | undefined): number {
  const s = typeof score === 'number' && Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 40;
  return Math.round((0.8 + s / 200) * 100) / 100;
}

/**
 * One training session. A focused attribute gets all the XP; a category
 * spreads it. Key attributes of the player's position train more efficiently,
 * so the chosen position shapes how a career develops.
 */
export function trainingSession(pos: Position, attrs: Attributes, xp: Partial<Record<Attr, number>>, focus: TrainingFocus, streakBonus: number, perf = 1): XpResult {
  const base = 70 * (1 + streakBonus) * perf;
  const keys = new Set(KEY_ATTRS[pos]);
  let targets: Attr[];
  if (focus === 'position') targets = KEY_ATTRS[pos];
  else if (focus in CATEGORY_ATTRS) targets = CATEGORY_ATTRS[focus];
  else targets = [focus as Attr];
  const share = targets.length === 1 ? base : (base * 1.15) / targets.length;
  let res: XpResult | undefined;
  for (const a of targets) {
    const eff = keys.has(a) ? 1.25 : 0.85;
    res = addXp(attrs, xp, a, share * eff, res);
  }
  return res!;
}

/** XP earned from an official match: performance matters, but everyone who plays progresses. */
export function matchXp(pos: Position, attrs: Attributes, xp: Partial<Record<Attr, number>>, rating: number, seed: number): XpResult {
  const total = 24 + Math.max(0, rating - 5) * 9;
  const keys = KEY_ATTRS[pos];
  const a1 = keys[seed % keys.length];
  const a2 = keys[(seed >> 3) % keys.length];
  let res = addXp(attrs, xp, a1, total * 0.6);
  res = addXp(res.attrs, res.xp, a2, total * 0.4, res);
  return res;
}
