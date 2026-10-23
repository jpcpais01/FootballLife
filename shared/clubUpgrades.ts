// Club facilities: members donate coins and stars into the club treasury and
// the president spends it on upgrades. Every effect is deliberately small, so
// a well-run club gets an edge without deciding matches on its own.

export type UpgradeId = 'stadium' | 'coach' | 'balls' | 'academy' | 'lounge';
export type PerkId = 'crest' | 'tifo' | 'bus';

export interface UpgradeLevel {
  coins: number;
  stars: number;
  /** Real hours the works take. Stars can rush them. */
  hours: number;
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  blurb: string;
  /** Effect at a given level (0 = none), for the UI. */
  effect: (lv: number) => string;
  /** What each level is called on the card, e.g. "Bigger stands". */
  stages: string[];
}

/** Costs are shared by every upgrade: levels 4 and 5 also need stars. */
export const LEVELS: UpgradeLevel[] = [
  { coins: 600, stars: 0, hours: 2 },
  { coins: 1500, stars: 0, hours: 4 },
  { coins: 3500, stars: 0, hours: 8 },
  { coins: 7000, stars: 25, hours: 16 },
  { coins: 14000, stars: 80, hours: 24 },
];
export const MAX_LEVEL = LEVELS.length;

const pct = (v: number, d = 1) => `${(v * 100).toFixed(d).replace(/\.0$/, '')}%`;

export const UPGRADES: UpgradeDef[] = [
  {
    id: 'stadium',
    name: 'Stadium',
    blurb: 'A louder home crowd. Your side plays a little better at home in the league.',
    effect: (lv) => `+${pct(stadiumEdge(lv))} home edge`,
    stages: ['Bigger stands', 'Covered roof', 'Floodlight towers', 'Hybrid pitch', 'Fortress'],
  },
  {
    id: 'coach',
    name: 'Head coach',
    blurb: 'Hire a better coach. He is staff, not a player, and builds chemistry in the starting XI.',
    effect: (lv) => `+${pct(coachChemistry(lv))} team chemistry`,
    stages: ['Local coach', 'Experienced coach', 'Tactician', 'Elite coach', 'Legend'],
  },
  {
    id: 'balls',
    name: 'Match balls & kit',
    blurb: 'Pro balls, cones and bibs. Every member gets more out of training.',
    effect: (lv) => `+${pct(ballsTraining(lv), 0)} training XP`,
    stages: ['New balls', 'Pro cones & bibs', 'Rebounders', 'Smart balls', 'Elite kit room'],
  },
  {
    id: 'academy',
    name: 'Academy',
    blurb: 'Better scouting and coaching for the AI players who fill your squad.',
    effect: (lv) => `+${pct(academyBoost(lv))} AI teammates`,
    stages: ['Scouts', 'Youth pitch', 'Residences', 'Performance lab', 'Elite academy'],
  },
  {
    id: 'lounge',
    name: 'Sponsors lounge',
    blurb: 'Bigger sponsors. Members earn more coins from official matches.',
    effect: (lv) => `+${pct(loungeCoins(lv), 0)} match coins`,
    stages: ['Local sponsor', 'Lounge bar', 'Executive boxes', 'Shirt deal', 'Global brand'],
  },
];
export const UPGRADE_BY_ID = Object.fromEntries(UPGRADES.map((u) => [u.id, u])) as Record<UpgradeId, UpgradeDef>;

export interface PerkDef { id: PerkId; name: string; blurb: string; stars: number }

/** Rare items, bought with stars only. */
export const PERKS: PerkDef[] = [
  { id: 'crest', name: 'Golden crest', blurb: 'A gold frame around the club badge on the club page and club lists.', stars: 60 },
  { id: 'tifo', name: 'Ultras tifo', blurb: 'A giant banner behind the goal. +0.5% more home edge.', stars: 120 },
  { id: 'bus', name: 'Team bus', blurb: 'Travel together. +0.5% chemistry in away matches.', stars: 150 },
];
export const PERK_BY_ID = Object.fromEntries(PERKS.map((p) => [p.id, p])) as Record<PerkId, PerkDef>;

// ---------- effects (all tiny on purpose) ----------

/** The engine's own default home advantage, which the stadium adds to. */
export const BASE_HOME_EDGE = 0.03;
/** Extra home advantage on top of the base. */
export const stadiumEdge = (lv: number) => 0.004 * lv;
/** Attribute multiplier bonus for the starting XI. */
export const coachChemistry = (lv: number) => 0.004 * lv;
/** Training XP bonus for members. */
export const ballsTraining = (lv: number) => 0.06 * lv;
/** Attribute bonus for AI players in the club's XI. */
export const academyBoost = (lv: number) => 0.008 * lv;
/** Match coin bonus for members. */
export const loungeCoins = (lv: number) => 0.05 * lv;

// ---------- state ----------

export interface Facilities {
  lv: Record<UpgradeId, number>;
  /** Works in progress: one at a time. */
  build: { id: UpgradeId; to: number; at: string } | null;
  perks: PerkId[];
}

/**
 * Reads the stored JSON. Works whose finish time has passed count as done, so
 * nothing needs a timer: `done` tells the caller to persist the new state.
 */
export function readFacilities(raw: unknown, now = Date.now()): Facilities & { done?: UpgradeId } {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Facilities>;
  const lv = {} as Record<UpgradeId, number>;
  for (const u of UPGRADES) {
    const v = Number(r.lv?.[u.id] ?? 0);
    lv[u.id] = Number.isFinite(v) ? Math.max(0, Math.min(MAX_LEVEL, Math.floor(v))) : 0;
  }
  const perks = (Array.isArray(r.perks) ? r.perks : []).filter((p): p is PerkId => p in PERK_BY_ID);
  let build = r.build && r.build.id in UPGRADE_BY_ID ? r.build : null;
  let done: UpgradeId | undefined;
  if (build && new Date(build.at).getTime() <= now) {
    lv[build.id] = Math.max(lv[build.id], Math.min(MAX_LEVEL, build.to));
    done = build.id;
    build = null;
  }
  return { lv, build, perks, done };
}

/** Stars to finish the current works now: one star per 20 minutes left. */
export function rushCost(at: string, now = Date.now()) {
  return Math.max(1, Math.ceil((new Date(at).getTime() - now) / (20 * 60_000)));
}

/** Everything the match engine and rewards need from a club's facilities. */
export function clubEffects(raw: unknown, now = Date.now()) {
  const f = readFacilities(raw, now);
  const has = (p: PerkId) => f.perks.includes(p);
  return {
    homeEdge: stadiumEdge(f.lv.stadium) + (has('tifo') ? 0.005 : 0),
    chemistry: coachChemistry(f.lv.coach),
    awayChemistry: has('bus') ? 0.005 : 0,
    academy: academyBoost(f.lv.academy),
    training: ballsTraining(f.lv.balls),
    coins: loungeCoins(f.lv.lounge),
  };
}
