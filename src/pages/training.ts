import { achievementToasts } from '../ui.ts';
import { ATTR_GROUPS, ATTR_LABELS, KEY_ATTRS, xpToNext, type Attr } from '../../shared/attributes.ts';
import { api } from '../api.ts';
import { html, mount } from '../dom.ts';
import { icon } from '../icons.ts';
import { refreshMe } from '../state.ts';
import { countdown, errorBox, skeleton, toast } from '../ui.ts';

const FOCI = [
  { id: 'position', name: 'Position drills', desc: 'Your five key attributes' },
  { id: 'physical', name: 'Physical', desc: 'Pace, acceleration, stamina, strength' },
  { id: 'technical', name: 'Technical', desc: 'Passing, control, dribbling, vision' },
  { id: 'defending', name: 'Defending', desc: 'Marking, tackling, positioning, interception' },
  { id: 'attacking', name: 'Attacking', desc: 'Finishing, shooting, movement, key passes' },
];

export async function trainingPage(el: HTMLElement) {
  mount(el, html`<div class="stack">${skeleton(120, 3)}</div>`);
  let d: any;
  let focus: string = 'position';
  let timer = 0;
  const load = async () => {
    d = await api.get('/api/home');
    render();
  };

  const render = () => {
    const p = d.player;
    const t = d.training;
    const xp = (t.xp ?? {}) as Record<string, number>;
    const keys = new Set(KEY_ATTRS[p.position as keyof typeof KEY_ATTRS]);
    mount(el, html`
      <div class="page-head"><div><div class="eyebrow">Development</div><div class="h1" style="margin-top:6px">Training</div></div>
        <div class="chip ${t.ready ? 'lime' : ''}">${icon('clock', 13)} ${t.ready ? 'Session ready' : html`Next in <span data-cd="${t.availableAt}">${countdown(t.availableAt)}</span>`}</div></div>
      <div class="dash stagger">
        <div class="card span-5 stack" style="gap:14px">
          <div class="h2">Choose a focus</div>
          <p class="small muted" style="margin:0">One session every 4 hours. Key attributes for your position (<span class="lime">●</span>) train 25% faster. Training again within a day gives a 15% regularity bonus. Higher attributes need more XP to improve.</p>
          <div class="stack" style="gap:8px">${FOCI.map((f) => html`<button class="pos-card ${focus === f.id ? 'on' : ''}" data-focus="${f.id}" style="padding:12px 14px"><div class="t" style="margin:0">${f.name}</div><div class="d">${f.desc}</div></button>`)}</div>
          <div class="field"><label>Or one attribute</label>
            <select class="input" id="single"><option value="">—</option>${ATTR_GROUPS.map((g) => html`<optgroup label="${g.name}">${g.attrs.map((a) => html`<option value="${a}" ${focus === a ? 'selected' : ''}>${ATTR_LABELS[a]}${keys.has(a) ? ' ●' : ''}</option>`)}</optgroup>`)}</select>
          </div>
          <button class="btn primary block" id="train" style="height:50px" ${t.ready ? '' : 'disabled'}>${icon('dumbbell')} ${t.ready ? 'Train now' : 'Recovering…'}</button>
          <div id="result"></div>
        </div>
        <div class="card span-7">
          <div class="card-head"><div class="h2">Progress</div><span class="chip">${p.ovr} OVR</span></div>
          <div class="grid cols-2" style="gap:18px 28px">${ATTR_GROUPS.map((g) => html`<div class="stack" style="gap:10px"><div class="label">${g.name}</div>
            ${g.attrs.map((a) => {
              const v = p.attrs[a];
              const need = xpToNext(v);
              const have = xp[a] ?? 0;
              return html`<div class="attr ${keys.has(a) ? 'key' : ''}"><span class="n">${ATTR_LABELS[a]}${keys.has(a) ? html` <span class="lime">●</span>` : ''}</span><span class="v">${v}</span>
                <div class="bar" title="${have}/${need} XP to ${v + 1}"><i style="width:${Math.min(100, (have / need) * 100)}%"></i></div></div>`;
            })}</div>`)}</div>
          <p class="tiny dim" style="margin:16px 0 0">Bars show XP toward the next point.</p>
        </div>
      </div>`);
  };

  el.addEventListener('click', async (e) => {
    const f = (e.target as HTMLElement).closest('[data-focus]') as HTMLElement | null;
    if (f) {
      focus = f.dataset.focus!;
      el.querySelectorAll('[data-focus]').forEach((b) => b.classList.toggle('on', b === f));
      (el.querySelector('#single') as HTMLSelectElement).value = '';
    }
    if ((e.target as HTMLElement).closest('#train')) {
      const btn = el.querySelector<HTMLButtonElement>('#train')!;
      btn.disabled = true;
      try {
        const r = await api.post('/api/train', { focus });
        const ups = r.levelUps as { attr: Attr; to: number }[];
        await load();
        void refreshMe();
        el.querySelector('#result')!.innerHTML = html`<div class="card fade-in" style="background:rgba(198,255,61,.07);border-color:rgba(198,255,61,.3)">
          <div class="h3 lime">Session complete${r.streak ? ' · regularity bonus' : ''}</div>
          <div class="small" style="margin-top:6px">${ups.length ? html`Level up! ${ups.map((u) => html`<b>${ATTR_LABELS[u.attr]} → ${u.to}</b> `)}` : 'XP banked. Keep it up — the next point is close.'}</div></div>`.html;
        achievementToasts(r.achievements);
        toast(ups.length ? `Level up: ${ups.map((u) => ATTR_LABELS[u.attr]).join(', ')}` : 'Training complete', 'ok');
      } catch (err) {
        toast((err as Error).message, 'err');
        btn.disabled = false;
      }
    }
  });
  el.addEventListener('change', (e) => {
    const s = e.target as HTMLSelectElement;
    if (s.id === 'single' && s.value) {
      focus = s.value;
      el.querySelectorAll('[data-focus]').forEach((b) => b.classList.remove('on'));
    }
  });

  try {
    await load();
  } catch (e) {
    mount(el, errorBox((e as Error).message));
  }
  timer = window.setInterval(() => {
    el.querySelectorAll<HTMLElement>('[data-cd]').forEach((c) => {
      c.textContent = countdown(c.dataset.cd!);
      if (new Date(c.dataset.cd!).getTime() <= Date.now()) void load();
    });
  }, 1000);
  return () => clearInterval(timer);
}
