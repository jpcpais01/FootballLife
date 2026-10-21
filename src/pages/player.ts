import { ACHIEVEMENTS, TIER_COLORS, TROPHY_KINDS, type TrophyKind } from '../../shared/achievements.ts';
import { POSITION_NAMES } from '../../shared/attributes.ts';
import { gear, RARITY_COLORS } from '../../shared/cosmetics.ts';
import { api } from '../api.ts';
import { avatarSvg } from '../art.ts';
import { attrBars, badge, posChip, roleLabel } from '../components.ts';
import { html, mount, type Raw } from '../dom.ts';
import { cardBackground, trophyArt } from '../gearArt.ts';
import { icon } from '../icons.ts';
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
  const g = gear(p.equipped);
  const earned = new Map<string, string>(d.achievements.map((a: any) => [a.id, a.at]));
  const kit = d.club?.colors;

  const trophyCabinet = (): Raw => {
    if (!d.trophies.length) return html`<div class="empty small">${mine ? 'No silverware yet. Win the league or a season award to fill this shelf.' : 'No trophies yet.'}</div>`;
    return html`<div class="cabinet">${d.trophies.map((t: any) => html`<div class="trophy" title="${TROPHY_KINDS[t.kind as TrophyKind]?.label ?? t.kind}">
      ${trophyArt(t.kind, 72)}<div class="tiny" style="font-weight:800">${TROPHY_KINDS[t.kind as TrophyKind]?.label ?? t.kind}</div><div class="tiny dim">Season ${t.season}${t.club ? ` · ${t.club}` : ''}</div></div>`)}</div>`;
  };

  const achievementsGrid = (): Raw => html`<div class="ach-grid">${ACHIEVEMENTS.map((a) => {
    const at = earned.get(a.id);
    const pr = d.progress?.[a.id] as [number, number] | undefined;
    return html`<div class="ach ${at ? 'got' : ''}" style="--tier:${TIER_COLORS[a.tier]}">
      <div class="ach-medal sm">${icon(a.icon, 18)}</div>
      <div class="grow" style="min-width:0"><div class="ellipsis" style="font-weight:700">${a.name}</div><div class="tiny muted">${a.desc}</div>
        ${at ? html`<div class="tiny" style="color:var(--tier);margin-top:3px">Unlocked ${relTime(at)}</div>`
          : pr ? html`<div class="bar" style="margin-top:6px"><i style="width:${Math.round((pr[0] / pr[1]) * 100)}%"></i></div><div class="tiny dim" style="margin-top:3px">${Math.floor(pr[0])} / ${pr[1]}${a.coins ? ` · ${a.coins} coins` : ''}</div>` : ''}
      </div></div>`;
  })}</div>`;

  mount(el, html`
    <div class="dash stagger">
      <div class="span-5 stack" style="gap:16px">
        <div class="pcard profile-card ${g.card?.style === 'holo' ? 'holo' : ''}" style="background:${cardBackground(g.card)}">
          <div class="row between" style="align-items:flex-start">
            <div><div class="big-ovr">${p.ovr}</div><div style="margin-top:6px">${posChip(p.position)}</div></div>
            ${avatarSvg(p.appearance, kit, 128, d.club ? p.shirt : undefined, { eq: p.equipped, offPitch: !!g.outfit })}
          </div>
          <div class="pname" style="margin-top:12px">${p.name}</div>
          ${g.title ? html`<div class="title-tag" style="--rc:${RARITY_COLORS[g.title.rarity]}">${g.title.name}</div>` : ''}
          <div class="muted small" style="margin-top:2px">${POSITION_NAMES[p.position as keyof typeof POSITION_NAMES]}${p.isBot ? ' · AI player' : ''}${mine ? ' · You' : ''}</div>
          ${p.motto ? html`<div class="motto">“${p.motto}”</div>` : ''}
          ${d.club ? html`<a href="/club/${d.club.id}" class="row" style="margin-top:12px;gap:8px">${badge(d.club, 26)}<span style="font-weight:600">${d.club.name}</span>${!p.isBot ? html`<span class="chip">${roleLabel(p.role)}</span>` : ''}</a>` : html`<div class="small muted" style="margin-top:12px">Free agent</div>`}
          <div class="divider"></div>
          <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:12px;text-align:center">
            ${[['Apps', c.apps], ['Goals', c.goals], ['Assists', c.assists], ['Avg rating', c.rating?.toFixed(2) ?? '–'], p.position === 'GK' ? ['Clean sheets', c.cleanSheets] : ['G+A', c.goals + c.assists], ['Trophies', d.trophies.length]].map(([k, v]) => html`<div><div style="font-family:var(--display);font-weight:800;font-size:28px">${v}</div><div class="tiny muted">${k}</div></div>`)}
          </div>
          <p class="tiny dim" style="margin:14px 0 0">League career stats${p.isBot ? '' : ` · Joined ${relTime(p.createdAt)}`}${!p.isBot ? ` · ${d.achievements.length}/${ACHIEVEMENTS.length} achievements` : ''}</p>
        </div>
        ${mine ? html`<div class="row"><a class="btn primary grow" href="/shop/locker">${icon('bag', 16)} Customise</a><a class="btn grow" href="/shop/look">Edit look</a></div>` : ''}
      </div>
      <div class="card span-7"><div class="card-head"><div class="h2">Attributes</div><span class="tiny muted"><span class="lime">●</span> key for position</span></div>${attrBars(p.attrs, p.position)}</div>
      <div class="card span-12"><div class="card-head"><div class="h2">Trophy cabinet</div><span class="tiny muted">${d.trophies.length} total</span></div>${trophyCabinet()}</div>
      ${!p.isBot ? html`<div class="card span-12"><div class="card-head"><div class="h2">Achievements</div><span class="tiny muted">${d.achievements.length} of ${ACHIEVEMENTS.length}</span></div>${achievementsGrid()}</div>` : ''}
      <div class="card span-12"><div class="card-head"><div class="h2">Recent matches</div></div>
        ${d.recent.length ? html`<div class="list">${d.recent.map((r: any) => html`<a class="list-item" href="/match/${r.matchId}"><span class="grow" style="font-weight:600">${r.label}</span>
          ${r.goals ? html`<span class="chip lime">${r.goals} G</span>` : ''}${r.assists ? html`<span class="chip">${r.assists} A</span>` : ''}
          <span class="ovr sm ${r.rating >= 7.5 ? 'hi' : ''}" style="width:42px">${r.rating.toFixed(1)}</span></a>`)}</div>` : html`<div class="empty small">No matches played yet.</div>`}
      </div>
    </div>`);
}
