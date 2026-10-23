// Texture painting as plain-data jobs, so they can run on a worker (paintWorker.ts)
// and keep the page responsive, or right here when they're needed at once.
import { A, Region, regionAt, type FaceLand } from './body.ts';
import { paintBody, type BodyPaint } from './bodyPaint.ts';
import { paintHead, type RGB } from './paint.ts';
import { BEARD, SCALP } from './styles.ts';

export interface HeadJob {
  kind: 'head';
  size: number;
  uv: Float32Array;
  tri: Uint32Array;
  attr: Float32Array;
  k: number;
  land: FaceLand;
  skin: RGB;
  hair: RGB;
  hairStyle: number;
  beard: number;
  brows: number;
  marks: number;
  /** Shirt colour round the collar, and the trim where the collar band turns in. */
  collar: RGB;
  trim: RGB;
  keeper: boolean;
  seed: number;
  lite: boolean;
}
export type BodyJob = { kind: 'body' } & BodyPaint;
export type PaintJob = HeadJob | BodyJob;
export interface Painted {
  color: Uint8Array;
  detail: Uint8Array;
}

export function runPaintJob(j: PaintJob): Painted {
  if (j.kind === 'body') return paintBody(j);
  const w = { arm: 0, hand: 0, leg: 0, foot: 0, head: 0 };
  return paintHead({
    size: j.size,
    uv: j.uv,
    tri: j.tri,
    attr: j.attr,
    k: j.k,
    land: j.land,
    skin: j.skin,
    hair: j.hair,
    scalp: SCALP[j.hairStyle] ?? SCALP[0],
    beard: BEARD[j.beard] ?? BEARD[0],
    brows: j.brows,
    marks: j.marks,
    collar: (t) => {
      w.arm = t[A.arm];
      w.hand = t[A.hand];
      w.leg = t[A.leg];
      w.foot = t[A.foot];
      w.head = t[A.head];
      const x = t[A.pos], y = t[A.pos + 1], z = t[A.pos + 2];
      if (regionAt(x, y, z, t[A.armT], w, j.keeper) !== Region.Shirt) return null;
      // The collar band shows the trim colour where it turns in.
      return y > 1.74 ? j.trim : j.collar;
    },
    seed: j.seed,
    lite: j.lite,
  });
}
