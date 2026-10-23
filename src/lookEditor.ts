// The look studio, shared by player creation and the locker: categories down
// the side, and every option shown as a 3D portrait of you wearing it.
import {
  ACCESSORIES, BEARDS, BOOT_COLORS, BROWS, EYE_COLORS, EYE_COLOR_NAMES, EYES, FACE_SHAPES, FACES, HAIR_COLORS, HAIR_ORDER, HAIR_STYLES,
  HERITAGE, MARKS, MOUTHS, NOSES, SKIN_ORDER, SKIN_TONES, SLIDERS, SLIDER_KEYS, randomAppearance, type Appearance, type SliderKey,
} from '../shared/appearance.ts';
import type { Equipped } from '../shared/cosmetics.ts';
import { html, type Raw } from './dom.ts';
import { icon } from './icons.ts';
import { portraitUrl } from './portrait.ts';

type Key = keyof Appearance;
/** A row of option tiles or swatches, or a set of fine-tuning sliders. */
interface Group { key?: Key; label: string; names?: string[]; colors?: string[]; order?: number[]; sliders?: SliderKey[] }
interface Cat { id: string; label: string; icon: string; focus: 'face' | 'body'; groups: Group[] }

export const LOOK_CATS: Cat[] = [
  { id: 'face', label: 'Face', icon: 'user', focus: 'face', groups: [
    { key: 'heritage', label: 'Heritage', names: HERITAGE },
    { key: 'skin', label: 'Skin tone', colors: SKIN_TONES, order: SKIN_ORDER },
    { key: 'faceShape', label: 'Face shape', names: FACE_SHAPES },
    { label: 'Head and jaw', sliders: ['headW', 'jaw', 'chinL', 'chinP', 'chinW', 'cheekB', 'cheekV', 'earS', 'earOut'] },
  ] },
  { id: 'eyes', label: 'Eyes', icon: 'sparkle', focus: 'face', groups: [
    { key: 'eyes', label: 'Eye shape', names: EYES },
    { key: 'eyeColor', label: 'Eye colour', colors: EYE_COLORS, names: EYE_COLOR_NAMES },
    { key: 'brows', label: 'Brows', names: BROWS },
    { label: 'Fine tune', sliders: ['eyeSize', 'eyeSep', 'eyeY', 'eyeTilt', 'eyeOpen', 'eyeFold', 'browH', 'browA'] },
  ] },
  { id: 'mouth', label: 'Nose & mouth', icon: 'chat', focus: 'face', groups: [
    { key: 'nose', label: 'Nose', names: NOSES },
    { key: 'mouth', label: 'Lips', names: MOUTHS },
    { key: 'face', label: 'Expression', names: FACES },
    { label: 'Fine tune', sliders: ['noseW', 'noseL', 'noseP', 'noseHump', 'noseTip', 'noseUp', 'mouthW', 'lipU', 'lipL'] },
  ] },
  { id: 'hair', label: 'Hair', icon: 'paint', focus: 'face', groups: [
    { key: 'hairColor', label: 'Hair colour', colors: HAIR_COLORS, order: HAIR_ORDER },
    { key: 'hair', label: 'Hairstyle', names: HAIR_STYLES },
  ] },
  { id: 'beard', label: 'Facial hair', icon: 'user', focus: 'face', groups: [
    { key: 'beard', label: 'Facial hair', names: BEARDS },
  ] },
  { id: 'body', label: 'Body', icon: 'dumbbell', focus: 'body', groups: [
    { label: 'Build', sliders: ['muscle', 'mass', 'neckW'] },
  ] },
  { id: 'extras', label: 'Extras', icon: 'shirt', focus: 'body', groups: [
    { key: 'marks', label: 'Marks', names: MARKS },
    { key: 'accessory', label: 'Accessory', names: ACCESSORIES },
    { key: 'boots', label: 'Boot colour', colors: BOOT_COLORS },
  ] },
];

export interface StudioCtx {
  kit: { primary: string; secondary: string };
  eq?: Equipped;
  /** Called after every change. */
  onChange: () => void;
  /** Called when the category changes, so the stage can frame the face or the whole player. */
  onFocus?: (focus: 'face' | 'body') => void;
}

/** Builds the studio inside `host`; it edits `a` in place. */
export function mountLookStudio(host: HTMLElement, a: Appearance, ctx: StudioCtx) {
  let cat = LOOK_CATS[0];
  let gen = 0;

  const tile = (g: Group, i: number) =>
    html`<button type="button" class="lk-tile ${a[g.key!] === i ? 'on' : ''}" data-lk="${g.key}" data-i="${i}" aria-label="${g.label}: ${g.names![i]}"><i class="lk-shot"></i><span>${g.names![i]}</span></button>`;
  const swatch = (g: Group, i: number) =>
    html`<button type="button" class="lk-sw ${a[g.key!] === i ? 'on' : ''}" data-lk="${g.key}" data-i="${i}" style="--c:${g.colors![i]}" aria-label="${g.label} ${g.names?.[i] ?? i + 1}"><i></i></button>`;
  const slider = (k: SliderKey) =>
    html`<label class="lk-sl"><span>${SLIDERS[k]}</span><input type="range" min="0" max="20" step="1" value="${a[k]}" data-sl="${k}" style="--v:${a[k] * 5}%"></label>`;
  const group = (g: Group): Raw => {
    if (g.sliders) {
      return html`<section class="lk-group"><div class="lk-label">${g.label}<button type="button" class="lk-reset" data-reset="${g.sliders.join(',')}">Reset</button></div>
        <div class="lk-sliders">${g.sliders.map(slider)}</div></section>`;
    }
    const idx = g.order ?? (g.colors ?? g.names!).map((_, i) => i);
    return html`<section class="lk-group"><div class="lk-label">${g.label}${g.key === 'beard' ? html` <span class="dim">· follows your hair colour</span>` : ''}</div>
      ${g.colors ? html`<div class="lk-swatches">${idx.map((i) => swatch(g, i))}</div>` : html`<div class="lk-grid">${idx.map((i) => tile(g, i))}</div>`}</section>`;
  };

  const render = () => {
    host.innerHTML = html`<div class="lk">
      <nav class="lk-cats">${LOOK_CATS.map((c) => html`<button type="button" class="lk-cat ${c === cat ? 'on' : ''}" data-cat="${c.id}">${icon(c.icon, 16)}<span>${c.label}</span></button>`)}
        <button type="button" class="lk-cat lk-rand" data-rand>${icon('swap', 16)}<span>Randomise</span></button></nav>
      <div class="lk-body">${cat.groups.map(group)}</div>
    </div>`.html;
    void shoot();
  };

  // Fill each tile with a 3D portrait of you with that option, one at a time.
  const shoot = async () => {
    const run = ++gen;
    const tiles = [...host.querySelectorAll<HTMLElement>('.lk-tile')];
    for (const t of tiles) {
      if (run !== gen) return;
      const k = t.dataset.lk as Key;
      const look = { ...a, [k]: Number(t.dataset.i) };
      // Accessories and boots read better on a plain look; everything else is shown on you.
      try {
        const url = await portraitUrl(look, ctx.kit, 160, ctx.eq);
        if (run !== gen) return;
        const shot = t.querySelector<HTMLElement>('.lk-shot');
        if (shot) shot.style.backgroundImage = `url(${url})`;
      } catch {
        return;
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  };

  const onClick = (e: Event) => {
    const t = e.target as HTMLElement;
    const c = t.closest<HTMLElement>('[data-cat]');
    if (c) {
      cat = LOOK_CATS.find((x) => x.id === c.dataset.cat) ?? cat;
      ctx.onFocus?.(cat.focus);
      render();
      return;
    }
    if (t.closest('[data-rand]')) {
      Object.assign(a, randomAppearance(Math.random), { boots: a.boots, accessory: a.accessory });
      render();
      ctx.onChange();
      return;
    }
    const rs = t.closest<HTMLElement>('[data-reset]');
    if (rs) {
      for (const k of rs.dataset.reset!.split(',') as SliderKey[]) a[k] = k === 'muscle' ? 13 : 10;
      render();
      ctx.onChange();
      return;
    }
    const o = t.closest<HTMLElement>('[data-lk]');
    if (o) {
      const k = o.dataset.lk as Key;
      a[k] = Number(o.dataset.i);
      o.parentElement!.querySelectorAll('[data-lk]').forEach((b) => b.classList.toggle('on', b === o));
      ctx.onChange();
      // Other groups' tiles show you, so refresh them with the new choice.
      if (cat.groups.length > 1 || o.classList.contains('lk-sw')) void shoot();
    }
  };
  // Sliders reshape you live; the stage rebuilds at most once a frame.
  let pending = 0;
  const onInput = (e: Event) => {
    const t = e.target as HTMLInputElement;
    const k = t.dataset.sl as SliderKey | undefined;
    if (!k || !SLIDER_KEYS.includes(k)) return;
    a[k] = Number(t.value);
    t.style.setProperty('--v', `${a[k] * 5}%`);
    if (!pending) pending = requestAnimationFrame(() => {
      pending = 0;
      ctx.onChange();
    });
  };
  host.addEventListener('click', onClick);
  host.addEventListener('input', onInput);
  render();
  ctx.onFocus?.(cat.focus);
  return {
    destroy() {
      gen++;
      cancelAnimationFrame(pending);
      host.removeEventListener('click', onClick);
      host.removeEventListener('input', onInput);
    },
  };
}
