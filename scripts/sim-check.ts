// Logic check for the match engine: determinism and statistical sanity.
// Run with `npm test`.
import { generateAttributes, type Position } from '../shared/attributes.ts';
import { DEFAULT_TACTICS, getFormation, type Tactics } from '../shared/formations.ts';
import { simulateMatch } from '../shared/sim/engine.ts';
import type { SimTeam } from '../shared/sim/types.ts';
import { shootout } from '../shared/sim/penalties.ts';

function team(name: string, level: number, formation = '4-3-3', tactics: Tactics = DEFAULT_TACTICS): SimTeam {
  const f = getFormation(formation);
  return {
    clubId: name,
    name,
    short: name.slice(0, 3).toUpperCase(),
    colors: { primary: '#fff', secondary: '#000' },
    formation,
    tactics,
    players: f.slots.map((s, i) => ({
      id: `${name}-${i}`,
      name: `${name} ${i}`,
      number: i + 1,
      natural: s.role as Position,
      slotId: s.id,
      role: s.role,
      attrs: generateAttributes(s.role, level, `${name}-${i}`),
      bot: true,
    })),
  };
}

function series(a: SimTeam, b: SimTeam, n: number, seed0 = 1) {
  let w = 0, d = 0, l = 0, goals = 0, shots = 0, fouls = 0, yellows = 0, reds = 0, poss = 0, passAcc = 0, events = 0, xg = 0;
  for (let i = 0; i < n; i++) {
    const r = simulateMatch(a, b, seed0 + i);
    const [h, aw] = r.score;
    if (h > aw) w++; else if (h === aw) d++; else l++;
    goals += h + aw;
    shots += r.stats[0].shots + r.stats[1].shots;
    xg += r.stats[0].xg + r.stats[1].xg;
    fouls += r.stats[0].fouls + r.stats[1].fouls;
    yellows += r.stats[0].yellow + r.stats[1].yellow;
    reds += r.stats[0].red + r.stats[1].red;
    poss += r.stats[0].possession;
    passAcc += (r.stats[0].passesDone + r.stats[1].passesDone) / Math.max(1, r.stats[0].passes + r.stats[1].passes);
    events += r.events.length;
  }
  const f = (x: number) => (x / n).toFixed(2);
  return { W: w, D: d, L: l, goals: f(goals), shots: f(shots), xg: f(xg), fouls: f(fouls), yellows: f(yellows), reds: f(reds), homePoss: f(poss), passAcc: f(passAcc), events: f(events) };
}

let failed = false;
function check(name: string, ok: boolean, info?: unknown) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`, info ?? '');
  if (!ok) failed = true;
}

// Determinism.
const A = team('Alpha', 50);
const B = team('Bravo', 50);
const r1 = simulateMatch(A, B, 42);
const r2 = simulateMatch(A, B, 42);
check('same seed → identical match', JSON.stringify(r1) === JSON.stringify(r2));
check('different seed → different match', JSON.stringify(r1) !== JSON.stringify(simulateMatch(A, B, 43)));

const N = 400;
const even = series(A, B, N);
console.log('even 50 v 50', even);
check('goals per match in a realistic band', +even.goals > 1.8 && +even.goals < 3.6, even.goals);
check('shots per match in a realistic band', +even.shots > 16 && +even.shots < 34, even.shots);
check('home edge is small', even.W > even.L && even.W / N < 0.55, `${even.W}/${even.D}/${even.L}`);

const strong = series(team('Strong', 62), team('Weak', 48), N);
console.log('62 v 48', strong);
check('stronger team wins clearly more', strong.W / N > 0.6, strong.W);
check('upsets still happen', strong.L > 0, strong.L);

const slight = series(team('Slight', 53), team('Base', 50), N);
console.log('53 v 50', slight);
check('small edge = modest advantage', slight.W > slight.L && slight.W / N < 0.65);

// Tactics matter: attacking + direct vs. a defensive side.
const att = series(team('Att', 50, '4-3-3', { mentality: 'attacking', tempo: 'direct', pressing: 'high', width: 'wide' }), team('Def', 50, '5-3-2', { mentality: 'defensive', tempo: 'patient', pressing: 'low', width: 'narrow' }), N);
console.log('attacking v defensive', att);
check('tactics change the game', att.goals !== even.goals);

// Penalty shootouts always produce a winner and stop once it is decided.
const so = Array.from({ length: 400 }, (_, i) => shootout(team('P1', 50, '4-3-3'), team('P2', 50, '4-3-3'), i + 1));
check('shootouts always have a winner', so.every((x) => x.score[0] !== x.score[1]));
const valid = so.every((x) => {
  const counts = [0, 0];
  const goals = [0, 0];
  for (const k of x.kicks) {
    counts[k.s]++;
    if (k.in) goals[k.s]++;
  }
  // Either both sides took the same number of kicks, or home took one more inside the first five.
  return goals[0] === x.score[0] && goals[1] === x.score[1] && (counts[0] === counts[1] || (counts[0] === counts[1] + 1 && counts[0] <= 5));
});
check('shootout kicks add up and stop when decided', valid);
const rate = so.reduce((s2, x) => s2 + x.kicks.filter((k) => k.in).length, 0) / so.reduce((s2, x) => s2 + x.kicks.length, 0);
check('penalty conversion is realistic', rate > 0.65 && rate < 0.88, rate.toFixed(2));

process.exit(failed ? 1 : 0);
