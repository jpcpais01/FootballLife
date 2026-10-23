// Assembles a player: the fitted MakeHuman body with its painted kit and face
// textures, eyeballs and lashes, and the hair, all bound to our skeleton.
// Builds are cached by everything that changes them; textures and geometry
// are released when they fall out of the cache (three re-uploads anything
// still in use, so a late dispose is harmless).
import * as THREE from 'three';
import { EYE_COLORS, HAIR_COLORS, SKIN_TONES, SLIDERS, type Appearance } from '../../../shared/appearance.ts';
import { B, makeBones, setBindPose } from '../rig/skeleton.ts';
import { A, Region, baseLand, buildBody, regionAt, type BodyBuild } from './body.ts';
import { SKIN_GREY, paintBody, type Pattern } from './bodyPaint.ts';
import { eyeballs, eyeTexture } from './eyes.ts';
import { buildHair } from './hair.ts';
import { linear, paintHead, type RGB } from './paint.ts';
import { BEARD, SCALP } from './styles.ts';

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
  return '#' + new THREE.Color(c.r ** k, c.g ** k, c.b ** k).getHexString();
}
// Light tones stay as they are (the lights already brighten them); dark ones lift toward 0.8.
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
    this.m.set(k, v);
    while (this.m.size > this.max) {
      const [ok, ov] = this.m.entries().next().value as [string, T];
      this.m.delete(ok);
      this.drop(ov);
    }
    return v;
  }
}

const shapeKey = (a: Appearance, keeper: boolean) => JSON.stringify([a, keeper]);
/** The face texture is painted on the base mesh, so the shape sliders don't change it. */
const paintKey = (a: Appearance, keeper: boolean) => JSON.stringify([Object.entries(a).filter(([k]) => !(k in SLIDERS)), keeper]);
const bodies = new LRU<BodyBuild>(40, (b) => {
  b.geometry.dispose();
  b.lashes.dispose();
});
const textures = new LRU<THREE.Texture[]>(80, (t) => t.forEach((x) => x.dispose()));

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

export function buildCharacter(a: Appearance, keeper: boolean, kit: CharacterKit, detail: Detail): Character {
  const body = bodies.get(shapeKey(a, keeper), () => buildBody(a, keeper));
  const skin = linear(skinHex(a));
  const hair = linear(hairHex(a));
  const seed = (a.skin * 131 + a.hair * 17 + a.face * 7 + a.marks) % 997;
  const hi = detail !== 'low';

  const bodySize = detail === 'high' ? 1024 : 512;
  const kitKey = JSON.stringify([kit.primary, kit.secondary, kit.shorts, kit.pattern, kit.boot, kit.bootAccent, kit.sole, kit.glove, kit.wrist]);
  const [bodyMap, bodyDetail] = textures.get(`b|${bodySize}|${keeper}|${kitKey}`, () => {
    const p = paintBody({
      size: bodySize,
      uv: body.paint.uv,
      tri: body.paint.tri,
      attr: body.paint.attr,
      k: body.paint.k,
      keeper,
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
    });
    return [dataTex(p.color, bodySize, true), dataTex(p.detail, bodySize, false)];
  });

  const headSize = detail === 'high' ? 1024 : detail === 'mid' ? 512 : 192;
  const collarRGB = linear(kit.primary);
  const w = { arm: 0, hand: 0, leg: 0, foot: 0, head: 0 };
  const trimRGB = linear(kit.secondary);
  const [headMap, headDetail] = textures.get(`h|${headSize}|${kit.primary}|${kit.secondary}|${paintKey(a, keeper)}`, () => {
    const p = paintHead({
      size: headSize,
      uv: body.paint.uv,
      tri: body.paint.headTri,
      attr: body.paint.attr,
      k: body.paint.k,
      land: baseLand(),
      skin,
      hair,
      scalp: SCALP[a.hair] ?? SCALP[0],
      beard: BEARD[a.beard] ?? BEARD[0],
      brows: a.brows,
      marks: a.marks,
      collar: (t) => {
        w.arm = t[A.arm];
        w.hand = t[A.hand];
        w.leg = t[A.leg];
        w.foot = t[A.foot];
        w.head = t[A.head];
        const x = t[A.pos], y = t[A.pos + 1], z = t[A.pos + 2];
        if (regionAt(x, y, z, t[A.armT], w, keeper) !== Region.Shirt) return null;
        // The collar band shows the trim colour where it turns in.
        return y > 1.74 ? trimRGB : collarRGB;
      },
      seed,
      lite: detail === 'low',
    });
    const tex = [dataTex(p.color, headSize, true), dataTex(p.detail, headSize, false)];
    // The layout wraps round the back of the head.
    for (const x of tex) x.wrapS = THREE.RepeatWrapping;
    return tex;
  });

  const bodyMat = bodyMaterial(bodyMap, bodyDetail, skin, kit.number !== undefined ? numberTexture(kit.number) : null, linear(kit.numberColor), hi);
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

  // Head parts move with the Head bone.
  const head = new THREE.Group();
  const eyes = new THREE.Mesh(eyeballs(body.eyes, hi), eyeMaterial(EYE_COLORS[a.eyeColor] ?? EYE_COLORS[0]));
  const hairParts = buildHair(a, body, hair, kit, hi);
  for (const m of [eyes, ...hairParts]) {
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
