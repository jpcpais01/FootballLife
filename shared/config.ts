// Game-wide tunables. Kept in one place so balancing doesn't touch logic.

/** Real seconds per game second while a match is live (10 → a 90' match lasts ~9 real minutes). */
export const LIVE_RATE = 10;
/** Real seconds of half-time break during a live match. */
export const HALFTIME_BREAK = 60;
/** League kickoff hours, in UTC: one morning and one evening round each day. */
export const KICKOFF_HOURS_UTC = [10, 19];
/** Clubs per league season (bots fill empty places). */
export const LEAGUE_SIZE = 10;
/** Squad size: 11 starters plus this many substitutes. */
export const DEFAULT_BENCH = 7;
/** Points for win/draw/loss. */
export const POINTS = { win: 3, draw: 1, loss: 0 };
/** Hours between training sessions. */
export const TRAINING_COOLDOWN_H = 4;
/** Minimum minutes between friendlies started by the same club. */
export const FRIENDLY_COOLDOWN_MIN = 20;
/** Coins earned by a human player per official match. */
export const MATCH_COINS = { win: 60, draw: 30, loss: 15, goal: 10, assist: 6 };

export const HALF_SECONDS = 2700;

/** Broadcast-style minute label, e.g. 45+2', 67', 90+3'. */
export function minuteLabel(t: number, halftimeAt: number): string {
  if (t <= halftimeAt) {
    if (t < HALF_SECONDS) return `${Math.floor(t / 60) + 1}'`;
    return `45+${Math.floor((t - HALF_SECONDS) / 60) + 1}'`;
  }
  const s = t - halftimeAt; // seconds into the second half
  if (s < HALF_SECONDS) return `${46 + Math.floor(s / 60)}'`;
  return `90+${Math.floor((s - HALF_SECONDS) / 60) + 1}'`;
}
