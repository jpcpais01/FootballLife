// Small building blocks shared by the home, its furniture and the outdoors:
// cached materials, rounded boxes, painted canvas textures.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export function canvasTex(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  paint(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}

export function rand(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export interface MatOpts {
  rough?: number;
  metal?: number;
  emissive?: string;
  glow?: number;
  clear?: boolean;
  sheen?: boolean;
  glass?: boolean;
  opacity?: number;
}

/**
 * Materials are cached by look and shared across scenes, so a rebuilt room
 * never compiles new shaders for the same sofa. They are never disposed.
 */
const matCache = new Map<string, THREE.Material>();
export function mat(color: string, o: MatOpts = {}) {
  const key = `${color}|${o.rough}|${o.metal}|${o.emissive}|${o.glow}|${o.clear}|${o.sheen}|${o.glass}|${o.opacity}`;
  let m = matCache.get(key);
  if (!m) {
    if (o.glass) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.04, metalness: 0.1, transparent: true, opacity: o.opacity ?? 0.22, depthWrite: false, envMapIntensity: 1.6 });
    } else {
      const p = new THREE.MeshPhysicalMaterial({
        color,
        roughness: o.rough ?? 0.6,
        metalness: o.metal ?? 0,
        clearcoat: o.clear ? 1 : 0,
        clearcoatRoughness: 0.1,
        emissive: o.emissive ?? '#000000',
        emissiveIntensity: o.emissive ? o.glow ?? 1.6 : 0,
      });
      if (o.sheen) {
        p.sheen = 1;
        p.sheenRoughness = 0.6;
        p.sheenColor = new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.35);
      }
      m = p;
    }
    matCache.set(key, m);
  }
  return m;
}

export function isShared(m: THREE.Material) {
  for (const v of matCache.values()) if (v === m) return true;
  return false;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function rounded(w: number, h: number, d: number, r: number) {
  const key = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${r.toFixed(3)}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, 2, r);
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g;
}

/** A box with softly rounded edges (r = 0 for a sharp one). */
export function box(w: number, h: number, d: number, m: THREE.Material, r = 0.03) {
  const rr = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const mesh = new THREE.Mesh(rr > 0.002 ? rounded(w, h, d, rr) : new THREE.BoxGeometry(w, h, d), m);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function cyl(rt: number, rb: number, h: number, m: THREE.Material, seg = 24) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

export function sphere(r: number, m: THREE.Material, seg = 20) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg * 0.6) | 0), m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** A tube along a smooth curve through points. */
export function tube(pts: [number, number, number][], r: number, m: THREE.Material, seg = 32) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, seg, r, 8, false), m);
  mesh.castShadow = true;
  return mesh;
}

export function at<T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0): T {
  o.position.set(x, y, z);
  o.rotation.y = ry;
  return o;
}

/**
 * Box UVs in metres instead of 0..1 per face, so a tiled texture (bricks,
 * planks) keeps its real size on every wall piece.
 */
export function worldUV(g: THREE.BufferGeometry, w: number, h: number, d: number, ox = 0, oy = 0) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  // BoxGeometry faces in order: +x, -x, +y, -y, +z, -z, four vertices each.
  const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] + ox, uv.getY(i) * dims[f][1] + oy);
    }
  }
  uv.needsUpdate = true;
  return g;
}

// ---------- shared textures ----------

const texCache = new Map<string, THREE.Texture>();
export function cachedTex(key: string, make: () => THREE.Texture) {
  let t = texCache.get(key);
  if (!t) {
    t = make();
    t.userData.shared = true;
    texCache.set(key, t);
  }
  return t;
}

/** A soft dark blob that sits under furniture: cheap ambient occlusion. */
export function blobTex() {
  return cachedTex('blob', () => {
    const t = canvasTex(128, 128, (g) => {
      const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64);
      gr.addColorStop(0, 'rgba(0,0,0,0.85)');
      gr.addColorStop(0.55, 'rgba(0,0,0,0.45)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
    });
    t.colorSpace = THREE.NoColorSpace;
    return t;
  });
}

/** Darkening along the foot of a wall, fading out across the floor. */
export function edgeTex() {
  return cachedTex('edge', () => {
    const t = canvasTex(8, 64, (g) => {
      const gr = g.createLinearGradient(0, 0, 0, 64);
      gr.addColorStop(0, 'rgba(0,0,0,0.5)');
      gr.addColorStop(0.35, 'rgba(0,0,0,0.18)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 8, 64);
    });
    t.colorSpace = THREE.NoColorSpace;
    return t;
  });
}

const blobMat = () => cachedMat('blob', () => new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: blobTex(), transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
const matCache2 = new Map<string, THREE.Material>();
export function cachedMat(key: string, make: () => THREE.Material) {
  let m = matCache2.get(key);
  if (!m) {
    m = make();
    matCache.set(`__${key}`, m);
    matCache2.set(key, m);
  }
  return m;
}

const planeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
planeGeo.userData.shared = true;

/** A contact shadow under something w × d (in its own frame). */
export function blob(w: number, d: number, strength = 1) {
  const m = new THREE.Mesh(planeGeo, strength === 1 ? blobMat() : cachedMat(`blob${strength}`, () => new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: blobTex(), transparent: true, opacity: 0.55 * strength, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })));
  m.scale.set(w + 0.5, 1, d + 0.5);
  m.position.y = 0.004;
  m.renderOrder = 1;
  return m;
}

export function edgeShade(len: number) {
  const m = new THREE.Mesh(planeGeo, cachedMat('edge', () => new THREE.MeshBasicMaterial({ color: '#000000', alphaMap: edgeTex(), transparent: true, opacity: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 })));
  m.scale.set(len, 1, 0.5);
  return m;
}
