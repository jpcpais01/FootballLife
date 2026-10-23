// Life off the pitch: homes, furniture and cars. Everything here is for
// prestige and personality only; none of it affects matches.

export interface HouseTier {
  id: string;
  name: string;
  price: number;
  /** Cars that fit in the garage. */
  garage: number;
  /** Room size in metres (width, depth). */
  size: [number, number];
  view: 'city' | 'park' | 'sea' | 'skyline';
  desc: string;
}

export const HOUSES: HouseTier[] = [
  { id: 'studio', name: 'Studio flat', price: 0, garage: 1, size: [7.5, 6], view: 'city', desc: 'Where every career starts. Small, but it is yours.' },
  { id: 'apartment', name: 'City apartment', price: 2500, garage: 1, size: [9.5, 7], view: 'park', desc: 'Big windows over the park and room for a proper sofa.' },
  { id: 'townhouse', name: 'Townhouse', price: 8000, garage: 2, size: [11, 8], view: 'city', desc: 'A walled garden, a double garage and the neighbours know your name.' },
  { id: 'villa', name: 'Seaside villa', price: 20000, garage: 3, size: [13, 9], view: 'sea', desc: 'A pool over the beach, sunsets and space for the trophy collection.' },
  { id: 'penthouse', name: 'Sky penthouse', price: 45000, garage: 4, size: [15, 10], view: 'skyline', desc: 'Top floor of the tallest tower in town, with a hot tub on the terrace.' },
];
export const HOUSE_BY_ID: Record<string, HouseTier> = Object.fromEntries(HOUSES.map((h) => [h.id, h]));

export const FURNITURE_SLOTS = ['sofa', 'tv', 'rug', 'plant', 'lamp', 'art', 'table'] as const;
export type FurnitureSlot = (typeof FURNITURE_SLOTS)[number];
export const FURNITURE_LABELS: Record<FurnitureSlot, string> = { sofa: 'Sofa', tv: 'Entertainment', rug: 'Rug', plant: 'Plant', lamp: 'Lamp', art: 'Wall art', table: 'Coffee table' };

export interface Furniture {
  id: string;
  name: string;
  slot: FurnitureSlot;
  price: number;
  style: string;
  c1: string;
  c2?: string;
}

export const FURNITURE: Furniture[] = [
  { id: 'sofa-grey', name: 'Grey couch', slot: 'sofa', price: 0, style: 'couch', c1: '#5d646c', c2: '#3a3f45' },
  { id: 'sofa-lime', name: 'Lime lounger', slot: 'sofa', price: 600, style: 'couch', c1: '#a6e01f', c2: '#2a2f35' },
  { id: 'sofa-leather', name: 'Leather chesterfield', slot: 'sofa', price: 1800, style: 'chester', c1: '#6b3a1f', c2: '#3a1d0d' },
  { id: 'sofa-corner', name: 'Corner sectional', slot: 'sofa', price: 3200, style: 'corner', c1: '#e9e4da', c2: '#b8b1a3' },
  { id: 'tv-basic', name: 'Flat TV', slot: 'tv', price: 0, style: 'tv', c1: '#16181b' },
  { id: 'tv-gaming', name: 'Gaming setup', slot: 'tv', price: 900, style: 'gaming', c1: '#16181b', c2: '#c6ff3d' },
  { id: 'tv-cinema', name: 'Home cinema', slot: 'tv', price: 2600, style: 'cinema', c1: '#0e0f11', c2: '#3dd6ff' },
  { id: 'rug-round', name: 'Round rug', slot: 'rug', price: 150, style: 'round', c1: '#2f3640', c2: '#c6ff3d' },
  { id: 'rug-pitch', name: 'Pitch rug', slot: 'rug', price: 450, style: 'pitch', c1: '#2f8a34', c2: '#ffffff' },
  { id: 'rug-persian', name: 'Persian rug', slot: 'rug', price: 1200, style: 'persian', c1: '#7a1f2b', c2: '#e3b65a' },
  { id: 'plant-fern', name: 'Fern', slot: 'plant', price: 120, style: 'fern', c1: '#3f8f3a' },
  { id: 'plant-palm', name: 'Indoor palm', slot: 'plant', price: 380, style: 'palm', c1: '#2f7a35' },
  { id: 'plant-olive', name: 'Olive tree', slot: 'plant', price: 950, style: 'olive', c1: '#7b8f4a' },
  { id: 'lamp-arc', name: 'Arc lamp', slot: 'lamp', price: 260, style: 'arc', c1: '#d8d4cc' },
  { id: 'lamp-neon', name: 'Neon tube', slot: 'lamp', price: 520, style: 'neon', c1: '#ff4d9d' },
  { id: 'lamp-gold', name: 'Gold globe', slot: 'lamp', price: 1400, style: 'globe', c1: '#ffcf3d' },
  { id: 'art-poster', name: 'Club poster', slot: 'art', price: 100, style: 'poster', c1: '#c6ff3d', c2: '#16181b' },
  { id: 'art-abstract', name: 'Abstract canvas', slot: 'art', price: 700, style: 'abstract', c1: '#ff7a3d', c2: '#3d7aff' },
  { id: 'art-neon', name: 'Neon sign', slot: 'art', price: 1500, style: 'neonsign', c1: '#c6ff3d' },
  { id: 'table-wood', name: 'Oak table', slot: 'table', price: 200, style: 'wood', c1: '#9a6a3c' },
  { id: 'table-glass', name: 'Glass table', slot: 'table', price: 650, style: 'glass', c1: '#bfe8ff' },
  { id: 'table-marble', name: 'Marble table', slot: 'table', price: 1600, style: 'marble', c1: '#f2efe9', c2: '#c9c3b8' },
];
export const FURNITURE_BY_ID: Record<string, Furniture> = Object.fromEntries(FURNITURE.map((f) => [f.id, f]));

export const WALL_COLORS = ['#e9e4da', '#2b3036', '#c9d6c2', '#3b4a5c', '#e8d3c0', '#1b1f24'];
export const FLOOR_STYLES = ['oak', 'walnut', 'marble', 'concrete'] as const;

export interface CarModel {
  id: string;
  name: string;
  price: number;
  body: 'hatch' | 'coupe' | 'suv' | 'gt' | 'hyper' | 'classic';
  desc: string;
  /** Top speed, purely for flavour on the spec sheet. */
  kmh: number;
}

export const CARS: CarModel[] = [
  { id: 'car-hatch', name: 'Pocket Hatch', price: 1200, body: 'hatch', kmh: 180, desc: 'Cheap, cheerful and easy to park at the training ground.' },
  { id: 'car-classic', name: 'Roadster 62', price: 3500, body: 'classic', kmh: 190, desc: 'A rounded classic with chrome bumpers.' },
  { id: 'car-coupe', name: 'Strada Coupe', price: 6000, body: 'coupe', kmh: 250, desc: 'Low, sleek and quick.' },
  { id: 'car-suv', name: 'Atlas SUV', price: 9000, body: 'suv', kmh: 230, desc: 'Big, comfortable, fits the whole family.' },
  { id: 'car-gt', name: 'Veloce GT', price: 18000, body: 'gt', kmh: 315, desc: 'A grand tourer with a big engine.' },
  { id: 'car-hyper', name: 'Fulmine Hyper', price: 40000, body: 'hyper', kmh: 410, desc: 'Carbon, wings and an engine like a rocket.' },
];
export const CAR_BY_ID: Record<string, CarModel> = Object.fromEntries(CARS.map((c) => [c.id, c]));
export const CAR_COLORS = ['#e8ecef', '#16181b', '#c6ff3d', '#ff3d5a', '#2f6bff', '#ffb020', '#8a8f96', '#0f6b4a'];
export const RESPRAY_COST = 300;

export interface Home {
  tier: string;
  furniture: Partial<Record<FurnitureSlot, string>>;
  wall: number;
  floor: number;
  favCar: string | null;
}

export const DEFAULT_HOME: Home = { tier: 'studio', furniture: { sofa: 'sofa-grey', tv: 'tv-basic' }, wall: 0, floor: 0, favCar: null };

export function sanitizeHome(raw: unknown): Home {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const furniture: Home['furniture'] = {};
  const f = (r.furniture ?? {}) as Record<string, unknown>;
  for (const s of FURNITURE_SLOTS) {
    const id = f[s];
    if (typeof id === 'string' && FURNITURE_BY_ID[id]?.slot === s) furniture[s] = id;
  }
  const n = (v: unknown, max: number) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < max ? v : 0);
  return {
    tier: typeof r.tier === 'string' && HOUSE_BY_ID[r.tier] ? r.tier : 'studio',
    furniture: r.furniture ? furniture : { ...DEFAULT_HOME.furniture },
    wall: n(r.wall, WALL_COLORS.length),
    floor: n(r.floor, FLOOR_STYLES.length),
    favCar: typeof r.favCar === 'string' ? r.favCar : null,
  };
}

/** A collectible: framed swapped shirts and match balls. */
export interface Collectible {
  id: string;
  kind: 'shirt' | 'ball';
  label: string;
  at: string;
  data: { primary?: string; secondary?: string; number?: number; name?: string; club?: string; season?: number; matchId?: string; score?: string };
}

/** Chance of swapping shirts with an opponent after a league or cup match. */
export const SHIRT_SWAP_CHANCE = 0.3;
