// Eyes: glossy eyeballs with a painted iris and a domed cornea, set in the
// body mesh's own eyelids at MakeHuman's eye positions.
import * as THREE from 'three';
import { linear } from './paint.ts';
import { smooth, vnoise } from './noise.ts';

/** Iris radius in the eyeball's front UV disc (0.5 = the whole front). */
const IRIS = 0.285;

/** Both eyeballs (bind space), looking a little ahead so the irises face forward. */
export function eyeballs(eyes: { c: THREE.Vector3; r: number }[], hi: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  const mid = eyes[0].c.clone().add(eyes[1].c).multiplyScalar(0.5);
  for (const e of eyes) {
    const r = e.r * 0.97;
    const ball = new THREE.SphereGeometry(r, hi ? 32 : 16, hi ? 22 : 10).rotateX(Math.PI / 2);
    const bp = ball.attributes.position;
    // Converge on a point about a metre ahead.
    const look = mid.clone().add(new THREE.Vector3(0, -0.004, 1)).sub(e.c).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), look);
    const base = pos.length / 3;
    for (let i = 0; i < bp.count; i++) {
      v.fromBufferAttribute(bp, i);
      let u = 0.5 + (v.x / r) * 0.5;
      let vv = 0.5 + (v.y / r) * 0.5;
      if (v.z < 0) {
        // The back half is all white.
        const l = Math.hypot(v.x, v.y) || 1;
        u = 0.5 + (v.x / l) * 0.46;
        vv = 0.5 + (v.y / l) * 0.46;
      } else {
        // The cornea domes over the iris.
        const rho = Math.hypot(u - 0.5, vv - 0.5);
        if (rho < IRIS * 1.05) v.multiplyScalar(1 + 0.07 * (1 - (rho / (IRIS * 1.05)) ** 2));
      }
      v.applyQuaternion(q).add(e.c);
      pos.push(v.x, v.y, v.z);
      uv.push(u, vv);
    }
    const bi = ball.index!;
    for (let i = 0; i < bi.count; i++) idx.push(base + bi.getX(i));
    ball.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const eyeTex = new Map<string, THREE.DataTexture>();

/** The eye texture for an iris colour: sclera, iris fibres, limbal ring, pupil, and a lash patch in the corner. */
export function eyeTexture(irisHex: string): THREE.DataTexture {
  let t = eyeTex.get(irisHex);
  if (t) return t;
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  const iris = linear(irisHex);
  const toS = (c: number) => Math.max(0, Math.min(255, Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055) * 255)));
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = (i + 0.5) / S - 0.5;
    const v = (j + 0.5) / S - 0.5;
    const rho = Math.hypot(u, v);
    const ang = Math.atan2(v, u);
    let r: number, g: number, b: number;
    if (rho > IRIS) {
      // Sclera: warm white, a little pinker toward the corners.
      const edge = smooth(0.22, 0.5, rho);
      // The upper lid's shadow falls across the top.
      const top = smooth(0.0, 0.35, v) * 0.35;
      r = (0.78 - edge * 0.1) * (1 - top);
      g = (0.74 - edge * 0.2) * (1 - top);
      b = (0.7 - edge * 0.2) * (1 - top * 0.9);
      // Soft shading into the limbus.
      const lim = smooth(IRIS + 0.035, IRIS, rho);
      r *= 1 - lim * 0.35;
      g *= 1 - lim * 0.35;
      b *= 1 - lim * 0.3;
    } else {
      const k = rho / IRIS;
      const fib = vnoise(Math.cos(ang) * 9 + 3, Math.sin(ang) * 9, k * 4) * 0.6 + vnoise(ang * 30, k * 6, 1) * 0.4;
      const lum = 0.7 + fib * 0.6;
      // Lighter, warmer collarette around the pupil; a dark limbal ring at the edge.
      const coll = smooth(0.5, 0.36, k) * smooth(0.25, 0.36, k);
      r = iris[0] * lum * (1 + coll * 0.8) + coll * 0.03;
      g = iris[1] * lum * (1 + coll * 0.6) + coll * 0.015;
      b = iris[2] * lum * (1 + coll * 0.3);
      const ring = smooth(0.78, 1, k);
      r *= 1 - ring * 0.7;
      g *= 1 - ring * 0.7;
      b *= 1 - ring * 0.7;
      const pupil = smooth(0.4, 0.34, k);
      r = r * (1 - pupil) + 0.004 * pupil;
      g = g * (1 - pupil) + 0.004 * pupil;
      b = b * (1 - pupil) + 0.005 * pupil;
    }
    const o = (j * S + i) * 4;
    data[o] = toS(r);
    data[o + 1] = toS(g);
    data[o + 2] = toS(b);
    data[o + 3] = 255;
  }
  t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  eyeTex.set(irisHex, t);
  return t;
}
