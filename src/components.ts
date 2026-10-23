import type { Badge } from '../shared/badge.ts';
import { ATTR_GROUPS, ATTR_LABELS, KEY_ATTRS, overall, POSITION_NAMES, type Attributes, type Position } from '../shared/attributes.ts';
import { badgeSvg } from './art.ts';
import { html, raw, type Raw } from './dom.ts';
import { kickoffLabel } from './ui.ts';

export interface ClubBrief {
  id: string;
  name: string;
  short: string;
  colors: { primary: string; secondary: string };
  badge: Badge;
  isBot?: boolean;
  /** The club owns the Golden crest. */
  gold?: boolean;
}

export interface MatchBrief {
  id: string;
  kind: string;
  round: number | null;
  kickoffAt: string;
  endsAt: string | null;
  status: 'scheduled' | 'live' | 'finished';
  home: ClubBrief;
  away: ClubBrief;
  score: [number, number] | null;
  pens?: [number, number] | null;
  cup?: { stage: number; total: number; tie: number; name: string };
}

export const badge = (c: ClubBrief, size = 28) => {
  const svg = badgeSvg(c.colors, c.badge, size, c.short);
  return c.gold ? raw(`<span class="crest-gold" style="--s:${size}px">${svg.html}</span>`) : svg;
};

export function posChip(pos: string): Raw {
  return html`<span class="pos pos-${pos}" title="${POSITION_NAMES[pos as Position] ?? pos}">${pos}</span>`;
}

export function ovrChip(v: number, sm = false): Raw {
  return html`<span class="ovr ${sm ? 'sm' : ''} ${v >= 70 ? 'hi' : ''}">${v}</span>`;
}

export function matchRow(m: MatchBrief, highlightClub?: string): Raw {
  let mid: Raw;
  const tag = m.kind === 'friendly' ? 'Friendly' : m.cup ? `Cup ${m.cup.name}` : m.round ? `R${m.round}` : '';
  if (m.status === 'finished' && m.score) mid = html`<div class="score num">${m.score[0]}<span class="dim">:</span>${m.score[1]}</div><div class="tiny dim">${m.pens ? html`<span class="lime">${m.pens[0]}–${m.pens[1]} pens</span>` : m.cup ? `${tag} · FT` : m.kind === 'friendly' ? 'Friendly · FT' : 'FT'}</div>`;
  else if (m.status === 'live') mid = html`<span class="chip live">LIVE</span><div class="tiny dim" style="margin-top:3px">Watch</div>`;
  else mid = html`<div class="small" style="font-weight:700">${new Date(m.kickoffAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</div><div class="tiny dim">${kickoffLabel(m.kickoffAt).split(' ').slice(0, -1).join(' ') || ''}${tag ? ` · ${tag}` : ''}</div>`;
  const side = (c: ClubBrief, away: boolean) => html`<div class="team ${away ? 'away' : ''}">${badge(c, 28)}<span class="ellipsis" style="${c.id === highlightClub ? 'color:var(--lime)' : ''}">${c.name}</span></div>`;
  return html`<a class="match-row" href="/match/${m.id}">${side(m.home, false)}<div class="mid">${mid}</div>${side(m.away, true)}</a>`;
}

export interface StandingRow {
  clubId: string;
  name: string;
  short: string;
  colors: { primary: string; secondary: string };
  badge: Badge;
  isBot: boolean;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
  form: string[];
  reds?: number;
}

export function standingsTable(rows: StandingRow[], myClub?: string | null, compact = false): Raw {
  return html`<table class="table">
    <thead><tr><th class="c">#</th><th>Club</th><th class="c">P</th>${compact ? '' : html`<th class="c hide-sm">W</th><th class="c hide-sm">D</th><th class="c hide-sm">L</th>`}<th class="c">GD</th><th class="c">Pts</th>${compact ? '' : html`<th class="hide-sm">Form</th>`}</tr></thead>
    <tbody>${rows.map((r, i) => html`<tr class="click ${r.clubId === myClub ? 'me' : ''}" data-href="/club/${r.clubId}">
      <td class="c dim" style="font-weight:700">${i + 1}</td>
      <td><div class="row" style="gap:9px">${badge({ ...r, id: r.clubId }, 24)}<span class="ellipsis" style="font-weight:600;max-width:${compact ? 140 : 220}px">${r.name}</span>${r.isBot ? html`<span class="chip tiny hide-sm" title="Run by AI">AI</span>` : ''}</div></td>
      <td class="c">${r.played}</td>
      ${compact ? '' : html`<td class="c hide-sm">${r.won}</td><td class="c hide-sm">${r.drawn}</td><td class="c hide-sm">${r.lost}</td>`}
      <td class="c">${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td>
      <td class="c pts">${r.points}</td>
      ${compact ? '' : html`<td class="hide-sm"><span class="form">${r.form.map((f) => html`<i class="${f}">${f}</i>`)}</span></td>`}
    </tr>`)}</tbody></table>`;
}

/** The home screen's league card: goals for and against, red cards and recent form. */
export function homeTable(rows: StandingRow[], myClub?: string | null): Raw {
  return html`<table class="table home-table">
    <thead><tr><th class="c">#</th><th>Club</th><th class="c">P</th><th class="c">GF</th><th class="c">GA</th><th class="c">GD</th><th class="c" title="Red cards"><i class="red-card"></i></th><th class="c">Pts</th><th>Form</th></tr></thead>
    <tbody>${rows.map((r, i) => html`<tr class="click ${r.clubId === myClub ? 'me' : ''}" data-href="/club/${r.clubId}">
      <td class="c dim" style="font-weight:700">${i + 1}</td>
      <td><div class="row" style="gap:9px">${badge({ ...r, id: r.clubId }, 22)}<span class="ellipsis" style="font-weight:600;max-width:150px">${r.name}</span></div></td>
      <td class="c">${r.played}</td>
      <td class="c">${r.gf}</td>
      <td class="c">${r.ga}</td>
      <td class="c ${r.gf - r.ga > 0 ? 'lime' : r.gf - r.ga < 0 ? 'neg' : ''}">${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td>
      <td class="c ${r.reds ? '' : 'dim'}">${r.reds ?? 0}</td>
      <td class="c pts">${r.points}</td>
      <td><span class="form">${r.form.length ? r.form.map((f) => html`<i class="${f}">${f}</i>`) : html`<span class="dim tiny">—</span>`}</span></td>
    </tr>`)}</tbody></table>`;
}

/** Makes table rows with data-href navigable. */
export function linkRows(root: HTMLElement, nav: (href: string) => void) {
  root.addEventListener('click', (e) => {
    const tr = (e.target as HTMLElement).closest('tr[data-href]') as HTMLElement | null;
    if (tr) nav(tr.dataset.href!);
  });
}

export function attrBars(attrs: Attributes, pos: Position, groups = ATTR_GROUPS, xp?: Record<string, number>): Raw {
  const keys = new Set(KEY_ATTRS[pos]);
  return html`<div class="grid cols-2" style="gap:18px 28px">${groups.map((g) => html`<div class="stack" style="gap:9px">
    <div class="label">${g.name}</div>
    ${g.attrs.map((a) => {
      const v = attrs[a];
      return html`<div class="attr ${keys.has(a) ? 'key' : ''}"><span class="n">${ATTR_LABELS[a]}${keys.has(a) ? html` <span class="lime">●</span>` : ''}</span><span class="v">${v}</span>
        <div class="bar ${v < 35 ? 'red' : v < 55 ? 'amber' : ''}"><i style="width:${v}%"></i></div>${xp && xp[a] ? '' : ''}</div>`;
    })}
  </div>`)}</div>`;
}

export function keyAttrs(attrs: Attributes, pos: Position): Raw {
  return html`<div class="stack" style="gap:9px">${KEY_ATTRS[pos].map((a) => html`<div class="attr key"><span class="n">${ATTR_LABELS[a]}</span><span class="v">${attrs[a]}</span><div class="bar"><i style="width:${attrs[a]}%"></i></div></div>`)}</div>`;
}

export function ovrOf(attrs: Attributes, pos: Position) {
  return overall(attrs, pos);
}

export function formIcons(form: string[]): Raw {
  return html`<span class="form">${form.map((f) => html`<i class="${f}">${f}</i>`)}</span>`;
}

export const roleLabel = (r: string) => r.charAt(0).toUpperCase() + r.slice(1);

export { raw };
