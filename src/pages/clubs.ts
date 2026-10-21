import { api } from '../api.ts';
import { BADGE_ICONS, BADGE_SHAPES, badgeSvg } from '../art.ts';
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
    data = await api.get('/api/clubs');
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

const PALETTE = ['#c6ff3d', '#1e6bff', '#d7263d', '#16a34a', '#facc15', '#ff7a1a', '#7a1fd1', '#0ea5e9', '#111111', '#f5f5f5', '#7f1d1d', '#065f46', '#e11d48', '#334155'];

export async function newClubPage(el: HTMLElement) {
  if (state.player?.clubId) return navigate(`/club/${state.player.clubId}`, true);
  const f = { name: '', short: '', primary: '#c6ff3d', secondary: '#111111', shape: 0, icon: 0, joinMode: 'open' };
  mount(el, html`
    <div class="page-head"><div><div class="eyebrow">Found a club</div><div class="h1" style="margin-top:6px">Create your club</div></div></div>
    <div class="dash">
      <div class="span-5"><div class="card hero-card" style="padding:30px;display:flex;flex-direction:column;align-items:center;gap:14px;position:sticky;top:20px">
        <div id="prev"></div><div class="h1" id="pname" style="font-size:36px;text-align:center">Your club</div><span class="chip" id="pshort">---</span>
        <p class="small muted" style="text-align:center;margin:0">You'll be the founder. AI players fill your squad until friends join, and your club takes an AI club's place in the current league season.</p>
      </div></div>
      <form class="span-7 stack" id="form" style="gap:16px">
        <div class="card grid cols-2">
          <div class="field"><label>Club name</label><input class="input" name="name" maxlength="24" required placeholder="e.g. Lime Rockets"></div>
          <div class="field"><label>Short name</label><input class="input" name="short" maxlength="4" required placeholder="LRK" style="text-transform:uppercase"></div>
        </div>
        <div class="card stack" style="gap:14px">
          <div class="field"><label>Primary colour</label><div class="swatches">${PALETTE.map((c) => html`<button type="button" class="swatch ${c === f.primary ? 'on' : ''}" data-c="primary" data-v="${c}" style="background:${c}"></button>`)}<input type="color" data-ci="primary" value="${f.primary}" style="width:34px;height:34px;border:0;background:none;padding:0"></div></div>
          <div class="field"><label>Secondary colour</label><div class="swatches">${PALETTE.map((c) => html`<button type="button" class="swatch ${c === f.secondary ? 'on' : ''}" data-c="secondary" data-v="${c}" style="background:${c}"></button>`)}<input type="color" data-ci="secondary" value="${f.secondary}" style="width:34px;height:34px;border:0;background:none;padding:0"></div></div>
          <div class="field"><label>Badge shape</label><div class="badge-picker" id="shapes"></div></div>
          <div class="field"><label>Emblem</label><div class="badge-picker" id="icons"></div></div>
        </div>
        <div class="card stack" style="gap:10px"><div class="label">Who can join?</div>
          <div class="seg" id="mode"><button type="button" class="on" data-m="open">Anyone</button><button type="button" data-m="invite">Invite code only</button></div></div>
        <div class="small" id="err" style="color:var(--red);min-height:18px"></div>
        <button class="btn primary block" style="height:52px;font-size:16px">Create club</button>
      </form>
    </div>`);
  const update = () => {
    const colors = { primary: f.primary, secondary: f.secondary };
    el.querySelector('#prev')!.innerHTML = badgeSvg(colors, f, 150, f.short).html;
    el.querySelector('#pname')!.textContent = f.name || 'Your club';
    el.querySelector('#pshort')!.textContent = (f.short || '---').toUpperCase();
    el.querySelector('#shapes')!.innerHTML = BADGE_SHAPES.map((n, i) => `<button type="button" title="${n}" data-shape="${i}" class="${i === f.shape ? 'on' : ''}">${badgeSvg(colors, { shape: i, icon: f.icon }, 44).html}</button>`).join('');
    el.querySelector('#icons')!.innerHTML = BADGE_ICONS.map((n, i) => `<button type="button" title="${n}" data-icon="${i}" class="${i === f.icon ? 'on' : ''}">${badgeSvg(colors, { shape: f.shape, icon: i }, 44).html}</button>`).join('');
  };
  update();
  el.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'name') f.name = t.value;
    if (t.name === 'short') f.short = t.value.toUpperCase();
    if (t.dataset.ci) (f as any)[t.dataset.ci] = t.value;
    update();
  });
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const c = t.closest('[data-c]') as HTMLElement | null;
    if (c) {
      (f as any)[c.dataset.c!] = c.dataset.v;
      c.parentElement!.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s === c));
      update();
    }
    const s = t.closest('[data-shape]') as HTMLElement | null;
    if (s) { f.shape = Number(s.dataset.shape); update(); }
    const i = t.closest('[data-icon]') as HTMLElement | null;
    if (i) { f.icon = Number(i.dataset.icon); update(); }
    const m = t.closest('[data-m]') as HTMLElement | null;
    if (m) {
      f.joinMode = m.dataset.m!;
      el.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b === m));
    }
  });
  el.querySelector('#form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = (e.target as HTMLFormElement).querySelector('button:last-child') as HTMLButtonElement;
    btn.disabled = true;
    try {
      const r = await api.post('/api/clubs', f);
      await refreshMe();
      toast(r.placement === 'joined' ? 'Club founded — you took a place in this season\'s league!' : 'Club founded — you join the league next season.', 'ok');
      navigate(`/club/${r.id}`, true);
    } catch (err) {
      el.querySelector('#err')!.textContent = (err as Error).message;
      btn.disabled = false;
    }
  });
}
