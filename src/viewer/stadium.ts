// Procedural toy stadium: a closed two-tier bowl swept around the pitch, with
// coloured seats and gangways, a roof ring with floodlights, an instanced crowd
// that sings and jumps, flags, big screens, LED ribbons and a sky dome.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const PL = 105;
export const PW = 68;

export interface StadiumOptions {
  night: boolean;
  home: { primary: string; secondary: string };
  away: { primary: string; secondary: string };
  homeName: string;
  awayName: string;
  homeShort?: string;
  awayShort?: string;
  crowd: number; // instance count
}

export interface Stadium {
  group: THREE.Group;
  update(time: number, excitement: number): void;
  setCheer(side: 0 | 1 | -1): void;
  setScoreboard(home: number, away: number, label: string): void;
  dispose(): void;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Pitch surface: mowing stripes, subtle wear and crisp markings. */
function pitchTexture(): THREE.Texture {
  const M = 5; // margin metres
  const W = 2048;
  const s = W / (PL + 2 * M);
  const H = Math.round((PW + 2 * M) * s);
  return canvasTex(W, H, (g) => {
    const X = (m: number) => (m + PL / 2 + M) * s;
    const Y = (m: number) => (m + PW / 2 + M) * s;
    // Stripes.
    const stripes = 14;
    for (let i = 0; i < stripes + 2; i++) {
      g.fillStyle = i % 2 ? '#2e8531' : '#358f36';
      g.fillRect(X(-PL / 2 - M + (i * (PL + 2 * M)) / (stripes + 2)), 0, ((PL + 2 * M) / (stripes + 2)) * s + 1, H);
    }
    // Cross-mow (subtle checker).
    g.globalAlpha = 0.06;
    for (let j = 0; j < 10; j++) {
      g.fillStyle = j % 2 ? '#000' : '#fff';
      g.fillRect(0, (j * H) / 10, W, H / 10);
    }
    g.globalAlpha = 1;
    // Speckle / wear.
    const img = g.getImageData(0, 0, W, H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 18;
      d[i] += n * 0.6;
      d[i + 1] += n;
      d[i + 2] += n * 0.4;
    }
    g.putImageData(img, 0, 0);
    // Goalmouth wear.
    for (const side of [-1, 1]) {
      const grd = g.createRadialGradient(X(side * (PL / 2 - 4)), Y(0), 0, X(side * (PL / 2 - 4)), Y(0), 9 * s);
      grd.addColorStop(0, 'rgba(120,110,60,0.35)');
      grd.addColorStop(1, 'rgba(120,110,60,0)');
      g.fillStyle = grd;
      g.fillRect(X(side * (PL / 2 - 14)) - 20 * s, Y(-12), 40 * s, 24 * s);
    }
    // Lines.
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 0.13 * s;
    const rect = (x0: number, y0: number, x1: number, y1: number) => g.strokeRect(X(x0), Y(y0), (x1 - x0) * s, (y1 - y0) * s);
    rect(-PL / 2, -PW / 2, PL / 2, PW / 2);
    g.beginPath(); g.moveTo(X(0), Y(-PW / 2)); g.lineTo(X(0), Y(PW / 2)); g.stroke();
    g.beginPath(); g.arc(X(0), Y(0), 9.15 * s, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.92)';
    const dot = (x: number, y: number) => { g.beginPath(); g.arc(X(x), Y(y), 0.22 * s, 0, Math.PI * 2); g.fill(); };
    dot(0, 0);
    for (const sd of [-1, 1]) {
      const gl = (sd * PL) / 2;
      rect(Math.min(gl, gl - sd * 16.5), -20.16, Math.max(gl, gl - sd * 16.5), 20.16);
      rect(Math.min(gl, gl - sd * 5.5), -9.16, Math.max(gl, gl - sd * 5.5), 9.16);
      dot(gl - sd * 11, 0);
      // D arc.
      const a = Math.acos(5.5 / 9.15);
      g.beginPath();
      if (sd > 0) g.arc(X(gl - 11), Y(0), 9.15 * s, Math.PI - a, Math.PI + a);
      else g.arc(X(gl + 11), Y(0), 9.15 * s, -a, a);
      g.stroke();
      for (const cy of [-1, 1]) {
        g.beginPath();
        g.arc(X(gl), Y((cy * PW) / 2), 1 * s, 0, Math.PI * 2);
        g.stroke();
      }
    }
  });
}

function noiseTex(size = 256): THREE.Texture {
  const t = canvasTex(size, size, (g) => {
    const img = g.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function boardTexture(o: StadiumOptions) {
  const t = canvasTex(2048, 64, (g) => {
    const items = ['FOOTBALLIFE', o.homeName.toUpperCase(), 'LIVE', o.awayName.toUpperCase(), 'YOUR CAREER STARTS HERE'];
    const colors = ['#c6ff3d', o.home.primary, '#ffffff', o.away.primary, '#c6ff3d'];
    let x = 0;
    let k = 0;
    while (x < 2048) {
      const txt = items[k % items.length];
      const col = colors[k % colors.length];
      const w = 340;
      g.fillStyle = k % 2 ? '#0b0e10' : '#14181c';
      g.fillRect(x, 0, w, 64);
      g.fillStyle = col;
      g.font = 'italic 800 38px "Barlow Condensed", Impact, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(txt, x + w / 2, 34, w - 20);
      x += w;
      k++;
    }
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function netTexture() {
  const t = canvasTex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 3;
    for (let i = 0; i <= 128; i += 16) {
      g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke();
      g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function goal(dir: 1 | -1): THREE.Group {
  const g = new THREE.Group();
  const W = 7.32;
  const H = 2.44;
  const D = 2.2;
  const post = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  const r = 0.07;
  const cyl = (len: number) => new THREE.CylinderGeometry(r, r, len, 14);
  const p1 = new THREE.Mesh(cyl(H), post); p1.position.set(0, H / 2, -W / 2);
  const p2 = new THREE.Mesh(cyl(H), post); p2.position.set(0, H / 2, W / 2);
  const bar = new THREE.Mesh(cyl(W + r * 2), post); bar.rotation.x = Math.PI / 2; bar.position.set(0, H, 0);
  for (const m of [p1, p2, bar]) { m.castShadow = true; g.add(m); }
  const netTex = netTexture();
  const netMat = new THREE.MeshStandardMaterial({ map: netTex, alphaMap: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1, color: 0xf2f2f2 });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), netMat.clone());
  (back.material as THREE.MeshStandardMaterial).map = netTex.clone();
  ((back.material as THREE.MeshStandardMaterial).map as THREE.Texture).repeat.set(W * 3, H * 3);
  (back.material as THREE.MeshStandardMaterial).alphaMap = (back.material as THREE.MeshStandardMaterial).map;
  back.rotation.y = Math.PI / 2;
  back.position.set(D, H / 2 - 0.25, 0);
  back.scale.y = 1.2;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(D, W), netMat.clone());
  ((top.material as THREE.MeshStandardMaterial).map = netTex.clone()).repeat.set(D * 3, W * 3);
  (top.material as THREE.MeshStandardMaterial).alphaMap = (top.material as THREE.MeshStandardMaterial).map;
  top.rotation.x = -Math.PI / 2;
  top.rotation.z = 0.25;
  top.position.set(D / 2, H - 0.12, 0);
  for (const sd of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(D, H), netMat.clone());
    ((side.material as THREE.MeshStandardMaterial).map = netTex.clone()).repeat.set(D * 3, H * 3);
    (side.material as THREE.MeshStandardMaterial).alphaMap = (side.material as THREE.MeshStandardMaterial).map;
    side.position.set(D / 2, H / 2, (sd * W) / 2);
    g.add(side);
  }
  g.add(back, top);
  g.position.x = (dir * PL) / 2;
  if (dir < 0) g.rotation.y = Math.PI;
  return g;
}

// ---------------------------------------------------------------------------
// The bowl: every stand surface is a profile swept along a rounded rectangle
// around the pitch, so the stands, corners and roof form one closed ring.

type Zone = 'E' | 'N' | 'W' | 'S' | 'C';
interface RingPt { x: number; z: number; nx: number; nz: number }
interface Piece { zone: Zone; len(d: number): number; at(d: number, f: number, o: RingPt): RingPt; gangways: number[] }

const RA = PL / 2 + 9; // ring base half-extents (the front of the stands)
const RB = PW / 2 + 9;
const RR = 14; // corner radius at the base

function makeRing(): Piece[] {
  const cx = RA - RR;
  const cz = RB - RR;
  const gw = (len: number) => {
    const m = Math.max(2, Math.round(len / 13));
    return Array.from({ length: m - 1 }, (_, i) => (i + 1) / m);
  };
  const line = (zone: Zone, x0: number, z0: number, x1: number, z1: number, nx: number, nz: number): Piece => ({
    zone,
    gangways: gw(Math.hypot(x1 - x0, z1 - z0)),
    len: () => Math.hypot(x1 - x0, z1 - z0),
    at: (d, f, o) => {
      o.nx = nx;
      o.nz = nz;
      o.x = x0 + (x1 - x0) * f + nx * (RR + d);
      o.z = z0 + (z1 - z0) * f + nz * (RR + d);
      return o;
    },
  });
  const arc = (ccx: number, ccz: number, a0: number): Piece => ({
    zone: 'C',
    gangways: [0.5],
    len: (d) => (Math.PI / 2) * (RR + d),
    at: (d, f, o) => {
      const a = a0 + (f * Math.PI) / 2;
      o.nx = Math.cos(a);
      o.nz = Math.sin(a);
      o.x = ccx + o.nx * (RR + d);
      o.z = ccz + o.nz * (RR + d);
      return o;
    },
  });
  return [
    line('E', cx, -cz, cx, cz, 1, 0),
    arc(cx, cz, 0),
    line('N', cx, cz, -cx, cz, 0, 1),
    arc(-cx, cz, Math.PI / 2),
    line('W', -cx, cz, -cx, -cz, -1, 0),
    arc(-cx, -cz, Math.PI),
    line('S', -cx, -cz, cx, -cz, 0, -1),
    arc(cx, -cz, Math.PI * 1.5),
  ];
}

interface SegInfo { piece: number; zone: Zone; i: number; n: number; f0: number; f1: number; gang: boolean }
type Face = 'in' | 'out' | 'up' | 'down';
interface StripOpts {
  seg: number;
  face: Face;
  color: (s: SegInfo) => THREE.Color;
  uv?: 'seat' | 'run' | 'plain';
  uScale?: number;
  onSeg?: (s: SegInfo) => void;
}

class Mesher {
  p: number[] = [];
  n: number[] = [];
  c: number[] = [];
  uv: number[] = [];
  ix: number[] = [];
  quad(v: number[][], nr: number[][], col: THREE.Color, uvs: number[][], face: number[]) {
    const [a, b, , d] = v;
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const cr = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const order = cr[0] * face[0] + cr[1] * face[1] + cr[2] * face[2] >= 0 ? [0, 1, 2, 3] : [0, 3, 2, 1];
    const base = this.p.length / 3;
    for (const k of order) {
      this.p.push(...v[k]);
      this.n.push(...nr[k]);
      this.c.push(col.r, col.g, col.b);
      this.uv.push(...uvs[k]);
    }
    this.ix.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.ix);
    g.computeBoundingSphere();
    return g;
  }
}

/** Sweeps the profile edge (d0,h0)→(d1,h1) around the whole ring. */
function strip(m: Mesher, ring: Piece[], d0: number, h0: number, d1: number, h1: number, o: StripOpts) {
  const dm = (d0 + d1) / 2;
  const A: RingPt = { x: 0, z: 0, nx: 0, nz: 0 };
  const B: RingPt = { x: 0, z: 0, nx: 0, nz: 0 };
  const C: RingPt = { x: 0, z: 0, nx: 0, nz: 0 };
  const D: RingPt = { x: 0, z: 0, nx: 0, nz: 0 };
  const nrm = (q: RingPt) => (o.face === 'in' ? [-q.nx, 0, -q.nz] : o.face === 'out' ? [q.nx, 0, q.nz] : o.face === 'up' ? [0, 1, 0] : [0, -1, 0]);
  let run = 0;
  ring.forEach((pc, pi) => {
    const L = pc.len(dm);
    const n = Math.max(1, Math.round(L / o.seg));
    for (let i = 0; i < n; i++) {
      const f0 = i / n;
      const f1 = (i + 1) / n;
      const gang = pc.gangways.some((g) => g >= f0 && g < f1);
      const info: SegInfo = { piece: pi, zone: pc.zone, i, n, f0, f1, gang };
      pc.at(d0, f0, A);
      pc.at(d0, f1, B);
      pc.at(d1, f1, C);
      pc.at(d1, f0, D);
      const mid = { x: 0, z: 0, nx: 0, nz: 0 };
      pc.at(dm, (f0 + f1) / 2, mid);
      let uvs: number[][];
      if (o.uv === 'run') {
        const u0 = (run + f0 * L) / (o.uScale ?? 1);
        const u1 = (run + f1 * L) / (o.uScale ?? 1);
        uvs = [[u0, 0], [u1, 0], [u1, 1], [u0, 1]];
      } else if (o.uv === 'seat' && !gang) uvs = [[0, 0.1], [1, 0.1], [1, 1], [0, 1]];
      else uvs = [[0.5, 0.02], [0.5, 0.02], [0.5, 0.02], [0.5, 0.02]];
      m.quad(
        [[A.x, h0, A.z], [B.x, h0, B.z], [C.x, h1, C.z], [D.x, h1, D.z]],
        [nrm(A), nrm(B), nrm(C), nrm(D)],
        o.color(info),
        uvs,
        nrm(mid),
      );
      o.onSeg?.(info);
    }
    run += L;
  });
}

// Profile: lower tier, hospitality boxes, upper tier, roof.
const SD = 0.82;
const LOW_ROWS = 14;
const UP_ROWS = 16;
const lowD = (i: number) => i * SD;
const lowH = (i: number) => 1.4 + i * 0.42;
const upD = (j: number) => 12.9 + j * SD;
const upH = (j: number) => 11.9 + j * 0.56;
const BACK_D = upD(UP_ROWS);
const ROOF_IN = 2.5;
const ROOF_UNDER_IN = 23.4;
const ROOF_UNDER_OUT = 24.4;
const ROOF_TOP_IN = 24.6;
const ROOF_TOP_OUT = 26.8;
const FACADE_D = BACK_D + 1.4;

function seatTexture() {
  const t = canvasTex(64, 64, (g) => {
    // RGB is shading, alpha is the seat mask (1 = seat colour, 0 = concrete).
    const img = g.createImageData(64, 64);
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const v = y / 63; // 0 front of the tread, 1 back
        const u = x / 63;
        let shade = 210;
        let seat = 0;
        if (v < 0.1) { shade = 255; seat = 1; } // plain band for risers and walls
        else if (u > 0.1 && u < 0.9) {
          if (v > 0.32 && v < 0.62) { seat = 1; shade = 255 - (v - 0.32) * 120; }
          else if (v >= 0.62 && v < 0.86) { seat = 1; shade = 200 + (v - 0.62) * 180; }
        }
        if (u > 0.1 && u < 0.9 && v > 0.86 && v < 0.9) shade = 120; // shadow behind the backrest
        const k = (y * 64 + x) * 4;
        img.data[k] = img.data[k + 1] = img.data[k + 2] = Math.min(255, shade);
        img.data[k + 3] = seat ? 255 : 0;
      }
    }
    g.putImageData(img, 0, 0);
  }, false);
  t.premultiplyAlpha = false;
  return t;
}

function glassTexture() {
  const t = canvasTex(512, 96, (g) => {
    const grd = g.createLinearGradient(0, 0, 0, 96);
    grd.addColorStop(0, '#1d2733');
    grd.addColorStop(1, '#0b1016');
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 96);
    for (let i = 0; i < 8; i++) {
      // Warm room lights and silhouettes behind the glass.
      const x = i * 64;
      const lit = Math.random() < 0.85;
      if (lit) {
        const rg = g.createRadialGradient(x + 32, 22, 2, x + 32, 30, 46);
        rg.addColorStop(0, 'rgba(255,214,150,0.95)');
        rg.addColorStop(1, 'rgba(255,190,120,0.05)');
        g.fillStyle = rg;
        g.fillRect(x + 3, 6, 58, 84);
        g.fillStyle = 'rgba(20,16,12,0.55)';
        for (let k = 0; k < 3; k++) {
          const px = x + 12 + Math.random() * 40;
          g.beginPath();
          g.arc(px, 52, 5, 0, Math.PI * 2);
          g.fill();
          g.fillRect(px - 7, 58, 14, 32);
        }
      }
      g.fillStyle = '#0a0d10';
      g.fillRect(x, 0, 3, 96);
    }
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(0, 0, 512, 4);
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function ribbonTexture(o: StadiumOptions) {
  const t = canvasTex(2048, 64, (g) => {
    const blocks = [
      { bg: o.home.primary, fg: o.home.secondary, txt: (o.homeShort ?? o.homeName).toUpperCase() },
      { bg: '#0b0e10', fg: '#c6ff3d', txt: 'FOOTBALLIFE' },
      { bg: '#0b0e10', fg: '#ffffff', txt: 'MATCHDAY LIVE' },
      { bg: o.away.primary, fg: o.away.secondary, txt: (o.awayShort ?? o.awayName).toUpperCase() },
    ];
    const w = 512;
    blocks.forEach((b, k) => {
      g.fillStyle = b.bg;
      g.fillRect(k * w, 0, w, 64);
      g.fillStyle = b.fg;
      g.font = 'italic 800 40px "Barlow Condensed", Impact, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(b.txt, k * w + w / 2, 34, w - 40);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      for (let y = 0; y < 64; y += 4) g.fillRect(k * w, y, w, 1); // LED rows
    });
  });
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function tifoCanvas(o: StadiumOptions, w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  // Diagonal club stripes with the short name across the middle.
  g.fillStyle = o.home.primary;
  g.fillRect(0, 0, w, h);
  g.fillStyle = o.home.secondary;
  for (let x = -h; x < w + h; x += 10) {
    g.beginPath();
    g.moveTo(x, h);
    g.lineTo(x + 4, h);
    g.lineTo(x + 4 + h, 0);
    g.lineTo(x + h, 0);
    g.fill();
  }
  g.fillStyle = '#ffffff';
  g.fillRect(0, h * 0.32, w, h * 0.42);
  g.fillStyle = o.home.primary;
  g.font = `900 ${Math.round(h * 0.4)}px Impact, "Arial Black", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText((o.homeShort ?? o.homeName.slice(0, 3)).toUpperCase(), w / 2, h * 0.54, w * 0.9);
  return g.getImageData(0, 0, w, h).data;
}

function crowdGeometry(): THREE.BufferGeometry {
  const tag = (g: THREE.BufferGeometry, v: number) => {
    g.setAttribute('part', new THREE.Float32BufferAttribute(new Array(g.attributes.position.count).fill(v), 1));
    return g;
  };
  const body = new THREE.CylinderGeometry(0.21, 0.26, 0.78, 7, 1);
  body.translate(0, 0.39, 0);
  const head = new THREE.SphereGeometry(0.16, 7, 5);
  head.translate(0, 0.95, 0);
  const armL = new THREE.BoxGeometry(0.1, 0.5, 0.1);
  armL.translate(-0.27, 0.45, 0);
  const armR = new THREE.BoxGeometry(0.1, 0.5, 0.1);
  armR.translate(0.27, 0.45, 0);
  const scarf = new THREE.BoxGeometry(0.95, 0.14, 0.03);
  scarf.translate(0, 1.3, 0.12);
  return mergeGeometries([tag(body, 0), tag(head, 1), tag(scarf, 2), tag(armL, 3), tag(armR, 3)])!;
}

function scoreboardDraw(g: CanvasRenderingContext2D, o: StadiumOptions, h: number, a: number, label: string) {
  const W = 768;
  const H = 300;
  g.fillStyle = '#05070a';
  g.fillRect(0, 0, W, H);
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, 'rgba(255,255,255,0.06)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, W, H);
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  // Top strip.
  g.fillStyle = '#c6ff3d';
  g.font = 'italic 800 34px "Barlow Condensed", Impact, sans-serif';
  g.fillText('FOOTBALLIFE', W / 2, 38);
  // Team blocks.
  const team = (x: number, col: string, txt: string) => {
    g.fillStyle = col;
    g.fillRect(x - 130, 92, 260, 12);
    g.fillStyle = '#ffffff';
    g.font = '800 64px "Barlow Condensed", Impact, sans-serif';
    g.fillText(txt, x, 150, 250);
  };
  team(150, o.home.primary, (o.homeShort ?? o.homeName.slice(0, 3)).toUpperCase());
  team(W - 150, o.away.primary, (o.awayShort ?? o.awayName.slice(0, 3)).toUpperCase());
  g.fillStyle = '#ffffff';
  g.font = '800 120px "Barlow Condensed", Impact, sans-serif';
  g.fillText(`${h}-${a}`, W / 2, 152);
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.font = '700 40px "Barlow Condensed", Impact, sans-serif';
  g.fillText(label, W / 2, 248);
  g.fillStyle = 'rgba(0,0,0,0.3)';
  for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
}

export function buildStadium(o: StadiumOptions): Stadium {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const ring = makeRing();
  const tmp: RingPt = { x: 0, z: 0, nx: 0, nz: 0 };

  // Ground: a dark apron between the pitch and the stands.
  const groundMat = track(new THREE.MeshStandardMaterial({ color: 0x223a26, roughness: 1 }));
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(2 * RA + 70, 2 * RB + 70)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  group.add(ground);

  // Pitch, with a view-dependent mowing sheen and fine grass breakup.
  const ptex = track(pitchTexture());
  const noise = track(noiseTex());
  noise.repeat.set(70, 46);
  const pitchMat = track(new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.92, bumpMap: noise, bumpScale: 0.6, roughnessMap: noise }));
  const fine = track(noiseTex(128));
  pitchMat.onBeforeCompile = (sh) => {
    sh.uniforms.uFine = { value: fine };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform sampler2D uFine;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float stripeW = ${((PL + 10) / 16).toFixed(4)};
        float sIdx = floor((vWPos.x + ${((PL + 10) / 2).toFixed(4)}) / stripeW);
        float sDir = mod(sIdx, 2.0) < 0.5 ? 1.0 : -1.0;
        vec3 sV = normalize(cameraPosition - vWPos);
        diffuseColor.rgb *= 1.0 + 0.11 * sDir * sV.x + 0.03 * sDir;
        float g1 = texture2D(uFine, vWPos.xz * 0.85).r;
        float g2 = texture2D(uFine, vWPos.xz * 0.11 + 0.37).r;
        diffuseColor.rgb *= 0.9 + 0.13 * g1 + 0.12 * (g2 - 0.5);`);
  };
  const pitch = new THREE.Mesh(track(new THREE.PlaneGeometry(PL + 10, PW + 10)), pitchMat);
  pitch.rotation.x = -Math.PI / 2;
  pitch.receiveShadow = true;
  group.add(pitch);

  // LED boards.
  const btex = track(boardTexture(o));
  const boardMat = track(new THREE.MeshStandardMaterial({ map: btex, emissive: 0xffffff, emissiveMap: btex, emissiveIntensity: o.night ? 1.2 : 0.55, roughness: 0.4 }));
  const boardBack = track(new THREE.MeshStandardMaterial({ color: 0x0c0f12, roughness: 0.6 }));
  const boards: THREE.Texture[] = [];
  const addBoard = (len: number, x: number, z: number, rotY: number) => {
    const tex = btex.clone();
    tex.repeat.set(len / 30, 1);
    tex.needsUpdate = true;
    boards.push(track(tex));
    const mat = boardMat.clone();
    mat.map = tex;
    mat.emissiveMap = tex;
    track(mat);
    const geo = track(new THREE.BoxGeometry(len, 0.9, 0.12));
    const m = new THREE.Mesh(geo, [boardBack, boardBack, boardBack, boardBack, mat, boardBack]);
    m.position.set(x, 0.45, z);
    m.rotation.y = rotY;
    m.castShadow = true;
    group.add(m);
  };
  addBoard(PL + 6, 0, -(PW / 2 + 4), 0);
  addBoard(PL + 6, 0, PW / 2 + 4, Math.PI);
  addBoard(PW - 10, -(PL / 2 + 4), 0, Math.PI / 2);
  addBoard(PW - 10, PL / 2 + 4, 0, -Math.PI / 2);

  // Goals.
  group.add(goal(1), goal(-1));

  // Corner flags.
  const flagMat = track(new THREE.MeshStandardMaterial({ color: 0xc6ff3d, emissive: 0x334400, side: THREE.DoubleSide }));
  const poleMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6)), poleMat);
    pole.position.set((sx * PL) / 2, 0.8, (sz * PW) / 2);
    const flag = new THREE.Mesh(track(new THREE.PlaneGeometry(0.5, 0.35)), flagMat);
    flag.position.set((sx * PL) / 2 + 0.25, 1.4, (sz * PW) / 2);
    pole.castShadow = true;
    group.add(pole, flag);
  }

  // Dugouts on the camera side: perspex shells over two benches.
  const perspex = track(new THREE.MeshPhysicalMaterial({ color: 0xd8ecff, transparent: true, opacity: 0.32, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
  const dugBase = track(new THREE.MeshStandardMaterial({ color: 0x15191e, roughness: 0.7 }));
  for (const side of [0, 1] as const) {
    const dg = new THREE.Group();
    const shell = new THREE.Mesh(track(new THREE.CylinderGeometry(1.7, 1.7, 7, 20, 1, true, 0, Math.PI / 2)), perspex);
    shell.rotation.z = Math.PI / 2;
    shell.position.set(0, 0.4, -0.75);
    const floor = new THREE.Mesh(track(new THREE.BoxGeometry(7, 0.2, 2)), dugBase);
    floor.position.set(0, 0.1, 0);
    const back = new THREE.Mesh(track(new THREE.BoxGeometry(7, 2, 0.15)), dugBase);
    back.position.set(0, 1, 0.95);
    const bench = new THREE.Mesh(track(new THREE.BoxGeometry(6.6, 0.45, 0.6)), track(new THREE.MeshStandardMaterial({ color: side ? o.away.primary : o.home.primary, roughness: 0.4 })));
    bench.position.set(0, 0.45, 0.55);
    dg.add(floor, back, bench, shell);
    dg.position.set(side ? 11 : -11, 0, PW / 2 + 6.2);
    dg.traverse((m) => { (m as THREE.Mesh).castShadow = true; });
    group.add(dg);
  }

  // ---- Bowl ----
  const seatCol = new THREE.Color(o.home.primary);
  {
    const hsl = { h: 0, s: 0, l: 0 };
    seatCol.getHSL(hsl);
    seatCol.setHSL(hsl.h, Math.min(hsl.s, 0.85), Math.min(0.62, Math.max(0.14, hsl.l * 0.85)));
  }
  const seatBack = seatCol.clone().multiplyScalar(0.55);
  const neutralSeat = new THREE.Color(0x59616b);
  const concrete = new THREE.Color(0x8a9097);
  const gangway = new THREE.Color(0xa3a9b0);
  const dark = new THREE.Color(0x1b1f24);
  const awayBlock = (s: SegInfo) => s.zone === 'E' && (s.f0 + s.f1) / 2 > 0.25 && (s.f0 + s.f1) / 2 < 0.75;

  const bowl = new Mesher();
  const walls = new Mesher();
  interface Seat { p: THREE.Vector3; rot: number; zone: Zone; row: number; u: number; away: boolean; ultra: boolean }
  const seats: Seat[] = [];
  const seatOf = (d0: number, h: number, row: number, upper: boolean) => (s: SegInfo) => {
    if (s.gang) return;
    ring[s.piece].at(d0 + SD * 0.42, (s.f0 + s.f1) / 2, tmp);
    const away = !upper && awayBlock(s);
    seats.push({
      p: new THREE.Vector3(tmp.x, h, tmp.z),
      rot: Math.atan2(-tmp.nx, -tmp.nz),
      zone: s.zone,
      row,
      u: (s.f0 + s.f1) / 2,
      away,
      ultra: s.zone === 'W',
    });
  };
  const seatColor = (upper: boolean) => (s: SegInfo) => (s.gang ? gangway : !upper && awayBlock(s) ? neutralSeat : seatCol.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.04));

  // Lower tier.
  for (let i = 0; i < LOW_ROWS; i++) {
    // Risers read as the backs of the seats in the row in front.
    strip(i ? bowl : walls, ring, lowD(i), i ? lowH(i - 1) : 0, lowD(i), lowH(i), { seg: 3, face: 'in', color: () => (i ? seatBack : dark) });
    strip(bowl, ring, lowD(i), lowH(i), lowD(i + 1), lowH(i), { seg: 0.7, face: 'up', uv: 'seat', color: seatColor(false), onSeg: seatOf(lowD(i), lowH(i), i, false) });
  }
  // Hospitality level: parapet, walkway, glass boxes, upper tier overhang.
  const vipFloor = lowH(LOW_ROWS - 1) + 0.75;
  strip(walls, ring, lowD(LOW_ROWS), lowH(LOW_ROWS - 1), lowD(LOW_ROWS), vipFloor, { seg: 3, face: 'in', color: () => dark });
  strip(walls, ring, lowD(LOW_ROWS), vipFloor, 13.3, vipFloor, { seg: 3, face: 'up', color: () => concrete });
  const glassM = new Mesher();
  strip(glassM, ring, 13.3, vipFloor, 13.3, 10.6, { seg: 2, face: 'in', uv: 'run', uScale: 8, color: () => new THREE.Color(1, 1, 1) });
  strip(walls, ring, 13.3, 10.6, 12.2, 10.6, { seg: 3, face: 'down', color: () => dark });
  const ribbonM = new Mesher();
  strip(ribbonM, ring, 12.2, 10.6, 12.2, 11.6, { seg: 2, face: 'in', uv: 'run', uScale: 32, color: () => new THREE.Color(1, 1, 1) });
  strip(walls, ring, 12.2, 11.6, upD(0), 11.6, { seg: 3, face: 'up', color: () => dark });
  // Upper tier.
  for (let j = 0; j < UP_ROWS; j++) {
    strip(j ? bowl : walls, ring, upD(j), j ? upH(j - 1) : 11.6, upD(j), upH(j), { seg: 3, face: 'in', color: () => (j ? seatBack : concrete) });
    strip(bowl, ring, upD(j), upH(j), upD(j + 1), upH(j), { seg: 0.7, face: 'up', uv: 'seat', color: seatColor(true), onSeg: seatOf(upD(j), upH(j), LOW_ROWS + j, true) });
  }
  // Back wall, roof and outer facade.
  const roofUnder = new THREE.Color(0xc4cad1);
  const roofTop = new THREE.Color(0x4f565e);
  const roofTop2 = new THREE.Color(0x5d656e);
  const clubBand = new THREE.Color(o.home.primary);
  strip(walls, ring, BACK_D, upH(UP_ROWS - 1), BACK_D, ROOF_UNDER_OUT, { seg: 3, face: 'in', color: () => dark });
  strip(walls, ring, BACK_D, ROOF_UNDER_OUT, ROOF_IN, ROOF_UNDER_IN, { seg: 3, face: 'down', color: () => roofUnder });
  strip(walls, ring, ROOF_IN, ROOF_UNDER_IN - 1.2, ROOF_IN, ROOF_TOP_IN, { seg: 3, face: 'in', color: () => dark });
  strip(walls, ring, ROOF_IN, ROOF_UNDER_IN - 1.2, ROOF_IN + 0.15, ROOF_UNDER_IN - 1.2, { seg: 3, face: 'down', color: () => dark });
  strip(walls, ring, ROOF_IN + 0.15, ROOF_UNDER_IN - 1.2, ROOF_IN + 0.15, ROOF_UNDER_IN, { seg: 3, face: 'out', color: () => dark });
  strip(walls, ring, ROOF_IN, ROOF_TOP_IN, FACADE_D, ROOF_TOP_OUT, { seg: 1.8, face: 'up', color: (s) => (s.i % 2 ? roofTop : roofTop2) });
  strip(walls, ring, FACADE_D, 0, FACADE_D, 19, { seg: 1.6, face: 'out', color: (s) => (s.i % 2 ? new THREE.Color(0x2b3138) : new THREE.Color(0x3c434c)) });
  strip(walls, ring, FACADE_D, 19, FACADE_D, 22.5, { seg: 3, face: 'out', color: () => clubBand });
  strip(walls, ring, FACADE_D, 22.5, FACADE_D, ROOF_TOP_OUT, { seg: 3, face: 'out', color: () => dark });

  const seatMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, map: track(seatTexture()), roughness: 0.72 }));
  const concreteU = { value: concrete.clone().multiplyScalar(0.92) };
  seatMat.onBeforeCompile = (sh) => {
    sh.uniforms.uConcrete = concreteU;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uConcrete;')
      .replace('#include <map_fragment>', 'vec4 sMap = texture2D(map, vMapUv);')
      .replace('#include <color_fragment>', 'diffuseColor.rgb = mix(uConcrete, vColor.rgb, sMap.a) * sMap.rgb;');
  };
  const bowlMesh = new THREE.Mesh(track(bowl.geometry()), seatMat);
  bowlMesh.receiveShadow = true;
  bowlMesh.castShadow = true;
  const wallMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 }));
  const wallMesh = new THREE.Mesh(track(walls.geometry()), wallMat);
  wallMesh.receiveShadow = true;
  wallMesh.castShadow = true;
  const gtex = track(glassTexture());
  const glassMat = track(new THREE.MeshStandardMaterial({ map: gtex, emissive: 0xffffff, emissiveMap: gtex, emissiveIntensity: o.night ? 1.1 : 0.55, roughness: 0.15, metalness: 0.3 }));
  const glassMesh = new THREE.Mesh(track(glassM.geometry()), glassMat);
  const rtex = track(ribbonTexture(o));
  const ribbonMat = track(new THREE.MeshStandardMaterial({ map: rtex, emissive: 0xffffff, emissiveMap: rtex, emissiveIntensity: o.night ? 1.1 : 0.6, roughness: 0.4 }));
  const ribbonMesh = new THREE.Mesh(track(ribbonM.geometry()), ribbonMat);
  group.add(bowlMesh, wallMesh, glassMesh, ribbonMesh);

  // Roof trusses and the floodlight ring along the fascia.
  const along = (d: number, spacing: number, fn: (p: RingPt, k: number) => void) => {
    let k = 0;
    for (const pc of ring) {
      const n = Math.max(1, Math.round(pc.len(d) / spacing));
      for (let i = 0; i < n; i++) fn(pc.at(d, (i + 0.5) / n, { x: 0, z: 0, nx: 0, nz: 0 }), k++);
    }
  };
  const ribPts: RingPt[] = [];
  along((ROOF_IN + BACK_D) / 2, 9, (p) => ribPts.push(p));
  const ribLen = BACK_D - ROOF_IN;
  const ribs = new THREE.InstancedMesh(track(new THREE.BoxGeometry(0.35, 1.1, ribLen)), track(new THREE.MeshStandardMaterial({ color: 0xe2e6ea, roughness: 0.5, metalness: 0.4 })), ribPts.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler(0, 0, 0, 'YXZ');
  const one = new THREE.Vector3(1, 1, 1);
  const slope = Math.atan2(ROOF_UNDER_OUT - ROOF_UNDER_IN, ribLen);
  ribPts.forEach((p, i) => {
    e.set(-slope, Math.atan2(p.nx, p.nz), 0);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(p.x, (ROOF_UNDER_IN + ROOF_UNDER_OUT) / 2 - 0.55, p.z), q, one);
    ribs.setMatrixAt(i, m4);
  });
  ribs.castShadow = true;
  group.add(ribs);

  const lampPts: RingPt[] = [];
  along(ROOF_IN + 0.9, 3.4, (p) => lampPts.push(p));
  const lampMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: o.night ? 5 : 0.35, roughness: 0.3 }));
  const lamps = new THREE.InstancedMesh(track(new THREE.BoxGeometry(1.3, 0.5, 0.8)), lampMat, lampPts.length);
  lampPts.forEach((p, i) => {
    e.set(0.6, Math.atan2(-p.nx, -p.nz), 0);
    q.setFromEuler(e);
    m4.compose(new THREE.Vector3(p.x, ROOF_UNDER_IN - 1.45, p.z), q, one);
    lamps.setMatrixAt(i, m4);
  });
  group.add(lamps);

  // Big screens hanging in the two far corners.
  const sbCanvas = document.createElement('canvas');
  sbCanvas.width = 768;
  sbCanvas.height = 300;
  const sbCtx = sbCanvas.getContext('2d')!;
  scoreboardDraw(sbCtx, o, 0, 0, 'KICK-OFF');
  const sbTex = track(new THREE.CanvasTexture(sbCanvas));
  sbTex.colorSpace = THREE.SRGBColorSpace;
  sbTex.anisotropy = 8;
  const sbMat = track(new THREE.MeshStandardMaterial({ map: sbTex, emissive: 0xffffff, emissiveMap: sbTex, emissiveIntensity: o.night ? 1.0 : 0.85, roughness: 0.5 }));
  const sbBack = track(new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.6, metalness: 0.3 }));
  for (const pi of [5, 7]) {
    const p = ring[pi].at(6, 0.5, { x: 0, z: 0, nx: 0, nz: 0 });
    const scr = new THREE.Group();
    const box = new THREE.Mesh(track(new THREE.BoxGeometry(10.2, 4, 0.5)), [sbBack, sbBack, sbBack, sbBack, sbMat, sbBack]);
    scr.add(box);
    for (const sx of [-4, 4]) {
      const cable = new THREE.Mesh(track(new THREE.CylinderGeometry(0.04, 0.04, 3.4, 4)), sbBack);
      cable.position.set(sx, 3.7, 0);
      scr.add(cable);
    }
    scr.position.set(p.x, ROOF_UNDER_IN - 5.4, p.z);
    group.add(scr);
    scr.lookAt(0, 8, 0);
  }

  // ---- Crowd ----
  // The home end (W) is the singing section: always full, its shirts form a
  // tifo. The away block sits in the lower tier of the E end.
  const crowdGeo = track(crowdGeometry());
  const ultraRows = o.crowd >= 9000 ? LOW_ROWS + UP_ROWS : LOW_ROWS;
  const must = seats.filter((s) => s.away || (s.ultra && s.row < ultraRows));
  const rest = seats.filter((s) => !(s.away || (s.ultra && s.row < ultraRows)));
  // Lower rows fill first, like a real gate.
  const keyed = rest.map((s) => ({ s, k: s.row * 0.15 + Math.random() * 10 })).sort((a, b) => a.k - b.k);
  const chosen = must.concat(keyed.slice(0, Math.max(0, o.crowd - must.length)).map((x) => x.s));
  const n = chosen.length;

  const tifoW = Math.max(1, Math.round(ring[4].len(0) / 0.7));
  const tifoH = LOW_ROWS + UP_ROWS;
  const tifo = tifoCanvas(o, tifoW, tifoH);

  const crowdMat = track(new THREE.MeshStandardMaterial({ roughness: 0.75 }));
  const uniforms = { uTime: { value: 0 }, uExcite: { value: 0 }, uCheer: { value: -1 } };
  crowdMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float part; attribute vec4 aInfo; attribute vec3 aSkin; attribute vec4 aScarf;
        uniform float uTime; uniform float uExcite; uniform float uCheer;
        varying float vPart; varying vec3 vSkin; varying vec3 vScarf;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPart = part; vSkin = aSkin; vScarf = aScarf.rgb;
        float ph = aInfo.x; float ultra = aInfo.w;
        float mine = (uCheer < -0.5 || abs(aInfo.y - uCheer) < 0.1) ? 1.0 : 0.2;
        float hype = uExcite * mine;
        float stand = max(1.0 - aInfo.z, max(ultra, smoothstep(0.2, 0.45, hype - ph * 0.15)));
        float up = clamp(hype * 1.8 - ph * 0.7, 0.0, 1.0);
        float sing = ultra * step(0.45, fract(ph * 7.31));
        up = max(up, sing * (0.74 + 0.26 * sin(uTime * 2.4 + ph * 3.0)));
        if (part > 2.5) {
          float sx = transformed.x > 0.0 ? 1.0 : -1.0;
          vec3 sp = vec3(sx * 0.25, 0.7, 0.0);
          vec3 l = transformed - sp;
          float th = -up * 2.75;
          float cs = cos(th); float sn = sin(th);
          l = vec3(l.x, l.y * cs - l.z * sn, l.y * sn + l.z * cs);
          l.x += sx * up * 0.12 * max(0.0, l.y);
          transformed = sp + l;
        } else if (part > 1.5) {
          float on = aScarf.w * smoothstep(0.55, 0.85, up);
          transformed.x += sin(uTime * 2.2 + ph * 6.0) * 0.08;
          transformed = mix(vec3(0.0, 0.45, 0.0), transformed, on);
        } else if (part > 0.5) {
          transformed.x += sin(uTime * 1.3 + ph * 9.0) * 0.03;
        }
        transformed.y -= (1.0 - stand) * 0.3;
        transformed.y += max(0.0, sin(uTime * (2.6 + hype * 6.5 + ultra * 1.4) + ph * 6.2832)) * (0.012 + hype * 0.42 + ultra * 0.09);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vPart; varying vec3 vSkin; varying vec3 vScarf;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (vPart > 1.5 && vPart < 2.5) diffuseColor.rgb = vScarf;
        else if (vPart > 0.5 && vPart < 1.5) diffuseColor.rgb = vSkin;`);
  };
  const crowd = new THREE.InstancedMesh(crowdGeo, crowdMat, n);
  const info = new Float32Array(n * 4);
  const skin = new Float32Array(n * 3);
  const scarf = new Float32Array(n * 4);
  const SK = ['#f6d7c3', '#e9b994', '#d39a6a', '#b07548', '#8a5530', '#5e3a20'].map((c) => new THREE.Color(c));
  const homeC = new THREE.Color(o.home.primary);
  const homeS = new THREE.Color(o.home.secondary);
  const awayC = new THREE.Color(o.away.primary);
  const awayS = new THREE.Color(o.away.secondary);
  const misc = [0xffffff, 0x2a2f36, 0x3b6fd0, 0xe5e7eb, 0x111111, 0x7a828c].map((c) => new THREE.Color(c));
  const sc = new THREE.Vector3();
  const tcol = new THREE.Color();
  const flagSpots: { s: Seat; away: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const c = chosen[i];
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.rot);
    const k = 0.9 + Math.random() * 0.25;
    sc.set(k, k, k);
    m4.compose(c.p, q, sc);
    crowd.setMatrixAt(i, m4);
    const r = Math.random();
    let col: THREE.Color;
    let scarfC = c.away ? awayS : homeS;
    if (c.away) col = r < 0.8 ? awayC : r < 0.9 ? awayS : misc[i % misc.length];
    else if (c.ultra && c.row < tifoH) {
      const px = Math.min(tifoW - 1, Math.floor(c.u * tifoW));
      const py = tifoH - 1 - c.row;
      const k4 = (py * tifoW + px) * 4;
      tcol.setRGB(tifo[k4] / 255, tifo[k4 + 1] / 255, tifo[k4 + 2] / 255, THREE.SRGBColorSpace);
      col = tcol;
      scarfC = r < 0.5 ? homeC : homeS;
    } else col = r < 0.5 ? homeC : r < 0.66 ? homeS : misc[i % misc.length];
    crowd.setColorAt(i, col.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.07));
    const ph = Math.random();
    info.set([ph, c.away ? 1 : 0, c.ultra || c.away ? 0 : Math.random() < 0.8 ? 1 : 0, c.ultra ? 1 : 0], i * 4);
    const s = SK[Math.floor(Math.random() * SK.length)];
    skin.set([s.r, s.g, s.b], i * 3);
    const hasScarf = c.ultra || c.away ? 1 : Math.random() < 0.35 ? 1 : 0;
    scarf.set([scarfC.r, scarfC.g, scarfC.b, hasScarf], i * 4);
    if ((c.ultra && Math.random() < 0.012) || (c.away && Math.random() < 0.016)) flagSpots.push({ s: c, away: c.away });
  }
  crowdGeo.setAttribute('aInfo', new THREE.InstancedBufferAttribute(info, 4));
  crowdGeo.setAttribute('aSkin', new THREE.InstancedBufferAttribute(skin, 3));
  crowdGeo.setAttribute('aScarf', new THREE.InstancedBufferAttribute(scarf, 4));
  crowd.instanceMatrix.needsUpdate = true;
  crowd.frustumCulled = false;
  crowd.receiveShadow = true;
  group.add(crowd);

  // Waving flags on poles in the singing sections.
  const flagGeo = track(new THREE.PlaneGeometry(1.9, 1.15, 12, 4));
  flagGeo.translate(0.95, -0.575, 0);
  const flagC1 = new Float32Array(flagSpots.length * 3);
  const flagC2 = new Float32Array(flagSpots.length * 3);
  const flagPh = new Float32Array(flagSpots.length);
  const wave = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85 });
  track(wave);
  wave.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec3 aC1; attribute vec3 aC2; attribute float aPh; uniform float uTime;
        varying vec3 vC1; varying vec3 vC2; varying vec2 vFU;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vC1 = aC1; vC2 = aC2; vFU = uv;
        float fw = transformed.x / 1.9;
        transformed.z += sin(transformed.x * 3.0 - uTime * 5.5 + aPh * 6.28) * 0.24 * fw;
        transformed.y += sin(transformed.x * 2.0 - uTime * 4.0 + aPh) * 0.06 * fw - fw * fw * 0.12;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vC1; varying vec3 vC2; varying vec2 vFU;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = vFU.x < 0.5 ? vC1 : vC2;`);
  };
  const flags = new THREE.InstancedMesh(flagGeo, wave, Math.max(1, flagSpots.length));
  const poles = new THREE.InstancedMesh(track(new THREE.CylinderGeometry(0.025, 0.025, 2.6, 5)), track(new THREE.MeshStandardMaterial({ color: 0xd8d8d8 })), Math.max(1, flagSpots.length));
  flags.count = poles.count = flagSpots.length;
  flagSpots.forEach((f, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.s.rot);
    const base = f.s.p.clone().add(new THREE.Vector3(0, 1.1, 0));
    m4.compose(base.clone().add(new THREE.Vector3(0, 1.3, 0)), q, one);
    poles.setMatrixAt(i, m4);
    m4.compose(base.clone().add(new THREE.Vector3(0, 2.6, 0)), q, one);
    flags.setMatrixAt(i, m4);
    const [c1, c2] = f.away ? [awayC, awayS] : i % 3 === 2 ? [homeS, homeC] : [homeC, homeS];
    flagC1.set([c1.r, c1.g, c1.b], i * 3);
    flagC2.set([c2.r, c2.g, c2.b], i * 3);
    flagPh[i] = Math.random();
  });
  flagGeo.setAttribute('aC1', new THREE.InstancedBufferAttribute(flagC1, 3));
  flagGeo.setAttribute('aC2', new THREE.InstancedBufferAttribute(flagC2, 3));
  flagGeo.setAttribute('aPh', new THREE.InstancedBufferAttribute(flagPh, 1));
  flags.frustumCulled = poles.frustumCulled = false;
  group.add(flags, poles);

  // Sky dome: clouds and a sun glow by day, stars and city glow by night.
  const sunDir = new THREE.Vector3(-40, 55, 60).normalize();
  const skyMat = track(new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(o.night ? 0x040814 : 0x2f74d0) },
      mid: { value: new THREE.Color(o.night ? 0x0b1630 : 0x8fc0ee) },
      bot: { value: new THREE.Color(o.night ? 0x1d2440 : 0xe6dcc4) },
      night: { value: o.night ? 1 : 0 },
      sunDir: { value: sunDir },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; uniform float night; uniform vec3 sunDir; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h2(i), h2(i+vec2(1.0,0.0)), f.x), mix(h2(i+vec2(0.0,1.0)), h2(i+vec2(1.0,1.0)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 5; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){ vec3 d = normalize(vP); float y = d.y;
        vec3 c = y > 0.12 ? mix(mid, top, smoothstep(0.12, 0.75, y)) : mix(bot, mid, smoothstep(-0.05, 0.12, y));
        if (night < 0.5) {
          float sd = max(0.0, dot(d, sunDir));
          c += vec3(1.0, 0.86, 0.62) * (pow(sd, 6.0) * 0.22 + pow(sd, 400.0) * 1.6);
          if (y > 0.0) { vec2 uv = d.xz / (y + 0.12) * 1.4; float cl = smoothstep(0.52, 0.86, fbm(uv));
            c = mix(c, vec3(0.93, 0.95, 0.98), cl * 0.8 * smoothstep(0.0, 0.22, y)); }
        } else {
          if (y > 0.15) { vec3 q = floor(d * 380.0); c += step(0.9972, h(q)) * 0.85 * smoothstep(0.15, 0.55, y); }
          c += vec3(0.32, 0.3, 0.42) * (1.0 - smoothstep(-0.02, 0.28, y)) * 0.3;
        }
        gl_FragColor = vec4(c, 1.0); }`,
  }));
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(500, 32, 16)), skyMat);
  group.add(sky);

  let boardOffset = 0;
  let sbKey = '';
  return {
    group,
    update(time, excitement) {
      uniforms.uTime.value = time;
      uniforms.uExcite.value = excitement;
      boardOffset += 0.0006 + excitement * 0.003;
      for (const b of boards) b.offset.x = boardOffset;
      rtex.offset.x = -boardOffset * 0.6;
      lampMat.emissiveIntensity = o.night ? 5 + excitement * 1.5 : 0.35;
    },
    setCheer(side) {
      uniforms.uCheer.value = side;
    },
    setScoreboard(h, a, label) {
      const key = `${h}|${a}|${label}`;
      if (key === sbKey) return;
      sbKey = key;
      scoreboardDraw(sbCtx, o, h, a, label);
      sbTex.needsUpdate = true;
    },
    dispose() {
      for (const d of disposables) d.dispose();
      crowd.dispose();
      ribs.dispose();
      lamps.dispose();
      flags.dispose();
      poles.dispose();
    },
  };
}
