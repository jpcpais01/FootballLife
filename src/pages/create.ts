import { DEFAULT_APPEARANCE, randomAppearance, type Appearance } from '../../shared/appearance.ts';
import { mountLookStudio } from '../lookEditor.ts';
import { generateAttributes, KEY_ATTRS, ATTR_LABELS, overall, POSITION_NAMES, POSITIONS, STARTING_LEVEL, type Position } from '../../shared/attributes.ts';
import { api } from '../api.ts';
import { html, mount } from '../dom.ts';
import { icon } from '../icons.ts';
import { navigate } from '../router.ts';
import { refreshMe } from '../state.ts';
import { posChip } from '../components.ts';
import type { Turntable } from '../viewer/turntable.ts';

const BLURB: Record<Position, string> = {
  GK: 'Last line of defence. Reflexes and command of the box.',
  CB: 'Reads the game, wins duels, rules the air.',
  FB: 'Up and down the flank all match. Pace and crosses.',
  DM: 'Breaks up play and recycles possession.',
  CM: 'The engine. Passing, vision and decisions.',
  AM: 'Unlocks defences with the killer pass.',
  WG: 'Beats players one-on-one and creates chances.',
  ST: 'Lives in the box. Goals are your currency.',
};

export async function createPage(el: HTMLElement) {
  const a: Appearance = { ...DEFAULT_APPEARANCE, ...randomAppearance(Math.random), accessory: 0, marks: 0 };
  let pos: Position = 'CM';
  let name = '';
  let step: 1 | 2 = 1;
  let tt: Turntable | null = null;
  let disposed = false;

  const kit = { primary: '#1a1f24', secondary: '#c6ff3d' };

  mount(el, html`<div class="creator">
    <div class="cr-stage">
      <div id="tt" class="tt-host"></div>
      <div class="cr-card">
        <div class="row" style="gap:10px"><div class="big-ovr" id="ovr">--</div><div><div id="pchip"></div><div class="pname" id="pname">Your name</div></div></div>
      </div>
      <div class="tiny dim stage-hint">Drag to turn</div>
    </div>
    <div class="cr-side">
      <div class="cr-head">
        <div><div class="eyebrow">Create your footballer</div><div class="h2" id="steptitle">Your look</div></div>
        <div class="cr-steps"><button class="on" data-step="1">1 · Look</button><button data-step="2">2 · Position</button></div>
      </div>
      <div id="s1" class="cr-pane"><div id="lk"></div></div>
      <div id="s2" class="cr-pane" hidden>
        <div class="field"><label>Name</label><input class="input" id="name" placeholder="e.g. Rui Mendes" maxlength="24" autocomplete="off"></div>
        <div class="label" style="margin:14px 0 8px">Position</div>
        <div class="pos-grid">${POSITIONS.map((p) => html`<button type="button" class="pos-card ${p === pos ? 'on' : ''}" data-pos="${p}">${posChip(p)}<div class="t">${POSITION_NAMES[p]}</div><div class="d">${BLURB[p]}</div></button>`)}</div>
        <div id="keys" style="margin-top:14px"></div>
      </div>
      <div class="cr-foot">
        <div class="small" id="err" style="color:var(--red);min-height:18px;flex:1"></div>
        <button class="btn primary" id="next">Next ${icon('arrow', 16)}</button>
        <button class="btn primary" id="go" hidden>Start my career</button>
      </div>
    </div>
  </div>`);

  const update = () => {
    const attrs = generateAttributes(pos, STARTING_LEVEL, 'preview', 0);
    el.querySelector('#ovr')!.textContent = String(overall(attrs, pos));
    el.querySelector('#pchip')!.innerHTML = posChip(pos).html;
    el.querySelector('#pname')!.textContent = name || 'Your name';
    el.querySelector('#keys')!.innerHTML = html`<div class="label" style="margin-bottom:8px">Key attributes · ${POSITION_NAMES[pos]}</div><div class="grid cols-2" style="gap:8px 18px">${KEY_ATTRS[pos].map((k) => html`<div class="attr key"><span class="n">${ATTR_LABELS[k]}</span><span class="v">~${attrs[k]}</span><div class="bar"><i style="width:${attrs[k]}%"></i></div></div>`)}</div>`.html;
  };
  const refresh3d = () => tt?.set(a, {}, kit, pos === 'GK');
  update();

  const setStep = (s: 1 | 2) => {
    step = s;
    el.querySelector<HTMLElement>('#s1')!.hidden = s !== 1;
    el.querySelector<HTMLElement>('#s2')!.hidden = s !== 2;
    el.querySelector<HTMLElement>('#next')!.hidden = s !== 1;
    el.querySelector<HTMLElement>('#go')!.hidden = s !== 2;
    el.querySelector('#steptitle')!.textContent = s === 1 ? 'Your look' : 'Name and position';
    el.querySelectorAll<HTMLElement>('[data-step]').forEach((b) => b.classList.toggle('on', Number(b.dataset.step) === s));
    tt?.focus(s === 1 ? 'face' : 'body');
    if (s === 2) setTimeout(() => el.querySelector<HTMLInputElement>('#name')?.focus(), 50);
  };

  const studio = mountLookStudio(el.querySelector<HTMLElement>('#lk')!, a, {
    kit,
    onChange: refresh3d,
    onFocus: (m) => { if (step === 1) tt?.focus(m); },
  });

  // The 3D preview loads after the page is up.
  void (async () => {
    try {
      const { createTurntable } = await import('../viewer/turntable.ts');
      if (disposed) return;
      tt = createTurntable(el.querySelector<HTMLElement>('#tt')!);
      refresh3d();
      tt.focus(step === 1 ? 'face' : 'body');
    } catch {
      el.querySelector('#tt')!.innerHTML = html`<div class="empty small">3D preview is not available on this device.</div>`.html;
    }
  })();

  el.addEventListener('input', (e) => {
    if ((e.target as HTMLElement).id === 'name') {
      name = (e.target as HTMLInputElement).value;
      update();
    }
  });
  el.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const st = t.closest<HTMLElement>('[data-step]');
    if (st) return setStep(Number(st.dataset.step) as 1 | 2);
    if (t.closest('#next')) return setStep(2);
    const pc = t.closest('[data-pos]') as HTMLElement | null;
    if (pc) {
      pos = pc.dataset.pos as Position;
      el.querySelectorAll('.pos-card').forEach((b) => b.classList.toggle('on', b === pc));
      update();
      refresh3d();
    }
    if (t.closest('#go')) {
      const btn = el.querySelector<HTMLButtonElement>('#go')!;
      btn.disabled = true;
      try {
        await api.post('/api/player', { name, position: pos, appearance: a });
        await refreshMe();
        navigate('/', true);
      } catch (err) {
        el.querySelector('#err')!.textContent = (err as Error).message;
      } finally {
        btn.disabled = false;
      }
    }
  });

  return () => {
    disposed = true;
    studio.destroy();
    tt?.dispose();
  };
}
