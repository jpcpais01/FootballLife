// Stars: the premium currency. Bought with real money (store not wired up
// yet), or earned slowly: rewarded ads with a daily cap, rare box drops and
// milestones. Spent on the rarest shop items and on club donations.

/** Stars per rewarded ad, and how many ads count each UTC day. */
export const AD_STARS = 2;
export const AD_DAILY_LIMIT = 5;
/** How long a rewarded ad runs before it pays out. */
export const AD_SECONDS = 15;

export interface StarPack {
  id: string;
  stars: number;
  /** Bonus stars on top, shown as "+N". */
  bonus: number;
  /** Display price; the real one will come from the store. */
  price: string;
  tag?: string;
}

export const STAR_PACKS: StarPack[] = [
  { id: 'stars-s', stars: 60, bonus: 0, price: '€0,99' },
  { id: 'stars-m', stars: 320, bonus: 30, price: '€4,99', tag: 'Popular' },
  { id: 'stars-l', stars: 700, bonus: 100, price: '€9,99' },
  { id: 'stars-xl', stars: 1500, bonus: 300, price: '€19,99', tag: 'Best value' },
];

/** Payments are not set up: buying a pack is a placeholder until a store is chosen. */
export const PAYMENTS_LIVE = false;

/** UTC day key, e.g. "2026-10-23". */
export const dayKey = (now = new Date()) => now.toISOString().slice(0, 10);
