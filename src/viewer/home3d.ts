// Your place: a cut-away toy diorama of your home (furniture, trophies,
// framed shirts, the view out of the window) and a garage with your cars.
// Everything is built from primitives and painted canvas textures.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Appearance } from '../../shared/appearance.ts';
import type { Equipped } from '../../shared/cosmetics.ts';
import { CAR_BY_ID, FLOOR_STYLES, FURNITURE_BY_ID, HOUSE_BY_ID, WALL_COLORS, type CarModel, type Furniture, type Home } from '../../shared/life.ts';
import { Figure, GK_KITS, type Kit } from './figures.ts';

export interface RoomData {
  home: Home;
  trophies: { kind: string; season: number }[];
  collectibles: { kind: string; label: string; data: { primary?: string; secondary?: string; number?: number; club?: string } }[];
  owner?: { appearance: Appearance; equipped: Equipped; kit: Kit; keeper: boolean };
}

export interface GarageData {
  cars: { id: string; color: string }[];
  capacity: number;
  fav: string | null;
}

export interface HomeScene {
  room(d: RoomData): void;
  garage(d: GarageData): void;
  dispose(): void;
}

const WALL_H = 3.2;

// ---------- painted textures ----------

function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

function rand(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function floorTexture(style: string, w: number, d: number) {
  const r = rand(style.length * 97);
  if (style === 'oak' || style === 'walnut') {
    const base = style === 'oak' ? [196, 150, 98] : [104, 66, 40];
    return canvasTex(512, 512, (g) => {
      const rows = 8;
      for (let i = 0; i < rows; i++) {
        let x = -r() * 200;
        while (x < 512) {
          const len = 160 + r() * 200;
          const k = 0.85 + r() * 0.3;
          g.fillStyle = `rgb(${base[0] * k},${base[1] * k},${base[2] * k})`;
          g.fillRect(x, i * 64, len, 64);
          g.strokeStyle = 'rgba(0,0,0,.10)';
          for (let j = 0; j < 6; j++) {
            g.beginPath();
            const y = i * 64 + 8 + r() * 48;
            g.moveTo(x, y);
            g.bezierCurveTo(x + len / 3, y + r() * 6 - 3, x + (2 * len) / 3, y + r() * 6 - 3, x + len, y);
            g.stroke();
          }
          g.fillStyle = 'rgba(0,0,0,.35)';
          g.fillRect(x, i * 64, 2, 64);
          x += len;
        }
        g.fillStyle = 'rgba(0,0,0,.3)';
        g.fillRect(0, i * 64, 512, 2);
      }
    }, [w / 3, d / 3]);
  }
  if (style === 'marble') {
    return canvasTex(512, 512, (g) => {
      g.fillStyle = '#ece8e1';
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 26; i++) {
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
    }, [w / 2.5, d / 2.5]);
  }
  return canvasTex(512, 512, (g) => {
    g.fillStyle = '#8d9093';
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.06})`;
      g.fillRect(r() * 512, r() * 512, 2 + r() * 4, 2 + r() * 4);
    }
    g.strokeStyle = 'rgba(0,0,0,.18)';
    g.lineWidth = 2;
    g.strokeRect(1, 1, 510, 510);
  }, [w / 3, d / 3]);
}

/** The view out of the window, by house tier. */
function viewTexture(view: string) {
  const r = rand(view.length * 131 + 7);
  return canvasTex(1024, 512, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 512);
    if (view === 'sea') {
      sky.addColorStop(0, '#3c6fb4'); sky.addColorStop(0.55, '#f6b37a'); sky.addColorStop(0.62, '#ffd59a');
    } else if (view === 'skyline') {
      sky.addColorStop(0, '#0b1230'); sky.addColorStop(0.7, '#3b2a6b'); sky.addColorStop(1, '#ff7a6b');
    } else if (view === 'park') {
      sky.addColorStop(0, '#6fb7ff'); sky.addColorStop(1, '#d9f1ff');
    } else {
      sky.addColorStop(0, '#26407a'); sky.addColorStop(0.8, '#f08a5d'); sky.addColorStop(1, '#ffc27a');
    }
    g.fillStyle = sky;
    g.fillRect(0, 0, 1024, 512);
    if (view === 'sea') {
      g.fillStyle = '#ffe7a8';
      g.beginPath(); g.arc(640, 300, 46, 0, Math.PI * 2); g.fill();
      const sea = g.createLinearGradient(0, 310, 0, 512);
      sea.addColorStop(0, '#2b6c9e'); sea.addColorStop(1, '#0d3554');
      g.fillStyle = sea;
      g.fillRect(0, 310, 1024, 202);
      g.fillStyle = 'rgba(255,220,150,.6)';
      for (let i = 0; i < 40; i++) g.fillRect(600 + r() * 90 - 20, 318 + i * 4.5, 20 + r() * 60, 2);
      g.fillStyle = '#e9d29c';
      g.beginPath(); g.moveTo(0, 470); g.quadraticCurveTo(400, 430, 1024, 500); g.lineTo(1024, 512); g.lineTo(0, 512); g.fill();
    } else if (view === 'park') {
      g.fillStyle = '#7fc35a';
      g.fillRect(0, 330, 1024, 182);
      for (let i = 0; i < 30; i++) {
        const x = r() * 1024;
        const y = 300 + r() * 120;
        const s = 26 + r() * 40;
        g.fillStyle = '#5a3b22';
        g.fillRect(x - 3, y, 6, s * 0.8);
        g.fillStyle = ['#3f8f3a', '#4fa24a', '#2f7a35'][i % 3];
        g.beginPath(); g.arc(x, y, s * 0.6, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#c9b48a';
      g.beginPath(); g.moveTo(0, 470); g.bezierCurveTo(300, 400, 600, 520, 1024, 430); g.lineTo(1024, 450); g.bezierCurveTo(600, 540, 300, 420, 0, 490); g.fill();
    } else {
      const night = view === 'skyline';
      for (let layer = 0; layer < 3; layer++) {
        let x = -20;
        const shade = night ? ['#1d1f3d', '#15162d', '#0c0d1c'][layer] : ['#6b5b7c', '#4c4361', '#2f2a40'][layer];
        while (x < 1024) {
          const bw = 40 + r() * 70;
          const bh = (night ? 200 : 120) + r() * (night ? 260 : 160) - layer * 30;
          g.fillStyle = shade;
          g.fillRect(x, 512 - bh, bw, bh);
          for (let wy = 512 - bh + 10; wy < 500; wy += 14) {
            for (let wx = x + 6; wx < x + bw - 8; wx += 12) {
              if (r() < (night ? 0.45 : 0.18)) {
                g.fillStyle = r() < 0.8 ? 'rgba(255,214,140,.9)' : 'rgba(160,220,255,.9)';
                g.fillRect(wx, wy, 6, 8);
              }
            }
          }
          x += bw + 4;
        }
      }
      if (night) {
        g.fillStyle = 'rgba(255,255,255,.85)';
        for (let i = 0; i < 80; i++) g.fillRect(r() * 1024, r() * 200, 1.5, 1.5);
      }
    }
  });
}

function shirtTexture(primary: string, secondary: string, number: number, club: string) {
  return canvasTex(256, 300, (g) => {
    g.fillStyle = '#f2efe9';
    g.fillRect(0, 0, 256, 300);
    g.fillStyle = primary;
    g.beginPath();
    g.moveTo(78, 40); g.lineTo(108, 30); g.quadraticCurveTo(128, 50, 148, 30); g.lineTo(178, 40);
    g.lineTo(226, 84); g.lineTo(200, 116); g.lineTo(184, 102); g.lineTo(184, 262); g.lineTo(72, 262); g.lineTo(72, 102);
    g.lineTo(56, 116); g.lineTo(30, 84); g.closePath(); g.fill();
    g.strokeStyle = secondary;
    g.lineWidth = 6;
    g.stroke();
    g.fillStyle = secondary;
    g.font = '800 92px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(String(number), 128, 200);
    g.fillStyle = '#2a2f35';
    g.font = '700 18px system-ui, sans-serif';
    g.fillText(club, 128, 288);
  });
}

// ---------- materials ----------

const matCache = new Map<string, THREE.Material>();
function mat(color: string, opts: { rough?: number; metal?: number; emissive?: string; glass?: boolean; clear?: boolean } = {}) {
  const key = `${color}|${opts.rough}|${opts.metal}|${opts.emissive}|${opts.glass}|${opts.clear}`;
  let m = matCache.get(key);
  if (!m) {
    m = opts.glass
      ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, transmission: 0.9, thickness: 0.2, transparent: true, opacity: 0.35 })
      : new THREE.MeshPhysicalMaterial({
          color,
          roughness: opts.rough ?? 0.55,
          metalness: opts.metal ?? 0,
          clearcoat: opts.clear ? 1 : 0,
          clearcoatRoughness: 0.12,
          emissive: opts.emissive ?? '#000000',
          emissiveIntensity: opts.emissive ? 1.6 : 0,
        });
    matCache.set(key, m);
  }
  return m;
}

function box(w: number, h: number, d: number, m: THREE.Material, r = 0.04) {
  const mesh = new THREE.Mesh(r > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d), m);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T {
  o.position.set(x, y, z);
  o.rotation.y = ry;
  return o;
}

function cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = 24) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function sphere(r: number, m: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), m);
  mesh.castShadow = true;
  return mesh;
}

// ---------- furniture ----------

function sofa(f: Furniture): THREE.Group {
  const g = new THREE.Group();
  const fabric = mat(f.c1, { rough: f.style === 'chester' ? 0.4 : 0.9, clear: f.style === 'chester' });
  const dark = mat(f.c2 ?? '#333', { rough: 0.6 });
  const seat = (w: number) => {
    const s = new THREE.Group();
    s.add(at(box(w, 0.42, 0.95, fabric, 0.08), 0, 0.36, 0));
    s.add(at(box(w, 0.7, 0.26, fabric, 0.1), 0, 0.72, -0.36));
    for (let i = 0; i < Math.round(w / 0.8); i++) {
      const cw = w / Math.round(w / 0.8);
      s.add(at(box(cw - 0.06, 0.14, 0.7, fabric, 0.06), -w / 2 + cw * (i + 0.5), 0.63, 0.06));
    }
    for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) s.add(at(cyl(0.03, 0.025, 0.15, dark, 8), x, 0.07, 0.35), at(cyl(0.03, 0.025, 0.15, dark, 8), x, 0.07, -0.35));
    return s;
  };
  if (f.style === 'corner') {
    g.add(seat(2.4));
    const side = seat(1.4);
    g.add(at(side, 1.68, 0, 0.68, -Math.PI / 2));
    g.add(at(box(0.26, 0.62, 0.95, fabric, 0.1), -1.3, 0.48, 0));
  } else {
    g.add(seat(2.1));
    for (const x of [-1.15, 1.15]) g.add(at(box(0.26, f.style === 'chester' ? 0.72 : 0.6, 0.95, fabric, 0.12), x, 0.46, 0));
    if (f.style === 'chester') {
      const btn = mat(f.c2 ?? '#222', { rough: 0.3 });
      for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) g.add(at(sphere(0.025, btn), -0.9 + i * 0.3, 0.6 + j * 0.2, -0.22));
    }
  }
  // Throw cushion in a contrast colour.
  const c = at(box(0.42, 0.38, 0.14, mat(f.c2 ?? '#c6ff3d', { rough: 0.9 }), 0.07), -0.6, 0.84, -0.18);
  c.rotation.z = 0.15;
  c.rotation.x = -0.25;
  g.add(c);
  return g;
}

function screenTex(kind: string) {
  return canvasTex(512, 288, (g) => {
    const gr = g.createLinearGradient(0, 0, 512, 288);
    gr.addColorStop(0, kind === 'cinema' ? '#0b3f2a' : '#1b6b2f');
    gr.addColorStop(1, '#2e9b44');
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 288);
    g.strokeStyle = 'rgba(255,255,255,.7)';
    g.lineWidth = 3;
    g.strokeRect(30, 30, 452, 228);
    g.beginPath(); g.moveTo(256, 30); g.lineTo(256, 258); g.stroke();
    g.beginPath(); g.arc(256, 144, 40, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.fillRect(20, 14, 150, 30);
    g.fillStyle = '#c6ff3d';
    g.font = '700 18px system-ui, sans-serif';
    g.fillText('LIVE  2 – 1', 34, 36);
    for (let i = 0; i < 10; i++) {
      g.fillStyle = i < 5 ? '#ff3d5a' : '#f2f2f2';
      g.beginPath(); g.arc(80 + (i % 5) * 90 + (i < 5 ? 0 : 40), i < 5 ? 110 : 190, 6, 0, Math.PI * 2); g.fill();
    }
  });
}

function tv(f: Furniture): THREE.Group {
  const g = new THREE.Group();
  const dark = mat(f.c1, { rough: 0.35, clear: true });
  const big = f.style === 'cinema';
  const w = big ? 2.6 : f.style === 'gaming' ? 1.7 : 1.5;
  g.add(at(box(big ? 3 : 2, 0.45, 0.5, mat(big ? '#2a2c30' : '#3a3f45', { rough: 0.5 }), 0.04), 0, 0.23, 0));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.08, (w - 0.08) * 0.5625), new THREE.MeshBasicMaterial({ map: screenTex(f.style) }));
  g.add(at(box(w, w * 0.5625 + 0.06, 0.06, dark, 0.02), 0, 0.45 + 0.25 + w * 0.28, -0.1));
  g.add(at(scr, 0, 0.45 + 0.25 + w * 0.28, -0.065));
  if (f.style === 'gaming') {
    g.add(at(box(0.32, 0.08, 0.24, mat('#f2f2f2', { rough: 0.3 })), 0.6, 0.5, 0.05));
    const strip = at(box(2, 0.03, 0.03, mat(f.c2!, { emissive: f.c2 }), 0), 0, 0.02, 0.24);
    g.add(strip);
    const pad = at(box(0.2, 0.05, 0.12, mat('#16181b')), -0.5, 0.48, 0.12, 0.3);
    g.add(pad);
  }
  if (big) {
    for (const x of [-1.75, 1.75]) {
      g.add(at(box(0.36, 1.2, 0.36, mat('#1a1b1e', { rough: 0.6 })), x, 0.6, 0));
      g.add(at(cyl(0.11, 0.11, 0.02, mat('#3a3d42'), 16), x, 0.85, 0.185).rotateX(Math.PI / 2));
      g.add(at(cyl(0.07, 0.07, 0.02, mat('#3a3d42'), 16), x, 0.45, 0.185).rotateX(Math.PI / 2));
    }
    const glow = new THREE.PointLight(f.c2 ?? '#3dd6ff', 1.2, 4);
    glow.position.set(0, 1.3, 0.6);
    g.add(glow);
  }
  return g;
}

function rug(f: Furniture, w: number): THREE.Mesh {
  if (f.style === 'round') {
    const t = canvasTex(256, 256, (g) => {
      g.fillStyle = f.c1; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
      g.strokeStyle = f.c2!; g.lineWidth = 8;
      for (const r of [100, 70]) { g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke(); }
    });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.02, 48), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
    m.receiveShadow = true;
    return m;
  }
  const rw = Math.min(3.2, w * 0.4);
  const rd = rw * 0.66;
  const t = canvasTex(512, 340, (g) => {
    if (f.style === 'pitch') {
      for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? '#2f8a34' : '#38a03e'; g.fillRect(i * 51.2, 0, 51.2, 340); }
      g.strokeStyle = '#fff'; g.lineWidth = 5;
      g.strokeRect(14, 14, 484, 312);
      g.beginPath(); g.moveTo(256, 14); g.lineTo(256, 326); g.stroke();
      g.beginPath(); g.arc(256, 170, 46, 0, Math.PI * 2); g.stroke();
      g.strokeRect(14, 100, 70, 140); g.strokeRect(428, 100, 70, 140);
    } else {
      g.fillStyle = f.c1; g.fillRect(0, 0, 512, 340);
      g.strokeStyle = f.c2!; g.lineWidth = 10; g.strokeRect(16, 16, 480, 308);
      g.lineWidth = 3; g.strokeRect(34, 34, 444, 272);
      g.fillStyle = f.c2!;
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
        const x = 90 + i * 83, y = 90 + j * 80;
        g.beginPath(); g.moveTo(x, y - 22); g.lineTo(x + 22, y); g.lineTo(x, y + 22); g.lineTo(x - 22, y); g.closePath(); g.fill();
        g.fillStyle = '#1b3b5a'; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); g.fillStyle = f.c2!;
      }
    }
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.02, rd), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
  m.receiveShadow = true;
  return m;
}

function plant(f: Furniture): THREE.Group {
  const g = new THREE.Group();
  g.add(at(cyl(0.26, 0.2, 0.5, mat('#e9e4da', { rough: 0.4, clear: true })), 0, 0.25, 0));
  g.add(at(cyl(0.24, 0.24, 0.02, mat('#3a2a1a')), 0, 0.5, 0));
  const leaf = mat(f.c1, { rough: 0.7 });
  if (f.style === 'fern') {
    for (let i = 0; i < 12; i++) {
      const l = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.8, 6), leaf);
      l.castShadow = true;
      const a = (i / 12) * Math.PI * 2;
      l.position.set(Math.cos(a) * 0.18, 0.78, Math.sin(a) * 0.18);
      l.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8);
      g.add(l);
    }
  } else if (f.style === 'palm') {
    g.add(at(cyl(0.05, 0.07, 1.4, mat('#8a6a44')), 0, 1.2, 0));
    for (let i = 0; i < 7; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 6, 0, Math.PI * 2, 0, 0.6), leaf);
      l.scale.set(0.35, 1, 1.4);
      l.position.set(0, 1.85, 0);
      l.rotation.set(0.9, (i / 7) * Math.PI * 2, 0, 'YXZ');
      l.castShadow = true;
      g.add(l);
    }
  } else {
    const trunk = mat('#6b5236');
    g.add(at(cyl(0.05, 0.08, 1.2, trunk), 0, 1.05, 0));
    for (let i = 0; i < 6; i++) {
      const b = sphere(0.3 + (i % 3) * 0.06, leaf);
      b.position.set(Math.cos(i * 1.1) * 0.3, 1.6 + (i % 2) * 0.25, Math.sin(i * 1.1) * 0.3);
      g.add(b);
    }
  }
  return g;
}

function lamp(f: Furniture): THREE.Group {
  const g = new THREE.Group();
  const light = new THREE.PointLight(f.style === 'neon' ? f.c1 : '#ffd9a0', f.style === 'neon' ? 2.5 : 3, 5, 1.6);
  if (f.style === 'arc') {
    g.add(at(cyl(0.22, 0.24, 0.06, mat('#f2f2f2', { rough: 0.2, clear: true })), 0, 0.03, 0));
    const arc = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.025, 8, 32, Math.PI * 0.75), mat('#c9ccd1', { metal: 0.9, rough: 0.25 }));
    arc.position.set(0.9, 0.06, 0);
    arc.rotation.z = Math.PI * 0.25;
    g.add(at(cyl(0.025, 0.025, 1.3, mat('#c9ccd1', { metal: 0.9, rough: 0.25 })), 0, 0.7, 0));
    arc.position.set(0.64, 1.3, 0);
    arc.rotation.z = 0;
    g.add(arc);
    const shade = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(f.c1, { rough: 0.4, emissive: '#ffd9a0' }));
    (shade.material as THREE.MeshPhysicalMaterial).side = THREE.DoubleSide;
    g.add(at(shade, 1.54, 1.3, 0));
    light.position.set(1.54, 1.1, 0);
  } else if (f.style === 'neon') {
    g.add(at(box(0.3, 0.05, 0.3, mat('#16181b')), 0, 0.025, 0));
    g.add(at(cyl(0.04, 0.04, 1.8, mat(f.c1, { emissive: f.c1 }), 12), 0, 0.95, 0));
    light.position.set(0, 1, 0.3);
  } else {
    g.add(at(cyl(0.18, 0.22, 0.05, mat('#16181b')), 0, 0.03, 0));
    g.add(at(cyl(0.02, 0.02, 1.1, mat(f.c1, { metal: 1, rough: 0.2 })), 0, 0.6, 0));
    g.add(at(sphere(0.3, mat('#fff4d6', { emissive: '#ffdca0' })), 0, 1.4, 0));
    g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.02, 8, 32), mat(f.c1, { metal: 1, rough: 0.2 })), 0, 1.4, 0).rotateX(Math.PI / 2));
    light.position.set(0, 1.4, 0);
  }
  g.add(light);
  return g;
}

function art(f: Furniture): THREE.Group {
  const g = new THREE.Group();
  if (f.style === 'neonsign') {
    const t = canvasTex(512, 200, (c) => {
      c.shadowColor = f.c1; c.shadowBlur = 24;
      c.strokeStyle = f.c1; c.lineWidth = 8; c.lineJoin = 'round';
      c.font = 'italic 900 140px system-ui, sans-serif'; c.textAlign = 'center';
      c.strokeText('GOAL!', 256, 150);
      c.fillStyle = '#f6ffe0'; c.font = 'italic 900 140px system-ui, sans-serif'; c.lineWidth = 2;
      c.strokeStyle = '#f6ffe0'; c.strokeText('GOAL!', 256, 150);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.75), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false }));
    g.add(m);
    const l = new THREE.PointLight(f.c1, 1.6, 3);
    l.position.set(0, 0, 0.5);
    g.add(l);
    return g;
  }
  const t = canvasTex(320, 420, (c) => {
    if (f.style === 'poster') {
      c.fillStyle = f.c2!; c.fillRect(0, 0, 320, 420);
      c.fillStyle = f.c1; c.font = '900 64px system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText('NEVER', 160, 110); c.fillText('STOP', 160, 175);
      c.beginPath(); c.arc(160, 290, 70, 0, Math.PI * 2); c.fillStyle = '#f2f2f2'; c.fill();
      c.fillStyle = '#16181b';
      for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 - Math.PI / 2; c.beginPath(); c.arc(160 + Math.cos(a) * 42, 290 + Math.sin(a) * 42, 16, 0, Math.PI * 2); c.fill(); }
      c.beginPath(); c.arc(160, 290, 18, 0, Math.PI * 2); c.fill();
    } else {
      c.fillStyle = '#f4efe6'; c.fillRect(0, 0, 320, 420);
      const cols = [f.c1, f.c2!, '#ffcf3d', '#16181b', '#e9e4da'];
      const r = rand(42);
      for (let i = 0; i < 9; i++) {
        c.fillStyle = cols[i % cols.length];
        c.globalAlpha = 0.85;
        if (i % 2) { c.beginPath(); c.arc(r() * 320, r() * 420, 30 + r() * 70, 0, Math.PI * 2); c.fill(); }
        else c.fillRect(r() * 260, r() * 360, 40 + r() * 120, 20 + r() * 90);
      }
      c.globalAlpha = 1;
    }
  });
  g.add(box(1.04, 1.36, 0.06, mat('#16181b', { rough: 0.4 }), 0.01));
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 1.26), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
  p.position.z = 0.032;
  g.add(p);
  return g;
}

function table(f: Furniture): THREE.Group {
  const g = new THREE.Group();
  const top = f.style === 'glass' ? mat(f.c1, { glass: true }) : f.style === 'marble' ? mat(f.c1, { rough: 0.15, clear: true }) : mat(f.c1, { rough: 0.6 });
  const leg = f.style === 'wood' ? mat('#7a5230') : mat('#16181b', { metal: 0.8, rough: 0.3 });
  if (f.style === 'marble') {
    g.add(at(cyl(0.6, 0.6, 0.08, top, 40), 0, 0.42, 0));
    g.add(at(cyl(0.2, 0.3, 0.38, mat(f.c2!, { rough: 0.2 }), 24), 0, 0.19, 0));
  } else {
    g.add(at(box(1.3, 0.07, 0.7, top, 0.02), 0, 0.42, 0));
    for (const [x, z] of [[-0.58, -0.28], [0.58, -0.28], [-0.58, 0.28], [0.58, 0.28]]) g.add(at(box(0.05, 0.4, 0.05, leg, 0.01), x, 0.2, z));
  }
  // Something on the table: a football and a magazine.
  g.add(at(box(0.3, 0.015, 0.22, mat('#c6ff3d', { rough: 0.6 }), 0), 0.25, 0.465, 0.05, 0.3));
  g.add(at(ball(0.11), -0.3, 0.57, 0));
  return g;
}

function ball(r: number) {
  const t = canvasTex(256, 128, (g) => {
    g.fillStyle = '#f7f7f7'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#16181b';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) {
      const x = i * 32 + (j % 2) * 16, y = 20 + j * 44;
      g.beginPath();
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); }
      g.fill();
    }
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.35, clearcoat: 0.6 }));
  m.castShadow = true;
  return m;
}

// ---------- trophies & collectibles ----------

const TROPHY_HEX: Record<string, string> = { champion: '#ffcf3d', cup: '#e3e8ee', runner_up: '#cfd6de', third: '#d08a4e', golden_boot: '#ffcf3d', playmaker: '#3dd6ff', golden_glove: '#ffcf3d', pots: '#c6ff3d' };

function trophy(kind: string): THREE.Group {
  const g = new THREE.Group();
  const metal = mat(TROPHY_HEX[kind] ?? '#ffcf3d', { metal: 1, rough: 0.18 });
  g.add(at(box(0.22, 0.1, 0.22, mat('#1b1d21', { rough: 0.4 }), 0.01), 0, 0.05, 0));
  if (kind === 'golden_boot') {
    g.add(at(box(0.12, 0.12, 0.26, metal, 0.05), 0, 0.17, 0));
    g.add(at(box(0.12, 0.14, 0.1, metal, 0.04), 0, 0.28, -0.07));
  } else if (kind === 'golden_glove') {
    g.add(at(box(0.16, 0.24, 0.08, metal, 0.06), 0, 0.24, 0));
  } else if (kind === 'pots' || kind === 'playmaker') {
    g.add(at(cyl(0.02, 0.02, 0.12, metal, 8), 0, 0.16, 0));
    g.add(at(sphere(0.09, metal), 0, 0.3, 0));
  } else {
    const pts = [[0, 0], [0.06, 0], [0.03, 0.04], [0.025, 0.12], [0.1, 0.2], [0.12, 0.34], [0.11, 0.36]].map(([x, y]) => new THREE.Vector2(x, y));
    const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), metal);
    cup.castShadow = true;
    cup.position.y = 0.1;
    if (kind === 'cup') cup.scale.set(1.15, 1.25, 1.15);
    g.add(cup);
    for (const s of [-1, 1]) g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16, Math.PI), metal), s * 0.12, 0.38, 0).rotateZ(s * Math.PI / 2));
  }
  return g;
}

// ---------- cars ----------

function car(model: CarModel, color: string): THREE.Group {
  const g = new THREE.Group();
  const paint = mat(color, { rough: 0.25, metal: 0.3, clear: true });
  const glass = mat('#1b2630', { rough: 0.05, metal: 0.4 });
  const dims: Record<CarModel['body'], { l: number; w: number; h: number; cabin: [number, number, number]; cz: number; wheel: number; ride: number }> = {
    hatch: { l: 3.4, w: 1.6, h: 0.62, cabin: [1.8, 0.62, 1.42], cz: -0.25, wheel: 0.32, ride: 0.22 },
    classic: { l: 3.9, w: 1.65, h: 0.5, cabin: [1.3, 0.45, 1.3], cz: -0.3, wheel: 0.33, ride: 0.24 },
    coupe: { l: 4.2, w: 1.75, h: 0.5, cabin: [1.7, 0.45, 1.4], cz: -0.15, wheel: 0.34, ride: 0.18 },
    suv: { l: 4.4, w: 1.9, h: 0.85, cabin: [2.6, 0.7, 1.7], cz: -0.3, wheel: 0.42, ride: 0.32 },
    gt: { l: 4.6, w: 1.85, h: 0.5, cabin: [1.6, 0.42, 1.4], cz: -0.45, wheel: 0.36, ride: 0.16 },
    hyper: { l: 4.6, w: 1.95, h: 0.42, cabin: [1.5, 0.38, 1.3], cz: 0.1, wheel: 0.37, ride: 0.12 },
  };
  const d = dims[model.body];
  const body = box(d.w, d.h, d.l, paint, Math.min(0.24, d.h / 2 - 0.01));
  body.position.y = d.ride + d.wheel * 0.5 + d.h / 2;
  g.add(body);
  const cabin = box(d.cabin[2], d.cabin[1], d.cabin[0], glass, 0.16);
  cabin.position.set(0, body.position.y + d.h / 2 + d.cabin[1] / 2 - 0.04, d.cz);
  g.add(cabin);
  const roof = box(d.cabin[2] - 0.12, 0.06, d.cabin[0] * 0.62, paint, 0.03);
  roof.position.set(0, cabin.position.y + d.cabin[1] / 2, d.cz - 0.05);
  g.add(roof);
  const tyre = mat('#141516', { rough: 0.9 });
  const rim = mat(model.body === 'classic' ? '#e8ecef' : '#9aa1a8', { metal: 1, rough: 0.25 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const w = new THREE.Group();
    w.add(cyl(d.wheel, d.wheel, 0.26, tyre, 24));
    w.add(at(cyl(d.wheel * 0.6, d.wheel * 0.6, 0.27, rim, 16), 0, 0, 0));
    w.rotation.z = Math.PI / 2;
    w.position.set(sx * (d.w / 2 - 0.08), d.wheel, sz * (d.l / 2 - d.wheel - 0.32));
    g.add(w);
  }
  const head = mat('#fffbe8', { emissive: '#fff2c0' });
  const tail = mat('#ff2d3d', { emissive: '#ff2d3d' });
  for (const sx of [-1, 1]) {
    g.add(at(box(0.32, 0.1, 0.04, head, 0.02), sx * (d.w / 2 - 0.3), body.position.y + 0.04, d.l / 2));
    g.add(at(box(0.36, 0.08, 0.04, tail, 0.02), sx * (d.w / 2 - 0.28), body.position.y + 0.06, -d.l / 2));
  }
  if (model.body === 'classic') {
    const chrome = mat('#e8ecef', { metal: 1, rough: 0.15 });
    for (const sz of [-1, 1]) g.add(at(box(d.w + 0.06, 0.1, 0.1, chrome, 0.04), 0, d.ride + d.wheel * 0.5 + 0.08, sz * (d.l / 2 + 0.02)));
  }
  if (model.body === 'gt' || model.body === 'hyper') {
    const stripe = mat(color === '#16181b' ? '#c6ff3d' : '#16181b', { rough: 0.3, clear: true });
    g.add(at(box(0.3, 0.02, d.l * 0.98, stripe, 0.01), 0, body.position.y + d.h / 2 + 0.005, 0));
  }
  if (model.body === 'hyper') {
    const wing = mat('#16181b', { rough: 0.3 });
    g.add(at(box(d.w * 0.95, 0.05, 0.4, wing, 0.02), 0, body.position.y + d.h / 2 + 0.38, -d.l / 2 + 0.3));
    for (const sx of [-0.5, 0.5]) g.add(at(box(0.05, 0.36, 0.2, wing, 0.01), sx * d.w * 0.7, body.position.y + d.h / 2 + 0.18, -d.l / 2 + 0.3));
  }
  if (model.body === 'suv') {
    const rail = mat('#2a2f35', { metal: 0.6, rough: 0.4 });
    for (const sx of [-1, 1]) g.add(at(box(0.06, 0.06, d.cabin[0] * 0.8, rail, 0.02), sx * (d.cabin[2] / 2 - 0.12), roof.position.y + 0.06, d.cz));
  }
  return g;
}

// ---------- scene ----------

export function createHomeScene(host: HTMLElement): HomeScene {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block;touch-action:pan-y;cursor:grab';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0e1114');
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 120);
  let world = new THREE.Group();
  scene.add(world);
  let figure: Figure | null = null;

  // Orbit: drag sideways to swing around the diorama a little.
  let yaw = 0;
  let yawTarget = 0;
  let radius = 8;
  let target = new THREE.Vector3();
  const ELEV = 0.6;
  let dragging = false;
  let lastX = 0;
  let idle = 0;
  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    renderer.domElement.setPointerCapture(e.pointerId);
    renderer.domElement.style.cursor = 'grabbing';
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    yawTarget = Math.max(-0.75, Math.min(0.75, yawTarget - (e.clientX - lastX) * 0.006));
    lastX = e.clientX;
    idle = 0;
  };
  const onUp = () => {
    dragging = false;
    renderer.domElement.style.cursor = 'grab';
  };
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);

  const resize = () => {
    const w = host.clientWidth || 320;
    const h = host.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Pull back on narrow screens so the whole room fits.
    camera.fov = camera.aspect < 1 ? 40 : 32;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  const clear = () => {
    scene.remove(world);
    world.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mm = m.material as THREE.MeshStandardMaterial;
        if (mm.map) mm.map.dispose();
        if (![...matCache.values()].includes(mm)) mm.dispose();
      }
    });
    world = new THREE.Group();
    scene.add(world);
    figure = null;
  };

  const lights = (sunPos: THREE.Vector3, sunColor: string, sunI: number, span: number) => {
    const sun = new THREE.DirectionalLight(sunColor, sunI);
    sun.position.copy(sunPos);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -span;
    sun.shadow.camera.right = sun.shadow.camera.top = span;
    sun.shadow.camera.far = 60;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    sun.shadow.radius = 5;
    world.add(sun);
    world.add(new THREE.HemisphereLight('#fff3e0', '#2a2420', 0.55));
  };

  const clock = new THREE.Timer();
  let raf = 0;
  const loop = () => {
    raf = requestAnimationFrame(loop);
    clock.update();
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.getElapsed();
    idle += dt;
    // Gentle drift back and forth when nobody is dragging.
    const drift = idle > 3 && !dragging ? Math.sin(t * 0.15) * 0.18 : 0;
    yaw += (yawTarget + drift - yaw) * Math.min(1, dt * 3);
    // Fit the whole diorama in view whatever the screen shape.
    const vfov = THREE.MathUtils.degToRad(camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const dist = (radius / Math.sin(Math.min(vfov, hfov) / 2)) * 0.8;
    const a = yaw + 0.62;
    camera.position.set(target.x + Math.sin(a) * Math.cos(ELEV) * dist, target.y + Math.sin(ELEV) * dist, target.z + Math.cos(a) * Math.cos(ELEV) * dist);
    camera.lookAt(target);
    if (figure) figure.animate(dt, 0, t);
    renderer.render(scene, camera);
  };
  loop();

  return {
    room(d) {
      clear();
      const tier = HOUSE_BY_ID[d.home.tier] ?? HOUSE_BY_ID.studio;
      const [w, dep] = tier.size;
      const wallCol = WALL_COLORS[d.home.wall] ?? WALL_COLORS[0];
      const floorStyle = FLOOR_STYLES[d.home.floor] ?? 'oak';
      target = new THREE.Vector3(0, 0.9, 0);
      radius = 0.5 * Math.hypot(w, dep);
      yaw = yawTarget = 0;

      // Floor slab with a darker plinth edge, like a model on a table.
      const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, dep), new THREE.MeshStandardMaterial({ map: floorTexture(floorStyle, w, dep), roughness: floorStyle === 'marble' ? 0.25 : 0.7 }));
      floor.position.y = -0.06;
      floor.receiveShadow = true;
      world.add(floor);
      world.add(at(box(w + 0.3, 0.3, dep + 0.3, mat('#15181c', { rough: 0.5 }), 0.05), 0, -0.27, 0));

      const wallM = new THREE.MeshStandardMaterial({ color: wallCol, roughness: 0.9 });
      const wallT = 0.16;
      // Back wall with a big window cut out.
      const winW = Math.min(w * 0.42, 4.6);
      const winH = 1.9;
      const winY = 0.9;
      const winX = w * 0.12;
      const back = new THREE.Group();
      const piece = (x0: number, x1: number, y0: number, y1: number) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, wallT), wallM);
        m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
        m.castShadow = m.receiveShadow = true;
        back.add(m);
      };
      piece(-w / 2, winX - winW / 2, 0, WALL_H);
      piece(winX + winW / 2, w / 2, 0, WALL_H);
      piece(winX - winW / 2, winX + winW / 2, 0, winY);
      piece(winX - winW / 2, winX + winW / 2, winY + winH, WALL_H);
      back.position.z = -dep / 2 - wallT / 2;
      world.add(back);
      const frameM = mat('#16181b', { rough: 0.4 });
      for (const [fx, fy, fw, fh] of [[winX, winY, winW, 0.08], [winX, winY + winH, winW, 0.08], [winX - winW / 2, winY + winH / 2, 0.08, winH], [winX + winW / 2, winY + winH / 2, 0.08, winH], [winX, winY + winH / 2, 0.05, winH]] as const) {
        world.add(at(box(fw, fh, 0.12, frameM, 0.01), fx, fy, -dep / 2 - wallT / 2));
      }
      world.add(at(box(winW + 0.2, 0.06, 0.34, mat('#e9e4da', { rough: 0.4 }), 0.02), winX, winY - 0.03, -dep / 2 + 0.06));
      const view = new THREE.Mesh(new THREE.PlaneGeometry(winW * 3.2, winH * 2.6), new THREE.MeshBasicMaterial({ map: viewTexture(tier.view), toneMapped: false }));
      view.position.set(winX, winY + winH / 2 + 0.3, -dep / 2 - 3.5);
      world.add(view);
      // Left wall: trophies and framed shirts.
      const left = new THREE.Mesh(new THREE.BoxGeometry(wallT, WALL_H, dep + wallT), wallM);
      left.position.set(-w / 2 - wallT / 2, WALL_H / 2, -wallT / 2);
      left.castShadow = left.receiveShadow = true;
      world.add(left);
      // Skirting boards.
      const skirt = mat('#f2efe9', { rough: 0.5 });
      world.add(at(box(w, 0.1, 0.03, skirt, 0), 0, 0.05, -dep / 2 + 0.015));
      world.add(at(box(0.03, 0.1, dep, skirt, 0), -w / 2 + 0.015, 0.05, 0));

      const view2sun: Record<string, [string, number]> = { city: ['#ffc58a', 2.4], park: ['#fff1d6', 2.8], sea: ['#ffc98f', 2.8], skyline: ['#c9b8ff', 1.4] };
      const [sunC, sunI] = view2sun[tier.view];
      lights(new THREE.Vector3(winX + 3, 7, -dep / 2 - 6), sunC, sunI, Math.max(w, dep));
      const fill = new THREE.PointLight('#ffe2b8', 6, 14, 1.4);
      fill.position.set(w * 0.2, WALL_H - 0.3, dep * 0.15);
      world.add(fill);
      // Ceiling light fitting suggestion (hangs just inside the cut-away).
      world.add(at(cyl(0.02, 0.02, 0.5, mat('#16181b'), 6), w * 0.2, WALL_H - 0.25, dep * 0.15));

      const F = d.home.furniture;
      const rugF = F.rug && FURNITURE_BY_ID[F.rug];
      if (rugF) world.add(at(rug(rugF, w), 0.2, 0.01, 0.4));
      const sofaF = F.sofa && FURNITURE_BY_ID[F.sofa];
      if (sofaF) world.add(at(sofa(sofaF), 0.2, 0, dep / 2 - 1.3, Math.PI));
      const tvF = F.tv && FURNITURE_BY_ID[F.tv];
      if (tvF) world.add(at(tv(tvF), -w / 2 + 0.55, 0, 0.5, Math.PI / 2));
      const tableF = F.table && FURNITURE_BY_ID[F.table];
      if (tableF) world.add(at(table(tableF), 0.2, 0, 0.35));
      const plantF = F.plant && FURNITURE_BY_ID[F.plant];
      if (plantF) world.add(at(plant(plantF), w / 2 - 0.6, 0, -dep / 2 + 0.6));
      const lampF = F.lamp && FURNITURE_BY_ID[F.lamp];
      if (lampF) world.add(at(lamp(lampF), w / 2 - 0.7, 0, dep / 2 - 1.2, lampF.style === 'arc' ? Math.PI : 0));
      const artF = F.art && FURNITURE_BY_ID[F.art];
      if (artF) world.add(at(art(artF), winX - winW / 2 - Math.min(1.3, (w / 2 + winX - winW / 2) / 2), 1.85, -dep / 2 + 0.05));

      // Trophy shelves along the left wall.
      const shelfLen = Math.min(dep - 1.6, 4.5);
      const shelfZ0 = -dep / 2 + 0.6;
      const shelfM = mat('#2a2f35', { rough: 0.35, clear: true });
      const perShelf = Math.max(3, Math.floor(shelfLen / 0.42));
      const trophies = d.trophies.slice(0, perShelf * 2);
      for (let s = 0; s < 2; s++) {
        const y = 1.55 + s * 0.65;
        world.add(at(box(0.36, 0.05, shelfLen, shelfM, 0.01), -w / 2 + 0.18, y, shelfZ0 + shelfLen / 2));
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, shelfLen - 0.1), mat('#fff6dd', { emissive: '#ffe7b0' }));
        strip.position.set(-w / 2 + 0.34, y - 0.03, shelfZ0 + shelfLen / 2);
        world.add(strip);
        trophies.slice(s * perShelf, (s + 1) * perShelf).forEach((t, i) => world.add(at(trophy(t.kind), -w / 2 + 0.18, y + 0.025, shelfZ0 + 0.3 + i * 0.42)));
      }
      if (!trophies.length) {
        // An empty spot with a little card waiting for the first trophy.
        world.add(at(box(0.02, 0.14, 0.24, mat('#f2efe9'), 0.005), -w / 2 + 0.2, 1.65, shelfZ0 + 0.4, 0));
      }

      // Framed shirts and balls in display cases.
      const shirts = d.collectibles.filter((c) => c.kind === 'shirt').slice(0, 6);
      const balls = d.collectibles.filter((c) => c.kind === 'ball').slice(0, 3);
      const backSpace = w / 2 - (winX + winW / 2) - 0.3;
      shirts.forEach((c, i) => {
        const fr = new THREE.Group();
        fr.add(box(0.7, 0.84, 0.05, mat('#e9e4da', { rough: 0.3 }), 0.01));
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.74), new THREE.MeshStandardMaterial({ map: shirtTexture(c.data.primary ?? '#ffffff', c.data.secondary ?? '#111111', c.data.number ?? 10, c.data.club ?? ''), roughness: 0.8 }));
        p.position.z = 0.03;
        fr.add(p);
        if (i < 2 && backSpace > 0.8) {
          // On the back wall, right of the window.
          world.add(at(fr, winX + winW / 2 + 0.25 + backSpace / 2 + (i - 0.5) * Math.min(0.9, backSpace / 2), 1.9, -dep / 2 + 0.04));
        } else {
          const k = i < 2 && backSpace > 0.8 ? i : i - (backSpace > 0.8 ? 2 : 0);
          world.add(at(fr, -w / 2 + 0.04, 2.0 - Math.floor(k / 4) * 0.95, shelfZ0 + shelfLen + 0.55 + (k % 4) * 0.85, Math.PI / 2));
        }
      });
      balls.forEach((_, i) => {
        const x = w / 2 - 0.6 - i * 0.7;
        const z = dep / 2 - 0.5;
        world.add(at(box(0.44, 0.9, 0.44, mat('#2a2f35', { rough: 0.3, clear: true }), 0.02), x, 0.45, z));
        world.add(at(ball(0.14), x, 1.04, z));
        world.add(at(box(0.42, 0.42, 0.42, mat('#ffffff', { glass: true }), 0.01), x, 1.11, z));
      });

      if (d.owner) {
        figure = new Figure(d.owner.kit, d.owner.appearance, d.owner.keeper, GK_KITS[0], d.owner.equipped);
        figure.root.scale.setScalar(0.95);
        figure.root.position.set(1.6 + Math.min(1, w * 0.05), 0, 0.9);
        figure.root.rotation.y = -0.5;
        figure.root.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = true;
        });
        world.add(figure.root);
      }
    },

    garage(d) {
      clear();
      const bays = Math.max(1, d.capacity);
      const bayW = 3;
      const w = bays * bayW + 1.2;
      const dep = 7;
      target = new THREE.Vector3(0, 0.6, 0.3);
      radius = 0.5 * Math.hypot(w, dep);
      yaw = yawTarget = 0;
      const concrete = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, dep), new THREE.MeshStandardMaterial({ map: floorTexture('concrete', w, dep), roughness: 0.35, metalness: 0.05 }));
      concrete.position.y = -0.06;
      concrete.receiveShadow = true;
      world.add(concrete);
      world.add(at(box(w + 0.3, 0.3, dep + 0.3, mat('#15181c', { rough: 0.5 }), 0.05), 0, -0.27, 0));
      const wallM = new THREE.MeshStandardMaterial({ color: '#2b3036', roughness: 0.85 });
      const backW = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_H, 0.16), wallM);
      backW.position.set(0, WALL_H / 2, -dep / 2 - 0.08);
      backW.receiveShadow = true;
      world.add(backW);
      const leftW = new THREE.Mesh(new THREE.BoxGeometry(0.16, WALL_H, dep), wallM);
      leftW.position.set(-w / 2 - 0.08, WALL_H / 2, 0);
      leftW.receiveShadow = true;
      world.add(leftW);
      // Lime stripe and light bars along the back wall.
      world.add(at(box(w, 0.12, 0.02, mat('#c6ff3d', { rough: 0.5 }), 0), 0, 1.1, -dep / 2 + 0.01));
      lights(new THREE.Vector3(4, 9, 6), '#ffffff', 1.6, Math.max(w, dep));
      for (let i = 0; i < bays; i++) {
        const x = -w / 2 + 0.6 + bayW * (i + 0.5);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.12), mat('#ffffff', { emissive: '#f4fbff' }));
        bar.position.set(x, WALL_H - 0.2, -dep / 2 + 0.3);
        world.add(bar);
        const pl = new THREE.PointLight('#eef6ff', 5, 9, 1.5);
        pl.position.set(x, WALL_H - 0.4, -0.5);
        world.add(pl);
        // Bay markings.
        const lineM = mat('#e8ecef', { rough: 0.6 });
        if (i === 0) world.add(at(box(0.08, 0.01, dep - 1.2, lineM, 0), x - bayW / 2, 0.006, 0.2));
        world.add(at(box(0.08, 0.01, dep - 1.2, lineM, 0), x + bayW / 2, 0.006, 0.2));
        const c = d.cars[i];
        const model = c && CAR_BY_ID[c.id];
        if (model) {
          const m = car(model, c.color);
          m.position.set(x, 0, 0.3);
          m.rotation.y = 0.08 * (i % 2 ? -1 : 1);
          m.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) o.castShadow = true;
          });
          world.add(m);
          if (c.id === d.fav) {
            const star = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.04, 8, 64), mat('#c6ff3d', { emissive: '#c6ff3d' }));
            star.rotation.x = Math.PI / 2;
            star.position.set(x, 0.02, 0.3);
            world.add(star);
          }
        } else {
          const t = canvasTex(256, 128, (g) => {
            g.fillStyle = 'rgba(232,236,239,.45)';
            g.font = '800 46px system-ui, sans-serif';
            g.textAlign = 'center';
            g.fillText('EMPTY', 128, 80);
          });
          const p = new THREE.Mesh(new THREE.PlaneGeometry(2, 1), new THREE.MeshBasicMaterial({ map: t, transparent: true }));
          p.rotation.x = -Math.PI / 2;
          p.position.set(x, 0.01, 0.6);
          world.add(p);
        }
      }
      // Tool wall: a shelf with tyres and a toolbox.
      world.add(at(box(0.5, 0.9, 1.2, mat('#d63a3a', { rough: 0.35, clear: true }), 0.04), -w / 2 + 0.35, 0.45, -dep / 2 + 1));
      for (let i = 0; i < 2; i++) world.add(at(cyl(0.34, 0.34, 0.24, mat('#141516', { rough: 0.9 }), 24), -w / 2 + 0.45, 0.12 + i * 0.25, dep / 2 - 0.9));
    },

    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointerup', onUp);
      clear();
      renderer.dispose();
      env.dispose();
      pmrem.dispose();
      renderer.domElement.remove();
    },
  };
}
