import { api } from '../api.ts';
import { badge, linkRows, matchRow, posChip, standingsTable, type MatchBrief } from '../components.ts';
import { html, mount, type Raw } from '../dom.ts';
import { navigate } from '../router.ts';
import { state } from '../state.ts';
import { errorBox, kickoffLabel, skeleton } from '../ui.ts';
import { trophyArt } from '../gearArt.ts';

export async function leaguePage(el: HTMLElement) {
  mount(el, html`${skeleton(300, 1)}`);
  let d: any;
  try {
    d = await api.get('/api/league');
  } catch (e) {
    return mount(el, errorBox((e as Error).message));
  }
  if (!d.season) return mount(el, html`<div class="card empty"><div class="h3">No active season</div>The next season is being scheduled.</div>`);
  const myClub = state.player?.clubId;
  const matches = d.matches as MatchBrief[];
  const rounds = [...new Set(matches.map((m) => m.round!))].sort((a, b) => a - b);
  const current = matches.find((m) => m.status !== 'finished')?.round ?? rounds[rounds.length - 1];
  let round = current;
  const want = new URLSearchParams(location.search).get('tab');
  let tab: 'table' | 'fixtures' | 'cup' | 'leaders' | 'honours' = want === 'cup' || want === 'fixtures' || want === 'leaders' || want === 'honours' ? want : 'table';
  const played = matches.filter((m) => m.status === 'finished').length;

  const leaders = (title: string, rows: any[], unit: string): Raw => html`<div class="card"><div class="card-head"><div class="h2">${title}</div></div>
    ${rows.length ? html`<div class="list">${rows.map((r, i) => html`<a class="list-item" href="/player/${r.playerId}">
      <span class="dim" style="width:18px;font-weight:800">${i + 1}</span>${posChip(r.position)}
      <span class="grow ellipsis" style="font-weight:600">${r.name}${r.isBot ? '' : html` <span class="lime tiny">●</span>`}</span>
      <span class="tiny muted">${r.club}</span><span style="font-family:var(--display);font-weight:800;font-size:22px;min-width:30px;text-align:right">${r.value}</span><span class="tiny dim">${unit}</span></a>`)}</div>`
    : html`<div class="empty small">No data yet.</div>`}</div>`;

  const honours = (): Raw => {
    if (!d.honours?.length) return html`<div class="card empty"><div class="h3">Roll of honour</div>Champions and season award winners appear here once Season 1 ends.</div>`;
    const cell = (h: any, kind: string, label: string) => {
      const w = h[kind];
      if (!w) return html`<div class="hon"><div class="tiny dim">${label}</div><div class="dim">—</div></div>`;
      return html`<div class="hon">${trophyArt(kind, 44)}<div><div class="tiny dim">${label}</div>
        ${w.playerId ? html`<a href="/player/${w.playerId}" style="font-weight:700">${w.player}</a><div class="tiny muted">${w.club ?? ''}${w.value != null ? ` · ${w.value}` : ''}</div>` : html`<a href="/club/${w.clubId}" style="font-weight:700">${w.club}</a><div class="tiny muted">${kind === 'cup' ? 'Knockout winners' : `${w.value} pts`}</div>`}</div></div>`;
    };
    return html`<div class="stack" style="gap:12px">${d.honours.map((h: any) => html`<div class="card"><div class="h2" style="margin-bottom:12px">Season ${h.season}</div>
      <div class="hon-grid">${cell(h, 'champion', 'Champions')}${h.cup ? cell(h, 'cup', 'Cup winners') : ''}${cell(h, 'golden_boot', 'Golden Boot')}${cell(h, 'playmaker', 'Playmaker')}${cell(h, 'golden_glove', 'Golden Glove')}${cell(h, 'pots', 'Player of the Season')}</div></div>`)}</div>`;
  };

  const cup = (): Raw => {
    const c = d.cup;
    if (!c) return html`<div class="card empty"><div class="h3">FootbalLife Cup</div>The cup draw happens when the season starts.</div>`;
    const ties = c.ties as MatchBrief[];
    const stages = Array.from({ length: c.total }, (_, i) => i + 1);
    const nameOf = (s: number) => (s === c.total ? 'Final' : s === c.total - 1 ? 'Semi-finals' : s === c.total - 2 ? 'Quarter-finals' : `Round ${s}`);
    const winner = (m: MatchBrief) => (!m.score ? null : m.score[0] > m.score[1] || (m.score[0] === m.score[1] && m.pens && m.pens[0] > m.pens[1]) ? m.home.id : m.away.id);
    const final = ties.find((m) => m.cup?.stage === c.total && m.status === 'finished');
    const champ = final ? (winner(final) === final.home.id ? final.home : final.away) : null;
    const side = (cl: MatchBrief['home'], m: MatchBrief, i: 0 | 1) => {
      const w = winner(m);
      return html`<div class="bk-team ${w && w !== cl.id ? 'out' : ''} ${cl.id === myClub ? 'me' : ''}">${badge(cl, 20)}<span class="ellipsis grow">${cl.name}</span>
        <b class="num">${m.score ? m.score[i] : ''}${m.pens ? html`<sup>${m.pens[i]}</sup>` : ''}</b></div>`;
    };
    const slots = (stage: number) => {
      const here = ties.filter((m) => m.cup?.stage === stage);
      const expected = stage === 1 ? here.length : 2 ** (c.total - stage);
      return Array.from({ length: Math.max(expected, here.length) }, (_, i) => here.find((m) => m.cup?.tie === i) ?? null);
    };
    return html`
      ${champ ? html`<div class="card cup-champ">${trophyArt('cup', 64)}<div><div class="eyebrow">Cup winners</div><div class="h2">${champ.name}</div><div class="tiny muted">${final!.home.short} ${final!.score![0]}–${final!.score![1]} ${final!.away.short}${final!.pens ? ` (${final!.pens[0]}–${final!.pens[1]} on pens)` : ''}</div></div></div>` : ''}
      <div class="card bracket-card"><div class="card-head"><div><div class="eyebrow">Knockout</div><div class="h2">FootbalLife Cup</div></div><span class="tiny muted">Drawn ties go to penalties</span></div>
        <div class="bracket">${stages.map((s) => html`<div class="bk-col"><div class="bk-head">${nameOf(s)}</div>
              <div class="bk-ties">${slots(s).map((m) => m ? html`<a class="bk-tie ${m.status === 'live' ? 'live' : ''}" href="/match/${m.id}">${side(m.home, m, 0)}${side(m.away, m, 1)}
            <div class="bk-when tiny dim">${m.status === 'live' ? html`<span class="chip live">LIVE</span>` : m.status === 'scheduled' ? kickoffLabel(m.kickoffAt) : 'FT'}</div></a>` : html`<div class="bk-tie tbd"><div class="bk-team dim">To be decided</div><div class="bk-team dim">To be decided</div></div>`)}</div></div>`)}</div>
        ${c.byes.length ? html`<div class="tiny dim" style="margin-top:12px">Byes to round 2: ${c.byes.map((b: any) => b.short).join(', ')}</div>` : ''}
        <p class="tiny dim" style="margin:10px 0 0">The cup winners get a trophy, 500 coins each and the final's match ball for their home.</p>
      </div>`;
  };

  const render = () => {
    const roundMatches = matches.filter((m) => m.round === round);
    mount(el, html`
      <div class="page-head"><div><div class="eyebrow">Division 1</div><div class="h1" style="margin-top:6px">Season ${d.season.number}</div></div>
        <div class="chip">${played}/${matches.length} matches played</div></div>
      <div class="tabs">${(['table', 'fixtures', 'cup', 'leaders', 'honours'] as const).map((t) => html`<button class="${t === tab ? 'on' : ''}" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`)}</div>
      <div class="fade-in">
      ${tab === 'table' ? html`<div class="card flush" id="tbl">${standingsTable(d.table, myClub)}</div>
        <p class="tiny dim" style="margin-top:10px">3 points for a win, 1 for a draw. Ties broken by goal difference, then goals scored. Final positions earn season rewards for every human player.</p>` : ''}
      ${tab === 'fixtures' ? html`<div class="card">
        <div class="row between" style="margin-bottom:8px"><button class="btn sm" data-r="-1" ${round <= rounds[0] ? 'disabled' : ''}>‹</button>
          <div style="text-align:center"><div class="h2">Round ${round}</div><div class="tiny muted">${roundMatches[0] ? kickoffLabel(roundMatches[0].kickoffAt) : ''}</div></div>
          <button class="btn sm" data-r="1" ${round >= rounds[rounds.length - 1] ? 'disabled' : ''}>›</button></div>
        ${roundMatches.map((m) => matchRow(m, myClub ?? undefined))}</div>` : ''}
      ${tab === 'cup' ? cup() : ''}
      ${tab === 'honours' ? honours() : ''}
      ${tab === 'leaders' ? html`<div class="grid cols-3 stagger">${leaders('Top scorers', d.scorers, 'G')}${leaders('Top assists', d.assists, 'A')}${leaders('Clean sheets', d.keepers, 'CS')}</div>` : ''}
      </div>`);
    const tbl = el.querySelector('#tbl') as HTMLElement | null;
    if (tbl) linkRows(tbl, navigate);
  };
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const tb = t.closest('[data-tab]') as HTMLElement | null;
    if (tb) { tab = tb.dataset.tab as typeof tab; render(); }
    const r = t.closest('[data-r]') as HTMLElement | null;
    if (r) { round = Math.max(rounds[0], Math.min(rounds[rounds.length - 1], round + Number(r.dataset.r))); render(); }
  });
  render();
}
