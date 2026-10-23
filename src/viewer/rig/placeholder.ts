// Hand-made motions on the player skeleton, used until (and wherever) mocap
// clips are missing. Each one is a function of time over a handful of
// body-level controls (leg flex, knee, arm swing…), baked to 30 fps clips in
// exactly the same form as converted mocap.
import { type Clip, analyse, fkFrame, mirrorClip } from './clip.ts';
import { ANKLE_Y, B, NB, REST } from './skeleton.ts';

/** Body-level controls. Angles in radians; "forward"/"out"/"left" are positive. */
interface Ctl {
  /** Hips offset (body units) and rotation: pitch forward, yaw to the left, roll to the left. */
  hx?: number; hy?: number; hz?: number; hp?: number; hyaw?: number; hr?: number;
  /** Spine bend spread over the three spine bones. */
  sp?: number; sy?: number; sr?: number;
  /** Neck and head: pitch down, yaw left. */
  np?: number; ny?: number;
  /** Legs, left then right: flex forward, abduct out, twist toes out, knee bend, extra ankle (toes down). */
  lf?: number; la?: number; lt?: number; lk?: number; lan?: number;
  rf?: number; ra?: number; rt?: number; rk?: number; ran?: number;
  /** False: ankles keep their own angle instead of keeping the feet level. */
  flat?: boolean;
  /** Arms: lowered from the T-pose (PI/2 = hanging), swing forward, twist, elbow bend, shoulder shrug. */
  ld?: number; lfw?: number; ltw?: number; le?: number; lsh?: number;
  rd?: number; rfw?: number; rtw?: number; re?: number; rsh?: number;
  /** Lowest foot onto the ground (default true); hy is added on top. */
  ground?: boolean;
}

type Q = [number, number, number, number];
const qx = (a: number): Q => [Math.sin(a / 2), 0, 0, Math.cos(a / 2)];
const qy = (a: number): Q => [0, Math.sin(a / 2), 0, Math.cos(a / 2)];
const qz = (a: number): Q => [0, 0, Math.sin(a / 2), Math.cos(a / 2)];
function mul(...qs: Q[]): Q {
  let [x, y, z, w] = qs[0];
  for (let i = 1; i < qs.length; i++) {
    const [bx, by, bz, bw] = qs[i];
    [x, y, z, w] = [w * bx + x * bw + y * bz - z * by, w * by - x * bz + y * bw + z * bx, w * bz + x * by - y * bx + z * bw, w * bw - x * bx - y * by - z * bz];
  }
  return [x, y, z, w];
}

const TOE_Y = REST[B.LeftToeBase][1];

function write(c: Ctl, rot: Float32Array, pos: Float32Array, f: number) {
  const set = (bone: number, q: Q) => rot.set(q, (f * NB + bone) * 4);
  const v = (k: keyof Ctl, d = 0) => (c[k] as number | undefined) ?? d;
  const hp = v('hp');
  set(B.Hips, mul(qy(v('hyaw')), qx(hp), qz(-v('hr'))));
  const sp = v('sp'), sy = v('sy'), sr = v('sr');
  set(B.Spine, mul(qy(sy * 0.3), qx(sp * 0.3), qz(-sr * 0.3)));
  set(B.Spine1, mul(qy(sy * 0.35), qx(sp * 0.35), qz(-sr * 0.35)));
  set(B.Spine2, mul(qy(sy * 0.35), qx(sp * 0.35), qz(-sr * 0.35)));
  const np = v('np'), ny = v('ny');
  set(B.Neck, mul(qy(ny * 0.4), qx(np * 0.4)));
  set(B.Head, mul(qy(ny * 0.6), qx(np * 0.6)));
  const flat = c.flat !== false;
  for (const [s, p] of [[1, 'l'], [-1, 'r']] as const) {
    const L = s > 0;
    const fl = v(`${p}f` as keyof Ctl), ab = v(`${p}a` as keyof Ctl), tw = v(`${p}t` as keyof Ctl), kn = v(`${p}k` as keyof Ctl), an = v(`${p}an` as keyof Ctl);
    set(L ? B.LeftUpLeg : B.RightUpLeg, mul(qz(s * ab), qx(-fl), qy(s * tw)));
    set(L ? B.LeftLeg : B.RightLeg, qx(kn));
    // Level feet: the ankle undoes the hips, thigh and knee pitch.
    set(L ? B.LeftFoot : B.RightFoot, qx((flat ? fl - kn - hp : 0) + an));
    set(L ? B.LeftToeBase : B.RightToeBase, qx(0));
    const d = v(`${p}d` as keyof Ctl, 1.32), fw = v(`${p}fw` as keyof Ctl), at = v(`${p}tw` as keyof Ctl), el = v(`${p}e` as keyof Ctl, 0.25), sh = v(`${p}sh` as keyof Ctl);
    set(L ? B.LeftShoulder : B.RightShoulder, qz(s * sh));
    set(L ? B.LeftArm : B.RightArm, mul(qx(-fw), qz(-s * d), qx(s * at)));
    set(L ? B.LeftForeArm : B.RightForeArm, qy(-s * el));
    set(L ? B.LeftHand : B.RightHand, qz(-s * 0.12));
  }
  pos[f * 3] = v('hx');
  pos[f * 3 + 1] = 0;
  pos[f * 3 + 2] = v('hz');
}

const P = new Float32Array(NB * 3);

/** Bakes a control function into a clip at 30 fps. */
function bake(name: string, dur: number, loop: boolean, fn: (t: number) => Ctl, contact?: number): Clip {
  const fps = 30;
  const frames = loop ? Math.round(dur * fps) : Math.round(dur * fps) + 1;
  const rot = new Float32Array(frames * NB * 4);
  const pos = new Float32Array(frames * 3);
  const clip: Clip = { name, fps, frames, loop, rot, pos, contact };
  for (let f = 0; f < frames; f++) {
    const c = fn(loop ? (f / frames) * dur : Math.min(dur, f / fps));
    write(c, rot, pos, f);
    let lift = 0;
    if (c.ground !== false) {
      fkFrame(clip, f, P);
      let lo = Infinity;
      for (const [a, t] of [[B.LeftFoot, B.LeftToeBase], [B.RightFoot, B.RightToeBase]]) lo = Math.min(lo, P[a * 3 + 1] - ANKLE_Y, P[t * 3 + 1] - TOE_Y);
      lift = -lo;
    }
    pos[f * 3 + 1] = lift + (c.hy ?? 0);
  }
  return analyse(clip);
}

// ---------- Helpers ----------

const TAU = Math.PI * 2;
/** A smooth bump centred on c with width w, on a wrapping 0..1 phase. */
function bump(x: number, c: number, w: number) {
  let d = Math.abs(x - c) % 1;
  if (d > 0.5) d = 1 - d;
  return Math.exp(-(d / w) * (d / w));
}
const smooth = (u: number) => u * u * (3 - 2 * u);
/** Keyframed value: [time, value] pairs eased with smoothstep. */
function kf(keys: [number, number][]) {
  return (t: number) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      if (t <= keys[i][0]) {
        const [t0, v0] = keys[i - 1];
        const [t1, v1] = keys[i];
        return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0));
      }
    }
    return keys[keys.length - 1][1];
  };
}
/** Keyframes several controls at once: { lf: [[t, v], …], … }. */
function track(spec: Partial<Record<keyof Ctl, [number, number][]>>, extra?: (t: number, c: Ctl) => void) {
  const fns = Object.entries(spec).map(([k, keys]) => [k, kf(keys!)] as const);
  return (t: number) => {
    const c: Ctl = {};
    for (const [k, f] of fns) (c as Record<string, number>)[k] = f(t);
    extra?.(t, c);
    return c;
  };
}

// ---------- Locomotion ----------

interface Gait { cycle: number; hip: number; knee: number; load: number; duty: number; lean: number; arm: number; elbow: number; flight: number; yaw: number; push: number; down: number; back?: boolean }

function gait(name: string, g: Gait): Clip {
  return bake(name, g.cycle, true, (t) => {
    let ph = t / g.cycle;
    if (g.back) ph = 1 - ph;
    const c: Ctl = {};
    const leg = (p: number) => {
      const fl = g.hip * Math.cos(TAU * p) + g.hip * 0.15;
      const kn = 0.1 + g.load * bump(p, 0.12, 0.08) + g.knee * bump(p, g.duty + (1 - g.duty) * 0.42, 0.15);
      const an = 0.45 * g.push * bump(p, g.duty - 0.03, 0.07) - 0.12 * bump(p, 0, 0.05);
      return [fl, kn, an];
    };
    [c.lf, c.lk, c.lan] = leg(ph);
    [c.rf, c.rk, c.ran] = leg(ph + 0.5);
    c.lt = c.rt = 0.08;
    c.hyaw = -g.yaw * Math.cos(TAU * ph);
    c.sy = g.yaw * 1.7 * Math.cos(TAU * ph);
    c.hr = g.yaw * 0.35 * Math.sin(TAU * ph * 2);
    c.sp = g.lean + 0.02 * Math.cos(TAU * ph * 2);
    c.np = -g.lean * 0.8;
    c.ny = -c.sy * 0.6;
    c.lfw = -g.arm * Math.cos(TAU * ph) + g.arm * 0.12;
    c.rfw = g.arm * Math.cos(TAU * ph) + g.arm * 0.12;
    c.ld = c.rd = g.down;
    c.le = g.elbow + 0.18 * g.arm * Math.max(0, Math.cos(TAU * ph));
    c.re = g.elbow + 0.18 * g.arm * Math.max(0, -Math.cos(TAU * ph));
    c.ltw = c.rtw = -0.25;
    // Airborne between toe-off and the other foot's strike.
    const fly = (p: number) => {
      const u = ((p % 0.5) + 0.5) % 0.5;
      return u > g.duty ? Math.sin((Math.PI * (u - g.duty)) / Math.max(0.01, 0.5 - g.duty)) : 0;
    };
    c.hy = g.flight * fly(ph);
    return c;
  });
}

function strafe(name: string): Clip {
  // Shuffling to the player's left: the lead foot steps out, the trailing foot closes in.
  const cycle = 0.46;
  const L = 0.96;
  return bake(name, cycle, true, (t) => {
    const ph = t / cycle;
    const c: Ctl = {};
    const lx = 0.08 + 0.17 * Math.cos(TAU * ph);
    const rx = -0.08 + 0.17 * Math.cos(TAU * (ph - 0.5));
    c.la = Math.asin(lx / L);
    c.ra = Math.asin(-rx / L);
    const swingL = ph > 0.5 ? Math.sin(Math.PI * (ph - 0.5) * 2) : 0;
    const swingR = ph < 0.5 ? Math.sin(Math.PI * ph * 2) : 0;
    c.lf = 0.3 + 0.25 * swingL;
    c.rf = 0.3 + 0.25 * swingR;
    c.lk = 0.45 + 0.45 * swingL;
    c.rk = 0.45 + 0.45 * swingR;
    c.lt = 0.2;
    c.rt = -0.05;
    c.hp = 0.1;
    c.sp = 0.18;
    c.sr = 0.05;
    c.np = -0.2;
    c.ld = c.rd = 1.05;
    c.lfw = c.rfw = 0.35;
    c.le = c.re = 0.9;
    c.hy = 0.03 * Math.abs(Math.sin(TAU * ph));
    return c;
  });
}

function idle(name: string, keeper: boolean): Clip {
  const dur = keeper ? 2.4 : 3.2;
  return bake(name, dur, true, (t) => {
    const u = (TAU * t) / dur;
    const c: Ctl = {};
    if (keeper) {
      // Ready stance: low, wide, hands up, light on the toes.
      const b = 0.05 * Math.sin(u * 2);
      c.lf = c.rf = 0.55 + b * 0.6;
      c.lk = c.rk = 0.85 + b;
      c.la = c.ra = 0.14;
      c.lt = c.rt = 0.15;
      c.hp = 0.12;
      c.sp = 0.3;
      c.np = -0.4;
      c.ld = c.rd = 0.95;
      c.lfw = c.rfw = 0.6;
      c.le = c.re = 1.1;
      c.sy = 0.04 * Math.sin(u);
    } else {
      // Loose and alert: weight drifting foot to foot, breathing.
      c.hx = 0.018 * Math.sin(u);
      c.hr = -0.02 * Math.sin(u);
      c.sr = 0.025 * Math.sin(u);
      c.la = 0.04 - 0.018 * Math.sin(u);
      c.ra = 0.04 + 0.018 * Math.sin(u);
      c.lt = c.rt = 0.14;
      c.lk = 0.12 + 0.05 * Math.max(0, -Math.sin(u));
      c.rk = 0.12 + 0.05 * Math.max(0, Math.sin(u));
      c.lf = c.lk * 0.5;
      c.rf = c.rk * 0.5;
      c.sp = 0.03 + 0.012 * Math.sin(u * 2);
      c.np = -0.02;
      c.ld = c.rd = 1.36 - 0.012 * Math.sin(u * 2);
      c.lfw = c.rfw = 0.06;
      c.ltw = c.rtw = -0.3;
      c.le = c.re = 0.26;
      c.lsh = c.rsh = 0.02 * Math.sin(u * 2);
    }
    return c;
  });
}

// ---------- One-shot actions (right-footed; mirror for the left) ----------

/** Strikes: pass, shot, chip and cross share a shape with different reach. */
function strike(name: string, o: { dur: number; at: number; back: number; knee: number; thru: number; follow: number; lean: number; inside: number; laces: number; arm: number }): Clip {
  const a = o.at;
  return bake(name, o.dur, false, track({
    lf: [[0, 0.05], [a * 0.5, 0.3], [a, 0.18], [a + 0.25, 0.05], [o.dur, 0]],
    lk: [[0, 0.12], [a * 0.5, 0.45], [a, 0.32], [a + 0.25, 0.2], [o.dur, 0.12]],
    la: [[0, 0.04], [a, 0.06], [o.dur, 0.04]],
    rf: [[0, 0.05], [a * 0.35, -0.2], [a * 0.75, -o.back], [a, o.thru], [a + 0.18, o.follow], [a + 0.45, 0.25], [o.dur, 0.05]],
    rk: [[0, 0.12], [a * 0.75, o.knee], [a * 0.95, 0.5], [a, 0.18], [a + 0.18, 0.25], [a + 0.45, 0.35], [o.dur, 0.12]],
    rt: [[0, 0.05], [a * 0.75, o.inside * 0.4], [a, o.inside], [a + 0.3, o.inside * 0.4], [o.dur, 0.05]],
    ran: [[0, 0], [a * 0.8, o.laces * 0.5], [a, o.laces], [a + 0.3, 0], [o.dur, 0]],
    hyaw: [[0, 0], [a * 0.75, -0.18], [a, 0.12], [a + 0.25, 0.25], [o.dur, 0]],
    sy: [[0, 0], [a * 0.75, 0.3], [a, -0.05], [a + 0.25, -0.3], [o.dur, 0]],
    sp: [[0, 0.05], [a * 0.75, 0.08], [a, o.lean], [a + 0.25, o.lean * 0.6], [o.dur, 0.04]],
    sr: [[0, 0], [a * 0.75, 0.12], [a, 0.08], [o.dur, 0]],
    np: [[0, 0.1], [a, 0.35 - o.lean], [a + 0.3, 0.1], [o.dur, 0]],
    ld: [[0, 1.3], [a * 0.75, 0.55 - o.arm * 0.3], [a + 0.2, 0.6], [o.dur, 1.3]],
    lfw: [[0, 0.05], [a * 0.75, 0.6], [a + 0.25, 0.1], [o.dur, 0.05]],
    rd: [[0, 1.3], [a * 0.75, 1.0], [a + 0.2, 0.7 - o.arm * 0.3], [o.dur, 1.3]],
    rfw: [[0, 0.05], [a * 0.75, -0.4], [a + 0.25, 0.4], [o.dur, 0.05]],
    le: [[0, 0.3], [a, 0.6], [o.dur, 0.3]],
    re: [[0, 0.3], [a, 0.5], [o.dur, 0.3]],
  }), a);
}

function actions(): Clip[] {
  const out: Clip[] = [];
  out.push(strike('pass', { dur: 0.9, at: 0.36, back: 0.55, knee: 1.1, thru: 0.45, follow: 0.75, lean: 0.12, inside: 0.75, laces: 0, arm: 0.3 }));
  out.push(strike('shot', { dur: 1.0, at: 0.42, back: 0.95, knee: 1.7, thru: 0.75, follow: 1.3, lean: 0.22, inside: 0.1, laces: 0.55, arm: 1 }));
  out.push(strike('chip', { dur: 0.95, at: 0.4, back: 0.8, knee: 1.4, thru: 0.6, follow: 0.8, lean: -0.14, inside: 0.2, laces: -0.15, arm: 0.8 }));
  out.push(strike('cross', { dur: 1.0, at: 0.4, back: 0.85, knee: 1.5, thru: 0.65, follow: 1.15, lean: -0.06, inside: 0.45, laces: 0.25, arm: 1 }));

  out.push(bake('trap', 0.7, false, track({
    rf: [[0, 0.05], [0.18, 0.5], [0.25, 0.42], [0.42, 0.15], [0.7, 0.05]],
    rk: [[0, 0.12], [0.18, 0.55], [0.25, 0.5], [0.42, 0.3], [0.7, 0.12]],
    rt: [[0, 0.05], [0.18, 0.65], [0.42, 0.3], [0.7, 0.05]],
    ran: [[0, 0], [0.18, -0.35], [0.42, -0.1], [0.7, 0]],
    lk: [[0, 0.12], [0.25, 0.3], [0.7, 0.12]],
    lf: [[0, 0.05], [0.25, 0.12], [0.7, 0.05]],
    sp: [[0, 0.05], [0.25, 0.22], [0.7, 0.05]],
    np: [[0, 0.1], [0.25, 0.5], [0.7, 0.1]],
    ld: [[0, 1.3], [0.2, 0.85], [0.7, 1.3]],
    rd: [[0, 1.3], [0.2, 0.95], [0.7, 1.3]],
    le: [[0, 0.3], [0.2, 0.55], [0.7, 0.3]],
    re: [[0, 0.3], [0.2, 0.55], [0.7, 0.3]],
  }), 0.25));

  out.push(bake('chest', 0.85, false, track({
    sp: [[0, 0.05], [0.25, -0.38], [0.32, -0.3], [0.55, 0.15], [0.85, 0.05]],
    np: [[0, 0], [0.3, 0.45], [0.55, 0.3], [0.85, 0.05]],
    lk: [[0, 0.12], [0.3, 0.35], [0.85, 0.12]],
    rk: [[0, 0.12], [0.3, 0.35], [0.85, 0.12]],
    lf: [[0, 0.05], [0.3, 0.05], [0.85, 0.05]],
    rf: [[0, 0.05], [0.3, 0.05], [0.85, 0.05]],
    ld: [[0, 1.3], [0.25, 0.55], [0.6, 0.9], [0.85, 1.3]],
    rd: [[0, 1.3], [0.25, 0.55], [0.6, 0.9], [0.85, 1.3]],
    lfw: [[0, 0.05], [0.25, 0.25], [0.85, 0.05]],
    rfw: [[0, 0.05], [0.25, 0.25], [0.85, 0.05]],
    le: [[0, 0.3], [0.25, 0.5], [0.85, 0.3]],
    re: [[0, 0.3], [0.25, 0.5], [0.85, 0.3]],
  }), 0.3));

  out.push(bake('header', 1.1, false, track({
    lf: [[0, 0.1], [0.2, 0.6], [0.32, 0.05], [0.45, 0.45], [0.55, 0.2], [0.8, 0.55], [1.1, 0.1]],
    rf: [[0, 0.1], [0.2, 0.6], [0.32, 0.05], [0.45, 0.15], [0.55, 0.3], [0.8, 0.55], [1.1, 0.1]],
    lk: [[0, 0.15], [0.2, 0.95], [0.32, 0.15], [0.45, 0.9], [0.55, 0.5], [0.8, 0.9], [1.1, 0.15]],
    rk: [[0, 0.15], [0.2, 0.95], [0.32, 0.15], [0.45, 0.55], [0.55, 0.6], [0.8, 0.9], [1.1, 0.15]],
    sp: [[0, 0.08], [0.2, 0.3], [0.32, 0.05], [0.45, -0.38], [0.52, 0.35], [0.7, 0.15], [0.85, 0.25], [1.1, 0.06]],
    np: [[0, 0], [0.2, -0.2], [0.45, -0.25], [0.52, 0.4], [0.7, 0.1], [1.1, 0]],
    ld: [[0, 1.3], [0.2, 1.25], [0.35, 0.6], [0.5, 0.4], [0.75, 0.9], [1.1, 1.3]],
    rd: [[0, 1.3], [0.2, 1.25], [0.35, 0.6], [0.5, 0.4], [0.75, 0.9], [1.1, 1.3]],
    lfw: [[0, 0.05], [0.2, -0.6], [0.35, 1.0], [0.5, 0.7], [0.75, 0.3], [1.1, 0.05]],
    rfw: [[0, 0.05], [0.2, -0.6], [0.35, 1.0], [0.5, 0.7], [0.75, 0.3], [1.1, 0.05]],
    le: [[0, 0.3], [0.35, 1.0], [0.75, 0.6], [1.1, 0.3]],
    re: [[0, 0.3], [0.35, 1.0], [0.75, 0.6], [1.1, 0.3]],
  }, (t, c) => {
    c.hy = t > 0.3 && t < 0.8 ? 0.6 * Math.sin((Math.PI * (t - 0.3)) / 0.5) : 0;
  }), 0.5));

  out.push(bake('slide', 1.25, false, track({
    hy: [[0, 0], [0.3, -0.9], [0.95, -0.92], [1.25, -0.2]],
    hp: [[0, 0], [0.3, -0.4], [0.95, -0.38], [1.25, 0]],
    hr: [[0, 0], [0.3, 0.25], [0.95, 0.22], [1.25, 0]],
    rf: [[0, 0.1], [0.25, 1.15], [0.95, 1.1], [1.25, 0.3]],
    rk: [[0, 0.2], [0.25, 0.05], [0.95, 0.1], [1.25, 0.4]],
    ran: [[0, 0], [0.3, -0.3], [1.25, 0]],
    lf: [[0, 0.1], [0.3, 0.55], [0.95, 0.55], [1.25, 0.4]],
    lk: [[0, 0.3], [0.3, 1.9], [0.95, 1.9], [1.25, 0.9]],
    la: [[0, 0], [0.3, 0.35], [1.25, 0.05]],
    sp: [[0, 0.1], [0.3, -0.3], [0.95, -0.25], [1.25, 0.15]],
    sr: [[0, 0], [0.3, 0.25], [1.25, 0]],
    np: [[0, 0], [0.3, 0.45], [1.25, 0.1]],
    ld: [[0, 1.3], [0.3, 0.35], [0.95, 0.4], [1.25, 1.2]],
    lfw: [[0, 0.05], [0.3, -0.25], [1.25, 0.05]],
    rd: [[0, 1.3], [0.3, 0.7], [0.95, 0.75], [1.25, 1.2]],
    rfw: [[0, 0.05], [0.3, 0.7], [1.25, 0.05]],
    le: [[0, 0.3], [0.3, 0.2], [1.25, 0.3]],
    re: [[0, 0.3], [0.3, 0.6], [1.25, 0.3]],
  }, (_t, c) => {
    c.ground = false;
    c.flat = false;
  }), 0.35));

  out.push(bake('tackle', 0.85, false, track({
    lf: [[0, 0.1], [0.25, 0.55], [0.55, 0.5], [0.85, 0.1]],
    lk: [[0, 0.2], [0.25, 0.95], [0.55, 0.9], [0.85, 0.2]],
    rf: [[0, 0.1], [0.2, -0.2], [0.35, 0.95], [0.55, 0.85], [0.85, 0.1]],
    rk: [[0, 0.2], [0.2, 0.7], [0.35, 0.08], [0.55, 0.15], [0.85, 0.2]],
    rt: [[0, 0], [0.35, 0.6], [0.85, 0]],
    ran: [[0, 0], [0.35, -0.25], [0.85, 0]],
    hyaw: [[0, 0], [0.35, 0.2], [0.85, 0]],
    sp: [[0, 0.1], [0.35, 0.32], [0.85, 0.1]],
    np: [[0, 0], [0.35, 0.2], [0.85, 0]],
    ld: [[0, 1.2], [0.35, 0.6], [0.85, 1.2]],
    rd: [[0, 1.2], [0.35, 0.8], [0.85, 1.2]],
    lfw: [[0, 0.1], [0.35, 0.5], [0.85, 0.1]],
    rfw: [[0, 0.1], [0.35, -0.3], [0.85, 0.1]],
    le: [[0, 0.4], [0.35, 0.8], [0.85, 0.4]],
    re: [[0, 0.4], [0.35, 0.6], [0.85, 0.4]],
  }), 0.35));

  // Keeper: settle into a set position just before the shot.
  const setPose = { lf: 0.55, rf: 0.55, lk: 0.85, rk: 0.85, la: 0.16, ra: 0.16, hp: 0.12, sp: 0.3, np: -0.4, ld: 0.95, rd: 0.95, lfw: 0.6, rfw: 0.6, le: 1.1, re: 1.1 };
  out.push(bake('keeperSet', 0.55, false, (t) => {
    const k = smooth(Math.min(1, t / 0.3));
    const c: Ctl = {};
    for (const [key, v] of Object.entries(setPose)) (c as Record<string, number>)[key] = v * (0.55 + 0.45 * k);
    c.hy = t > 0.05 && t < 0.28 ? 0.1 * Math.sin((Math.PI * (t - 0.05)) / 0.23) : 0;
    return c;
  }, 0.3));

  // Dive to the keeper's left (+x); mirrored for the right.
  out.push(bake('dive', 1.7, false, track({
    hx: [[0, 0], [0.18, 0.08], [0.45, 0.85], [0.75, 1.15], [1.1, 1.15], [1.7, 0.1]],
    hy: [[0, 0], [0.18, -0.2], [0.45, -0.5], [0.75, -0.9], [1.1, -0.9], [1.45, -0.55], [1.7, 0]],
    hr: [[0, 0], [0.18, 0.2], [0.45, 1.3], [0.75, 1.45], [1.1, 1.4], [1.45, 0.6], [1.7, 0]],
    hp: [[0, 0.12], [0.45, 0], [1.1, 0], [1.7, 0.1]],
    lf: [[0, 0.55], [0.18, 0.75], [0.45, 0.3], [0.75, 0.25], [1.1, 0.4], [1.45, 0.9], [1.7, 0.5]],
    lk: [[0, 0.85], [0.18, 1.1], [0.45, 0.25], [0.75, 0.4], [1.1, 0.6], [1.45, 1.5], [1.7, 0.8]],
    rf: [[0, 0.55], [0.18, 0.7], [0.45, 0.15], [0.75, 0.35], [1.1, 0.5], [1.45, 0.8], [1.7, 0.5]],
    rk: [[0, 0.85], [0.18, 1.0], [0.45, 0.3], [0.75, 0.7], [1.1, 0.8], [1.45, 1.4], [1.7, 0.8]],
    la: [[0, 0.16], [0.18, 0.3], [0.45, 0.1], [1.7, 0.16]],
    ra: [[0, 0.16], [0.45, 0.25], [1.7, 0.16]],
    sp: [[0, 0.3], [0.45, 0.05], [1.1, 0.1], [1.7, 0.3]],
    sr: [[0, 0], [0.45, 0.15], [1.1, 0.1], [1.7, 0]],
    np: [[0, -0.4], [0.45, -0.1], [1.1, 0], [1.7, -0.3]],
    ld: [[0, 0.95], [0.18, 1.0], [0.4, -1.25], [0.75, -1.3], [1.1, -1.1], [1.45, 0.6], [1.7, 0.95]],
    rd: [[0, 0.95], [0.18, 1.0], [0.4, -0.95], [0.75, -1.0], [1.1, -0.8], [1.45, 0.8], [1.7, 0.95]],
    lfw: [[0, 0.6], [0.4, 0.25], [1.1, 0.3], [1.7, 0.6]],
    rfw: [[0, 0.6], [0.4, 0.4], [1.1, 0.35], [1.7, 0.6]],
    le: [[0, 1.1], [0.4, 0.15], [1.1, 0.3], [1.7, 1.0]],
    re: [[0, 1.1], [0.4, 0.2], [1.1, 0.3], [1.7, 1.0]],
  }, (_t, c) => {
    c.ground = false;
    c.flat = false;
  }), 0.45));

  out.push(bake('catch', 0.85, false, track({
    ld: [[0, 0.95], [0.25, 0.8], [0.35, 0.85], [0.6, 1.0], [0.85, 1.0]],
    rd: [[0, 0.95], [0.25, 0.8], [0.35, 0.85], [0.6, 1.0], [0.85, 1.0]],
    lfw: [[0, 0.6], [0.25, 1.25], [0.35, 1.1], [0.6, 0.75], [0.85, 0.7]],
    rfw: [[0, 0.6], [0.25, 1.25], [0.35, 1.1], [0.6, 0.75], [0.85, 0.7]],
    le: [[0, 1.1], [0.25, 0.45], [0.35, 0.8], [0.6, 1.7], [0.85, 1.6]],
    re: [[0, 1.1], [0.25, 0.45], [0.35, 0.8], [0.6, 1.7], [0.85, 1.6]],
    sp: [[0, 0.3], [0.35, 0.15], [0.6, 0.4], [0.85, 0.3]],
    np: [[0, -0.4], [0.35, -0.1], [0.6, 0.35], [0.85, 0.2]],
    lf: [[0, 0.55], [0.35, 0.35], [0.6, 0.5], [0.85, 0.4]],
    rf: [[0, 0.55], [0.35, 0.35], [0.6, 0.5], [0.85, 0.4]],
    lk: [[0, 0.85], [0.35, 0.5], [0.6, 0.75], [0.85, 0.6]],
    rk: [[0, 0.85], [0.35, 0.5], [0.6, 0.75], [0.85, 0.6]],
    la: [[0, 0.16], [0.85, 0.1]],
    ra: [[0, 0.16], [0.85, 0.1]],
  }), 0.35));

  // Training keepy-ups: right foot on the beat, left on the half beat.
  out.push(bake('juggle', 1.0, true, (t) => {
    const r = Math.pow(Math.max(0, Math.cos(TAU * t)), 3);
    const l = Math.pow(Math.max(0, -Math.cos(TAU * t)), 3);
    return { rf: 0.75 * r, rk: 0.12 + 0.75 * r, ran: -0.25 * r, lf: 0.75 * l, lk: 0.12 + 0.75 * l, lan: -0.25 * l, sp: 0.12, np: 0.45, ld: 0.95, rd: 0.95, lfw: 0.2, rfw: 0.2, le: 0.5, re: 0.5, lt: 0.1, rt: 0.1 };
  }));

  return out;
}

// ---------- Match officials: signals (right arm; mirror for the left) ----------

/** A referee's or assistant's signal: the right arm moves through `arm` keys over a relaxed standing stance. */
function signal(name: string, dur: number, contact: number, arm: Partial<Record<keyof Ctl, [number, number][]>>): Clip {
  return bake(name, dur, false, track({
    lk: [[0, 0.12], [dur, 0.12]], rk: [[0, 0.12], [dur, 0.12]],
    lf: [[0, 0.06], [dur, 0.06]], rf: [[0, 0.06], [dur, 0.06]],
    lt: [[0, 0.12], [dur, 0.12]], rt: [[0, 0.12], [dur, 0.12]],
    ld: [[0, 1.36], [dur, 1.36]], le: [[0, 0.26], [dur, 0.26]], ltw: [[0, -0.3], [dur, -0.3]],
    rd: [[0, 1.36], [dur, 1.36]], rfw: [[0, 0.06], [dur, 0.06]], re: [[0, 0.26], [dur, 0.26]], rtw: [[0, -0.3], [dur, -0.3]],
    ...arm,
  }), contact);
}

function officials(): Clip[] {
  const out: Clip[] = [];
  // Whistle: hand up to the mouth, a sharp blast, hand back down.
  out.push(signal('refWhistle', 1.1, 0.3, {
    rd: [[0, 1.36], [0.28, 2.5], [0.8, 2.5], [1.1, 1.36]],
    rfw: [[0, 0.06], [0.28, 1.05], [0.8, 1.05], [1.1, 0.06]],
    re: [[0, 0.26], [0.28, 1.9], [0.8, 1.9], [1.1, 0.26]],
    rtw: [[0, -0.3], [0.28, -0.45], [0.8, -0.45], [1.1, -0.3]],
    np: [[0, 0], [0.3, -0.12], [0.45, -0.05], [1.1, 0]],
    sp: [[0, 0.03], [0.3, -0.04], [1.1, 0.03]],
  }));
  // Pointing the way: arm straight, raised a little above level (a free kick's direction, the centre spot).
  out.push(signal('refPoint', 1.7, 0.4, {
    rd: [[0, 1.36], [0.38, 1.5], [1.35, 1.5], [1.7, 1.36]],
    rfw: [[0, 0.06], [0.38, 1.95], [1.35, 1.95], [1.7, 0.06]],
    re: [[0, 0.26], [0.38, 0.04], [1.35, 0.04], [1.7, 0.26]],
    rtw: [[0, -0.3], [0.38, 0], [1.35, 0], [1.7, -0.3]],
    sp: [[0, 0.03], [0.38, -0.05], [1.35, -0.05], [1.7, 0.03]],
  }));
  // The penalty spot: arm straight, pointing down at it.
  out.push(signal('refSpot', 1.8, 0.4, {
    rd: [[0, 1.36], [0.38, 1.45], [1.45, 1.45], [1.8, 1.36]],
    rfw: [[0, 0.06], [0.38, 1.2], [1.45, 1.2], [1.8, 0.06]],
    re: [[0, 0.26], [0.38, 0.04], [1.45, 0.04], [1.8, 0.26]],
    rtw: [[0, -0.3], [0.38, 0], [1.45, 0], [1.8, -0.3]],
    sp: [[0, 0.03], [0.38, 0.1], [1.45, 0.1], [1.8, 0.03]],
  }));
  // A card: hand to the pocket, then held straight up over the head.
  out.push(signal('refCard', 2.2, 0.62, {
    rd: [[0, 1.36], [0.3, 1.45], [0.62, -1.38], [1.75, -1.38], [2.2, 1.36]],
    rfw: [[0, 0.06], [0.3, -0.45], [0.62, 0.22], [1.75, 0.22], [2.2, 0.06]],
    re: [[0, 0.26], [0.3, 0.9], [0.62, 0.06], [1.75, 0.06], [2.2, 0.26]],
    rtw: [[0, -0.3], [0.62, 0], [1.75, 0], [2.2, -0.3]],
    sp: [[0, 0.03], [0.3, 0.08], [0.62, -0.06], [1.75, -0.06], [2.2, 0.03]],
    np: [[0, 0], [0.62, -0.05], [1.75, -0.05], [2.2, 0]],
  }));
  // Arm (or flag) straight up: an indirect free kick, an offside.
  out.push(signal('refArmUp', 2.0, 0.4, {
    rd: [[0, 1.36], [0.4, -1.4], [1.6, -1.4], [2.0, 1.36]],
    rfw: [[0, 0.06], [0.4, 0.2], [1.6, 0.2], [2.0, 0.06]],
    re: [[0, 0.26], [0.4, 0.05], [1.6, 0.05], [2.0, 0.26]],
    rtw: [[0, -0.3], [0.4, 0], [1.6, 0], [2.0, -0.3]],
  }));
  // Arm (or flag) straight out to the side: which way a throw-in goes.
  out.push(signal('refArmOut', 1.7, 0.38, {
    rd: [[0, 1.36], [0.38, 0.12], [1.35, 0.12], [1.7, 1.36]],
    rfw: [[0, 0.06], [0.38, 0.12], [1.35, 0.12], [1.7, 0.06]],
    re: [[0, 0.26], [0.38, 0.04], [1.35, 0.04], [1.7, 0.26]],
    rtw: [[0, -0.3], [0.38, 0], [1.35, 0], [1.7, -0.3]],
    sr: [[0, 0], [0.38, 0.05], [1.35, 0.05], [1.7, 0]],
  }));
  return out;
}

// ---------- Celebrations (loops) ----------

function celebrations(): Clip[] {
  const out: Clip[] = [];
  out.push(bake('cel_cheer', 0.9, true, (t) => {
    const u = (TAU * t) / 0.9;
    return {
      hy: 0.22 * Math.abs(Math.sin(u)),
      lk: 0.25 + 0.3 * Math.abs(Math.cos(u)), rk: 0.25 + 0.3 * Math.abs(Math.cos(u)),
      lf: 0.12, rf: 0.12,
      ld: -1.15 + 0.2 * Math.sin(u), rd: -1.15 - 0.2 * Math.sin(u),
      lfw: 0.25, rfw: 0.25,
      le: 0.6 + 0.6 * Math.max(0, Math.sin(u)), re: 0.6 + 0.6 * Math.max(0, -Math.sin(u)),
      sp: -0.08, np: -0.25,
    };
  }));
  out.push(bake('cel_plane', 2.85, true, (t) => {
    const u = (TAU * t) / 2.85;
    return { hr: 0.36 * Math.sin(u), sr: 0.1 * Math.sin(u), sp: 0.22, np: -0.25, ld: 0.05, rd: 0.05, lfw: -0.1, rfw: -0.1, le: 0.05, re: 0.05, lk: 0.2, rk: 0.2, lf: 0.1, rf: 0.1 };
  }));
  out.push(bake('cel_slide', 1.6, true, (t) => {
    const u = (TAU * t) / 1.6;
    return {
      ground: false, flat: false,
      hy: -0.56, hp: -0.1,
      lf: 0.05, rf: 0.05, lk: 1.55, rk: 1.55, lan: 0.6, ran: 0.6, la: 0.08, ra: 0.08,
      sp: -0.42 + 0.03 * Math.sin(u), np: -0.35,
      ld: -0.85 + 0.08 * Math.sin(u), rd: -0.85 + 0.08 * Math.sin(u), lfw: 0.15, rfw: 0.15, le: 0.25, re: 0.25,
    };
  }));
  out.push(bake('cel_spin', 1.3, true, (t) => {
    const u = t / 1.3;
    const hop = Math.sin(Math.min(1, u / 0.7) * Math.PI);
    return { hyaw: u < 0.7 ? smooth(u / 0.7) * TAU : 0, hy: hop * 0.55, ld: 0.3 - hop * 0.9, rd: 0.3 - hop * 0.9, le: 0.2, re: 0.2, lk: 0.2 + hop * 0.5, rk: 0.2 + hop * 0.5, lf: hop * 0.3, rf: hop * 0.3 };
  }));
  out.push(bake('cel_flip', 1.8, true, (t) => {
    const u = t / 1.8;
    const air = Math.min(1, Math.max(0, (u - 0.1) / 0.5));
    const tuck = Math.sin(air * Math.PI);
    const crouch = u < 0.1 ? Math.sin((u / 0.1) * Math.PI) : u > 0.6 && u < 0.75 ? Math.sin(((u - 0.6) / 0.15) * Math.PI) : 0;
    return {
      hp: -smooth(air) * TAU, hy: tuck * 1.05,
      lf: 1.3 * tuck + 0.4 * crouch, rf: 1.3 * tuck + 0.4 * crouch, lk: 1.9 * tuck + 0.8 * crouch + 0.1, rk: 1.9 * tuck + 0.8 * crouch + 0.1,
      ld: 1.3 - 2.6 * Math.max(tuck, u > 0.6 ? 1 - Math.min(1, (u - 0.6) / 0.3) : 0), rd: 1.3 - 2.6 * Math.max(tuck, u > 0.6 ? 1 - Math.min(1, (u - 0.6) / 0.3) : 0),
      lfw: tuck * 0.3, rfw: tuck * 0.3, le: 0.2, re: 0.2, np: -0.2 * tuck,
    };
  }));
  return out;
}

/** Every hand-made clip, by name. Left-side variants are mirrored here. */
export function placeholderClips(): Map<string, Clip> {
  const m = new Map<string, Clip>();
  const add = (c: Clip) => m.set(c.name, c);
  add(idle('idle', false));
  add(idle('keeperIdle', true));
  add(gait('walk', { cycle: 1.1, hip: 0.36, knee: 0.95, load: 0.12, duty: 0.6, lean: 0.03, arm: 0.32, elbow: 0.3, flight: 0, yaw: 0.06, push: 0.6, down: 1.34 }));
  add(gait('jog', { cycle: 0.74, hip: 0.5, knee: 1.45, load: 0.28, duty: 0.4, lean: 0.1, arm: 0.55, elbow: 1.25, flight: 0.035, yaw: 0.08, push: 0.8, down: 1.28 }));
  add(gait('run', { cycle: 0.66, hip: 0.66, knee: 1.8, load: 0.32, duty: 0.36, lean: 0.17, arm: 0.8, elbow: 1.4, flight: 0.06, yaw: 0.1, push: 1, down: 1.22 }));
  add(gait('sprint', { cycle: 0.6, hip: 0.8, knee: 2.1, load: 0.32, duty: 0.32, lean: 0.25, arm: 1.05, elbow: 1.55, flight: 0.08, yaw: 0.1, push: 1.1, down: 1.18 }));
  add(gait('walkBack', { cycle: 1.0, hip: 0.3, knee: 0.8, load: 0.15, duty: 0.6, lean: 0.06, arm: 0.2, elbow: 0.5, flight: 0, yaw: 0.04, push: 0.4, down: 1.25, back: true }));
  add(gait('runBack', { cycle: 0.62, hip: 0.4, knee: 1.1, load: 0.3, duty: 0.42, lean: 0.12, arm: 0.35, elbow: 1.1, flight: 0.025, yaw: 0.05, push: 0.5, down: 1.2, back: true }));
  const sl = strafe('strafeLeft');
  add(sl);
  add(mirrorClip(sl, 'strafeRight'));
  for (const c of [...actions(), ...officials(), ...celebrations()]) add(c);
  return m;
}
