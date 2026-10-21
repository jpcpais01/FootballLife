// Cosmetic catalogue. Items are purely visual: nothing here touches match
// simulation. Most are sold in the shop for coins; some can only be earned
// through achievements or season trophies.

export const SLOTS = ['boots', 'head', 'neck', 'wrist', 'outfit', 'card', 'celebration', 'title'] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABELS: Record<Slot, string> = {
  boots: 'Boots',
  head: 'Headwear',
  neck: 'Neckwear',
  wrist: 'Wristwear',
  outfit: 'Off-pitch outfit',
  card: 'Profile card',
  celebration: 'Goal celebration',
  title: 'Title',
};

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export const RARITY_COLORS: Record<Rarity, string> = { common: '#9aa4ae', rare: '#3dd6ff', epic: '#b57bff', legendary: '#ffc23d' };

export interface Item {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  /** Coin price; 0 means it cannot be bought. */
  price: number;
  /** How it is obtained when not sold. */
  source?: string;
  desc: string;
  /** Main and accent colours, used by the portrait and the 3D figure. */
  c1?: string;
  c2?: string;
  /** Visual variant within the slot. */
  style?: string;
  metal?: boolean;
}

export const ITEMS: Item[] = [
  // Boots
  { id: 'boots-ice', name: 'Glacier', slot: 'boots', rarity: 'common', price: 180, desc: 'Frosted white with an ice-blue sole.', c1: '#e8f6ff', c2: '#7fd3ff' },
  { id: 'boots-flame', name: 'Inferno', slot: 'boots', rarity: 'rare', price: 520, desc: 'Molten orange fading into red.', c1: '#ff6a1f', c2: '#ffd23d' },
  { id: 'boots-galaxy', name: 'Nebula', slot: 'boots', rarity: 'epic', price: 1400, desc: 'Deep violet with a cyan glow.', c1: '#5b2bd6', c2: '#3dfcff' },
  { id: 'boots-chrome', name: 'Chrome', slot: 'boots', rarity: 'epic', price: 1800, desc: 'Mirror-polished, impossible to miss.', c1: '#e6ebf0', c2: '#9aa6b2', metal: true },
  { id: 'boots-gold', name: 'Golden Boot', slot: 'boots', rarity: 'legendary', price: 0, source: "Win a season's Golden Boot", desc: 'Solid gold. Only for the league top scorer.', c1: '#ffcf3d', c2: '#fff1b0', metal: true },

  // Headwear
  { id: 'head-band-lime', name: 'Lime headband', slot: 'head', rarity: 'common', price: 150, desc: 'Keeps the sweat out, looks sharp.', c1: '#c6ff3d', style: 'band' },
  { id: 'head-band-red', name: 'Crimson headband', slot: 'head', rarity: 'common', price: 150, desc: 'A bold red stripe.', c1: '#ff3d5a', style: 'band' },
  { id: 'head-alice', name: 'Alice band', slot: 'head', rarity: 'rare', price: 420, desc: 'Thin black band for flowing hair.', c1: '#16181b', style: 'alice' },
  { id: 'head-band-gold', name: 'Gold headband', slot: 'head', rarity: 'epic', price: 1200, desc: 'Gold-threaded, for big nights.', c1: '#ffcf3d', style: 'band', metal: true },
  { id: 'head-captain', name: "Skipper's band", slot: 'head', rarity: 'rare', price: 0, source: 'Achievement: Hat-trick hero', desc: 'Lime and black hoops for the hat-trick club.', c1: '#c6ff3d', c2: '#16181b', style: 'band' },

  // Neckwear
  { id: 'neck-chain-silver', name: 'Silver chain', slot: 'neck', rarity: 'common', price: 220, desc: 'A modest silver link.', c1: '#d8dee6', metal: true, style: 'chain' },
  { id: 'neck-chain-gold', name: 'Gold chain', slot: 'neck', rarity: 'rare', price: 650, desc: 'Heavy, shiny, unmistakable.', c1: '#ffcf3d', metal: true, style: 'chain' },
  { id: 'neck-snood', name: 'Winter snood', slot: 'neck', rarity: 'rare', price: 480, desc: 'For cold evening kickoffs.', c1: '#16181b', style: 'snood' },
  { id: 'neck-medal', name: "Champion's medal", slot: 'neck', rarity: 'legendary', price: 0, source: 'Win the league', desc: 'Earned by winning the league title.', c1: '#ffcf3d', c2: '#c6ff3d', metal: true, style: 'medal' },

  // Wristwear
  { id: 'wrist-tape', name: 'Wrist tape', slot: 'wrist', rarity: 'common', price: 120, desc: 'Plain white tape, pro style.', c1: '#f4f4f0' },
  { id: 'wrist-band-lime', name: 'Lime sweatband', slot: 'wrist', rarity: 'common', price: 140, desc: 'Terry-cloth in signature lime.', c1: '#c6ff3d' },
  { id: 'wrist-band-black', name: 'Black sweatband', slot: 'wrist', rarity: 'common', price: 140, desc: 'Stealthy.', c1: '#16181b' },
  { id: 'wrist-gold', name: 'Gold cuff', slot: 'wrist', rarity: 'epic', price: 1500, desc: 'Gold cuff with a satin finish.', c1: '#ffcf3d', metal: true },

  // Off-pitch outfits (portrait and profile)
  { id: 'outfit-tee', name: 'Clean tee', slot: 'outfit', rarity: 'common', price: 160, desc: 'Crisp white, goes with everything.', c1: '#f2f2ee', c2: '#d6d6d0', style: 'tee' },
  { id: 'outfit-hoodie', name: 'Studio hoodie', slot: 'outfit', rarity: 'common', price: 260, desc: 'Charcoal hoodie, lime drawstrings.', c1: '#25292e', c2: '#c6ff3d', style: 'hoodie' },
  { id: 'outfit-track', name: 'Retro track top', slot: 'outfit', rarity: 'rare', price: 700, desc: 'Navy with cream stripes, 1986 vibes.', c1: '#1d2b55', c2: '#f3e7c9', style: 'track' },
  { id: 'outfit-bomber', name: 'Lime bomber', slot: 'outfit', rarity: 'rare', price: 880, desc: 'Satin bomber in loud lime.', c1: '#a8e62a', c2: '#16181b', style: 'bomber' },
  { id: 'outfit-puffer', name: 'Arctic puffer', slot: 'outfit', rarity: 'epic', price: 1600, desc: 'Big, white and warm.', c1: '#f4f6f8', c2: '#c9d2da', style: 'puffer' },
  { id: 'outfit-suit', name: 'Gala suit', slot: 'outfit', rarity: 'legendary', price: 3800, desc: 'Midnight tuxedo for award nights.', c1: '#121722', c2: '#ffffff', style: 'suit' },

  // Profile cards
  { id: 'card-carbon', name: 'Carbon', slot: 'card', rarity: 'common', price: 200, desc: 'Woven carbon fibre.', c1: '#1b1e22', c2: '#2b3036', style: 'carbon' },
  { id: 'card-wave', name: 'Lime wave', slot: 'card', rarity: 'rare', price: 600, desc: 'Flowing lime light.', c1: '#0f1a08', c2: '#c6ff3d', style: 'wave' },
  { id: 'card-night', name: 'Floodlights', slot: 'card', rarity: 'rare', price: 750, desc: 'Night match under the lights.', c1: '#0b1630', c2: '#7fb3ff', style: 'night' },
  { id: 'card-holo', name: 'Holo', slot: 'card', rarity: 'epic', price: 2200, desc: 'Shifting holographic foil.', c1: '#ff7ad9', c2: '#5ef0ff', style: 'holo' },
  { id: 'card-gold', name: 'Gold', slot: 'card', rarity: 'legendary', price: 4500, desc: 'The gold card. Top of the market.', c1: '#3a2a05', c2: '#ffcf3d', style: 'gold' },

  // Goal celebrations (3D match viewer)
  { id: 'cel-slide', name: 'Knee slide', slot: 'celebration', rarity: 'rare', price: 600, desc: 'Down on the knees, sliding to the corner flag.', style: 'slide' },
  { id: 'cel-plane', name: 'Aeroplane', slot: 'celebration', rarity: 'common', price: 300, desc: 'Arms out wide, banking away.', style: 'plane' },
  { id: 'cel-spin', name: 'Spin', slot: 'celebration', rarity: 'rare', price: 750, desc: 'A jumping pirouette.', style: 'spin' },
  { id: 'cel-flip', name: 'Backflip', slot: 'celebration', rarity: 'epic', price: 1900, desc: 'A full backflip. Show-off.', style: 'flip' },

  // Titles
  { id: 'title-rising', name: 'Rising Star', slot: 'title', rarity: 'common', price: 250, desc: 'Shown under your name.' },
  { id: 'title-maestro', name: 'Maestro', slot: 'title', rarity: 'rare', price: 900, desc: 'For the artists.' },
  { id: 'title-wall', name: 'The Wall', slot: 'title', rarity: 'rare', price: 900, desc: 'Nothing gets past.' },
  { id: 'title-firstgoal', name: 'Off the Mark', slot: 'title', rarity: 'common', price: 0, source: 'Achievement: First goal', desc: 'Scored a first career goal.' },
  { id: 'title-hattrick', name: 'Hat-trick Hero', slot: 'title', rarity: 'epic', price: 0, source: 'Achievement: Hat-trick hero', desc: 'Three in one match.' },
  { id: 'title-centurion', name: 'Centurion', slot: 'title', rarity: 'epic', price: 0, source: 'Achievement: Centurion', desc: '100 appearances.' },
  { id: 'title-champion', name: 'Champion', slot: 'title', rarity: 'legendary', price: 0, source: 'Win the league', desc: 'League winner.' },
  { id: 'title-pots', name: 'Player of the Season', slot: 'title', rarity: 'legendary', price: 0, source: 'Season award', desc: 'Best-rated player of a season.' },
];

export const ITEM_BY_ID: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export type Equipped = Partial<Record<Slot, string>>;

export function sanitizeEquipped(raw: unknown, owned?: Set<string>): Equipped {
  const out: Equipped = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const s of SLOTS) {
    const id = (raw as Record<string, unknown>)[s];
    if (typeof id === 'string' && ITEM_BY_ID[id]?.slot === s && (!owned || owned.has(id))) out[s] = id;
  }
  return out;
}

/** Equipped items resolved to definitions, for rendering. */
export function gear(eq: Equipped | undefined): Partial<Record<Slot, Item>> {
  const out: Partial<Record<Slot, Item>> = {};
  if (!eq) return out;
  for (const s of SLOTS) {
    const it = eq[s] && ITEM_BY_ID[eq[s]!];
    if (it) out[s] = it;
  }
  return out;
}

// ---------- daily shop ----------

function dayHash(day: number, salt: number) {
  let h = (day * 2654435761 + salt * 40503) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/** UTC day number, so the featured rotation flips at midnight UTC for everyone. */
export const shopDay = (now = Date.now()) => Math.floor(now / 86_400_000);

/** Four featured items a day, one of them on a 30% deal. */
export function featured(day = shopDay()): { ids: string[]; deal: string } {
  const pool = ITEMS.filter((i) => i.price > 0);
  const ids: string[] = [];
  for (let k = 0; ids.length < 4 && k < 50; k++) {
    const it = pool[dayHash(day, k) % pool.length];
    if (!ids.includes(it.id)) ids.push(it.id);
  }
  return { ids, deal: ids[dayHash(day, 99) % ids.length] };
}

export const DEAL_DISCOUNT = 0.3;

export function priceOf(item: Item, day = shopDay()): number {
  if (item.price <= 0) return 0;
  return featured(day).deal === item.id ? Math.round((item.price * (1 - DEAL_DISCOUNT)) / 10) * 10 : item.price;
}
