// Your place: a cut-away dollhouse of your home with its real rooms (living
// room, kitchen, bedroom, bathroom…), the neighbourhood outside, your
// furniture, trophies and framed shirts, and you, walking around it. Tap the
// floor to walk there, tap the sofa or the trophy cabinet to go and use it.
// The walls nearest the camera drop down so you can always see inside.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Appearance } from '../../shared/appearance.ts';
import type { Equipped } from '../../shared/cosmetics.ts';
import { CAR_BY_ID, FLOOR_STYLES, FURNITURE_BY_ID, HOUSE_BY_ID, WALL_COLORS, type Home } from '../../shared/life.ts';
import { Figure, GK_KITS, type Kit } from './figures.ts';
import { car, carSize } from './home/cars.ts';
import { at, blob, box, canvasTex, edgeShade, isShared, mat, rand, worldUV } from './home/kit.ts';
import { NavGrid, subtract, type Area, type Block, type NavWall, type Rect } from './home/nav.ts';
import { buildOutdoor, MOODS, skyDome, slab, type Mood } from './home/outdoor.ts';
import { PLANS, type Facade, type Opening, type Outdoor, type Place, type RoomDef, type WallDef, type Yard } from './home/plans.ts';
import * as P from './home/props.ts';

export interface RoomData {
  home: Home;
  trophies: { kind: string; season: number }[];
  collectibles: { kind: string; label: string; data: { primary?: string; secondary?: string; number?: number; club?: string } }[];
  owner?: { appearance: Appearance; equipped: Equipped; kit: Kit; keeper: boolean };
  /** Your cars, so the favourite can be parked outside in its own paint. */
  cars?: { id: string; color: string }[];
}

export interface GarageData {
  cars: { id: string; color: string }[];
  capacity: number;
  fav: string | null;
  /** The home's view, so the garage sits in the same neighbourhood and light. */
  view?: string;
  owner?: RoomData['owner'];
}

export interface HomeScene {
  room(d: RoomData): void;
  garage(d: GarageData): void;
  /** Points the camera: yaw round the house, elevation in radians, zoom as a share of the fitted distance. */
  view(yaw: number, elev: number, zoom: number): void;
  dispose(): void;
}

const PI = Math.PI;
const EXT_T = 0.22;
const INT_T = 0.12;
/** Height a wall drops to when it is cut away for the camera. */
const CUT_H = 0.42;
const WALK = 1.4;
const JOG = 2.6;

// ---------- floors & facades ----------

function floorTexture(style: string): THREE.Texture {
  const r = rand(style.length * 97);
  let t: THREE.Texture;
  if (style === 'oak' || style === 'walnut') {
    const base = style === 'oak' ? [196, 152, 102] : [110, 70, 44];
    t = canvasTex(512, 512, (g) => {
      for (let i = 0; i < 8; i++) {
        let x = -r() * 200;
        while (x < 512) {
          const len = 160 + r() * 220;
          const k = 0.86 + r() * 0.26;
          g.fillStyle = `rgb(${base[0] * k},${base[1] * k},${base[2] * k})`;
          g.fillRect(x, i * 64, len, 64);
          g.strokeStyle = 'rgba(0,0,0,.09)';
          for (let j = 0; j < 7; j++) {
            g.beginPath();
            const y = i * 64 + 6 + r() * 52;
            g.moveTo(x, y);
            g.bezierCurveTo(x + len / 3, y + r() * 6 - 3, x + (2 * len) / 3, y + r() * 6 - 3, x + len, y);
            g.stroke();
          }
          g.fillStyle = 'rgba(0,0,0,.32)';
          g.fillRect(x, i * 64, 2, 64);
          x += len;
        }
        g.fillStyle = 'rgba(0,0,0,.28)';
        g.fillRect(0, i * 64, 512, 2);
      }
    });
    t.userData.metres = 1.6;
  } else if (style === 'marble') {
    t = canvasTex(512, 512, (g) => {
      g.fillStyle = '#ece8e1';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 28; i++) {
        g.strokeStyle = `rgba(120,115,110,${0.08 + r() * 0.18})`;
        g.lineWidth = 0.6 + r() * 2;
        g.beginPath();
        let x = r() * 512;
        let y = r() * 512;
        g.moveTo(x, y);
        for (let k = 0; k < 8; k++) {
          x += r() * 90 - 30;
          y += r() * 90 - 45;
          g.lineTo(x, y);
        }
        g.stroke();
      }
      g.strokeStyle = 'rgba(0,0,0,.12)';
      g.lineWidth = 2;
      for (let i = 0; i <= 2; i++) {
        g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, 512); g.stroke();
        g.beginPath(); g.moveTo(0, i * 256); g.lineTo(512, i * 256); g.stroke();
      }
    });
    t.userData.metres = 1.8;
  } else {
    t = canvasTex(512, 512, (g) => {
      g.fillStyle = '#8f9295';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 3500; i++) {
        g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.06})`;
        g.fillRect(r() * 512, r() * 512, 2 + r() * 4, 2 + r() * 4);
      }
      g.strokeStyle = 'rgba(0,0,0,.16)';
      g.lineWidth = 2;
      g.strokeRect(1, 1, 510, 510);
    });
    t.userData.metres = 2.4;
  }
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function epoxyTex() {
  const r = rand(5);
  const t = canvasTex(256, 256, (g) => {
    g.fillStyle = '#4a4e55';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.12})`;
      g.fillRect(r() * 256, r() * 256, 1.2, 1.2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.userData.metres = 2;
  return t;
}

const facadeTexCache = new Map<string, THREE.Texture>();
function facadeTex(kind: Facade): THREE.Texture | null {
  if (kind !== 'brick' && kind !== 'redbrick') return null;
  let t = facadeTexCache.get(kind);
  if (t) return t;
  const r = rand(kind.length * 13);
  const base = kind === 'brick' ? [150, 92, 70] : [168, 80, 56];
  t = canvasTex(256, 256, (g) => {
    g.fillStyle = '#d8d0c4';
    g.fillRect(0, 0, 256, 256);
    // 1 m of wall: 13 courses of bricks.
    const rows = 13;
    const bh = 256 / rows;
    for (let j = 0; j < rows; j++) {
      const off = j % 2 ? 0 : 21;
      for (let x = -42 + off; x < 256; x += 42.6) {
        const k = 0.82 + r() * 0.3;
        g.fillStyle = `rgb(${base[0] * k},${base[1] * k},${base[2] * k})`;
        g.fillRect(x + 1.5, j * bh + 1.5, 39.6, bh - 3);
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.userData.shared = true;
  facadeTexCache.set(kind, t);
  return t;
}

function facadeMat(kind: Facade): THREE.Material {
  const tex = facadeTex(kind);
  if (tex) return cachedStd(`facade-${kind}`, () => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  const col: Record<Facade, string> = { brick: '#9c5a43', redbrick: '#a8503a', render: '#ebe5da', white: '#f6f2ea', glass: '#2a303a' };
  return mat(col[kind], { rough: kind === 'glass' ? 0.25 : 0.85, metal: kind === 'glass' ? 0.5 : 0 });
}

const stdCache = new Map<string, THREE.Material>();
function cachedStd(key: string, make: () => THREE.Material) {
  let m = stdCache.get(key);
  if (!m) {
    m = make();
    m.userData.shared = true;
    stdCache.set(key, m);
  }
  return m;
}

// ---------- walls ----------

interface WallObj {
  group: THREE.Group;
  mid: THREE.Vector2;
  normal: THREE.Vector2;
  len: number;
  s: number;
  upper: THREE.Object3D[];
}

function openingSpan(o: Opening, h: number): [number, number] {
  if (o.kind === 'door') return [0, 2.1];
  if (o.kind === 'open') return [0, Math.min(2.3, h - 0.3)];
  if (o.kind === 'glass' || o.kind === 'slide') return [o.sill ?? 0, h - 0.28];
  const sill = o.sill ?? 0.9;
  return [sill, Math.min(h - 0.2, sill + (o.h ?? 1.2))];
}

/** Builds one wall with its openings. Also reports the walkable gaps through it. */
function buildWall(def: WallDef, h: number, center: THREE.Vector2, paint: THREE.Material, facade: Facade): { obj: WallObj; nav: NavWall } {
  const t = def.ext ? EXT_T : INT_T;
  let [ax, az] = def.a;
  let [bx, bz] = def.b;
  const horiz = Math.abs(az - bz) < 1e-6;
  if (def.ext) {
    // Outside walls sit just outside the footprint and overlap at the corners.
    const mx = (ax + bx) / 2 - center.x;
    const mz = (az + bz) / 2 - center.y;
    if (horiz) {
      const s = Math.sign(mz);
      az += (s * t) / 2;
      bz += (s * t) / 2;
      ax -= t;
      bx += t;
    } else {
      const s = Math.sign(mx);
      ax += (s * t) / 2;
      bx += (s * t) / 2;
    }
  }
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  const theta = Math.atan2(-dz, dx);
  const g = new THREE.Group();
  g.position.set(ax, 0, az);
  g.rotation.y = theta;
  // Local +z points to (sin θ, cos θ) in the world.
  const nz = new THREE.Vector2(Math.sin(theta), Math.cos(theta));
  const mid = new THREE.Vector2((ax + bx) / 2, (az + bz) / 2);
  const outIsPlus = nz.dot(mid.clone().sub(center)) > 0;
  const cap = mat('#1b1e23', { rough: 0.7 });
  const outer = def.ext ? facadeMat(facade) : paint;
  const mats = [cap, cap, cap, cap, outIsPlus ? outer : paint, outIsPlus ? paint : outer];
  const skirt = mat('#f2efe9', { rough: 0.45 });
  const start = horiz ? ax : az;
  const opens = (def.open ?? []).map((o) => ({ o, s0: o.at - o.w / 2 - start, s1: o.at + o.w / 2 - start, span: openingSpan(o, h) })).sort((p, q) => p.s0 - q.s0);
  const upper: THREE.Object3D[] = [];
  const piece = (x0: number, x1: number, y0: number, y1: number) => {
    if (x1 - x0 < 0.005 || y1 - y0 < 0.005) return;
    const w = x1 - x0;
    const hh = y1 - y0;
    const geo = worldUV(new THREE.BoxGeometry(w, hh, t), w, hh, t, x0, y0);
    const m = new THREE.Mesh(geo, mats);
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    m.castShadow = m.receiveShadow = true;
    m.userData.wall = true;
    g.add(m);
    if (y0 < 0.01) {
      // Skirting on the inside faces.
      for (const side of def.ext ? [outIsPlus ? -1 : 1] : [-1, 1]) {
        const sk = new THREE.Mesh(new THREE.BoxGeometry(w, 0.09, 0.016), skirt);
        sk.position.set((x0 + x1) / 2, 0.045, side * (t / 2 + 0.008));
        g.add(sk);
      }
    }
  };
  let cur = 0;
  const gaps: [number, number][] = [];
  const frameM = mat(facade === 'glass' ? '#1d2025' : '#f4f2ee', { rough: 0.35 });
  const darkFrame = mat('#22262c', { rough: 0.35, metal: 0.4 });
  for (const { o, s0, s1, span } of opens) {
    piece(cur, s0, 0, h);
    const [y0, y1] = span;
    piece(s0, s1, 0, y0);
    piece(s0, s1, y1, h);
    cur = s1;
    const ow = s1 - s0;
    const cx = (s0 + s1) / 2;
    const deco = new THREE.Group();
    const fm = o.kind === 'glass' || o.kind === 'slide' ? darkFrame : frameM;
    if (o.kind === 'door' || o.kind === 'open') {
      gaps.push([s0, s1]);
      for (const x of [s0 + 0.03, s1 - 0.03]) deco.add(at(box(0.06, y1, t + 0.04, fm, 0.01), x, y1 / 2, 0));
      deco.add(at(box(ow, 0.06, t + 0.04, fm, 0.01), cx, y1 - 0.03, 0));
      if (o.kind === 'door') {
        // The door stands open into the room, hinged at one side.
        const side = def.ext ? (outIsPlus ? -1 : 1) : 1;
        const leafM = mat(def.ext ? '#2a3a4c' : '#efece6', { rough: 0.4, clear: def.ext });
        const leaf = new THREE.Group();
        leaf.add(at(box(ow - 0.08, y1 - 0.04, 0.045, leafM, 0.01), (ow - 0.08) / 2, (y1 - 0.04) / 2, 0));
        leaf.add(at(box(0.03, 0.03, 0.14, mat('#c9ccd1', { metal: 1, rough: 0.25 }), 0.01), ow - 0.18, 1.0, 0));
        leaf.position.set(s0 + 0.04, 0, (side * t) / 2);
        leaf.rotation.y = -side * (PI / 2) * 0.88;
        deco.add(leaf);
      }
    } else {
      // Window or glazing: frame, mullions, glass, sills.
      const hh = y1 - y0;
      for (const x of [s0 + 0.03, s1 - 0.03]) deco.add(at(box(0.06, hh, 0.1, fm, 0.01), x, y0 + hh / 2, 0));
      deco.add(at(box(ow, 0.06, 0.1, fm, 0.01), cx, y1 - 0.03, 0));
      deco.add(at(box(ow, 0.06, 0.1, fm, 0.01), cx, y0 + 0.03, 0));
      const panes = Math.max(1, Math.round(ow / (o.kind === 'window' ? 0.9 : 1.25)));
      for (let i = 1; i < panes; i++) deco.add(at(box(0.04, hh, 0.07, fm, 0.005), s0 + (ow * i) / panes, y0 + hh / 2, 0));
      let gx0 = s0;
      let gx1 = s1;
      if (o.kind === 'slide') {
        // One panel slid open: walk through it.
        const open = Math.min(1.1, ow * 0.45);
        gaps.push([s1 - open, s1]);
        gx1 = s1 - open;
        deco.add(at(box(0.05, hh, 0.08, fm, 0.005), gx1, y0 + hh / 2, 0.03));
      }
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(gx1 - gx0, hh), mat('#cfe6f5', { glass: true, opacity: 0.16 }));
      (glass.material as THREE.Material).side = THREE.DoubleSide;
      glass.position.set((gx0 + gx1) / 2, y0 + hh / 2, 0);
      glass.renderOrder = 3;
      glass.userData.glass = true;
      deco.add(glass);
      if (o.kind === 'window' && y0 > 0.2) {
        for (const side of [-1, 1]) deco.add(at(box(ow + 0.12, 0.04, 0.12, side === (outIsPlus ? 1 : -1) && def.ext ? mat('#d8d2c8', { rough: 0.6 }) : frameM, 0.01), cx, y0 - 0.02, side * (t / 2 + 0.03)));
      }
    }
    deco.userData.upper = true;
    g.add(deco);
  }
  piece(cur, len, 0, h);
  const normal = new THREE.Vector2(nz.x, nz.y);
  return {
    obj: { group: g, mid, normal, len, s: 1, upper },
    nav: { a: [ax, az], b: [bx, bz], gaps },
  };
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

// ---------- layouts ----------

interface Placed {
  prop: P.Prop;
  x: number;
  z: number;
  r: number;
  y?: number;
}

interface Layout {
  w: number;
  d: number;
  h: number;
  facade: Facade;
  walls: WallDef[];
  rooms: RoomDef[];
  yards: Yard[];
  outdoor: Outdoor;
  mood: Mood;
  wall: string;
  floor: string;
  placed: Placed[];
  spawn: Place;
  cam?: [number, number];
  /** Holes in the yards (a pool). */
  holes: Rect[];
  /** Extra decoration added straight to the world. */
  extra?: (world: THREE.Group) => void;
}

const VIEW_OUTDOOR: Record<string, Outdoor> = { city: 'street', park: 'park', sea: 'beach', skyline: 'tower' };

function roomLayout(d: RoomData): Layout {
  const tierId = HOUSE_BY_ID[d.home.tier] ? d.home.tier : 'studio';
  const plan = PLANS[tierId] ?? PLANS.studio;
  const placed: Placed[] = [];
  const F = d.home.furniture;
  const put = (prop: P.Prop, p: Place) => placed.push({ prop, x: p.x, z: p.z, r: p.r, y: p.y });
  const f = (slot: keyof typeof F) => {
    const id = F[slot];
    return id ? FURNITURE_BY_ID[id] : undefined;
  };
  const rugF = f('rug');
  if (rugF) put(P.rug(rugF), plan.slots.rug);
  const sofaF = f('sofa');
  if (sofaF) put(P.sofa(sofaF), plan.slots.sofa);
  const tvF = f('tv');
  if (tvF) put(P.tv(tvF), plan.slots.tv);
  const tableF = f('table');
  if (tableF) put(P.table(tableF), plan.slots.table);
  const plantF = f('plant');
  if (plantF) put(P.plant(plantF), plan.slots.plant);
  const lampF = f('lamp');
  if (lampF) put(P.lamp(lampF), plan.slots.lamp);
  const artF = f('art');
  if (artF) put(P.art(artF), { ...plan.slots.art, y: artF.style === 'neonsign' ? (plan.slots.art.y ?? 1.6) + 0.15 : plan.slots.art.y });
  const balls = d.collectibles.filter((c) => c.kind === 'ball').length;
  put(P.cabinet(plan.cabinet.len, d.trophies, balls), plan.cabinet);
  const shirts = d.collectibles.filter((c) => c.kind === 'shirt');
  shirts.slice(0, plan.frames.length).forEach((c, i) => put({ obj: P.shirtFrame(c) }, plan.frames[i]));
  for (const fx of plan.fixtures) put(P.fixture(fx), fx);
  // Your favourite car parked outside, when the house has a kerb for it.
  const fav = d.home.favCar && CAR_BY_ID[d.home.favCar];
  if (fav && plan.car) {
    const g = car(fav, d.cars?.find((c) => c.id === fav.id)?.color ?? '#c8102e');
    const sz = carSize(fav);
    placed.push({ prop: { obj: g, foot: sz, use: { x: sz[0] / 2 + 0.6, z: 0.4, face: -PI / 2 } }, x: plan.car.x, z: plan.car.z, r: plan.car.r });
  }
  const holes: Rect[] = plan.fixtures.filter((x) => x.kind === 'pool').map((p) => ({ x0: p.x - (p.w ?? 6) / 2, z0: p.z - (p.d ?? 3) / 2, x1: p.x + (p.w ?? 6) / 2, z1: p.z + (p.d ?? 3) / 2 }));
  return {
    w: plan.w,
    d: plan.d,
    h: plan.h,
    facade: plan.facade,
    walls: plan.walls,
    rooms: plan.rooms,
    yards: plan.yards,
    outdoor: plan.outdoor,
    mood: MOODS[plan.outdoor],
    wall: WALL_COLORS[d.home.wall] ?? WALL_COLORS[0],
    floor: FLOOR_STYLES[d.home.floor] ?? 'oak',
    placed,
    spawn: plan.spawn,
    cam: plan.cam,
    holes,
  };
}

function garageLayout(d: GarageData, carColor: (id: string) => string): Layout {
  const bays = Math.max(1, d.capacity);
  const bayW = 3.3;
  const tool = 2.2;
  const w = bays * bayW + tool;
  const dep = 7.4;
  const h = 3.1;
  const x0 = -w / 2;
  const bayX = (i: number) => x0 + tool + bayW * (i + 0.5);
  const s: Opening[] = [{ at: x0 + tool / 2, w: 0.95, kind: 'door' }];
  const n: Opening[] = [];
  for (let i = 0; i < bays; i++) {
    s.push({ at: bayX(i), w: 2.75, kind: 'open' });
    n.push({ at: bayX(i), w: 1.8, kind: 'window', sill: 2.05, h: 0.6 });
  }
  const walls: WallDef[] = [
    { a: [-w / 2, -dep / 2], b: [w / 2, -dep / 2], open: n, ext: true },
    { a: [-w / 2, dep / 2], b: [w / 2, dep / 2], open: s, ext: true },
    { a: [w / 2, -dep / 2], b: [w / 2, dep / 2], ext: true },
    { a: [-w / 2, -dep / 2], b: [-w / 2, dep / 2], ext: true },
  ];
  const placed: Placed[] = [];
  let spawn: Place = { x: x0 + tool / 2, z: 1.2, r: PI * 0.8 };
  for (let i = 0; i < bays; i++) {
    const c = d.cars[i];
    const model = c && CAR_BY_ID[c.id];
    if (!model) continue;
    const sz = carSize(model);
    placed.push({ prop: { obj: car(model, carColor(c.id)), foot: sz, use: { x: -sz[0] / 2 - 0.55, z: 0.5, face: PI / 2 } }, x: bayX(i), z: -0.2, r: 0 });
    if (c.id === d.fav) spawn = { x: bayX(i) - sz[0] / 2 - 0.6, z: 0.9, r: PI / 2 + 0.3 };
  }
  // Tool corner: workbench with a pegboard, a tool chest and a stack of tyres.
  const bench = new THREE.Group();
  bench.add(at(box(1.8, 0.06, 0.65, mat('#9a6a3c', { rough: 0.5 }), 0.01), 0, 0.92, 0));
  bench.add(at(box(1.7, 0.85, 0.6, mat('#c8102e', { rough: 0.35, clear: true }), 0.02), 0, 0.45, 0));
  for (let k = 0; k < 3; k++) bench.add(at(box(0.5, 0.01, 0.01, mat('#16181b'), 0), -0.56 + k * 0.56, 0.6, 0.301));
  bench.add(at(box(1.8, 1.0, 0.03, mat('#d9d4c8', { rough: 0.8 }), 0), 0, 1.65, -0.3));
  const toolM = mat('#2a2f35', { metal: 0.6, rough: 0.35 });
  for (let k = 0; k < 7; k++) bench.add(at(box(0.04, 0.24 + (k % 3) * 0.08, 0.03, toolM, 0.01), -0.7 + k * 0.23, 1.6, -0.27));
  bench.add(blob(1.8, 0.65));
  placed.push({ prop: { obj: bench, foot: [1.8, 0.7], use: { x: 0, z: 0.85, face: PI } }, x: x0 + 1.05, z: -dep / 2 + 0.36, r: 0 });
  const tyres = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const ty = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.12, 10, 24), mat('#141516', { rough: 0.9 }));
    ty.rotation.x = PI / 2;
    ty.position.y = 0.12 + k * 0.24;
    ty.castShadow = true;
    tyres.add(ty);
  }
  tyres.add(blob(0.8, 0.8));
  placed.push({ prop: { obj: tyres, foot: [0.85, 0.85] }, x: x0 + 0.55, z: 0.4, r: 0 });
  placed.push({ prop: { obj: P.goal(1.5).obj, foot: [1.6, 0.7] }, x: x0 + 0.95, z: dep / 2 - 0.75, r: 0 });
  const outdoor: Outdoor = d.view === 'park' ? 'park' : 'street';
  const mood = MOODS[VIEW_OUTDOOR[d.view ?? 'city'] ?? 'street'];
  const extra = (world: THREE.Group) => {
    const line = mat('#e8ecef', { rough: 0.6 });
    const yellow = mat('#ffcf3d', { rough: 0.6 });
    for (let i = 0; i <= bays; i++) world.add(at(box(0.08, 0.008, dep - 1.6, line, 0), x0 + tool + bayW * i, 0.006, 0.3));
    for (let i = 0; i < bays; i++) {
      const x = bayX(i);
      world.add(at(box(1.0, 0.008, 0.12, yellow, 0), x, 0.006, -dep / 2 + 0.75));
      // Wheel stops at the back of each bay.
      world.add(at(box(0.5, 0.1, 0.16, mat('#2a2d33', { rough: 0.7 }), 0.03), x - 0.55, 0.05, -dep / 2 + 0.55));
      world.add(at(box(0.5, 0.1, 0.16, mat('#2a2d33', { rough: 0.7 }), 0.03), x + 0.55, 0.05, -dep / 2 + 0.55));
      // A light bar per bay along the back wall and the roller door rolled up outside.
      world.add(at(box(1.8, 0.05, 0.1, mat('#ffffff', { emissive: '#f4fbff', glow: 2.4 }), 0.01), x, h - 0.25, -dep / 2 + 0.08));
      const c = d.cars[i];
      if (c && c.id === d.fav) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(2.45, 2.55, 64), new THREE.MeshBasicMaterial({ color: '#c6ff3d', transparent: true, opacity: 0.85, toneMapped: false }));
        ring.rotation.x = -PI / 2;
        ring.scale.set(0.55, 1, 1);
        ring.position.set(x, 0.01, -0.2);
        world.add(ring);
      }
      if (!c) {
        const t = canvasTex(256, 128, (g) => {
          g.fillStyle = 'rgba(232,236,239,.5)';
          g.font = '800 46px system-ui, sans-serif';
          g.textAlign = 'center';
          g.fillText('EMPTY', 128, 80);
        });
        const p = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
        p.rotation.x = -PI / 2;
        p.position.set(x, 0.012, 0.4);
        world.add(p);
      }
    }
  };
  return {
    w,
    d: dep,
    h,
    facade: d.view === 'skyline' ? 'glass' : d.view === 'sea' ? 'white' : 'render',
    walls,
    rooms: [{ x0: -w / 2, z0: -dep / 2, x1: w / 2, z1: dep / 2, floor: 'main', name: 'Garage' }],
    yards: [{ x0: -w / 2 - 1, z0: dep / 2, x1: w / 2 + 1, z1: dep / 2 + 6, floor: 'paving', name: 'Driveway', walk: true }],
    outdoor,
    mood,
    wall: '#e2ddd3',
    floor: 'epoxy',
    placed,
    spawn,
    holes: [],
    extra,
  };
}

// ---------- the scene ----------

const proxyGeo = new THREE.BoxGeometry(1, 1, 1);
proxyGeo.userData.shared = true;
const proxyMat = new THREE.MeshBasicMaterial({ visible: false });
proxyMat.userData.shared = true;

/**
 * Bakes meshes into one mesh per material, in `frame`'s own coordinates.
 * Multi-material meshes (wall pieces, buildings) are split by material first.
 */
function bake(meshes: THREE.Mesh[], frame: THREE.Object3D): THREE.Mesh[] {
  frame.updateMatrixWorld(true);
  const inv = frame.matrixWorld.clone().invert();
  const buckets = new Map<string, { mat: THREE.Material; cast: boolean; recv: boolean; order: number; geos: THREE.BufferGeometry[] }>();
  const add = (mt: THREE.Material, m: THREE.Mesh, geo: THREE.BufferGeometry) => {
    const key = `${mt.uuid}|${m.castShadow}|${m.receiveShadow}|${m.renderOrder}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { mat: mt, cast: m.castShadow, recv: m.receiveShadow, order: m.renderOrder, geos: [] }));
    b.geos.push(geo);
  };
  const mtx = new THREE.Matrix4();
  for (const m of meshes) {
    const g = m.geometry;
    const geo = g.index ? g.toNonIndexed() : g.clone();
    for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') geo.deleteAttribute(name);
    geo.morphAttributes = {};
    geo.applyMatrix4(mtx.multiplyMatrices(inv, m.matrixWorld));
    if (Array.isArray(m.material)) {
      for (const grp of g.groups) {
        const mt = m.material[grp.materialIndex ?? 0];
        if (!mt) continue;
        const sub = new THREE.BufferGeometry();
        for (const name of Object.keys(geo.attributes)) {
          const a = geo.getAttribute(name) as THREE.BufferAttribute;
          sub.setAttribute(name, new THREE.BufferAttribute((a.array as Float32Array).slice(grp.start * a.itemSize, (grp.start + grp.count) * a.itemSize), a.itemSize));
        }
        add(mt, m, sub);
      }
      geo.dispose();
    } else {
      geo.clearGroups();
      add(m.material, m, geo);
    }
    m.removeFromParent();
    if (!g.userData.shared) g.dispose();
  }
  const out: THREE.Mesh[] = [];
  for (const b of buckets.values()) {
    const merged = mergeGeometries(b.geos, false);
    for (const g of b.geos) g.dispose();
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, b.mat);
    mesh.castShadow = b.cast;
    mesh.receiveShadow = b.recv;
    mesh.renderOrder = b.order;
    frame.add(mesh);
    out.push(mesh);
  }
  return out;
}

/** Can this mesh be baked with its neighbours? Not if it moves, takes taps, or is see-through. */
function bakeable(m: THREE.Mesh) {
  if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh) return false;
  if (m.userData.proxy || m.userData.floor || m.userData.water || m.userData.foam || m.userData.glass) return false;
  const mts = Array.isArray(m.material) ? m.material : [m.material];
  // Transparent things sort per mesh; only the floor shadows (all flat on the floor) can share one.
  if (mts.some((mt) => mt.transparent && !(m.renderOrder === 1 && !mt.depthWrite))) return false;
  return !!m.geometry.getAttribute('normal') && !!m.geometry.getAttribute('uv');
}

/** Bakes every static mesh in the world, leaving walls (they drop for the camera) and anything marked keep. */
function mergeStatic(root: THREE.Group) {
  const list: THREE.Mesh[] = [];
  root.traverse((o) => {
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (p.userData.keep) return;
    if (bakeable(o as THREE.Mesh)) list.push(o as THREE.Mesh);
  });
  bake(list, root);
}

/** Bakes a wall's pieces into a few meshes, and its window and door trims into a few more. */
function bakeWall(w: WallObj) {
  const lower: THREE.Mesh[] = [];
  const upperM: THREE.Mesh[] = [];
  const keep: THREE.Object3D[] = [];
  w.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    let up = false;
    for (let p: THREE.Object3D | null = o; p && p !== w.group; p = p.parent) if (p.userData.upper) up = true;
    if (!bakeable(m)) {
      if (up) keep.push(m);
      return;
    }
    (up ? upperM : lower).push(m);
  });
  const walls = bake(lower, w.group);
  for (const m of walls) m.userData.wall = true;
  w.upper = [...bake(upperM, w.group), ...keep];
}

export function createHomeScene(host: HTMLElement): HomeScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;cursor:grab';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 500);
  let world = new THREE.Group();
  scene.add(world);
  let dome: THREE.Mesh | null = null;
  let figure: Figure | null = null;
  let walls: WallObj[] = [];
  let nav: NavGrid | null = null;
  let spots: { x: number; z: number; face: number }[] = [];
  let water: THREE.Mesh[] = [];
  let wanderAreas: Rect[] = [];
  const center = new THREE.Vector2();
  let fit = 12;
  let houseH = 2.8;

  // Camera orbit: drag to swing round, pinch or scroll to zoom, tap to walk.
  let yaw = 0.62;
  let yawT = yaw;
  let elev = 0.82;
  let elevT = elev;
  let dist = 12;
  let distT = dist;
  const target = new THREE.Vector3();
  const pointers = new Map<number, { x: number; y: number }>();
  let downAt = 0;
  let moved = 0;
  let pinch = 0;
  let lastUser = -100;
  let clockT = 0;

  const onDown = (e: PointerEvent) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    renderer.domElement.setPointerCapture(e.pointerId);
    if (pointers.size === 1) {
      downAt = performance.now();
      moved = 0;
    }
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      moved = 99;
    }
    renderer.domElement.style.cursor = 'grabbing';
  };
  const onMove = (e: PointerEvent) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 1) {
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) {
        yawT -= dx * 0.0085;
        elevT = clamp(elevT + dy * 0.005, 0.32, 1.32);
      }
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) distT = clamp(distT * (pinch / d), fit * 0.28, fit * 1.3);
      pinch = d;
    }
  };
  const onUp = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      renderer.domElement.style.cursor = 'grab';
      if (moved < 8 && performance.now() - downAt < 450) tap(e.clientX, e.clientY);
    }
    if (pointers.size < 2) pinch = 0;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    distT = clamp(distT * Math.exp(e.deltaY * 0.0012), fit * 0.28, fit * 1.3);
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointercancel', onUp);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });

  // Where you tapped: a ring that fades out.
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.24, 40), new THREE.MeshBasicMaterial({ color: '#c6ff3d', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  marker.rotation.x = -PI / 2;
  marker.renderOrder = 5;
  scene.add(marker);
  let markerT = 0;

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function tap(cx: number, cy: number) {
    if (!figure || !nav) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(world.children, true);
    for (const h of hits) {
      let o: THREE.Object3D | null = h.object;
      if (o.userData.glass || !o.visible) continue;
      let spot = -1;
      let wall = false;
      let floor = false;
      while (o) {
        if (o.userData.spot !== undefined) spot = o.userData.spot;
        if (o.userData.wall) wall = true;
        if (o.userData.floor) floor = true;
        if (o.parent === world) break;
        o = o.parent;
      }
      if (wall) {
        // Taps on a cut-down wall's stub pass through to the room behind; a standing wall stops them.
        const wo = walls.find((w) => w.group === o);
        if (wo && wo.s < 0.5) continue;
        return;
      }
      if (spot >= 0) {
        const s = spots[spot];
        walkTo(s.x, s.z, s.face);
        return;
      }
      if (floor) {
        walkTo(h.point.x, h.point.z, null);
        return;
      }
      // Something without a use (a plant, a frame): walk up to it and look at it.
      const near = nav.nearest(h.point.x, h.point.z, 2.5);
      if (near) {
        const [nx, nz] = nav.center(...near);
        walkTo(nx, nz, Math.atan2(h.point.x - nx, h.point.z - nz));
      }
      return;
    }
  }

  function walkTo(x: number, z: number, face: number | null, auto = false) {
    if (!nav || !figure) return;
    const fig = figure;
    const p = fig.root.position;
    const path = nav.path(p.x, p.z, x, z);
    if (!path || path.length < 2) {
      if (face !== null) fig.turnTo(face);
      return;
    }
    const end = path[path.length - 1];
    let len = 0;
    for (let k = 1; k < path.length; k++) len += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
    // Long trips (out to the garden) at a jog, around the room at a walk.
    fig.walkPath(path.slice(1).map(([px, pz]) => ({ x: px, z: pz })), () => {
      if (face !== null) fig.turnTo(face);
    }, len > 8 && !auto ? JOG : WALK);
    if (!auto) {
      lastUser = clockT;
      marker.position.set(end[0], 0.02, end[1]);
      markerT = 1;
    }
  }

  const resize = () => {
    const w = host.clientWidth || 320;
    const h = host.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  const disposeTree = (root: THREE.Object3D) => {
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (!m.geometry.userData.shared) m.geometry.dispose();
      const ms = Array.isArray(m.material) ? m.material : [m.material];
      for (const mm of ms) {
        if (isShared(mm) || mm.userData.shared) continue;
        const sm = mm as THREE.MeshStandardMaterial;
        if (sm.map && !sm.map.userData.shared) sm.map.dispose();
        if (sm.alphaMap && !sm.alphaMap.userData.shared) sm.alphaMap.dispose();
        mm.dispose();
      }
    });
  };

  const clear = () => {
    scene.remove(world);
    // The player's meshes and textures are shared through the character caches: not ours to dispose.
    if (figure) world.remove(figure.root);
    disposeTree(world);
    if (dome) {
      scene.remove(dome);
      disposeTree(dome);
      dome = null;
    }
    world = new THREE.Group();
    scene.add(world);
    figure = null;
    walls = [];
    nav = null;
    spots = [];
    water = [];
  };

  function mount(L: Layout, owner?: RoomData['owner']) {
    clear();
    houseH = L.h;
    const m = L.mood;
    renderer.toneMappingExposure = m.exposure;
    scene.environmentIntensity = m.env;
    scene.fog = new THREE.Fog(m.fog, 70, 260);
    dome = skyDome(m);
    scene.add(dome);
    center.set(0, 0);

    // Outdoors.
    const out = buildOutdoor({ outdoor: L.outdoor, w: L.w, d: L.d, mood: m, holes: L.holes });
    world.add(out.group);
    water = out.water;

    // Light: the sun (or moon) with shadows over the whole plot, sky fill, and room fills.
    const span = Math.max(L.w, L.d) / 2 + 7;
    const sun = new THREE.DirectionalLight(m.sun.color, m.sun.intensity);
    const sd = new THREE.Vector3(...m.sun.dir).normalize();
    sun.position.copy(sd.multiplyScalar(40));
    sun.target.position.set(0, 0, 0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -span;
    sun.shadow.camera.right = sun.shadow.camera.top = span;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 90;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.025;
    sun.shadow.radius = 4;
    world.add(sun, sun.target);
    world.add(new THREE.HemisphereLight(m.hemi[0], m.hemi[1], m.hemi[2]));

    // Floors: each room, then a foundation under the whole house.
    const mainTex = L.floor === 'epoxy' ? epoxyTex() : floorTexture(L.floor);
    const mainMat = new THREE.MeshPhysicalMaterial({ map: mainTex, roughness: L.floor === 'marble' ? 0.18 : L.floor === 'epoxy' ? 0.22 : 0.55, clearcoat: L.floor === 'marble' || L.floor === 'epoxy' ? 0.5 : 0.06, clearcoatRoughness: 0.25 });
    const fm = 1 / (mainTex.userData.metres ?? 2);
    for (const r of L.rooms) {
      const w = r.x1 - r.x0;
      const d = r.z1 - r.z0;
      let floor: THREE.Mesh;
      if (r.floor === 'main') {
        floor = new THREE.Mesh(worldUV(new THREE.BoxGeometry(w, 0.1, d), w * fm, 0.1 * fm, d * fm, r.x0 * fm, r.z0 * fm), mainMat);
        floor.position.set((r.x0 + r.x1) / 2, -0.05, (r.z0 + r.z1) / 2);
        floor.receiveShadow = true;
      } else {
        floor = slab(r.floor, r.x0, r.z0, r.x1, r.z1, 0, 0.1, r.floor === 'tile' ? 0.3 : 0.7);
      }
      floor.userData.floor = true;
      world.add(floor);
    }
    world.add(at(box(L.w + EXT_T * 2 + 0.1, 0.3, L.d + EXT_T * 2 + 0.1, mat('#5a5650', { rough: 0.9 }), 0.01), 0, -0.2, 0));

    // Yards, with any pool cut out of them.
    for (const y of L.yards) {
      const pieces = subtract(y, L.holes);
      for (const p of pieces) {
        const s = slab(y.floor, p.x0, p.z0, p.x1, p.z1, y.y ?? 0, 0.12, y.floor === 'deck' ? 0.7 : 0.9);
        world.add(s);
      }
    }

    // Walls.
    const paint = new THREE.MeshStandardMaterial({ color: L.wall, roughness: 0.92 });
    const navWalls: NavWall[] = [];
    for (const def of L.walls) {
      const { obj, nav: nw } = buildWall(def, L.h, center, paint, L.facade);
      obj.group.userData.keep = true;
      world.add(obj.group);
      walls.push(obj);
      navWalls.push(nw);
      // Soft shading where the wall meets the floor, on the inside.
      const t = def.ext ? EXT_T : INT_T;
      const sides = def.ext ? [obj.normal.dot(obj.mid.clone().sub(center)) > 0 ? -1 : 1] : [-1, 1];
      for (const side of sides) {
        let cur = 0;
        const segs: [number, number][] = [];
        for (const [g0, g1] of [...nw.gaps].sort((a, b) => a[0] - b[0])) {
          segs.push([cur, g0]);
          cur = g1;
        }
        segs.push([cur, obj.len]);
        for (const [s0, s1] of segs) {
          if (s1 - s0 < 0.1) continue;
          const e = edgeShade(s1 - s0);
          e.renderOrder = 1;
          // Strip's dark edge (its local −z) against the wall face.
          e.position.set((s0 + s1) / 2, 0.003, side * (t / 2 + 0.25));
          e.rotation.y = side > 0 ? 0 : PI;
          obj.group.add(e);
        }
      }
      bakeWall(obj);
    }

    // Furniture, fittings and the outdoor pieces.
    const blocks: Block[] = [];
    const lights: { l: THREE.PointLight; pri: number }[] = [];
    for (const p of L.placed) {
      const o = p.prop.obj;
      o.position.set(p.x, p.y ?? 0, p.z);
      o.rotation.y = p.r;
      world.add(o);
      if (p.prop.foot) blocks.push({ x: p.x, z: p.z, w: p.prop.foot[0], d: p.prop.foot[1], r: p.r });
      if (p.prop.foot || p.prop.use) {
        // An invisible box around the piece takes the taps, since the piece itself gets merged.
        const [fw, fd] = p.prop.foot ?? [0.6, 0.6];
        const proxy = new THREE.Mesh(proxyGeo, proxyMat);
        proxy.scale.set(fw, 1.4, fd);
        proxy.position.set(p.x, (p.y ?? 0) + 0.7, p.z);
        proxy.rotation.y = p.r;
        proxy.userData.proxy = true;
        world.add(proxy);
        if (p.prop.use) {
          const u = p.prop.use;
          const c = Math.cos(p.r);
          const s = Math.sin(p.r);
          proxy.userData.spot = spots.length;
          spots.push({ x: p.x + u.x * c + u.z * s, z: p.z - u.x * s + u.z * c, face: p.r + u.face });
        }
      }
      for (const l of p.prop.lights ?? []) lights.push({ l, pri: l.userData.night ? 1 : 2 });
    }
    L.extra?.(world);
    world.traverse((o) => {
      if (o.userData.water && !water.includes(o as THREE.Mesh)) water.push(o as THREE.Mesh);
    });
    // Hundreds of little pieces become a few dozen meshes: far fewer draw calls on a phone.
    mergeStatic(world);

    // Room fills: soft light in each room so nothing sits in the dark.
    for (const r of L.rooms) {
      // Big rooms get a light per 6 m or so.
      const nx = Math.ceil((r.x1 - r.x0) / 6.5);
      const nz = Math.ceil((r.z1 - r.z0) / 6.5);
      const cw = (r.x1 - r.x0) / nx;
      const cd = (r.z1 - r.z0) / nz;
      for (let i = 0; i < nx; i++) {
        for (let j = 0; j < nz; j++) {
          const l = new THREE.PointLight(m.night > 0.8 ? '#ffd9a8' : '#fff1de', m.fill * (2.2 + cw * cd * 0.12), Math.max(cw, cd) * 2, 1.2);
          l.position.set(r.x0 + cw * (i + 0.5), L.h - 0.35, r.z0 + cd * (j + 0.5));
          world.add(l);
          lights.push({ l, pri: 3 });
        }
      }
    }
    // Every point light costs on every pixel, so keep the brightest few; lamps
    // only matter when it's getting dark.
    lights.sort((a, b) => b.pri - a.pri);
    const budget = m.night > 0.8 ? 10 : m.night > 0.3 ? 8 : 6;
    lights.forEach(({ l }, i) => {
      if (l.userData.night) l.intensity = l.userData.night * m.night;
      else if (l.userData.base !== undefined) l.intensity = l.userData.base * (0.35 + m.night * 0.9);
      if (i >= budget || l.intensity <= 0.01) l.removeFromParent();
    });

    // Walking.
    // Yards keep you off their outer edges, but not where they meet the house or another yard.
    const walkYards = L.yards.filter((y) => y.walk);
    const touches = (v: number, axis: 'x' | 'z', self: Yard) => {
      const half = axis === 'x' ? L.w / 2 : L.d / 2;
      if (Math.abs(Math.abs(v) - half) < 0.01) return true;
      return walkYards.some((o) => o !== self && (axis === 'x' ? Math.abs(o.x0 - v) < 0.01 || Math.abs(o.x1 - v) < 0.01 : Math.abs(o.z0 - v) < 0.01 || Math.abs(o.z1 - v) < 0.01));
    };
    const areas: Area[] = [
      ...L.rooms,
      ...walkYards.map((y) => ({ ...y, pad: [touches(y.x0, 'x', y) ? 0 : 0.3, touches(y.z0, 'z', y) ? 0 : 0.3, touches(y.x1, 'x', y) ? 0 : 0.3, touches(y.z1, 'z', y) ? 0 : 0.3] as [number, number, number, number] })),
    ];
    nav = new NavGrid(areas, navWalls, blocks);
    wanderAreas = L.rooms;

    if (owner) {
      figure = new Figure(owner.kit, owner.appearance, owner.keeper, GK_KITS[0], owner.equipped, { base: false, detail: 'mid' });
      figure.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = true;
      });
      world.add(figure.root);
    }
    const sp = nav.nearest(L.spawn.x, L.spawn.z) ?? [0, 0];
    const [sx, sz] = nav.center(...sp);
    if (figure) {
      figure.root.position.set(sx, 0, sz);
      figure.root.rotation.y = L.spawn.r;
      figure.teleport(L.spawn.r);
    }
    nextWander = clockT + 6;

    // Frame the house: fit its footprint whatever the screen shape.
    const radius = 0.5 * Math.hypot(L.w, L.d) + 1.2;
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    fit = radius / Math.tan(Math.min(vfov, hfov) / 2);
    dist = distT = fit * 0.86;
    yaw = yawT = L.cam?.[0] ?? 0.62;
    elev = elevT = L.cam?.[1] ?? 0.74;
    target.set(sx * 0.3, 0.8, sz * 0.3);
    for (const w of walls) {
      w.s = cutFor(w) ? CUT_H / houseH : 1;
      applyCut(w);
    }
  }

  const camDir = new THREE.Vector2();
  function cutFor(w: WallObj) {
    camDir.set(Math.sin(yaw), Math.cos(yaw));
    const side = (w.mid.x - center.x) * camDir.x + (w.mid.y - center.y) * camDir.y;
    const facing = Math.abs(w.normal.dot(camDir));
    return side > 0.4 && facing > 0.15;
  }
  function applyCut(w: WallObj) {
    w.group.scale.y = w.s;
    const show = w.s > 0.55;
    for (const u of w.upper) u.visible = show;
  }

  let nextWander = 0;
  const rnd = rand(Date.now() & 0xffff);
  function wander() {
    if (!nav || !figure) return;
    if (rnd() < 0.6 && spots.length) {
      const s = spots[(rnd() * spots.length) | 0];
      walkTo(s.x, s.z, s.face, true);
    } else {
      const area = wanderAreas[(rnd() * wanderAreas.length) | 0];
      const p = area && nav.randomIn(area, rnd);
      if (p) walkTo(p[0], p[1], rnd() * PI * 2, true);
    }
  }

  const clock = new THREE.Timer();
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    clock.update();
    const dt = Math.min(0.05, clock.getDelta());
    clockT += dt;
    yaw += (yawT - yaw) * Math.min(1, dt * 6);
    elev += (elevT - elev) * Math.min(1, dt * 6);
    dist += (distT - dist) * Math.min(1, dt * 6);

    if (figure) {
      figure.animate(dt, figure.stepWalk(dt), clockT);
      if (figure.busyMoving) nextWander = Math.max(nextWander, clockT + 6);
      else if (clockT > nextWander) {
        // Pottering about: after a while on his own he goes to do something.
        if (clockT - lastUser > 20) wander();
        nextWander = clockT + 9 + rnd() * 10;
      }
    }
    const me = figure?.root.position;
    // The camera looks between the middle of the house and you, more at you when zoomed in.
    const zoomK = clamp((fit * 1.3 - dist) / (fit * 1.0), 0, 1);
    const follow = 0.3 + 0.6 * zoomK;
    const tx = center.x + ((me?.x ?? center.x) - center.x) * follow;
    const tz = center.y + ((me?.z ?? center.y) - center.y) * follow;
    target.x += (tx - target.x) * Math.min(1, dt * 3);
    target.z += (tz - target.z) * Math.min(1, dt * 3);
    target.y = 0.6 + 0.4 * zoomK;
    camera.position.set(target.x + Math.sin(yaw) * Math.cos(elev) * dist, target.y + Math.sin(elev) * dist, target.z + Math.cos(yaw) * Math.cos(elev) * dist);
    camera.lookAt(target);
    if (dome) dome.position.set(camera.position.x, 0, camera.position.z);

    for (const w of walls) {
      const want = cutFor(w) ? CUT_H / houseH : 1;
      if (Math.abs(want - w.s) > 0.001) {
        w.s += (want - w.s) * Math.min(1, dt * 7);
        applyCut(w);
      }
    }
    if (markerT > 0) {
      markerT = Math.max(0, markerT - dt * 0.9);
      (marker.material as THREE.MeshBasicMaterial).opacity = markerT * 0.9;
      marker.scale.setScalar(1 + (1 - markerT) * 0.6);
    }
    for (const w of water) {
      const mm = w.material as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
      if (w.userData.foam) (mm as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(clockT * 0.8) * 0.15;
      else if (mm.map) mm.map.offset.set(Math.sin(clockT * 0.25) * 0.03, clockT * 0.012);
    }
    renderer.render(scene, camera);
  };
  loop();

  let lastOwner: RoomData['owner'];
  return {
    room(d) {
      lastOwner = d.owner ?? lastOwner;
      mount(roomLayout(d), d.owner);
    },
    garage(d) {
      const owner = d.owner ?? lastOwner;
      mount(garageLayout(d, (id) => d.cars.find((c) => c.id === id)?.color ?? '#e8ecef'), owner);
    },
    view(y, e, z) {
      yaw = yawT = y;
      elev = elevT = e;
      dist = distT = fit * z;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      clear();
      renderer.domElement.removeEventListener('wheel', onWheel);
      renderer.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.domElement.remove();
    },
  };
}

