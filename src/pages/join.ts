// Invite links: /join/CODE shows the club and lets a free agent join in one tap.
import { api } from '../api.ts';
import { badge } from '../components.ts';
import { html, mount } from '../dom.ts';
import { icon } from '../icons.ts';
import { navigate } from '../router.ts';
import { refreshMe, state } from '../state.ts';
import { errorBox, skeleton, toast } from '../ui.ts';

export async function joinPage(el: HTMLElement, [code]: string[]) {
  mount(el, html`${skeleton(260, 1)}`);
  let d: any;
  try {
    d = await api.get(`/api/join/${encodeURIComponent(code)}`);
  } catch (e) {
    return mount(el, errorBox((e as Error).message));
  }
  const c = d.club;
  const inThis = state.player?.clubId === c.id;
  const hasClub = !!state.player?.clubId;
  mount(el, html`<div style="max-width:520px;margin:4vh auto 0">
    <div class="card hero-card stack" style="align-items:center;text-align:center;gap:14px;padding:32px 24px;background:radial-gradient(500px 260px at 50% 0%, ${c.colors.primary}44, transparent 70%), linear-gradient(160deg, #1a2026, #121518)">
      <div class="eyebrow">You're invited</div>
      ${badge(c, 110)}
      <div class="h1">${c.name}</div>
      <div class="row wrap" style="justify-content:center;gap:8px"><span class="chip">${icon('users', 13)} ${c.humans}/${c.maxHumans} humans</span><span class="chip">Strength ${c.strength}</span></div>
      ${inThis ? html`<a class="btn primary block" href="/club/${c.id}">You're already in this club</a>`
        : hasClub ? html`<p class="small muted" style="margin:0">You're already in a club. Leave it first if you want to switch.</p><a class="btn block" href="/club/${c.id}">View club</a>`
        : html`<button class="btn primary block" id="join" style="height:50px">Join ${c.name}</button>`}
    </div></div>`);
  el.querySelector('#join')?.addEventListener('click', async () => {
    try {
      await api.post(`/api/clubs/${c.id}/join`, { code: d.code });
      await refreshMe();
      toast(`Welcome to ${c.name}!`, 'ok');
      navigate(`/club/${c.id}`, true);
    } catch (err) {
      toast((err as Error).message, 'err');
    }
  });
}
