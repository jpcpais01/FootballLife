// Cars, lofted like real bodywork: cross-sections along the length with
// rounded shoulders and tumblehome, a nose and tail that round off in plan,
// flared wheel arches, and a glass cabin with painted roof and pillars.
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
  /** How square the body section is (higher is boxier). */
  sq: number;
  /** Share of the length that rounds off at each end, in plan. */
  nose: number;
}

const SHAPES: Record<CarModel['body'], Shape> = {
  hatch: { L: 3.7, W: 1.72, ride: 0.2, R: 0.31, zf: 1.22, zr: -1.18, hood: 0.82, belt: 0.95, deck: 1.0, roof: 1.5, zA: 0.72, zB: 0.22, zC: -1.36, zD: -1.76, sq: 5, nose: 0.12 },
  classic: { L: 3.9, W: 1.66, ride: 0.22, R: 0.32, zf: 1.3, zr: -1.25, hood: 0.76, belt: 0.82, deck: 0.8, roof: 1.22, zA: 0.38, zB: 0.06, zC: -0.72, zD: -1.08, sq: 3.4, nose: 0.2 },
  coupe: { L: 4.3, W: 1.8, ride: 0.16, R: 0.33, zf: 1.45, zr: -1.35, hood: 0.74, belt: 0.86, deck: 0.88, roof: 1.32, zA: 0.55, zB: -0.12, zC: -0.85, zD: -1.65, sq: 4, nose: 0.16 },
  suv: { L: 4.6, W: 1.9, ride: 0.3, R: 0.4, zf: 1.5, zr: -1.45, hood: 1.1, belt: 1.22, deck: 1.2, roof: 1.84, zA: 0.95, zB: 0.42, zC: -1.85, zD: -2.08, sq: 6, nose: 0.1 },
  gt: { L: 4.7, W: 1.92, ride: 0.13, R: 0.35, zf: 1.6, zr: -1.45, hood: 0.7, belt: 0.84, deck: 0.86, roof: 1.25, zA: 0.42, zB: -0.25, zC: -0.95, zD: -1.78, sq: 3.6, nose: 0.17 },
  hyper: { L: 4.6, W: 2.0, ride: 0.11, R: 0.36, zf: 1.55, zr: -1.4, hood: 0.62, belt: 0.76, deck: 0.92, roof: 1.12, zA: 0.6, zB: -0.05, zC: -0.62, zD: -1.6, sq: 3.2, nose: 0.18 },
};

const smooth = (t: number) => t * t * (3 - 2 * t);

/** A smooth curve through (z, y) points, sorted by z. */
function curve(pts: [number, number][]) {
  return (z: number) => {
    if (z <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
      const [z1, y1] = pts[i];
      if (z <= z1) {
        const [z0, y0] = pts[i - 1];
        return y0 + (y1 - y0) * smooth((z - z0) / Math.max(1e-6, z1 - z0));
      }
    }
    return pts[pts.length - 1][1];
  };
}

interface Section {
  z: number;
  yb: number;
  yt: number;
  hw: number;
}

/**
 * A closed body lofted through cross-sections. Each section is a superellipse
 * (n sets how square) narrowing towards the top by `tumble`. `group` picks a
 * material for each quad from its place along the body and round the section.
 */
function loft(secs: Section[], n: number, tumble: number, ringN: number, mats: THREE.Material[], group: (z: number, c: number, yn: number) => number) {
  const pos: number[] = [];
  const idx: number[][] = mats.map(() => []);
  const ring: { c: number; yn: number }[] = [];
  for (let j = 0; j < ringN; j++) {
    const th = (j / ringN) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    ring.push({ c: Math.sign(c) * Math.abs(c) ** (2 / n), yn: Math.sign(s) * Math.abs(s) ** (2 / n) });
  }
  for (const sec of secs) {
    for (const { c, yn } of ring) {
      const x = sec.hw * c * (1 - tumble * Math.max(0, yn) ** 2);
      const y = sec.yb + ((yn + 1) / 2) * (sec.yt - sec.yb);
      pos.push(x, y, sec.z);
    }
  }
  for (let i = 0; i < secs.length - 1; i++) {
    const zm = (secs[i].z + secs[i + 1].z) / 2;
    for (let j = 0; j < ringN; j++) {
      const j1 = (j + 1) % ringN;
      const a = i * ringN + j;
      const b = i * ringN + j1;
      const c = (i + 1) * ringN + j;
      const d = (i + 1) * ringN + j1;
      const g = group(zm, Math.abs((ring[j].c + ring[j1].c) / 2), (ring[j].yn + ring[j1].yn) / 2);
      idx[g].push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const all: number[] = [];
  idx.forEach((list, g) => {
    geo.addGroup(all.length, list.length, g);
    all.push(...list);
  });
  geo.setIndex(all);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mats);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

function wheel(R: number, classic: boolean): THREE.Group {
  const g = new THREE.Group();
  const rubber = mat('#141516', { rough: 0.9 });
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(R - 0.1, 0.1, 12, 32), rubber);
  tyre.scale.z = 1.25;
  tyre.castShadow = true;
  g.add(tyre);
  g.add(cyl(R - 0.1, R - 0.1, 0.22, rubber, 28).rotateX(Math.PI / 2));
  const rim = mat(classic ? '#e8ecef' : '#b4bbc4', { metal: 1, rough: 0.2 });
  const face = cyl(R * 0.66, R * 0.66, 0.04, mat('#22252a', { metal: 0.6, rough: 0.4 }), 28).rotateX(Math.PI / 2);
  face.position.z = 0.1;
  g.add(face);
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(R * 0.64, 0.022, 6, 28), rim), 0, 0, 0.12));
  const spokes = classic ? 8 : 5;
  for (let i = 0; i < spokes; i++) {
    const s = box(classic ? 0.025 : 0.06, R * 1.22, 0.03, rim, 0.01);
    s.position.z = 0.12;
    s.rotation.z = (i / spokes) * Math.PI;
    g.add(s);
  }
  g.add(at(cyl(0.07, 0.07, 0.05, rim, 14), 0, 0, 0.13).rotateX(Math.PI / 2));
  // Brake disc and calliper behind the spokes.
  g.add(at(cyl(R * 0.48, R * 0.48, 0.02, mat('#6a6f76', { metal: 0.8, rough: 0.35 }), 24), 0, 0, 0.07).rotateX(Math.PI / 2));
  if (!classic) g.add(at(box(0.09, 0.16, 0.05, mat('#d8322e', { rough: 0.4 }), 0.02), R * 0.36, R * 0.12, 0.085));
  return g;
}

export function car(model: CarModel, color: string): THREE.Group {
  const s = SHAPES[model.body];
  const g = new THREE.Group();
  const paint = mat(color, { rough: 0.2, metal: 0.4, clear: true });
  const glass = mat('#1c2834', { rough: 0.04, metal: 0.85 });
  const trim = mat('#16181b', { rough: 0.35 });
  const canvas = mat('#1b1c1e', { rough: 0.95, sheen: true });
  const { L, W, ride, R, zf, zr, hood, belt, deck } = s;
  const y0 = ride + 0.04;
  const Ra = R + 0.07;

  // Side view: the shoulder line along the top of the body and the sills underneath.
  const top = curve([[-L / 2, deck - 0.16], [-L / 2 + 0.32, deck], [s.zD + 0.1, belt], [s.zA, belt], [L / 2 - 0.5, hood], [L / 2, hood - 0.18]]);
  const bottom = curve([[-L / 2, y0 + 0.2], [-L / 2 + 0.3, y0], [L / 2 - 0.3, y0], [L / 2, y0 + 0.18]]);
  const archAt = (z: number) => {
    let y = 0;
    for (const zw of [zf, zr]) {
      const dz = Math.abs(z - zw);
      if (dz < Ra) y = Math.max(y, R + Math.sqrt(Ra * Ra - dz * dz));
    }
    return y;
  };
  // Plan view: full width along the middle, rounding off at nose and tail.
  const halfW = (z: number) => {
    const u = Math.max(0, (Math.abs(z) / (L / 2) - (1 - s.nose)) / s.nose);
    return (W / 2) * Math.max(0, 1 - u ** 2.4) ** (1 / 2.4);
  };
  const ytAt = (z: number) => {
    const a = archAt(z);
    // Flared arches: the wings rise over the wheels on low cars.
    return Math.max(top(z), a > 0 ? a + 0.09 : 0);
  };

  const N = 84;
  const secs: Section[] = [];
  for (let i = 0; i <= N; i++) {
    const z = -L / 2 + (L * i) / N;
    const yt = ytAt(z);
    const yb = Math.min(Math.max(bottom(z), archAt(z)), yt - 0.08);
    secs.push({ z, yb, yt, hw: i === 0 || i === N ? 0 : halfW(z) });
  }
  g.add(loft(secs, s.sq, 0.1, 28, [paint], () => 0));

  // The cabin: glass all round, painted roof and pillars.
  const gw = W - 0.24;
  const roofLine = curve([[s.zD, belt - 0.03], [s.zC, s.roof], [s.zB, s.roof], [s.zA, belt - 0.03]]);
  const cab: Section[] = [];
  const CN = 48;
  for (let i = 0; i <= CN; i++) {
    const z = s.zD + ((s.zA - s.zD) * i) / CN;
    const yt = roofLine(z);
    cab.push({ z, yb: belt - 0.06, yt: Math.max(yt, belt - 0.05), hw: Math.min(gw / 2, halfW(z) - 0.08) });
  }
  const zBp = (s.zB + s.zC) / 2 + 0.1;
  const roofG = model.body === 'classic' ? 3 : 0;
  const pillarG = model.body === 'classic' || model.body === 'hyper' ? 0 : 2;
  g.add(loft(cab, 3, 0.32, 28, [paint, glass, trim, canvas], (z, c, yn) => {
    const onRoof = z > s.zC - 0.02 && z < s.zB + 0.02;
    if (onRoof && yn > 0.62) return roofG;
    // A and C pillars run along the shoulders of the windscreen and rear window.
    if (!onRoof && c > 0.62 && yn > 0.1) return 0;
    if (Math.abs(z - zBp) < 0.05 && yn > -0.3) return pillarG;
    // The pillars meet the body: a painted band round the bottom of the windows.
    if (yn < -0.35) return 0;
    return 1;
  }));

  for (const sx of [-1, 1]) {
    const hwB = halfW((s.zB + s.zC) / 2);
    // Door shut line and handle.
    g.add(at(box(0.01, belt - y0 - 0.2, 0.01, mat('#0d0e10'), 0), sx * (hwB + 0.001), (belt + y0) / 2, zBp));
    g.add(at(box(0.02, 0.03, 0.15, trim, 0.01), sx * (hwB + 0.008), belt - 0.12, zBp - 0.25));
    // Side skirt.
    g.add(at(box(0.04, 0.07, Math.abs(zf - zr) - 2 * Ra - 0.06, trim, 0.02), sx * (hwB - 0.01), y0 + 0.05, (zf + zr) / 2));
    // Mirrors on stalks at the base of the windscreen.
    const mz = s.zA - 0.12;
    const mx = halfW(mz) + 0.04;
    g.add(at(box(0.06, 0.03, 0.06, trim, 0.01), sx * (mx - 0.03), belt + 0.03, mz));
    g.add(at(box(0.16, 0.1, 0.11, paint, 0.035), sx * (mx + 0.05), belt + 0.07, mz - 0.02));
  }

  // Wheels, with a dark well behind each arch.
  const well = mat('#0b0c0e', { rough: 0.9 });
  for (const z of [zf, zr]) g.add(at(box(W - 0.5, Ra * 1.2, Ra * 2 - 0.05, well, 0.02), 0, R + Ra * 0.35, z));
  for (const sx of [-1, 1]) for (const z of [zf, zr]) {
    const w = wheel(R, model.body === 'classic');
    w.rotation.y = (sx * Math.PI) / 2;
    w.position.set(sx * (W / 2 - 0.17), R, z);
    g.add(w);
  }

  // Lights, grille and number plates, set into the nose and tail.
  const head = mat('#fffbe8', { emissive: '#fff2c0', glow: 1.4 });
  const tail = mat('#ff2d3d', { emissive: '#ff2d3d', glow: 1.6 });
  const plate = mat('#f2f2ee', { rough: 0.5 });
  const zH = L / 2 - L * s.nose * 0.55;
  const zT = -L / 2 + L * s.nose * 0.5;
  const noseW = halfW(zH);
  const tailW = halfW(zT);
  if (model.body === 'classic') {
    for (const sx of [-1, 1]) {
      const l = at(cyl(0.11, 0.11, 0.08, head, 20), sx * (noseW - 0.28), ytAt(zH) - 0.12, zH + 0.06);
      l.rotation.x = Math.PI / 2;
      g.add(l);
    }
  } else {
    for (const sx of [-1, 1]) {
      const l = at(box(0.38, 0.07, 0.3, head, 0.03), sx * (noseW - 0.3), ytAt(zH) - 0.06, zH + 0.05);
      l.rotation.x = 0.35;
      g.add(l);
    }
  }
  g.add(at(box(tailW * 2 - 0.3, 0.07, 0.24, tail, 0.03), 0, ytAt(zT) - 0.07, zT - 0.04));
  const zG = L / 2 - L * s.nose * 0.25;
  g.add(at(box(halfW(zG) * 1.1, 0.16, 0.2, trim, 0.04), 0, y0 + 0.24, zG));
  g.add(at(box(0.5, 0.12, 0.02, plate, 0.01), 0, y0 + 0.24, zG + 0.11));
  const zP = -L / 2 + L * s.nose * 0.25;
  g.add(at(box(0.5, 0.12, 0.02, plate, 0.01), 0, y0 + 0.26, zP - 0.03));
  if (model.body === 'classic') {
    const chrome = mat('#e8ecef', { metal: 1, rough: 0.12 });
    for (const sz of [-1, 1]) g.add(at(box(halfW(sz * (L / 2 - 0.2)) * 2 + 0.06, 0.07, 0.1, chrome, 0.035), 0, y0 + 0.1, sz * (L / 2 - 0.12)));
  }
  if (model.body === 'gt' || model.body === 'hyper') {
    const stripe = mat(color === '#16181b' ? '#c6ff3d' : '#16181b', { rough: 0.3, clear: true });
    // Twin stripes over the bonnet, roof and tail.
    for (const sx of [-0.12, 0.12]) {
      g.add(at(box(0.12, 0.012, L / 2 - s.zA - 0.3, stripe, 0), sx, hood + 0.03, (L / 2 + s.zA) / 2 - 0.1));
    }
    // Side intakes behind the doors.
    for (const sx of [-1, 1]) g.add(at(box(0.05, 0.18, 0.5, trim, 0.02), sx * (halfW(zr + Ra + 0.3) - 0.01), (belt + y0) / 2, zr + Ra + 0.3));
    // Rear diffuser.
    g.add(at(box(W - 0.5, 0.08, 0.3, trim, 0.01), 0, y0 + 0.02, -L / 2 + 0.25));
  }
  if (model.body === 'hyper') {
    for (const sx of [-0.55, 0.55]) g.add(at(box(0.05, 0.32, 0.16, trim, 0.01), sx * W * 0.6, deck + 0.14, -L / 2 + 0.4));
    g.add(at(box(W * 0.95, 0.05, 0.36, trim, 0.02), 0, deck + 0.32, -L / 2 + 0.38));
    g.add(at(box(W - 0.3, 0.05, 0.3, trim, 0.01), 0, y0 + 0.02, L / 2 - 0.2));
  }
  if (model.body === 'suv') {
    const rail = mat('#2a2f35', { metal: 0.6, rough: 0.4 });
    for (const sx of [-1, 1]) g.add(at(box(0.05, 0.06, (s.zB - s.zC) * 0.9, rail, 0.02), sx * (gw / 2 - 0.2), s.roof + 0.04, (s.zB + s.zC) / 2));
    g.add(at(box(W - 0.3, 0.12, 0.12, trim, 0.03), 0, y0 + 0.12, -L / 2 + 0.12));
    // Black cladding round the arches.
    for (const sx of [-1, 1]) for (const z of [zf, zr]) {
      const c = new THREE.Mesh(new THREE.TorusGeometry(Ra + 0.02, 0.05, 6, 20, Math.PI), trim);
      c.position.set(sx * (W / 2 - 0.02), R, z);
      c.rotation.y = Math.PI / 2;
      g.add(c);
    }
  }
  if (model.body === 'hatch') {
    // A small roof spoiler over the tailgate.
    g.add(at(box(gw - 0.2, 0.04, 0.22, paint, 0.02), 0, s.roof - 0.02, s.zC - 0.08));
  }
  g.add(blob(W + 0.2, L + 0.2, 1.2));
  return g;
}

/** Footprint of a car (width, length), for walking around it. */
export function carSize(model: CarModel): [number, number] {
  const s = SHAPES[model.body];
  return [s.W + 0.15, s.L + 0.1];
}
