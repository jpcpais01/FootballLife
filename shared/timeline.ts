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

const SLOW_RATE = 1.7; // game seconds per real second inside highlights
const MIN_FAST = 6;
const MAX_FAST = 70;

function isHighlight(e: MatchEvent): [number, number] | null {
  if (e.k === 'goal') return [e.t - 16, e.t + 9];
  if (e.k === 'penalty') return [e.t - 6, e.t + 14];
  if (e.k === 'shot') return [e.t - 12, e.t + 3];
  if (e.k === 'card' && e.o !== 'yellow') return [e.t - 6, e.t + 4];
  if (e.k === 'freekick' && e.o === 'direct') return [e.t - 3, e.t + 4];
  if (e.k === 'corner') return [e.t - 2, e.t + 6];
  if (e.k === 'kickoff') return [e.t - 1, e.t + 6];
  return null;
}

export function buildTimeline(events: MatchEvent[], halftimeAt: number, duration: number): Segment[] {
  // 1. Highlight windows, merged.
  const wins: [number, number][] = [];
  for (const e of events) {
    const w = isHighlight(e);
    if (!w) continue;
    let [a, b] = w;
    // Never let a window straddle the half-time break.
    if (a < halftimeAt && b > halftimeAt) {
      if (e.t <= halftimeAt) b = halftimeAt;
      else a = halftimeAt;
    }
    a = Math.max(0, a);
    b = Math.min(duration, b);
    if (b <= a) continue;
    const last = wins[wins.length - 1];
    if (last && a <= last[1] + 2) last[1] = Math.max(last[1], b);
    else wins.push([a, b]);
  }
  const slow = wins.reduce((s, [a, b]) => s + (b - a), 0);
  const fast = Math.max(1, duration - slow);
  const budget = duration / LIVE_RATE;
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
