import { api } from '../api.ts';
import { mountBadgeEditor, type ClubDraft } from '../badgeEditor.ts';
import { badge } from '../components.ts';
import { html, mount } from '../dom.ts';
import { icon } from '../icons.ts';
import { navigate } from '../router.ts';
import { refreshMe, state } from '../state.ts';
import { errorBox, promptModal, skeleton, toast } from '../ui.ts';

export async function clubsPage(el: HTMLElement) {
  mount(el, html`${skeleton(70, 6)}`);
  let data: any;
  try {
    data = await api.page('/api/clubs');
  } catch (e) {
    return mount(el, errorBox((e as Error).message));
  }
  const mine = state.player?.clubId;
  const humans = data.clubs.filter((c: any) => !c.isBot);
  const bots = data.clubs.filter((c: any) => c.isBot);
  const row = (c: any) => html`<div class="list-item" style="padding:14px 6px">
    <a href="/club/${c.id}" class="row grow" style="gap:12px">${badge(c, 40)}
      <div class="grow"><div class="h3 ellipsis">${c.name}</div>
        <div class="tiny muted">${c.isBot ? 'AI club' : `${c.humans} player${c.humans === 1 ? '' : 's'}`} · ${c.formation} · Strength ${c.strength}${c.inSeason ? ' · In league' : ' · Joins next season'}</div></div></a>
    ${c.isBot ? html`<span class="chip">AI</span>` : c.id === mine ? html`<span class="chip lime">Your club</span>` : mine ? '' : html`<button class="btn sm ${c.joinMode === 'open' ? 'primary' : ''}" data-join="${c.id}" data-mode="${c.joinMode}">${c.joinMode === 'open' ? 'Join' : 'Join with code'}</button>`}
  </div>`;
  mount(el, html`
    <div class="page-head"><div><div class="eyebrow">Community</div><div class="h1" style="margin-top:6px">Clubs</div></div>
      ${mine ? '' : html`<a class="btn primary" href="/clubs/new">${icon('plus')} Create a club</a>`}</div>
    <div class="dash stagger">
      <div class="card span-7"><div class="card-head"><div class="h2">Player clubs</div><span class="chip">${humans.length}</span></div>
        ${humans.length ? html`<div class="list">${humans.map(row)}</div>` : html`<div class="empty"><div class="h3">No player clubs yet</div>Be the first — your club takes an AI club's place in the league straight away.</div>`}
      </div>
      <div class="card span-5"><div class="card-head"><div class="h2">AI clubs</div><span class="chip">${bots.length}</span></div>
        <p class="small muted" style="margin:0 0 6px">AI clubs keep the league full. Each new player club replaces one.</p>
        <div class="list">${bots.map(row)}</div>
      </div>
    </div>`);
  el.addEventListener('click', async (e) => {
    const b = (e.target as HTMLElement).closest('[data-join]') as HTMLElement | null;
    if (!b) return;
    let code: string | null = '';
    if (b.dataset.mode === 'invite') {
      code = await promptModal('Invite-only club', 'Invite code', 'e.g. 7KQ2M9XA');
      if (!code) return;
    }
    try {
      await api.post(`/api/clubs/${b.dataset.join}/join`, { code });
      await refreshMe();
      toast('Welcome to the club!', 'ok');
      navigate(`/club/${b.dataset.join}`);
    } catch (err) {
      toast((err as Error).message, 'err');
    }
  });
}

export async function newClubPage(el: HTMLElement) {
  if (state.player?.clubId) return navigate(`/club/${state.player.clubId}`, true);
  const d: ClubDraft = { name: '', short: '', primary: '#c6ff3d', secondary: '#111111', badge: { shape: 0, icon: 0 } };
  let joinMode = 'open';
  mount(el, html`
    <div class="page-head"><div><div class="eyebrow">Found a club</div><div class="h1" style="margin-top:6px">Create your club</div></div>
      <button class="btn primary" id="create">${icon('check')} Create club</button></div>
    <div id="editor"></div>
    <div class="card row wrap between" style="margin-top:16px;gap:12px">
      <div><div class="h3">Who can join?</div><div class="tiny muted">You'll be the founder. AI players fill the squad until friends join, and you can change all of this later.</div></div>
      <div class="seg" id="mode"><button type="button" class="on" data-m="open">Anyone</button><button type="button" data-m="invite">Invite code only</button></div>
    </div>
    <div class="small" id="err" style="color:var(--red);min-height:18px;margin-top:10px"></div>`);
  mountBadgeEditor(el.querySelector('#editor')!, d);
  el.querySelector('#mode')!.addEventListener('click', (e) => {
    const m = (e.target as HTMLElement).closest('[data-m]') as HTMLElement | null;
    if (!m) return;
    joinMode = m.dataset.m!;
    el.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b === m));
  });
  const btn = el.querySelector('#create') as HTMLButtonElement;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const r = await api.post('/api/clubs', { name: d.name, short: d.short, primary: d.primary, secondary: d.secondary, badge: d.badge, joinMode });
      await refreshMe();
      toast(r.placement === 'joined' ? 'Club founded — you took a place in this season\'s league!' : 'Club founded — you join the league next season.', 'ok');
      navigate(`/club/${r.id}`, true);
    } catch (err) {
      el.querySelector('#err')!.textContent = (err as Error).message;
      toast((err as Error).message, 'err');
      btn.disabled = false;
    }
  });
}

/** Club identity editor for staff: badge, name and kit, any time. */
export async function editClubPage(el: HTMLElement, [id]: string[]) {
  mount(el, html`${skeleton(120, 3)}`);
  let data: any;
  try {
    data = await api.get(`/api/clubs/${id}`);
  } catch (e) {
    return mount(el, errorBox((e as Error).message));
  }
  const c = data.club;
  if (!data.me?.perms?.settings) {
    return mount(el, html`<div class="empty"><div class="h3">Only the founder or president can edit ${c.name}</div><a class="btn" href="/club/${c.id}" style="margin-top:12px">Back to club</a></div>`);
  }
  const d: ClubDraft = { name: c.name, short: c.short, primary: c.colors.primary, secondary: c.colors.secondary, badge: structuredClone(c.badge) };
  mount(el, html`
    <div class="page-head"><div><div class="eyebrow">Club identity</div><div class="h1" style="margin-top:6px">Edit ${c.name}</div></div>
      <div class="row" style="gap:8px"><a class="btn ghost" href="/club/${c.id}">Cancel</a><button class="btn primary" id="save">${icon('check')} Save</button></div></div>
    <div id="editor"></div>`);
  mountBadgeEditor(el.querySelector('#editor')!, d);
  const btn = el.querySelector('#save') as HTMLButtonElement;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      await api.post(`/api/clubs/${c.id}/settings`, { name: d.name, short: d.short, primary: d.primary, secondary: d.secondary, badge: d.badge });
      await Promise.all([refreshMe(), api.get(`/api/clubs/${c.id}`).catch(() => {})]);
      toast('Club updated', 'ok');
      navigate(`/club/${c.id}`, true);
    } catch (err) {
      toast((err as Error).message, 'err');
      btn.disabled = false;
    }
  });
}
