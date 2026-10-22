// Transfer market: clubs post vacancies, players make themselves available,
// and staff invite players straight from the list.
import { POSITIONS, POSITION_NAMES } from '../../shared/attributes.ts';
import { api } from '../api.ts';
import { avatar } from '../art.ts';
import { badge, ovrChip, posChip } from '../components.ts';
import { html, mount, type Raw } from '../dom.ts';
import { icon } from '../icons.ts';
import { refreshMe } from '../state.ts';
import { errorBox, relTime, skeleton, toast } from '../ui.ts';

interface Market {
  me: { id: string; clubId: string | null; open: boolean; note: string; canPost: boolean; position: string; ovr: number } | null;
  vacancies: { id: string; position: string; minOvr: number; note: string; at: string; club: any; humans: number; maxHumans: number; mine: boolean }[];
  players: { id: string; name: string; position: string; ovr: number; appearance: never; equipped: never; shirt: number; note: string; club: any | null }[];
}

export async function transfersPage(el: HTMLElement) {
  mount(el, html`${skeleton(300, 2)}`);
  let d: Market;
  const load = async (first = false) => { d = first ? await api.page('/api/transfers') : await api.get('/api/transfers'); };
  try {
    await load(true);
  } catch (e) {
    return mount(el, errorBox((e as Error).message));
  }
  let tab: 'vacancies' | 'players' = 'vacancies';
  let pos: string = 'all';
  const asked = new Set<string>();

  const statusCard = (): Raw => {
    const me = d.me;
    if (!me) return html``;
    if (!me.clubId) {
      return html`<div class="card market-status"><div class="row" style="gap:12px">${icon('swap', 22)}<div class="grow"><div class="h3">You're a free agent</div>
        <div class="small muted">Every club can see you in the players list. Apply to a vacancy, or <a class="lime" href="/clubs">browse all clubs</a>.</div></div></div></div>`;
    }
    return html`<div class="card market-status ${me.open ? 'open' : ''}">
      <div class="row between wrap" style="gap:12px">
        <div class="row" style="gap:12px">${icon('swap', 22)}<div><div class="h3">${me.open ? 'Open to offers' : 'Happy at my club'}</div>
          <div class="small muted">${me.open ? 'Other clubs can invite you, and you can apply to their vacancies. Your current club is told.' : 'Turn this on to let other clubs invite you.'}</div></div></div>
        <button class="toggle ${me.open ? 'on' : ''}" id="open-toggle" aria-label="Open to offers"><i></i></button>
      </div>
      ${me.open ? html`<div class="row" style="gap:8px;margin-top:12px"><input class="input grow" id="tnote" maxlength="120" placeholder="What are you looking for? e.g. more minutes up front" value="${me.note}"><button class="btn" id="save-note">Save</button></div>` : ''}
    </div>`;
  };

  const posFilter = (): Raw => html`<div class="filter-row">${['all', ...POSITIONS].map((p) => html`<button class="fchip ${pos === p ? 'on' : ''}" data-pos="${p}">${p === 'all' ? 'All positions' : p}</button>`)}</div>`;

  const vacancies = (): Raw => {
    const me = d.me;
    const list = d.vacancies.filter((v) => pos === 'all' || v.position === pos);
    const canApply = (v: Market['vacancies'][number]) => me && v.club.id !== me.clubId && (!me.clubId || me.open);
    return html`
      ${me?.canPost ? html`<details class="card post-vac"><summary class="row between"><span class="h3">${icon('plus', 16)} Post a vacancy for your club</span><span class="tiny muted">Up to 3 open at once</span></summary>
        <div class="row wrap" style="gap:10px;margin-top:12px">
          <select class="input" id="vpos" style="max-width:200px">${POSITIONS.map((p) => html`<option value="${p}">${POSITION_NAMES[p]}</option>`)}</select>
          <input class="input" id="vmin" type="number" min="0" max="99" placeholder="Min OVR" style="max-width:110px">
          <input class="input grow" id="vnote" maxlength="120" placeholder="A line about the role (optional)">
          <button class="btn primary" id="post-vac">Post</button>
        </div></details>` : ''}
      ${posFilter()}
      ${list.length ? html`<div class="vac-grid">${list.map((v) => html`<div class="card vac">
        <div class="row" style="gap:10px"><a href="/club/${v.club.id}">${badge(v.club, 40)}</a><div class="grow" style="min-width:0"><a href="/club/${v.club.id}" class="h3 ellipsis" style="display:block">${v.club.name}</a><div class="tiny muted">${v.humans}/${v.maxHumans} players · ${relTime(v.at)}</div></div></div>
        <div class="row" style="gap:8px;margin-top:12px">${posChip(v.position)}<span style="font-weight:700">${POSITION_NAMES[v.position as keyof typeof POSITION_NAMES]}</span>${v.minOvr ? html`<span class="chip">${v.minOvr}+ OVR</span>` : ''}</div>
        ${v.note ? html`<div class="small muted" style="margin-top:8px">“${v.note}”</div>` : ''}
        <div class="row" style="margin-top:12px;gap:8px">
          ${v.mine ? html`<button class="btn sm" data-close="${v.id}">Close vacancy</button>`
            : canApply(v) ? html`<button class="btn primary sm" data-apply="${v.club.id}" ${asked.has(v.club.id) ? 'disabled' : ''}>${asked.has(v.club.id) ? 'Request sent' : 'Apply'}</button>`
            : me?.clubId === v.club.id ? html`<span class="tiny dim">Your club</span>` : html`<span class="tiny dim">Turn on “open to offers” to apply</span>`}
          ${me && me.position === v.position && v.minOvr && me.ovr < v.minOvr ? html`<span class="tiny dim">You're ${v.minOvr - me.ovr} OVR short, but you can still ask</span>` : ''}
        </div></div>`)}</div>`
      : html`<div class="card empty"><div class="h3">No vacancies${pos !== 'all' ? ` for ${pos}` : ''} right now</div>Clubs post here when they need a player. Check back soon, or ask a club directly.</div>`}`;
  };

  const players = (): Raw => {
    const me = d.me;
    const list = d.players.filter((p) => p.id !== me?.id && (pos === 'all' || p.position === pos));
    return html`${posFilter()}
      ${list.length ? html`<div class="card flush"><div class="list">${list.map((p) => html`<div class="list-item market-player">
        <a href="/player/${p.id}">${avatar(p.appearance, p.club?.colors, 44, p.club ? p.shirt : undefined, { eq: p.equipped })}</a>
        <div class="grow" style="min-width:0"><a href="/player/${p.id}" class="ellipsis" style="font-weight:700;display:block">${p.name}</a>
          <div class="tiny muted ellipsis">${p.club ? html`${p.club.short} · open to offers` : 'Free agent'}${p.note ? ` · “${p.note}”` : ''}</div></div>
        ${posChip(p.position)}${ovrChip(p.ovr, true)}
        ${me?.canPost && p.club?.id !== me.clubId ? html`<button class="btn sm" data-invite="${p.id}" ${asked.has(p.id) ? 'disabled' : ''}>${asked.has(p.id) ? 'Invited' : 'Invite'}</button>` : ''}
        <a class="btn sm ghost" href="/house/${p.id}" title="Visit home" aria-label="Visit home">${icon('home', 15)}</a>
      </div>`)}</div></div>`
      : html`<div class="card empty"><div class="h3">Nobody on the market${pos !== 'all' ? ` at ${pos}` : ''}</div>Free agents and players who are open to offers appear here.</div>`}`;
  };

  const render = () => mount(el, html`
    <div class="page-head"><div><div class="eyebrow">Market</div><div class="h1">Transfers</div></div>
      <div class="row" style="gap:8px"><span class="chip">${d.vacancies.length} ${d.vacancies.length === 1 ? 'vacancy' : 'vacancies'}</span><span class="chip">${d.players.length} ${d.players.length === 1 ? 'player' : 'players'}</span></div></div>
    ${statusCard()}
    <div class="tabs" style="margin-top:16px">${(['vacancies', 'players'] as const).map((t) => html`<button class="${t === tab ? 'on' : ''}" data-tab="${t}">${t === 'vacancies' ? 'Vacancies' : 'Players'}</button>`)}</div>
    <div class="fade-in">${tab === 'vacancies' ? vacancies() : players()}</div>`);

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast(ok, 'ok');
      await load();
      render();
    } catch (err) {
      toast((err as Error).message, 'err');
    }
  };

  el.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const tb = t.closest('[data-tab]') as HTMLElement | null;
    if (tb) { tab = tb.dataset.tab as typeof tab; return render(); }
    const pf = t.closest('[data-pos]') as HTMLElement | null;
    if (pf) { pos = pf.dataset.pos!; return render(); }
    if (t.closest('#open-toggle')) {
      const open = !d.me!.open;
      return run(async () => { await api.post('/api/transfers/status', { open, note: d.me!.note }); await refreshMe(); }, open ? 'You are open to offers' : 'You are off the market');
    }
    if (t.closest('#save-note')) {
      const note = el.querySelector<HTMLInputElement>('#tnote')?.value ?? '';
      return run(() => api.post('/api/transfers/status', { open: true, note }), 'Saved');
    }
    if (t.closest('#post-vac')) {
      const body = { position: el.querySelector<HTMLSelectElement>('#vpos')!.value, minOvr: Number(el.querySelector<HTMLInputElement>('#vmin')!.value) || 0, note: el.querySelector<HTMLInputElement>('#vnote')!.value };
      return run(() => api.post(`/api/clubs/${d.me!.clubId}/vacancies`, body), 'Vacancy posted');
    }
    const cl = t.closest('[data-close]') as HTMLElement | null;
    if (cl) return run(() => api.post(`/api/vacancies/${cl.dataset.close}/close`), 'Vacancy closed');
    const ap = t.closest('[data-apply]') as HTMLElement | null;
    if (ap) return run(async () => { await api.post(`/api/clubs/${ap.dataset.apply}/request`); asked.add(ap.dataset.apply!); }, 'Request sent. The club staff will decide.');
    const inv = t.closest('[data-invite]') as HTMLElement | null;
    if (inv) return run(async () => { await api.post(`/api/clubs/${d.me!.clubId}/invite`, { playerId: inv.dataset.invite }); asked.add(inv.dataset.invite!); }, 'Invite sent');
  });

  render();
}
