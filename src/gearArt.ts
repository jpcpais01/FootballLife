// Vector art for cosmetic items: portrait overlays, shop thumbnails and
// profile card backdrops.
import { RARITY_COLORS, type Item } from '../shared/cosmetics.ts';
import { esc, raw, type Raw } from './dom.ts';

let uid = 0;

function metalGrad(id: string, base: string) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".25" stop-color="${base}"/><stop offset=".6" stop-color="${base}"/><stop offset=".8" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="${base}"/></linearGradient>`;
}

/** Torso for an off-pitch outfit, drawn in the shop's item art (shoulders from y≈72). */
export function outfitBody(it: Item, _id = ""): string {
  const c1 = esc(it.c1 ?? '#333');
  const c2 = esc(it.c2 ?? '#fff');
  const body = `<path d="M12 104 C14 80 30 71 50 71 C70 71 86 80 88 104 Z" fill="${c1}"/>`;
  switch (it.style) {
    case 'tee':
      return `${body}<path d="M40 72 Q50 79 60 72" stroke="${c2}" stroke-width="3" fill="none"/>`;
    case 'hoodie':
      return `<path d="M30 76 C30 64 40 60 50 60 C60 60 70 64 70 76" fill="${c1}" stroke="rgba(0,0,0,.25)" stroke-width="1"/>${body}
        <path d="M38 73 Q50 84 62 73" stroke="rgba(0,0,0,.35)" stroke-width="2" fill="none"/>
        <path d="M45 78 L44 92 M55 78 L56 92" stroke="${c2}" stroke-width="2" stroke-linecap="round"/><circle cx="44" cy="93" r="1.6" fill="${c2}"/><circle cx="56" cy="93" r="1.6" fill="${c2}"/>
        <path d="M34 96 H66" stroke="rgba(0,0,0,.25)" stroke-width="2"/>`;
    case 'track':
      return `${body}<path d="M50 74 V104" stroke="rgba(0,0,0,.4)" stroke-width="1.6"/><path d="M41 72 L50 80 L59 72" fill="none" stroke="${c2}" stroke-width="3"/>
        <path d="M17 90 C20 82 26 77 32 75" stroke="${c2}" stroke-width="2.4" fill="none"/><path d="M20 94 C23 85 29 80 35 77" stroke="${c2}" stroke-width="2.4" fill="none"/>
        <path d="M83 90 C80 82 74 77 68 75" stroke="${c2}" stroke-width="2.4" fill="none"/><path d="M80 94 C77 85 71 80 65 77" stroke="${c2}" stroke-width="2.4" fill="none"/>`;
    case 'bomber':
      return `${body}<path d="M38 72 Q50 80 62 72 L62 76 Q50 84 38 76 Z" fill="${c2}"/><path d="M50 79 V104" stroke="rgba(0,0,0,.35)" stroke-width="1.6"/>
        <path d="M24 84 Q28 92 26 104" stroke="rgba(255,255,255,.25)" stroke-width="3" fill="none"/>`;
    case 'puffer':
      return `<path d="M10 104 C12 78 28 68 50 68 C72 68 88 78 90 104 Z" fill="${c1}"/>
        <path d="M18 86 Q50 80 82 86 M14 96 Q50 90 86 96" stroke="${c2}" stroke-width="2" fill="none"/>
        <path d="M37 66 Q50 74 63 66 L64 74 Q50 82 36 74 Z" fill="${c1}" stroke="${c2}" stroke-width="1.5"/><path d="M50 76 V104" stroke="${c2}" stroke-width="1.6"/>`;
    case 'suit':
      return `${body}<path d="M42 72 L50 92 L58 72 Z" fill="${c2}"/><path d="M42 72 L50 92 L40 104 L32 80 Z M58 72 L50 92 L60 104 L68 80 Z" fill="${c1}" stroke="rgba(255,255,255,.18)" stroke-width="1"/>
        <path d="M45 76 L50 78.5 L55 76 L55 80 L50 78.5 L45 80 Z" fill="#0b0b0b"/><circle cx="50" cy="96" r="1.4" fill="${c2}"/>`;
    default:
      return body;
  }
}

export function cardBackground(it?: Item): string {
  if (!it) return 'linear-gradient(160deg, #1c2228, #121518)';
  const a = it.c1!;
  const b = it.c2!;
  switch (it.style) {
    case 'carbon':
      return `repeating-linear-gradient(45deg, ${a} 0 6px, ${b} 6px 12px), ${a}`;
    case 'wave':
      return `radial-gradient(120% 60% at 0% 100%, ${b}55, transparent 60%), radial-gradient(90% 50% at 100% 0%, ${b}33, transparent 60%), ${a}`;
    case 'night':
      return `radial-gradient(40% 30% at 15% 0%, ${b}66, transparent 70%), radial-gradient(40% 30% at 85% 0%, ${b}66, transparent 70%), linear-gradient(180deg, ${a}, #050a14)`;
    case 'holo':
      return `linear-gradient(115deg, ${a}55, #ffffff22 30%, ${b}55 55%, #fff27a44 80%, ${a}55), #161a22`;
    case 'gold':
      return `radial-gradient(80% 60% at 50% 0%, ${b}88, transparent 70%), linear-gradient(160deg, #5a420c, ${a})`;
    default:
      return a;
  }
}

/** Square thumbnail for the shop and locker. */
export function itemArt(it: Item, size = 96): Raw {
  const id = `it${uid++}`;
  const rc = RARITY_COLORS[it.rarity];
  const c1 = esc(it.c1 ?? '#ccc');
  const c2 = esc(it.c2 ?? '#888');
  const f = it.metal ? `url(#${id}m)` : c1;
  let body = '';
  switch (it.slot) {
    case 'boots':
      body = `<g transform="translate(6 18)">
        <path d="M12 46 C10 34 14 22 24 20 L40 18 C46 30 54 34 70 36 C80 37 86 42 86 50 L86 54 L14 54 Z" fill="${f}" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
        <path d="M14 54 H86 V58 C86 60 84 62 82 62 H18 C16 62 14 60 14 58 Z" fill="${c2}"/>
        <path d="M22 62 v4 M34 62 v4 M60 62 v4 M74 62 v4" stroke="${c2}" stroke-width="3" stroke-linecap="round"/>
        <path d="M30 26 L48 40 M28 32 L44 44" stroke="rgba(255,255,255,.55)" stroke-width="2"/>
        <path d="M42 36 C54 44 66 44 80 42" stroke="${c2}" stroke-width="3" fill="none" opacity=".8"/></g>`;
      break;
    case 'head':
      body = it.style === 'alice'
        ? `<ellipse cx="50" cy="52" rx="30" ry="22" fill="none" stroke="${f}" stroke-width="4"/>`
        : `<ellipse cx="50" cy="54" rx="30" ry="20" fill="none" stroke="${f}" stroke-width="12"/><ellipse cx="50" cy="54" rx="30" ry="20" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2" transform="translate(0 -4)"/>${it.c2 ? `<ellipse cx="50" cy="54" rx="30" ry="20" fill="none" stroke="${c2}" stroke-width="3"/>` : ''}`;
      break;
    case 'neck':
      body = it.style === 'snood'
        ? `<path d="M22 36 Q50 52 78 36 L80 62 Q50 80 20 62 Z" fill="${c1}"/><path d="M22 46 Q50 62 78 46" stroke="rgba(255,255,255,.12)" stroke-width="3" fill="none"/>`
        : it.style === 'medal'
          ? `<path d="M30 14 L50 54 L70 14" stroke="${c2}" stroke-width="9" fill="none"/><circle cx="50" cy="64" r="18" fill="${f}" stroke="rgba(0,0,0,.3)" stroke-width="2"/><path d="M50 52 L53.6 59.4 L61.6 60.4 L55.6 65.8 L57.2 73.8 L50 69.8 L42.8 73.8 L44.4 65.8 L38.4 60.4 L46.4 59.4 Z" fill="rgba(0,0,0,.22)"/>`
          : `<path d="M20 30 Q50 86 80 30" stroke="${f}" stroke-width="6" stroke-dasharray="7 3" fill="none"/>`;
      break;
    case 'wrist':
      body = `<rect x="26" y="34" width="48" height="32" rx="10" fill="${f}"/><rect x="26" y="40" width="48" height="3" fill="rgba(0,0,0,.15)"/><rect x="26" y="57" width="48" height="3" fill="rgba(0,0,0,.15)"/>`;
      break;
    case 'outfit':
      body = `<g transform="translate(0 -18) scale(1)">${outfitBody(it, id)}</g>`;
      break;
    case 'card':
      body = `<foreignObject x="22" y="12" width="56" height="76"><div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;border-radius:8px;background:${esc(cardBackground(it))};box-shadow:0 0 0 1px rgba(255,255,255,.2) inset"></div></foreignObject>`;
      break;
    case 'celebration': {
      const pose: Record<string, string> = {
        slide: '<circle cx="58" cy="30" r="7"/><path d="M56 38 L48 58 L30 66 M50 50 L70 44 M50 50 L40 36 M48 58 L68 68"/>',
        plane: '<circle cx="50" cy="26" r="7"/><path d="M50 34 V60 M22 40 L78 48 M50 60 L40 80 M50 60 L60 80"/>',
        spin: '<circle cx="50" cy="24" r="7"/><path d="M50 32 V58 M50 40 L34 30 M50 40 L66 30 M50 58 L42 78 M50 58 L58 78"/><path d="M24 70 A30 12 0 1 0 76 70" stroke-dasharray="3 4"/>',
        flip: '<circle cx="46" cy="62" r="7"/><path d="M48 54 L56 34 M52 44 L36 40 M52 44 L66 50 M56 34 L44 22 M56 34 L70 26"/><path d="M20 50 A30 30 0 0 1 80 50" stroke-dasharray="3 4"/>',
      };
      body = `<g fill="none" stroke="${rc}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${pose[it.style ?? ''] ?? ''}</g>`;
      break;
    }
    case 'title':
      body = `<rect x="10" y="38" width="80" height="24" rx="12" fill="rgba(255,255,255,.06)" stroke="${rc}" stroke-width="1.5"/><text x="50" y="54.5" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-style="italic" font-size="${it.name.length > 14 ? 10 : 13}" fill="${rc}">${esc(it.name.toUpperCase())}</text>`;
      break;
  }
  return raw(`<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
    <defs>${it.metal ? metalGrad(`${id}m`, it.c1 ?? '#ccc') : ''}<radialGradient id="${id}g" cx=".5" cy=".55" r=".55"><stop offset="0" stop-color="${rc}" stop-opacity=".28"/><stop offset="1" stop-color="${rc}" stop-opacity="0"/></radialGradient></defs>
    <circle cx="50" cy="52" r="46" fill="url(#${id}g)"/>${body}</svg>`);
}

const TROPHY_COLORS: Record<string, string> = { champion: '#ffcf3d', cup: '#e3e8ee', runner_up: '#d6dde5', third: '#d08a4e', golden_boot: '#ffcf3d', playmaker: '#3dd6ff', golden_glove: '#ffcf3d', pots: '#c6ff3d' };

/** Trophy cabinet piece for a season trophy kind. */
export function trophyArt(kind: string, size = 64): Raw {
  const id = `tr${uid++}`;
  const c = TROPHY_COLORS[kind] ?? '#ffcf3d';
  let body: string;
  switch (kind) {
    case 'golden_boot':
      body = `<path d="M22 60 C20 46 24 32 34 30 L48 28 C52 40 60 44 74 46 C82 47 86 52 86 60 L86 64 L22 64 Z" fill="url(#${id})" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/><rect x="22" y="64" width="64" height="6" rx="3" fill="${c}"/><rect x="30" y="76" width="48" height="10" rx="3" fill="#2a2f35"/>`;
      break;
    case 'golden_glove':
      body = `<path d="M34 76 L32 44 C32 40 38 40 38 44 L38 30 C38 26 44 26 44 30 L44 24 C44 20 50 20 50 24 L50 28 C50 24 56 24 56 28 L56 34 C56 30 62 30 62 34 L62 58 C62 70 56 76 50 76 Z" fill="url(#${id})" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/><path d="M34 62 L22 52 C20 48 26 44 30 48 L36 54" fill="url(#${id})" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/><rect x="30" y="80" width="40" height="8" rx="3" fill="#2a2f35"/>`;
      break;
    case 'pots':
      body = `<path d="M50 14 L59 34 L81 36 L64 51 L69 73 L50 61 L31 73 L36 51 L19 36 L41 34 Z" fill="url(#${id})" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/><rect x="40" y="74" width="20" height="6" fill="${c}"/><rect x="30" y="80" width="40" height="8" rx="3" fill="#2a2f35"/>`;
      break;
    case 'playmaker':
      body = `<circle cx="50" cy="40" r="22" fill="url(#${id})" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/><path d="M38 44 L50 30 L62 44 M50 30 V54" stroke="#0d1a22" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><rect x="44" y="62" width="12" height="12" fill="${c}"/><rect x="30" y="74" width="40" height="10" rx="3" fill="#2a2f35"/>`;
      break;
    default:
      body = `<path d="M30 16 H70 V34 C70 50 61 58 50 58 C39 58 30 50 30 34 Z" fill="url(#${id})" stroke="rgba(0,0,0,.3)" stroke-width="1.5"/>
        <path d="M30 22 H18 V28 C18 38 26 42 32 42 M70 22 H82 V28 C82 38 74 42 68 42" stroke="${c}" stroke-width="4" fill="none"/>
        <rect x="45" y="58" width="10" height="12" fill="${c}"/><rect x="34" y="70" width="32" height="6" rx="2" fill="${c}"/><rect x="28" y="76" width="44" height="10" rx="3" fill="#2a2f35"/>`;
  }
  return raw(`<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true"><defs>${metalGrad(id, c)}</defs>${body}</svg>`);
}
