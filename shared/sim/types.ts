import type { Attributes, Position } from '../attributes.ts';
import type { Tactics } from '../formations.ts';
import type { Segment } from '../timeline.ts';
import type { TrackWindow } from './tracks.ts';

export interface SimPlayer {
  id: string;
  name: string;
  number: number;
  natural: Position;
  slotId: string;
  role: Position;
  attrs: Attributes;
  bot: boolean;
  /** Small temporary match-day modifiers can be layered here later (consumables). */
}

export interface SimTeam {
  clubId: string;
  name: string;
  short: string;
  colors: { primary: string; secondary: string };
  formation: string;
  tactics: Tactics;
  /** Exactly 11 starters, slot order of the formation. */
  players: SimPlayer[];
}

export type EventKind =
  | 'kickoff'
  | 'pass'
  | 'cross'
  | 'carry'
  | 'dribble'
  | 'tackle'
  | 'intercept'
  | 'clear'
  | 'shot'
  | 'goal'
  | 'foul'
  | 'card'
  | 'freekick'
  | 'penalty'
  | 'corner'
  | 'goalkick'
  | 'throwin'
  | 'offside'
  | 'chance'
  | 'halftime'
  | 'fulltime';

/**
 * One keyframe of the match. Ball position (x, y) is in absolute pitch
 * metres after the event: x in [-52.5, 52.5], y in [-34, 34].
 * Players are referenced by index: 0–10 home, 11–21 away.
 */
export interface MatchEvent {
  t: number; // game clock, seconds (0..5400+)
  k: EventKind;
  s: 0 | 1; // side acting (0 home, 1 away)
  p?: number; // main player
  q?: number; // second player (receiver, victim, keeper, assister)
  x: number;
  y: number;
  z?: number; // arc apex height for lofted balls
  o?: string; // outcome / detail
  sc?: [number, number]; // score after goal
  xg?: number;
  hl?: 1; // highlight (dangerous moment)
}

export interface TeamStats {
  goals: number;
  shots: number;
  onTarget: number;
  xg: number;
  passes: number;
  passesDone: number;
  possession: number; // percent
  fouls: number;
  yellow: number;
  red: number;
  corners: number;
  tackles: number;
  saves: number;
  offsides: number;
}

export interface PlayerLine {
  idx: number;
  goals: number;
  assists: number;
  shots: number;
  onTarget: number;
  passes: number;
  passesDone: number;
  keyPasses: number;
  tackles: number;
  interceptions: number;
  saves: number;
  yellow: number;
  red: number;
  rating: number;
}

export interface MatchResult {
  version: number;
  seed: number;
  score: [number, number];
  events: MatchEvent[];
  stats: [TeamStats, TeamStats];
  players: PlayerLine[];
  /** Index of player of the match. */
  motm: number;
  duration: number; // final game clock in seconds
  halftimeAt: number;
  /** Broadcast timeline: game clock ↔ real seconds after kickoff. */
  timeline: Segment[];
  /** Penalty shootout after a drawn cup tie. */
  /** Recorded motion for the stretches shown at true speed (engine v3+). */
  tracks?: TrackWindow[];
  pens?: { score: [number, number]; kicks: { s: 0 | 1; p: number; in: boolean }[] };
}
