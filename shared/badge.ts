// Club badge model: the options a club can pick, the vector geometry behind
// them, and the server-side cleaner. Badges saved before the editor grew
// (just { shape, icon }) still render the same, coloured from the kit.

export interface Badge {
  shape: number;
  icon: number;
  pattern?: number;
  border?: number;
  /** Colours; any left out fall back to the kit colours. */
  base?: string;
  patternColor?: string;
  emblemColor?: string;
  borderColor?: string;
  accent?: string;
  textColor?: string;
  /** Emblem size in percent and offset / tilt. */
  iconScale?: number;
  iconX?: number;
  iconY?: number;
  iconRot?: number;
  text?: string;
  textPos?: number;
  stars?: number;
  gloss?: boolean;
}

const circle = (x: number, y: number, r: number, cw = true) =>
  `M${x - r} ${y} A${r} ${r} 0 1 ${cw ? 1 : 0} ${x + r} ${y} A${r} ${r} 0 1 ${cw ? 1 : 0} ${x - r} ${y} Z`;
const f = (n: number) => +n.toFixed(2);
/** A pointed leaf from (x, y) along angle `a` (radians). */
function leaf(x: number, y: number, a: number, len: number, w: number) {
  const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
  const mx = (x + ex) / 2, my = (y + ey) / 2;
  const nx = -Math.sin(a) * w, ny = Math.cos(a) * w;
  return `M${f(x)} ${f(y)} Q${f(mx + nx)} ${f(my + ny)} ${f(ex)} ${f(ey)} Q${f(mx - nx)} ${f(my - ny)} ${f(x)} ${f(y)} Z`;
}

export const BADGE_SHAPES: { name: string; d: string }[] = [
  { name: 'Shield', d: 'M50 4 L92 16 V50 C92 76 72 92 50 98 C28 92 8 76 8 50 V16 Z' },
  { name: 'Roundel', d: 'M50 4 A46 46 0 1 1 49.9 4 Z' },
  { name: 'Diamond', d: 'M50 3 L95 50 L50 97 L5 50 Z' },
  { name: 'Crest', d: 'M14 8 H86 L92 30 C92 66 74 88 50 97 C26 88 8 66 8 30 Z' },
  { name: 'Iberian', d: 'M10 6 H90 V58 A40 40 0 0 1 10 58 Z' },
  { name: 'Hexagon', d: 'M50 3 L91 26.5 V73.5 L50 97 L9 73.5 V26.5 Z' },
  { name: 'Square', d: 'M22 6 H78 Q94 6 94 22 V78 Q94 94 78 94 H22 Q6 94 6 78 V22 Q6 6 22 6 Z' },
  { name: 'Octagon', d: 'M31 4 H69 L96 31 V69 L69 96 H31 L4 69 V31 Z' },
  { name: 'French', d: 'M8 6 H92 V70 Q92 82 80 82 H62 Q52 82 50 96 Q48 82 38 82 H20 Q8 82 8 70 Z' },
  { name: 'Castle', d: 'M8 4 H24 V14 H38 V4 H62 V14 H76 V4 H92 V52 C92 76 74 92 50 98 C26 92 8 76 8 52 Z' },
  { name: 'Pennant', d: 'M12 4 H88 V96 L50 78 L12 96 Z' },
  { name: 'Oval', d: 'M50 3 C78 3 92 24 92 50 C92 76 78 97 50 97 C22 97 8 76 8 50 C8 24 22 3 50 3 Z' },
  { name: 'Arched', d: 'M50 2 C64 9 80 9 88 6 V48 C88 76 70 92 50 98 C30 92 12 76 12 48 V6 C20 9 36 9 50 2 Z' },
  { name: 'Pentagon', d: 'M50 3 L96 37 L78 96 H22 L4 37 Z' },
  { name: 'Heater', d: 'M8 6 H92 C92 50 78 80 50 98 C22 80 8 50 8 6 Z' },
  { name: 'Ticket', d: 'M8 6 H92 V40 A10 10 0 0 0 92 60 V94 H8 V60 A10 10 0 0 0 8 40 Z' },
];

const sun = [circle(50, 50, 12), ...Array.from({ length: 10 }, (_, i) => {
  const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
  const p = (r: number, da: number) => `${f(50 + Math.cos(a + da) * r)} ${f(50 + Math.sin(a + da) * r)}`;
  return `M${p(15, -0.17)} L${p(27, 0)} L${p(15, 0.17)} Z`;
})];
const flower = [...Array.from({ length: 6 }, (_, i) => leaf(50, 50, (i / 6) * Math.PI * 2 - Math.PI / 2, 27, 9)), circle(50, 50, 6)];
const laurel = [...Array.from({ length: 7 }, (_, i) => {
  const t = 0.35 + i * 0.36;
  const x = 50 - Math.sin(t) * 22, y = 52 + Math.cos(t) * 22;
  return leaf(x, y, -Math.PI / 2 - t * 0.7 - 0.5, 15, 5.5);
}), ...Array.from({ length: 7 }, (_, i) => {
  const t = 0.35 + i * 0.36;
  const x = 50 + Math.sin(t) * 22, y = 52 + Math.cos(t) * 22;
  return leaf(x, y, -Math.PI / 2 + t * 0.7 + 0.5, 15, 5.5);
})];

/** Emblems drawn inside the badge. Each is a list of paths (even-odd fill). */
export const BADGE_ICONS: { name: string; d: string[] }[] = [
  { name: 'Star', d: ['M50 26 L56.5 42 L74 43 L60.5 54 L65 71 L50 61.5 L35 71 L39.5 54 L26 43 L43.5 42 Z'] },
  { name: 'Ball', d: ['M50 30 A20 20 0 1 1 49.9 30 Z M50 38 L57 43 L54.5 51 H45.5 L43 43 Z'] },
  { name: 'Bolt', d: ['M55 24 L36 54 H49 L44 76 L64 44 H51 Z'] },
  { name: 'Crown', d: ['M30 66 L27 38 L40 50 L50 32 L60 50 L73 38 L70 66 Z'] },
  { name: 'Wing', d: ['M26 58 C34 40 52 32 76 32 C70 40 62 44 54 46 C62 48 66 52 70 58 C58 58 48 56 40 52 C36 56 32 58 26 58 Z'] },
  { name: 'Flame', d: ['M50 24 C58 36 68 42 66 58 C64 70 56 76 50 76 C42 76 34 70 34 58 C34 50 40 44 44 38 C46 46 50 48 52 48 C54 40 52 32 50 24 Z'] },
  { name: 'Monogram', d: [] },
  { name: 'Anchor', d: [`${circle(50, 29, 7)} ${circle(50, 29, 3)}`, 'M47 36 H53 V72 H47 Z', 'M37 41 H63 V46 H37 Z', 'M26 55 L35 51 L34.5 56.5 C37 65 43 70 50 70 C57 70 63 65 65.5 56.5 L65 51 L74 55 C71 70 62 78 50 78 C38 78 29 70 26 55 Z'] },
  { name: 'Tower', d: ['M34 76 V44 H30 V28 H37 V34 H43 V28 H57 V34 H63 V28 H70 V44 H66 V76 Z M45 76 V64 A5 5 0 0 1 55 64 V76 Z M47 48 H53 V56 H47 Z'] },
  { name: 'Tree', d: ['M50 22 C61 22 69 29 69 39 C76 43 76 56 68 60 C62 66 38 66 32 60 C24 56 24 43 31 39 C31 29 39 22 50 22 Z', 'M46 60 H54 V78 H46 Z'] },
  { name: 'Peaks', d: ['M20 74 L40 40 L48 52 L59 30 L80 74 Z M59 30 L52 44 L56 42 L59 46 L63 41 L66 44 Z'] },
  { name: 'Waves', d: ['M22 44 C30 36 38 36 44 44 C50 52 58 52 64 44 C70 36 76 36 78 40 V48 C74 46 70 48 66 52 C58 60 48 60 42 52 C36 44 30 46 22 52 Z', 'M22 60 C30 52 38 52 44 60 C50 68 58 68 64 60 C70 52 76 52 78 56 V64 C74 62 70 64 66 68 C58 76 48 76 42 68 C36 60 30 62 22 68 Z'] },
  { name: 'Sun', d: sun },
  { name: 'Moon', d: ['M60 26 A25 25 0 1 0 60 74 A24 24 0 0 1 60 26 Z'] },
  { name: 'Heart', d: ['M50 74 C30 60 22 50 24 40 C26 30 38 26 50 38 C62 26 74 30 76 40 C78 50 70 60 50 74 Z'] },
  { name: 'Gem', d: ['M36 28 H64 L76 42 L50 76 L24 42 Z M38 42 L50 70 L62 42 Z'] },
  { name: 'Arrow', d: ['M50 22 L74 46 H59 V78 H41 V46 H26 Z'] },
  { name: 'Trident', d: ['M47 30 H53 V78 H47 Z', 'M50 18 L56 32 H44 Z', 'M31 24 L35 24 L37 40 C38 46 43 49 50 49 C57 49 62 46 63 40 L65 24 L69 24 L69 42 C69 51 61 56 50 56 C39 56 31 51 31 42 Z', 'M33 16 L37 26 H29 Z', 'M67 16 L71 26 H63 Z'] },
  { name: 'Clover', d: [circle(50, 36, 10), circle(39, 52, 10), circle(61, 52, 10), 'M48.5 56 H51.5 L56 78 H52 Z'] },
  { name: 'Flower', d: flower },
  { name: 'Eagle', d: ['M50 28 L57 40 L78 30 L71 46 L82 46 L64 58 L56 56 L55 72 L50 80 L45 72 L44 56 L36 58 L18 46 L29 46 L22 30 L43 40 Z'] },
  { name: 'Key', d: [`${circle(50, 32, 11)} ${circle(50, 32, 5)}`, 'M47 42 H53 V78 H47 Z', 'M53 62 H63 V67 H53 Z', 'M53 71 H60 V76 H53 Z'] },
  { name: 'Horseshoe', d: ['M29 28 V50 C29 65 38 75 50 75 C62 75 71 65 71 50 V28 H61 V50 C61 59 56 65 50 65 C44 65 39 59 39 50 V28 Z'] },
  { name: 'Swords', d: ['M28 24 L33 24 L68 63 L64 67 Z', 'M72 24 L67 24 L32 63 L36 67 Z', 'M58 63 L66 55 L70 59 L62 67 Z', 'M42 63 L34 55 L30 59 L38 67 Z', 'M64 66 L68 70 L74 76 L70 78 Z', 'M36 66 L32 70 L26 76 L30 78 Z'] },
  { name: 'Cross', d: ['M44 24 H56 V44 H76 V56 H56 V76 H44 V56 H24 V44 H44 Z'] },
  { name: 'Paw', d: ['M50 50 C60 50 68 60 66 68 C64 76 56 74 50 74 C44 74 36 76 34 68 C32 60 40 50 50 50 Z', circle(36, 44, 6), circle(46, 34, 6), circle(57, 34, 6), circle(66, 44, 6)] },
  { name: 'Laurel', d: laurel },
  { name: 'Hand', d: ['M36 50 V34 A3.5 3.5 0 0 1 43 34 V46 V28 A3.5 3.5 0 0 1 50 28 V46 V30 A3.5 3.5 0 0 1 57 30 V48 V36 A3.5 3.5 0 0 1 64 36 V58 C64 70 58 78 48 78 C40 78 34 72 30 62 L26 52 A3.5 3.5 0 0 1 32 48 L36 56 Z'] },
  { name: 'Ship', d: ['M24 62 H76 L68 74 H32 Z', 'M49 24 H52 V60 H49 Z', 'M53 28 L72 56 H53 Z', 'M47 34 L32 56 H47 Z'] },
  { name: 'Wolf', d: ['M30 22 L44 38 H56 L70 22 L68 46 C68 60 60 70 50 78 C40 70 32 60 32 46 Z M38 48 L46 52 L40 54 Z M62 48 L54 52 L60 54 Z'] },
  { name: 'Bull', d: ['M22 30 C24 40 32 44 38 42 L38 54 C38 66 44 74 50 76 C56 74 62 66 62 54 L62 42 C68 44 76 40 78 30 C72 36 66 36 60 34 H40 C34 36 28 36 22 30 Z M42 50 L47 54 L42 55 Z M58 50 L53 54 L58 55 Z'] },
];

export const BADGE_PATTERNS = ['Classic', 'Plain', 'Stripes', 'Hoops', 'Halves', 'Quarters', 'Sash', 'Chevron', 'Checks', 'Pinstripe', 'Cross', 'Saltire', 'Sunburst', 'Split', 'Chief', 'Dots'];
export const BADGE_BORDERS = ['None', 'Thin', 'Classic', 'Bold', 'Double', 'Inset'];
export const BADGE_TEXT_POS = ['None', 'Band', 'Arc', 'Ribbon'];
export const BADGE_COLOR_SLOTS = [
  { key: 'base', label: 'Field' },
  { key: 'patternColor', label: 'Pattern' },
  { key: 'emblemColor', label: 'Emblem' },
  { key: 'borderColor', label: 'Border' },
  { key: 'accent', label: 'Stars & ribbon' },
  { key: 'textColor', label: 'Text' },
] as const;
export type BadgeColorKey = (typeof BADGE_COLOR_SLOTS)[number]['key'];

export const BADGE_TEXT_MAX = 14;
export const BADGE_STARS_MAX = 5;

/** Every option filled in, with colours taken from the kit where unset. */
export type FullBadge = Required<Badge>;
export function fullBadge(b: Partial<Badge> | null | undefined, kit: { primary: string; secondary: string }): FullBadge {
  b = b ?? {};
  return {
    shape: b.shape ?? 0,
    icon: b.icon ?? 0,
    pattern: b.pattern ?? 0,
    border: b.border ?? 2,
    base: b.base ?? kit.primary,
    patternColor: b.patternColor ?? kit.secondary,
    emblemColor: b.emblemColor ?? kit.secondary,
    borderColor: b.borderColor ?? kit.secondary,
    accent: b.accent ?? '#f2c14e',
    // Empty means automatic: black or white, whichever reads best.
    textColor: b.textColor ?? '',
    iconScale: b.iconScale ?? 100,
    iconX: b.iconX ?? 0,
    iconY: b.iconY ?? 0,
    iconRot: b.iconRot ?? 0,
    text: b.text ?? '',
    textPos: b.textPos ?? 0,
    stars: b.stars ?? 0,
    gloss: b.gloss ?? true,
  };
}

const HEX = /^#[0-9a-f]{6}$/i;
const int = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, Math.round(n))) : d;
};

/** Cleans a badge sent by a client. Unknown or bad values fall back to defaults. */
export function sanitizeBadge(raw: unknown): Badge {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const b: Badge = {
    shape: int(r.shape, 0, BADGE_SHAPES.length - 1, 0),
    icon: int(r.icon, 0, BADGE_ICONS.length - 1, 0),
    pattern: int(r.pattern, 0, BADGE_PATTERNS.length - 1, 0),
    border: int(r.border, 0, BADGE_BORDERS.length - 1, 2),
    iconScale: int(r.iconScale, 40, 160, 100),
    iconX: int(r.iconX, -25, 25, 0),
    iconY: int(r.iconY, -25, 25, 0),
    iconRot: int(r.iconRot, -180, 180, 0),
    textPos: int(r.textPos, 0, BADGE_TEXT_POS.length - 1, 0),
    stars: int(r.stars, 0, BADGE_STARS_MAX, 0),
    gloss: r.gloss === undefined ? true : !!r.gloss,
  };
  for (const { key } of BADGE_COLOR_SLOTS) {
    const v = r[key];
    if (typeof v === 'string' && HEX.test(v)) b[key] = v.toLowerCase();
  }
  const text = typeof r.text === 'string' ? r.text.toUpperCase().replace(/[^\p{L}\p{N} .'&-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, BADGE_TEXT_MAX) : '';
  if (text) b.text = text;
  return b;
}
