// Everything that stands in a home: your own furniture (sofa, TV, rug…),
// the fixed fittings of each floor plan (kitchen, bed, bathroom…), garden
// and terrace pieces, trophies and framed shirts.
//
// Every piece faces +z in its own frame and stands on y = 0.
import * as THREE from 'three';
import type { Furniture } from '../../../shared/life.ts';
import type { Fixture } from './plans.ts';
import { at, blob, box, canvasTex, cyl, mat, rand, sphere, tube } from './kit.ts';

export interface Prop {
  obj: THREE.Object3D;
  /** Footprint that blocks walking (width along x, depth along z), or none. */
  foot?: [number, number];
  /** Where a person stands to use it (own frame), and which way they face relative to the piece. */
  use?: { x: number; z: number; face: number };
  /** Point lights it brings (lamps), so the scene can scale them for day or night. */
  lights?: THREE.PointLight[];
}

const PI = Math.PI;

function group(...kids: THREE.Object3D[]) {
  const g = new THREE.Group();
  for (const k of kids) g.add(k);
  return g;
}

function warmLight(color: string, intensity: number, dist: number) {
  const l = new THREE.PointLight(color, intensity, dist, 2);
  l.userData.base = intensity;
  return l;
}

// ---------- your furniture ----------

export function sofa(f: Furniture): Prop {
  const g = new THREE.Group();
  const leather = f.style === 'chester';
  const fabric = mat(f.c1, { rough: leather ? 0.42 : 0.92, clear: leather, sheen: !leather });
  const dark = mat(f.c2 ?? '#333', { rough: 0.5, metal: 0.2 });
  const seat = (w: number, armless = false) => {
    const s = new THREE.Group();
    s.add(at(box(w, 0.26, 0.92, fabric, 0.06), 0, 0.27, 0));
    s.add(at(box(w, 0.58, 0.22, fabric, 0.09), 0, 0.62, -0.35));
    const n = Math.max(1, Math.round(w / 0.75));
    const cw = w / n;
    for (let i = 0; i < n; i++) {
      s.add(at(box(cw - 0.04, 0.15, 0.7, fabric, 0.07), -w / 2 + cw * (i + 0.5), 0.47, 0.08));
      const back = at(box(cw - 0.06, 0.42, 0.16, fabric, 0.08), -w / 2 + cw * (i + 0.5), 0.72, -0.2);
      back.rotation.x = -0.12;
      s.add(back);
    }
    if (!armless) for (const x of [-w / 2 + 0.08, w / 2 - 0.08]) for (const z of [0.36, -0.36]) s.add(at(cyl(0.025, 0.018, 0.14, dark, 8), x, 0.07, z));
    return s;
  };
  let foot: [number, number] = [2.6, 1.0];
  if (f.style === 'corner') {
    g.add(seat(2.3));
    g.add(at(seat(1.5, true), 1.39, 0, 0.65, -PI / 2));
    g.add(at(box(0.24, 0.6, 0.92, fabric, 0.1), -1.27, 0.38, 0));
    foot = [2.9, 1.0];
    g.add(at(blob(2.6, 1.0), 0.15, 0, 0));
    g.add(at(blob(1.0, 1.5), 1.39, 0, 0.6));
  } else {
    g.add(seat(2.0));
    for (const x of [-1.12, 1.12]) {
      g.add(at(box(0.24, leather ? 0.72 : 0.6, 0.94, fabric, leather ? 0.12 : 0.1), x, leather ? 0.42 : 0.38, 0));
    }
    if (leather) {
      const btn = mat(f.c2 ?? '#222', { rough: 0.3 });
      for (let i = 0; i < 7; i++) for (let j = 0; j < 2; j++) g.add(at(sphere(0.022, btn, 8), -0.9 + i * 0.3, 0.66 + j * 0.16, -0.25));
    }
    g.add(blob(2.5, 1.0));
  }
  // Throw cushions in a contrast colour.
  const cushion = mat(f.c2 && f.style !== 'couch' ? f.c2 : '#c6ff3d', { rough: 0.95, sheen: true });
  for (const [x, rz] of [[-0.7, 0.18], [0.75, -0.12]] as const) {
    const c = at(box(0.42, 0.4, 0.14, cushion, 0.07), x, 0.66, -0.12);
    c.rotation.set(-0.3, 0, rz);
    g.add(c);
  }
  return { obj: g, foot: f.style === 'corner' ? [2.9, 1.0] : foot, use: { x: 0, z: 0.95, face: 0 } };
}

function screenTex(kind: string) {
  return canvasTex(512, 288, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 288);
    gr.addColorStop(0, kind === 'cinema' ? '#1d6b3a' : '#2a8a45');
    gr.addColorStop(1, '#3fae55');
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 288);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.04)';
      g.fillRect(i * 57, 0, 57, 288);
    }
    g.strokeStyle = 'rgba(255,255,255,.75)';
    g.lineWidth = 3;
    g.strokeRect(30, 34, 452, 222);
    g.beginPath(); g.moveTo(256, 34); g.lineTo(256, 256); g.stroke();
    g.beginPath(); g.arc(256, 145, 38, 0, Math.PI * 2); g.stroke();
    g.strokeRect(30, 90, 64, 110); g.strokeRect(418, 90, 64, 110);
    for (let i = 0; i < 12; i++) {
      g.fillStyle = i < 6 ? '#ff3d5a' : '#f2f2f2';
      const x = 70 + ((i * 97) % 380);
      const y = 70 + ((i * 53) % 160);
      g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(8,10,14,.82)';
    g.fillRect(16, 10, 170, 30);
    g.fillStyle = '#c6ff3d';
    g.font = '800 18px system-ui, sans-serif';
    g.fillText('LIVE   2 – 1   67\'', 26, 31);
  });
}

export function tv(f: Furniture): Prop {
  const g = new THREE.Group();
  const big = f.style === 'cinema';
  const gaming = f.style === 'gaming';
  const w = big ? 2.4 : gaming ? 1.65 : 1.45;
  const unitW = big ? 2.6 : 1.9;
  const wood = mat(big ? '#22252a' : '#6b4a2e', { rough: big ? 0.35 : 0.55, clear: big });
  // Low media unit with two doors and a shadow gap.
  g.add(at(box(unitW, 0.42, 0.42, wood, 0.02), 0, 0.27, 0));
  g.add(at(box(unitW - 0.04, 0.02, 0.38, mat('#111214'), 0), 0, 0.055, 0));
  for (const s of [-1, 1]) g.add(at(box(0.04, 0.06, 0.04, mat('#c9ccd1', { metal: 1, rough: 0.3 }), 0.01), s * 0.08, 0.3, 0.215));
  // Wall-mounted screen.
  const h = w * 0.5625;
  const y = 0.48 + 0.3 + h / 2;
  g.add(at(box(w + 0.04, h + 0.04, 0.05, mat('#0c0d0f', { rough: 0.25, clear: true }), 0.012), 0, y, -0.16));
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.02, h - 0.02), new THREE.MeshBasicMaterial({ map: screenTex(f.style), toneMapped: false }));
  scr.position.set(0, y, -0.133);
  g.add(scr);
  const lights: THREE.PointLight[] = [];
  const glow = warmLight('#7dffa8', big ? 0.9 : 0.5, 3.5);
  glow.position.set(0, y, 0.5);
  g.add(glow);
  lights.push(glow);
  if (gaming) {
    g.add(at(box(0.36, 0.08, 0.26, mat('#f2f2f2', { rough: 0.3 }), 0.02), 0.62, 0.52, 0.0));
    g.add(at(box(0.2, 0.05, 0.12, mat('#16181b'), 0.02), -0.45, 0.505, 0.08, 0.3));
    // LED strip glowing on the wall behind.
    const strip = at(box(w + 0.1, 0.02, 0.02, mat(f.c2!, { emissive: f.c2, glow: 2.4 }), 0), 0, y - h / 2 - 0.04, -0.19);
    g.add(strip);
    const led = warmLight(f.c2!, 1.2, 2.5);
    led.position.set(0, y, -0.05);
    g.add(led);
    lights.push(led);
  }
  if (big) {
    // Tower speakers either side and a soundbar.
    const sp = mat('#16171a', { rough: 0.5 });
    const cone = mat('#33363c', { rough: 0.4, metal: 0.3 });
    for (const x of [-1.6, 1.6]) {
      g.add(at(box(0.3, 1.15, 0.32, sp, 0.03), x, 0.575, 0));
      for (const [cy, r] of [[0.92, 0.09], [0.62, 0.11], [0.32, 0.11]] as const) g.add(at(cyl(r, r, 0.02, cone, 20), x, cy, 0.165).rotateX(PI / 2));
    }
    g.add(at(box(1.2, 0.08, 0.12, sp, 0.03), 0, 0.53, 0.05));
  }
  g.add(blob(big ? 3.6 : unitW, 0.45));
  return { obj: g, foot: [big ? 3.6 : unitW, 0.55], lights };
}

export function rug(f: Furniture): Prop {
  if (f.style === 'round') {
    const t = canvasTex(256, 256, (g) => {
      g.fillStyle = f.c1; g.beginPath(); g.arc(128, 128, 128, 0, Math.PI * 2); g.fill();
      g.strokeStyle = f.c2!; g.lineWidth = 9;
      for (const r of [104, 72, 40]) { g.beginPath(); g.arc(128, 128, r, 0, Math.PI * 2); g.stroke(); }
    });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.25, 0.015, 48), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
    m.position.y = 0.008;
    m.receiveShadow = true;
    return { obj: group(m) };
  }
  const rw = f.style === 'pitch' ? 2.6 : 2.8;
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
      g.strokeStyle = f.c2!; g.lineWidth = 12; g.strokeRect(14, 14, 484, 312);
      g.lineWidth = 3; g.strokeRect(34, 34, 444, 272);
      g.fillStyle = f.c2!;
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) {
        const x = 90 + i * 83;
        const y = 90 + j * 80;
        g.beginPath(); g.moveTo(x, y - 22); g.lineTo(x + 22, y); g.lineTo(x, y + 22); g.lineTo(x - 22, y); g.closePath(); g.fill();
        g.fillStyle = '#1b3b5a'; g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); g.fillStyle = f.c2!;
      }
      // Fringe dots on the short ends.
      g.fillStyle = f.c2!;
      for (let k = 0; k < 40; k++) { g.fillRect(4, 6 + k * 8.2, 6, 3); g.fillRect(502, 6 + k * 8.2, 6, 3); }
    }
  });
  const m = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.015, rd), new THREE.MeshStandardMaterial({ map: t, roughness: 1 }));
  m.position.y = 0.008;
  m.receiveShadow = true;
  return { obj: group(m) };
}

export function plant(f: Furniture): Prop {
  const g = new THREE.Group();
  const pot = mat(f.style === 'olive' ? '#c46f4a' : '#e9e4da', { rough: 0.5, clear: f.style !== 'olive' });
  g.add(at(cyl(0.24, 0.18, 0.46, pot, 24), 0, 0.23, 0));
  g.add(at(cyl(0.22, 0.22, 0.02, mat('#3a2a1a', { rough: 1 })), 0, 0.44, 0));
  const leaf = mat(f.c1, { rough: 0.65, sheen: true });
  const r = rand(f.style.length * 17);
  if (f.style === 'fern') {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * PI * 2 + r() * 0.3;
      const len = 0.55 + r() * 0.3;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6), leaf);
      l.scale.set(0.12, 0.03, len);
      l.position.set(Math.sin(a) * len * 0.45, 0.62 + r() * 0.12, Math.cos(a) * len * 0.45);
      l.rotation.set(0, a, 0);
      l.rotateX(-0.45 - r() * 0.3);
      l.castShadow = true;
      g.add(l);
    }
  } else if (f.style === 'palm') {
    g.add(tube([[0, 0.4, 0], [0.04, 1.0, 0.02], [0.1, 1.6, 0.05]], 0.045, mat('#8a6a44', { rough: 0.9 }), 12));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * PI * 2;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 6, 0, PI * 2, 0, 0.55), leaf);
      l.scale.set(0.32, 1, 1.25);
      l.position.set(0.1, 1.62, 0.05);
      l.rotation.set(0.95 + r() * 0.3, a, 0, 'YXZ');
      l.castShadow = true;
      g.add(l);
    }
  } else {
    const trunk = mat('#6b5236', { rough: 0.9 });
    g.add(tube([[0, 0.4, 0], [0.06, 0.9, 0], [-0.04, 1.3, 0.04]], 0.05, trunk, 12));
    for (let i = 0; i < 9; i++) {
      const b = sphere(0.22 + r() * 0.12, leaf, 12);
      b.scale.y = 0.8;
      b.position.set(Math.cos(i * 1.7) * 0.3, 1.35 + r() * 0.45, Math.sin(i * 1.7) * 0.3);
      g.add(b);
    }
  }
  g.add(blob(0.5, 0.5));
  return { obj: g, foot: [0.55, 0.55] };
}

export function lamp(f: Furniture): Prop {
  const g = new THREE.Group();
  const lights: THREE.PointLight[] = [];
  const chrome = mat('#c9ccd1', { metal: 1, rough: 0.22 });
  if (f.style === 'arc') {
    // A marble foot, a steel arc over the sofa and a dome shade.
    g.add(at(cyl(0.2, 0.22, 0.07, mat('#f2efe9', { rough: 0.2, clear: true }), 28), 0, 0.035, 0));
    g.add(tube([[0, 0.05, 0], [0, 1.2, 0], [0.12, 1.85, 0], [0.6, 2.05, 0], [1.05, 1.82, 0], [1.2, 1.6, 0]], 0.022, chrome, 40));
    const shade = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 10, 0, PI * 2, 0, PI / 2), mat(f.c1, { rough: 0.35, metal: 0.3 }));
    (shade.material as THREE.Material).side = THREE.DoubleSide;
    shade.castShadow = true;
    g.add(at(shade, 1.2, 1.5, 0));
    g.add(at(sphere(0.07, mat('#fff4d6', { emissive: '#ffdca0', glow: 3 }), 12), 1.2, 1.5, 0));
    const l = warmLight('#ffd9a0', 2.2, 5);
    l.position.set(1.2, 1.35, 0);
    g.add(l);
    lights.push(l);
  } else if (f.style === 'neon') {
    g.add(at(box(0.3, 0.04, 0.3, mat('#16181b'), 0.01), 0, 0.02, 0));
    g.add(at(cyl(0.035, 0.035, 1.7, mat(f.c1, { emissive: f.c1, glow: 3 }), 12), 0, 0.9, 0));
    const l = warmLight(f.c1, 1.6, 4);
    l.position.set(0, 1.0, 0.2);
    g.add(l);
    lights.push(l);
  } else {
    g.add(at(cyl(0.17, 0.2, 0.04, mat('#16181b', { rough: 0.3 })), 0, 0.02, 0));
    g.add(at(cyl(0.018, 0.018, 1.25, mat(f.c1, { metal: 1, rough: 0.2 })), 0, 0.66, 0));
    g.add(at(sphere(0.26, mat('#fff4d6', { emissive: '#ffdca0', glow: 1.2 }), 24), 0, 1.5, 0));
    g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.016, 8, 40), mat(f.c1, { metal: 1, rough: 0.2 })), 0, 1.5, 0).rotateX(PI / 2));
    const l = warmLight('#ffd9a0', 2.2, 5);
    l.position.set(0, 1.5, 0);
    g.add(l);
    lights.push(l);
  }
  g.add(blob(0.4, 0.4));
  return { obj: g, foot: [0.4, 0.4], lights };
}

export function art(f: Furniture): Prop {
  const g = new THREE.Group();
  if (f.style === 'neonsign') {
    const t = canvasTex(512, 200, (c) => {
      c.shadowColor = f.c1; c.shadowBlur = 26;
      c.strokeStyle = f.c1; c.lineWidth = 10; c.lineJoin = 'round';
      c.font = 'italic 900 132px system-ui, sans-serif'; c.textAlign = 'center';
      c.strokeText('GOAL!', 256, 148);
      c.shadowBlur = 8;
      c.lineWidth = 3; c.strokeStyle = '#f6ffe0'; c.strokeText('GOAL!', 256, 148);
    });
    const back = at(box(1.75, 0.66, 0.02, mat('#0e1013', { rough: 0.2, glass: true, opacity: 0.35 }), 0), 0, 0, -0.01);
    g.add(back);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.7), new THREE.MeshBasicMaterial({ map: t, transparent: true, toneMapped: false, depthWrite: false }));
    m.position.z = 0.012;
    g.add(m);
    const l = warmLight(f.c1, 1.0, 3);
    l.position.set(0, 0, 0.4);
    g.add(l);
    return { obj: g, lights: [l] };
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
      for (let i = 0; i < 10; i++) {
        c.fillStyle = cols[i % cols.length];
        c.globalAlpha = 0.88;
        if (i % 2) { c.beginPath(); c.arc(r() * 320, r() * 420, 30 + r() * 70, 0, Math.PI * 2); c.fill(); }
        else c.fillRect(r() * 260, r() * 360, 40 + r() * 120, 20 + r() * 90);
      }
      c.globalAlpha = 1;
    }
  });
  g.add(box(0.98, 1.28, 0.05, mat('#16181b', { rough: 0.35 }), 0.008));
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.88, 1.18), new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }));
  p.position.z = 0.027;
  g.add(p);
  return { obj: g };
}

export function table(f: Furniture): Prop {
  const g = new THREE.Group();
  const top = f.style === 'glass' ? mat(f.c1, { glass: true, opacity: 0.4 }) : f.style === 'marble' ? mat(f.c1, { rough: 0.12, clear: true }) : mat(f.c1, { rough: 0.55 });
  const leg = f.style === 'wood' ? mat('#7a5230', { rough: 0.6 }) : mat('#16181b', { metal: 0.8, rough: 0.3 });
  if (f.style === 'marble') {
    g.add(at(cyl(0.55, 0.55, 0.06, top, 40), 0, 0.4, 0));
    g.add(at(cyl(0.18, 0.28, 0.37, mat(f.c2!, { rough: 0.2 }), 24), 0, 0.185, 0));
  } else {
    g.add(at(box(1.2, 0.06, 0.62, top, 0.02), 0, 0.4, 0));
    if (f.style === 'glass') g.add(at(box(1.1, 0.02, 0.52, mat('#16181b', { metal: 0.8, rough: 0.3 }), 0), 0, 0.12, 0));
    for (const [x, z] of [[-0.54, -0.25], [0.54, -0.25], [-0.54, 0.25], [0.54, 0.25]]) g.add(at(box(0.045, 0.37, 0.045, leg, 0.01), x, 0.185, z));
  }
  // A magazine and a match ball on top.
  g.add(at(box(0.3, 0.012, 0.22, mat('#c6ff3d', { rough: 0.6 }), 0), 0.22, 0.436, 0.05, 0.3));
  g.add(at(ball(0.11), -0.28, 0.54, 0));
  g.add(blob(1.1, 0.6, 0.8));
  return { obj: g, foot: [1.2, 0.62] };
}

let ballTex: THREE.Texture | null = null;
export function ball(r: number) {
  ballTex ??= canvasTex(256, 128, (g) => {
    g.fillStyle = '#f7f7f7'; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#16181b';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) {
      const x = i * 32 + (j % 2) * 16;
      const y = 20 + j * 44;
      g.beginPath();
      for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); }
      g.fill();
    }
  });
  ballTex.userData.shared = true;
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), new THREE.MeshPhysicalMaterial({ map: ballTex, roughness: 0.35, clearcoat: 0.6 }));
  m.castShadow = true;
  return m;
}

// ---------- trophies & shirts ----------

const TROPHY_HEX: Record<string, string> = { champion: '#ffcf3d', cup: '#e3e8ee', runner_up: '#cfd6de', third: '#d08a4e', golden_boot: '#ffcf3d', playmaker: '#3dd6ff', golden_glove: '#ffcf3d', pots: '#c6ff3d' };

export function trophy(kind: string): THREE.Group {
  const g = new THREE.Group();
  const metal = mat(TROPHY_HEX[kind] ?? '#ffcf3d', { metal: 1, rough: 0.16 });
  g.add(at(box(0.18, 0.08, 0.18, mat('#1b1d21', { rough: 0.35, clear: true }), 0.01), 0, 0.04, 0));
  if (kind === 'golden_boot') {
    g.add(at(box(0.1, 0.1, 0.22, metal, 0.04), 0, 0.14, 0.02));
    g.add(at(box(0.1, 0.13, 0.09, metal, 0.035), 0, 0.23, -0.05));
  } else if (kind === 'golden_glove') {
    g.add(at(box(0.14, 0.2, 0.07, metal, 0.05), 0, 0.19, 0));
  } else if (kind === 'pots' || kind === 'playmaker') {
    g.add(at(cyl(0.018, 0.018, 0.1, metal, 8), 0, 0.13, 0));
    g.add(at(sphere(0.075, metal), 0, 0.25, 0));
  } else {
    const pts = [[0, 0], [0.05, 0], [0.025, 0.035], [0.02, 0.1], [0.085, 0.17], [0.1, 0.29], [0.092, 0.305]].map(([x, y]) => new THREE.Vector2(x, y));
    const cup = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), metal);
    cup.castShadow = true;
    cup.position.y = 0.08;
    if (kind === 'cup') cup.scale.set(1.12, 1.2, 1.12);
    g.add(cup);
    for (const s of [-1, 1]) g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.01, 6, 16, PI), metal), s * 0.1, 0.32, 0).rotateZ((s * PI) / 2));
  }
  return g;
}

export function shirtTexture(primary: string, secondary: string, number: number, club: string) {
  return canvasTex(256, 300, (g) => {
    const bg = g.createLinearGradient(0, 0, 0, 300);
    bg.addColorStop(0, '#f6f3ee');
    bg.addColorStop(1, '#e6e1d8');
    g.fillStyle = bg;
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

export function shirtFrame(c: { data: { primary?: string; secondary?: string; number?: number; club?: string } }) {
  const g = new THREE.Group();
  g.add(box(0.66, 0.8, 0.045, mat('#1a1c20', { rough: 0.3, clear: true }), 0.008));
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.72), new THREE.MeshStandardMaterial({ map: shirtTexture(c.data.primary ?? '#ffffff', c.data.secondary ?? '#111111', c.data.number ?? 10, c.data.club ?? ''), roughness: 0.8 }));
  p.position.z = 0.024;
  g.add(p);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.72), mat('#ffffff', { glass: true, opacity: 0.08 }));
  glass.position.z = 0.03;
  g.add(glass);
  return g;
}

/**
 * The trophy cabinet: a lit glass case on a low sideboard, with trophies on
 * two shelves and match balls on the base. An empty card waits for the first win.
 */
export function cabinet(len: number, trophies: { kind: string }[], balls: number): Prop {
  const g = new THREE.Group();
  const wood = mat('#24272c', { rough: 0.35, clear: true });
  const H = 2.0;
  const D = 0.45;
  g.add(at(box(len, 0.62, D, wood, 0.02), 0, 0.31, 0));
  g.add(at(box(len - 0.04, 0.02, D - 0.04, mat('#111214'), 0), 0, 0.05, 0));
  for (let i = 1; i < 3; i++) g.add(at(box(0.012, 0.5, 0.012, mat('#3a3d42'), 0), -len / 2 + (len * i) / 3, 0.36, D / 2 + 0.003));
  // Glass case: back panel, glass sides and front, two glass shelves, a light strip.
  g.add(at(box(len, H - 0.62, 0.03, mat('#2e3238', { rough: 0.8 }), 0), 0, 0.62 + (H - 0.62) / 2, -D / 2 + 0.03));
  const frame = mat('#16181b', { rough: 0.3, metal: 0.5 });
  for (const x of [-len / 2 + 0.015, len / 2 - 0.015]) g.add(at(box(0.03, H - 0.62, D, frame, 0), x, 0.62 + (H - 0.62) / 2, 0));
  g.add(at(box(len, 0.04, D, frame, 0), 0, H - 0.02, 0));
  const glass = mat('#dfefff', { glass: true, opacity: 0.12 });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(len - 0.04, H - 0.66), glass);
  front.position.set(0, 0.62 + (H - 0.66) / 2, D / 2 - 0.01);
  front.renderOrder = 2;
  g.add(front);
  const shelfY = [0.64, 1.1, 1.55];
  for (const y of shelfY.slice(1)) g.add(at(box(len - 0.06, 0.015, D - 0.08, mat('#e8f4ff', { glass: true, opacity: 0.3 }), 0), 0, y, 0.0));
  g.add(at(box(len - 0.06, 0.012, 0.012, mat('#fff6dd', { emissive: '#ffe7b0', glow: 2.6 }), 0), 0, H - 0.05, D / 2 - 0.06));
  const lights: THREE.PointLight[] = [];
  const l = warmLight('#ffe7b8', 0.9, 2.2);
  l.position.set(0, H - 0.25, 0.1);
  g.add(l);
  lights.push(l);
  const per = Math.max(3, Math.floor((len - 0.1) / 0.32));
  trophies.slice(0, per * 3).forEach((t, i) => {
    const shelf = Math.floor(i / per);
    const k = i % per;
    const n = Math.min(per, trophies.length - shelf * per);
    const x = (k - (n - 1) / 2) * Math.min(0.32, (len - 0.2) / n);
    g.add(at(trophy(t.kind), x, shelfY[2 - shelf] + 0.01, 0.02));
  });
  for (let i = 0; i < Math.min(balls, 4); i++) {
    const x = (i - (Math.min(balls, 4) - 1) / 2) * 0.34;
    g.add(at(cyl(0.07, 0.08, 0.04, mat('#c9ccd1', { metal: 1, rough: 0.25 }), 16), x, 0.64, 0.05));
    g.add(at(ball(0.11), x, 0.77, 0.05));
  }
  if (!trophies.length) {
    // A little card on the top shelf: the first trophy goes here.
    const t = canvasTex(256, 128, (c) => {
      c.fillStyle = '#f2efe9'; c.fillRect(0, 0, 256, 128);
      c.fillStyle = '#16181b'; c.font = '800 30px system-ui, sans-serif'; c.textAlign = 'center';
      c.fillText('RESERVED', 128, 62);
      c.font = '600 20px system-ui, sans-serif'; c.fillText('for your first trophy', 128, 96);
    });
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.15), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
    card.position.set(0, shelfY[2] + 0.1, 0.02);
    card.rotation.x = -0.15;
    g.add(card);
  }
  g.add(blob(len, D));
  return { obj: g, foot: [len, D + 0.05], use: { x: 0, z: 0.95, face: PI }, lights };
}

// ---------- fittings ----------

const WOOD = () => mat('#a77b52', { rough: 0.55 });
const WHITE = () => mat('#f2f0ec', { rough: 0.35, clear: true });
const STEEL = () => mat('#c9ccd1', { metal: 1, rough: 0.25 });
const DARK = () => mat('#1d2025', { rough: 0.4 });

function kitchen(len: number): Prop {
  const g = new THREE.Group();
  const front = mat('#3a4a5c', { rough: 0.35, clear: true });
  const top = mat('#ece8e1', { rough: 0.18, clear: true });
  const D = 0.62;
  // Tall fridge on the left end, then a run of base units and wall units.
  const fw = 0.72;
  g.add(at(box(fw, 2.05, D, mat('#d9dde2', { metal: 0.6, rough: 0.25 }), 0.02), -len / 2 + fw / 2, 1.025, 0));
  g.add(at(box(0.02, 0.6, 0.03, STEEL(), 0.008), -len / 2 + fw - 0.08, 1.2, D / 2 + 0.02));
  g.add(at(box(fw - 0.04, 0.008, 0.01, mat('#9aa1a8'), 0), -len / 2 + fw / 2, 1.42, D / 2 + 0.002));
  const bl = len - fw;
  const bx = -len / 2 + fw + bl / 2;
  g.add(at(box(bl, 0.82, D - 0.02, front, 0.01), bx, 0.43, -0.01));
  g.add(at(box(bl, 0.08, D - 0.08, mat('#111214'), 0), bx, 0.04, -0.03));
  g.add(at(box(bl + 0.02, 0.04, D + 0.02, top, 0.008), bx, 0.86, 0));
  const doors = Math.max(2, Math.round(bl / 0.6));
  for (let i = 0; i < doors; i++) {
    const x = -len / 2 + fw + (bl / doors) * (i + 0.5);
    g.add(at(box(0.012, 0.74, 0.012, mat('#2a3644'), 0), -len / 2 + fw + (bl / doors) * i, 0.45, D / 2 - 0.005));
    g.add(at(box(0.18, 0.02, 0.025, STEEL(), 0.008), x, 0.74, D / 2 + 0.005));
  }
  // Sink, hob and a tap.
  const sx = bx - bl * 0.18;
  g.add(at(box(0.5, 0.02, 0.38, mat('#9aa1a8', { metal: 1, rough: 0.2 }), 0.03), sx, 0.875, 0.02));
  g.add(tube([[sx, 0.88, -0.2], [sx, 1.15, -0.2], [sx, 1.2, -0.1], [sx, 1.1, -0.02]], 0.014, STEEL(), 12));
  const hx = bx + bl * 0.25;
  g.add(at(box(0.6, 0.012, 0.5, mat('#0d0e10', { rough: 0.1, clear: true }), 0.02), hx, 0.884, 0.0));
  for (const [dx, dz] of [[-0.14, -0.11], [0.14, -0.11], [-0.14, 0.11], [0.14, 0.11]]) g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.004, 6, 24), mat('#5a5f66')), hx + dx, 0.892, dz).rotateX(PI / 2));
  // Splashback and wall cabinets.
  g.add(at(box(bl, 0.6, 0.02, mat('#d6d0c6', { rough: 0.3, clear: true }), 0), bx, 1.18, -D / 2 + 0.01));
  g.add(at(box(bl, 0.68, 0.34, front, 0.01), bx, 1.86, -D / 2 + 0.17));
  for (let i = 1; i < doors; i++) g.add(at(box(0.012, 0.62, 0.012, mat('#2a3644'), 0), -len / 2 + fw + (bl / doors) * i, 1.86, -D / 2 + 0.345));
  g.add(at(box(bl - 0.1, 0.01, 0.02, mat('#fff6dd', { emissive: '#ffe7b0', glow: 2 }), 0), bx, 1.515, -D / 2 + 0.3));
  // A kettle, a fruit bowl and a chopping board.
  g.add(at(cyl(0.07, 0.08, 0.2, mat('#16181b', { rough: 0.3, clear: true }), 16), bx + bl * 0.42, 0.98, -0.12));
  g.add(at(box(0.36, 0.02, 0.24, WOOD(), 0.01), sx + 0.45, 0.89, 0.02, 0.2));
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 8, 0, PI * 2, PI / 2, PI / 2), mat('#e9e4da', { rough: 0.3 }));
  bowl.position.set(hx - 0.55, 0.99, -0.05);
  g.add(bowl);
  for (let i = 0; i < 4; i++) g.add(at(sphere(0.045, mat(['#ff9a3d', '#e9442f', '#c6e04d', '#ffcf3d'][i], { rough: 0.5 }), 10), hx - 0.55 + Math.cos(i * 1.6) * 0.05, 0.94, -0.05 + Math.sin(i * 1.6) * 0.05));
  g.add(blob(len, D));
  return { obj: g, foot: [len, D], use: { x: bx - bl * 0.18, z: 0.85, face: PI } };
}

function stool(): THREE.Group {
  const g = new THREE.Group();
  g.add(at(cyl(0.18, 0.17, 0.06, mat('#2a2f35', { rough: 0.5, sheen: true }), 20), 0, 0.72, 0));
  g.add(at(cyl(0.02, 0.02, 0.7, STEEL(), 8), 0, 0.36, 0));
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 6, 20), STEEL()), 0, 0.28, 0).rotateX(PI / 2));
  g.add(at(cyl(0.2, 0.22, 0.02, STEEL(), 20), 0, 0.01, 0));
  return g;
}

function island(len: number): Prop {
  const g = new THREE.Group();
  g.add(at(box(len, 0.86, 0.85, mat('#3a4a5c', { rough: 0.35, clear: true }), 0.01), 0, 0.43, -0.05));
  g.add(at(box(len + 0.2, 0.05, 1.05, mat('#ece8e1', { rough: 0.15, clear: true }), 0.01), 0, 0.885, 0.05));
  const n = Math.max(2, Math.round(len / 0.65));
  for (let i = 0; i < n; i++) g.add(at(stool(), (i - (n - 1) / 2) * (len / n), 0, 0.72));
  g.add(at(cyl(0.12, 0.12, 0.25, mat('#e9e4da', { rough: 0.3 }), 16), len * 0.32, 1.03, -0.1));
  g.add(at(sphere(0.12, mat('#4f8f3a', { rough: 0.6 }), 12), len * 0.32, 1.22, -0.1));
  g.add(blob(len + 0.2, 1.4));
  return { obj: g, foot: [len + 0.2, 1.5], use: { x: 0, z: 1.25, face: PI } };
}

function chair(): THREE.Group {
  const g = new THREE.Group();
  const seat = mat('#e9e4da', { rough: 0.85, sheen: true });
  const leg = mat('#2a2f35', { rough: 0.4 });
  g.add(at(box(0.44, 0.06, 0.44, seat, 0.02), 0, 0.46, 0));
  const back = at(box(0.42, 0.42, 0.05, seat, 0.02), 0, 0.7, -0.2);
  back.rotation.x = -0.12;
  g.add(back);
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) g.add(at(cyl(0.015, 0.015, 0.44, leg, 6), x, 0.22, z));
  return g;
}

function dining(seats: number): Prop {
  const g = new THREE.Group();
  const len = seats >= 6 ? 2.1 : 1.5;
  g.add(at(box(len, 0.05, 0.95, mat('#8a5f3c', { rough: 0.45, clear: true }), 0.015), 0, 0.75, 0));
  for (const x of [-len / 2 + 0.2, len / 2 - 0.2]) {
    g.add(at(box(0.06, 0.72, 0.7, mat('#2a2f35', { rough: 0.4 }), 0.01), x, 0.36, 0));
  }
  const per = seats / 2;
  for (let i = 0; i < per; i++) {
    const x = (i - (per - 1) / 2) * (len / per);
    g.add(at(chair(), x, 0, 0.62, PI));
    g.add(at(chair(), x, 0, -0.62, 0));
  }
  // Place settings and a vase.
  g.add(at(cyl(0.06, 0.05, 0.22, mat('#2a6b5c', { rough: 0.2, clear: true }), 16), 0, 0.885, 0));
  for (let i = 0; i < 3; i++) g.add(at(sphere(0.04, mat(['#ffcf3d', '#ff7a6b', '#f2f2f2'][i], { rough: 0.7 }), 8), (i - 1) * 0.04, 1.02 + (i % 2) * 0.03, 0.01));
  for (let i = 0; i < per; i++) {
    const x = (i - (per - 1) / 2) * (len / per);
    for (const z of [0.3, -0.3]) g.add(at(cyl(0.11, 0.09, 0.015, WHITE(), 20), x, 0.783, z));
  }
  g.add(blob(len + 0.3, 1.9, 0.8));
  return { obj: g, foot: [len + 0.1, 1.85], use: { x: len / 2 + 0.55, z: 0, face: -PI / 2 } };
}

function bed(width: number): Prop {
  const g = new THREE.Group();
  const L = 2.1;
  const frame = mat('#5b4636', { rough: 0.5 });
  g.add(at(box(width + 0.12, 0.3, L, frame, 0.03), 0, 0.2, 0));
  g.add(at(box(width + 0.16, 1.05, 0.12, mat('#3b4a5c', { rough: 0.9, sheen: true }), 0.05), 0, 0.58, -L / 2 + 0.06));
  g.add(at(box(width, 0.22, L - 0.15, mat('#f4f1ec', { rough: 0.9, sheen: true }), 0.08), 0, 0.45, 0.06));
  // Duvet folded back, two pillows, a throw.
  g.add(at(box(width + 0.04, 0.12, L * 0.62, mat('#d9dee6', { rough: 0.95, sheen: true }), 0.06), 0, 0.6, L * 0.17));
  g.add(at(box(width + 0.06, 0.13, 0.4, mat('#3b4a5c', { rough: 0.95, sheen: true }), 0.06), 0, 0.62, L * 0.36));
  for (const x of width > 1.3 ? [-width / 4, width / 4] : [0]) {
    const p = at(box(width > 1.3 ? width / 2 - 0.1 : width - 0.2, 0.14, 0.38, mat('#ffffff', { rough: 0.9, sheen: true }), 0.07), x, 0.62, -L / 2 + 0.36);
    p.rotation.x = -0.25;
    g.add(p);
  }
  g.add(blob(width + 0.3, L + 0.1));
  return { obj: g, foot: [width + 0.16, L], use: { x: width / 2 + 0.5, z: 0.3, face: -PI / 2 } };
}

function nightstand(): Prop {
  const g = new THREE.Group();
  g.add(at(box(0.48, 0.5, 0.42, WOOD(), 0.02), 0, 0.25, 0));
  g.add(at(box(0.44, 0.01, 0.01, mat('#5b4636'), 0), 0, 0.28, 0.21));
  g.add(at(cyl(0.07, 0.09, 0.05, DARK(), 16), 0, 0.525, -0.05));
  g.add(at(cyl(0.012, 0.012, 0.22, STEEL(), 8), 0, 0.64, -0.05));
  const shade = cyl(0.11, 0.14, 0.16, mat('#f4ead8', { rough: 0.8, emissive: '#ffd9a0', glow: 0.5 }), 20);
  g.add(at(shade, 0, 0.8, -0.05));
  const l = warmLight('#ffd9a0', 0.9, 2.5);
  l.position.set(0, 0.85, 0.1);
  g.add(l);
  g.add(blob(0.48, 0.42));
  return { obj: g, foot: [0.48, 0.42], lights: [l] };
}

function wardrobe(len: number): Prop {
  const g = new THREE.Group();
  const front = mat('#e9e4da', { rough: 0.4, clear: true });
  g.add(at(box(len, 2.15, 0.6, front, 0.015), 0, 1.075, 0));
  const n = Math.max(2, Math.round(len / 0.55));
  for (let i = 1; i < n; i++) g.add(at(box(0.008, 2.05, 0.01, mat('#b8b1a3'), 0), -len / 2 + (len / n) * i, 1.075, 0.301));
  for (let i = 0; i < n; i++) g.add(at(box(0.02, 0.3, 0.025, STEEL(), 0.008), -len / 2 + (len / n) * (i + (i % 2 ? 0.12 : 0.88)), 1.1, 0.31));
  g.add(blob(len, 0.6));
  return { obj: g, foot: [len, 0.6], use: { x: 0, z: 0.9, face: PI } };
}

function desk(len: number): Prop {
  const g = new THREE.Group();
  g.add(at(box(len, 0.04, 0.7, mat('#16181b', { rough: 0.3, clear: true }), 0.01), 0, 0.74, 0));
  for (const x of [-len / 2 + 0.05, len / 2 - 0.05]) g.add(at(box(0.05, 0.72, 0.62, mat('#2a2f35', { metal: 0.6, rough: 0.3 }), 0.01), x, 0.36, 0));
  // Two monitors, a keyboard and an RGB strip.
  for (const [x, ry] of [[-0.3, 0.18], [0.3, -0.18]] as const) {
    const m = new THREE.Group();
    m.add(at(box(0.56, 0.33, 0.03, mat('#0c0d0f', { rough: 0.3 }), 0.01), 0, 0.3, 0));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.29), new THREE.MeshBasicMaterial({ color: x < 0 ? '#2d6b4a' : '#29406b', toneMapped: false }));
    scr.position.set(0, 0.3, 0.016);
    m.add(scr);
    m.add(at(box(0.04, 0.16, 0.04, DARK(), 0.01), 0, 0.08, -0.03));
    m.add(at(box(0.2, 0.012, 0.16, DARK(), 0.005), 0, 0.006, -0.03));
    g.add(at(m, x, 0.76, -0.18, ry));
  }
  g.add(at(box(0.44, 0.02, 0.14, mat('#2a2f35'), 0.005), 0, 0.77, 0.12));
  g.add(at(box(len - 0.1, 0.012, 0.012, mat('#c6ff3d', { emissive: '#c6ff3d', glow: 2.5 }), 0), 0, 0.715, 0.34));
  // A gaming chair pushed in.
  const c = new THREE.Group();
  const lime = mat('#c6ff3d', { rough: 0.5 });
  const black = mat('#1d2025', { rough: 0.6, sheen: true });
  c.add(at(box(0.5, 0.1, 0.5, black, 0.04), 0, 0.5, 0));
  c.add(at(box(0.5, 0.75, 0.1, black, 0.05), 0, 0.92, 0.25).rotateX(0.12));
  c.add(at(box(0.08, 0.6, 0.02, lime, 0.01), 0, 0.95, 0.31).rotateX(0.12));
  c.add(at(cyl(0.03, 0.03, 0.4, STEEL(), 8), 0, 0.26, 0));
  for (let i = 0; i < 5; i++) c.add(at(box(0.3, 0.03, 0.04, DARK(), 0.01), Math.sin((i * PI * 2) / 5) * 0.14, 0.05, Math.cos((i * PI * 2) / 5) * 0.14, (i * PI * 2) / 5 + PI / 2));
  g.add(at(c, 0, 0, 0.62, 0));
  g.add(blob(len, 1.2, 0.8));
  return { obj: g, foot: [len, 1.3], use: { x: 0, z: 1.1, face: PI } };
}

function bookshelf(len: number): Prop {
  const g = new THREE.Group();
  const wood = mat('#2a2f35', { rough: 0.4, clear: true });
  const H = 2.0;
  g.add(at(box(len, H, 0.04, wood, 0), 0, H / 2, -0.15));
  for (const x of [-len / 2 + 0.02, len / 2 - 0.02]) g.add(at(box(0.04, H, 0.34, wood, 0.005), x, H / 2, 0));
  const r = rand(len * 100);
  const cols = ['#c8102e', '#f2efe9', '#2a4a7a', '#e3b65a', '#3f8f3a', '#16181b', '#ff7a3d'];
  for (let s = 0; s < 5; s++) {
    const y = 0.02 + s * 0.42;
    g.add(at(box(len - 0.04, 0.03, 0.32, wood, 0), 0, y, 0));
    if (s === 4) break;
    let x = -len / 2 + 0.08;
    while (x < len / 2 - 0.12) {
      if (r() < 0.12) {
        x += 0.18;
        continue;
      }
      const bw = 0.03 + r() * 0.04;
      const bh = 0.24 + r() * 0.1;
      g.add(at(box(bw, bh, 0.22, mat(cols[(r() * cols.length) | 0], { rough: 0.7 }), 0.004), x + bw / 2, y + 0.015 + bh / 2, 0));
      x += bw + 0.004;
    }
  }
  g.add(at(ball(0.11), len / 2 - 0.2, 0.42 * 2 + 0.14, 0.02));
  g.add(blob(len, 0.36));
  return { obj: g, foot: [len, 0.36], use: { x: 0, z: 0.8, face: PI } };
}

function shower(): Prop {
  const g = new THREE.Group();
  g.add(at(box(0.9, 0.06, 0.9, WHITE(), 0.02), 0, 0.03, 0));
  const glass = mat('#dff2ff', { glass: true, opacity: 0.18 });
  const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.0), glass);
  p1.position.set(0, 1.06, 0.45);
  g.add(p1);
  const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 2.0), glass);
  p2.position.set(-0.45, 1.06, 0);
  p2.rotation.y = PI / 2;
  g.add(p2);
  g.add(at(box(0.9, 0.02, 0.02, STEEL(), 0), 0, 2.06, 0.45));
  g.add(at(box(0.02, 0.02, 0.9, STEEL(), 0), -0.45, 2.06, 0));
  g.add(tube([[0.3, 1.0, -0.43], [0.3, 1.9, -0.43], [0.3, 2.0, -0.3], [0.3, 1.95, -0.2]], 0.015, STEEL(), 12));
  g.add(at(cyl(0.1, 0.1, 0.02, STEEL(), 20), 0.3, 1.93, -0.2));
  g.add(at(box(0.9, 2.0, 0.02, mat('#dcd6cc', { rough: 0.25, clear: true }), 0), 0, 1.06, -0.44));
  return { obj: g, foot: [0.9, 0.9] };
}

function toilet(): Prop {
  const g = new THREE.Group();
  const w = WHITE();
  g.add(at(box(0.38, 0.4, 0.18, w, 0.04), 0, 0.6, -0.22));
  g.add(at(cyl(0.16, 0.12, 0.38, w, 20), 0, 0.2, 0.02));
  const seat = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 8, 24), w);
  seat.rotation.x = PI / 2;
  seat.scale.set(1, 1.25, 1);
  seat.position.set(0, 0.41, 0.04);
  g.add(seat);
  g.add(blob(0.4, 0.6));
  return { obj: g, foot: [0.42, 0.6] };
}

function vanity(len: number): Prop {
  const g = new THREE.Group();
  g.add(at(box(len, 0.45, 0.48, WOOD(), 0.015), 0, 0.62, 0));
  g.add(at(box(len + 0.02, 0.03, 0.5, mat('#f2efe9', { rough: 0.15, clear: true }), 0.005), 0, 0.86, 0));
  g.add(at(cyl(0.2, 0.15, 0.12, WHITE(), 24), 0, 0.93, 0.02));
  g.add(tube([[0, 0.88, -0.2], [0, 1.08, -0.2], [0, 1.1, -0.1]], 0.012, STEEL(), 8));
  g.add(at(box(Math.min(0.8, len - 0.1), 0.7, 0.02, mat('#cfe3ef', { metal: 1, rough: 0.05 }), 0.01), 0, 1.5, -0.23));
  g.add(at(box(Math.min(0.8, len - 0.1), 0.012, 0.03, mat('#fff6dd', { emissive: '#ffe7b0', glow: 2 }), 0), 0, 1.87, -0.21));
  g.add(blob(len, 0.5));
  return { obj: g, foot: [len, 0.5] };
}

function bathtub(): Prop {
  const g = new THREE.Group();
  const w = WHITE();
  const L = 1.7;
  g.add(at(box(0.8, 0.55, L, w, 0.12), 0, 0.29, 0));
  g.add(at(box(0.62, 0.04, L - 0.2, mat('#9fd3e6', { rough: 0.05, glass: true, opacity: 0.6 }), 0.1), 0, 0.5, 0));
  g.add(tube([[0, 0.55, -L / 2 + 0.05], [0, 0.78, -L / 2 + 0.05], [0, 0.8, -L / 2 + 0.2]], 0.015, STEEL(), 8));
  g.add(at(box(0.12, 0.05, 0.09, mat('#ffcf3d', { rough: 0.4 }), 0.02), 0.15, 0.55, 0.3));
  g.add(blob(0.8, L));
  return { obj: g, foot: [0.8, L] };
}

function piano(): Prop {
  const g = new THREE.Group();
  const black = mat('#0c0d0f', { rough: 0.08, clear: true });
  const shape = new THREE.Shape();
  shape.moveTo(-0.75, -0.75);
  shape.lineTo(0.75, -0.75);
  shape.lineTo(0.75, 0.2);
  shape.bezierCurveTo(0.75, 0.9, 0.1, 0.8, -0.05, 1.05);
  shape.bezierCurveTo(-0.2, 1.3, -0.75, 1.2, -0.75, 0.8);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.32, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2 });
  geo.rotateX(PI / 2);
  const body = new THREE.Mesh(geo, black);
  body.position.y = 1.0;
  body.castShadow = body.receiveShadow = true;
  g.add(body);
  for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.3, 0.9]]) g.add(at(cyl(0.05, 0.04, 0.68, black, 12), x, 0.34, -z));
  g.add(at(box(1.5, 0.05, 0.18, mat('#f7f5f0', { rough: 0.3 }), 0.005), 0, 0.72, 0.84));
  for (let i = 0; i < 18; i++) g.add(at(box(0.04, 0.03, 0.1, black, 0), -0.68 + i * 0.08, 0.75, 0.8));
  g.add(at(box(0.8, 0.06, 0.35, black, 0.02), 0, 0.48, 1.3));
  // Lid propped open.
  const lid = at(box(1.2, 0.02, 1.4, black, 0.005), 0, 1.35, -0.2);
  lid.rotation.z = 0.5;
  g.add(lid);
  g.add(blob(1.6, 2.2));
  return { obj: g, foot: [1.6, 2.2], use: { x: 0, z: 1.75, face: PI } };
}

function treadmill(): Prop {
  const g = new THREE.Group();
  g.add(at(box(0.8, 0.18, 1.8, DARK(), 0.04), 0, 0.09, 0));
  g.add(at(box(0.56, 0.02, 1.5, mat('#2a2d33', { rough: 0.9 }), 0), 0, 0.185, 0.05));
  for (const x of [-0.36, 0.36]) g.add(at(box(0.05, 1.1, 0.05, STEEL(), 0.01), x, 0.68, 0.72).rotateX(-0.2));
  g.add(at(box(0.7, 0.3, 0.12, DARK(), 0.03), 0, 1.25, 0.86));
  g.add(at(box(0.3, 0.16, 0.01, mat('#3dd6ff', { emissive: '#3dd6ff', glow: 1.4 }), 0), 0, 1.27, 0.795));
  g.add(blob(0.8, 1.8));
  return { obj: g, foot: [0.8, 1.9] };
}

function weights(len: number): Prop {
  const g = new THREE.Group();
  for (const x of [-len / 2 + 0.05, len / 2 - 0.05]) g.add(at(box(0.06, 1.0, 0.4, DARK(), 0.01), x, 0.5, 0));
  for (const y of [0.25, 0.6]) g.add(at(box(len, 0.04, 0.4, DARK(), 0.01), 0, y, 0));
  const r = rand(7);
  for (const y of [0.3, 0.65]) {
    for (let i = 0; i < 5; i++) {
      const x = -len / 2 + 0.2 + i * ((len - 0.4) / 4);
      const s = 0.06 + r() * 0.04;
      const d = new THREE.Group();
      d.add(at(cyl(0.015, 0.015, 0.3, STEEL(), 8), 0, 0, 0).rotateX(PI / 2));
      for (const z of [-0.12, 0.12]) d.add(at(cyl(s, s, 0.06, mat('#16181b', { rough: 0.5 }), 6), 0, 0, z).rotateX(PI / 2));
      g.add(at(d, x, y + s, 0));
    }
  }
  // A mat and a kettlebell in front.
  g.add(at(box(0.8, 0.02, 1.6, mat('#2f6b4a', { rough: 0.95 }), 0.01), 0, 0.01, 1.1));
  g.add(at(sphere(0.12, mat('#c8102e', { rough: 0.5 }), 12), 0.5, 0.12, 0.45));
  g.add(blob(len, 0.45));
  return { obj: g, foot: [len, 0.45], use: { x: 0, z: 1.0, face: PI } };
}

function consoleTable(len: number): Prop {
  const g = new THREE.Group();
  g.add(at(box(len, 0.04, 0.34, WOOD(), 0.01), 0, 0.82, 0));
  for (const x of [-len / 2 + 0.06, len / 2 - 0.06]) for (const z of [-0.12, 0.12]) g.add(at(cyl(0.02, 0.015, 0.8, mat('#16181b'), 8), x, 0.4, z));
  // Round mirror above, a bowl for keys, a small plant.
  const mirror = new THREE.Mesh(new THREE.CircleGeometry(0.38, 40), mat('#cfe3ef', { metal: 1, rough: 0.04 }));
  mirror.position.set(0, 1.55, -0.155);
  g.add(mirror);
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.02, 8, 48), mat('#c9a24a', { metal: 1, rough: 0.25 })), 0, 1.55, -0.15));
  g.add(at(cyl(0.1, 0.06, 0.05, mat('#16181b', { rough: 0.3 }), 16), -len / 4, 0.865, 0));
  g.add(at(cyl(0.06, 0.05, 0.14, mat('#e9e4da'), 12), len / 3, 0.91, 0));
  g.add(at(sphere(0.1, mat('#4f8f3a', { rough: 0.6 }), 10), len / 3, 1.04, 0));
  g.add(blob(len, 0.34));
  return { obj: g, foot: [len, 0.36] };
}

function coatrack(): Prop {
  const g = new THREE.Group();
  g.add(at(cyl(0.18, 0.2, 0.03, mat('#16181b'), 20), 0, 0.015, 0));
  g.add(at(cyl(0.02, 0.02, 1.75, mat('#16181b', { metal: 0.6, rough: 0.3 }), 8), 0, 0.88, 0));
  // A scarf in club colours and a jacket.
  g.add(at(box(0.3, 0.55, 0.14, mat('#2a2f35', { rough: 0.9, sheen: true }), 0.06), 0.1, 1.35, 0.05));
  g.add(at(box(0.08, 0.7, 0.03, mat('#c6ff3d', { rough: 0.9 }), 0.01), -0.08, 1.3, 0.1));
  g.add(blob(0.36, 0.36));
  return { obj: g, foot: [0.4, 0.4] };
}

function lounger(): Prop {
  const g = new THREE.Group();
  const frame = mat('#f2efe9', { rough: 0.4 });
  const pad = mat('#e9e4da', { rough: 0.95, sheen: true });
  g.add(at(box(0.7, 0.08, 1.4, frame, 0.03), 0, 0.3, 0.2));
  g.add(at(box(0.62, 0.08, 1.35, pad, 0.04), 0, 0.37, 0.22));
  const back = at(box(0.62, 0.08, 0.7, pad, 0.04), 0, 0.55, -0.68);
  back.rotation.x = 0.75;
  g.add(back);
  for (const z of [-0.35, 0.8]) g.add(at(box(0.66, 0.28, 0.06, frame, 0.01), 0, 0.14, z));
  g.add(at(box(0.5, 0.02, 0.8, mat('#3dd6ff', { rough: 0.9 }), 0.01), 0, 0.42, 0.3));
  g.add(blob(0.8, 1.9, 0.7));
  return { obj: g, foot: [0.75, 1.9] };
}

function umbrella(): Prop {
  const g = new THREE.Group();
  g.add(at(cyl(0.2, 0.22, 0.06, mat('#3a3d42'), 16), 0, 0.03, 0));
  g.add(at(cyl(0.025, 0.025, 2.3, mat('#f2efe9'), 8), 0, 1.15, 0));
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.45, 8, 1, true), mat('#f4efe6', { rough: 0.9, sheen: true }));
  (canopy.material as THREE.Material).side = THREE.DoubleSide;
  canopy.position.y = 2.2;
  canopy.castShadow = true;
  g.add(canopy);
  return { obj: g, foot: [0.3, 0.3] };
}

function waterTex() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#3fb5d6';
    g.fillRect(0, 0, 256, 256);
    const r = rand(9);
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = 2;
    for (let i = 0; i < 40; i++) {
      g.beginPath();
      const x = r() * 256;
      const y = r() * 256;
      g.moveTo(x, y);
      g.bezierCurveTo(x + 10, y - 8, x + 24, y + 8, x + 36, y);
      g.stroke();
    }
  }, [2, 1]);
}

function pool(w: number, d: number): Prop {
  const g = new THREE.Group();
  const tile = mat('#e9f2f5', { rough: 0.3 });
  // A sunken basin: coping around the edge, tiled walls and floor, and the water.
  const coping = mat('#f4efe6', { rough: 0.5 });
  g.add(at(box(w + 0.5, 0.06, 0.25, coping, 0.02), 0, 0.03, -d / 2 - 0.125));
  g.add(at(box(w + 0.5, 0.06, 0.25, coping, 0.02), 0, 0.03, d / 2 + 0.125));
  g.add(at(box(0.25, 0.06, d, coping, 0.02), -w / 2 - 0.125, 0.03, 0));
  g.add(at(box(0.25, 0.06, d, coping, 0.02), w / 2 + 0.125, 0.03, 0));
  const inner = new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, d), [tile, tile, mat('#000000'), tile, tile, tile]);
  (inner.material as THREE.Material[]).forEach((m) => (m.side = THREE.BackSide));
  inner.position.y = -0.6;
  inner.receiveShadow = true;
  g.add(inner);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: waterTex(), color: '#7fd9ef', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.82, envMapIntensity: 1.8 }));
  water.rotation.x = -PI / 2;
  water.position.y = -0.12;
  water.userData.water = true;
  g.add(water);
  const glow = warmLight('#7fe9ff', 0.6, 5);
  glow.position.set(0, -0.3, 0);
  g.add(glow);
  // Steps and a ladder.
  g.add(tube([[w / 2 - 0.4, -0.5, -d / 2 + 0.04], [w / 2 - 0.4, 0.3, -d / 2 + 0.04], [w / 2 - 0.4, 0.4, -d / 2 - 0.15]], 0.02, STEEL(), 10));
  g.add(tube([[w / 2 - 0.9, -0.5, -d / 2 + 0.04], [w / 2 - 0.9, 0.3, -d / 2 + 0.04], [w / 2 - 0.9, 0.4, -d / 2 - 0.15]], 0.02, STEEL(), 10));
  return { obj: g, foot: [w + 0.3, d + 0.3], use: { x: 0, z: d / 2 + 0.55, face: PI }, lights: [glow] };
}

function hottub(): Prop {
  const g = new THREE.Group();
  const wood = mat('#6b4a32', { rough: 0.6 });
  // A wooden surround with a step, the shell inside and glowing water.
  for (const [x, z, w, d] of [[0, -1.0, 2.2, 0.2], [0, 1.0, 2.2, 0.2], [-1.0, 0, 0.2, 1.8], [1.0, 0, 0.2, 1.8]] as const) g.add(at(box(w, 0.8, d, wood, 0.04), x, 0.4, z));
  g.add(at(box(1.8, 0.5, 1.8, mat('#e9f2f5', { rough: 0.3 }), 0.1), 0, 0.25, 0));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.8), new THREE.MeshStandardMaterial({ color: '#5fd6ec', emissive: '#1d7f94', emissiveIntensity: 0.8, roughness: 0.05, transparent: true, opacity: 0.88 }));
  water.rotation.x = -PI / 2;
  water.position.y = 0.68;
  water.userData.water = true;
  g.add(water);
  g.add(at(box(0.6, 0.22, 0.4, wood, 0.04), 0, 0.11, 1.3));
  for (const [x, z] of [[-0.8, -0.8], [0.8, -0.8]]) g.add(at(box(0.3, 0.06, 0.3, mat('#f2efe9', { rough: 0.9, sheen: true }), 0.03), x, 0.83, z));
  const glow = warmLight('#6fe7ff', 0.8, 4);
  glow.position.set(0, 0.9, 0);
  g.add(glow);
  g.add(blob(2.3, 2.3));
  return { obj: g, foot: [2.3, 2.7], use: { x: 0, z: 1.75, face: PI }, lights: [glow] };
}

export function palm(seed = 1, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const r = rand(seed * 31 + 3);
  const lean = 0.4 + r() * 0.5;
  const h = (4.2 + r() * 1.5) * scale;
  const trunk = mat('#9a7a52', { rough: 0.9 });
  g.add(tube([[0, 0, 0], [lean * 0.2, h * 0.4, 0], [lean * 0.6, h * 0.75, 0], [lean, h, 0]], 0.12 * scale, trunk, 20));
  const leaf = mat('#3f8f3a', { rough: 0.6, sheen: true });
  for (let i = 0; i < 9; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, PI * 2, 0, 0.5), leaf);
    l.scale.set(0.35 * scale, 1.0 * scale, 1.7 * scale);
    l.position.set(lean, h, 0);
    l.rotation.set(1.2 + r() * 0.35, (i / 9) * PI * 2 + r() * 0.3, 0, 'YXZ');
    l.castShadow = true;
    g.add(l);
  }
  g.add(at(sphere(0.18 * scale, mat('#6b4a2e', { rough: 0.8 }), 10), lean, h - 0.15, 0));
  return g;
}

export function tree(seed = 1, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const r = rand(seed * 17 + 5);
  const trunk = mat('#6b5236', { rough: 0.9 });
  const h = (2.2 + r() * 0.8) * scale;
  g.add(tube([[0, 0, 0], [0.05, h * 0.5, 0.02], [-0.04, h, 0.03]], 0.13 * scale, trunk, 10));
  const greens = ['#3f8f3a', '#4fa24a', '#357a33'];
  for (let i = 0; i < 7; i++) {
    const s = (0.75 + r() * 0.5) * scale;
    const b = sphere(s, mat(greens[i % 3], { rough: 0.75, sheen: true }), 14);
    const a = r() * PI * 2;
    b.position.set(Math.cos(a) * 0.6 * scale, h + (r() - 0.3) * 0.9 * scale, Math.sin(a) * 0.6 * scale);
    b.scale.y = 0.85;
    g.add(b);
  }
  return g;
}

function bush(seed = 1): THREE.Group {
  const g = new THREE.Group();
  const r = rand(seed * 13 + 1);
  for (let i = 0; i < 4; i++) {
    const b = sphere(0.35 + r() * 0.2, mat(i % 2 ? '#3f8f3a' : '#4a9a3f', { rough: 0.8, sheen: true }), 12);
    b.position.set((r() - 0.5) * 0.6, 0.3 + r() * 0.15, (r() - 0.5) * 0.6);
    g.add(b);
  }
  return g;
}

function hedge(len: number): Prop {
  const g = new THREE.Group();
  const m = mat('#3a7d35', { rough: 0.95, sheen: true });
  g.add(at(box(len, 0.95, 0.6, m, 0.25), 0, 0.475, 0));
  const r = rand(len * 10);
  for (let x = -len / 2 + 0.4; x < len / 2 - 0.3; x += 0.7) g.add(at(sphere(0.3, m, 10), x + r() * 0.2, 0.95, (r() - 0.5) * 0.2));
  return { obj: g, foot: [len, 0.6] };
}

export function goal(w: number): Prop {
  const g = new THREE.Group();
  const post = mat('#ffffff', { rough: 0.3 });
  const h = w * 0.45;
  const d = w * 0.4;
  for (const x of [-w / 2, w / 2]) g.add(at(cyl(0.03, 0.03, h, post, 10), x, h / 2, 0));
  g.add(at(cyl(0.03, 0.03, w, post, 10), 0, h, 0).rotateZ(PI / 2));
  for (const x of [-w / 2, w / 2]) g.add(tube([[x, h, 0], [x, h * 0.85, -d * 0.6], [x, 0.02, -d]], 0.02, post, 10));
  g.add(at(cyl(0.02, 0.02, w, post, 8), 0, 0.02, -d).rotateZ(PI / 2));
  const net = canvasTex(64, 64, (c) => {
    c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.lineWidth = 2;
    for (let i = 0; i <= 64; i += 8) {
      c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 64); c.stroke();
      c.beginPath(); c.moveTo(0, i); c.lineTo(64, i); c.stroke();
    }
  }, [w * 3, h * 3]);
  const nm = new THREE.MeshStandardMaterial({ map: net, transparent: true, side: THREE.DoubleSide, roughness: 1, depthWrite: false });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, Math.hypot(h, d)), nm);
  back.position.set(0, h / 2, -d / 2);
  back.rotation.x = -Math.atan2(d, h);
  g.add(back);
  g.add(at(ball(0.11), w * 0.2, 0.11, 0.9));
  return { obj: g, foot: [w + 0.1, d + 0.1], use: { x: 0, z: 1.6, face: PI } };
}

function bbq(): Prop {
  const g = new THREE.Group();
  g.add(at(box(0.9, 0.85, 0.55, mat('#2a2f35', { rough: 0.35, metal: 0.4 }), 0.02), 0, 0.43, 0));
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.8, 20, 1, false, 0, PI), mat('#16181b', { rough: 0.3, metal: 0.5 }));
  lid.rotation.z = PI / 2;
  lid.position.set(0, 0.86, 0);
  lid.castShadow = true;
  g.add(lid);
  g.add(blob(0.9, 0.55));
  return { obj: g, foot: [0.9, 0.6], use: { x: 0, z: 0.85, face: PI } };
}

function bench(): Prop {
  const g = new THREE.Group();
  const wood = mat('#9a6a3c', { rough: 0.7 });
  const iron = mat('#2a2f35', { rough: 0.5, metal: 0.4 });
  for (let i = 0; i < 3; i++) g.add(at(box(1.6, 0.04, 0.12, wood, 0.01), 0, 0.45, -0.15 + i * 0.14));
  for (let i = 0; i < 2; i++) g.add(at(box(1.6, 0.1, 0.03, wood, 0.01), 0, 0.62 + i * 0.14, -0.25).rotateX(-0.15));
  for (const x of [-0.7, 0.7]) g.add(at(box(0.05, 0.45, 0.45, iron, 0.01), x, 0.22, 0));
  g.add(blob(1.6, 0.5));
  return { obj: g, foot: [1.6, 0.5] };
}

function streetlamp(): Prop {
  const g = new THREE.Group();
  const iron = mat('#1d2025', { rough: 0.4, metal: 0.5 });
  g.add(at(cyl(0.08, 0.12, 0.3, iron, 12), 0, 0.15, 0));
  g.add(at(cyl(0.05, 0.06, 3.6, iron, 10), 0, 1.9, 0));
  g.add(at(cyl(0.18, 0.1, 0.32, iron, 8), 0, 3.8, 0));
  g.add(at(cyl(0.13, 0.13, 0.24, mat('#fff4d6', { emissive: '#ffdca0', glow: 2.2 }), 8), 0, 3.6, 0));
  const l = warmLight('#ffcf8a', 0, 9);
  l.userData.night = 6;
  l.position.set(0, 3.4, 0);
  g.add(l);
  return { obj: g, foot: [0.3, 0.3], lights: [l] };
}

function patio(): Prop {
  const g = new THREE.Group();
  const iron = mat('#2a2f35', { rough: 0.5 });
  g.add(at(cyl(0.45, 0.45, 0.03, mat('#f2efe9', { rough: 0.3 }), 28), 0, 0.73, 0));
  g.add(at(cyl(0.03, 0.03, 0.72, iron, 8), 0, 0.36, 0));
  g.add(at(cyl(0.25, 0.25, 0.02, iron, 16), 0, 0.01, 0));
  for (const a of [0.4, PI + 0.4]) {
    const c = chair();
    c.position.set(Math.sin(a) * 0.75, 0, Math.cos(a) * 0.75);
    c.rotation.y = a + PI;
    g.add(c);
  }
  g.add(at(cyl(0.04, 0.035, 0.12, mat('#c8e6f0', { glass: true, opacity: 0.4 }), 12), 0.1, 0.81, 0.05));
  g.add(blob(1.6, 1.6, 0.6));
  return { obj: g, foot: [1.7, 1.7] };
}

function planter(len: number): Prop {
  const g = new THREE.Group();
  g.add(at(box(len, 0.55, 0.45, mat('#3a3d42', { rough: 0.6 }), 0.03), 0, 0.275, 0));
  const r = rand(len * 7);
  for (let x = -len / 2 + 0.2; x < len / 2 - 0.1; x += 0.3) {
    const b = sphere(0.18 + r() * 0.08, mat(r() < 0.25 ? '#e0605a' : '#4a9a3f', { rough: 0.8, sheen: true }), 10);
    b.position.set(x, 0.62 + r() * 0.1, (r() - 0.5) * 0.15);
    g.add(b);
  }
  g.add(blob(len, 0.45));
  return { obj: g, foot: [len, 0.5] };
}

function fence(len: number): Prop {
  const g = new THREE.Group();
  const wood = mat('#c9b48a', { rough: 0.8 });
  for (let x = -len / 2; x <= len / 2; x += 0.16) g.add(at(box(0.1, 1.0, 0.03, wood, 0.01), x, 0.5, 0));
  for (const y of [0.25, 0.8]) g.add(at(box(len, 0.06, 0.03, wood, 0.01), 0, y, -0.03));
  return { obj: g, foot: [len, 0.2] };
}

function railing(len: number): Prop {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.0), mat('#dff2ff', { glass: true, opacity: 0.16 }));
  glass.position.y = 0.55;
  (glass.material as THREE.Material).side = THREE.DoubleSide;
  g.add(glass);
  g.add(at(box(len, 0.05, 0.07, STEEL(), 0.015), 0, 1.06, 0));
  for (let x = -len / 2; x <= len / 2 + 0.01; x += 1.5) g.add(at(box(0.05, 1.06, 0.05, STEEL(), 0.01), x, 0.53, 0));
  return { obj: g, foot: [len, 0.2] };
}

function bin(): Prop {
  const g = new THREE.Group();
  g.add(at(box(0.55, 1.0, 0.6, mat('#2f6b4a', { rough: 0.5 }), 0.04), 0, 0.5, 0));
  g.add(at(box(0.6, 0.06, 0.65, mat('#2a5a3e', { rough: 0.5 }), 0.02), 0, 1.03, 0));
  g.add(blob(0.55, 0.6));
  return { obj: g, foot: [0.6, 0.65] };
}

export function fixture(f: Fixture): Prop {
  switch (f.kind) {
    case 'kitchen': return kitchen(f.w ?? 3);
    case 'island': return island(f.w ?? 2);
    case 'dining': return dining(f.w ?? 4);
    case 'bed': return bed(f.w ?? 1.6);
    case 'nightstand': return nightstand();
    case 'wardrobe': return wardrobe(f.w ?? 1.6);
    case 'desk': return desk(f.w ?? 1.4);
    case 'bookshelf': return bookshelf(f.w ?? 1.2);
    case 'shower': return shower();
    case 'toilet': return toilet();
    case 'vanity': return vanity(f.w ?? 0.8);
    case 'bathtub': return bathtub();
    case 'piano': return piano();
    case 'treadmill': return treadmill();
    case 'weights': return weights(f.w ?? 1.4);
    case 'console': return consoleTable(f.w ?? 1);
    case 'coatrack': return coatrack();
    case 'lounger': return lounger();
    case 'umbrella': return umbrella();
    case 'pool': return pool(f.w ?? 6, f.d ?? 3);
    case 'hottub': return hottub();
    case 'palm': return { obj: palm(Math.round(f.x * 7 + f.z * 3)), foot: [0.5, 0.5] };
    case 'tree': return { obj: tree(Math.round(f.x * 5 + f.z * 11)), foot: [0.6, 0.6] };
    case 'bush': return { obj: bush(Math.round(f.x * 3 + f.z)), foot: [0.9, 0.9] };
    case 'hedge': return hedge(f.w ?? 4);
    case 'goal': return goal(f.w ?? 2);
    case 'bbq': return bbq();
    case 'bench': return bench();
    case 'streetlamp': return streetlamp();
    case 'patio': return patio();
    case 'planter': return planter(f.w ?? 1);
    case 'fence': return fence(f.w ?? 3);
    case 'railing': return railing(f.w ?? 3);
    case 'bin': return bin();
  }
}
