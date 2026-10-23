// The world outside the house: sky, light and weather by view, the ground
// around it and the neighbourhood (street, park, beach or the city below
// a tower). Near things stay low so the camera can orbit freely; anything
// tall stands far out, beyond the camera.
import * as THREE from 'three';
import type { Outdoor } from './plans.ts';
import { CAR_BY_ID } from '../../../shared/life.ts';
import { car } from './cars.ts';
import { at, box, canvasTex, mat, rand, worldUV } from './kit.ts';
import { subtract, type Rect } from './nav.ts';
import { palm, tree } from './props.ts';

export interface Mood {
  sky: [string, string, string];
  fog: string;
  sun: { color: string; intensity: number; dir: [number, number, number] };
  hemi: [string, string, number];
  env: number;
  exposure: number;
  /** 0 by day, 1 at night: how bright lamps and street lights glow. */
  night: number;
  /** Strength of the room fill lights. */
  fill: number;
}

export const MOODS: Record<Outdoor, Mood> = {
  street: { sky: ['#2c4a86', '#e9906a', '#ffd7a0'], fog: '#e8a882', sun: { color: '#ffc78f', intensity: 2.6, dir: [-0.55, 0.42, 0.6] }, hemi: ['#ffe1c2', '#3a2e2a', 0.65], env: 0.45, exposure: 1.0, night: 0.45, fill: 1.0 },
  park: { sky: ['#3d86d8', '#9fd0f5', '#e6f5ff'], fog: '#cfe7f7', sun: { color: '#fff1d8', intensity: 2.5, dir: [0.5, 0.62, 0.5] }, hemi: ['#e8f4ff', '#4a5a3a', 0.5], env: 0.42, exposure: 0.92, night: 0, fill: 0.55 },
  townhouse: { sky: ['#4b7fc7', '#b7d6ee', '#f6e9d2'], fog: '#dfe6e8', sun: { color: '#ffe6bd', intensity: 2.5, dir: [0.6, 0.58, 0.42] }, hemi: ['#f2f4ff', '#4a4038', 0.5], env: 0.42, exposure: 0.94, night: 0.1, fill: 0.65 },
  beach: { sky: ['#3a5fa5', '#f2a26e', '#ffd99a'], fog: '#f4c08e', sun: { color: '#ffbf80', intensity: 2.7, dir: [0.15, 0.3, 1.0] }, hemi: ['#ffe2c4', '#5a4030', 0.7], env: 0.5, exposure: 1.02, night: 0.55, fill: 1.0 },
  tower: { sky: ['#070b1f', '#1b1f4a', '#5a3d7a'], fog: '#1e1a3c', sun: { color: '#9fb4ff', intensity: 0.75, dir: [-0.4, 0.75, -0.35] }, hemi: ['#6a78b8', '#2a2030', 0.6], env: 0.26, exposure: 1.05, night: 1, fill: 1.25 },
};

/** A big gradient dome with a sun or moon, and stars at night. */
export function skyDome(m: Mood): THREE.Mesh {
  const [top, mid, horizon] = m.sky;
  const tex = canvasTex(64, 512, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 512);
    gr.addColorStop(0, top);
    gr.addColorStop(0.32, mid);
    gr.addColorStop(0.5, horizon);
    gr.addColorStop(0.56, m.fog);
    gr.addColorStop(1, m.fog);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 512);
    if (m.night > 0.8) {
      const r = rand(3);
      g.fillStyle = 'rgba(255,255,255,.8)';
      for (let i = 0; i < 90; i++) g.fillRect(r() * 64, r() * 220, 0.6, 0.6);
    }
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
  dome.renderOrder = -10;
  // The sun (or moon) as a soft disc on the dome.
  const [dx, dy, dz] = m.sun.dir;
  const len = Math.hypot(dx, dy, dz);
  const sunTex = canvasTex(128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.18, m.night > 0.8 ? 'rgba(230,236,255,1)' : 'rgba(255,240,200,1)');
    gr.addColorStop(0.3, m.night > 0.8 ? 'rgba(180,190,255,.25)' : 'rgba(255,200,140,.35)');
    gr.addColorStop(1, 'rgba(255,200,140,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
  });
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(m.night > 0.8 ? 18 : 40, m.night > 0.8 ? 18 : 40), new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, fog: false, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }));
  // Low suns sit just above the horizon; high ones would be overhead and unseen, so show those lower.
  const el = Math.min(Math.asin(dy / len), 0.35);
  const az = Math.atan2(dx, dz);
  sun.position.set(Math.sin(az) * Math.cos(el) * 170, Math.sin(el) * 170 + 4, Math.cos(az) * Math.cos(el) * 170);
  sun.lookAt(0, 0, 0);
  sun.renderOrder = -9;
  dome.add(sun);
  return dome;
}

// ---------- ground textures ----------

const groundCache = new Map<string, THREE.Texture>();
export function groundTex(kind: string): THREE.Texture {
  let t = groundCache.get(kind);
  if (t) return t;
  const r = rand(kind.length * 31);
  const paint: Record<string, (g: CanvasRenderingContext2D) => void> = {
    grass: (g) => {
      g.fillStyle = '#5b9a42';
      g.fillRect(0, 0, 512, 512);
      // Broad patches of lighter and darker lawn, wrapped so the tile repeats cleanly.
      for (let i = 0; i < 46; i++) {
        const x = r() * 512;
        const y = r() * 512;
        const rad = 30 + r() * 90;
        const c = r() < 0.5 ? '38,88,30' : '150,196,92';
        for (const [ox, oy] of [[0, 0], [-512, 0], [512, 0], [0, -512], [0, 512]]) {
          const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
          gr.addColorStop(0, `rgba(${c},${0.12 + r() * 0.12})`);
          gr.addColorStop(1, `rgba(${c},0)`);
          g.fillStyle = gr;
          g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
        }
      }
      // Blades.
      for (let i = 0; i < 9000; i++) {
        const k = r();
        g.fillStyle = k < 0.45 ? `rgba(34,78,26,${0.15 + r() * 0.3})` : k < 0.9 ? `rgba(150,205,100,${0.1 + r() * 0.22})` : `rgba(210,220,140,${r() * 0.25})`;
        g.save();
        g.translate(r() * 512, r() * 512);
        g.rotate((r() - 0.5) * 0.8);
        g.fillRect(0, 0, 1.4, 3 + r() * 5);
        g.restore();
      }
    },
    deck: (g) => {
      for (let i = 0; i < 8; i++) {
        const k = 0.88 + r() * 0.2;
        g.fillStyle = `rgb(${172 * k},${128 * k},${88 * k})`;
        g.fillRect(0, i * 32, 256, 32);
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.fillRect(0, i * 32, 256, 2);
        g.strokeStyle = 'rgba(0,0,0,.08)';
        for (let j = 0; j < 3; j++) {
          g.beginPath();
          const y = i * 32 + 6 + r() * 22;
          g.moveTo(0, y);
          g.bezierCurveTo(80, y + 3, 170, y - 3, 256, y);
          g.stroke();
        }
      }
    },
    paving: (g) => {
      g.fillStyle = '#c9c2b6';
      g.fillRect(0, 0, 256, 256);
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 2; i++) {
          const k = 0.92 + r() * 0.12;
          g.fillStyle = `rgb(${205 * k},${198 * k},${186 * k})`;
          g.fillRect(i * 128 + (j % 2) * 64 + 2, j * 64 + 2, 124, 60);
        }
      }
    },
    pavement: (g) => {
      g.fillStyle = '#a9aaa8';
      g.fillRect(0, 0, 256, 256);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const k = 0.93 + r() * 0.1;
        g.fillStyle = `rgb(${178 * k},${178 * k},${174 * k})`;
        g.fillRect(i * 64 + 1.5, j * 64 + 1.5, 61, 61);
      }
    },
    road: (g) => {
      g.fillStyle = '#3a3d42';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 3000; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.07})`;
        g.fillRect(r() * 256, r() * 256, 2, 2);
      }
    },
    sand: (g) => {
      g.fillStyle = '#e6cf9e';
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 3000; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? '255,245,220' : '160,130,80'},${r() * 0.2})`;
        g.fillRect(r() * 256, r() * 256, 1.5, 1.5);
      }
    },
    tile: (g) => {
      g.fillStyle = '#d9d6d0';
      g.fillRect(0, 0, 256, 256);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
        const k = 0.95 + r() * 0.06;
        g.fillStyle = `rgb(${236 * k},${233 * k},${228 * k})`;
        g.fillRect(i * 64 + 1, j * 64 + 1, 62, 62);
      }
    },
    stone: (g) => {
      g.fillStyle = '#6f6a64';
      g.fillRect(0, 0, 256, 256);
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const k = 0.9 + r() * 0.15;
        g.fillStyle = `rgb(${132 * k},${126 * k},${118 * k})`;
        g.fillRect(i * 128 + 1.5, j * 128 + 1.5, 125, 125);
        for (let n = 0; n < 200; n++) {
          g.fillStyle = `rgba(0,0,0,${r() * 0.08})`;
          g.fillRect(i * 128 + r() * 125, j * 128 + r() * 125, 3, 3);
        }
      }
    },
  };
  // Size in metres one texture tile covers.
  const metres: Record<string, number> = { grass: 5, deck: 2.4, paving: 1.6, pavement: 1.6, road: 4, sand: 3, tile: 1.2, stone: 1.2 };
  t = kind === 'grass' ? canvasTex(512, 512, paint.grass) : canvasTex(256, 256, paint[kind] ?? paint.paving);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.userData.shared = true;
  t.userData.metres = metres[kind] ?? 2;
  groundCache.set(kind, t);
  return t;
}

/** A slab of ground x0..x1 × z0..z1 with its top at y. */
export function slab(kind: string, x0: number, z0: number, x1: number, z1: number, y = 0, thick = 0.1, rough = 0.9) {
  const tex = groundTex(kind);
  const w = x1 - x0;
  const d = z1 - z0;
  const s = 1 / tex.userData.metres;
  const geo = worldUV(new THREE.BoxGeometry(w, thick, d), w * s, thick * s, d * s, x0 * s, z0 * s);
  const m = new THREE.Mesh(geo, groundMat(kind, rough));
  m.position.set((x0 + x1) / 2, y - thick / 2, (z0 + z1) / 2);
  m.receiveShadow = true;
  m.userData.floor = true;
  return m;
}

const gmCache = new Map<string, THREE.Material>();
function groundMat(kind: string, rough: number) {
  const key = `${kind}|${rough}`;
  let m = gmCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ map: groundTex(kind), roughness: rough });
    m.userData.shared = true;
    gmCache.set(key, m);
  }
  return m;
}

// ---------- buildings in the distance ----------

const facadeCache = new Map<string, THREE.Texture>();
function facadeTex(night: boolean, tone: string) {
  const key = `${night}|${tone}`;
  let t = facadeCache.get(key);
  if (t) return t;
  const r = rand(night ? 11 : 5);
  t = canvasTex(128, 256, (g) => {
    g.fillStyle = tone;
    g.fillRect(0, 0, 128, 256);
    for (let y = 8; y < 256; y += 24) {
      for (let x = 8; x < 120; x += 20) {
        const lit = r() < (night ? 0.42 : 0.12);
        g.fillStyle = lit ? (r() < 0.8 ? '#ffd88c' : '#bfe4ff') : night ? 'rgba(10,14,30,.9)' : 'rgba(40,60,90,.55)';
        g.fillRect(x, y, 12, 14);
      }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.userData.shared = true;
  facadeCache.set(key, t);
  return t;
}

const bMats = new Map<string, THREE.Material[]>();
function building(w: number, h: number, d: number, tone: string, night: boolean) {
  const tex = facadeTex(night, tone);
  const geo = worldUV(new THREE.BoxGeometry(w, h, d), w / 6, h / 12, d / 6);
  const key = `${night}|${tone}`;
  let mats = bMats.get(key);
  if (!mats) {
    const side = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, emissive: night ? '#ffffff' : '#000000', emissiveMap: night ? tex : null, emissiveIntensity: night ? 0.4 : 0 });
    const top = new THREE.MeshStandardMaterial({ color: tone, roughness: 0.9 });
    side.userData.shared = top.userData.shared = true;
    mats = [side, side, top, top, side, side];
    bMats.set(key, mats);
  }
  const mesh = new THREE.Mesh(geo, mats);
  return mesh;
}

/** A ring of buildings far out, between radius r0 and r1. */
function skyline(g: THREE.Group, seed: number, r0: number, r1: number, hMin: number, hMax: number, base: number, night: boolean, skip?: (a: number) => boolean) {
  const r = rand(seed);
  const tones = night ? ['#1d2036', '#25284a', '#171a2c'] : ['#8b8fa0', '#a7a2a0', '#76808f', '#b8b0a6'];
  for (let a = 0; a < Math.PI * 2; a += 0.11 + r() * 0.08) {
    if (skip?.(a)) continue;
    const rad = r0 + r() * (r1 - r0);
    const w = 6 + r() * 10;
    const d = 6 + r() * 10;
    const h = hMin + Math.pow(r(), 1.6) * (hMax - hMin);
    const b = building(w, h, d, tones[(r() * tones.length) | 0], night);
    b.position.set(Math.sin(a) * rad, base + h / 2, Math.cos(a) * rad);
    b.rotation.y = a + (r() - 0.5) * 0.3;
    g.add(b);
  }
}

const PARKED = ['car-hatch', 'car-suv', 'car-coupe', 'car-classic'];
function parkedCar(color: string, i: number) {
  return car(CAR_BY_ID[PARKED[i % PARKED.length]], color);
}

export interface OutdoorOpts {
  outdoor: Outdoor;
  w: number;
  d: number;
  mood: Mood;
  /** Holes in the ground (a pool). */
  holes?: Rect[];
}

/** Ground, roads, far-off scenery and any water. Returns the group plus things to animate. */
export function buildOutdoor(o: OutdoorOpts): { group: THREE.Group; water: THREE.Mesh[] } {
  const g = new THREE.Group();
  const water: THREE.Mesh[] = [];
  const hw = o.w / 2;
  const hd = o.d / 2;
  const r = rand(o.outdoor.length * 97);
  /** Ground slabs, leaving any holes open. */
  const ground = (kind: string, x0: number, z0: number, x1: number, z1: number, y: number, thick: number) => {
    for (const p of subtract({ x0, z0, x1, z1 }, o.holes ?? [])) g.add(slab(kind, p.x0, p.z0, p.x1, p.z1, y, thick));
  };

  if (o.outdoor === 'street' || o.outdoor === 'townhouse') {
    const front = hd + (o.outdoor === 'street' ? 1.9 : 2.2);
    // Grass all around, a pavement in front, a road, the far pavement and a green verge.
    g.add(slab('grass', -90, -90, 90, 90, -0.12, 0.1));
    g.add(slab('road', -90, front + 0.15, 90, front + 7.5, -0.1, 0.1, 0.75));
    const kerb = mat('#c9c7c2', { rough: 0.7 });
    g.add(at(box(180, 0.14, 0.15, kerb, 0), 0, -0.05, front + 0.07));
    g.add(at(box(180, 0.14, 0.15, kerb, 0), 0, -0.05, front + 7.57));
    g.add(slab('pavement', -90, front + 7.65, 90, front + 10, -0.02));
    const line = mat('#f2f0e6', { rough: 0.6 });
    for (let x = -60; x < 60; x += 4) g.add(at(box(2, 0.01, 0.14, line, 0), x, -0.095, front + 3.85));
    // Parked cars across the street, trees along the far pavement.
    const cols = ['#e8ecef', '#2f6bff', '#8a8f96', '#16181b', '#ff3d5a'];
    for (let i = 0; i < 4; i++) {
      const c = parkedCar(cols[i % cols.length], i);
      c.position.set(-13 + i * 8.5 + r() * 2, -0.1, front + 6.4);
      c.rotation.y = Math.PI / 2;
      g.add(c);
    }
    for (let x = -24; x <= 24; x += 8) {
      const t = tree(Math.round(x * 3), 1.1);
      t.position.set(x + 2, -0.02, front + 9.0);
      g.add(t);
    }
    // Neighbouring houses at a distance either side and behind, low enough to see over.
    const tones = o.outdoor === 'townhouse' ? ['#a4573f', '#b46a4c', '#8e4d3a', '#c9b49a'] : ['#9c5a43', '#b5a08a', '#c9b49a', '#7f6a5a'];
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const bw = 8 + r() * 3;
        const h = 6 + r() * 4;
        const b = building(bw, h, 9, tones[(k + (side > 0 ? 1 : 0)) % tones.length], false);
        b.position.set(side * (hw + 8 + k * 11 + bw / 2), -0.1 + h / 2, -1);
        g.add(b);
      }
    }
    skyline(g, 41, 70, 110, 12, 40, -0.1, false);
  } else if (o.outdoor === 'park') {
    g.add(slab('grass', -90, -90, 90, 90, -0.12, 0.1));
    // A footpath through the park and a pond.
    const path = new THREE.Mesh(new THREE.RingGeometry(16, 18, 64, 1, -0.4, 2.2), new THREE.MeshStandardMaterial({ color: '#cbb894', roughness: 1 }));
    path.rotation.x = -Math.PI / 2;
    path.position.set(-4, -0.115, 8);
    path.receiveShadow = true;
    g.add(path);
    const pond = new THREE.Mesh(new THREE.CircleGeometry(4.5, 40), new THREE.MeshStandardMaterial({ color: '#4f8fb0', roughness: 0.08, metalness: 0.1, envMapIntensity: 1.6 }));
    pond.rotation.x = -Math.PI / 2;
    pond.scale.set(1.5, 1, 1);
    pond.position.set(-12, -0.11, 17);
    g.add(pond);
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2;
      const rad = 13 + r() * 40;
      const x = Math.sin(a) * rad;
      const z = Math.cos(a) * rad;
      if (Math.abs(x) < hw + 3 && z > -hd - 3 && z < hd + 7) continue;
      const t = tree(i, 1 + r() * 0.5);
      t.position.set(x, -0.1, z);
      g.add(t);
    }
    skyline(g, 7, 85, 120, 14, 50, -0.1, false);
  } else if (o.outdoor === 'beach') {
    // Garden behind the villa, the beach and the sea in front.
    ground('grass', -90, -90, 90, hd + 5.6, -0.12, 0.1);
    g.add(slab('sand', -90, hd + 5.6, 90, hd + 17, -0.9, 0.3));
    // A retaining wall from the deck down to the sand.
    g.add(at(box(o.w + 0.4, 0.95, 0.4, mat('#f4efe6', { rough: 0.6 }), 0.02), 0, -0.46, hd + 5.75));
    for (const x of [-1, 1]) g.add(at(box(80, 0.9, 0.4, mat('#d9c9a8', { rough: 0.8 }), 0), x * (o.w / 2 + 40.2), -0.5, hd + 5.75));
    // Steps down to the beach.
    for (let i = 0; i < 4; i++) g.add(at(box(1.6, 0.22, 0.32, mat('#f4efe6', { rough: 0.6 }), 0.01), hw - 1.4, -0.12 - i * 0.22, hd + 6.1 + i * 0.32));
    const seaTex = canvasTex(256, 256, (c) => {
      c.fillStyle = '#2a6f9e';
      c.fillRect(0, 0, 256, 256);
      const rr = rand(4);
      c.strokeStyle = 'rgba(255,240,210,.35)';
      for (let i = 0; i < 160; i++) {
        c.lineWidth = 0.5 + rr() * 1.5;
        const x = rr() * 256;
        const y = rr() * 256;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x + 6 + rr() * 16, y); c.stroke();
      }
    }, [30, 30]);
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: seaTex, color: '#7fb4d6', roughness: 0.12, metalness: 0.2, envMapIntensity: 1.4 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(0, -1.05, hd + 205);
    sea.userData.water = true;
    g.add(sea);
    water.push(sea);
    // Foam where the waves reach the sand.
    const foam = new THREE.Mesh(new THREE.PlaneGeometry(180, 1.2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false }));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(0, -1.03, hd + 17.2);
    foam.userData.foam = true;
    g.add(foam);
    water.push(foam);
    for (let i = 0; i < 14; i++) {
      const p = palm(i + 10, 0.9 + r() * 0.4);
      const x = (r() - 0.5) * 120;
      const z = -18 - r() * 40;
      p.position.set(x, -0.1, z);
      p.rotation.y = r() * 6;
      g.add(p);
    }
    for (let i = 0; i < 18; i++) {
      const a = (r() - 0.5) * 2.4 + Math.PI;
      const t = tree(i + 40, 1.2 + r() * 0.5);
      t.position.set(Math.sin(a) * (24 + r() * 30), -0.1, Math.cos(a) * (24 + r() * 30));
      g.add(t);
    }
    // Headlands in the distance either side of the bay.
    const hill = mat('#5a7a4a', { rough: 1 });
    for (const [x, z, s] of [[-110, 40, 28], [120, 30, 34], [-150, -40, 40], [160, -60, 46]] as const) {
      const h = new THREE.Mesh(new THREE.SphereGeometry(s, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hill);
      h.scale.y = 0.45;
      h.position.set(x, -1.1, z);
      g.add(h);
    }
  } else {
    // A tower top: the penthouse floor is the roof of a skyscraper.
    const towerH = 160;
    const tower = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.8, towerH, o.d + 5.4 + 0.8), new THREE.MeshStandardMaterial({ map: facadeTex(true, '#1b1e30'), emissive: '#ffffff', emissiveMap: facadeTex(true, '#1b1e30'), emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.4 }));
    worldUV(tower.geometry, o.w / 6, towerH / 12, (o.d + 6) / 6);
    tower.position.set(0, -towerH / 2 - 0.4, 2.4);
    g.add(tower);
    g.add(at(box(o.w + 1.0, 0.3, o.d + 5.4 + 1.0, mat('#2a2d36', { rough: 0.5, metal: 0.3 }), 0.02), 0, -0.28, 2.4));
    // Other towers around, mostly below us, a few taller, lit for the night.
    const rr = rand(77);
    for (let i = 0; i < 70; i++) {
      const a = rr() * Math.PI * 2;
      const rad = 26 + rr() * 110;
      const w = 10 + rr() * 16;
      // Near ones well below the terrace, a few far ones reaching above it.
      const h = rad > 105 && rr() < 0.18 ? towerH + rr() * 30 : towerH * (0.35 + rr() * 0.45);
      const b = building(w, h, w * (0.7 + rr() * 0.6), ['#1d2036', '#25284a', '#171a2c'][i % 3], true);
      b.position.set(Math.sin(a) * rad, -towerH + h / 2, Math.cos(a) * rad);
      b.rotation.y = rr() * Math.PI;
      g.add(b);
      // Red aircraft lights on the tall ones.
      if (h > 150) g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshBasicMaterial({ color: '#ff3d3d', toneMapped: false })), b.position.x, -towerH + h + 0.6, b.position.z));
    }
    // City glow on the ground far below.
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshBasicMaterial({ color: '#3a2a4a' }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -towerH;
    g.add(glow);
  }
  return { group: g, water };
}
