// Cosmetic catalogue. Items are purely visual: nothing here touches match
// simulation. Off the pitch your player lives a casual life in his own
// clothes (top, bottoms, shoes, hats, glasses, chains, wrists); the club kit
// is only worn for the club, with boots, a headband and sweatbands. Most items
// sell for coins, the rarest for stars, and some can only be earned.

export const SLOTS = ['top', 'bottom', 'shoes', 'head', 'eyes', 'neck', 'wrist', 'boots', 'band', 'sweat', 'border', 'card', 'title', 'celebration'] as const;
export type Slot = (typeof SLOTS)[number];

export const SLOT_LABELS: Record<Slot, string> = {
  top: 'Tops',
  bottom: 'Bottoms',
  shoes: 'Sneakers',
  head: 'Hats',
  eyes: 'Shades',
  neck: 'Chains',
  wrist: 'Wrist',
  boots: 'Boots',
  band: 'Headband',
  sweat: 'Sweatband',
  border: 'Name border',
  card: 'Profile card',
  title: 'Title',
  celebration: 'Celebration',
};

/** Shop sections, each a group of slots. */
export const SECTIONS: { id: string; label: string; slots: Slot[] }[] = [
  { id: 'wear', label: 'Streetwear', slots: ['top', 'bottom', 'shoes'] },
  { id: 'drip', label: 'Accessories', slots: ['head', 'eyes', 'neck', 'wrist'] },
  { id: 'pitch', label: 'Matchday', slots: ['boots', 'band', 'sweat', 'celebration'] },
  { id: 'profile', label: 'Profile', slots: ['border', 'card', 'title'] },
];

/** Slots the casual, off-pitch look is made of. */
export const CASUAL_SLOTS: Slot[] = ['top', 'bottom', 'shoes', 'head', 'eyes', 'neck', 'wrist'];

export const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'] as const;
export type Rarity = (typeof RARITIES)[number];
export const RARITY_COLORS: Record<Rarity, string> = { common: '#9aa4ae', rare: '#3dd6ff', epic: '#b57bff', legendary: '#ffc23d', mythic: '#ff4f8b' };
export const RARITY_LABELS: Record<Rarity, string> = { common: 'Common', rare: 'Rare', epic: 'Epic', legendary: 'Legendary', mythic: 'Mythic' };

export interface Item {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  /** Coin price; 0 means it cannot be bought with coins. */
  price: number;
  /** Star price, for the rarest pieces. */
  stars?: number;
  /** How it is obtained when not sold. */
  source?: string;
  desc: string;
  /** Main, accent and third colours, used by the 3D player and the art. */
  c1?: string;
  c2?: string;
  c3?: string;
  /** Cut or shape within the slot. */
  style?: string;
  /** Graphic on a top, wash on bottoms. */
  print?: string;
  metal?: boolean;
  /** Can drop from the daily box (default: anything sold for coins). */
  box?: boolean;
}

const I = (id: string, slot: Slot, rarity: Rarity, name: string, price: number, desc: string, x: Partial<Item> = {}): Item => ({ id, slot, rarity, name, price, desc, ...x });

export const ITEMS: Item[] = [
  // ---------- Tops ----------
  I('outfit-tee', 'top', 'common', 'Clean tee', 160, 'Crisp white, goes with everything.', { style: 'tee', c1: '#f2f2ee', c2: '#d6d6d0' }),
  I('top-tee-black', 'top', 'common', 'Blackout tee', 160, 'Heavyweight black cotton.', { style: 'tee', c1: '#17191c', c2: '#2a2d31' }),
  I('top-tee-ringer', 'top', 'common', 'Ringer tee', 220, 'Cream with a lime collar and cuffs.', { style: 'tee', print: 'ringer', c1: '#efe8d6', c2: '#9bd63a' }),
  I('top-tee-breton', 'top', 'common', 'Breton stripe', 260, 'Navy stripes on off-white. Riviera off-days.', { style: 'long', print: 'stripes', c1: '#f3f0e6', c2: '#1d2b55' }),
  I('top-tee-logo', 'top', 'common', 'Club logo tee', 240, 'Sage green with a small chest emblem.', { style: 'tee', print: 'chest', c1: '#7f9a7a', c2: '#f4f1e8' }),
  I('top-tank', 'top', 'common', 'Gym tank', 180, 'For the summer and the weights room.', { style: 'tank', c1: '#d8d8d4', c2: '#b0b0aa' }),
  I('outfit-hoodie', 'top', 'common', 'Studio hoodie', 280, 'Charcoal hoodie, lime drawstrings.', { style: 'hoodie', c1: '#25292e', c2: '#c6ff3d' }),
  I('top-hoodie-cream', 'top', 'rare', 'Oat hoodie', 520, 'Heavy fleece in soft oat, tonal strings.', { style: 'hoodie', c1: '#d9cdb4', c2: '#b9ab8e' }),
  I('top-hoodie-tiedye', 'top', 'rare', 'Tie-dye hoodie', 780, 'Hand-dyed swirls of pink, blue and violet.', { style: 'hoodie', print: 'tiedye', c1: '#ff7ab8', c2: '#5ec8ff', c3: '#9b6bff' }),
  I('top-polo', 'top', 'rare', 'Knit polo', 560, 'Bottle green knit with a cream collar.', { style: 'polo', c1: '#1f4d3a', c2: '#efe6cf' }),
  I('top-shirt-flannel', 'top', 'rare', 'Flannel shirt', 620, 'Red and black check, sleeves rolled.', { style: 'shirt', print: 'check', c1: '#a3202a', c2: '#1a1a1a' }),
  I('top-shirt-hawaii', 'top', 'rare', 'Holiday shirt', 680, 'Palm-leaf print for the off-season.', { style: 'shirt', print: 'floral', c1: '#1c6f73', c2: '#f6d58a', c3: '#ff8a5c' }),
  I('outfit-track', 'top', 'rare', 'Retro track top', 700, 'Navy with cream stripes, 1986 vibes.', { style: 'track', c1: '#1d2b55', c2: '#f3e7c9' }),
  I('top-jersey-retro', 'top', 'rare', 'Retro jersey', 820, 'Old-school stripes with a big collar. Fan favourite.', { style: 'jersey', print: 'stripes', c1: '#b1122b', c2: '#f4f1e8' }),
  I('outfit-bomber', 'top', 'rare', 'Lime bomber', 880, 'Satin bomber in loud lime.', { style: 'bomber', c1: '#a8e62a', c2: '#16181b', c3: '#16181b' }),
  I('top-knit-cable', 'top', 'epic', 'Cable knit', 1300, 'Chunky cream cable-knit jumper.', { style: 'knit', c1: '#ece4d2', c2: '#d8ccb2' }),
  I('top-denim-jacket', 'top', 'epic', 'Denim jacket', 1500, 'Stonewashed trucker jacket over a white tee.', { style: 'denim', c1: '#4a6c96', c2: '#c98a3c', c3: '#f2f2ee' }),
  I('top-varsity', 'top', 'epic', 'Varsity jacket', 1800, 'Wool body, leather sleeves, a big chest letter.', { style: 'varsity', c1: '#1b2a4a', c2: '#efe6cf', c3: '#f2f2ee' }),
  I('top-camo-hoodie', 'top', 'epic', 'Camo hoodie', 1400, 'Woodland camo, tonal drawstrings.', { style: 'hoodie', print: 'camo', c1: '#5a6440', c2: '#2d3324', c3: '#8b7f55' }),
  I('outfit-puffer', 'top', 'epic', 'Arctic puffer', 1600, 'Big, white and warm.', { style: 'puffer', c1: '#f4f6f8', c2: '#c9d2da', c3: '#1a1d21' }),
  I('top-puffer-black', 'top', 'epic', 'Gloss puffer', 2100, 'High-shine black puffer with a stand collar.', { style: 'puffer', c1: '#121316', c2: '#2a2c31', c3: '#121316' }),
  I('top-leather', 'top', 'legendary', 'Biker leather', 5200, 'Black leather, silver zips, attitude.', { style: 'leather', c1: '#151517', c2: '#c8ccd2', c3: '#2a2c30', stars: 180 }),
  I('top-flames', 'top', 'legendary', 'Hellfire hoodie', 0, 'Black hoodie licked by flames.', { style: 'hoodie', print: 'flames', c1: '#141416', c2: '#ff5a1f', c3: '#ffd23d', stars: 220 }),
  I('outfit-suit', 'top', 'legendary', 'Gala tux', 3800, 'Midnight tuxedo jacket for award nights.', { style: 'suit', c1: '#121722', c2: '#ffffff', c3: '#0b0b0b' }),
  I('top-chrome-puffer', 'top', 'mythic', 'Liquid chrome puffer', 0, 'A mirror-silver puffer that catches every light.', { style: 'puffer', print: 'chrome', c1: '#cfd6de', c2: '#8f9aa6', c3: '#1a1d21', metal: true, stars: 520 }),
  I('top-galaxy', 'top', 'mythic', 'Galaxy tracksuit top', 0, 'Deep space print with glowing stars.', { style: 'track', print: 'galaxy', c1: '#1a0f3d', c2: '#7af0ff', c3: '#ff5ad1', stars: 460 }),
  I('top-gold-suit', 'top', 'mythic', 'Golden Ball suit', 0, 'Gold brocade jacket. For the best player on the planet.', { style: 'suit', print: 'brocade', c1: '#b8872a', c2: '#fff1c4', c3: '#111111', stars: 640 }),

  // ---------- Bottoms ----------
  I('bot-joggers-grey', 'bottom', 'common', 'Grey joggers', 160, 'Marl grey fleece, cuffed at the ankle.', { style: 'joggers', c1: '#8d9196', c2: '#6f7378' }),
  I('bot-joggers-black', 'bottom', 'common', 'Black joggers', 160, 'Slim black joggers. Every day.', { style: 'joggers', c1: '#1b1c1f', c2: '#2b2d31' }),
  I('bot-jeans-blue', 'bottom', 'common', 'Blue jeans', 240, 'Mid-wash straight denim.', { style: 'jeans', c1: '#3f5f8a', c2: '#c98a3c' }),
  I('bot-shorts-court', 'bottom', 'common', 'Court shorts', 180, 'Mesh basketball shorts with side panels.', { style: 'shorts', c1: '#1c2c55', c2: '#f4f4f0' }),
  I('bot-chinos', 'bottom', 'common', 'Stone chinos', 260, 'Clean, tapered, smart enough.', { style: 'chinos', c1: '#c9b996', c2: '#a8987a' }),
  I('bot-jeans-black', 'bottom', 'rare', 'Black skinny jeans', 480, 'Washed black, tapered fit.', { style: 'jeans', c1: '#24262b', c2: '#5d6066' }),
  I('bot-ripped', 'bottom', 'rare', 'Ripped jeans', 640, 'Light wash, blown-out knees.', { style: 'jeans', print: 'ripped', c1: '#7f9fc6', c2: '#c98a3c' }),
  I('bot-cargo', 'bottom', 'rare', 'Cargo pants', 580, 'Olive ripstop with big leg pockets.', { style: 'cargo', c1: '#59603f', c2: '#454a30' }),
  I('bot-track', 'bottom', 'rare', 'Track pants', 520, 'Navy with cream side stripes.', { style: 'track', c1: '#1d2b55', c2: '#f3e7c9' }),
  I('bot-denim-shorts', 'bottom', 'rare', 'Denim shorts', 440, 'Frayed cut-offs for hot days.', { style: 'shorts', print: 'denim', c1: '#6e8db8', c2: '#c98a3c' }),
  I('bot-cargo-camo', 'bottom', 'epic', 'Camo cargos', 1300, 'Woodland camo cargo pants.', { style: 'cargo', print: 'camo', c1: '#5a6440', c2: '#2d3324', c3: '#8b7f55' }),
  I('bot-leather', 'bottom', 'epic', 'Leather trousers', 1900, 'Soft black leather. Bold.', { style: 'leather', c1: '#151517', c2: '#2a2c30' }),
  I('bot-suit', 'bottom', 'legendary', 'Tux trousers', 3200, 'Satin stripe down the leg.', { style: 'suit', c1: '#121722', c2: '#05070b' }),
  I('bot-galaxy', 'bottom', 'mythic', 'Galaxy track pants', 0, 'Matches the galaxy top. Deep space.', { style: 'track', print: 'galaxy', c1: '#1a0f3d', c2: '#7af0ff', c3: '#ff5ad1', stars: 380 }),

  // ---------- Sneakers ----------
  I('shoe-court-white', 'shoes', 'common', 'Court classics', 200, 'All-white leather low-tops.', { style: 'court', c1: '#f4f4f0', c2: '#e4e4de', c3: '#f4f4f0' }),
  I('shoe-runner-grey', 'shoes', 'common', 'Daily runners', 220, 'Grey knit, white foam sole.', { style: 'runner', c1: '#8d939a', c2: '#c6ff3d', c3: '#f4f4f0' }),
  I('shoe-slides', 'shoes', 'common', 'Slides & socks', 140, 'Black slides over white socks. Recovery day.', { style: 'slide', c1: '#16181b', c2: '#f4f4f0', c3: '#16181b' }),
  I('shoe-court-green', 'shoes', 'rare', 'Retro court', 520, 'White leather, green heel tab, gum sole.', { style: 'court', c1: '#f2efe6', c2: '#1f6b3a', c3: '#b58a4f' }),
  I('shoe-high-red', 'shoes', 'rare', 'Hoop high-tops', 760, 'Red, black and white high-tops.', { style: 'high', c1: '#c41a2a', c2: '#141414', c3: '#f4f4f0' }),
  I('shoe-chelsea', 'shoes', 'rare', 'Chelsea boots', 680, 'Tan suede, elastic sides.', { style: 'chelsea', c1: '#8a5a32', c2: '#2a1d14', c3: '#1a1410' }),
  I('shoe-runner-neon', 'shoes', 'epic', 'Volt runners', 1200, 'Black knit with a volt flash.', { style: 'runner', c1: '#17191c', c2: '#d8ff3a', c3: '#f4f4f0' }),
  I('shoe-chunky', 'shoes', 'epic', 'Chunky dads', 1500, 'Layered, oversized, unapologetic.', { style: 'chunky', c1: '#ecebe6', c2: '#7fa6c9', c3: '#f4f2ea' }),
  I('shoe-high-cream', 'shoes', 'epic', 'Cream suede highs', 1700, 'Cream suede with a chocolate swoop.', { style: 'high', c1: '#e9dfc9', c2: '#5a3a22', c3: '#efe6d2' }),
  I('shoe-loafer', 'shoes', 'legendary', 'Velvet loafers', 3600, 'Black velvet with a gold bit.', { style: 'loafer', c1: '#14121a', c2: '#ffcf3d', c3: '#0b0b0b' }),
  I('shoe-gold-high', 'shoes', 'legendary', 'Gold rush highs', 0, 'Metallic gold high-tops.', { style: 'high', c1: '#e3b443', c2: '#fff1b0', c3: '#f4f4f0', metal: true, stars: 240 }),
  I('shoe-lava', 'shoes', 'mythic', 'Lava runners', 0, 'Obsidian upper over a glowing molten sole.', { style: 'chunky', print: 'lava', c1: '#141416', c2: '#ff5a1f', c3: '#ffb23d', stars: 420 }),

  // ---------- Hats ----------
  I('hat-cap-black', 'head', 'common', 'Black cap', 160, 'Plain six-panel cap.', { style: 'cap', c1: '#17191c', c2: '#2a2d31' }),
  I('hat-cap-back', 'head', 'common', 'Backwards cap', 180, 'Navy cap, turned round.', { style: 'backcap', c1: '#1d2b55', c2: '#f4f4f0' }),
  I('hat-beanie', 'head', 'common', 'Rib beanie', 180, 'Charcoal rib knit, folded cuff.', { style: 'beanie', c1: '#2f3338', c2: '#2f3338' }),
  I('hat-beanie-orange', 'head', 'rare', 'Hunter beanie', 420, 'Safety orange. Seen from space.', { style: 'beanie', c1: '#ff7a1a', c2: '#ff7a1a' }),
  I('hat-bucket', 'head', 'rare', 'Bucket hat', 480, 'Cream canvas bucket hat.', { style: 'bucket', c1: '#e7dcc2', c2: '#cfc3a6' }),
  I('hat-cap-lime', 'head', 'rare', 'Club cap', 520, 'Black with a lime peak.', { style: 'cap', c1: '#16181b', c2: '#c6ff3d' }),
  I('hat-durag', 'head', 'rare', 'Silk durag', 540, 'Black silk, glossy, waves locked in.', { style: 'durag', c1: '#121214', c2: '#121214' }),
  I('hat-bucket-camo', 'head', 'epic', 'Camo bucket', 1100, 'Woodland camo bucket hat.', { style: 'bucket', print: 'camo', c1: '#5a6440', c2: '#2d3324', c3: '#8b7f55' }),
  I('hat-beanie-pom', 'head', 'epic', 'Pom beanie', 1000, 'Club-striped bobble hat for the away end.', { style: 'pom', c1: '#b1122b', c2: '#f4f1e8' }),
  I('hat-crown', 'head', 'mythic', 'The Crown', 0, 'A real crown. For the king of the league.', { style: 'crown', c1: '#ffcf3d', c2: '#e0244a', metal: true, stars: 600 }),

  // ---------- Shades ----------
  I('eye-round', 'eyes', 'common', 'Round shades', 200, 'Thin gold rims, dark lenses.', { style: 'round', c1: '#c9a24a', c2: '#1c1f22', metal: true }),
  I('eye-square', 'eyes', 'rare', 'Bold squares', 480, 'Thick black frames.', { style: 'square', c1: '#141414', c2: '#20262c' }),
  I('eye-aviator', 'eyes', 'rare', 'Aviators', 620, 'Gold aviators with a green tint.', { style: 'aviator', c1: '#d8b04a', c2: '#2c4a36', metal: true }),
  I('eye-shield', 'eyes', 'epic', 'Sport shield', 1400, 'Wraparound mirrored shield.', { style: 'shield', c1: '#e6e9ec', c2: '#3dd6ff', metal: true }),
  I('eye-rose', 'eyes', 'epic', 'Rose tints', 1200, 'Small ovals, rose-tinted lenses.', { style: 'round', c1: '#e6e9ec', c2: '#ff8fb1', metal: true }),
  I('eye-diamond', 'eyes', 'legendary', 'Ice frames', 0, 'Diamond-set frames. Absolutely unnecessary.', { style: 'square', c1: '#eaf6ff', c2: '#141820', metal: true, stars: 200 }),

  // ---------- Chains ----------
  I('neck-chain-silver', 'neck', 'common', 'Silver chain', 220, 'A modest silver link.', { style: 'chain', c1: '#d8dee6', metal: true }),
  I('neck-beads', 'neck', 'common', 'Surf beads', 180, 'Wooden beads on a cord.', { style: 'beads', c1: '#8a5a32', c2: '#efe6d2' }),
  I('neck-dogtag', 'neck', 'rare', 'Dog tag', 480, 'Steel tag on a ball chain.', { style: 'dogtag', c1: '#c8ccd2', metal: true }),
  I('neck-chain-gold', 'neck', 'rare', 'Gold rope', 650, 'Heavy, shiny, unmistakable.', { style: 'chain', c1: '#ffcf3d', metal: true }),
  I('neck-cuban-silver', 'neck', 'rare', 'Silver Cuban', 820, 'Chunky Cuban links in silver.', { style: 'cuban', c1: '#d8dee6', metal: true }),
  I('neck-snood', 'neck', 'rare', 'Winter snood', 480, 'For cold evening kickoffs.', { style: 'snood', c1: '#16181b' }),
  I('neck-cuban-gold', 'neck', 'epic', 'Gold Cuban', 1900, 'Big gold Cuban links. Loud.', { style: 'cuban', c1: '#ffcf3d', metal: true }),
  I('neck-ball', 'neck', 'epic', 'Ball pendant', 1700, 'A gold football on a rope chain.', { style: 'ball', c1: '#ffcf3d', c2: '#16181b', metal: true }),
  I('neck-tennis', 'neck', 'legendary', 'Tennis chain', 0, 'A line of ice. Every stone catches the light.', { style: 'tennis', c1: '#eef6ff', c2: '#ffffff', metal: true, stars: 200 }),
  I('neck-star', 'neck', 'legendary', 'Star pendant', 5600, 'Iced-out star on a gold Cuban.', { style: 'star', c1: '#ffcf3d', c2: '#eef6ff', metal: true }),
  I('neck-medal', 'neck', 'legendary', "Champion's medal", 0, 'Earned by winning the league title.', { style: 'medal', c1: '#ffcf3d', c2: '#c6ff3d', metal: true, source: 'Win the league' }),
  I('neck-ice-cuban', 'neck', 'mythic', 'Iced Cuban', 0, 'Every link set with stones. Blinding.', { style: 'icecuban', c1: '#eef6ff', c2: '#bfe8ff', metal: true, stars: 560 }),

  // ---------- Wrist ----------
  I('wrist-string', 'wrist', 'common', 'Friendship bands', 120, 'Woven cords from the summer camp.', { style: 'string', c1: '#e0244a', c2: '#3dd6ff' }),
  I('wrist-beads', 'wrist', 'common', 'Bead bracelet', 160, 'Black onyx beads.', { style: 'beads', c1: '#16181b', c2: '#c9a24a' }),
  I('wrist-watch-sport', 'wrist', 'rare', 'Sport watch', 520, 'Black rubber strap, lime face.', { style: 'watch', c1: '#16181b', c2: '#c6ff3d' }),
  I('wrist-cuban', 'wrist', 'rare', 'Silver links', 600, 'Cuban link bracelet in silver.', { style: 'cuban', c1: '#d8dee6', metal: true }),
  I('wrist-gold', 'wrist', 'epic', 'Gold cuff', 1500, 'Gold cuff with a satin finish.', { style: 'cuff', c1: '#ffcf3d', metal: true }),
  I('wrist-watch-gold', 'wrist', 'epic', 'Gold watch', 2400, 'Gold case, gold bracelet, green dial.', { style: 'goldwatch', c1: '#ffcf3d', c2: '#1f5a3a', metal: true }),
  I('wrist-tennis', 'wrist', 'legendary', 'Tennis bracelet', 0, 'A thin line of diamonds.', { style: 'tennis', c1: '#eef6ff', c2: '#ffffff', metal: true, stars: 160 }),
  I('wrist-iced-watch', 'wrist', 'mythic', 'Iced watch', 0, 'Bust-down watch, stones on every surface.', { style: 'icewatch', c1: '#eef6ff', c2: '#bfe8ff', metal: true, stars: 480 }),

  // ---------- Matchday: boots ----------
  I('boots-ice', 'boots', 'common', 'Glacier', 180, 'Frosted white with an ice-blue sole.', { c1: '#e8f6ff', c2: '#7fd3ff' }),
  I('boots-black', 'boots', 'common', 'Blackout', 160, 'All black. All business.', { c1: '#141414', c2: '#3a3a3a' }),
  I('boots-flame', 'boots', 'rare', 'Inferno', 520, 'Molten orange fading into red.', { c1: '#ff6a1f', c2: '#ffd23d' }),
  I('boots-volt', 'boots', 'rare', 'Volt', 600, 'Electric yellow with a black sole.', { c1: '#d8ff3a', c2: '#141414' }),
  I('boots-galaxy', 'boots', 'epic', 'Nebula', 1400, 'Deep violet with a cyan glow.', { c1: '#5b2bd6', c2: '#3dfcff' }),
  I('boots-chrome', 'boots', 'epic', 'Chrome', 1800, 'Mirror-polished, impossible to miss.', { c1: '#e6ebf0', c2: '#9aa6b2', metal: true }),
  I('boots-pink', 'boots', 'legendary', 'Flamingo', 0, 'Hot pink with a white sole. Every camera finds you.', { c1: '#ff4f9a', c2: '#ffffff', stars: 150 }),
  I('boots-gold', 'boots', 'legendary', 'Golden Boot', 0, 'Solid gold. Only for the league top scorer.', { c1: '#ffcf3d', c2: '#fff1b0', metal: true, source: "Win a season's Golden Boot" }),

  // ---------- Matchday: headbands and sweatbands ----------
  I('head-band-lime', 'band', 'common', 'Lime headband', 150, 'Keeps the sweat out, looks sharp.', { style: 'band', c1: '#c6ff3d' }),
  I('head-band-red', 'band', 'common', 'Crimson headband', 150, 'A bold red stripe.', { style: 'band', c1: '#ff3d5a' }),
  I('head-alice', 'band', 'rare', 'Alice band', 420, 'Thin black band for flowing hair.', { style: 'alice', c1: '#16181b' }),
  I('head-band-gold', 'band', 'epic', 'Gold headband', 1200, 'Gold-threaded, for big nights.', { style: 'band', c1: '#ffcf3d', metal: true }),
  I('head-captain', 'band', 'rare', "Skipper's band", 0, 'Lime and black hoops for the hat-trick club.', { style: 'band', c1: '#c6ff3d', c2: '#16181b', source: 'Achievement: Hat-trick hero' }),
  I('wrist-tape', 'sweat', 'common', 'Wrist tape', 120, 'Plain white tape, pro style.', { c1: '#f4f4f0' }),
  I('wrist-band-lime', 'sweat', 'common', 'Lime sweatband', 140, 'Terry-cloth in signature lime.', { c1: '#c6ff3d' }),
  I('wrist-band-black', 'sweat', 'common', 'Black sweatband', 140, 'Stealthy.', { c1: '#16181b' }),

  // ---------- Celebrations ----------
  I('cel-plane', 'celebration', 'common', 'Aeroplane', 300, 'Arms out wide, banking away.', { style: 'plane' }),
  I('cel-slide', 'celebration', 'rare', 'Knee slide', 600, 'Down on the knees, sliding to the corner flag.', { style: 'slide' }),
  I('cel-spin', 'celebration', 'rare', 'Spin', 750, 'A jumping pirouette.', { style: 'spin' }),
  I('cel-flip', 'celebration', 'epic', 'Backflip', 1900, 'A full backflip. Show-off.', { style: 'flip' }),

  // ---------- Name borders ----------
  I('border-steel', 'border', 'common', 'Steel', 200, 'Brushed steel frame.', { style: 'steel', c1: '#c8ccd2', c2: '#6c737c' }),
  I('border-lime', 'border', 'common', 'Neon lime', 260, 'A clean lime glow.', { style: 'neon', c1: '#c6ff3d', c2: '#7fd400' }),
  I('border-ice', 'border', 'rare', 'Frostbite', 620, 'Icy blue with a frozen shimmer.', { style: 'ice', c1: '#bfe8ff', c2: '#3d9bff' }),
  I('border-sunset', 'border', 'rare', 'Sunset', 640, 'Orange into pink, slowly flowing.', { style: 'flow', c1: '#ff8a3d', c2: '#ff3d8b' }),
  I('border-pitch', 'border', 'rare', 'Pitch lines', 560, 'Mown stripes and white lines.', { style: 'pitch', c1: '#2f8a3a', c2: '#f4f4f0' }),
  I('border-flames', 'border', 'epic', 'On fire', 1600, 'Flames running around your name.', { style: 'fire', c1: '#ff5a1f', c2: '#ffd23d' }),
  I('border-holo', 'border', 'epic', 'Hologram', 1800, 'Shifting holographic foil.', { style: 'holo', c1: '#ff7ad9', c2: '#5ef0ff' }),
  I('border-electric', 'border', 'epic', 'Thunder', 1700, 'Crackling electric blue.', { style: 'electric', c1: '#7af0ff', c2: '#3d6bff' }),
  I('border-gold', 'border', 'legendary', 'Gold laurel', 4800, 'Polished gold with a laurel crest.', { style: 'gold', c1: '#ffcf3d', c2: '#fff1b0' }),
  I('border-diamond', 'border', 'legendary', 'Diamond', 0, 'Faceted ice that sparkles.', { style: 'diamond', c1: '#eaf6ff', c2: '#9fd8ff', stars: 180 }),
  I('border-galaxy', 'border', 'mythic', 'Galaxy', 0, 'A slow-turning galaxy full of stars.', { style: 'galaxy', c1: '#7af0ff', c2: '#ff5ad1', stars: 450 }),
  I('border-legend', 'border', 'mythic', 'Living legend', 0, 'Animated gold and crimson with a crown.', { style: 'legend', c1: '#ffcf3d', c2: '#ff3d5a', stars: 700 }),

  // ---------- Profile cards ----------
  I('card-carbon', 'card', 'common', 'Carbon', 200, 'Woven carbon fibre.', { style: 'carbon', c1: '#1b1e22', c2: '#2b3036' }),
  I('card-wave', 'card', 'rare', 'Lime wave', 600, 'Flowing lime light.', { style: 'wave', c1: '#0f1a08', c2: '#c6ff3d' }),
  I('card-night', 'card', 'rare', 'Floodlights', 750, 'Night match under the lights.', { style: 'night', c1: '#0b1630', c2: '#7fb3ff' }),
  I('card-holo', 'card', 'epic', 'Holo', 2200, 'Shifting holographic foil.', { style: 'holo', c1: '#ff7ad9', c2: '#5ef0ff' }),
  I('card-gold', 'card', 'legendary', 'Gold', 4500, 'The gold card. Top of the market.', { style: 'gold', c1: '#3a2a05', c2: '#ffcf3d' }),
  I('card-galaxy', 'card', 'mythic', 'Galaxy', 0, 'A card full of stars.', { style: 'galaxy', c1: '#120a2e', c2: '#7af0ff', stars: 400 }),

  // ---------- Titles ----------
  I('title-rising', 'title', 'common', 'Rising Star', 250, 'Shown under your name.'),
  I('title-maestro', 'title', 'rare', 'Maestro', 900, 'For the artists.'),
  I('title-wall', 'title', 'rare', 'The Wall', 900, 'Nothing gets past.'),
  I('title-drip', 'title', 'epic', 'Drip King', 2000, 'Best dressed in the league.'),
  I('title-goat', 'title', 'mythic', 'The GOAT', 0, 'No debate.', { stars: 500 }),
  I('title-firstgoal', 'title', 'common', 'Off the Mark', 0, 'Scored a first career goal.', { source: 'Achievement: First goal' }),
  I('title-hattrick', 'title', 'epic', 'Hat-trick Hero', 0, 'Three in one match.', { source: 'Achievement: Hat-trick hero' }),
  I('title-centurion', 'title', 'epic', 'Centurion', 0, '100 appearances.', { source: 'Achievement: Centurion' }),
  I('title-champion', 'title', 'legendary', 'Champion', 0, 'League winner.', { source: 'Win the league' }),
  I('title-pots', 'title', 'legendary', 'Player of the Season', 0, 'Best-rated player of a season.', { source: 'Season award' }),
];

export const ITEM_BY_ID: Record<string, Item> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export type Equipped = Partial<Record<Slot, string>>;

/**
 * Keeps only items that exist (and are owned, when `owned` is given), each
 * filed under its own slot. Older saves keyed some items under slots that
 * have since moved (the old off-pitch outfit, headbands, sweatbands), so the
 * item decides where it goes.
 */
export function sanitizeEquipped(raw: unknown, owned?: Set<string>): Equipped {
  const out: Equipped = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, id] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof id !== 'string') continue;
    const it = ITEM_BY_ID[id];
    if (!it || (owned && !owned.has(id))) continue;
    // A slot named in the save wins over a migrated one.
    if (out[it.slot] && k !== it.slot) continue;
    out[it.slot] = id;
  }
  return out;
}

/** Equipped items resolved to definitions, for rendering. */
export function gear(eq: Equipped | undefined): Partial<Record<Slot, Item>> {
  const out: Partial<Record<Slot, Item>> = {};
  if (!eq) return out;
  for (const s of SLOTS) {
    const it = eq[s] && ITEM_BY_ID[eq[s]!];
    if (it && it.slot === s) out[s] = it;
  }
  return out;
}

// ---------- Daily shop ----------

function dayHash(day: number, salt: number) {
  let h = (day * 2654435761 + salt * 40503) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822519) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
}

/** UTC day number, so the featured rotation flips at midnight UTC for everyone. */
export const shopDay = (now = Date.now()) => Math.floor(now / 86_400_000);

/** Six featured items a day (always one star piece), one of the coin items on a 30% deal. */
export function featured(day = shopDay()): { ids: string[]; deal: string } {
  const coin = ITEMS.filter((i) => i.price > 0);
  const star = ITEMS.filter((i) => i.stars && !i.source);
  const ids: string[] = [star[dayHash(day, 7) % star.length].id];
  for (let k = 0; ids.length < 6 && k < 80; k++) {
    const it = coin[dayHash(day, k) % coin.length];
    if (!ids.includes(it.id)) ids.push(it.id);
  }
  const coins = ids.slice(1);
  return { ids, deal: coins[dayHash(day, 99) % coins.length] };
}

export const DEAL_DISCOUNT = 0.3;

export function priceOf(item: Item, day = shopDay()): number {
  if (item.price <= 0) return 0;
  return featured(day).deal === item.id ? Math.round((item.price * (1 - DEAL_DISCOUNT)) / 10) * 10 : item.price;
}

// ---------- Daily box ----------

/** Two free boxes a day: one in the morning half (UTC), one in the evening half. */
export type BoxSlot = 'am' | 'pm';
export const boxSlot = (now = new Date()): BoxSlot => (now.getUTCHours() < 12 ? 'am' : 'pm');
export const boxKey = (now = new Date()) => `${now.toISOString().slice(0, 10)}:${boxSlot(now)}`;
/** When the next box opens (the next noon or midnight UTC). */
export function nextBoxAt(now = new Date()): Date {
  const d = new Date(now);
  d.setUTCMinutes(0, 0, 0);
  d.setUTCHours(now.getUTCHours() < 12 ? 12 : 24);
  return d;
}

/** What a box can hold, in percent. Items are new to you; a duplicate turns into coins. */
export const BOX_ODDS = { coins: 38, stars: 7, common: 34, rare: 15, epic: 5, legendary: 1 } as const;
/** Coins paid instead of an item you already own. */
export const DUPE_COINS: Record<Rarity, number> = { common: 60, rare: 150, epic: 400, legendary: 1000, mythic: 2000 };

export type BoxPrize = { kind: 'coins'; amount: number } | { kind: 'stars'; amount: number } | { kind: 'item'; itemId: string; dupe?: number };

/** Items a box can drop, by rarity: anything sold for coins (stars-only pieces never drop). */
export const boxPool = (r: Rarity) => ITEMS.filter((i) => i.rarity === r && i.price > 0 && i.box !== false);

/** Rolls one box. `rand` is a 0..1 source; `owned` turns repeats into coins. */
export function rollBox(rand: () => number, owned: Set<string>): BoxPrize {
  let x = rand() * 100;
  const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length) % a.length];
  for (const [k, w] of Object.entries(BOX_ODDS) as [keyof typeof BOX_ODDS, number][]) {
    if ((x -= w) > 0) continue;
    if (k === 'coins') return { kind: 'coins', amount: 40 + Math.floor(rand() * 9) * 15 };
    if (k === 'stars') return { kind: 'stars', amount: pick([3, 3, 5, 5, 8, 10]) };
    const pool = boxPool(k);
    // Prefer something new; if the whole tier is owned, the duplicate pays out.
    const fresh = pool.filter((i) => !owned.has(i.id));
    const it = pick(fresh.length ? fresh : pool);
    return fresh.length ? { kind: 'item', itemId: it.id } : { kind: 'item', itemId: it.id, dupe: DUPE_COINS[k] };
  }
  return { kind: 'coins', amount: 50 };
}
