// Assembles a player: the fitted MakeHuman body with its painted kit and face
// textures, eyeballs and lashes, and the hair, all bound to our skeleton.
// Builds are cached by everything that changes them; textures and geometry
// are released when they fall out of the cache (three re-uploads anything
// still in use, so a late dispose is harmless).
import * as THREE from 'three';
import { EYE_COLORS, HAIR_COLORS, SKIN_TONES, type Appearance } from '../../../shared/appearance.ts';
import { B, makeBones, setBindPose } from '../rig/skeleton.ts';
import { baseLand, buildBody, type BodyBuild, type Cut } from './body.ts';
import { SKIN_GREY, type Pattern } from './bodyPaint.ts';
import type { CasualPaint } from './casual.ts';
import { eyeballs, eyeTexture } from './eyes.ts';
import { buildHair } from './hair.ts';
import { morphWeights } from './look.ts';
import { linear, type RGB } from './paint.ts';
import { runPaintJob, type PaintJob, type Painted } from './paintJobs.ts';

/** high: close-ups (the creator, turntable, drills); mid: portraits and the house; low: matches. */
export type Detail = 'high' | 'mid' | 'low';

export interface CharacterKit {
  primary: string;
  secondary: string;
  /** Shorts (keepers wear dark ones). */
  shorts: string;
  pattern: Pattern;
  boot: string;
  bootAccent: string;
  sole: string;
  glove: string;
  wrist: string | null;
  /** Headband colour, or null. */
  band: string | null;
  earring: boolean;
  number?: number;
  numberColor: string;
  /** How the clothes sit on the body (kit, keeper's kit or a casual outfit). */
  cut: Cut;
  /** Off the pitch: his own clothes, painted instead of the kit. */
  casual?: CasualLook | null;
  /** Hat and glasses (on the head). */
  hat?: HatSpec | null;
  glasses?: GlassesSpec | null;
}

export interface CasualPieceSpec { style: string; print?: string; c1: string; c2: string; c3: string }
export interface CasualLook { top: CasualPieceSpec; bottom: CasualPieceSpec; shoes: CasualPieceSpec; sock: string }
export interface HatSpec { style: string; c1: string; c2: string; print?: string; metal?: boolean }
export interface GlassesSpec { style: string; c1: string; c2: string; metal?: boolean }

function casualPaint(c: CasualLook): CasualPaint {
  const piece = (p: CasualPieceSpec) => ({ style: p.style, print: p.print ?? '', c1: linear(p.c1), c2: linear(p.c2), c3: linear(p.c3) });
  return { top: piece(c.top), bottom: piece(c.bottom), shoes: piece(c.shoes), sock: linear(c.sock) };
}

export interface Character {
  geometry: THREE.BufferGeometry;
  /** Body (kit) and head (face) materials, by geometry group. */
  materials: THREE.Material[];
  /** Eyes and hair, in the Head bone's frame: add to the Head bone. */
  head: THREE.Group;
  /** The fitted body, for placing kit extras (crest, neckwear). */
  body: BodyBuild;
}

/** The Head bone's bind-pose frame (world), to bring head parts into its space. */
const HEAD_BIND = (() => {
  const bones = makeBones();
  setBindPose(bones);
  bones[0].updateMatrixWorld(true);
  return bones[B.Head].matrixWorld.clone().invert();
})();

/** Skin tone with the deeper tones lifted a little, so they read as rich browns under the lights. */
export function skinHex(a: Appearance) {
  const c = new THREE.Color(SKIN_TONES[a.skin] ?? SKIN_TONES[1]);
  const k = mixK(c);
  c.setRGB(c.r ** k, c.g ** k, c.b ** k);
  // Pale tones come down toward real skin and gain a little warmth, or the lights wash them out to white.
  const v = c.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
  const l = v.r * 0.3 + v.g * 0.59 + v.b * 0.11;
  if (l > 0.6) {
    const to = 0.6 + (l - 0.6) * 0.35;
    const s = to / l;
    c.setRGB(to + (v.r * s - to) * 1.55, to + (v.g * s - to) * 1.55, to + (v.b * s - to) * 1.55, THREE.SRGBColorSpace);
  }
  return '#' + c.getHexString();
}
// Dark tones lift toward 0.8 so they read as rich browns.
const mixK = (c: THREE.Color) => 1 - 0.2 * Math.min(1, Math.max(0, (0.45 - (c.r * 0.3 + c.g * 0.59 + c.b * 0.11)) / 0.3));
const hairHex = (a: Appearance) => HAIR_COLORS[a.hairColor] ?? HAIR_COLORS[0];

// ---------- Caches ----------

class LRU<T> {
  private m = new Map<string, T>();
  private max: number;
  private drop: (v: T) => void;
  constructor(max: number, drop: (v: T) => void) {
    this.max = max;
    this.drop = drop;
  }
  get(k: string, make: () => T): T {
    let v = this.m.get(k);
    if (v !== undefined) {
      this.m.delete(k);
      this.m.set(k, v);
      return v;
    }
    v = make();
    this.put(k, v);
    return v;
  }
  has(k: string) {
    return this.m.has(k);
  }
  put(k: string, v: T) {
    this.m.delete(k);
    this.m.set(k, v);
    while (this.m.size > this.max) {
      const [ok, ov] = this.m.entries().next().value as [string, T];
      this.m.delete(ok);
      this.drop(ov);
    }
  }
}

/** The body depends only on its shape weights, so colours, hair and the like reuse it. */
const shapeKey = (a: Appearance, cut: Cut) => JSON.stringify([morphWeights(a), cut]);
/** Per-player texture seed: skin and face only, so trying hairstyles keeps the same skin detail. */
const seedOf = (a: Appearance) => (a.skin * 131 + a.face * 7 + a.marks) % 997;
const bodies = new LRU<BodyBuild>(40, (b) => {
  b.geometry.dispose();
  b.lashes.dispose();
});
const textures = new LRU<THREE.Texture[]>(80, (t) => t.forEach((x) => x.dispose()));
interface HairPart { geometry: THREE.BufferGeometry; material: THREE.Material }
const hairs = new LRU<HairPart[]>(40, (h) => h.forEach((x) => x.geometry.dispose()));
const eyeGeos = new LRU<THREE.BufferGeometry>(40, (g) => g.dispose());

function dataTex(data: Uint8Array, size: number, srgb: boolean) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.flipY = false;
  t.needsUpdate = true;
  return t;
}

const numberTex = new Map<number, THREE.Texture>();
/** The shirt number in the UI's condensed face, white on clear (the shader uses its alpha). */
function numberTexture(n: number) {
  let t = numberTex.get(n);
  if (t || typeof document === 'undefined') return t ?? null;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.font = '800 104px "Barlow Condensed", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText(String(n), 64, 70);
  t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  numberTex.set(n, t);
  return t;
}

/** Kit material: the team's shared texture, toned with the player's skin, with his number on the back. */
function bodyMaterial(map: THREE.Texture, detailMap: THREE.Texture, skin: RGB, num: THREE.Texture | null, numColor: RGB, hi: boolean) {
  const m = new THREE.MeshPhysicalMaterial({
    map,
    bumpMap: detailMap,
    bumpScale: hi ? 1.2 : 0.6,
    roughnessMap: detailMap,
    roughness: 1,
    clearcoatMap: detailMap,
    clearcoat: 1,
    clearcoatRoughness: 0.2,
    sheen: 0.35,
    sheenRoughness: 0.55,
    sheenColor: new THREE.Color(0xffffff),
    specularIntensity: 0.6,
  });
  const u = {
    skinTone: { value: new THREE.Vector3(...skin).multiplyScalar(1 / SKIN_GREY) },
    numberMap: { value: num },
    numberColor: { value: new THREE.Vector3(...numColor) },
    hasNumber: { value: num ? 1 : 0 },
    skinSheen: { value: new THREE.Vector3(...skinSheenOf(skin)).multiplyScalar(SKIN_SHEEN / 0.35) },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 numUv;\nvarying vec2 vNumUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNumUv = numUv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 skinTone;\nuniform sampler2D numberMap;\nuniform vec3 numberColor;\nuniform float hasNumber;\nuniform vec3 skinSheen;\nvarying vec2 vNumUv;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
float kitMask = diffuseColor.a;
diffuseColor.rgb = mix( diffuseColor.rgb * skinTone, diffuseColor.rgb, kitMask );
if ( hasNumber > 0.5 && vNumUv.x > 0.0 && vNumUv.x < 1.0 && vNumUv.y > 0.0 && vNumUv.y < 1.0 ) {
	diffuseColor.rgb = mix( diffuseColor.rgb, numberColor, texture2D( numberMap, vec2( vNumUv.x, 1.0 - vNumUv.y ) ).a );
}
diffuseColor.a = 1.0;`,
      )
      // Clearcoat lives in the detail map's blue channel (red is the bump).
      .replace(
        '#include <lights_physical_fragment>',
        THREE.ShaderChunk.lights_physical_fragment
          .replace('texture2D( clearcoatMap, vClearcoatMapUv ).x', 'texture2D( clearcoatMap, vClearcoatMapUv ).z')
          // Fabric gets a white sheen, skin the same warm one as the face.
          .replace('material.sheenColor = sheenColor;', 'material.sheenColor = mix( skinSheen, sheenColor, kitMask );'),
      );
  };
  m.customProgramCacheKey = () => 'player-kit';
  return m;
}

// ---------- Build ----------

const sizes = (detail: Detail) => ({ body: detail === 'high' ? 1024 : 512, head: detail === 'high' ? 1024 : detail === 'mid' ? 512 : 192 });

/** The kit and face texture jobs for a look, each with its cache key. */
function paintJobs(a: Appearance, keeper: boolean, kit: CharacterKit, detail: Detail, body: BodyBuild): [string, PaintJob][] {
  const sz = sizes(detail);
  const seed = seedOf(a);
  const cas = kit.casual ?? null;
  const kitKey = JSON.stringify(cas ? [cas, kit.cut] : [kit.primary, kit.secondary, kit.shorts, kit.pattern, kit.boot, kit.bootAccent, kit.sole, kit.glove, kit.wrist, kit.cut]);
  // Round the neck: the shirt (the kit, or the casual top; a suit shows its dress shirt).
  const collar = cas ? (cas.top.style === 'suit' ? cas.top.c2 : cas.top.c1) : kit.primary;
  const collarTrim = cas ? (cas.top.print === 'ringer' || cas.top.style === 'polo' || cas.top.style === 'jersey' || cas.top.style === 'suit' ? cas.top.c2 : cas.top.c1) : kit.secondary;
  const headKey = JSON.stringify([sz.head, collar, collarTrim, kit.cut.collar, kit.cut.dip, kit.cut.sleeve, skinHex(a), a.hairColor, a.hair, a.beard, a.brows, a.marks, seed, keeper]);
  return [
    [`b|${sz.body}|${keeper}|${kitKey}`, {
      kind: 'body',
      size: sz.body,
      uv: body.paint.uv,
      tri: body.paint.tri,
      attr: body.paint.attr,
      k: body.paint.k,
      keeper,
      cut: kit.cut,
      casual: cas ? casualPaint(cas) : null,
      pattern: kit.pattern,
      shirt: linear(kit.primary),
      trim: linear(kit.secondary),
      shorts: linear(kit.shorts),
      sock: linear(keeper ? kit.shorts : kit.primary),
      boot: linear(kit.boot),
      bootAccent: linear(kit.bootAccent),
      sole: linear(kit.sole),
      glove: linear(kit.glove),
      wrist: kit.wrist ? linear(kit.wrist) : null,
      seed,
    }],
    [`h|${headKey}`, {
      kind: 'head',
      size: sz.head,
      uv: body.paint.uv,
      tri: body.paint.headTri,
      attr: body.paint.attr,
      k: body.paint.k,
      land: baseLand(),
      skin: linear(skinHex(a)),
      hair: linear(hairHex(a)),
      hairStyle: a.hair,
      beard: a.beard,
      brows: a.brows,
      marks: a.marks,
      collar: linear(collar),
      trim: linear(collarTrim),
      keeper,
      cut: kit.cut,
      seed,
      lite: detail === 'low',
    }],
  ];
}

function texturesOf(job: PaintJob, p: Painted) {
  const tex = [dataTex(p.color, job.size, true), dataTex(p.detail, job.size, false)];
  // The face layout wraps round the back of the head.
  if (job.kind === 'head') for (const x of tex) x.wrapS = THREE.RepeatWrapping;
  return tex;
}

// Painting runs on a worker when it can; the jobs in flight, by cache key.
let worker: Worker | null | undefined;
let nextId = 0;
const replies = new Map<number, (p: Painted | null) => void>();
const inFlight = new Map<string, Promise<void>>();
function paintWorker() {
  if (worker === undefined) {
    try {
      worker = new Worker(new URL('./paintWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number; color?: Uint8Array; detail?: Uint8Array }>) => {
        const r = replies.get(e.data.id);
        replies.delete(e.data.id);
        r?.(e.data.color && e.data.detail ? { color: e.data.color, detail: e.data.detail } : null);
      };
      worker.onerror = () => {
        // No worker after all: answer everything waiting so it paints here instead.
        worker = null;
        for (const r of replies.values()) r(null);
        replies.clear();
      };
    } catch {
      worker = null;
    }
  }
  return worker;
}
function paintOff(key: string, job: PaintJob): Promise<void> {
  let p = inFlight.get(key);
  if (p) return p;
  p = new Promise<Painted | null>((res) => {
    const w = paintWorker();
    if (!w) return res(null);
    const id = ++nextId;
    replies.set(id, res);
    w.postMessage({ id, job });
  }).then((painted) => {
    inFlight.delete(key);
    if (!textures.has(key)) textures.put(key, texturesOf(job, painted ?? runPaintJob(job)));
  });
  inFlight.set(key, p);
  return p;
}

/**
 * Gets a look ready to build without a pause: the body is fitted here, and
 * any texture not yet cached is painted on a worker. buildCharacter for the
 * same look afterwards is quick.
 */
export function prepareCharacter(a: Appearance, keeper: boolean, kit: CharacterKit, detail: Detail): Promise<void> {
  const body = bodies.get(shapeKey(a, kit.cut), () => buildBody(a, kit.cut));
  const waits = paintJobs(a, keeper, kit, detail, body).filter(([key]) => !textures.has(key)).map(([key, job]) => paintOff(key, job));
  return waits.length ? Promise.all(waits).then(() => undefined) : Promise.resolve();
}

export function buildCharacter(a: Appearance, keeper: boolean, kit: CharacterKit, detail: Detail): Character {
  const sk = shapeKey(a, kit.cut);
  const body = bodies.get(sk, () => buildBody(a, kit.cut));
  const skin = linear(skinHex(a));
  const hair = linear(hairHex(a));
  const hi = detail !== 'low';
  const [[bodyKey, bodyJob], [headKey, headJob]] = paintJobs(a, keeper, kit, detail, body);
  const [bodyMap, bodyDetail] = textures.get(bodyKey, () => texturesOf(bodyJob, runPaintJob(bodyJob)));
  const [headMap, headDetail] = textures.get(headKey, () => texturesOf(headJob, runPaintJob(headJob)));

  const bodyMat = bodyMaterial(bodyMap, bodyDetail, skin, kit.number !== undefined && !kit.casual ? numberTexture(kit.number) : null, linear(kit.numberColor), hi);
  const headMat = new THREE.MeshPhysicalMaterial({
    map: headMap,
    bumpMap: headDetail,
    bumpScale: hi ? 0.9 : 0.4,
    roughnessMap: headDetail,
    roughness: 1,
    specularIntensity: 0.6,
    // A warm sheen at grazing angles stands in for light scattering through skin.
    sheen: SKIN_SHEEN,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color(...skinSheenOf(skin)),
  });

  // Head parts move with the Head bone. Their geometry is shared through the caches.
  const head = new THREE.Group();
  const eyes = new THREE.Mesh(eyeGeos.get(`${sk}|${hi}`, () => eyeballs(body.eyes, hi)), eyeMaterial(EYE_COLORS[a.eyeColor] ?? EYE_COLORS[0]));
  const hairKey = JSON.stringify([sk, hi, a.hair, a.hairColor, a.beard, kit.band, kit.earring, kit.hat ?? null, kit.glasses ?? null]);
  const hairParts = hairs.get(hairKey, () => buildHair(a, body, hair, kit, hi).map((m) => ({ geometry: m.geometry, material: m.material as THREE.Material })));
  for (const m of [eyes, ...hairParts.map((h) => new THREE.Mesh(h.geometry, h.material))]) {
    m.applyMatrix4(HEAD_BIND);
    m.castShadow = m !== eyes;
    head.add(m);
  }
  return { geometry: body.geometry, materials: [bodyMat, headMat], head, body };
}

const SKIN_SHEEN = 0.25;
const skinSheenOf = (s: RGB): RGB => [s[0] * 1.6 + 0.08, s[1] * 0.9 + 0.02, s[2] * 0.75 + 0.02];

const eyeMats = new Map<string, THREE.MeshPhysicalMaterial>();
function eyeMaterial(iris: string) {
  let m = eyeMats.get(iris);
  if (!m) {
    m = new THREE.MeshPhysicalMaterial({ map: eyeTexture(iris), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 });
    eyeMats.set(iris, m);
  }
  return m;
}
