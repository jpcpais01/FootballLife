// The head texture's layout: a latitude-longitude projection around the head
// centre, warped so the face (the front, just below the eyes) gets most of the
// texels.

/** Longitude warp: s in [-1, 1] → angle; denser near 0 (the face). */
const A_U = 0.42;
const A_V = 0.5;
/** Latitude the layout is centred on (just below the eyes). */
const V_C = -0.18;

const warp = (s: number, a: number) => a * s + (1 - a) * s * s * s;
function unwarp(x: number, a: number) {
  let s = x;
  for (let i = 0; i < 8; i++) {
    const f = warp(s, a) - x;
    const df = a + 3 * (1 - a) * s * s;
    s -= f / df;
  }
  return Math.max(-1, Math.min(1, s));
}

/** Direction from the head centre → texture coordinates in the head's layout. */
export function dirToUV(x: number, y: number, z: number): [number, number] {
  const l = Math.hypot(x, y, z) || 1;
  const phi = Math.atan2(x, z);
  const th = Math.asin(Math.max(-1, Math.min(1, y / l)));
  const su = unwarp(phi / Math.PI, A_U);
  const w = th > V_C ? (th - V_C) / (Math.PI / 2 - V_C) : (th - V_C) / (Math.PI / 2 + V_C);
  const sv = unwarp(w, A_V);
  return [(su + 1) / 2, (sv + 1) / 2];
}
