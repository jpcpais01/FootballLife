// Club identity editor: name, kit colours and every badge option. Shared by
// founding a club and editing it later.
import {
  BADGE_BORDERS, BADGE_COLOR_SLOTS, BADGE_ICONS, BADGE_PATTERNS, BADGE_SHAPES, BADGE_STARS_MAX, BADGE_TEXT_MAX, BADGE_TEXT_POS,
  fullBadge, type Badge, type BadgeColorKey,
} from '../shared/badge.ts';
import { badgeSvg, readableOn } from './art.ts';
import { esc, html, raw, type Raw } from './dom.ts';
import { icon } from './icons.ts';

export interface ClubDraft {
  name: string;
  short: string;
  primary: string;
  secondary: string;
  badge: Badge;
}

export const PALETTE = [
  '#c6ff3d', '#16a34a', '#065f46', '#14b8a6', '#0ea5e9', '#1e6bff', '#1e3a8a', '#0b1b3f',
  '#7a1fd1', '#c026d3', '#e11d48', '#d7263d', '#7f1d1d', '#ff7a1a', '#facc15', '#f2c14e',
  '#b08d57', '#8b5a2b', '#f5f5f5', '#cbd5e1', '#64748b', '#334155', '#1f2937', '#111111',
];

type Section = 'identity' | 'shape' | 'emblem' | 'pattern' | 'colours' | 'text';
const SECTIONS: { id: Section; label: string }[] = [
  { id: 'identity', label: 'Club' },
  { id: 'shape', label: 'Shape' },
  { id: 'emblem', label: 'Emblem' },
  { id: 'pattern', label: 'Pattern' },
  { id: 'colours', label: 'Colours' },
  { id: 'text', label: 'Text' },
];

const SLIDERS: { key: 'iconScale' | 'iconX' | 'iconY' | 'iconRot'; label: string; min: number; max: number; unit: string }[] = [
  { key: 'iconScale', label: 'Size', min: 40, max: 160, unit: '%' },
  { key: 'iconX', label: 'Left / right', min: -25, max: 25, unit: '' },
  { key: 'iconY', label: 'Up / down', min: -25, max: 25, unit: '' },
  { key: 'iconRot', label: 'Tilt', min: -180, max: 180, unit: '°' },
];

const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

/**
 * Mounts the editor into `el`. The draft is edited in place; `onChange` runs
 * after every edit. Returns a function that re-renders everything.
 */
export function mountBadgeEditor(el: HTMLElement, d: ClubDraft, onChange: () => void = () => {}) {
  let section: Section = 'identity';
  let slot: BadgeColorKey = 'base';
  const kit = () => ({ primary: d.primary, secondary: d.secondary });
  const full = () => fullBadge(d.badge, kit());
  const autoText = () => {
    const b = full();
    return readableOn(b.textPos === 1 ? b.borderColor : b.textPos === 3 ? b.accent : b.base);
  };
  const tile = (b: Partial<Badge>, label: string, on: boolean, attrs: string) =>
    `<button type="button" class="be-tile ${on ? 'on' : ''}" ${attrs} aria-label="${esc(label)}" title="${esc(label)}">${badgeSvg(kit(), { ...d.badge, ...b }, 52, d.short).html}<span>${esc(label)}</span></button>`;
  const swatches = (cur: string, attr: string) => html`<div class="swatches be-swatches">${PALETTE.map((c) => html`<button type="button" class="swatch ${c === cur.toLowerCase() ? 'on' : ''}" ${raw(attr)} data-v="${c}" style="background:${c}" aria-label="${c}"></button>`)}
    <label class="swatch be-custom" style="background:${cur}" aria-label="Custom colour">${icon('paint', 16)}<input type="color" ${raw(attr)} value="${cur}"></label></div>`;

  const sectionBody = (): Raw => {
    const b = full();
    switch (section) {
      case 'identity': return html`<div class="stack" style="gap:14px">
        <div class="grid cols-2">
          <div class="field"><label>Club name</label><input class="input" name="name" maxlength="24" value="${d.name}" placeholder="e.g. Lime Rockets" autocomplete="off"></div>
          <div class="field"><label>Short name</label><input class="input" name="short" maxlength="4" value="${d.short}" placeholder="LRK" style="text-transform:uppercase" autocomplete="off"></div>
        </div>
        <div class="field"><label>Home kit · main</label>${swatches(d.primary, 'data-kit="primary"')}</div>
        <div class="field"><label>Home kit · trim</label>${swatches(d.secondary, 'data-kit="secondary"')}</div>
        <p class="tiny muted" style="margin:0">Badge colours follow the kit until you pick your own under Colours.</p>
      </div>`;
      case 'shape': return html`<div class="stack" style="gap:14px">
        <div class="be-grid">${raw(BADGE_SHAPES.map((s, i) => tile({ shape: i }, s.name, i === b.shape, `data-set="shape" data-n="${i}"`)).join(''))}</div>
        <div class="field"><label>Border</label><div class="be-grid">${raw(BADGE_BORDERS.map((n, i) => tile({ border: i }, n, i === b.border, `data-set="border" data-n="${i}"`)).join(''))}</div></div>
        <div class="field"><label>Finish</label><div class="seg"><button type="button" class="${b.gloss ? 'on' : ''}" data-gloss="1">Glossy</button><button type="button" class="${b.gloss ? '' : 'on'}" data-gloss="0">Flat</button></div></div>
      </div>`;
      case 'emblem': return html`<div class="stack" style="gap:14px">
        <div class="be-grid">${raw(BADGE_ICONS.map((s, i) => tile({ icon: i }, s.name, i === b.icon, `data-set="icon" data-n="${i}"`)).join(''))}</div>
        <div class="be-sliders">${SLIDERS.map((s) => html`<label class="be-slider"><span>${s.label}</span>
          <input type="range" min="${s.min}" max="${s.max}" value="${b[s.key]}" data-range="${s.key}"><b id="rv-${s.key}">${b[s.key]}${s.unit}</b></label>`)}</div>
        <div><button type="button" class="btn sm ghost" id="be-center">Reset size and position</button></div>
      </div>`;
      case 'pattern': return html`<div class="be-grid">${raw(BADGE_PATTERNS.map((n, i) => tile({ pattern: i }, n, i === b.pattern, `data-set="pattern" data-n="${i}"`)).join(''))}</div>`;
      case 'colours': return html`<div class="stack" style="gap:14px">
        <div class="be-slots">${BADGE_COLOR_SLOTS.map((s) => html`<button type="button" class="be-slot ${s.key === slot ? 'on' : ''}" data-slot="${s.key}"><i style="background:${b[s.key] || autoText()}"></i>${s.label}${d.badge[s.key] ? '' : html`<em>${s.key === 'textColor' ? 'auto' : s.key === 'accent' ? 'gold' : 'kit'}</em>`}</button>`)}</div>
        ${swatches(b[slot] || autoText(), 'data-color="1"')}
        <div class="row wrap"><button type="button" class="btn sm ghost" id="be-swap">Swap field and pattern</button><button type="button" class="btn sm ghost" id="be-kit">Match the kit</button><button type="button" class="btn sm ghost" id="be-auto">Automatic text colour</button></div>
      </div>`;
      case 'text': return html`<div class="stack" style="gap:14px">
        <div class="field"><label>Badge text</label><input class="input" name="btext" maxlength="${BADGE_TEXT_MAX}" value="${b.text}" placeholder="e.g. EST 2026" style="text-transform:uppercase" autocomplete="off"></div>
        <div class="row wrap"><button type="button" class="btn sm ghost" data-quick="name">Club name</button><button type="button" class="btn sm ghost" data-quick="est">Est. year</button><button type="button" class="btn sm ghost" data-quick="fc">Football Club</button></div>
        <div class="field"><label>Placement</label><div class="be-grid">${raw(BADGE_TEXT_POS.map((n, i) => tile({ textPos: i, text: b.text || d.short || 'FC' }, n, i === b.textPos, `data-set="textPos" data-n="${i}"`)).join(''))}</div></div>
        <div class="field"><label>Stars</label><div class="seg">${Array.from({ length: BADGE_STARS_MAX + 1 }, (_, i) => html`<button type="button" class="${i === b.stars ? 'on' : ''}" data-set="stars" data-n="${i}">${i === 0 ? 'None' : String(i)}</button>`)}</div></div>
      </div>`;
    }
  };

  const preview = () => {
    const p = el.querySelector('#be-prev');
    if (p) p.innerHTML = badgeSvg(kit(), d.badge, 180, d.short).html;
    const m = el.querySelector('#be-mini');
    if (m) m.innerHTML = [64, 40, 24].map((s) => badgeSvg(kit(), d.badge, s, d.short).html).join('');
    const n = el.querySelector('#be-name');
    if (n) n.textContent = d.name || 'Your club';
    const s = el.querySelector('#be-short');
    if (s) s.textContent = (d.short || '---').toUpperCase();
  };
  const body = () => {
    const box = el.querySelector('#be-body');
    if (box) box.innerHTML = sectionBody().html;
  };
  const changed = (all = true) => {
    preview();
    if (all) body();
    onChange();
  };

  const render = () => {
    el.innerHTML = html`<div class="be">
      <div class="be-side card hero-card">
        <div class="be-prev" id="be-prev"></div>
        <div class="be-id"><div class="h2 ellipsis" id="be-name"></div><span class="chip" id="be-short"></span></div>
        <div class="be-mini" id="be-mini"></div>
        <div class="row" style="gap:8px"><button type="button" class="btn sm" id="be-shuffle">${icon('sparkle', 15)} Shuffle</button><button type="button" class="btn sm ghost" id="be-reset">Reset</button></div>
      </div>
      <div class="be-main">
        <div class="tabs be-tabs">${SECTIONS.map((s) => html`<button type="button" class="${s.id === section ? 'on' : ''}" data-sec="${s.id}">${s.label}</button>`)}</div>
        <div class="card be-body" id="be-body"></div>
      </div>
    </div>`.html;
    preview();
    body();
  };

  const initial = structuredClone(d);

  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const sec = t.closest('[data-sec]') as HTMLElement | null;
    if (sec) {
      section = sec.dataset.sec as Section;
      el.querySelectorAll('[data-sec]').forEach((b) => b.classList.toggle('on', b === sec));
      return body();
    }
    const set = t.closest('[data-set]') as HTMLElement | null;
    if (set) {
      const k = set.dataset.set as 'shape' | 'icon' | 'pattern' | 'border' | 'textPos' | 'stars';
      d.badge[k] = Number(set.dataset.n);
      if (k === 'textPos' && d.badge.textPos && !d.badge.text) d.badge.text = (d.name || d.short || 'FC').toUpperCase().slice(0, BADGE_TEXT_MAX);
      return changed();
    }
    const kitSw = t.closest('button[data-kit]') as HTMLElement | null;
    if (kitSw) { d[kitSw.dataset.kit as 'primary' | 'secondary'] = kitSw.dataset.v!; return changed(); }
    const colSw = t.closest('button[data-color]') as HTMLElement | null;
    if (colSw) { d.badge[slot] = colSw.dataset.v!; return changed(); }
    const sl = t.closest('[data-slot]') as HTMLElement | null;
    if (sl) { slot = sl.dataset.slot as BadgeColorKey; return body(); }
    const gl = t.closest('[data-gloss]') as HTMLElement | null;
    if (gl) { d.badge.gloss = gl.dataset.gloss === '1'; return changed(); }
    const q = t.closest('[data-quick]') as HTMLElement | null;
    if (q) {
      const v = q.dataset.quick;
      d.badge.text = (v === 'name' ? d.name || 'My club' : v === 'est' ? `EST ${new Date().getFullYear()}` : 'FOOTBALL CLUB').toUpperCase().slice(0, BADGE_TEXT_MAX);
      if (!d.badge.textPos) d.badge.textPos = 3;
      return changed();
    }
    if (t.closest('#be-center')) {
      Object.assign(d.badge, { iconScale: 100, iconX: 0, iconY: 0, iconRot: 0 });
      return changed();
    }
    if (t.closest('#be-swap')) {
      const b = full();
      d.badge.base = b.patternColor;
      d.badge.patternColor = b.base;
      return changed();
    }
    if (t.closest('#be-auto')) {
      delete d.badge.textColor;
      return changed();
    }
    if (t.closest('#be-kit')) {
      for (const s of BADGE_COLOR_SLOTS) delete d.badge[s.key];
      return changed();
    }
    if (t.closest('#be-shuffle')) {
      Object.assign(d.badge, {
        shape: Math.floor(Math.random() * BADGE_SHAPES.length),
        icon: Math.floor(Math.random() * BADGE_ICONS.length),
        pattern: Math.floor(Math.random() * BADGE_PATTERNS.length),
        border: 1 + Math.floor(Math.random() * (BADGE_BORDERS.length - 1)),
        stars: pick([0, 0, 0, 1, 2, 3, 5]),
        iconScale: 100, iconX: 0, iconY: 0, iconRot: 0,
      });
      for (const s of BADGE_COLOR_SLOTS) delete d.badge[s.key];
      if (Math.random() < 0.5) d.badge.accent = pick(['#f2c14e', '#f5f5f5', '#b08d57', d.secondary]);
      return changed();
    }
    if (t.closest('#be-reset')) {
      Object.assign(d, structuredClone(initial));
      render();
      return onChange();
    }
  });

  el.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'name') { d.name = t.value; return changed(false); }
    if (t.name === 'short') { d.short = t.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); return changed(false); }
    if (t.name === 'btext') { d.badge.text = t.value.toUpperCase(); return changed(false); }
    if (t.dataset.range) {
      const k = t.dataset.range as (typeof SLIDERS)[number]['key'];
      d.badge[k] = Number(t.value);
      const s = SLIDERS.find((x) => x.key === k)!;
      const v = el.querySelector(`#rv-${k}`);
      if (v) v.textContent = `${t.value}${s.unit}`;
      return changed(false);
    }
    if (t.type === 'color') {
      const label = t.closest('.be-custom') as HTMLElement | null;
      if (label) label.style.background = t.value;
      if (t.dataset.kit) d[t.dataset.kit as 'primary' | 'secondary'] = t.value;
      else if (t.dataset.color) d.badge[slot] = t.value;
      return changed(false);
    }
  });
  // Colour pickers redraw the tiles once the pick is done.
  el.addEventListener('change', (e) => {
    if ((e.target as HTMLInputElement).type === 'color') body();
  });

  render();
  return render;
}
