// Cars, shaped from a side silhouette per body style: wheel arches cut into
// the body, a glass greenhouse, pillars and a roof, proper wheels and lights.
import * as THREE from 'three';
import type { CarModel } from '../../../shared/life.ts';
import { at, blob, box, cyl, mat } from './kit.ts';

interface Shape {
  L: number;
  W: number;
  ride: number;
  R: number;
  zf: number;
  zr: number;
  hood: number;
  belt: number;
  deck: number;
  roof: number;
  /** Windscreen base, roof front, roof back, rear window base (z, front is +). */
  zA: number;
  zB: number;
  zC: number;
  zD: number;
}

const SHAPES: Record<CarModel['body'], Shape> = {
  hatch: { L: 3.7, W: 1.72, ride: 0.2, R: 0.31, zf: 1.22, zr: -1.18, hood: 0.8, belt: 0.95, deck: 0.98, roof: 1.48, zA: 0.72, zB: 0.2, zC: -1.4, zD: -1.78 },
  classic: { L: 3.9, W: 1.66, ride: 0.22, R: 0.32, zf: 1.3, zr: -1.25, hood: 0.74, belt: 0.82, deck: 0.8, roof: 1.2, zA: 0.38, zB: 0.06, zC: -0.72, zD: -1.08 },
  coupe: { L: 4.3, W: 1.8, ride: 0.16, R: 0.33, zf: 1.45, zr: -1.35, hood: 0.72, belt: 0.84, deck: 0.86, roof: 1.3, zA: 0.55, zB: -0.12, zC: -0.85, zD: -1.65 },
  suv: { L: 4.6, W: 1.9, ride: 0.3, R: 0.4, zf: 1.5, zr: -1.45, hood: 1.08, belt: 1.2, deck: 1.18, roof: 1.82, zA: 0.95, zB: 0.42, zC: -1.85, zD: -2.08 },
  gt: { L: 4.7, W: 1.92, ride: 0.13, R: 0.35, zf: 1.6, zr: -1.45, hood: 0.7, belt: 0.82, deck: 0.84, roof: 1.24, zA: 0.42, zB: -0.25, zC: -0.95, zD: -1.78 },
  hyper: { L: 4.6, W: 2.0, ride: 0.11, R: 0.36, zf: 1.55, zr: -1.4, hood: 0.62, belt: 0.76, deck: 0.92, roof: 1.12, zA: 0.6, zB: -0.05, zC: -0.62, zD: -1.6 },
};

const BEVEL = 0.07;

function extrude(pts: [number, number][], width: number, m: THREE.Material, bevel = BEVEL) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const depth = Math.max(0.01, width - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 10 });
  // Shape x is the car's length, the extrusion its width.
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2, 0, 0);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, m);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function arch(zw: number, R: number, y0: number, out: [number, number][]) {
  const Ra = R + 0.06;
  const phi = Math.asin(Math.min(0.99, (R - y0) / Ra));
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const t = Math.PI + phi - (i / n) * (Math.PI + 2 * phi);
    out.push([zw + Ra * Math.cos(t), R + Ra * Math.sin(t)]);
  }
}

function wheel(R: number, classic: boolean): THREE.Group {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(R - 0.1, 0.1, 12, 32), mat('#141516', { rough: 0.9 }));
  tyre.scale.z = 1.25;
  tyre.castShadow = true;
  g.add(tyre);
  g.add(cyl(R - 0.1, R - 0.1, 0.2, mat('#141516', { rough: 0.9 }), 28).rotateX(Math.PI / 2));
  const rim = mat(classic ? '#e8ecef' : '#a9b0b8', { metal: 1, rough: 0.22 });
  const face = cyl(R * 0.66, R * 0.66, 0.04, mat('#2a2d33', { metal: 0.6, rough: 0.4 }), 28).rotateX(Math.PI / 2);
  face.position.z = 0.1;
  g.add(face);
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(R * 0.64, 0.02, 6, 28), rim), 0, 0, 0.12));
  for (let i = 0; i < 5; i++) {
    const s = box(0.05, R * 1.2, 0.03, rim, 0.01);
    s.position.z = 0.12;
    s.rotation.z = (i / 5) * Math.PI;
    g.add(s);
  }
  g.add(at(cyl(0.06, 0.06, 0.04, rim, 12), 0, 0, 0.13).rotateX(Math.PI / 2));
  return g;
}

export function car(model: CarModel, color: string): THREE.Group {
  const s = SHAPES[model.body];
  const g = new THREE.Group();
  const paint = mat(color, { rough: 0.22, metal: 0.35, clear: true });
  const glass = mat('#141c24', { rough: 0.04, metal: 0.6 });
  const trim = mat('#16181b', { rough: 0.35 });
  const { L, W, ride, R, zf, zr, hood, belt, deck } = s;
  const y0 = ride + 0.04;
  // Lower body silhouette, counter-clockwise from the front bumper.
  const pts: [number, number][] = [
    [L / 2 - 0.16, y0], [L / 2 - 0.02, y0 + 0.14], [L / 2, hood - 0.16], [L / 2 - 0.1, hood - 0.04],
    [L / 2 - 0.45, hood], [s.zA, belt], [s.zD, belt], [-L / 2 + 0.28, deck], [-L / 2 + 0.04, deck - 0.1],
    [-L / 2, y0 + 0.2], [-L / 2 + 0.14, y0],
  ];
  arch(zr, R, y0, pts);
  arch(zf, R, y0, pts);
  const body = extrude(pts.map(([z, y]) => [z * (1 - BEVEL / L), y]), W, paint);
  g.add(body);
  // Glass greenhouse, a little narrower, with a painted roof and pillars.
  const gw = W - 0.26;
  g.add(extrude([[s.zA, belt - 0.02], [s.zB, s.roof - 0.03], [s.zC, s.roof - 0.03], [s.zD, belt - 0.02]], gw, glass, 0.05));
  const roofLen = s.zB - s.zC;
  g.add(at(box(gw - 0.06, 0.06, roofLen + 0.05, paint, 0.03), 0, s.roof - 0.01, (s.zB + s.zC) / 2));
  for (const sx of [-1, 1]) {
    // A-pillar, B-pillar and C-pillar on each side.
    const a = box(0.06, Math.hypot(s.zA - s.zB, s.roof - belt), 0.07, paint, 0.02);
    a.position.set(sx * (gw / 2 + 0.005), (s.roof + belt) / 2, (s.zA + s.zB) / 2);
    a.rotation.x = -Math.atan2(s.zA - s.zB, s.roof - belt);
    g.add(a);
    const c = box(0.06, Math.hypot(s.zC - s.zD, s.roof - belt), 0.16, paint, 0.02);
    c.position.set(sx * (gw / 2 + 0.005), (s.roof + belt) / 2, (s.zC + s.zD) / 2);
    c.rotation.x = Math.atan2(s.zC - s.zD, s.roof - belt);
    g.add(c);
    if (model.body !== 'classic' && model.body !== 'hyper') g.add(at(box(0.06, s.roof - belt, 0.08, trim, 0.01), sx * (gw / 2 + 0.005), (s.roof + belt) / 2, (s.zB + s.zC) / 2 + 0.1));
    // Door line and handle.
    g.add(at(box(0.01, belt - y0 - 0.15, 0.01, mat('#0d0e10'), 0), sx * (W / 2 + 0.002), (belt + y0) / 2, (s.zB + s.zC) / 2 + 0.1));
    g.add(at(box(0.02, 0.03, 0.14, trim, 0.01), sx * (W / 2 + 0.01), belt - 0.1, (s.zB + s.zC) / 2 - 0.15));
    // Mirrors.
    g.add(at(box(0.18, 0.1, 0.1, paint, 0.03), sx * (W / 2 + 0.06), belt + 0.06, s.zA - 0.1));
  }
  // Wheels.
  for (const sx of [-1, 1]) for (const z of [zf, zr]) {
    const w = wheel(R, model.body === 'classic');
    w.rotation.y = (sx * Math.PI) / 2;
    w.position.set(sx * (W / 2 - 0.16), R, z);
    g.add(w);
  }
  // Lights, grille and number plates.
  const head = mat('#fffbe8', { emissive: '#fff2c0', glow: 1.4 });
  const tail = mat('#ff2d3d', { emissive: '#ff2d3d', glow: 1.6 });
  const plate = mat('#f2f2ee', { rough: 0.5 });
  for (const sx of [-1, 1]) {
    g.add(at(box(0.36, 0.09, 0.08, head, 0.03), sx * (W / 2 - 0.3), hood - 0.12, L / 2 - 0.06));
  }
  g.add(at(box(W - 0.3, 0.07, 0.06, tail, 0.02), 0, deck - 0.14, -L / 2 + 0.01));
  g.add(at(box(W * 0.45, 0.16, 0.05, trim, 0.03), 0, y0 + 0.22, L / 2 - 0.01));
  g.add(at(box(0.5, 0.12, 0.02, plate, 0.01), 0, y0 + 0.24, L / 2 + 0.02));
  g.add(at(box(0.5, 0.12, 0.02, plate, 0.01), 0, y0 + 0.24, -L / 2 - 0.02));
  if (model.body === 'classic') {
    const chrome = mat('#e8ecef', { metal: 1, rough: 0.12 });
    for (const sz of [-1, 1]) g.add(at(box(W + 0.06, 0.08, 0.1, chrome, 0.04), 0, y0 + 0.1, sz * (L / 2 + 0.04)));
    for (const sx of [-1, 1]) g.add(at(cyl(0.11, 0.11, 0.06, head, 20), sx * (W / 2 - 0.32), hood - 0.1, L / 2 - 0.2).rotateX(Math.PI / 2));
  }
  if (model.body === 'gt' || model.body === 'hyper') {
    const stripe = mat(color === '#16181b' ? '#c6ff3d' : '#16181b', { rough: 0.3, clear: true });
    g.add(at(box(0.32, 0.01, 1.4, stripe, 0), 0, hood + 0.005, L / 2 - 0.85));
    // Side intakes.
    for (const sx of [-1, 1]) g.add(at(box(0.04, 0.16, 0.5, trim, 0.02), sx * (W / 2 + 0.005), (belt + y0) / 2, zr + R + 0.3));
  }
  if (model.body === 'hyper') {
    for (const sx of [-0.55, 0.55]) g.add(at(box(0.05, 0.32, 0.16, trim, 0.01), sx * W * 0.6, deck + 0.14, -L / 2 + 0.35));
    g.add(at(box(W * 0.95, 0.05, 0.36, trim, 0.02), 0, deck + 0.32, -L / 2 + 0.32));
    g.add(at(box(W - 0.2, 0.05, 0.3, trim, 0.01), 0, y0 + 0.02, L / 2 + 0.05));
  }
  if (model.body === 'suv') {
    const rail = mat('#2a2f35', { metal: 0.6, rough: 0.4 });
    for (const sx of [-1, 1]) g.add(at(box(0.05, 0.06, roofLen * 0.9, rail, 0.02), sx * (gw / 2 - 0.12), s.roof + 0.06, (s.zB + s.zC) / 2));
    g.add(at(box(W - 0.1, 0.12, 0.08, trim, 0.03), 0, y0 + 0.1, -L / 2 - 0.02));
  }
  if (model.body === 'classic') {
    // A soft top in black canvas over the greenhouse.
    g.add(at(box(gw - 0.02, 0.08, roofLen + 0.25, mat('#1b1c1e', { rough: 0.95, sheen: true }), 0.04), 0, s.roof, (s.zB + s.zC) / 2 - 0.08));
  }
  g.add(blob(W + 0.2, L + 0.2, 1.2));
  return g;
}

/** Footprint of a car (width, length), for walking around it. */
export function carSize(model: CarModel): [number, number] {
  const s = SHAPES[model.body];
  return [s.W + 0.15, s.L + 0.1];
}
