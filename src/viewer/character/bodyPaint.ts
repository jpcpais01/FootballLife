// Paints the body texture on MakeHuman's UV layout: the kit (shirt with its
// pattern, collar and cuffs, shorts, socks, boots, keeper gloves) and the
// skin of the arms and legs. Every texel is painted from the bind-pose point
// it shows, so hems are crisp wherever the UV seams fall. Skin is stored as
// shading only (alpha 0) and toned per player in the shader, so a whole team
// shares one texture. A second texture carries fabric weave and creases as
// bump (red), roughness (green) and clearcoat (blue).
import { A, Region, SHORTS_TOP, regionAt, type Cut } from './body.ts';
import { casualTexel, type CasualPaint } from './casual.ts';
import { dilate, rasterize } from './raster.ts';
import { fbm, mixN, smooth, vnoise } from './noise.ts';
import { write, type RGB } from './paint.ts';

export type Pattern = 'plain' | 'stripes' | 'hoops';

export interface BodyPaint {
  size: number;
  uv: Float32Array;
  tri: Uint32Array;
  attr: Float32Array;
  k: number;
  keeper: boolean;
  cut: Cut;
  /** Off the pitch: his own clothes instead of the kit. */
  casual: CasualPaint | null;
  pattern: Pattern;
  shirt: RGB;
  trim: RGB;
  shorts: RGB;
  sock: RGB;
  boot: RGB;
  bootAccent: RGB;
  sole: RGB;
  glove: RGB;
  /** Wristbands (sweatbands), or null. */
  wrist: RGB | null;
  seed: number;
}

const SLEEVE = 0.14;
/** Skin texels hold shading around this grey; the shader scales it by the player's tone. */
export const SKIN_GREY = 0.5;

export function paintBody(inp: BodyPaint): { color: Uint8Array; detail: Uint8Array } {
  const { size, keeper } = inp;
  const color = new Uint8Array(size * size * 4);
  const detail = new Uint8Array(size * size * 4);
  const w = { arm: 0, hand: 0, leg: 0, foot: 0, head: 0 };
  const seed = inp.seed;

  const covered = rasterize(size, inp.uv, inp.tri, inp.attr, inp.k, (o, a) => {
    const x = a[A.pos], y = a[A.pos + 1], z = a[A.pos + 2];
    const armT = a[A.armT];
    w.arm = a[A.arm];
    w.hand = a[A.hand];
    w.leg = a[A.leg];
    w.foot = a[A.foot];
    w.head = a[A.head];
    const reg = regionAt(x, y, z, armT, w, inp.cut);
    let reg2: Region = reg;
    const ax = Math.abs(x);
    let c: RGB;
    let bump = 0.5;
    let rough = 0.8;
    let fabric = true;
    let coat = 0;
    if (inp.casual && reg !== Region.Skin) {
      const t = casualTexel(inp.casual, reg, x, y, z, armT, a, w, inp.cut, seed);
      if (t) {
        writeT(o, t.c, t.bump, t.rough, a[A.cav], t.coat, 1);
        return;
      }
      reg2 = Region.Skin;
    }
    switch (reg2) {
      case Region.Shirt: {
        c = inp.shirt;
        const onArm = w.arm > 0.5;
        if (!keeper && !onArm) {
          if (inp.pattern === 'stripes' && Math.floor((x + 4.035) / 0.07) % 2 === 1) c = inp.trim;
          if (inp.pattern === 'hoops' && y < 1.66 && Math.floor((y + 4) / 0.09) % 2 === 1) c = inp.trim;
        }
        if (keeper && !onArm && Math.abs(y - 1.5) < 0.035 && z > 0) c = inp.trim;
        // Collar band and cuffs in the trim colour.
        const collar = 1.775 - Math.max(0, z) * 0.6 - Math.max(0, 0.05 - ax) * 0.4;
        if (!onArm && w.head < 0.5 && y > collar - 0.018) c = inp.trim;
        const cuff = SLEEVE + (keeper ? 0.45 : 0);
        if (onArm && armT > cuff - 0.022) c = inp.trim;
        // Folds: soft creases running round the body, more at the waist and under the arms.
        const fold = fbm(x * 14 + seed, y * 34, z * 14, 3);
        bump += (fold - 0.5) * 0.35;
        break;
      }
      case Region.Shorts: {
        c = inp.shorts;
        const hem = 0.8 - ax * 0.15;
        if (y < hem + 0.022) c = keeper ? inp.shorts : inp.trim;
        // A thin piping down the outside of each leg.
        if (!keeper && ax > 0.17 && Math.abs(z) < 0.012) c = inp.trim;
        // Waistband.
        if (y > SHORTS_TOP - 0.03) {
          const k = 0.86;
          c = [c[0] * k, c[1] * k, c[2] * k];
        }
        bump += (fbm(x * 18, y * 22 + seed, z * 18, 3) - 0.5) * 0.3;
        rough = 0.72;
        break;
      }
      case Region.Sock: {
        c = inp.sock;
        if (y > 0.47) c = inp.trim;
        if (y > 0.495) c = inp.sock;
        // Ribbing.
        bump += Math.sin(Math.atan2(x - Math.sign(x) * 0.1, z) * 40) * 0.12;
        rough = 0.88;
        break;
      }
      case Region.Boot: {
        c = inp.boot;
        fabric = false;
        rough = 0.32;
        coat = 0.8;
        if (y < 0.028) {
          c = inp.sole;
          rough = 0.6;
          coat = 0.2;
        } else if (Math.abs(y - (0.07 - (z - 0.02) * 0.35)) < 0.012 && ax > 0.08 && z < 0.12) c = inp.bootAccent;
        // Laces down the front.
        if (z > 0.06 && y > 0.05 && y < 0.12 && Math.abs(ax - 0.1) < 0.018) {
          const lace = 0.5 + 0.5 * Math.sin(y * 260);
          bump += lace * 0.25;
        }
        break;
      }
      case Region.Glove: {
        c = inp.glove;
        // Darker grip on the palms.
        const palm = smooth(0.1, -0.5, a[A.nrm] * Math.sign(x));
        if (palm > 0.5) c = [c[0] * 0.32, c[1] * 0.34, c[2] * 0.36];
        bump += (vnoise(x * 400, y * 400, z * 400) - 0.5) * 0.3;
        rough = 0.7;
        break;
      }
      default: {
        c = [SKIN_GREY, SKIN_GREY, SKIN_GREY];
        fabric = false;
        rough = 0.58;
        // Wristbands just above the hands.
        if (inp.wrist && w.arm > 0.3 && armT > 0.44 && armT < 0.5) {
          c = inp.wrist;
          fabric = true;
          rough = 0.85;
          break;
        }
        const m = fbm(x * 40 + seed, y * 40, z * 40, 3) - 0.5;
        const sk = skinVar(c, m, w.hand, armT, a, x);
        bump += (vnoise(x * 1100, y * 1100, z * 1100) - 0.5) * 0.08;
        writeT(o, sk, bump, rough, a[A.cav], 0, 0);
        return;
      }
    }
    if (fabric) {
      // Knit: a fine mesh of dimples, with a soft sheen variation.
      const knit = Math.sin(x * 900 + y * 520) * Math.sin(z * 900 - y * 520);
      bump += knit * 0.08;
      rough -= knit * 0.04;
    }
    writeT(o, c, bump, rough, a[A.cav], coat, 1);
  });

  function writeT(o: number, c: RGB, bump: number, rough: number, cav: number, coat: number, alpha: number) {
    const k = 1 - cav * 0.45;
    write(color, detail, o, c[0] * k, c[1] * k, c[2] * k, bump, rough, coat, alpha);
  }
  dilate(color, covered, size);
  dilate(detail, covered, size);
  return { color, detail };
}

/** Skin on the limbs: mottling, warmer knees, elbows and knuckles, paler palms. */
function skinVar(s: RGB, m: number, hand: number, armT: number, a: Float32Array, x: number): RGB {
  const y = a[A.pos + 1], z = a[A.pos + 2];
  let r = s[0] * (1 + m * 0.08), g = s[1] * (1 + m * 0.07), b = s[2] * (1 + m * 0.06);
  const knee = Math.exp(-((y - 0.62) ** 2) / 0.0016) * smooth(0, 0.08, z);
  const elbow = Math.exp(-((armT - 0.3) ** 2) / 0.002) * smooth(0, -0.6, a[A.nrm + 2]);
  const red = (knee + elbow) * 0.12 + hand * 0.06;
  r *= 1 + red * 0.4;
  g *= 1 - red * 0.5;
  b *= 1 - red * 0.4;
  if (hand > 0.5) {
    // Palms are paler on every skin tone.
    // In the bind pose the palms face the thighs.
    const palm = smooth(0.1, -0.5, a[A.nrm] * Math.sign(x)) * hand;
    r = mixN(r, r * 1.25 + 0.04, palm * 0.5);
    g = mixN(g, g * 1.2 + 0.03, palm * 0.5);
    b = mixN(b, b * 1.18 + 0.03, palm * 0.5);
  }
  return [r, g, b];
}
