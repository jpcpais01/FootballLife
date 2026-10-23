// The training ground: the academy's practice pitch at golden hour, where your
// player runs the drills at true size on real grass. The page drives the timing
// game; this scene plays each rep's outcome with ball trails, net ripples,
// slow motion on a perfect hit and a camera that knows where to look.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { randomAppearance, type Appearance } from '../../shared/appearance.ts';
import type { Equipped } from '../../shared/cosmetics.ts';
import { sfx } from '../audio.ts';
import { Figure, GK_KITS, LIFE_SCALE, type Kit } from './figures.ts';
import type { ActionKind } from './rig/animator.ts';
import { B } from './rig/skeleton.ts';

export type DrillId = 'shooting' | 'passing' | 'sprint' | 'defending' | 'keeper';
export type Outcome = 'perfect' | 'good' | 'miss';
/** `hero` is the slow close-up between sessions; `play` frames the drill. */
export type View = 'hero' | 'play';

export interface TrainingGround {
  setPlayer(app: Appearance, eq: Equipped, kit: Kit, keeper: boolean): void;
  setDrill(d: DrillId): void;
  setView(v: View): void;
  /** Lights up the target for the coming rep. */
  prepare(rep: number): void;
  /** Plays one rep; resolves when the scene is ready for the next. */
  play(o: Outcome): Promise<void>;
  /** Back to the start positions. */
  reset(): void;
  cheer(): void;
  /** Moves the canvas into a new container and resumes rendering. */
  attach(host: HTMLElement): void;
  /** Stops rendering and takes the canvas off the page, keeping everything loaded for the next visit. */
  park(): void;
  dispose(): void;
}

const LIME = 0xc6ff3d;
const GOAL_Z = -18;
const GOAL_W = 7.32;
const GOAL_H = 2.44;
const BALL_R = 0.11;
const SHOT_Z = -4;
const GATE_GAP = 5;
const G = 9.8;
/** Where he stands for each drill (x, z) and the way he faces. */
const MARK: Record<DrillId, { x: number; z: number; face: number }> = {
  shooting: { x: -0.75, z: SHOT_Z + 1.25, face: Math.PI },
  passing: { x: 0, z: 0.6, face: Math.PI },
  sprint: { x: 0, z: 3, face: Math.PI },
  defending: { x: 0, z: -2, face: Math.PI },
  keeper: { x: 0, z: GOAL_Z + 0.6, face: 0 },
};

function defaultQuality(): 'high' | 'low' {
  const coarse = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 700;
  return coarse || small ? 'low' : 'high';
}

// ---------- Textures ----------

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

/** Cheap repeatable noise for textures and shapes. */
function hash(x: number, y: number, z = 0) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number, z = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash(xi + dx, yi + dy, zi + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}

/** The practice pitch: checkerboard mowing, a full box, wear where the drills happen. */
function pitchTexture() {
  const S = 24; // px per metre
  const W = 84;
  return canvasTex(W * S, W * S, (g) => {
    const N = W * S;
    // Mowing: long stripes with a fainter cross cut.
    for (let i = 0; i < 14; i++) {
      g.fillStyle = i % 2 ? '#3d8f37' : '#4a9f40';
      g.fillRect(0, (i * N) / 14, N, N / 14 + 1);
    }
    g.globalAlpha = 0.07;
    for (let i = 0; i < 14; i += 2) {
      g.fillStyle = '#ffffff';
      g.fillRect((i * N) / 14, 0, N / 14, N);
    }
    g.globalAlpha = 1;
    // Broad patches of richer and drier grass, then fine grain.
    const img = g.getImageData(0, 0, N, N);
    const d = img.data;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = (y * N + x) * 4;
        const big = vnoise(x / 140, y / 140) * 0.6 + vnoise(x / 47, y / 47) * 0.4 - 0.5;
        const n = (Math.random() - 0.5) * 18 + big * 30;
        d[i] += n * 0.55 + big * 10;
        d[i + 1] += n;
        d[i + 2] += n * 0.3;
      }
    }
    g.putImageData(img, 0, 0);
    const X = (x: number) => (x + W / 2) * S;
    const Z = (z: number) => (z + W / 2) * S;
    // Wear: the goalmouth, the penalty spot and the shooting mark.
    const wear = (x: number, z: number, r: number, a: number) => {
      const grd = g.createRadialGradient(X(x), Z(z), 0, X(x), Z(z), r * S);
      grd.addColorStop(0, `rgba(150,128,78,${a})`);
      grd.addColorStop(0.6, `rgba(130,120,70,${a * 0.45})`);
      grd.addColorStop(1, 'rgba(130,120,70,0)');
      g.fillStyle = grd;
      g.fillRect(X(x - r), Z(z - r), r * 2 * S, r * 2 * S);
    };
    wear(0, GOAL_Z + 0.8, 3.2, 0.55);
    wear(0, GOAL_Z + 11, 1.4, 0.4);
    wear(-0.4, SHOT_Z + 0.6, 1.8, 0.45);
    wear(0, -2, 2.2, 0.25);
    // Lines, slightly soft, the way chalk sits in grass.
    g.strokeStyle = 'rgba(250,250,240,0.88)';
    g.lineWidth = 0.12 * S;
    g.shadowColor = 'rgba(255,255,255,0.4)';
    g.shadowBlur = 2;
    g.beginPath();
    g.moveTo(X(-34), Z(GOAL_Z));
    g.lineTo(X(34), Z(GOAL_Z));
    g.stroke();
    g.strokeRect(X(-20.16), Z(GOAL_Z), 40.32 * S, 16.5 * S);
    g.strokeRect(X(-9.16), Z(GOAL_Z), 18.32 * S, 5.5 * S);
    g.fillStyle = 'rgba(250,250,240,0.9)';
    g.beginPath();
    g.arc(X(0), Z(GOAL_Z + 11), 0.11 * S, 0, Math.PI * 2);
    g.fill();
    const a = Math.acos(5.5 / 9.15);
    g.beginPath();
    g.arc(X(0), Z(GOAL_Z + 11), 9.15 * S, a, Math.PI - a);
    g.stroke();
    // Halfway line and the edge of the centre circle at the far side.
    g.beginPath();
    g.moveTo(X(-34), Z(GOAL_Z + 52.5));
    g.lineTo(X(34), Z(GOAL_Z + 52.5));
    g.stroke();
    g.beginPath();
    g.moveTo(X(-34), Z(GOAL_Z));
    g.lineTo(X(-34), Z(42));
    g.moveTo(X(34), Z(GOAL_Z));
    g.lineTo(X(34), Z(42));
    g.stroke();
  });
}

/** Fine blade grain, tiled every couple of metres and multiplied into the grass. */
function bladeTexture() {
  const N = 256;
  const t = canvasTex(N, N, (g) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, N, N);
    for (let i = 0; i < 5200; i++) {
      const x = Math.random() * N;
      const y = Math.random() * N;
      const l = 3 + Math.random() * 6;
      const v = Math.floor(70 + Math.random() * 130);
      g.strokeStyle = `rgb(${v},${v},${v})`;
      g.lineWidth = 0.7 + Math.random() * 0.8;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 3, y - l);
      g.stroke();
      // Draw across the seams too so the tile repeats cleanly.
      if (x < 8 || y < 10) {
        g.beginPath();
        g.moveTo(x + N, y + N);
        g.lineTo(x + N + (Math.random() - 0.5) * 3, y + N - l);
        g.stroke();
      }
    }
  }, false);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function netTexture() {
  const t = canvasTex(64, 64, (g) => {
    g.strokeStyle = 'rgba(255,255,255,0.95)';
    g.lineWidth = 2.2;
    // Diamond mesh.
    g.beginPath();
    g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath();
    g.stroke();
    for (const [x, y] of [[0, 0], [64, 0], [0, 64], [64, 64]]) {
      g.beginPath(); g.arc(x, y, 1.2, 0, Math.PI * 2); g.stroke();
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function fenceTexture() {
  const t = canvasTex(64, 64, (g) => {
    g.strokeStyle = 'rgba(40,52,46,1)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(64, 64);
    g.moveTo(64, 0); g.lineTo(0, 64);
    g.stroke();
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function ballTexture() {
  return canvasTex(512, 256, (g) => {
    g.fillStyle = '#f6f6f1';
    g.fillRect(0, 0, 512, 256);
    // A modern panel ball: dark swooshes with a lime accent.
    for (let i = 0; i < 6; i++) {
      const x = i * 86 + 20;
      g.fillStyle = '#16181b';
      g.beginPath();
      g.moveTo(x, 128);
      g.quadraticCurveTo(x + 30, 60, x + 70, 70);
      g.quadraticCurveTo(x + 40, 100, x + 44, 128);
      g.quadraticCurveTo(x + 40, 156, x + 70, 186);
      g.quadraticCurveTo(x + 30, 196, x, 128);
      g.fill();
      g.fillStyle = '#c6ff3d';
      g.beginPath();
      g.arc(x + 58, 128, 7, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#d0d0c8';
    g.fillRect(0, 0, 512, 10);
    g.fillRect(0, 246, 512, 10);
  });
}

/** A soft round shadow for contact under the feet. */
function blobTexture() {
  return canvasTex(128, 128, (g) => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, 'rgba(0,0,0,0.75)');
    grd.addColorStop(0.45, 'rgba(0,0,0,0.35)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
  }, false);
}

/** The academy's name across the building. */
function signTexture() {
  return canvasTex(1024, 160, (g) => {
    g.fillStyle = '#14181d';
    g.fillRect(0, 0, 1024, 160);
    g.fillStyle = '#c6ff3d';
    g.fillRect(36, 34, 92, 92);
    g.fillStyle = '#14181d';
    g.font = 'italic 900 64px "Barlow Condensed", Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('FL', 82, 84);
    g.fillStyle = '#f2f2ec';
    g.textAlign = 'left';
    g.font = 'italic 800 84px "Barlow Condensed", Impact, sans-serif';
    g.fillText('FOOTBALL LIFE ACADEMY', 160, 86);
  });
}

// ---------- Shapes ----------

/** Keeps only position and normal, adds a flat vertex colour: ready to merge. */
function prep(geo: THREE.BufferGeometry, color: THREE.Color, shade?: (y: number) => number) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const s = shade ? shade(pos.getY(i)) : 1;
    col[i * 3] = color.r * s;
    col[i * 3 + 1] = color.g * s;
    col[i * 3 + 2] = color.b * s;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** A lumpy leaf cluster: a low-poly sphere pushed about by noise, smooth shaded. */
function blob(r: number, seed: number, detail = 1) {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = vnoise(v.x * 2.2 + seed, v.y * 2.2, v.z * 2.2) * 0.6 + vnoise(v.x * 5 + 3, v.y * 5 + seed, v.z * 5) * 0.4;
    v.multiplyScalar(0.72 + n * 0.55);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * One tree: a trunk with a couple of limbs and a crown built from many leaf
 * clusters, darker underneath and inside. `kind` 0-2 are broadleaf, 3 a conifer.
 */
function treeGeometry(seed: number, kind: number) {
  const rnd = (k: number) => hash(seed, k);
  const parts: THREE.BufferGeometry[] = [];
  const bark = new THREE.Color(0x3d3027);
  if (kind === 3) {
    const h = 2;
    parts.push(prep(new THREE.CylinderGeometry(0.12, 0.22, h + 6, 6).translate(0, (h + 6) / 2, 0), bark));
    const dark = new THREE.Color().setHSL(0.36, 0.38, 0.13);
    for (let i = 0; i < 6; i++) {
      const r = 2.4 - i * 0.34;
      const y = h + i * 1.25;
      const c = new THREE.ConeGeometry(r, 2.6, 9, 1, true).translate(0, y + 1.3, 0);
      parts.push(prep(c, dark.clone().offsetHSL(0, 0, (rnd(i) - 0.5) * 0.03), (yy) => 0.55 + 0.5 * Math.min(1, (yy - y) / 2.6)));
    }
    return mergeGeometries(parts)!;
  }
  const h = 2.6 + rnd(1) * 0.9;
  parts.push(prep(new THREE.CylinderGeometry(0.17, 0.3, h + 1.2, 7).translate(0, (h + 1.2) / 2, 0), bark));
  for (let i = 0; i < 3; i++) {
    const limb = new THREE.CylinderGeometry(0.07, 0.12, 2, 5).translate(0, 1, 0);
    limb.rotateZ(0.6 + rnd(i + 20) * 0.3).rotateY(i * 2.1 + rnd(i));
    parts.push(prep(limb.translate(0, h - 0.2, 0), bark));
  }
  const cw = 2.4 + rnd(2) * 0.8;
  const ch = 2.1 + rnd(3) * 0.7;
  const cy = h + ch * 0.85;
  const leaf = new THREE.Color().setHSL(0.24 + rnd(4) * 0.07, 0.44 + rnd(5) * 0.12, 0.15 + rnd(6) * 0.04);
  const shade = (y: number) => 0.42 + 0.78 * Math.min(1, Math.max(0, (y - (cy - ch)) / (ch * 2)));
  parts.push(prep(blob(cw * 0.78, seed, 2).scale(1, ch / cw, 1).translate(0, cy, 0), leaf.clone().multiplyScalar(0.7), shade));
  const n = 22;
  for (let i = 0; i < n; i++) {
    // Clusters spread over the crown's surface, fewer underneath.
    const u = rnd(i * 3 + 30);
    const t = rnd(i * 3 + 31) * Math.PI * 2;
    const yv = 1 - u * 1.55;
    const rr = Math.sqrt(Math.max(0, 1 - yv * yv));
    const d = 0.7 + rnd(i * 3 + 32) * 0.25;
    const r = 0.75 + rnd(i + 70) * 0.6;
    const c = leaf.clone().offsetHSL((rnd(i + 80) - 0.5) * 0.03, 0, (rnd(i + 90) - 0.5) * 0.05);
    parts.push(prep(blob(r, seed * 13 + i).translate(Math.cos(t) * rr * cw * d, cy + yv * ch * d, Math.sin(t) * rr * cw * d), c, shade));
  }
  return mergeGeometries(parts)!;
}

/** A flat cut-out of a player, the kind clubs stand in a free-kick wall. */
function mannequinGeometry() {
  const s = new THREE.Shape();
  const pts: [number, number][] = [
    [-0.12, 0], [-0.17, 0.82], [-0.25, 1.02], [-0.27, 1.42], [-0.12, 1.5], [-0.07, 1.56],
    [-0.1, 1.66], [-0.06, 1.78], [0.06, 1.78], [0.1, 1.66], [0.07, 1.56], [0.12, 1.5],
    [0.27, 1.42], [0.25, 1.02], [0.17, 0.82], [0.12, 0], [0.03, 0], [0, 0.72], [-0.03, 0],
  ];
  s.moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
  return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.015, bevelSegments: 2 }).translate(0, 0, -0.025);
}

const ease = (u: number) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);

// Post: a gentle golden grade with a vignette.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uStrength: { value: 0.36 }, uSat: { value: 1.1 }, uWarm: { value: 0.035 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uStrength; uniform float uSat; uniform float uWarm; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb += vec3(uWarm, uWarm * 0.4, -uWarm) * (1.0 - l);
      vec2 d = vUv - 0.5; float v = 1.0 - dot(d, d) * uStrength * 2.2; c.rgb *= v; gl_FragColor = c; }`,
};

export function createTrainingGround(initialHost: HTMLElement): TrainingGround {
  let host = initialHost;
  const quality = defaultQuality();
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.5));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.style.cssText = 'width:100%;height:100%;display:block';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);
  const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.05, 900);
  let elapsed = 0;
  const shaderTime = { value: 0 };

  // ---- Light: low golden sun, a cool sky fill ----
  const sunDir = new THREE.Vector3(-0.62, 0.42, 0.66).normalize();
  const sun = new THREE.DirectionalLight(0xffdcae, 3.4);
  sun.position.copy(sunDir).multiplyScalar(50);
  sun.castShadow = true;
  const shadowSize = quality === 'high' ? 4096 : 2048;
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 140 });
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  sun.target.position.set(0, 0, -8);
  sun.position.add(sun.target.position);
  scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x405a2c, 0.55));

  // ---- Sky: gradient, drifting clouds and a warm sun glow ----
  const skyMat = track(new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { sunDir: { value: sunDir }, uTime: shaderTime },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 sunDir; uniform float uTime; varying vec3 vP;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * n(p); p *= 2.03; a *= 0.5; } return v; }
      void main(){
        vec3 d = normalize(vP); float y = d.y;
        vec3 top = vec3(0.09,0.25,0.6), mid = vec3(0.4,0.56,0.82), hor = vec3(1.0,0.74,0.5);
        vec3 c = y > 0.0 ? mix(hor, mid, smoothstep(0.0, 0.16, y)) : hor * 0.9;
        c = mix(c, top, smoothstep(0.16, 0.75, y));
        float s = max(0.0, dot(d, sunDir));
        c += vec3(1.0,0.62,0.32) * pow(s, 6.0) * 0.45 + vec3(1.0,0.9,0.7) * pow(s, 900.0) * 6.0;
        if (y > 0.0) {
          vec2 uv = d.xz / (y + 0.12) * 1.6 + vec2(uTime * 0.006, uTime * 0.002);
          float cl = smoothstep(0.46, 0.78, fbm(uv));
          vec3 cc = mix(vec3(1.0,0.86,0.72), vec3(1.0,0.97,0.92), smoothstep(0.0, 0.5, y)) + vec3(1.0,0.6,0.3) * pow(s, 4.0) * 0.5;
          c = mix(c, cc, cl * smoothstep(0.0, 0.1, y) * 0.85);
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  const sky = new THREE.Mesh(track(new THREE.SphereGeometry(600, 40, 20)), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);
  // Image-based light from the same sky, so reflections and fill match the backdrop.
  {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envMat = skyMat.clone();
    envMat.uniforms = skyMat.uniforms;
    envMat.fragmentShader = skyMat.fragmentShader.replace('#include <tonemapping_fragment>', '').replace('#include <colorspace_fragment>', '');
    const envSky = new THREE.Mesh(sky.geometry, envMat);
    envSky.scale.setScalar(0.1);
    envScene.add(envSky);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(50, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x2c4a22 }));
    floor.position.y = -2;
    envScene.add(floor);
    const env = pmrem.fromScene(envScene, 0.02).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    disposables.push(env, pmrem, envSky.material as THREE.Material, floor.geometry, floor.material as THREE.Material);
  }
  scene.fog = new THREE.Fog(0xd2c7ae, 80, 420);

  // ---- Ground ----
  const blade = track(bladeTexture());
  const grassMat = track(new THREE.MeshStandardMaterial({ map: track(pitchTexture()), roughness: 0.92, bumpMap: blade, bumpScale: 1.2 }));
  blade.repeat.set(48, 48);
  grassMat.onBeforeCompile = (sh) => {
    sh.uniforms.uBlade = { value: blade };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uBlade;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n  float bl = texture2D(uBlade, vMapUv * 48.0).r; float bl2 = texture2D(uBlade, vMapUv * 7.0 + 0.37).r;\n  diffuseColor.rgb *= mix(0.74, 1.22, bl) * mix(0.9, 1.08, bl2);');
  };
  const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(84, 84)), grassMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  // The rest of the grounds: rougher, unmown grass out to the trees.
  const roughGrass = track(new THREE.MeshStandardMaterial({ color: 0x4d7434, roughness: 1, bumpMap: blade, bumpScale: 1 }));
  const outer = new THREE.Mesh(track(new THREE.RingGeometry(40, 700, 64, 1).rotateX(-Math.PI / 2)), roughGrass);
  outer.position.y = -0.02;
  outer.receiveShadow = true;
  scene.add(outer);
  // Distant hills, hazy in the fog.
  {
    const segs = 96;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const hgt = 10 + vnoise(i * 0.18, 3.1) * 26 + vnoise(i * 0.6, 7.7) * 8;
      for (const [r, y] of [[260, -1], [300, hgt], [380, hgt * 1.6]] as const) pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      if (i < segs) for (const k of [0, 1]) { const b = i * 3 + k; idx.push(b, b + 3, b + 1, b + 1, b + 3, b + 4); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const hills = new THREE.Mesh(track(g), track(new THREE.MeshStandardMaterial({ color: 0x48653e, roughness: 1, side: THREE.DoubleSide })));
    scene.add(hills);
  }

  // ---- Trees, swaying a little in the evening breeze ----
  const treeMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  treeMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = shaderTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float ph = instanceMatrix[3].x * 0.13 + instanceMatrix[3].z * 0.07;
        #else
          float ph = 0.0;
        #endif
        float sway = max(0.0, position.y - 3.0) * 0.014;
        transformed.x += sin(uTime * 1.1 + ph) * sway;
        transformed.z += cos(uTime * 0.8 + ph * 1.3) * sway * 0.6;
        vLeaf = position * 3.1 + vec3(ph * 7.0);`)
      .replace('#include <common>', '#include <common>\nvarying vec3 vLeaf;');
    // Leaf speckle: breaks the smooth clusters into foliage.
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLeaf;\nfloat lh0(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }\nfloat lh(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);\n  return mix(mix(mix(lh0(i), lh0(i + vec3(1,0,0)), f.x), mix(lh0(i + vec3(0,1,0)), lh0(i + vec3(1,1,0)), f.x), f.y), mix(mix(lh0(i + vec3(0,0,1)), lh0(i + vec3(1,0,1)), f.x), mix(lh0(i + vec3(0,1,1)), lh0(i + vec3(1,1,1)), f.x), f.y), f.z); }')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= vColor.g > vColor.r * 1.15 ? mix(0.55, 1.25, lh(vLeaf * 1.7)) * mix(0.8, 1.12, lh(vLeaf * 0.45)) : 1.0;');
  };
  const trees: THREE.InstancedMesh[] = [];
  {
    const variants = [treeGeometry(1, 0), treeGeometry(2, 1), treeGeometry(3, 3), treeGeometry(4, 2), treeGeometry(5, 0)].map(track);
    const spots: THREE.Matrix4[][] = variants.map(() => []);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let k = 0;
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2 + hash(i, 4) * 0.04;
      const r = 54 + hash(i, 5) * 40;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      // Leave the academy building in view.
      if (z < -48 && Math.abs(x - 6) < 34) continue;
      const s = 0.8 + hash(i, 6) * 0.6;
      m.compose(new THREE.Vector3(x, 0, z), q.setFromEuler(new THREE.Euler(0, hash(i, 7) * 6.28, 0)), new THREE.Vector3(s, s * (0.9 + hash(i, 8) * 0.3), s));
      spots[k++ % variants.length].push(m.clone());
    }
    variants.forEach((g, vi) => {
      const im = new THREE.InstancedMesh(g, treeMat, spots[vi].length);
      spots[vi].forEach((mm, j) => im.setMatrixAt(j, mm));
      // Well outside the sun's shadow box, so they only need to receive light.
      scene.add(im);
      trees.push(im);
    });
  }

  // ---- The academy: a modern two-storey block behind the goal ----
  const concrete = track(new THREE.MeshStandardMaterial({ color: 0xd9d4ca, roughness: 0.8 }));
  const darkMetal = track(new THREE.MeshStandardMaterial({ color: 0x23282e, roughness: 0.45, metalness: 0.6 }));
  const white = track(new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 }));
  const lime = track(new THREE.MeshStandardMaterial({ color: LIME, emissive: LIME, emissiveIntensity: 0.25, roughness: 0.4 }));
  {
    const b = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(track(geo), mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      b.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(52, 0.6, 16), concrete, 0, 0.3, 0);
    // Ground floor: glass behind slim columns; warm light inside.
    const glass = track(new THREE.MeshPhysicalMaterial({ color: 0x8aa2b4, roughness: 0.07, metalness: 1, envMapIntensity: 1.4 }));
    add(new THREE.BoxGeometry(48, 3.6, 12), glass, 0, 2.4, 0);
    // Upper floor: dark cladding with vertical fins and a ribbon window.
    add(new THREE.BoxGeometry(52, 4.4, 15), darkMetal, 0, 6.4, 0.2);
    const ribbon = add(new THREE.BoxGeometry(44, 1.6, 0.1), glass, -2, 6.5, 7.75);
    ribbon.castShadow = false;
    const fins = new THREE.InstancedMesh(track(new THREE.BoxGeometry(0.18, 4.4, 0.5)), white, 27);
    const mm = new THREE.Matrix4();
    for (let i = 0; i < 27; i++) fins.setMatrixAt(i, mm.makeTranslation(-25 + i * (50 / 26), 6.4, 7.95));
    fins.castShadow = true;
    b.add(fins);
    add(new THREE.BoxGeometry(52.6, 0.35, 15.6), lime, 0, 8.75, 0.2);
    add(new THREE.BoxGeometry(53, 0.4, 17), white, 0, 9.1, 0.4);
    for (let i = 0; i < 9; i++) add(new THREE.BoxGeometry(0.35, 3.6, 0.35), white, -24 + i * 6, 2.4, 6.2);
    // Name board on the roof line.
    const sign = new THREE.Mesh(track(new THREE.PlaneGeometry(22, 3.4)), track(new THREE.MeshStandardMaterial({ map: track(signTexture()), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0.05, roughness: 0.5 })));
    sign.position.set(-6, 11.2, 0.4);
    b.add(sign);
    add(new THREE.BoxGeometry(22.4, 0.2, 0.6), darkMetal, -6, 9.4, 0.4);
    b.position.set(6, 0, -60);
    scene.add(b);
  }

  // ---- A small covered stand along the left touchline ----
  {
    const st = new THREE.Group();
    const seatMat = track(new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.55 }));
    const accent = track(new THREE.MeshStandardMaterial({ color: LIME, roughness: 0.5 }));
    const L = 30;
    for (let r = 0; r < 5; r++) {
      const step = new THREE.Mesh(track(new THREE.BoxGeometry(1.1, 0.5 + r * 0.5, L)), concrete);
      step.position.set(-r * 1.1, (0.5 + r * 0.5) / 2, 0);
      step.castShadow = step.receiveShadow = true;
      st.add(step);
    }
    const seatGeo = track(new THREE.BoxGeometry(0.45, 0.45, 0.48).translate(0, 0.22, 0));
    const seats = new THREE.InstancedMesh(seatGeo, seatMat, 5 * 56);
    const seats2 = new THREE.InstancedMesh(seatGeo, accent, 5 * 56);
    const m = new THREE.Matrix4();
    let a = 0, b2 = 0;
    for (let r = 0; r < 5; r++) {
      for (let i = 0; i < 56; i++) {
        m.makeTranslation(-r * 1.1 - 0.15, 0.5 + r * 0.5, -L / 2 + 0.4 + i * ((L - 0.8) / 55));
        // An "FL" spelled in lime seats would be lovely, but a stripe reads at this distance.
        if (i % 14 === 6 || i % 14 === 7) seats2.setMatrixAt(b2++, m);
        else seats.setMatrixAt(a++, m);
      }
    }
    seats.count = a;
    seats2.count = b2;
    seats.castShadow = seats2.castShadow = true;
    st.add(seats, seats2);
    // Cantilever roof on slim columns.
    const roof = new THREE.Mesh(track(new THREE.BoxGeometry(8, 0.25, L + 2)), darkMetal);
    roof.position.set(-2.2, 6.4, 0);
    roof.rotation.z = -0.08;
    roof.castShadow = true;
    st.add(roof);
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(track(new THREE.CylinderGeometry(0.14, 0.14, 6.4, 10)), white);
      c.position.set(-5.6, 3.2, -L / 2 + i * (L / 5));
      c.castShadow = true;
      st.add(c);
    }
    st.position.set(-41, 0, -6);
    scene.add(st);
  }

  // ---- Fence and floodlights around the pitch ----
  {
    const ft = track(fenceTexture());
    const fenceMat = (len: number) => {
      const t = ft.clone();
      t.repeat.set(len / 0.12, 3 / 0.12);
      t.needsUpdate = true;
      track(t);
      return track(new THREE.MeshStandardMaterial({ map: t, alphaMap: t, transparent: true, alphaTest: 0.25, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.4, color: 0x8a948e }));
    };
    const postGeo = track(new THREE.CylinderGeometry(0.04, 0.04, 3.1, 6).translate(0, 1.55, 0));
    for (const [x, z, len, r] of [[0, -44, 88, 0], [0, 44, 88, 0], [-44, 0, 88, Math.PI / 2], [44, 0, 88, Math.PI / 2]] as const) {
      const f = new THREE.Mesh(track(new THREE.PlaneGeometry(len, 3)), fenceMat(len));
      f.position.set(x, 1.5, z);
      f.rotation.y = r;
      scene.add(f);
      const posts = new THREE.InstancedMesh(postGeo, darkMetal, 23);
      const m = new THREE.Matrix4();
      for (let i = 0; i < 23; i++) {
        const t = -len / 2 + i * (len / 22);
        m.makeTranslation(r ? x : t, 0, r ? t : z);
        posts.setMatrixAt(i, m);
      }
      scene.add(posts);
    }
    const lampMat = track(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1d0, emissiveIntensity: 0.7 }));
    for (const [x, z] of [[-46, -46], [46, -46], [-46, 46], [46, 46]]) {
      const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.2, 0.36, 22, 10).translate(0, 11, 0)), darkMetal);
      pole.position.set(x, 0, z);
      pole.castShadow = true;
      const head = new THREE.Group();
      const frame = new THREE.Mesh(track(new THREE.BoxGeometry(4, 2.2, 0.3)), darkMetal);
      head.add(frame);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
        const l = new THREE.Mesh(track(new THREE.BoxGeometry(0.8, 0.8, 0.1)), lampMat);
        l.position.set(-1.45 + i * 0.97, -0.5 + j * 1, 0.18);
        head.add(l);
      }
      head.position.set(x, 22.4, z);
      head.lookAt(0, 0, 0);
      scene.add(pole, head);
    }
  }

  // ---- Training kit lying about ----
  const orange = track(new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.55 }));
  const yellow = track(new THREE.MeshStandardMaterial({ color: 0xffd23d, roughness: 0.55 }));
  const m4 = new THREE.Matrix4();
  // Saucer cones marking out a grid and a slalom.
  {
    const saucer = track(new THREE.CylinderGeometry(0.035, 0.1, 0.055, 16, 1, true).translate(0, 0.0275, 0));
    const a = new THREE.InstancedMesh(saucer, orange, 40);
    const b = new THREE.InstancedMesh(saucer, yellow, 40);
    let na = 0, nb = 0;
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
      const mm = m4.makeTranslation(-16 + i * 2.2, 0, 4 + j * 2.2);
      if ((i + j) % 2) a.setMatrixAt(na++, mm); else b.setMatrixAt(nb++, mm);
    }
    for (let i = 0; i < 10; i++) a.setMatrixAt(na++, m4.makeTranslation(12 + (i % 2) * 0.9, 0, 6 - i * 1.6));
    a.count = na;
    b.count = nb;
    a.castShadow = b.castShadow = true;
    scene.add(a, b);
  }
  // Tall cones by the gates and the box.
  {
    const cone = track(new THREE.ConeGeometry(0.11, 0.32, 16).translate(0, 0.16, 0));
    const c = new THREE.InstancedMesh(cone, orange, 8);
    [[-4.5, -6], [4.5, -6], [-9.2, GOAL_Z + 16.5], [9.2, GOAL_Z + 16.5], [6, 2.5], [6.6, 2.5], [-20.2, GOAL_Z + 16.5], [20.2, GOAL_Z + 16.5]].forEach(([x, z], i) => c.setMatrixAt(i, m4.makeTranslation(x, 0, z)));
    c.castShadow = true;
    scene.add(c);
  }
  // Agility ladder on the grass.
  {
    const ladder = new THREE.InstancedMesh(track(new THREE.BoxGeometry(0.5, 0.012, 0.03)), yellow, 12);
    for (let i = 0; i < 12; i++) ladder.setMatrixAt(i, m4.makeTranslation(-7, 0.006, 4 - i * 0.45));
    const rails = new THREE.InstancedMesh(track(new THREE.BoxGeometry(0.025, 0.01, 0.45 * 11)), yellow, 2);
    [-0.25, 0.25].forEach((sx, i) => rails.setMatrixAt(i, m4.makeTranslation(-7 + sx, 0.005, 4 - 0.45 * 5.5)));
    scene.add(ladder, rails);
  }
  // Mini hurdles.
  {
    const parts = [
      prep(new THREE.BoxGeometry(0.6, 0.03, 0.03).translate(0, 0.3, 0), new THREE.Color(0xff7a1a)),
      prep(new THREE.BoxGeometry(0.03, 0.3, 0.03).translate(-0.3, 0.15, 0), new THREE.Color(0xff7a1a)),
      prep(new THREE.BoxGeometry(0.03, 0.3, 0.03).translate(0.3, 0.15, 0), new THREE.Color(0xff7a1a)),
    ];
    const hg = track(mergeGeometries(parts)!);
    const hurdles = new THREE.InstancedMesh(hg, track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 })), 5);
    for (let i = 0; i < 5; i++) hurdles.setMatrixAt(i, m4.makeTranslation(-11, 0, 3 - i * 1.4));
    hurdles.castShadow = true;
    scene.add(hurdles);
  }
  // Free-kick mannequins.
  {
    const mg = track(mannequinGeometry());
    const mmat = track(new THREE.MeshStandardMaterial({ color: 0x2f6bff, roughness: 0.45 }));
    for (let i = 0; i < 4; i++) {
      const mq = new THREE.Mesh(mg, mmat);
      mq.position.set(11 + i * 0.55, 0, -9);
      mq.rotation.y = -0.35;
      mq.castShadow = true;
      scene.add(mq);
    }
  }
  // Ball cart beside the shooting mark, full of spare balls.
  const ballGeo = track(new THREE.SphereGeometry(BALL_R, 32, 20));
  const ballMat = track(new THREE.MeshPhysicalMaterial({ map: track(ballTexture()), roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.2 }));
  {
    const cart = new THREE.Group();
    const bar = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), darkMetal);
      m.position.set(x, y, z);
      m.castShadow = true;
      cart.add(m);
    };
    for (const sx of [-0.4, 0.4]) for (const sz of [-0.3, 0.3]) bar(0.03, 0.75, 0.03, sx, 0.375, sz);
    for (const y of [0.25, 0.74]) { bar(0.83, 0.025, 0.025, 0, y, -0.3); bar(0.83, 0.025, 0.025, 0, y, 0.3); bar(0.025, 0.025, 0.63, -0.4, y, 0); bar(0.025, 0.025, 0.63, 0.4, y, 0); }
    const balls = new THREE.InstancedMesh(ballGeo, ballMat, 14);
    for (let i = 0; i < 14; i++) {
      const lx = (i % 4) * 0.2 - 0.3, lz = (Math.floor(i / 4) % 3) * 0.2 - 0.2, ly = 0.38 + Math.floor(i / 12) * 0.2;
      balls.setMatrixAt(i, m4.makeRotationFromEuler(new THREE.Euler(i, i * 2, 0)).setPosition(lx, ly, lz));
    }
    balls.castShadow = true;
    cart.add(balls);
    cart.position.set(-3.4, 0, SHOT_Z + 2.4);
    cart.rotation.y = -0.5;
    scene.add(cart);
    // A few strays on the grass.
    const strays = new THREE.InstancedMesh(ballGeo, ballMat, 4);
    [[-2.5, SHOT_Z + 3.1], [-6.5, GOAL_Z + 4], [7.8, GOAL_Z + 1.5], [3.2, 5]].forEach(([x, z], i) => strays.setMatrixAt(i, m4.makeRotationY(i).setPosition(x, BALL_R, z)));
    strays.castShadow = true;
    scene.add(strays);
  }
  // A bench and water bottles by the touchline.
  {
    const bench = new THREE.Group();
    const wood = track(new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.8 }));
    const seat = new THREE.Mesh(track(new THREE.BoxGeometry(3, 0.06, 0.4)), wood);
    seat.position.y = 0.45;
    const back = new THREE.Mesh(track(new THREE.BoxGeometry(3, 0.4, 0.05)), wood);
    back.position.set(0, 0.75, -0.2);
    bench.add(seat, back);
    for (const sx of [-1.3, 1.3]) {
      const leg = new THREE.Mesh(track(new THREE.BoxGeometry(0.05, 0.45, 0.4)), darkMetal);
      leg.position.set(sx, 0.225, 0);
      bench.add(leg);
    }
    const bottle = track(new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10).translate(0, 0.11, 0));
    const bottles = new THREE.InstancedMesh(bottle, lime, 6);
    for (let i = 0; i < 6; i++) bottles.setMatrixAt(i, m4.makeTranslation(-1.2 + i * 0.12, 0.48, 0.05));
    bench.add(bottles);
    bench.traverse((o) => { o.castShadow = true; });
    bench.position.set(-15, 0, -2);
    bench.rotation.y = Math.PI / 2;
    scene.add(bench);
  }

  // ---- Goal, with a net that ripples when it's hit ----
  const postMat = track(new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.25, clearcoat: 1 }));
  const netTex = track(netTexture());
  const netHit = { value: new THREE.Vector3(0, 1, -99) };
  const goalGroup = new THREE.Group();
  {
    const D = 2;
    const r = 0.06;
    const cyl = (len: number) => track(new THREE.CylinderGeometry(r, r, len, 16));
    const p1 = new THREE.Mesh(cyl(GOAL_H), postMat); p1.position.set(-GOAL_W / 2, GOAL_H / 2, 0);
    const p2 = new THREE.Mesh(cyl(GOAL_H), postMat); p2.position.set(GOAL_W / 2, GOAL_H / 2, 0);
    const bar = new THREE.Mesh(cyl(GOAL_W + 2 * r), postMat); bar.rotation.z = Math.PI / 2; bar.position.set(0, GOAL_H, 0);
    for (const m of [p1, p2, bar]) { m.castShadow = true; goalGroup.add(m); }
    // Back stanchions.
    const st = (len: number) => track(new THREE.CylinderGeometry(0.025, 0.025, len, 8));
    for (const sx of [-1, 1]) {
      const s = new THREE.Mesh(st(Math.hypot(D, GOAL_H)), darkMetal);
      s.position.set((sx * GOAL_W) / 2, GOAL_H / 2, -D / 2);
      s.rotation.x = Math.atan2(D, GOAL_H);
      goalGroup.add(s);
    }
    const netMat = (rx: number, ry: number, ripple: boolean) => {
      const t = netTex.clone();
      t.repeat.set(rx, ry);
      t.needsUpdate = true;
      track(t);
      const m = track(new THREE.MeshStandardMaterial({ map: t, alphaMap: t, transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 1 }));
      if (ripple) {
        m.onBeforeCompile = (sh) => {
          sh.uniforms.uHit = netHit;
          sh.uniforms.uTime = shaderTime;
          sh.vertexShader = sh.vertexShader
            .replace('#include <common>', '#include <common>\nuniform vec3 uHit; uniform float uTime;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
              float age = uTime - uHit.z;
              float dd = distance(position.xy, uHit.xy);
              transformed.z -= 0.55 * exp(-dd * dd * 0.9) * exp(-age * 3.2) * cos(age * 13.0 - dd * 3.0) * step(0.0, age);`);
        };
      }
      return m;
    };
    const back = new THREE.Mesh(track(new THREE.PlaneGeometry(GOAL_W, GOAL_H, 36, 12)), netMat(GOAL_W * 7, GOAL_H * 7, true));
    back.position.set(0, GOAL_H / 2, -D);
    const top = new THREE.Mesh(track(new THREE.PlaneGeometry(GOAL_W, D)), netMat(GOAL_W * 7, D * 7, false));
    top.rotation.x = -Math.PI / 2;
    top.position.set(0, GOAL_H, -D / 2);
    goalGroup.add(back, top);
    for (const sd of [-1, 1]) {
      const sg = new THREE.BufferGeometry();
      // A triangle-ish side panel: full height at the posts, sloping back.
      sg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, GOAL_H, 0, 0, GOAL_H, -D, 0, 0, -D], 3));
      sg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2));
      sg.setIndex([0, 1, 2, 0, 2, 3]);
      sg.computeVertexNormals();
      const side = new THREE.Mesh(track(sg), netMat(D * 7, GOAL_H * 7, false));
      side.position.x = (sd * GOAL_W) / 2;
      goalGroup.add(side);
    }
  }
  goalGroup.position.z = GOAL_Z;
  scene.add(goalGroup);

  // Shooting targets: padded hoops strapped into the corners, with an LED ring.
  const targetPts = [new THREE.Vector3(-2.7, 1.78, GOAL_Z + 0.02), new THREE.Vector3(2.7, 0.62, GOAL_Z + 0.02), new THREE.Vector3(2.7, 1.78, GOAL_Z + 0.02), new THREE.Vector3(-2.7, 0.62, GOAL_Z + 0.02)];
  const hoopGeo = track(new THREE.TorusGeometry(0.42, 0.055, 12, 48));
  const ledGeo = track(new THREE.TorusGeometry(0.42, 0.022, 8, 48));
  const discGeo = track(new THREE.CircleGeometry(0.38, 40));
  const hoopMat = track(new THREE.MeshStandardMaterial({ color: 0x1b2026, roughness: 0.6 }));
  const targets = targetPts.map((p) => {
    const g = new THREE.Group();
    const hoop = new THREE.Mesh(hoopGeo, hoopMat);
    hoop.castShadow = true;
    const led = new THREE.Mesh(ledGeo, track(new THREE.MeshStandardMaterial({ color: 0xf4f4f4, emissive: LIME, emissiveIntensity: 0, roughness: 0.3 })));
    led.position.z = 0.05;
    const disc = new THREE.Mesh(discGeo, track(new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })));
    g.add(hoop, led, disc);
    g.position.copy(p);
    scene.add(g);
    return { g, led: led.material as THREE.MeshStandardMaterial, disc: disc.material as THREE.MeshBasicMaterial };
  });

  // Rebound boards for passing, with a lit strip along the top.
  const boardPts = [new THREE.Vector3(-8, 0, -11), new THREE.Vector3(0, 0, -14), new THREE.Vector3(8, 0, -11)];
  const boardFace = track(new THREE.MeshStandardMaterial({ color: 0x2b333b, roughness: 0.5 }));
  const boards = boardPts.map((p) => {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(track(new THREE.BoxGeometry(1.8, 0.5, 0.12)), boardFace);
    frame.position.y = 0.3;
    frame.rotation.x = -0.18;
    const strip = new THREE.Mesh(track(new THREE.BoxGeometry(1.7, 0.06, 0.04)), track(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: LIME, emissiveIntensity: 0, roughness: 0.3 })));
    strip.position.set(0, 0.53, 0.1);
    strip.rotation.x = -0.18;
    const stripe = new THREE.Mesh(track(new THREE.PlaneGeometry(1.5, 0.08)), lime);
    stripe.position.set(0, 0.28, 0.07);
    stripe.rotation.x = -0.18;
    for (const sx of [-0.8, 0.8]) {
      const leg = new THREE.Mesh(track(new THREE.BoxGeometry(0.06, 0.06, 0.5)), darkMetal);
      leg.position.set(sx, 0.03, -0.2);
      g.add(leg);
    }
    g.add(frame, strip, stripe);
    g.position.copy(p);
    g.lookAt(0, 0, 0.6);
    g.traverse((o) => { (o as THREE.Mesh).castShadow = true; });
    scene.add(g);
    return { g, led: strip.material as THREE.MeshStandardMaterial };
  });

  // Sprint gates: arches with a light bar and a timing line across the grass.
  const gates: { g: THREE.Group; led: THREE.MeshStandardMaterial; line: THREE.MeshBasicMaterial }[] = [];
  for (let i = 1; i <= 6; i++) {
    const g = new THREE.Group();
    const led = track(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: LIME, emissiveIntensity: 0.08, roughness: 0.3 }));
    for (const sx of [-1.25, 1.25]) {
      const pole = new THREE.Mesh(track(new THREE.CylinderGeometry(0.035, 0.035, 1.7, 10)), yellow);
      pole.position.set(sx, 0.85, 0);
      pole.castShadow = true;
      const foot = new THREE.Mesh(track(new THREE.CylinderGeometry(0.14, 0.16, 0.05, 16)), darkMetal);
      foot.position.set(sx, 0.025, 0);
      g.add(pole, foot);
    }
    const bar = new THREE.Mesh(track(new THREE.BoxGeometry(2.56, 0.07, 0.07)), led);
    bar.position.y = 1.72;
    const line = track(new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0.18, depthWrite: false }));
    const strip = new THREE.Mesh(track(new THREE.PlaneGeometry(2.5, 0.08).rotateX(-Math.PI / 2)), line);
    strip.position.y = 0.006;
    g.add(bar, strip);
    g.position.set(0, 0, 2 - i * GATE_GAP);
    scene.add(g);
    gates.push({ g, led, line });
  }

  // ---- The ball, its trail, and the effects ----
  const ball = new THREE.Mesh(ballGeo, ballMat);
  ball.castShadow = true;
  scene.add(ball);

  const TRAIL = 22;
  const trailPts: THREE.Vector3[] = [];
  const trailGeo = track(new THREE.BufferGeometry());
  trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 2 * 3), 3));
  trailGeo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(TRAIL * 2), 1));
  {
    const idx: number[] = [];
    for (let i = 0; i < TRAIL - 1; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    trailGeo.setIndex(idx);
  }
  const trailColor = { value: new THREE.Color(0xffffff) };
  const trail = new THREE.Mesh(trailGeo, track(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uColor: trailColor },
    vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 uColor; varying float vA; void main(){ gl_FragColor = vec4(uColor * vA, vA); }',
  })));
  trail.frustumCulled = false;
  scene.add(trail);
  let trailOn = false;

  const shock = new THREE.Mesh(track(new THREE.RingGeometry(0.8, 1, 48)), track(new THREE.MeshBasicMaterial({ color: LIME, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })));
  scene.add(shock);
  const CHIPS = 220;
  const chips = new THREE.InstancedMesh(track(new THREE.PlaneGeometry(0.07, 0.045)), track(new THREE.MeshBasicMaterial({ side: THREE.DoubleSide })), CHIPS);
  chips.frustumCulled = false;
  chips.count = 0;
  scene.add(chips);
  const chipState: { p: THREE.Vector3; v: THREE.Vector3; r: THREE.Euler; life: number; s: number; drag: number }[] = [];

  // Soft contact shadows that follow the hips (the sun's shadow does the rest).
  const blobMat = track(new THREE.MeshBasicMaterial({ map: track(blobTexture()), transparent: true, depthWrite: false, opacity: 0.55, polygonOffset: true, polygonOffsetFactor: -2 }));
  const blobGeo = track(new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2));
  const meBlob = new THREE.Mesh(blobGeo, blobMat);
  const dummyBlob = new THREE.Mesh(blobGeo, blobMat);
  const ballBlob = new THREE.Mesh(track(new THREE.PlaneGeometry(0.34, 0.34).rotateX(-Math.PI / 2)), blobMat);
  meBlob.position.y = dummyBlob.position.y = ballBlob.position.y = 0.004;
  scene.add(meBlob, dummyBlob, ballBlob);

  // ---- Characters: true size, standing on the grass ----
  let me: Figure | null = null;
  let keeper = false;
  let kit: Kit = { primary: '#1d2329', secondary: '#c6ff3d' };
  const dummy = new Figure({ primary: '#ff7a1a', secondary: '#1b1b1b' }, randomAppearance(Math.random), false, GK_KITS[0], undefined, { base: false, scale: LIFE_SCALE, detail: 'mid' });
  dummy.root.traverse((o) => { o.castShadow = true; });
  scene.add(dummy.root);

  // ---- Post-processing ----
  const w0 = host.clientWidth || 800;
  const h0 = host.clientHeight || 450;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(w0, h0, { type: THREE.HalfFloatType, samples: quality === 'high' ? 4 : 2 }));
  composer.addPass(new RenderPass(scene, camera));
  let gtao: GTAOPass | undefined;
  if (quality === 'high') {
    gtao = new GTAOPass(scene, camera, w0, h0);
    gtao.updateGtaoMaterial({ radius: 0.7, distanceExponent: 1.4, thickness: 0.6, scale: 1.1, samples: 16 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 5, rings: 2, samples: 12 });
    gtao.blendIntensity = 0.9;
    composer.addPass(gtao);
  }
  const bloom = new UnrealBloomPass(new THREE.Vector2(w0, h0), 0.32, 0.55, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(new ShaderPass(GradeShader));

  // ---- State and animation plumbing ----
  let drill: DrillId = 'shooting';
  let view: View = 'hero';
  let rep = 0;
  let mode: 'idle' | 'busy' = 'idle';
  let cheerUntil = 0;
  /** Scene time runs slow for a beat on a perfect hit. */
  let timeScale = 1;
  let slowUntil = 0;
  let realTime = 0;
  let shake = 0;
  /** Camera push toward a moment (a target being hit). */
  const punchAt = new THREE.Vector3();
  let punch = 0;
  let punchUntil = 0;
  const tasks: ((dt: number) => boolean)[] = [];
  const tween = (sec: number, fn: (u: number) => void) =>
    new Promise<void>((res) => {
      let t = 0;
      tasks.push((dt) => {
        t += dt;
        const u = Math.min(1, t / sec);
        fn(u);
        if (u >= 1) res();
        return u >= 1;
      });
    });
  const wait = (sec: number) => tween(sec, () => {});
  let juggling = true;
  const camPos = new THREE.Vector3(0, 3, 8);
  const camLook = new THREE.Vector3(0, 1, -10);
  const camPosT = camPos.clone();
  const camLookT = camLook.clone();
  let viewShift = 0;

  const slowmo = (realSec: number, at?: THREE.Vector3) => {
    slowUntil = realTime + realSec;
    if (at) {
      punchAt.copy(at);
      punchUntil = realTime + realSec + 0.25;
    }
  };

  const burst = (at: THREE.Vector3, colors: number[], n = 80, o: { speed?: number; up?: number; size?: number; life?: number; drag?: number } = {}) => {
    const sp = o.speed ?? 4.5;
    const up = o.up ?? 3.2;
    for (let i = 0; i < n; i++) {
      if (chipState.length >= CHIPS) chipState.shift();
      chipState.push({
        p: at.clone(),
        v: new THREE.Vector3((Math.random() - 0.5) * sp, up * (0.5 + Math.random()), (Math.random() - 0.5) * sp),
        r: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        life: (o.life ?? 1.6) * (0.75 + Math.random() * 0.5),
        s: (o.size ?? 1) * (0.7 + Math.random() * 0.6),
        drag: o.drag ?? 0.9,
      });
      chips.setColorAt(chipState.length - 1, new THREE.Color(colors[i % colors.length]));
    }
    if (chips.instanceColor) chips.instanceColor.needsUpdate = true;
  };
  /** Bits of turf and dust kicked up at a strike. */
  const turf = (at: THREE.Vector3) => burst(at.clone().setY(0.03), [0x3f7d2e, 0x5a9a3c, 0x7a6a48, 0x4c8a34], 16, { speed: 1.6, up: 1.4, size: 0.55, life: 0.9, drag: 1.5 });
  const ring = (at: THREE.Vector3, up = true, color = LIME) => {
    shock.position.copy(at);
    shock.rotation.set(up ? -Math.PI / 2 : 0, 0, 0);
    (shock.material as THREE.MeshBasicMaterial).color.setHex(color);
    void tween(0.6, (u) => {
      shock.scale.setScalar(0.3 + u * 1.6);
      (shock.material as THREE.MeshBasicMaterial).opacity = (1 - u) * 0.9;
    });
  };
  const flash = (m: THREE.MeshStandardMaterial, base = 0, peak = 3) =>
    tween(0.9, (u) => {
      m.emissiveIntensity = base + (1 - u) * peak;
    });

  const faceTo = (f: Figure, x: number, z: number) => {
    f.root.rotation.y = Math.atan2(x - f.root.position.x, z - f.root.position.z);
  };
  const flight = (from: THREE.Vector3, to: THREE.Vector3, h: number, sec: number, spin = 12) =>
    tween(sec, (u) => {
      ball.position.lerpVectors(from, to, u);
      ball.position.y += 4 * h * u * (1 - u);
      ball.rotation.x -= spin * 0.016;
    });
  /** Where the root must stand, facing `heading`, for bone `b` to meet `at` at the contact of `kind`. */
  const standFor = (f: Figure, kind: ActionKind, b: number, at: THREE.Vector3, heading: number) => {
    const keep = f.root.rotation.y;
    const pos = f.root.position.clone();
    f.root.rotation.y = heading;
    f.root.position.set(0, 0, 0);
    f.root.updateMatrixWorld();
    const off = f.partAt(kind, b, f.contactTime(kind));
    f.root.rotation.y = keep;
    f.root.position.copy(pos);
    f.root.updateMatrixWorld();
    return new THREE.Vector3(at.x - off.x, 0, at.z - off.z);
  };
  /** Waits for a walk or a turn on the spot to finish, at most `max` seconds. */
  const moved = (f: Figure, max = 3) =>
    new Promise<void>((res) => {
      let t = 0;
      tasks.push((dt) => {
        t += dt;
        const done = (!f.busyMoving && !f.acting) || t >= max;
        if (done) res();
        return done;
      });
    });
  /** Waits for the body to finish what it's doing (a dive and getting back up), at most `max` seconds. */
  const settle = (f: Figure, max = 3) =>
    new Promise<void>((res) => {
      let t = 0;
      tasks.push((dt) => {
        t += dt;
        const done = !f.acting || t >= max;
        if (done) res();
        return done;
      });
    });

  const startPositions = () => {
    tasks.length = 0;
    trailOn = false;
    trailPts.length = 0;
    juggling = drill !== 'keeper' && drill !== 'defending';
    if (me) {
      me.pose = '';
      me.root.visible = true;
    }
    dummy.root.visible = drill === 'defending' || drill === 'keeper';
    dummy.pose = '';
    goalGroup.visible = drill === 'shooting' || drill === 'keeper';
    for (const t of targets) {
      t.g.visible = drill === 'shooting';
      t.led.emissiveIntensity = 0;
      t.disc.opacity = 0;
    }
    for (const b of boards) {
      b.g.visible = drill === 'passing';
      b.led.emissiveIntensity = 0;
    }
    for (const g of gates) g.g.visible = drill === 'sprint';
    const mk = MARK[drill];
    if (me) {
      me.root.position.set(mk.x, 0, mk.z);
      me.root.rotation.y = mk.face;
    }
    switch (drill) {
      case 'shooting':
        ball.position.set(0, BALL_R, SHOT_Z);
        break;
      case 'defending':
        dummy.root.position.set(0, 0, -14);
        faceTo(dummy, 0, 0);
        ball.position.set(0, BALL_R, -14 + 0.55);
        break;
      case 'keeper':
        dummy.root.position.set(0.7, 0, GOAL_Z + 12.1);
        faceTo(dummy, 0, GOAL_Z);
        ball.position.set(0, BALL_R, GOAL_Z + 11);
        break;
      default:
        break;
    }
    aimCamera();
  };

  /** The drill's gameplay framing (camera position and look-at). */
  const playCam = () => {
    switch (drill) {
      case 'shooting': return { pos: [2.5, 2.4, SHOT_Z + 8.4], look: [-0.3, 0.7, GOAL_Z + 3] };
      case 'passing': return { pos: [0, 6.2, 8.5], look: [0, 0, -6.5] };
      case 'sprint': {
        const z = me ? me.root.position.z : 3;
        return { pos: [6.2, 2.2, z + 1.4], look: [0, 0.9, z - 3] };
      }
      case 'defending': return { pos: [4.8, 2.6, 2.6], look: [0, 0.8, -6.5] };
      case 'keeper': return { pos: [-2.6, 2.1, GOAL_Z + 12.5], look: [0, 1.1, GOAL_Z] };
    }
  };
  /** Sets where the camera eases to this frame: a slow orbit round him at rest, the drill's framing in play. */
  const aimCamera = () => {
    if (view === 'play' || !me) {
      const c = playCam();
      camPosT.set(c.pos[0], c.pos[1], c.pos[2]);
      camLookT.set(c.look[0], c.look[1], c.look[2]);
      return;
    }
    const p = me.root.position;
    const mk = MARK[drill];
    const a = mk.face + 0.62 + Math.sin(elapsed * 0.11) * 0.32;
    const r = 3.3 + Math.sin(elapsed * 0.07) * 0.25;
    camPosT.set(p.x + Math.sin(a) * r, 1.15 + Math.sin(elapsed * 0.09) * 0.12, p.z + Math.cos(a) * r);
    camLookT.set(p.x, 0.95, p.z);
  };

  // ---- Reps ----
  async function playShooting(o: Outcome) {
    if (!me) return;
    const t = targetPts[rep % 4];
    juggling = false;
    ball.position.set(0, BALL_R, SHOT_Z);
    // A couple of strides in, timed so the boot meets the ball on the spot.
    const heading = Math.atan2(t.x - ball.position.x, t.z - ball.position.z);
    const spot = standFor(me, 'shot', B.RightToeBase, ball.position, heading);
    const from = me.root.position.clone();
    const run = 0.6;
    me.act('shot', { contactIn: run });
    const h0 = me.root.rotation.y;
    await tween(run, (u) => {
      me!.root.position.lerpVectors(from, spot, u);
      me!.root.rotation.y = h0 + (heading - h0) * Math.min(1, u * 2);
    });
    sfx('kick', o === 'perfect' ? 1 : 0.8);
    turf(ball.position);
    const start = ball.position.clone();
    let to: THREE.Vector3;
    if (o === 'perfect') to = t.clone();
    else if (o === 'good') to = new THREE.Vector3(-t.x * 0.3 + (Math.random() - 0.5) * 1.4, 0.45 + Math.random() * 1.3, GOAL_Z - 1.5);
    else to = Math.random() < 0.5 ? new THREE.Vector3(Math.sign(Math.random() - 0.5) * 5.2, 0.8 + Math.random(), GOAL_Z - 3) : new THREE.Vector3((Math.random() - 0.5) * 4, 3.9, GOAL_Z - 4);
    trailOn = true;
    trailColor.value.setHex(o === 'perfect' ? LIME : 0xffffff);
    if (o === 'perfect') void wait(0.3).then(() => slowmo(0.75, t));
    await flight(start, to, o === 'miss' ? 0.9 : 0.35, 0.6);
    if (o === 'perfect') {
      const tg = targets[rep % 4];
      void flash(tg.led, 0.4, 4);
      void tween(0.9, (u) => { tg.disc.opacity = (1 - u) * 0.8; });
      burst(to, [LIME, 0xffffff, new THREE.Color(kit.primary).getHex()]);
      ring(to, false);
      sfx('perfect');
    }
    if (o !== 'miss') {
      // The net bulges where it went in.
      netHit.value.set(THREE.MathUtils.clamp(to.x, -3.4, 3.4), THREE.MathUtils.clamp(to.y - GOAL_H / 2, -1.1, 1.1), shaderTime.value);
      sfx('net');
    } else sfx('miss');
    // Ball drops into the net or rolls away, then a fresh one appears on the spot.
    const end = to.clone().setY(BALL_R);
    if (o !== 'miss') end.z = GOAL_Z - 1.8;
    await flight(to, end, 0.15, 0.45, 4);
    trailOn = false;
    await wait(0.15);
    ball.position.set(0, BALL_R, SHOT_Z);
    // Walk back to the mark and turn to face the goal again.
    const mk = MARK.shooting;
    me.walkPath([{ x: mk.x, z: mk.z }], () => me?.turnTo(mk.face), 1.6);
    await moved(me, 3);
  }

  async function playPassing(o: Outcome) {
    if (!me) return;
    juggling = false;
    const b = boards[[1, 0, 2, 1, 2, 0][rep % 6]];
    // Square up to the board (a proper turning step when it's well round), then side-foot it.
    me.turnTo(Math.atan2(b.g.position.x - me.root.position.x, b.g.position.z - me.root.position.z));
    const rolled = ball.position.clone();
    await moved(me, 1.6);
    const h = me.root.rotation.y;
    const foot = me.partAt('pass', B.RightToeBase, me.contactTime('pass')).add(new THREE.Vector3(Math.sin(h), 0, Math.cos(h)).multiplyScalar(BALL_R * 0.7)).setY(BALL_R);
    // The ball rolls over to his foot while he turns.
    if (rolled.distanceTo(foot) > 0.05) await flight(rolled, foot, 0, 0.3, 6);
    ball.position.copy(foot);
    me.act('pass', { contactIn: 0.32 });
    await wait(0.32);
    sfx('kick', 0.55);
    trailOn = true;
    trailColor.value.setHex(o === 'perfect' ? LIME : 0xffffff);
    const target = b.g.position.clone().setY(BALL_R);
    const speed = o === 'perfect' ? 0.55 : o === 'good' ? 0.75 : 0.8;
    if (o === 'miss') {
      const wide = target.clone().add(new THREE.Vector3((Math.random() < 0.5 ? -1 : 1) * 3, 0, -2));
      await flight(foot, wide, 0, speed, 18);
      sfx('miss');
      await wait(0.25);
      trailOn = false;
      ball.position.copy(foot);
    } else {
      const hit = o === 'perfect' ? target.clone() : target.clone().add(new THREE.Vector3(0.6, 0, 0));
      if (o === 'perfect') void wait(speed * 0.6).then(() => slowmo(0.45, hit.clone().setY(0.4)));
      await flight(foot, hit, 0, speed, 18);
      sfx('board');
      void flash(b.led, 0, 4);
      if (o === 'perfect') {
        burst(hit.clone().setY(0.5), [LIME, 0xffffff]);
        ring(hit.clone().setY(0.02));
        sfx('perfect');
      }
      // Back off the board toward him.
      await flight(hit, foot, 0, o === 'perfect' ? 0.55 : 0.8, -18);
      trailOn = false;
    }
  }

  async function playSprint(o: Outcome) {
    if (!me) return;
    juggling = false;
    const from = me.root.position.clone();
    const gate = gates[rep % gates.length];
    const to = new THREE.Vector3(0, 0, gate.g.position.z - 1.2);
    const sec = o === 'perfect' ? 0.6 : o === 'good' ? 0.85 : 1.25;
    const ahead = 0.45;
    sfx('whoosh', o === 'perfect' ? 1 : 0.6);
    await tween(sec, (u) => {
      me!.root.position.lerpVectors(from, to, o === 'miss' ? ease(u) : u);
      ball.position.copy(me!.root.position).add(new THREE.Vector3(0, BALL_R, -ahead));
      ball.rotation.x -= 0.3;
    });
    if (o !== 'miss') {
      void flash(gate.led, 0.08, 4);
      void tween(0.8, (u) => { gate.line.opacity = 0.18 + (1 - u) * 0.8; });
      if (o === 'perfect') {
        ring(gate.g.position.clone().setY(0.03));
        burst(gate.g.position.clone().setY(1.7), [LIME, 0xffffff], 40, { speed: 3, up: 1.5 });
        sfx('perfect');
      } else sfx('board');
    } else sfx('miss');
    // Pull up over a few strides instead of stopping dead.
    const brake = me.root.position.clone();
    const stop = brake.clone().add(new THREE.Vector3(0, 0, -1.1));
    await tween(0.5, (u) => {
      me!.root.position.lerpVectors(brake, stop, 1 - (1 - u) * (1 - u));
      ball.position.copy(me!.root.position).add(new THREE.Vector3(0, BALL_R, -ahead));
    });
  }

  async function playDefending(o: Outcome) {
    if (!me) return;
    juggling = false;
    const start = new THREE.Vector3(0, 0, -14);
    const lead = 0.55;
    dummy.root.position.copy(start);
    faceTo(dummy, 0, 0);
    const meet = new THREE.Vector3(0, 0, -4.6);
    // The attacker runs at him, and he goes to ground just as the ball arrives.
    const ballMeet = meet.clone().add(new THREE.Vector3(0, BALL_R, lead));
    const heading = Math.PI;
    const slideTo = standFor(me, 'slide', B.RightToeBase, ballMeet, heading);
    if (o === 'miss') slideTo.x += 0.7;
    const contact = 0.35;
    const meFrom = me.root.position.clone();
    const runIn = 1.5;
    await tween(runIn - contact, (u) => {
      dummy.root.position.lerpVectors(start, meet, (u * (runIn - contact)) / runIn);
      ball.position.copy(dummy.root.position).add(new THREE.Vector3(0, BALL_R, lead));
      ball.rotation.x += 0.2;
    });
    me.act('slide', { contactIn: contact });
    const dFrom = dummy.root.position.clone();
    void tween(contact + 0.25, (u) => {
      me!.root.position.lerpVectors(meFrom, slideTo, Math.min(1, (u * (contact + 0.25)) / contact));
    });
    await tween(contact, (u) => {
      dummy.root.position.lerpVectors(dFrom, meet, u);
      ball.position.copy(dummy.root.position).add(new THREE.Vector3(0, BALL_R, lead));
    });
    turf(ball.position);
    const ballFrom = ball.position.clone();
    if (o === 'miss') {
      // The attacker skips past.
      sfx('miss');
      const past = new THREE.Vector3(1.6, 0, 1.5);
      await tween(0.8, (u) => {
        dummy.root.position.lerpVectors(meet, past, u);
        ball.position.copy(dummy.root.position).add(new THREE.Vector3(0, BALL_R, lead));
      });
    } else {
      sfx('kick', 0.7);
      const away = o === 'perfect' ? new THREE.Vector3(6, BALL_R, -5) : new THREE.Vector3(-0.5, BALL_R, -3);
      if (o === 'perfect') {
        slowmo(0.5, ballFrom);
        burst(ballFrom, [LIME, 0xffffff, 0xff7a1a], 60);
        ring(ballFrom.clone().setY(0.02));
        sfx('perfect');
      }
      trailOn = o === 'perfect';
      trailColor.value.setHex(LIME);
      await flight(ballFrom, away, o === 'perfect' ? 1.2 : 0.2, o === 'perfect' ? 0.7 : 0.4);
      trailOn = false;
    }
    // Back on his feet and back to his mark for the next attack.
    await settle(me, 1.6);
    const mk = MARK.defending;
    me.walkPath([{ x: mk.x, z: mk.z }], () => me?.turnTo(mk.face), 1.8);
    dummy.root.position.copy(start);
    faceTo(dummy, 0, 0);
    ball.position.copy(start).add(new THREE.Vector3(0, BALL_R, lead));
    await moved(me, 3);
  }

  async function playKeeper(o: Outcome) {
    if (!me) return;
    const side: 1 | -1 = Math.random() < 0.5 ? -1 : 1;
    const high = Math.random() < 0.5;
    const spot = new THREE.Vector3(0, BALL_R, GOAL_Z + 11);
    ball.position.copy(spot);
    // The shooter runs in from his mark and strikes it.
    const dh = Math.atan2(-spot.x, GOAL_Z - spot.z);
    const dSpot = standFor(dummy, 'shot', B.RightToeBase, spot, dh);
    const dFrom = dummy.root.position.clone();
    const run = 0.55;
    const flightT = 0.42;
    dummy.act('shot', { contactIn: run });
    // The keeper reads it and dives, his hands meeting the ball at full stretch.
    const kind: ActionKind = high ? 'diveHigh' : 'dive';
    const ct = me.contactTime(kind, side);
    const hands = me.partAt(kind, B.LeftHand, ct, side).add(me.partAt(kind, B.RightHand, ct, side)).multiplyScalar(0.5);
    me.act(kind, { contactIn: run + flightT, side });
    const d0 = dummy.root.rotation.y;
    await tween(run, (u) => {
      dummy.root.position.lerpVectors(dFrom, dSpot, u);
      dummy.root.rotation.y = d0 + (dh - d0) * Math.min(1, u * 2);
    });
    sfx('kick', 0.9);
    turf(spot);
    trailOn = true;
    trailColor.value.setHex(o === 'perfect' ? LIME : 0xffffff);
    if (o === 'miss') {
      const past = hands.clone().add(new THREE.Vector3(Math.sign(hands.x - me.root.position.x || side) * 0.9, -0.15, -1.6));
      await flight(spot, past, 0.15, flightT + 0.08, 14);
      netHit.value.set(THREE.MathUtils.clamp(past.x, -3.4, 3.4), THREE.MathUtils.clamp(past.y - GOAL_H / 2, -1.1, 1.1), shaderTime.value);
      sfx('net');
      sfx('miss');
      await wait(0.4);
    } else {
      if (o === 'perfect') void wait(flightT * 0.55).then(() => slowmo(0.6, hands));
      await flight(spot, hands, 0.12, flightT, 14);
      sfx('catch');
      if (o === 'perfect') {
        burst(hands, [LIME, 0xffffff, new THREE.Color(kit.primary).getHex()]);
        ring(hands, false);
        sfx('perfect');
        trailOn = false;
        // Held: the ball stays in his hands as he lands and gets up.
        const l = new THREE.Vector3();
        const r = new THREE.Vector3();
        await tween(1.6, () => {
          me!.bones[B.LeftHand].getWorldPosition(l);
          me!.bones[B.RightHand].getWorldPosition(r);
          ball.position.copy(l).add(r).multiplyScalar(0.5);
          ball.position.y = Math.max(BALL_R, ball.position.y);
        });
      } else {
        await flight(hands, new THREE.Vector3(hands.x + Math.sign(hands.x - me.root.position.x || side) * 4, 0.5, GOAL_Z + 3), 1.2, 0.6, -10);
      }
    }
    trailOn = false;
    // Up again; the shooter jogs back to his mark.
    dummy.walkPath([{ x: dFrom.x, z: dFrom.z }], () => dummy.turnTo(dh), 2.2);
    await settle(me, 2.6);
    ball.position.copy(spot);
    await moved(dummy, 2.5);
  }

  // ---- Keepy-ups between reps ----
  // Each touch is a mocap take; the ball rides the knee or the foot through
  // the touch and flies between touches on a true arc to where the next one meets it.
  interface Touch { kind: ActionKind; bone: number; at: number; until: number; up: number; flight: number }
  const FLICK: Touch = { kind: 'kickUp', bone: B.LeftToeBase, at: 1.0, until: 1.13, up: BALL_R, flight: 0.8 };
  const TOUCHES: Touch[] = [
    { kind: 'kneeB', bone: B.RightLeg, at: 0.24, until: 0.24, up: BALL_R + 0.07, flight: 0.72 },
    { kind: 'kneeA', bone: B.LeftLeg, at: 0.5, until: 0.5, up: BALL_R + 0.07, flight: 0.72 },
    { kind: 'stallB', bone: B.RightToeBase, at: 0.42, until: 1.48, up: BALL_R + 0.03, flight: 1 },
    { kind: 'stallD', bone: B.RightToeBase, at: 0.5, until: 1.18, up: BALL_R + 0.03, flight: 1 },
  ];
  let jug: {
    touch: Touch;
    start: number;
    fly: { a: THREE.Vector3; v: THREE.Vector3; t0: number; t1: number } | null;
    next: { touch: Touch; at: number } | null;
    rest: THREE.Vector3;
  } | null = null;
  const boneAt = (f: Figure, b: number, out: THREE.Vector3) => f.bones[b].getWorldPosition(out);
  const juggle = (f: Figure, dt: number) => {
    if (!jug) {
      // Flick it up off the grass.
      f.act(FLICK.kind);
      const rest = f.partAt(FLICK.kind, FLICK.bone, FLICK.at).setY(BALL_R);
      jug = { touch: FLICK, start: elapsed, fly: null, next: null, rest };
    }
    const j = jug;
    if (j.next && elapsed >= j.next.at) {
      f.act(j.next.touch.kind);
      j.touch = j.next.touch;
      j.start = j.next.at;
      j.next = null;
    }
    ball.rotation.x += dt * 5;
    if (j.fly && elapsed < j.fly.t1) {
      const u = elapsed - j.fly.t0;
      ball.position.copy(j.fly.a).addScaledVector(j.fly.v, u);
      ball.position.y -= 0.5 * G * u * u;
      return;
    }
    j.fly = null;
    const tr = elapsed - j.start;
    const tc = j.touch;
    if (tr < tc.at) {
      if (tc === FLICK) ball.position.copy(j.rest);
      return;
    }
    boneAt(f, tc.bone, ball.position);
    ball.position.y += tc.up;
    if (tr <= tc.until) return;
    // Released: on to the next touch, mostly knee to knee, now and then a catch on the foot.
    const knees = TOUCHES.slice(0, 2);
    const nt = Math.random() < 0.22 ? TOUCHES[2 + Math.floor(Math.random() * 2)] : tc.kind === 'kneeB' ? knees[1] : tc.kind === 'kneeA' ? knees[0] : knees[Math.floor(Math.random() * 2)];
    const T = Math.max(tc.flight, nt.at + 0.05);
    const a = ball.position.clone();
    const b = f.partAt(nt.kind, nt.bone, nt.at);
    b.y += nt.up;
    const v = b.sub(a).divideScalar(T);
    v.y += 0.5 * G * T;
    j.fly = { a, v, t0: elapsed, t1: elapsed + T };
    j.next = { touch: nt, at: elapsed + T - nt.at };
  };

  // ---- Loop ----
  let fullW = 640;
  let fullH = 360;
  const resize = () => {
    fullW = host.clientWidth || 640;
    fullH = host.clientHeight || 360;
    renderer.setSize(fullW, fullH, false);
    composer.setSize(fullW, fullH);
    camera.aspect = fullW / fullH;
    camera.fov = fullW / fullH < 1 ? 52 : 36;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();

  const clock = new THREE.Timer();
  let raf = 0;
  const q = new THREE.Quaternion();
  const zero = new THREE.Vector3(0, 0, 0);
  const tmpV = new THREE.Vector3();
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();
  const hips = new THREE.Vector3();
  const scaleV = new THREE.Vector3();

  const updateTrail = () => {
    if (trailOn) {
      trailPts.unshift(ball.position.clone());
      if (trailPts.length > TRAIL) trailPts.length = TRAIL;
    } else if (trailPts.length) trailPts.pop();
    const pos = trailGeo.attributes.position as THREE.BufferAttribute;
    const al = trailGeo.attributes.alpha as THREE.BufferAttribute;
    const n = trailPts.length;
    for (let i = 0; i < TRAIL; i++) {
      const p = trailPts[Math.min(i, n - 1)] ?? ball.position;
      const nx = trailPts[Math.min(i + 1, n - 1)] ?? p;
      // Ribbon across the line of travel, facing the camera.
      tmpA.subVectors(p, nx);
      if (tmpA.lengthSq() < 1e-6) tmpA.set(0, 0, 1);
      tmpB.subVectors(camera.position, p).cross(tmpA).normalize();
      const w = BALL_R * 1.1 * (1 - i / TRAIL);
      pos.setXYZ(i * 2, p.x + tmpB.x * w, p.y + tmpB.y * w, p.z + tmpB.z * w);
      pos.setXYZ(i * 2 + 1, p.x - tmpB.x * w, p.y - tmpB.y * w, p.z - tmpB.z * w);
      const a = i < n ? Math.pow(1 - i / TRAIL, 1.6) * 0.75 : 0;
      al.setX(i * 2, a);
      al.setX(i * 2 + 1, a);
    }
    pos.needsUpdate = true;
    al.needsUpdate = true;
    trail.visible = n > 1;
  };

  const loop = () => {
    raf = requestAnimationFrame(loop);
    clock.update();
    frame(Math.min(0.05, clock.getDelta()), true);
  };
  const frame = (rdt: number, draw: boolean) => {
    realTime += rdt;
    // Slow motion eases in and out.
    const tsT = realTime < slowUntil ? 0.28 : 1;
    timeScale += (tsT - timeScale) * Math.min(1, rdt * (tsT < 1 ? 14 : 5));
    const dt = rdt * timeScale;
    elapsed += dt;
    shaderTime.value = elapsed;
    for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i](dt)) tasks.splice(i, 1);
    if (me) {
      const cheering = elapsed < cheerUntil;
      me.celebrate = cheering ? 1 : 0;
      me.star = cheering;
      if (juggling && mode === 'idle' && !cheering && !me.busyMoving) juggle(me, dt);
      else jug = null;
      me.animate(dt, me.stepWalk(dt), elapsed);
      me.bones[B.Hips].getWorldPosition(hips);
      meBlob.position.set(hips.x, 0.004, hips.z);
      meBlob.visible = me.root.visible;
    }
    dummyBlob.visible = dummy.root.visible;
    if (dummy.root.visible) {
      dummy.animate(dt, dummy.stepWalk(dt), elapsed);
      dummy.bones[B.Hips].getWorldPosition(hips);
      dummyBlob.position.set(hips.x, 0.004, hips.z);
    }
    ballBlob.position.set(ball.position.x, 0.004, ball.position.z);
    ballBlob.scale.setScalar(Math.max(0.2, 1 - ball.position.y * 0.5));
    updateTrail();
    // Effects.
    let alive = 0;
    chipState.forEach((c, i) => {
      c.life -= dt;
      c.v.y -= 9.8 * dt * 0.6;
      c.v.multiplyScalar(1 - dt * c.drag);
      c.p.addScaledVector(c.v, dt);
      c.r.x += dt * 7;
      c.r.y += dt * 5;
      if (c.p.y < 0.01) { c.p.y = 0.01; c.v.set(0, 0, 0); }
      q.setFromEuler(c.r);
      m4.compose(c.p, q, c.life > 0 ? scaleV.set(c.s, c.s, c.s) : zero);
      chips.setMatrixAt(i, m4);
      if (c.life > 0) alive++;
    });
    chips.count = chipState.length;
    chips.instanceMatrix.needsUpdate = true;
    if (!alive && chipState.length) chipState.length = 0;
    // Camera: eases to its framing with a gentle handheld drift.
    aimCamera();
    const k = Math.min(1, rdt * (view === 'play' ? 2.4 : 1.4));
    // Portrait screens pull the camera back so the whole drill stays in frame.
    const far = camera.aspect < 1 ? 1.3 : 1;
    camPos.lerp(tmpV.subVectors(camPosT, camLookT).multiplyScalar(far).add(camLookT), k);
    camLook.lerp(camLookT, k);
    // A push toward the moment of a perfect hit.
    const pT = realTime < punchUntil ? 1 : 0;
    punch += (pT - punch) * Math.min(1, rdt * (pT ? 6 : 2.5));
    camera.position.copy(camPos);
    const look = tmpA.copy(camLook);
    if (punch > 0.001) {
      look.lerp(punchAt, punch * 0.35);
      camera.position.lerp(punchAt, punch * 0.12);
    }
    camera.position.x += Math.sin(realTime * 0.4) * 0.05;
    camera.position.y += Math.sin(realTime * 0.33) * 0.03;
    if (shake > 0.001) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
      shake *= Math.pow(0.02, rdt);
    }
    camera.lookAt(look);
    // At rest the player sits right of centre, clear of the drill menu on the left.
    const shiftT = view === 'hero' && camera.aspect > 1.2 ? -0.17 : 0;
    viewShift += (shiftT - viewShift) * Math.min(1, rdt * 2);
    if (Math.abs(viewShift) > 0.002) camera.setViewOffset(fullW, fullH, viewShift * fullW, 0, fullW, fullH);
    else camera.clearViewOffset();
    if (draw) composer.render(rdt);
  };
  startPositions();
  camPos.copy(camPosT);
  camLook.copy(camLookT);
  loop();

  const api: TrainingGround = {
    setPlayer(app, eq, k, isKeeper) {
      kit = k;
      keeper = isKeeper;
      if (me) scene.remove(me.root);
      me = new Figure(k, app, keeper, GK_KITS[0], eq, { base: false, scale: LIFE_SCALE, detail: quality === 'high' ? 'high' : 'mid' });
      me.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      scene.add(me.root);
      startPositions();
    },
    setDrill(d) {
      drill = d;
      rep = 0;
      mode = 'idle';
      startPositions();
    },
    setView(v) {
      view = v;
    },
    prepare(i) {
      rep = i;
      if (drill === 'shooting') targets.forEach((t, j) => {
        const on = j === i % 4;
        t.led.emissiveIntensity = on ? 1.6 : 0;
        t.disc.opacity = on ? 0.12 : 0;
      });
      if (drill === 'passing') boards.forEach((b, j) => (b.led.emissiveIntensity = j === [1, 0, 2, 1, 2, 0][i % 6] ? 1.6 : 0));
      if (drill === 'sprint') gates.forEach((g, j) => (g.led.emissiveIntensity = j === i % gates.length ? 1.2 : 0.08));
    },
    async play(o) {
      mode = 'busy';
      if (o === 'miss') shake = 0.06;
      try {
        if (drill === 'shooting') await playShooting(o);
        else if (drill === 'passing') await playPassing(o);
        else if (drill === 'sprint') await playSprint(o);
        else if (drill === 'defending') await playDefending(o);
        else await playKeeper(o);
      } catch {
        // A disposed scene mid-rep: nothing to finish.
      }
    },
    reset() {
      mode = 'idle';
      rep = 0;
      startPositions();
    },
    cheer() {
      cheerUntil = elapsed + 3.4;
      if (me) burst(me.root.position.clone().setY(2.1), [LIME, 0xffffff, new THREE.Color(kit.primary).getHex()], 160, { speed: 4, up: 3.5 });
    },
    attach(next) {
      host = next;
      host.appendChild(renderer.domElement);
      ro.disconnect();
      ro.observe(host);
      resize();
      if (!raf) loop();
    },
    park() {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      tasks.length = 0;
      renderer.domElement.remove();
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      for (const d of disposables) d.dispose();
      for (const t of trees) t.dispose();
      chips.dispose();
      gtao?.dispose();
      bloom.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
  // Dev hook for scripted screenshots: pause the clock and step it by hand.
  if (import.meta.env.DEV) {
    (window as unknown as { __tg: unknown }).__tg = {
      api,
      pause() { cancelAnimationFrame(raf); raf = 0; },
      async step(sec: number) {
        for (let t = 0; t < sec; t += 1 / 30) {
          frame(1 / 30, false);
          for (let i = 0; i < 4; i++) await Promise.resolve();
        }
        composer.render(1 / 30);
      },
      ready() { return Promise.all([me?.ready, dummy.ready]); },
      info() { return { cam: camera.position.toArray(), look: camLook.toArray(), me: me?.root.position.toArray(), meVis: me?.root.visible, ball: ball.position.toArray(), view, drill }; },
      snap() { aimCamera(); camPos.copy(camPosT); camLook.copy(camLookT); viewShift = view === 'hero' && camera.aspect > 1.2 ? -0.17 : 0; },
    };
  }
  return api;
}
