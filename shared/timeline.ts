import { HALFTIME_BREAK, LIVE_RATE } from './config.ts';
import type { MatchEvent } from './sim/types.ts';

/**
 * The broadcast timeline maps the match clock to real seconds after kickoff.
 * Build-up play is fast-forwarded and dangerous moments run close to real
 * speed, so a live match stays watchable while lasting about 90 / LIVE_RATE
 * minutes. Server and clients derive it from the same events, so everyone
 * sees the same moment at the same time.
 *
 * Segments are [gameStart, gameEnd, realStart, realEnd].
 */
export type Segment = [number, number, number, number];

const SLOW_RATE = 1; // highlights play at true speed
const MIN_FAST = 6;
const MAX_FAST = 70;
/** Share of the broadcast that highlights may fill; the rest fast-forwards. */
const SLOW_SHARE = 0.6;

const PLAY = new Set(['pass', 'cross', 'carry', 'dribble', 'tackle', 'intercept', 'clear', 'shot', 'foul', 'offside']);

/** A highlight window around an event, and how much it matters. */
function isHighlight(e: MatchEvent): [number, number, number] | null {
  if (e.k === 'goal') return [e.t - 10, e.t + 8, 10];
  if (e.k === 'penalty') return [e.t - 10, e.t + 14, 8];
  if (e.k === 'shot') return [e.t - 10, e.t + 3, 3 + (e.xg ?? 0) * 10];
  if (e.k === 'card' && e.o !== 'yellow') return [e.t - 10, e.t + 4, 6];
  if (e.k === 'freekick' && e.o === 'direct') return [e.t - 6, e.t + 4, 2];
  if (e.k === 'corner') return [e.t - 6, e.t + 6, 1];
  if (e.k === 'kickoff') return [e.t - 1, e.t + 6, e.t < 10 ? 5 : 0.5];
  return null;
}

export function buildTimeline(events: MatchEvent[], halftimeAt: number, duration: number): Segment[] {
  const budget = duration / LIVE_RATE;
  // 1. Highlight windows, most important first, until the slow-motion budget is spent.
  const cands: [number, number, number][] = [];
  // The last touch or foul before each event: what put the ball out or stopped play.
  let cause = -Infinity;
  for (const e of events) {
    const w = isHighlight(e);
    if (PLAY.has(e.k)) cause = e.t;
    if (!w) continue;
    let [a, b] = w;
    // A set piece is taken a while after the ball went out or the foul: show what led to it too.
    if ((e.k === 'corner' || e.k === 'freekick' || e.k === 'penalty') && e.t - cause < 20) a = Math.min(a, cause - 4);
    // Never let a window straddle the half-time break.
    if (a < halftimeAt && b > halftimeAt) {
      if (e.t <= halftimeAt) b = halftimeAt;
      else a = halftimeAt;
    }
    // The second half starts with everyone on their spots a second after the break.
    if (e.t > halftimeAt) a = Math.max(a, halftimeAt + 1);
    a = Math.max(0, a);
    b = Math.min(duration, b);
    if (b > a) cands.push([a, b, w[2]]);
  }
  cands.sort((x, y) => y[2] - x[2] || x[0] - y[0]);
  const chosen: [number, number][] = [];
  let used = 0;
  const cover = (a: number, b: number) => {
    // Extra slow time this window adds on top of the ones already chosen.
    let extra = b - a;
    for (const [c, d] of chosen) extra -= Math.max(0, Math.min(b, d) - Math.max(a, c));
    return Math.max(0, extra);
  };
  for (const [a, b] of cands) {
    const add = cover(a, b);
    if (used + add > budget * SLOW_SHARE) continue;
    chosen.push([a, b]);
    used += add;
  }
  chosen.sort((x, y) => x[0] - y[0]);
  const wins: [number, number][] = [];
  for (const [a, b] of chosen) {
    const last = wins[wins.length - 1];
    if (last && a <= last[1] + 2 && !(last[1] <= halftimeAt && a >= halftimeAt)) last[1] = Math.max(last[1], b);
    else wins.push([a, b]);
  }
  const slow = wins.reduce((s, [a, b]) => s + (b - a), 0);
  const fast = Math.max(1, duration - slow);
  const fastReal = Math.max(budget - slow / SLOW_RATE, fast / MAX_FAST);
  const fastRate = Math.min(MAX_FAST, Math.max(MIN_FAST, fast / fastReal));

  // 2. Walk the clock, emitting segments.
  const segs: Segment[] = [];
  let g = 0;
  let r = 0;
  const push = (to: number, rate: number) => {
    if (to <= g) return;
    // Split at half-time to insert the break.
    if (g < halftimeAt && to > halftimeAt) {
      push(halftimeAt, rate);
      push(to, rate);
      return;
    }
    const dr = (to - g) / rate;
    segs.push([g, to, r, r + dr]);
    r += dr;
    g = to;
    if (g === halftimeAt) {
      segs.push([g, g, r, r + HALFTIME_BREAK]);
      r += HALFTIME_BREAK;
    }
  };
  for (const [a, b] of wins) {
    push(a, fastRate);
    push(b, SLOW_RATE);
  }
  push(duration, fastRate);
  return segs;
}

/** Real seconds after kickoff at which game clock `t` is shown. */
export function realAt(t: number, segs: Segment[]): number {
  for (const [g0, g1, r0, r1] of segs) {
    if (g1 === g0) continue; // half-time break
    if (t <= g1) return r0 + ((Math.max(t, g0) - g0) / (g1 - g0)) * (r1 - r0);
  }
  const last = segs[segs.length - 1];
  return last ? last[3] : 0;
}

/** Game clock shown `real` seconds after kickoff. */
export function clockAt(real: number, segs: Segment[]): number {
  for (const [g0, g1, r0, r1] of segs) {
    if (real <= r1) {
      if (r1 === r0) return g0;
      return g0 + ((Math.max(real, r0) - r0) / (r1 - r0)) * (g1 - g0);
    }
  }
  const last = segs[segs.length - 1];
  return last ? last[1] : 0;
}

/** Playback rate (game s per real s) at clock t — used for fast-forward cues. */
export function rateAt(t: number, segs: Segment[]): number {
  for (const [g0, g1, r0, r1] of segs) if (t >= g0 && t < g1) return (g1 - g0) / Math.max(1e-6, r1 - r0);
  return 1;
}

export function totalReal(segs: Segment[]): number {
  return segs.length ? segs[segs.length - 1][3] : 0;
}
