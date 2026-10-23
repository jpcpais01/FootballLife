// Floor plans for every home tier: walls with their doors and windows, the
// rooms and their floors, where your own furniture goes, the fixed fittings
// (kitchen, bed, bathroom…) and the outdoor space around the house.
//
// Coordinates are metres. x runs left to right, z from the back of the house
// (north, negative) to the front (south, positive), where the camera starts.
// A rotation r turns a piece so its front faces (sin r, cos r): 0 faces the
// front, π the back, π/2 the right (east), −π/2 the left (west).

export type OpeningKind = 'door' | 'window' | 'glass' | 'slide' | 'open';

export interface Opening {
  /** Centre of the opening along the wall's axis (x for east-west walls, z for north-south ones). */
  at: number;
  w: number;
  kind: OpeningKind;
  sill?: number;
  h?: number;
}

export interface WallDef {
  a: [number, number];
  b: [number, number];
  open?: Opening[];
  ext?: boolean;
}

export type FloorKind = 'main' | 'tile' | 'stone' | 'deck' | 'grass' | 'paving' | 'pavement' | 'sand';

export interface RoomDef {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  floor: FloorKind;
  name: string;
}

export interface Place {
  x: number;
  z: number;
  r: number;
  y?: number;
}

export type FixtureKind =
  | 'kitchen' | 'island' | 'dining' | 'bed' | 'nightstand' | 'wardrobe' | 'desk' | 'bookshelf'
  | 'shower' | 'toilet' | 'vanity' | 'bathtub' | 'piano' | 'treadmill' | 'weights' | 'console' | 'coatrack'
  | 'lounger' | 'pool' | 'hottub' | 'palm' | 'tree' | 'bush' | 'hedge' | 'goal' | 'bbq' | 'bench'
  | 'streetlamp' | 'patio' | 'fence' | 'railing' | 'planter' | 'umbrella' | 'bin';

export interface Fixture extends Place {
  kind: FixtureKind;
  /** Length or width, by kind (a kitchen run's length, a hedge's length, a pool's size…). */
  w?: number;
  d?: number;
}

export interface Yard extends RoomDef {
  /** Walkable outdoor ground. Non-walkable yards are scenery (a road, the beach). */
  walk: boolean;
  /** Ground height; the beach sits a little below the deck. */
  y?: number;
}

export type Outdoor = 'street' | 'park' | 'townhouse' | 'beach' | 'tower';
export type Facade = 'brick' | 'render' | 'redbrick' | 'white' | 'glass';

export interface Plan {
  w: number;
  d: number;
  h: number;
  facade: Facade;
  walls: WallDef[];
  rooms: RoomDef[];
  slots: { sofa: Place; tv: Place; rug: Place; table: Place; plant: Place; lamp: Place; art: Place };
  /** The trophy and match-ball cabinet against a wall. */
  cabinet: Place & { len: number };
  /** Wall spots for framed shirts, in the order they fill. */
  frames: Place[];
  fixtures: Fixture[];
  yards: Yard[];
  outdoor: Outdoor;
  /** Where your favourite car is parked outside, if it can be. */
  car?: Place;
  spawn: Place;
  /** Where the camera starts: yaw round the house and elevation, radians. */
  cam?: [number, number];
}

/** The four outside walls of a w × d footprint, with openings per side. */
function shell(w: number, d: number, o: { n?: Opening[]; s?: Opening[]; e?: Opening[]; w?: Opening[] }): WallDef[] {
  const x = w / 2;
  const z = d / 2;
  return [
    { a: [-x, -z], b: [x, -z], open: o.n, ext: true },
    { a: [-x, z], b: [x, z], open: o.s, ext: true },
    { a: [x, -z], b: [x, z], open: o.e, ext: true },
    { a: [-x, -z], b: [-x, z], open: o.w, ext: true },
  ];
}

const PI = Math.PI;
const E = -PI / 2; // facing west (backed onto an east wall)
const W = PI / 2; // facing east (backed onto a west wall)

const studio: Plan = {
  w: 7.5,
  d: 6,
  h: 2.8,
  facade: 'brick',
  outdoor: 'street',
  walls: [
    ...shell(7.5, 6, {
      n: [{ at: -2.2, w: 1.3, kind: 'window', sill: 1.25, h: 0.95 }],
      s: [{ at: -2.0, w: 2.2, kind: 'window', sill: 0.45, h: 1.8 }, { at: 1.0, w: 0.95, kind: 'door' }],
      e: [{ at: -1.9, w: 0.6, kind: 'window', sill: 1.6, h: 0.6 }, { at: 1.4, w: 1.2, kind: 'window', sill: 1.15, h: 1.1 }],
    }),
    { a: [2.0, -3], b: [2.0, -0.8] },
    { a: [2.0, -0.8], b: [3.75, -0.8], open: [{ at: 2.75, w: 0.75, kind: 'door' }] },
  ],
  rooms: [
    { x0: -3.75, z0: -3, x1: 2.0, z1: 3, floor: 'main', name: 'Living' },
    { x0: 2.0, z0: -0.8, x1: 3.75, z1: 3, floor: 'main', name: 'Bed' },
    { x0: 2.0, z0: -3, x1: 3.75, z1: -0.8, floor: 'tile', name: 'Bathroom' },
  ],
  slots: {
    tv: { x: -3.42, z: 0.7, r: W },
    sofa: { x: -0.75, z: 0.7, r: E },
    rug: { x: -2.1, z: 0.7, r: W },
    table: { x: -2.1, z: 0.7, r: W },
    lamp: { x: -0.6, z: 2.4, r: E },
    plant: { x: -3.3, z: 2.55, r: 0 },
    art: { x: 1.91, z: -1.9, r: E, y: 1.6 },
  },
  cabinet: { x: 0.75, z: -2.64, r: 0, len: 2.0 },
  frames: [{ x: -3.64, z: -1.4, r: W, y: 1.65 }, { x: 3.64, z: 0.05, r: E, y: 1.65 }],
  fixtures: [
    { kind: 'kitchen', x: -2.2, z: -2.66, r: 0, w: 3.1 },
    { kind: 'bed', x: 2.68, z: 1.45, r: E, w: 1.5 },
    { kind: 'nightstand', x: 3.43, z: 0.35, r: E },
    { kind: 'shower', x: 3.28, z: -2.5, r: 0 },
    { kind: 'toilet', x: 2.42, z: -2.62, r: 0 },
    { kind: 'vanity', x: 3.42, z: -1.4, r: E, w: 0.7 },
    { kind: 'coatrack', x: 0.15, z: 2.68, r: PI },
    // Outside on the street.
    { kind: 'streetlamp', x: -4.6, z: 4.6, r: 0 },
    { kind: 'streetlamp', x: 5.2, z: 4.6, r: 0 },
    { kind: 'bin', x: 2.3, z: 3.6, r: 0 },
    { kind: 'bench', x: -2.8, z: 4.55, r: PI },
    { kind: 'tree', x: 10.2, z: 3.8, r: 0 },
    { kind: 'tree', x: -10.4, z: 4.0, r: 1 },
    { kind: 'planter', x: -0.3, z: 3.45, r: 0, w: 1.0 },
  ],
  yards: [
    { x0: -9, z0: 3, x1: 9, z1: 4.9, floor: 'pavement', name: 'Pavement', walk: true },
  ],
  car: { x: -3.6, z: 6.2, r: W },
  spawn: { x: -1.3, z: 1.9, r: -2.4 },
};

const apartment: Plan = {
  w: 9.5,
  d: 7,
  h: 2.8,
  facade: 'render',
  outdoor: 'park',
  walls: [
    ...shell(9.5, 7, {
      n: [{ at: -2.9, w: 1.4, kind: 'window', sill: 1.2, h: 1.0 }, { at: 3.0, w: 1.4, kind: 'window', sill: 1.15, h: 1.15 }],
      s: [{ at: -2.4, w: 2.8, kind: 'slide' }, { at: 1.95, w: 0.95, kind: 'door' }, { at: 3.75, w: 0.6, kind: 'window', sill: 1.6, h: 0.6 }],
      e: [{ at: -1.8, w: 1.2, kind: 'window', sill: 0.95, h: 1.35 }],
    }),
    { a: [1.25, -3.5], b: [1.25, 0.4], open: [{ at: -0.45, w: 0.85, kind: 'door' }] },
    { a: [1.25, 0.4], b: [4.75, 0.4] },
    { a: [2.75, 0.4], b: [2.75, 3.5], open: [{ at: 1.3, w: 0.8, kind: 'door' }] },
  ],
  rooms: [
    { x0: -4.75, z0: -3.5, x1: 1.25, z1: 3.5, floor: 'main', name: 'Living' },
    { x0: 1.25, z0: 0.4, x1: 2.75, z1: 3.5, floor: 'main', name: 'Hall' },
    { x0: 1.25, z0: -3.5, x1: 4.75, z1: 0.4, floor: 'main', name: 'Bedroom' },
    { x0: 2.75, z0: 0.4, x1: 4.75, z1: 3.5, floor: 'tile', name: 'Bathroom' },
  ],
  slots: {
    tv: { x: -4.42, z: 1.3, r: W },
    sofa: { x: -1.55, z: 1.3, r: E },
    rug: { x: -3.0, z: 1.3, r: W },
    table: { x: -3.0, z: 1.3, r: W },
    lamp: { x: -1.4, z: -0.35, r: E },
    plant: { x: -0.7, z: -3.05, r: 0 },
    art: { x: 2.66, z: 2.45, r: E, y: 1.6 },
  },
  cabinet: { x: 0.92, z: -2.25, r: E, len: 2.0 },
  frames: [{ x: -4.64, z: -1.75, r: W, y: 1.65 }, { x: 1.36, z: -2.4, r: W, y: 1.65 }, { x: 4.64, z: -0.55, r: E, y: 1.65 }],
  fixtures: [
    { kind: 'kitchen', x: -3.0, z: -3.16, r: 0, w: 3.5 },
    { kind: 'island', x: -3.0, z: -1.6, r: 0, w: 1.9 },
    { kind: 'bed', x: 3.0, z: -2.42, r: 0, w: 1.6 },
    { kind: 'nightstand', x: 1.88, z: -3.18, r: 0 },
    { kind: 'nightstand', x: 4.12, z: -3.18, r: 0 },
    { kind: 'wardrobe', x: 3.55, z: 0.02, r: PI, w: 1.7 },
    { kind: 'shower', x: 4.22, z: 2.97, r: PI },
    { kind: 'toilet', x: 4.42, z: 1.15, r: E },
    { kind: 'vanity', x: 3.25, z: 3.18, r: PI, w: 0.8 },
    { kind: 'coatrack', x: 2.42, z: 3.12, r: PI },
    // The garden and the park beyond.
    { kind: 'patio', x: -3.3, z: 5.0, r: 0 },
    { kind: 'hedge', x: 0, z: 8.15, r: 0, w: 9.5 },
    { kind: 'hedge', x: -4.95, z: 5.8, r: W, w: 4.6 },
    { kind: 'hedge', x: 4.95, z: 5.8, r: W, w: 4.6 },
    { kind: 'tree', x: 3.2, z: 6.5, r: 0 },
    { kind: 'bush', x: -4.1, z: 7.4, r: 0 },
    { kind: 'bush', x: 1.2, z: 7.6, r: 2 },
    { kind: 'bench', x: -0.6, z: 7.45, r: PI },
    { kind: 'goal', x: 2.6, z: 7.55, r: PI, w: 1.6 },
  ],
  yards: [
    { x0: -4.75, z0: 3.5, x1: 4.75, z1: 8.0, floor: 'grass', name: 'Garden', walk: true },
    { x0: -4.6, z0: 3.5, x1: -0.2, z1: 5.4, floor: 'paving', name: 'Patio', walk: true },
  ],
  spawn: { x: -1.0, z: -0.2, r: 2.6 },
};

const townhouse: Plan = {
  w: 11,
  d: 8,
  h: 2.9,
  facade: 'redbrick',
  outdoor: 'townhouse',
  walls: [
    ...shell(11, 8, {
      n: [{ at: -3.2, w: 1.6, kind: 'window', sill: 0.9, h: 1.4 }, { at: 2.8, w: 2.2, kind: 'slide' }],
      s: [{ at: -3.0, w: 2.0, kind: 'window', sill: 0.6, h: 1.6 }, { at: 1.5, w: 1.0, kind: 'door' }, { at: 4.0, w: 1.4, kind: 'window', sill: 0.9, h: 1.3 }],
      e: [{ at: -2.0, w: 1.2, kind: 'window', sill: 1.2, h: 0.9 }],
    }),
    { a: [0.5, -4], b: [0.5, 4], open: [{ at: -2.0, w: 2.6, kind: 'open' }, { at: 2.6, w: 0.9, kind: 'door' }] },
    { a: [0.5, 0], b: [5.5, 0], open: [{ at: 1.5, w: 0.9, kind: 'door' }] },
    { a: [2.5, 0], b: [2.5, 4], open: [{ at: 1.2, w: 0.85, kind: 'door' }] },
  ],
  rooms: [
    { x0: -5.5, z0: -4, x1: 0.5, z1: 4, floor: 'main', name: 'Living' },
    { x0: 0.5, z0: -4, x1: 5.5, z1: 0, floor: 'tile', name: 'Kitchen' },
    { x0: 0.5, z0: 0, x1: 2.5, z1: 4, floor: 'stone', name: 'Hall' },
    { x0: 2.5, z0: 0, x1: 5.5, z1: 4, floor: 'main', name: 'Bedroom' },
  ],
  slots: {
    tv: { x: -5.17, z: 0.8, r: W },
    sofa: { x: -2.15, z: 0.8, r: E },
    rug: { x: -3.65, z: 0.8, r: W },
    table: { x: -3.65, z: 0.8, r: W },
    lamp: { x: -1.95, z: 2.5, r: E },
    plant: { x: -5.05, z: 3.5, r: 0 },
    art: { x: -1.2, z: -3.89, r: 0, y: 1.7 },
  },
  cabinet: { x: 0.17, z: 0.75, r: E, len: 2.2 },
  frames: [{ x: -5.42, z: -2.6, r: W, y: 1.65 }, { x: 2.42, z: 3.0, r: E, y: 1.65 }, { x: 3.9, z: -0.08, r: PI, y: 1.75 }, { x: -4.4, z: -3.92, r: 0, y: 2.25 }],
  fixtures: [
    { kind: 'kitchen', x: 5.08, z: -2.25, r: E, w: 3.3 },
    { kind: 'dining', x: 2.55, z: -1.7, r: 0, w: 4 },
    { kind: 'bed', x: 4.36, z: 2.0, r: E, w: 1.6 },
    { kind: 'nightstand', x: 5.17, z: 0.78, r: E },
    { kind: 'nightstand', x: 5.17, z: 3.22, r: E },
    { kind: 'wardrobe', x: 3.45, z: 0.38, r: 0, w: 1.5 },
    { kind: 'console', x: 0.78, z: 1.35, r: W, w: 1.0 },
    { kind: 'coatrack', x: 2.18, z: 3.62, r: PI },
    { kind: 'bookshelf', x: -1.4, z: 3.68, r: PI, w: 1.4 },
    // Front: the street.
    { kind: 'streetlamp', x: -6.6, z: 5.6, r: 0 },
    { kind: 'streetlamp', x: 6.6, z: 5.6, r: 0 },
    { kind: 'planter', x: -1.4, z: 4.45, r: 0, w: 1.4 },
    { kind: 'planter', x: 3.2, z: 4.45, r: 0, w: 1.0 },
    { kind: 'bin', x: 5.0, z: 4.5, r: 0 },
    { kind: 'tree', x: -8.4, z: 5.7, r: 0 },
    { kind: 'tree', x: 8.6, z: 5.6, r: 2 },
    // Back: the garden.
    { kind: 'goal', x: -2.2, z: -10.4, r: 0, w: 2.4 },
    { kind: 'bbq', x: 4.6, z: -5.1, r: PI },
    { kind: 'patio', x: 2.4, z: -5.4, r: PI },
    { kind: 'hedge', x: 0, z: -11.6, r: 0, w: 11 },
    { kind: 'hedge', x: -5.75, z: -7.8, r: W, w: 7.6 },
    { kind: 'hedge', x: 5.75, z: -7.8, r: W, w: 7.6 },
    { kind: 'tree', x: 4.2, z: -9.9, r: 1 },
    { kind: 'bush', x: -4.8, z: -5.0, r: 0 },
  ],
  yards: [
    { x0: -10, z0: 4, x1: 10, z1: 6.2, floor: 'pavement', name: 'Pavement', walk: true },
    { x0: -5.5, z0: -11.4, x1: 5.5, z1: -4, floor: 'grass', name: 'Garden', walk: true },
    { x0: 0.6, z0: -6.4, x1: 5.5, z1: -4, floor: 'paving', name: 'Patio', walk: true },
  ],
  car: { x: -3.2, z: 7.25, r: W },
  spawn: { x: -2.0, z: -1.6, r: 2.4 },
};

const villa: Plan = {
  w: 13,
  d: 9,
  h: 3.1,
  facade: 'white',
  outdoor: 'beach',
  walls: [
    ...shell(13, 9, {
      n: [{ at: -4.9, w: 1.4, kind: 'window', sill: 1.2, h: 1.0 }, { at: 0.9, w: 1.0, kind: 'door' }, { at: 4.25, w: 1.4, kind: 'window', sill: 1.1, h: 1.3 }],
      s: [{ at: -4.3, w: 3.6, kind: 'glass' }, { at: -0.7, w: 3.0, kind: 'slide' }, { at: 3.0, w: 1.2, kind: 'window', sill: 0.8, h: 1.6 }, { at: 5.25, w: 0.6, kind: 'window', sill: 1.7, h: 0.6 }],
      e: [{ at: -3.25, w: 1.0, kind: 'window', sill: 1.0, h: 1.3 }, { at: 2.5, w: 0.8, kind: 'window', sill: 1.7, h: 0.6 }],
      w: [{ at: -2.7, w: 1.4, kind: 'glass' }],
    }),
    { a: [2, -4.5], b: [2, 4.5], open: [{ at: -0.4, w: 0.9, kind: 'door' }, { at: 2.6, w: 0.9, kind: 'door' }] },
    { a: [2, 0.5], b: [6.5, 0.5], open: [{ at: 5.2, w: 0.8, kind: 'door' }] },
    { a: [4, 0.5], b: [4, 4.5] },
  ],
  rooms: [
    { x0: -6.5, z0: -4.5, x1: 2, z1: 4.5, floor: 'main', name: 'Living' },
    { x0: 2, z0: -4.5, x1: 6.5, z1: 0.5, floor: 'main', name: 'Bedroom' },
    { x0: 2, z0: 0.5, x1: 4, z1: 4.5, floor: 'stone', name: 'Gym' },
    { x0: 4, z0: 0.5, x1: 6.5, z1: 4.5, floor: 'tile', name: 'Bathroom' },
  ],
  slots: {
    tv: { x: -6.17, z: 1.0, r: W },
    sofa: { x: -2.95, z: 1.0, r: E },
    rug: { x: -4.55, z: 1.0, r: W },
    table: { x: -4.55, z: 1.0, r: W },
    lamp: { x: -2.75, z: 2.75, r: E },
    plant: { x: -6.0, z: 3.95, r: 0 },
    art: { x: -0.6, z: -4.39, r: 0, y: 1.75 },
  },
  cabinet: { x: 1.67, z: -2.75, r: E, len: 2.6 },
  frames: [{ x: 2.09, z: -3.0, r: W, y: 1.65 }, { x: 2.09, z: 1.45, r: W, y: 1.65 }, { x: -2.25, z: -4.42, r: 0, y: 1.75 }, { x: 6.42, z: -1.0, r: E, y: 2.35 }],
  fixtures: [
    { kind: 'kitchen', x: -4.9, z: -4.08, r: 0, w: 3.2 },
    { kind: 'island', x: -4.85, z: -2.5, r: 0, w: 2.1 },
    { kind: 'dining', x: -0.6, z: -2.25, r: 0, w: 6 },
    { kind: 'bed', x: 4.25, z: -3.42, r: 0, w: 1.8 },
    { kind: 'nightstand', x: 3.02, z: -4.18, r: 0 },
    { kind: 'nightstand', x: 5.48, z: -4.18, r: 0 },
    { kind: 'wardrobe', x: 6.08, z: -0.9, r: E, w: 1.7 },
    { kind: 'bathtub', x: 5.97, z: 2.6, r: E },
    { kind: 'vanity', x: 5.0, z: 4.17, r: PI, w: 1.2 },
    { kind: 'toilet', x: 4.42, z: 0.86, r: 0 },
    { kind: 'weights', x: 3.0, z: 0.85, r: 0, w: 1.4 },
    { kind: 'treadmill', x: 3.45, z: 3.2, r: 0 },
    // Pool deck and beach.
    { kind: 'pool', x: -1.3, z: 7.2, r: 0, w: 6.2, d: 2.8 },
    { kind: 'lounger', x: 3.3, z: 6.6, r: 0 },
    { kind: 'lounger', x: 4.6, z: 6.6, r: 0 },
    { kind: 'umbrella', x: 3.95, z: 6.0, r: 0 },
    { kind: 'palm', x: -5.7, z: 9.3, r: 0 },
    { kind: 'palm', x: 6.0, z: 5.4, r: 2 },
    { kind: 'palm', x: 6.2, z: 9.6, r: 4 },
    { kind: 'railing', x: 0, z: 10.0, r: 0, w: 13 },
    { kind: 'planter', x: -4.6, z: -5.0, r: 0, w: 1.6 },
    { kind: 'bush', x: 5.8, z: -5.6, r: 0 },
  ],
  yards: [
    { x0: -6.5, z0: 4.5, x1: 6.5, z1: 10.1, floor: 'deck', name: 'Pool deck', walk: true },
    { x0: -6.5, z0: -10, x1: 6.5, z1: -4.5, floor: 'paving', name: 'Driveway', walk: true },
    { x0: -40, z0: 10.1, x1: 40, z1: 22, floor: 'sand', name: 'Beach', walk: false, y: -0.9 },
  ],
  car: { x: -2.6, z: -7.0, r: W },
  spawn: { x: -1.6, z: 3.0, r: PI },
  // From the driveway side, looking through the glass to the pool and the sea.
  cam: [PI - 0.55, 0.62],
};

const penthouse: Plan = {
  w: 15,
  d: 10,
  h: 3.2,
  facade: 'glass',
  outdoor: 'tower',
  walls: [
    ...shell(15, 10, {
      n: [{ at: -0.9, w: 1.2, kind: 'door' }, { at: 5.5, w: 1.6, kind: 'window', sill: 1.2, h: 1.0 }],
      s: [{ at: -5.0, w: 4.6, kind: 'glass' }, { at: 0.3, w: 3.4, kind: 'slide' }, { at: 5.5, w: 1.2, kind: 'window', sill: 1.5, h: 0.8 }],
      e: [{ at: -2.6, w: 1.6, kind: 'glass' }, { at: 3.0, w: 1.0, kind: 'window', sill: 1.5, h: 0.8 }],
      w: [{ at: 0, w: 8.6, kind: 'glass' }],
    }),
    { a: [3.5, -5], b: [3.5, 5], open: [{ at: -0.2, w: 0.95, kind: 'door' }, { at: 3.1, w: 0.9, kind: 'door' }] },
    { a: [3.5, 1], b: [7.5, 1] },
  ],
  rooms: [
    { x0: -7.5, z0: -5, x1: 3.5, z1: 5, floor: 'main', name: 'Living' },
    { x0: 3.5, z0: -5, x1: 7.5, z1: 1, floor: 'main', name: 'Bedroom' },
    { x0: 3.5, z0: 1, x1: 7.5, z1: 5, floor: 'tile', name: 'Bathroom' },
  ],
  slots: {
    tv: { x: -4.2, z: -4.65, r: 0 },
    sofa: { x: -4.2, z: -1.45, r: PI },
    rug: { x: -4.2, z: -3.0, r: 0 },
    table: { x: -4.2, z: -3.0, r: 0 },
    lamp: { x: -5.85, z: -1.3, r: PI },
    plant: { x: -6.95, z: -4.5, r: 0 },
    art: { x: 3.59, z: -2.45, r: W, y: 1.75 },
  },
  cabinet: { x: 3.17, z: -2.6, r: E, len: 3.0 },
  frames: [{ x: 3.59, z: -4.05, r: W, y: 1.7 }, { x: 3.41, z: 1.75, r: E, y: 1.7 }, { x: -2.45, z: -4.92, r: 0, y: 1.8 }, { x: 7.42, z: -0.5, r: E, y: 1.7 }],
  fixtures: [
    { kind: 'kitchen', x: 1.65, z: -4.58, r: 0, w: 3.0 },
    { kind: 'island', x: 1.2, z: -2.55, r: 0, w: 2.0 },
    { kind: 'dining', x: 1.0, z: 1.9, r: 0, w: 6 },
    { kind: 'piano', x: -5.6, z: 2.6, r: 0.5 },
    { kind: 'bookshelf', x: -1.6, z: -4.68, r: 0, w: 1.2 },
    { kind: 'bed', x: 5.55, z: -3.9, r: 0, w: 1.8 },
    { kind: 'nightstand', x: 4.32, z: -4.66, r: 0 },
    { kind: 'nightstand', x: 6.78, z: -4.66, r: 0 },
    { kind: 'desk', x: 5.6, z: 0.57, r: PI, w: 1.4 },
    { kind: 'wardrobe', x: 7.08, z: -1.0, r: E, w: 1.6 },
    { kind: 'bathtub', x: 6.97, z: 3.0, r: E },
    { kind: 'shower', x: 4.0, z: 4.5, r: PI },
    { kind: 'vanity', x: 5.5, z: 1.33, r: 0, w: 1.4 },
    { kind: 'toilet', x: 7.1, z: 1.5, r: E },
    // The terrace.
    { kind: 'hottub', x: 4.6, z: 7.3, r: 0 },
    { kind: 'lounger', x: -5.4, z: 7.0, r: 0 },
    { kind: 'lounger', x: -4.0, z: 7.0, r: 0 },
    { kind: 'umbrella', x: -4.7, z: 6.4, r: 0 },
    { kind: 'planter', x: -1.0, z: 9.2, r: 0, w: 2.2 },
    { kind: 'planter', x: -2.05, z: 5.45, r: 0, w: 1.0 },
    { kind: 'railing', x: 0, z: 9.85, r: 0, w: 15 },
    { kind: 'railing', x: -7.45, z: 7.45, r: W, w: 4.9 },
    { kind: 'railing', x: 7.45, z: 7.45, r: W, w: 4.9 },
  ],
  yards: [{ x0: -7.5, z0: 5, x1: 7.5, z1: 9.9, floor: 'deck', name: 'Terrace', walk: true }],
  spawn: { x: -2.2, z: 0.3, r: -2.6 },
  cam: [0.5, 0.66],
};

export const PLANS: Record<string, Plan> = { studio, apartment, townhouse, villa, penthouse };
