// Walking around the house: a grid of walkable floor, A* over it, and a
// path smoothed into straight runs so the player cuts corners like a person.

export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** Walkable ground; `pad` (per edge: x0, z0, x1, z1) keeps you off its edges where no wall does. */
export interface Area extends Rect {
  pad?: [number, number, number, number];
}

/** A blocked footprint: a box centred on (x, z), rotated by r about y. */
export interface Block {
  x: number;
  z: number;
  w: number;
  d: number;
  r: number;
}

/** A wall from a to b with gaps (doors) a person can pass through, measured along the wall from a. */
export interface NavWall {
  a: [number, number];
  b: [number, number];
  gaps: [number, number][];
}

const CELL = 0.2;
/** How far a body's centre keeps from walls and furniture, metres. */
const CLEAR = 0.26;

export class NavGrid {
  readonly x0: number;
  readonly z0: number;
  readonly nx: number;
  readonly nz: number;
  private free: Uint8Array;

  constructor(areas: Area[], walls: NavWall[], blocks: Block[]) {
    const x0 = Math.min(...areas.map((a) => a.x0));
    const z0 = Math.min(...areas.map((a) => a.z0));
    const x1 = Math.max(...areas.map((a) => a.x1));
    const z1 = Math.max(...areas.map((a) => a.z1));
    this.x0 = x0;
    this.z0 = z0;
    this.nx = Math.ceil((x1 - x0) / CELL);
    this.nz = Math.ceil((z1 - z0) / CELL);
    this.free = new Uint8Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const [x, z] = this.center(i, j);
        let ok = areas.some((a) => {
          const p = a.pad ?? [0, 0, 0, 0];
          return x >= a.x0 + p[0] - 1e-6 && z >= a.z0 + p[1] - 1e-6 && x <= a.x1 - p[2] + 1e-6 && z <= a.z1 - p[3] + 1e-6;
        });
        if (ok) ok = !blocks.some((b) => inBlock(b, x, z, CLEAR));
        if (ok) ok = !walls.some((w) => nearWall(w, x, z));
        this.free[j * this.nx + i] = ok ? 1 : 0;
      }
    }
    this.keepLargest();
  }

  /** Pockets you can't reach (a corner boxed in by furniture) are dropped, so a tap never picks one. */
  private keepLargest() {
    const label = new Int32Array(this.nx * this.nz).fill(-1);
    const sizes: number[] = [];
    for (let s = 0; s < label.length; s++) {
      if (!this.free[s] || label[s] >= 0) continue;
      const id = sizes.length;
      let n = 0;
      const stack = [s];
      label[s] = id;
      while (stack.length) {
        const c = stack.pop()!;
        n++;
        const ci = c % this.nx;
        const cj = (c - ci) / this.nx;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = ci + di;
          const nj = cj + dj;
          const k = nj * this.nx + ni;
          if (this.ok(ni, nj) && label[k] < 0) {
            label[k] = id;
            stack.push(k);
          }
        }
      }
      sizes.push(n);
    }
    const best = sizes.indexOf(Math.max(...sizes));
    for (let s = 0; s < label.length; s++) if (label[s] !== best) this.free[s] = 0;
  }

  center(i: number, j: number): [number, number] {
    return [this.x0 + (i + 0.5) * CELL, this.z0 + (j + 0.5) * CELL];
  }

  cell(x: number, z: number): [number, number] {
    return [Math.floor((x - this.x0) / CELL), Math.floor((z - this.z0) / CELL)];
  }

  ok(i: number, j: number) {
    return i >= 0 && j >= 0 && i < this.nx && j < this.nz && this.free[j * this.nx + i] === 1;
  }

  walkable(x: number, z: number) {
    const [i, j] = this.cell(x, z);
    return this.ok(i, j);
  }

  /** The free cell nearest to a point (a tap on the sofa walks you up to it). */
  nearest(x: number, z: number, maxR = 3): [number, number] | null {
    const [ci, cj] = this.cell(x, z);
    if (this.ok(ci, cj)) return [ci, cj];
    let best: [number, number] | null = null;
    let bd = Infinity;
    const R = Math.ceil(maxR / CELL);
    for (let j = cj - R; j <= cj + R; j++) {
      for (let i = ci - R; i <= ci + R; i++) {
        if (!this.ok(i, j)) continue;
        const [px, pz] = this.center(i, j);
        const d = (px - x) ** 2 + (pz - z) ** 2;
        if (d < bd) {
          bd = d;
          best = [i, j];
        }
      }
    }
    return best;
  }

  /** A smoothed path from one point to another, or null when there is no way through. */
  path(fx: number, fz: number, tx: number, tz: number): [number, number][] | null {
    const s = this.nearest(fx, fz, 1.5);
    const t = this.nearest(tx, tz);
    if (!s || !t) return null;
    const N = this.nx * this.nz;
    const g = new Float32Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const si = s[1] * this.nx + s[0];
    const ti = t[1] * this.nx + t[0];
    g[si] = 0;
    const open = new Heap();
    open.push(si, 0);
    const [tci, tcj] = t;
    while (open.size) {
      const cur = open.pop();
      if (cur === ti) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      const ci = cur % this.nx;
      const cj = (cur - ci) / this.nx;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          const ni = ci + di;
          const nj = cj + dj;
          if (!this.ok(ni, nj)) continue;
          // No cutting through a corner between two blocked cells.
          if (di && dj && (!this.ok(ci + di, cj) || !this.ok(ci, cj + dj))) continue;
          const n = nj * this.nx + ni;
          const cost = g[cur] + (di && dj ? Math.SQRT2 : 1);
          if (cost < g[n]) {
            g[n] = cost;
            from[n] = cur;
            const hx = Math.abs(ni - tci);
            const hz = Math.abs(nj - tcj);
            open.push(n, cost + Math.max(hx, hz) + (Math.SQRT2 - 1) * Math.min(hx, hz));
          }
        }
      }
    }
    if (si !== ti && from[ti] < 0) return null;
    const cells: [number, number][] = [];
    for (let c = ti; c >= 0; c = c === si ? -1 : from[c]) {
      const ci = c % this.nx;
      cells.push(this.center(ci, (c - ci) / this.nx));
    }
    cells.reverse();
    // The exact tap point when it is walkable, else the cell's centre.
    const end: [number, number] = this.walkable(tx, tz) ? [tx, tz] : cells[cells.length - 1];
    const pts: [number, number][] = [[fx, fz], ...cells.slice(1, -1), end];
    // String pulling: keep only the corners needed to see the next stretch.
    const out: [number, number][] = [pts[0]];
    let k = 0;
    while (k < pts.length - 1) {
      let far = k + 1;
      for (let m = pts.length - 1; m > k + 1; m--) {
        if (this.clearLine(pts[k], pts[m])) {
          far = m;
          break;
        }
      }
      out.push(pts[far]);
      k = far;
    }
    return out;
  }

  clearLine(a: [number, number], b: [number, number]) {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.ceil(len / (CELL * 0.4));
    for (let i = 1; i < n; i++) {
      const k = i / n;
      if (!this.walkable(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k)) return false;
    }
    return true;
  }

  /** A random walkable point inside a rectangle (for wandering about). */
  randomIn(r: Rect, rnd: () => number): [number, number] | null {
    for (let k = 0; k < 30; k++) {
      const x = r.x0 + rnd() * (r.x1 - r.x0);
      const z = r.z0 + rnd() * (r.z1 - r.z0);
      if (this.walkable(x, z)) return [x, z];
    }
    return null;
  }
}

function inBlock(b: Block, x: number, z: number, pad: number) {
  const dx = x - b.x;
  const dz = z - b.z;
  const c = Math.cos(b.r);
  const s = Math.sin(b.r);
  // Into the block's own frame (rotation about y by r).
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) < b.w / 2 + pad && Math.abs(lz) < b.d / 2 + pad;
}

function nearWall(w: NavWall, x: number, z: number) {
  const ax = w.a[0];
  const az = w.a[1];
  const dx = w.b[0] - ax;
  const dz = w.b[1] - az;
  const len = Math.hypot(dx, dz);
  const t = ((x - ax) * dx + (z - az) * dz) / len;
  if (t < -CLEAR || t > len + CLEAR) return false;
  const dist = Math.abs((x - ax) * dz - (z - az) * dx) / len;
  if (dist > CLEAR + 0.08) return false;
  // Through a doorway: the frame still keeps you off its edges.
  return !w.gaps.some(([g0, g1]) => t > g0 + 0.14 && t < g1 - 0.14);
}

class Heap {
  private ids: number[] = [];
  private keys: number[] = [];
  get size() {
    return this.ids.length;
  }
  push(id: number, key: number) {
    const ids = this.ids;
    const keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }
  pop() {
    const ids = this.ids;
    const keys = this.keys;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastKey = keys.pop()!;
    if (ids.length) {
      let i = 0;
      const n = ids.length;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) break;
        ids[i] = ids[c];
        keys[i] = keys[c];
        i = c;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return top;
  }
}

/** A rectangle with some holes taken out, as up to four strips per hole. */
export function subtract(r: Rect, holes: Rect[]): Rect[] {
  let out: Rect[] = [{ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 }];
  for (const h of holes) {
    const next: Rect[] = [];
    for (const p of out) {
      if (h.x1 <= p.x0 || h.x0 >= p.x1 || h.z1 <= p.z0 || h.z0 >= p.z1) {
        next.push(p);
        continue;
      }
      if (h.z0 > p.z0) next.push({ x0: p.x0, z0: p.z0, x1: p.x1, z1: h.z0 });
      if (h.z1 < p.z1) next.push({ x0: p.x0, z0: h.z1, x1: p.x1, z1: p.z1 });
      const z0 = Math.max(p.z0, h.z0);
      const z1 = Math.min(p.z1, h.z1);
      if (h.x0 > p.x0) next.push({ x0: p.x0, z0, x1: h.x0, z1 });
      if (h.x1 < p.x1) next.push({ x0: h.x1, z0, x1: p.x1, z1 });
    }
    out = next;
  }
  return out;
}

