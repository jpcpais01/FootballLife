// Recorded motion for the parts of a match that are shown live: every
// player's position and the ball's flight, straight from the simulation, so
// the 3D view replays exactly what the engine played instead of guessing.
//
// Windows are packed as zigzag varints of the frame-to-frame deltas (in 5 cm
// units) and base64'd, which keeps a whole match's highlights around 100 KB.

/** One-shot body actions the animation layer plays, timed to the engine. */
export type ActKind =
  | 'pass' // side-foot pass
  | 'drive' // driven / lofted pass, clearance
  | 'shot'
  | 'cross'
  | 'header'
  | 'trap' // first touch
  | 'tackle' // standing tackle / block
  | 'slide'
  | 'dive' // keeper dive (side in `a`)
  | 'catch'
  | 'throw' // throw-in
  | 'fall'; // fouled / beaten

/** [game time, player index, kind, side or detail] */
export type Act = [number, number, ActKind, number];

export interface TrackWindow {
  /** Game clock of the first sample. */
  t0: number;
  /** Game clock of the last sample. */
  t1: number;
  /** Player samples per second (ball runs at twice this). */
  hz: number;
  /** Packed player positions: 22 × (x, y) per sample. */
  p: string;
  /** Packed ball positions: (x, y, z) per sample at 2 × hz. */
  b: string;
  acts: Act[];
}

const UNIT = 0.05;

function zz(n: number): number {
  return n >= 0 ? n * 2 : -n * 2 - 1;
}
function unzz(n: number): number {
  return n & 1 ? -(n + 1) / 2 : n / 2;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function toB64(bytes: number[]): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const n = (a << 16) | (b << 8) | c;
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return s;
}

const B64I = new Int16Array(128).fill(-1);
for (let i = 0; i < 64; i++) B64I[B64.charCodeAt(i)] = i;

function fromB64(s: string): Uint8Array {
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const a = B64I[s.charCodeAt(i)];
    const b = B64I[s.charCodeAt(i + 1)];
    const c = s[i + 2] === '=' ? -1 : B64I[s.charCodeAt(i + 2)];
    const d = s[i + 3] === '=' ? -1 : B64I[s.charCodeAt(i + 3)];
    const n = (a << 18) | (b << 12) | ((c < 0 ? 0 : c) << 6) | (d < 0 ? 0 : d);
    out[o++] = (n >> 16) & 255;
    if (c >= 0) out[o++] = (n >> 8) & 255;
    if (d >= 0) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

/** Packs `frames` samples of `width` channels (row-major) as delta varints. */
export function pack(data: ArrayLike<number>, width: number): string {
  const bytes: number[] = [];
  const prev = new Array(width).fill(0);
  for (let i = 0; i < data.length; i++) {
    const c = i % width;
    const q = Math.round(data[i] / UNIT);
    let v = zz(q - prev[c]);
    prev[c] = q;
    while (v >= 128) {
      bytes.push((v & 127) | 128);
      v = Math.floor(v / 128);
    }
    bytes.push(v);
  }
  return toB64(bytes);
}

export function unpack(s: string, width: number): Float32Array {
  const bytes = fromB64(s);
  const vals: number[] = [];
  const prev = new Array(width).fill(0);
  let i = 0;
  let c = 0;
  while (i < bytes.length) {
    let v = 0;
    let mul = 1;
    let b: number;
    do {
      b = bytes[i++];
      v += (b & 127) * mul;
      mul *= 128;
    } while (b & 128 && i < bytes.length);
    prev[c] += unzz(v);
    vals.push(prev[c] * UNIT);
    c = (c + 1) % width;
  }
  return Float32Array.from(vals);
}

/** A decoded window, ready for playback. */
export interface Track {
  t0: number;
  t1: number;
  hz: number;
  p: Float32Array;
  b: Float32Array;
  acts: Act[];
}

export function decodeWindow(w: TrackWindow): Track {
  return { t0: w.t0, t1: w.t1, hz: w.hz, p: unpack(w.p, 44), b: unpack(w.b, 3), acts: w.acts };
}
