// "You" on the league page: your season told as a story. Form, the club's
// race, where you stand for each award, the next milestones and every game.
import { badge } from '../components.ts';
import { html, type Raw } from '../dom.ts';
import { trophyArt } from '../gearArt.ts';
import { icon } from '../icons.ts';
import { kickoffLabel } from '../ui.ts';

interface Game {
  matchId: string; kind: string; at: string; round: number | null; cup?: string;
  opp: { id: string; name: string; short: string; colors: { primary: string; secondary: string }; badge: any };
  home: boolean; score: [number, number] | null; pens: [number, number] | null;
  outcome: string | null; rating: number; goals: number; assists: number; shots: number; saves: number; tackles: number; cleanSheet: boolean; motm: boolean;
}
interface Race { rank: number | null; of: number; value: number | null; leader: { name: string; playerId: string; value: number } | null }
export interface SeasonMe {
  season: { id: string; number: number } | null;
  position: string;
  games: Game[];
  races: Record<string, Race>;
  minApps: number;
  club: { position: number; of: number; points: number; played: number; form: string[]; leader: number; third: number; rounds: number; path: number[]; next: any } | null;
}

const tone = (r: number) => (r >= 8 ? 'top' : r >= 7 ? 'good' : r >= 6 ? 'ok' : 'low');
const ord = (n: number) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Ratings over the season as a line, the average as a dashed rule, stars where you were player of the match. */
function formChart(games: Game[]): Raw {
  const g = games.slice(-20);
  if (g.length < 2) return html`<div class="ss-chart empty tiny muted">Your form line appears after two games.</div>`;
  const W = 320, H = 110, lo = 4.5, hi = 10;
  const x = (i: number) => 12 + (i / (g.length - 1)) * (W - 24);
  const y = (r: number) => H - 10 - ((Math.min(hi, Math.max(lo, r)) - lo) / (hi - lo)) * (H - 20);
  const pts = g.map((m, i) => `${x(i).toFixed(1)},${y(m.rating).toFixed(1)}`).join(' ');
  const avg = g.reduce((a, m) => a + m.rating, 0) / g.length;
  return html`<svg class="ss-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="Rating form">
    <defs><linearGradient id="ssg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--lime)" stop-opacity=".28"/><stop offset="1" stop-color="var(--lime)" stop-opacity="0"/></linearGradient></defs>
    <polygon points="${x(0)},${H} ${pts} ${x(g.length - 1)},${H}" fill="url(#ssg)"/>
    <line x1="0" x2="${W}" y1="${y(avg)}" y2="${y(avg)}" class="ss-avg"/>
    <polyline points="${pts}" class="ss-line"/>
    ${g.map((m, i) => html`<circle cx="${x(i)}" cy="${y(m.rating)}" r="${m.motm ? 5 : 3.2}" class="ss-dot ${m.motm ? 'motm' : tone(m.rating)}"/>`)}
  </svg>`;
}

/** The club's league place after each round, first at the top. */
function pathChart(path: number[], of: number): Raw {
  if (path.length < 2) return html``;
  const W = 220, H = 70;
  const x = (i: number) => 8 + (i / (path.length - 1)) * (W - 16);
  const y = (p: number) => 8 + ((p - 1) / Math.max(1, of - 1)) * (H - 16);
  return html`<svg class="ss-path" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-label="League position by round">
    <rect x="0" y="0" width="${W}" height="${y(3.5)}" class="ss-top3"/>
    <polyline points="${path.map((p, i) => `${x(i)},${y(p)}`).join(' ')}" class="ss-line"/>
    <circle cx="${x(path.length - 1)}" cy="${y(path[path.length - 1])}" r="4" class="ss-dot good"/>
  </svg>`;
}

const RACES: [string, string, string][] = [
  ['golden_boot', 'Golden Boot', 'goal'],
  ['playmaker', 'Playmaker', 'assist'],
  ['golden_glove', 'Golden Glove', 'clean sheet'],
  ['pots', 'Player of the Season', 'avg rating'],
];

function raceCard(kind: string, label: string, unit: string, r: Race, d: SeasonMe, leagueApps: number): Raw {
  let line: string;
  let lead = false;
  if (kind === 'pots' && leagueApps < d.minApps) line = `Play ${plural(d.minApps - leagueApps, 'more league game')} to qualify.`;
  else if (r.rank === 1) {
    lead = true;
    line = r.of > 1 ? 'You lead the race.' : 'You lead, and nobody else is on the board yet.';
  } else if (r.rank && r.leader) {
    const gap = Math.round((r.leader.value - (r.value ?? 0)) * 100) / 100;
    line = kind === 'pots' ? `${gap.toFixed(2)} behind ${r.leader.name}.` : `${plural(gap, unit)} behind ${r.leader.name}.`;
  } else line = r.leader ? `${r.leader.name} leads with ${r.leader.value}. Get on the board.` : 'Nobody is on the board yet.';
  return html`<div class="ss-race ${lead ? 'lead' : ''}">
    ${trophyArt(kind, 46)}
    <div class="grow"><div class="tiny muted">${label}</div>
      <div class="ss-rank">${r.rank ? html`<b>${ord(r.rank)}</b><span> of ${r.of}</span>` : html`<b>–</b>`}</div>
      <div class="tiny">${line}</div></div>
    <div class="ss-val num">${r.value ?? 0}</div>
  </div>`;
}

/** The next rung on each ladder, with the ones already climbed ticked. */
function milestones(d: SeasonMe): Raw {
  const g = d.games;
  const gk = d.position === 'GK';
  const count = (f: (m: Game) => number) => g.reduce((a, m) => a + f(m), 0);
  const ladders: [string, string, number, number[]][] = [
    ['Appearances', 'calendar', g.length, [5, 10, 20, 30]],
    gk ? ['Clean sheets', 'shield', count((m) => +m.cleanSheet), [1, 3, 6, 10]] : ['Goals', 'ball', count((m) => m.goals), [1, 5, 10, 20]],
    ['Assists', 'sparkle', count((m) => m.assists), [1, 3, 6, 10]],
    ['Player of the match', 'star', count((m) => +m.motm), [1, 3, 5, 8]],
    ['Games rated 8+', 'flame', count((m) => +(m.rating >= 8)), [1, 3, 6, 10]],
  ];
  return html`<div class="ss-miles">${ladders.map(([name, ic, v, steps]) => {
    const next = steps.find((s) => s > v);
    const prev = [...steps].reverse().find((s) => s <= v) ?? 0;
    const pct = next ? Math.round(((v - prev) / (next - prev)) * 100) : 100;
    return html`<div class="ss-mile ${next ? '' : 'done'}">
      <i>${icon(ic, 16)}</i>
      <div class="grow"><div class="row between"><b>${name}</b><span class="num tiny">${v}${next ? ` / ${next}` : ''}</span></div>
        <div class="goal-track"><i style="width:${pct}%"></i></div>
        <div class="ss-steps">${steps.map((s) => html`<span class="${v >= s ? 'got' : ''}">${s}</span>`)}</div></div>
    </div>`;
  })}</div>`;
}

function gameRow(m: Game): Raw {
  const res = m.outcome ?? '';
  const sc = m.score ? (m.home ? m.score : [m.score[1], m.score[0]]) : null;
  return html`<a class="ss-game" href="/match/${m.matchId}">
    <span class="ss-res ${res.toLowerCase()}">${res || '–'}</span>
    ${badge(m.opp, 22)}
    <span class="grow ellipsis"><b>${m.home ? 'vs' : '@'} ${m.opp.short}</b> <span class="tiny muted">${sc ? `${sc[0]}–${sc[1]}` : ''}${m.cup ? ` · ${m.cup}` : m.round ? ` · R${m.round}` : ''}</span></span>
    <span class="ss-ga">${m.goals ? html`<span>${icon('ball', 12)}${m.goals > 1 ? m.goals : ''}</span>` : ''}${m.assists ? html`<span class="a">A${m.assists > 1 ? m.assists : ''}</span>` : ''}${m.motm ? html`<span class="s">${icon('star', 12)}</span>` : ''}</span>
    <span class="ss-rt" data-tone="${tone(m.rating)}">${m.rating.toFixed(1)}</span>
  </a>`;
}

export function seasonView(d: SeasonMe): Raw {
  const g = d.games;
  const league = g.filter((m) => m.kind === 'league');
  const avg = g.length ? g.reduce((a, m) => a + m.rating, 0) / g.length : 0;
  const best = g.reduce<Game | null>((b, m) => (!b || m.rating > b.rating ? m : b), null);
  const c = d.club;
  const totals: [string, string | number][] = [
    ['Games', g.length], ['Goals', g.reduce((a, m) => a + m.goals, 0)],
    ['Assists', g.reduce((a, m) => a + m.assists, 0)], ['Avg rating', g.length ? avg.toFixed(2) : '–'], ['MOTM', g.filter((m) => m.motm).length],
  ];
  let race = '';
  if (c) {
    if (c.position === 1) race = 'Top of the table. Stay there.';
    else race = `${plural(c.leader - c.points, 'point')} off the top${c.position > 3 ? `, ${plural(c.third - c.points, 'point')} off the top three` : ''}`;
  }
  return html`<div class="ss fade-in">
    <div class="ss-top">
      <div class="card ss-form">
        <div class="card-head"><div><div class="eyebrow">Season ${d.season!.number}</div><div class="h2">Your form</div></div>
          ${best ? html`<a class="chip" href="/match/${best.matchId}">${icon('star', 12)} Best ${best.rating.toFixed(1)} vs ${best.opp.short}</a>` : ''}</div>
        ${formChart(g)}
        <div class="ss-totals">${totals.map(([k, v]) => html`<div><b class="num">${v}</b><span>${k}</span></div>`)}</div>
      </div>
      ${c ? html`<div class="card ss-club">
        <div class="eyebrow">League</div>
        <div class="ss-pos"><b class="num">${ord(c.position)}</b><span>of ${c.of} · ${c.points} pts</span></div>
        <div class="tiny muted">${race}</div>
        ${pathChart(c.path, c.of)}
        <div class="ss-form-row">${c.form.slice(-5).map((f) => html`<span class="ss-res ${f.toLowerCase()}">${f}</span>`)}</div>
        ${c.next ? html`<a class="ss-next" href="/match/${c.next.id}"><span class="tiny muted">Next</span><b>${c.next.home.short} v ${c.next.away.short}</b><span class="tiny">${c.next.status === 'live' ? 'LIVE now' : kickoffLabel(c.next.kickoffAt)}</span></a>` : ''}
      </div>` : ''}
    </div>
    <div class="card"><div class="card-head"><div class="h2">Award races</div><span class="tiny muted">League games only</span></div>
      <div class="ss-races">${RACES.filter(([k]) => d.races[k]).map(([k, l, u]) => raceCard(k, l, u, d.races[k], d, league.length))}</div></div>
    <div class="ss-bottom">
      <div class="card"><div class="card-head"><div class="h2">Milestones</div></div>${milestones(d)}</div>
      <div class="card"><div class="card-head"><div class="h2">Every game</div><span class="tiny muted">${g.length === 1 ? '1 match' : `${g.length} matches`}</span></div>
        ${g.length ? html`<div class="ss-games">${[...g].reverse().map(gameRow)}</div>` : html`<div class="empty small">Your first game of the season will show up here.</div>`}</div>
    </div>
  </div>`;
}
