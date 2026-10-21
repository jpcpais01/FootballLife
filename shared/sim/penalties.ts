// Penalty shootout for cup ties that end level. Deterministic from the seed.
import { Rng } from '../rng.ts';
import type { SimTeam } from './types.ts';

export interface Shootout {
  score: [number, number];
  /** Kicks in order: side, taker index (0–10) and whether it went in. */
  kicks: { s: 0 | 1; p: number; in: boolean }[];
}

export function shootout(home: SimTeam, away: SimTeam, seed: number): Shootout {
  const rng = new Rng((seed ^ 0x5eed) >>> 0);
  const teams = [home, away];
  // Best finishers shoot first; the keeper is index 0.
  const order = teams.map((t) =>
    t.players
      .map((p, i) => ({ i, v: p.attrs.finishing * 0.6 + p.attrs.decisions * 0.4 }))
      .filter((x) => x.i !== 0)
      .sort((a, b) => b.v - a.v)
      .map((x) => x.i)
      .concat(0),
  );
  const keeper = teams.map((t) => t.players[0].attrs);
  const score: [number, number] = [0, 0];
  const kicks: Shootout['kicks'] = [];
  const kick = (s: 0 | 1, n: number) => {
    const p = teams[s].players[order[s][n % order[s].length]];
    const gk = keeper[1 - s];
    const skill = p.attrs.finishing * 0.55 + p.attrs.decisions * 0.25 + p.attrs.shooting * 0.2;
    const save = gk.reflexes * 0.5 + gk.oneOnOne * 0.3 + gk.gkPositioning * 0.2;
    const prob = Math.max(0.5, Math.min(0.92, 0.76 + (skill - save) * 0.006));
    const scored = rng.chance(prob);
    if (scored) score[s]++;
    kicks.push({ s, p: order[s][n % order[s].length], in: scored });
  };
  for (let n = 0; n < 5; n++) {
    for (const s of [0, 1] as const) {
      kick(s, n);
      // Stop early once one side cannot catch up.
      const left = [4 - n, s === 0 ? 5 - n : 4 - n];
      if (score[0] + left[0] < score[1] || score[1] + left[1] < score[0]) return { score, kicks };
    }
  }
  for (let n = 5; score[0] === score[1] && n < 40; n++) {
    kick(0, n);
    kick(1, n);
  }
  if (score[0] === score[1]) score[rng.chance(0.5) ? 0 : 1]++;
  return { score, kicks };
}
