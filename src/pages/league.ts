import { api } from '../api.ts';
import { linkRows, matchRow, posChip, standingsTable, type MatchBrief } from '../components.ts';
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
  let tab: 'table' | 'fixtures' | 'leaders' | 'honours' = 'table';
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
        ${w.playerId ? html`<a href="/player/${w.playerId}" style="font-weight:700">${w.player}</a><div class="tiny muted">${w.club ?? ''}${w.value != null ? ` · ${w.value}` : ''}</div>` : html`<a href="/club/${w.clubId}" style="font-weight:700">${w.club}</a><div class="tiny muted">${w.value} pts</div>`}</div></div>`;
    };
    return html`<div class="stack" style="gap:12px">${d.honours.map((h: any) => html`<div class="card"><div class="h2" style="margin-bottom:12px">Season ${h.season}</div>
      <div class="hon-grid">${cell(h, 'champion', 'Champions')}${cell(h, 'golden_boot', 'Golden Boot')}${cell(h, 'playmaker', 'Playmaker')}${cell(h, 'golden_glove', 'Golden Glove')}${cell(h, 'pots', 'Player of the Season')}</div></div>`)}</div>`;
  };

  const render = () => {
    const roundMatches = matches.filter((m) => m.round === round);
    mount(el, html`
      <div class="page-head"><div><div class="eyebrow">Division 1</div><div class="h1" style="margin-top:6px">Season ${d.season.number}</div></div>
        <div class="chip">${played}/${matches.length} matches played</div></div>
      <div class="tabs">${(['table', 'fixtures', 'leaders', 'honours'] as const).map((t) => html`<button class="${t === tab ? 'on' : ''}" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`)}</div>
      <div class="fade-in">
      ${tab === 'table' ? html`<div class="card flush" id="tbl">${standingsTable(d.table, myClub)}</div>
        <p class="tiny dim" style="margin-top:10px">3 points for a win, 1 for a draw. Ties broken by goal difference, then goals scored. Final positions earn season rewards for every human player.</p>` : ''}
      ${tab === 'fixtures' ? html`<div class="card">
        <div class="row between" style="margin-bottom:8px"><button class="btn sm" data-r="-1" ${round <= rounds[0] ? 'disabled' : ''}>‹</button>
          <div style="text-align:center"><div class="h2">Round ${round}</div><div class="tiny muted">${roundMatches[0] ? kickoffLabel(roundMatches[0].kickoffAt) : ''}</div></div>
          <button class="btn sm" data-r="1" ${round >= rounds[rounds.length - 1] ? 'disabled' : ''}>›</button></div>
        ${roundMatches.map((m) => matchRow(m, myClub ?? undefined))}</div>` : ''}
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
