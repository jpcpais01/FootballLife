import { ACCESSORIES, BEARDS, FACES, HAIR_COLORS, HAIR_STYLES, SKIN_TONES, BOOT_COLORS, DEFAULT_APPEARANCE, type Appearance } from '../../shared/appearance.ts';
import { generateAttributes, KEY_ATTRS, ATTR_LABELS, overall, POSITION_NAMES, POSITIONS, STARTING_LEVEL, type Position } from '../../shared/attributes.ts';
import { api } from '../api.ts';
import { avatarSvg, brandMark } from '../art.ts';
import { html, mount } from '../dom.ts';
import { navigate } from '../router.ts';
import { refreshMe } from '../state.ts';
import { posChip } from '../components.ts';

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
  const a: Appearance = { ...DEFAULT_APPEARANCE, skin: Math.floor(Math.random() * 6), hair: Math.floor(Math.random() * 9), hairColor: Math.floor(Math.random() * 5) };
  let pos: Position = 'CM';
  let name = '';

  const kit = { primary: '#1a1f24', secondary: '#c6ff3d' };
  const stepper = (key: keyof Appearance, label: string, opts: string[]) => html`<div class="field"><label>${label}</label>
    <div class="stepper"><button type="button" data-step="${key}" data-d="-1">‹</button><span id="v-${key}">${opts[a[key]]}</span><button type="button" data-step="${key}" data-d="1">›</button></div></div>`;

  mount(el, html`<div style="max-width:1100px;margin:0 auto;padding:28px 16px 60px">
    <div class="row" style="margin-bottom:26px">${brandMark(34)}<span class="wordmark">FOOTBAL<b>LIFE</b></span></div>
    <div class="eyebrow">Step 1 of 1</div>
    <div class="h1" style="margin:6px 0 24px">Create your footballer</div>
    <div class="dash">
      <div class="span-5">
        <div class="pcard" style="position:sticky;top:20px">
          <div class="row between">
            <div><div class="big-ovr" id="ovr">--</div><div id="pchip" style="margin-top:6px"></div></div>
            <div id="av"></div>
          </div>
          <div class="pname" id="pname" style="margin-top:14px">Your name</div>
          <div class="muted small" id="pdesc" style="margin:4px 0 14px"></div>
          <div id="keys"></div>
          <p class="tiny muted" style="margin:14px 0 0">Everyone starts modest and balanced. Train, play and grow.</p>
        </div>
      </div>
      <div class="span-7 stack" style="gap:18px">
        <div class="card stack" style="gap:14px">
          <div class="h2">Name</div>
          <input class="input" id="name" placeholder="e.g. Rui Mendes" maxlength="24" autocomplete="off">
        </div>
        <div class="card">
          <div class="h2" style="margin-bottom:12px">Position</div>
          <div class="pos-grid">${POSITIONS.map((p) => html`<button type="button" class="pos-card ${p === pos ? 'on' : ''}" data-pos="${p}">${posChip(p)}<div class="t">${POSITION_NAMES[p]}</div><div class="d">${BLURB[p]}</div></button>`)}</div>
        </div>
        <div class="card stack" style="gap:16px">
          <div class="h2">Look</div>
          <div class="field"><label>Skin tone</label><div class="swatches">${SKIN_TONES.map((c, i) => html`<button type="button" class="swatch ${i === a.skin ? 'on' : ''}" data-sw="skin" data-i="${i}" style="background:${c}" aria-label="Skin tone ${i + 1}"></button>`)}</div></div>
          <div class="field"><label>Hair colour</label><div class="swatches">${HAIR_COLORS.map((c, i) => html`<button type="button" class="swatch ${i === a.hairColor ? 'on' : ''}" data-sw="hairColor" data-i="${i}" style="background:${c}" aria-label="Hair colour ${i + 1}"></button>`)}</div></div>
          <div class="field"><label>Boots</label><div class="swatches">${BOOT_COLORS.map((c, i) => html`<button type="button" class="swatch ${i === a.boots ? 'on' : ''}" data-sw="boots" data-i="${i}" style="background:${c}" aria-label="Boot colour ${i + 1}"></button>`)}</div></div>
          <div class="grid cols-2">
            ${stepper('hair', 'Hairstyle', HAIR_STYLES)}
            ${stepper('beard', 'Facial hair', BEARDS)}
            ${stepper('face', 'Expression', FACES)}
            ${stepper('accessory', 'Accessory', ACCESSORIES)}
          </div>
        </div>
        <div class="small" id="err" style="color:var(--red);min-height:18px"></div>
        <button class="btn primary block" id="go" style="height:52px;font-size:16px">Start my career</button>
      </div>
    </div>
  </div>`);

  const opts: Record<string, string[]> = { hair: HAIR_STYLES, beard: BEARDS, face: FACES, accessory: ACCESSORIES };
  const update = () => {
    const attrs = generateAttributes(pos, STARTING_LEVEL, 'preview', 0);
    el.querySelector('#ovr')!.textContent = String(overall(attrs, pos));
    el.querySelector('#pchip')!.innerHTML = posChip(pos).html;
    el.querySelector('#av')!.innerHTML = avatarSvg(a, kit, 120).html;
    el.querySelector('#pname')!.textContent = name || 'Your name';
    el.querySelector('#pdesc')!.textContent = POSITION_NAMES[pos];
    el.querySelector('#keys')!.innerHTML = html`<div class="label" style="margin-bottom:8px">Key attributes</div><div class="stack" style="gap:8px">${KEY_ATTRS[pos].map((k) => html`<div class="attr key"><span class="n">${ATTR_LABELS[k]}</span><span class="v">~${attrs[k]}</span><div class="bar"><i style="width:${attrs[k]}%"></i></div></div>`)}</div>`.html;
    for (const k of Object.keys(opts)) el.querySelector(`#v-${k}`)!.textContent = opts[k][a[k as keyof Appearance]];
  };
  update();

  el.addEventListener('input', (e) => {
    if ((e.target as HTMLElement).id === 'name') {
      name = (e.target as HTMLInputElement).value;
      update();
    }
  });
  el.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const pc = t.closest('[data-pos]') as HTMLElement | null;
    if (pc) {
      pos = pc.dataset.pos as Position;
      el.querySelectorAll('.pos-card').forEach((b) => b.classList.toggle('on', b === pc));
      update();
    }
    const sw = t.closest('[data-sw]') as HTMLElement | null;
    if (sw) {
      const k = sw.dataset.sw as keyof Appearance;
      a[k] = Number(sw.dataset.i);
      sw.parentElement!.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', b === sw));
      update();
    }
    const st = t.closest('[data-step]') as HTMLElement | null;
    if (st) {
      const k = st.dataset.step as keyof Appearance;
      const n = opts[k].length;
      a[k] = (a[k] + Number(st.dataset.d) + n) % n;
      update();
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
}
