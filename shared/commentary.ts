import type { MatchEvent } from './sim/types.ts';

export interface CommentaryTeam {
  short: string;
  name: string;
  players: { name: string; number: number }[];
}

export interface CommentaryLine {
  text: string;
  /** Event glyph name, drawn by the client's evIcon(). */
  icon: string;
  big: boolean;
  kind: string;
}

const pick = <T>(arr: T[], seed: number) => arr[Math.abs(seed) % arr.length];

/**
 * Turns a match event into a commentary line, or null for routine moments.
 * Wording is varied deterministically by event index so every viewer reads
 * the same commentary.
 */
export function commentary(ev: MatchEvent, i: number, teams: [CommentaryTeam, CommentaryTeam], halftimeAt = -1): CommentaryLine | null {
  const name = (idx?: number) => {
    if (idx === undefined) return 'someone';
    const t = teams[idx < 11 ? 0 : 1];
    const p = t.players[idx % 11];
    return p ? surname(p.name) : 'someone';
  };
  const team = teams[ev.s];
  const other = teams[1 - ev.s];
  const P = name(ev.p);
  const Q = name(ev.q);
  switch (ev.k) {
    case 'kickoff':
      if (ev.t === 0) return { text: `We're under way! ${team.name} get us started.`, icon: 'kickoff', big: true, kind: 'kickoff' };
      if (ev.t === halftimeAt + 1) return { text: `The second half is under way.`, icon: 'kickoff', big: true, kind: 'kickoff' };
      return null;
    case 'halftime':
      return { text: 'The referee blows for half-time.', icon: 'halftime', big: true, kind: 'halftime' };
    case 'fulltime':
      return { text: `Full-time! It finishes ${ev.sc?.[0]}–${ev.sc?.[1]}.`, icon: 'fulltime', big: true, kind: 'fulltime' };
    case 'goal': {
      const how = ev.o === 'header' ? 'heads it in' : ev.o === 'penalty' ? 'sends the keeper the wrong way from the spot' : ev.o === 'freekick' ? 'curls the free kick into the top corner' : ev.o === 'long' ? 'unleashes a thunderbolt from distance' : 'finishes coolly';
      const assist = ev.q !== undefined ? ` ${pick(['Lovely ball from', 'Assisted by', 'Created by'], i)} ${Q}.` : '';
      return { text: `GOAL! ${P} ${how} for ${team.short}! ${ev.sc?.[0]}–${ev.sc?.[1]}.${assist}`, icon: 'goal', big: true, kind: 'goal' };
    }
    case 'shot':
      if (ev.o === 'goal') return null;
      if (ev.o === 'saved') return { text: pick([`${P} tests the keeper — ${Q} holds on.`, `Good save by ${Q} from ${P}'s effort.`, `${P} forces ${Q} into a save.`], i), icon: 'save', big: false, kind: 'save' };
      if (ev.o === 'parried') return { text: pick([`${Q} parries ${P}'s strike behind for a corner!`, `What a stop from ${Q}! ${P} thought that was in.`], i), icon: 'save', big: true, kind: 'save' };
      if (ev.o === 'post') return { text: `${P} hits the woodwork! So close for ${team.short}.`, icon: 'post', big: true, kind: 'post' };
      if (ev.o === 'blocked') return { text: pick([`${P}'s shot is blocked.`, `Brave block from ${Q} to deny ${P}.`], i), icon: 'block', big: false, kind: 'block' };
      return { text: pick([`${P} shoots wide.`, `${P} fires over the bar.`, `${P} drags the effort wide of the post.`], i), icon: 'miss', big: false, kind: 'miss' };
    case 'penalty':
      return { text: `PENALTY to ${team.short}! ${P} steps up...`, icon: 'penalty', big: true, kind: 'penalty' };
    case 'card':
      if (ev.o === 'yellow') return { text: `Yellow card for ${P} (${team.short}).`, icon: 'yellow', big: false, kind: 'card' };
      if (ev.o === 'second') return { text: `Second yellow! ${P} is sent off — ${team.short} down to ten.`, icon: 'red', big: true, kind: 'red' };
      return { text: `Straight red for ${P}! ${team.short} are down a man.`, icon: 'red', big: true, kind: 'red' };
    case 'foul':
      if (i % 3 !== 0) return null;
      return { text: pick([`Foul by ${P} on ${Q}.`, `${P} brings down ${Q}.`, `Free kick to ${other.short} — ${P} was late.`], i), icon: 'foul', big: false, kind: 'foul' };
    case 'corner':
      return { text: `Corner to ${team.short}. ${P} to take.`, icon: 'corner', big: false, kind: 'corner' };
    case 'offside':
      return { text: `${P} is flagged offside.`, icon: 'offside', big: false, kind: 'offside' };
    case 'freekick':
      if (ev.o === 'direct') return { text: `Free kick in shooting range. ${P} stands over it...`, icon: 'freekick', big: false, kind: 'freekick' };
      return null;
    case 'pass':
      if (ev.hl && ev.o === 'through') return { text: pick([`Superb through ball from ${P} — ${Q} is in!`, `${P} splits the defence for ${Q}!`], i), icon: 'through', big: false, kind: 'chance' };
      return null;
    case 'dribble':
      if (ev.hl) return { text: pick([`${P} skips past ${Q} and drives into the box!`, `Lovely feet from ${P} to beat ${Q}.`], i), icon: 'dribble', big: false, kind: 'chance' };
      return null;
    case 'cross':
      if (ev.o === 'won') return { text: `${P} whips it in — ${Q} rises to meet it!`, icon: 'cross', big: false, kind: 'chance' };
      return null;
    default:
      return null;
  }
}

function surname(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : full;
}
