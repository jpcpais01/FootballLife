import type { Position } from '../attributes.ts';
import type { MatchEvent, PlayerLine } from './types.ts';

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

/** Match rating (3–10) from a player's line, role and the score. */
export function rateLine(l: PlayerLine, role: Position, scored: number, conceded: number): number {
  let r = 6.0;
  r += l.goals * 0.95 + l.assists * 0.55 + Math.min(0.6, l.keyPasses * 0.1);
  r += l.onTarget * 0.05 + Math.min(0.7, l.tackles * 0.05 + l.interceptions * 0.035);
  r += l.passes ? ((l.passesDone / l.passes) - 0.8) * 1.5 : 0;
  r -= l.yellow * 0.3 + l.red * 1.4;
  if (role === 'GK') {
    r += l.saves * 0.28 - conceded * 0.35;
    if (conceded === 0) r += 0.6;
  }
  if (role === 'CB' || role === 'FB') r += conceded === 0 ? 0.4 : -conceded * 0.12;
  r += clamp(scored - conceded, -3, 3) * 0.12;
  return Math.round(clamp(r, 3, 10) * 10) / 10;
}

/**
 * Rebuilds one player's line from the events up to index `upTo` and rates it,
 * so the match screen can show a live rating as the game unfolds.
 */
export function liveRating(events: MatchEvent[], upTo: number, idx: number, role: Position): number {
  const side = idx < 11 ? 0 : 1;
  const { line, score } = lineFromEvents(events, upTo, idx);
  return rateLine(line, role, score[side], score[1 - side]);
}

/** One player's stat line (unrated) from the events up to index `upTo`, plus the score then. */
export function lineFromEvents(events: MatchEvent[], upTo: number, idx: number): { line: PlayerLine; score: [number, number] } {
  const l: PlayerLine = { idx, goals: 0, assists: 0, shots: 0, onTarget: 0, passes: 0, passesDone: 0, keyPasses: 0, tackles: 0, interceptions: 0, saves: 0, yellow: 0, red: 0, rating: 6 };
  const score: [number, number] = [0, 0];
  let lastPass: { from: number; t: number } | null = null;
  for (let i = 0; i <= upTo && i < events.length; i++) {
    const e = events[i];
    const next = events[i + 1];
    if (e.k === 'pass') {
      const done = !e.o?.endsWith('-out') && next?.k !== 'offside';
      if (e.p === idx) {
        l.passes++;
        if (done) l.passesDone++;
      }
      lastPass = done && e.p !== undefined ? { from: e.p, t: e.t } : null;
    } else if (e.k === 'cross') {
      const done = e.o === 'won' || (e.o === 'cleared' && e.q !== undefined);
      if (e.p === idx) {
        l.passes++;
        if (done) l.passesDone++;
      }
      lastPass = e.o === 'won' && e.p !== undefined ? { from: e.p, t: e.t } : null;
    } else if (e.k === 'intercept') {
      if (e.q === idx) l.passes++;
      if (e.p === idx) l.interceptions++;
      lastPass = null;
    } else if (e.k === 'tackle') {
      if (e.p === idx) l.tackles++;
      lastPass = null;
    } else if (e.k === 'card' && e.p === idx) {
      if (e.o === 'yellow' || e.o === 'second') l.yellow++;
      if (e.o === 'red' || e.o === 'second') l.red++;
    } else if (e.k === 'shot') {
      const lp = lastPass;
      const assist = lp && (lp.from < 11) === (e.s === 0) && e.t - lp.t < 15 ? lp.from : -1;
      if (e.p === idx) {
        l.shots++;
        if (e.o === 'goal' || e.o === 'saved' || e.o === 'parried') l.onTarget++;
      }
      if (assist === idx) l.keyPasses++;
      if ((e.o === 'saved' || e.o === 'parried') && e.q === idx) l.saves++;
    } else if (e.k === 'goal') {
      score[e.s]++;
      if (e.p === idx) l.goals++;
      if (e.q === idx) l.assists++;
      lastPass = null;
    } else if (e.k === 'kickoff' || e.k === 'goalkick' || e.k === 'throwin' || e.k === 'corner' || e.k === 'freekick' || e.k === 'clear') {
      lastPass = null;
    }
  }
  return { line: l, score };
}
