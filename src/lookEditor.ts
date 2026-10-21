// Appearance editor shared by player creation and the locker.
import { ACCESSORIES, BEARDS, BOOT_COLORS, FACES, HAIR_COLORS, HAIR_STYLES, SKIN_TONES, type Appearance } from '../shared/appearance.ts';
import { html, type Raw } from './dom.ts';

const OPTS: Partial<Record<keyof Appearance, string[]>> = { hair: HAIR_STYLES, beard: BEARDS, face: FACES, accessory: ACCESSORIES };

export function lookEditor(a: Appearance): Raw {
  const stepper = (key: keyof Appearance, label: string) => html`<div class="field"><label>${label}</label>
    <div class="stepper"><button type="button" data-step="${key}" data-d="-1" aria-label="Previous">‹</button><span id="v-${key}">${OPTS[key]![a[key]]}</span><button type="button" data-step="${key}" data-d="1" aria-label="Next">›</button></div></div>`;
  const swatches = (key: keyof Appearance, label: string, colors: string[]) => html`<div class="field"><label>${label}</label><div class="swatches">${colors.map((c, i) => html`<button type="button" class="swatch ${i === a[key] ? 'on' : ''}" data-sw="${key}" data-i="${i}" style="background:${c}" aria-label="${label} ${i + 1}"></button>`)}</div></div>`;
  return html`<div class="stack" style="gap:16px">
    ${swatches('skin', 'Skin tone', SKIN_TONES)}
    ${swatches('hairColor', 'Hair colour', HAIR_COLORS)}
    ${swatches('boots', 'Boots', BOOT_COLORS)}
    <div class="grid cols-2">${stepper('hair', 'Hairstyle')}${stepper('beard', 'Facial hair')}${stepper('face', 'Expression')}${stepper('accessory', 'Accessory')}</div>
  </div>`;
}

/** Applies a click inside the editor to `a`. Returns true when the look changed. */
export function lookClick(root: HTMLElement, target: HTMLElement, a: Appearance): boolean {
  const sw = target.closest('[data-sw]') as HTMLElement | null;
  if (sw) {
    const k = sw.dataset.sw as keyof Appearance;
    a[k] = Number(sw.dataset.i);
    sw.parentElement!.querySelectorAll('.swatch').forEach((b) => b.classList.toggle('on', b === sw));
    return true;
  }
  const st = target.closest('[data-step]') as HTMLElement | null;
  if (st) {
    const k = st.dataset.step as keyof Appearance;
    const opts = OPTS[k]!;
    a[k] = (a[k] + Number(st.dataset.d) + opts.length) % opts.length;
    const v = root.querySelector(`#v-${k}`);
    if (v) v.textContent = opts[a[k]];
    return true;
  }
  return false;
}
