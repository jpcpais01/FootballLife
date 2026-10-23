// A tiny software rasterizer in texture space: walks every texel a triangle
// covers in UV and hands over its interpolated vertex attributes, so textures
// can be painted from 3D position, normal and masks.

/**
 * `uv` holds 2 floats per vertex, `attr` holds `k` floats per vertex. `tri`
 * lists vertex indices. `paint(texel, a)` gets the attributes interpolated
 * at the texel centre. Returns a coverage mask (1 = painted).
 */
export function rasterize(size: number, uv: ArrayLike<number>, tri: ArrayLike<number>, attr: Float32Array, k: number, paint: (texel: number, a: Float32Array) => void): Uint8Array {
  const covered = new Uint8Array(size * size);
  const a = new Float32Array(k);
  for (let t = 0; t < tri.length; t += 3) for (let wrap = 0; wrap < 2; wrap++) {
    const i0 = tri[t], i1 = tri[t + 1], i2 = tri[t + 2];
    // Triangles past u = 1 (across a wrapping seam) are painted again from the left edge.
    const sh = wrap ? size : 0;
    if (wrap && Math.max(uv[i0 * 2], uv[i1 * 2], uv[i2 * 2]) <= 1) break;
    const x0 = uv[i0 * 2] * size - 0.5 - sh, y0 = uv[i0 * 2 + 1] * size - 0.5;
    const x1 = uv[i1 * 2] * size - 0.5 - sh, y1 = uv[i1 * 2 + 1] * size - 0.5;
    const x2 = uv[i2 * 2] * size - 0.5 - sh, y2 = uv[i2 * 2 + 1] * size - 0.5;
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-9) continue;
    // Pad by half a texel so neighbouring triangles leave no gaps.
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2) - 0.5));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(x0, x1, x2) + 0.5));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2) - 0.5));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(y0, y1, y2) + 0.5));
    const pad = 0.75 / Math.sqrt(Math.abs(area));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        let w1 = ((x - x0) * (y2 - y0) - (x2 - x0) * (y - y0)) / area;
        let w2 = ((x1 - x0) * (y - y0) - (x - x0) * (y1 - y0)) / area;
        let w0 = 1 - w1 - w2;
        if (w0 < -pad || w1 < -pad || w2 < -pad) continue;
        const o = y * size + x;
        // Exact interiors win over padded edges.
        const inside = w0 >= 0 && w1 >= 0 && w2 >= 0;
        if (covered[o] === 2 || (covered[o] === 1 && !inside)) continue;
        if (!inside) {
          w0 = Math.max(0, w0);
          w1 = Math.max(0, w1);
          w2 = Math.max(0, w2);
          const s = w0 + w1 + w2;
          w0 /= s;
          w1 /= s;
          w2 /= s;
        }
        for (let c = 0; c < k; c++) a[c] = attr[i0 * k + c] * w0 + attr[i1 * k + c] * w1 + attr[i2 * k + c] * w2;
        paint(o, a);
        covered[o] = inside ? 2 : 1;
      }
    }
  }
  return covered;
}

/** Grows painted texels into empty neighbours a few times, so mip levels never pull in the background. */
export function dilate(data: Uint8Array, covered: Uint8Array, size: number, passes = 4) {
  let mask = covered;
  for (let p = 0; p < passes; p++) {
    const next = mask.slice();
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const o = y * size + x;
      if (mask[o]) continue;
      let n = 0;
      let r = 0, g = 0, b = 0, al = 0;
      for (const [dx, dy] of NB) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue;
        const q = yy * size + xx;
        if (!mask[q]) continue;
        r += data[q * 4];
        g += data[q * 4 + 1];
        b += data[q * 4 + 2];
        al += data[q * 4 + 3];
        n++;
      }
      if (!n) continue;
      data[o * 4] = r / n;
      data[o * 4 + 1] = g / n;
      data[o * 4 + 2] = b / n;
      data[o * 4 + 3] = al / n;
      next[o] = 1;
    }
    mask = next;
  }
}
const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Rasterizes one triangle's value into `out` (size x size), keeping the largest
 * value per texel: a depth buffer in texture space.
 */
export function rasterMax(size: number, u: ArrayLike<number>, v: ArrayLike<number>, val: ArrayLike<number>, out: Float32Array) {
  const x0 = u[0] * size - 0.5, y0 = v[0] * size - 0.5;
  const x1 = u[1] * size - 0.5, y1 = v[1] * size - 0.5;
  const x2 = u[2] * size - 0.5, y2 = v[2] * size - 0.5;
  const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (Math.abs(area) < 1e-9) return;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
  const maxX = Math.min(size - 1, Math.ceil(Math.max(x0, x1, x2)));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(y0, y1, y2)));
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const w1 = ((x - x0) * (y2 - y0) - (x2 - x0) * (y - y0)) / area;
    const w2 = ((x1 - x0) * (y - y0) - (x - x0) * (y1 - y0)) / area;
    const w0 = 1 - w1 - w2;
    if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
    const d = val[0] * w0 + val[1] * w1 + val[2] * w2;
    const o = y * size + x;
    if (d > out[o]) out[o] = d;
  }
}
