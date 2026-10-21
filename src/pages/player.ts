import { POSITION_NAMES } from '../../shared/attributes.ts';
import { api } from '../api.ts';
import { avatarSvg } from '../art.ts';
import { attrBars, badge, posChip, roleLabel } from '../components.ts';
import { html, mount } from '../dom.ts';
import { state } from '../state.ts';
import { errorBox, relTime, skeleton } from '../ui.ts';

export async function playerPage(el: HTMLElement, [id]: string[]) {
  mount(el, html`${skeleton(200, 2)}`);
  let d: any;
  try {
    d = await api.get(`/api/players/${id}`);
  } catch (e) {
    return mount(el, errorBox((e as Error).message));
  }
  const p = d.player;
  const c = d.career;
  const mine = p.id === state.player?.id;
  mount(el, html`
    <div class="dash stagger">
      <div class="pcard span-5">
        <div class="row between" style="align-items:flex-start">
          <div><div class="big-ovr">${p.ovr}</div><div style="margin-top:6px">${posChip(p.position)}</div></div>
          ${avatarSvg(p.appearance, d.club?.colors, 120, d.club ? p.shirt : undefined)}
        </div>
        <div class="pname" style="margin-top:12px">${p.name}</div>
        <div class="muted small">${POSITION_NAMES[p.position as keyof typeof POSITION_NAMES]}${p.isBot ? ' · AI player' : ''}${mine ? ' · You' : ''}</div>
        ${d.club ? html`<a href="/club/${d.club.id}" class="row" style="margin-top:12px;gap:8px">${badge(d.club, 26)}<span style="font-weight:600">${d.club.name}</span>${!p.isBot ? html`<span class="chip">${roleLabel(p.role)}</span>` : ''}</a>` : html`<div class="small muted" style="margin-top:12px">Free agent</div>`}
        <div class="divider"></div>
        <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:12px;text-align:center">
          ${[['Apps', c.apps], ['Goals', c.goals], ['Assists', c.assists], ['Avg rating', c.rating?.toFixed(2) ?? '–'], p.position === 'GK' ? ['Clean sheets', c.cleanSheets] : ['G+A', c.goals + c.assists], p.position === 'GK' ? ['Saves', c.saves] : ['Shirt', `#${p.shirt || '–'}`]].map(([k, v]) => html`<div><div style="font-family:var(--display);font-weight:800;font-size:28px">${v}</div><div class="tiny muted">${k}</div></div>`)}
        </div>
        <p class="tiny dim" style="margin:14px 0 0">League career stats${p.isBot ? '' : ` · Joined ${relTime(p.createdAt)}`}</p>
      </div>
      <div class="card span-7"><div class="card-head"><div class="h2">Attributes</div><span class="tiny muted"><span class="lime">●</span> key for position</span></div>${attrBars(p.attrs, p.position)}</div>
      <div class="card span-12"><div class="card-head"><div class="h2">Recent matches</div></div>
        ${d.recent.length ? html`<div class="list">${d.recent.map((r: any) => html`<a class="list-item" href="/match/${r.matchId}"><span class="grow" style="font-weight:600">${r.label}</span>
          ${r.goals ? html`<span class="chip lime">${r.goals} G</span>` : ''}${r.assists ? html`<span class="chip">${r.assists} A</span>` : ''}
          <span class="ovr sm ${r.rating >= 7.5 ? 'hi' : ''}" style="width:42px">${r.rating.toFixed(1)}</span></a>`)}</div>` : html`<div class="empty small">No matches played yet.</div>`}
      </div>
    </div>`);
}
