// Vector art for cosmetic items: portrait overlays, shop thumbnails and
// profile card backdrops.
import { RARITY_COLORS, type Item } from '../shared/cosmetics.ts';
import { esc, raw, type Raw } from './dom.ts';

let uid = 0;

function metalGrad(id: string, base: string) {
  return `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".25" stop-color="${base}"/><stop offset=".6" stop-color="${base}"/><stop offset=".8" stop-color="#fff" stop-opacity=".7"/><stop offset="1" stop-color="${base}"/></linearGradient>`;
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
    case 'top':
      body = topArt(it, id);
      break;
    case 'bottom':
      body = bottomArt(it, id);
      break;
    case 'shoes':
      body = shoeArt(it, id);
      break;
    case 'head':
      body = hatArt(it, id);
      break;
    case 'eyes':
      body = glassesArt(it, id);
      break;
    case 'border':
      return raw(`<div class="nb-art" style="width:${size}px;height:${size}px"><span class="name-tag ${borderClass(it)}" style="${borderVars(it)}">Name</span></div>`);
    case 'band':
      body = it.style === 'alice'
        ? `<ellipse cx="50" cy="52" rx="30" ry="22" fill="none" stroke="${f}" stroke-width="4"/>`
        : `<ellipse cx="50" cy="54" rx="30" ry="20" fill="none" stroke="${f}" stroke-width="12"/><ellipse cx="50" cy="54" rx="30" ry="20" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2" transform="translate(0 -4)"/>${it.c2 ? `<ellipse cx="50" cy="54" rx="30" ry="20" fill="none" stroke="${c2}" stroke-width="3"/>` : ''}`;
      break;
    case 'neck':
      body = it.style !== 'snood' && it.style !== 'medal' ? chainArt(it, id) : it.style === 'snood'
        ? `<path d="M22 36 Q50 52 78 36 L80 62 Q50 80 20 62 Z" fill="${c1}"/><path d="M22 46 Q50 62 78 46" stroke="rgba(255,255,255,.12)" stroke-width="3" fill="none"/>`
        : it.style === 'medal'
          ? `<path d="M30 14 L50 54 L70 14" stroke="${c2}" stroke-width="9" fill="none"/><circle cx="50" cy="64" r="18" fill="${f}" stroke="rgba(0,0,0,.3)" stroke-width="2"/><path d="M50 52 L53.6 59.4 L61.6 60.4 L55.6 65.8 L57.2 73.8 L50 69.8 L42.8 73.8 L44.4 65.8 L38.4 60.4 L46.4 59.4 Z" fill="rgba(0,0,0,.22)"/>`
          : `<path d="M20 30 Q50 86 80 30" stroke="${f}" stroke-width="6" stroke-dasharray="7 3" fill="none"/>`;
      break;
    case 'wrist':
      body = wristArt(it, id);
      break;
    case 'sweat':
      body = `<rect x="26" y="34" width="48" height="32" rx="10" fill="${f}"/><rect x="26" y="40" width="48" height="3" fill="rgba(0,0,0,.15)"/><rect x="26" y="57" width="48" height="3" fill="rgba(0,0,0,.15)"/>`;
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
    <defs>${it.metal ? metalGrad(`${id}m`, it.c1 ?? '#ccc') : ''}${printDefs(it, id)}<radialGradient id="${id}g" cx=".5" cy=".55" r=".55"><stop offset="0" stop-color="${rc}" stop-opacity=".28"/><stop offset="1" stop-color="${rc}" stop-opacity="0"/></radialGradient></defs>
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

// ---------- Streetwear art ----------

/** SVG pattern fills for printed pieces (stripes, camo, check, tie-dye…). */
function printDefs(it: Item, id: string): string {
  const a = esc(it.c1 ?? '#888'), b = esc(it.c2 ?? '#444'), c = esc(it.c3 ?? it.c2 ?? '#222');
  switch (it.print) {
    case 'stripes':
      return it.style === 'jersey'
        ? `<pattern id="${id}p" width="12" height="10" patternUnits="userSpaceOnUse"><rect width="12" height="10" fill="${a}"/><rect width="6" height="10" fill="${b}"/></pattern>`
        : `<pattern id="${id}p" width="10" height="8" patternUnits="userSpaceOnUse"><rect width="10" height="8" fill="${a}"/><rect width="10" height="3.2" fill="${b}"/></pattern>`;
    case 'check':
      return `<pattern id="${id}p" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${a}"/><rect width="6" height="12" fill="${b}" opacity=".55"/><rect width="12" height="6" fill="${b}" opacity=".55"/></pattern>`;
    case 'camo':
      return `<pattern id="${id}p" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="${a}"/><path d="M2 6 C10 0 18 8 14 14 C10 20 0 16 2 6Z M22 22 C30 16 40 24 34 32 C28 38 18 30 22 22Z" fill="${b}"/><path d="M24 2 C30 0 36 6 32 10 C28 14 20 8 24 2Z M4 26 C10 22 14 30 10 34 C6 38 0 32 4 26Z" fill="${c}"/></pattern>`;
    case 'floral':
      return `<pattern id="${id}p" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="${a}"/><path d="M3 9 Q8 2 13 9 Q8 7 3 9Z" fill="${b}"/><circle cx="14" cy="15" r="2.4" fill="${c}"/></pattern>`;
    case 'tiedye':
      return `<radialGradient id="${id}p" cx=".5" cy=".55" r=".7"><stop offset="0" stop-color="${c}"/><stop offset=".35" stop-color="${a}"/><stop offset=".7" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></radialGradient>`;
    case 'flames':
      return `<linearGradient id="${id}p" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${c}"/><stop offset=".3" stop-color="${b}"/><stop offset=".45" stop-color="${a}"/></linearGradient>`;
    case 'galaxy':
      return `<radialGradient id="${id}p" cx=".35" cy=".4" r=".8"><stop offset="0" stop-color="${b}" stop-opacity=".7"/><stop offset=".3" stop-color="${c}" stop-opacity=".55"/><stop offset=".7" stop-color="${a}"/></radialGradient>`;
    case 'chrome':
      return `<linearGradient id="${id}p" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="${b}"/><stop offset=".55" stop-color="#fff"/><stop offset=".8" stop-color="${b}"/><stop offset="1" stop-color="${a}"/></linearGradient>`;
    case 'brocade':
      return `<pattern id="${id}p" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${a}"/><circle cx="4" cy="4" r="1.3" fill="${b}"/></pattern>`;
    case 'denim': case 'ripped':
      return `<linearGradient id="${id}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset=".45" stop-color="#cfe0f2" stop-opacity=".9"/><stop offset="1" stop-color="${a}"/></linearGradient>`;
    case 'lava':
      return `<linearGradient id="${id}p" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
    default:
      return '';
  }
}
const fillOf = (it: Item, id: string) => (it.print && it.print !== 'chest' && it.print !== 'ringer' && it.print !== 'ripped' ? `url(#${id}p)` : it.metal && it.print !== 'galaxy' ? `url(#${id}m)` : esc(it.c1 ?? '#888'));
const OUT = 'stroke="rgba(0,0,0,.35)" stroke-width="1.2" stroke-linejoin="round"';

function topArt(it: Item, id: string): string {
  const f = fillOf(it, id);
  const c2 = esc(it.c2 ?? '#fff'), c3 = esc(it.c3 ?? '#f2f2ee');
  const st = it.style ?? 'tee';
  const longS = !['tee', 'polo', 'tank', 'jersey', 'shirt'].includes(st) || it.print === 'check';
  const bulk = st === 'puffer' ? 4 : st === 'hoodie' || st === 'knit' ? 2 : 0;
  // Torso and sleeves.
  const sleeves = st === 'tank' ? '' : longS
    ? `<path d="M${27 - bulk} 26 L${10 - bulk} 70 L${20 - bulk} 74 L34 40 Z M${73 + bulk} 26 L${90 + bulk} 70 L${80 + bulk} 74 L66 40 Z" fill="${f}" ${OUT}/>`
    : `<path d="M27 26 L13 46 L25 52 L34 40 Z M73 26 L87 46 L75 52 L66 40 Z" fill="${f}" ${OUT}/>`;
  const torso = st === 'tank'
    ? `<path d="M36 22 Q40 34 50 34 Q60 34 64 22 L70 30 L70 86 L30 86 L30 30 Z" fill="${f}" ${OUT}/>`
    : `<path d="M${36 - bulk} 20 Q50 ${st === 'puffer' ? 30 : 27} ${64 + bulk} 20 L${74 + bulk} 26 L${70 + bulk} 86 L${30 - bulk} 86 L${26 - bulk} 26 Z" fill="${f}" ${OUT}/>`;
  let extra = '';
  switch (st) {
    case 'hoodie':
      extra = `<path d="M36 20 Q50 8 64 20 Q60 30 50 30 Q40 30 36 20Z" fill="${f}" ${OUT}/><path d="M37 62 L63 62 L66 78 L34 78 Z" fill="rgba(0,0,0,.12)" stroke="rgba(0,0,0,.25)" stroke-width="1"/><path d="M46 28 L45 44 M54 28 L55 44" stroke="${c2}" stroke-width="1.8" stroke-linecap="round"/>`;
      break;
    case 'puffer':
      extra = `<path d="M30 40 H70 M29 54 H71 M29 68 H71 M14 48 L24 44 M86 48 L76 44 M12 60 L22 56 M88 60 L78 56" stroke="rgba(0,0,0,.22)" stroke-width="1.6"/><path d="M38 14 Q50 22 62 14 L64 24 Q50 32 36 24Z" fill="${f}" ${OUT}/><path d="M50 26 V86" stroke="${esc(it.c3 ?? '#222')}" stroke-width="1.6"/>`;
      break;
    case 'suit':
      extra = `<path d="M42 22 L50 58 L58 22 Z" fill="${c2}"/><path d="M48.5 30 L51.5 30 L52.5 54 L50 58 L47.5 54Z" fill="${c3}"/><path d="M42 22 L50 58 L38 50 L36 30Z M58 22 L50 58 L62 50 L64 30Z" fill="rgba(0,0,0,.25)"/><circle cx="50" cy="66" r="1.6" fill="${c3}"/><path d="M58 36 L66 36 L62 33Z" fill="#fff"/>`;
      break;
    case 'denim': case 'varsity':
      extra = `<path d="M44 26 L44 86 L56 86 L56 26 Q50 30 44 26Z" fill="${c3}"/>${st === 'varsity' ? `<text x="38" y="56" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="16" fill="${c2}" text-anchor="middle">F</text><path d="M30 82 H44 M56 82 H70" stroke="${c2}" stroke-width="3"/>` : `<rect x="31" y="38" width="11" height="9" rx="1.5" fill="none" stroke="${c2}" stroke-width="1" stroke-dasharray="2 1.5"/><rect x="58" y="38" width="11" height="9" rx="1.5" fill="none" stroke="${c2}" stroke-width="1" stroke-dasharray="2 1.5"/>`}`;
      break;
    case 'bomber': case 'track':
      extra = `<path d="M50 26 V86" stroke="rgba(0,0,0,.4)" stroke-width="1.4"/><path d="M38 21 Q50 30 62 21" stroke="${c2}" stroke-width="3" fill="none"/>${st === 'bomber' ? `<path d="M30 84 H70" stroke="${c2}" stroke-width="4"/>` : `<path d="M28 28 L13 70 M31 30 L17 72 M72 28 L87 70 M69 30 L83 72" stroke="${c2}" stroke-width="2"/>`}`;
      break;
    case 'leather':
      extra = `<path d="M36 82 L64 26" stroke="${c2}" stroke-width="1.6"/><path d="M40 22 L50 34 L44 40 Z M60 22 L54 30 L62 38Z" fill="rgba(255,255,255,.12)"/><path d="M31 48 L42 44" stroke="${c2}" stroke-width="1.4"/>`;
      break;
    case 'shirt': case 'polo':
      extra = `<path d="M42 21 L50 30 L46 34 Z M58 21 L50 30 L54 34Z" fill="${st === 'polo' ? c2 : 'rgba(255,255,255,.35)'}"/><path d="M50 30 V${st === 'polo' ? 44 : 86}" stroke="rgba(0,0,0,.3)" stroke-width="1"/>${[38, 50, 62, 74].slice(0, st === 'polo' ? 1 : 4).map((y) => `<circle cx="50" cy="${y}" r="1.2" fill="#fff"/>`).join('')}`;
      break;
    case 'knit':
      extra = `${[36, 44, 56, 64].map((x) => `<path d="M${x} 30 ${Array.from({ length: 7 }, (_, i) => `Q${x + (i % 2 ? -3 : 3)} ${34 + i * 7} ${x} ${38 + i * 7}`).join(' ')}" stroke="rgba(0,0,0,.18)" stroke-width="2" fill="none"/>`).join('')}`;
      break;
    default:
      extra = `<path d="M40 21 Q50 30 60 21" stroke="${it.print === 'ringer' || st === 'jersey' ? c2 : 'rgba(0,0,0,.25)'}" stroke-width="${it.print === 'ringer' || st === 'jersey' ? 3 : 1.5}" fill="none"/>${it.print === 'ringer' ? `<path d="M13 46 L25 52 M87 46 L75 52" stroke="${c2}" stroke-width="3"/>` : ''}${it.print === 'chest' ? `<circle cx="60" cy="38" r="4" fill="none" stroke="${c2}" stroke-width="1.6"/>` : ''}`;
  }
  return `<g transform="translate(0 4)">${sleeves}${torso}${extra}</g>`;
}

function bottomArt(it: Item, id: string): string {
  const f = fillOf(it, id);
  const c2 = esc(it.c2 ?? '#fff');
  const short = it.style === 'shorts';
  const hem = short ? 58 : 92;
  const legs = `<path d="M30 10 H70 L${short ? 74 : 68} ${hem} L${short ? 53 : 54} ${hem} L50 32 L${short ? 47 : 46} ${hem} L${short ? 26 : 32} ${hem} Z" fill="${f}" ${OUT}/>`;
  let extra = `<path d="M30 16 H70" stroke="rgba(0,0,0,.25)" stroke-width="1.4"/>`;
  switch (it.style) {
    case 'jeans':
      extra += `<path d="M33 18 Q38 26 44 18 M67 18 Q62 26 56 18" stroke="${c2}" stroke-width="1" fill="none"/><path d="M35 ${hem - 4} H45 M55 ${hem - 4} H66" stroke="${c2}" stroke-width="1" stroke-dasharray="2 1.5"/><circle cx="50" cy="13" r="1.4" fill="#d9dee4"/>`;
      if (it.print === 'ripped') extra += `<path d="M36 62 q3 -3 7 0 q-3 3 -7 0Z M57 64 q3 -3 7 0 q-3 3 -7 0Z" fill="#c98a5c"/>`;
      break;
    case 'joggers':
      extra += `<path d="M32 ${hem - 6} H46 M54 ${hem - 6} H68" stroke="rgba(0,0,0,.25)" stroke-width="4"/><path d="M47 16 L46 26 M53 16 L54 26" stroke="${c2}" stroke-width="1.4"/>`;
      break;
    case 'track': case 'suit':
      extra += `<path d="M31 18 L33 ${hem} M69 18 L67 ${hem}" stroke="${c2}" stroke-width="${it.style === 'suit' ? 1.6 : 2.4}"/>${it.style === 'track' ? `<path d="M34 18 L36 ${hem} M66 18 L64 ${hem}" stroke="${c2}" stroke-width="2.4"/>` : ''}`;
      break;
    case 'cargo':
      extra += `<rect x="28" y="48" width="10" height="14" rx="1.5" fill="rgba(0,0,0,.15)" stroke="rgba(0,0,0,.3)"/><rect x="62" y="48" width="10" height="14" rx="1.5" fill="rgba(0,0,0,.15)" stroke="rgba(0,0,0,.3)"/>`;
      break;
    case 'shorts':
      extra += it.print === 'denim' ? `<path d="M27 ${hem} H46 M54 ${hem} H73" stroke="#fff" stroke-width="1.6" stroke-dasharray="1 1"/>` : `<path d="M28 20 L26 ${hem} M72 20 L74 ${hem}" stroke="${c2}" stroke-width="4"/>`;
      break;
  }
  return legs + extra;
}

function shoeArt(it: Item, id: string): string {
  const up = it.metal ? `url(#${id}m)` : esc(it.c1 ?? '#eee');
  const c2 = esc(it.c2 ?? '#888');
  const sole = it.print === 'lava' ? `url(#${id}p)` : esc(it.c3 ?? '#fff');
  const st = it.style ?? 'court';
  const high = st === 'high' || st === 'chelsea';
  const top = high ? 22 : st === 'loafer' ? 44 : 36;
  const soleH = st === 'chunky' ? 14 : st === 'runner' ? 11 : st === 'loafer' || st === 'chelsea' ? 6 : 8;
  if (st === 'slide') {
    return `<path d="M12 68 H88 Q92 68 92 72 V76 H10 V72 Q10 68 12 68Z" fill="${sole}" ${OUT}/><path d="M40 68 Q42 46 60 46 Q72 48 74 68Z" fill="${up}" ${OUT}/><path d="M48 58 H64" stroke="${c2}" stroke-width="3"/>`;
  }
  const upper = `<path d="M14 ${76 - soleH} L16 ${top} Q24 ${top - 4} 34 ${top} L${high ? 38 : 42} ${top + (high ? 18 : 4)} Q56 ${top + 14} 76 ${60 - soleH} Q90 ${62 - soleH} 90 ${76 - soleH} Z" fill="${up}" ${OUT}/>`;
  const soleP = `<path d="M10 ${76 - soleH} H92 Q94 ${76 - soleH} 94 ${78 - soleH} V76 Q94 80 90 80 H12 Q8 80 8 76 Z" fill="${sole}" ${OUT}/>${st === 'chunky' ? `<path d="M10 ${80 - soleH * 0.55} H93" stroke="${c2}" stroke-width="3"/>` : ''}`;
  let extra = '';
  switch (st) {
    case 'runner': case 'chunky':
      extra = `<path d="M30 ${66 - soleH} Q52 ${54 - soleH} 80 ${50 - soleH * 0.4}" stroke="${c2}" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M14 ${76 - soleH} L16 ${top} Q24 ${top - 4} 30 ${top + 2} L30 ${76 - soleH}Z" fill="${c2}" opacity=".85"/>`;
      break;
    case 'court':
      extra = `<path d="M14 ${76 - soleH} L16 ${top} Q20 ${top - 2} 24 ${top} L24 ${76 - soleH}Z" fill="${c2}"/>${[0, 1, 2, 3].map((i) => `<circle cx="${70 + i * 4}" cy="${60 - soleH + i}" r="0.8" fill="rgba(0,0,0,.3)"/>`).join('')}`;
      break;
    case 'high':
      extra = `<path d="M36 ${top + 18} Q56 ${top + 30} 72 ${62 - soleH} L60 ${74 - soleH} Q40 ${70 - soleH} 30 ${60 - soleH} Z" fill="${c2}"/><path d="M15 ${top + 4} H34" stroke="${c2}" stroke-width="5"/><path d="M28 ${66 - soleH} Q50 ${58 - soleH} 70 ${58 - soleH}" stroke="${esc(it.c3 ?? '#fff')}" stroke-width="3" fill="none"/>`;
      break;
    case 'chelsea':
      extra = `<path d="M30 ${top + 4} L40 ${top + 4} L36 ${68 - soleH} Z" fill="${c2}"/><path d="M15 ${top} L17 ${top - 6} L22 ${top}" stroke="${c2}" stroke-width="2" fill="none"/>`;
      break;
    case 'loafer':
      extra = `<path d="M50 ${top + 8} H66" stroke="${c2}" stroke-width="3" stroke-linecap="round"/>`;
      break;
  }
  const laces = st === 'runner' || st === 'court' || st === 'high' || st === 'chunky' ? `<path d="${[0, 1, 2, 3].map((i) => `M${40 + i * 6} ${top + 6 + i * 3} l5 -3`).join(' ')}" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>` : '';
  return `<g transform="translate(0 -4)">${upper}${extra}${laces}${soleP}</g>`;
}

function hatArt(it: Item, id: string): string {
  const f = fillOf(it, id);
  const c2 = esc(it.c2 ?? '#222');
  switch (it.style) {
    case 'beanie': case 'pom': {
      const stripes = it.style === 'pom' ? `<path d="M22 50 H78 M20 60 H80" stroke="${c2}" stroke-width="5"/>` : '';
      return `<path d="M20 70 Q18 24 50 22 Q82 24 80 70 Z" fill="${f}" ${OUT}/>${stripes}<rect x="17" y="62" width="66" height="14" rx="4" fill="${f}" ${OUT}/><path d="M22 66 V74 M30 66 V74 M38 66 V74 M46 66 V74 M54 66 V74 M62 66 V74 M70 66 V74 M78 66 V74" stroke="rgba(0,0,0,.18)" stroke-width="1.5"/>${it.style === 'pom' ? `<circle cx="50" cy="20" r="9" fill="${c2}"/>` : ''}`;
    }
    case 'bucket':
      return `<path d="M30 60 Q30 30 50 30 Q70 30 70 60 Z" fill="${f}" ${OUT}/><path d="M12 68 Q50 52 88 68 L82 74 Q50 62 18 74 Z" fill="${f}" ${OUT}/>`;
    case 'durag':
      return `<path d="M22 64 Q20 26 50 24 Q80 26 78 64 Q50 56 22 64Z" fill="${f}" ${OUT}/><path d="M70 60 Q78 76 74 92 L68 90 Q70 76 64 62Z M76 58 Q86 72 84 88 L78 88 Q78 74 72 60Z" fill="${f}" ${OUT}/><path d="M34 40 Q50 32 66 40" stroke="rgba(255,255,255,.35)" stroke-width="2" fill="none"/>`;
    case 'crown':
      return `<path d="M18 70 L14 30 L32 46 L50 22 L68 46 L86 30 L82 70 Z" fill="${f}" ${OUT}/><rect x="18" y="66" width="64" height="10" rx="2" fill="${f}" ${OUT}/>${[30, 50, 70].map((x) => `<circle cx="${x}" cy="71" r="3.4" fill="${c2}"/>`).join('')}<circle cx="50" cy="22" r="3" fill="#fff"/>`;
    default: {
      const back = it.style === 'backcap';
      return `<g ${back ? 'transform="translate(100 0) scale(-1 1)"' : ''}><path d="M22 62 Q22 28 50 28 Q76 28 78 62 Z" fill="${f}" ${OUT}/><path d="M50 28 V62 M36 31 Q34 46 36 62 M64 31 Q66 46 64 62" stroke="rgba(0,0,0,.2)" stroke-width="1.2" fill="none"/><path d="M60 60 Q86 56 94 66 Q80 70 58 66 Z" fill="${c2}" ${OUT}/><circle cx="50" cy="28" r="2.5" fill="${c2}"/></g>`;
    }
  }
}

function glassesArt(it: Item, id: string): string {
  const fr = it.metal ? `url(#${id}m)` : esc(it.c1 ?? '#111');
  const lens = esc(it.c2 ?? '#222');
  const sw = it.style === 'square' ? 4.5 : 2.2;
  const lensShape = (cx: number) => {
    switch (it.style) {
      case 'square': return `<rect x="${cx - 17}" y="38" width="34" height="24" rx="5"/>`;
      case 'aviator': return `<path d="M${cx - 16} 40 Q${cx} 36 ${cx + 16} 40 Q${cx + 18} 62 ${cx} 64 Q${cx - 18} 62 ${cx - 16} 40Z"/>`;
      default: return `<ellipse cx="${cx}" cy="50" rx="15" ry="13"/>`;
    }
  };
  if (it.style === 'shield') {
    return `<path d="M8 44 Q50 30 92 44 Q90 60 70 62 Q56 62 50 54 Q44 62 30 62 Q10 60 8 44Z" fill="${lens}" stroke="${fr}" stroke-width="2.5"/><path d="M16 46 Q50 36 84 46" stroke="rgba(255,255,255,.45)" stroke-width="2" fill="none"/>`;
  }
  return `<g fill="${lens}" stroke="${fr}" stroke-width="${sw}">${lensShape(30)}${lensShape(70)}</g><path d="M45 46 Q50 42 55 46" stroke="${fr}" stroke-width="${sw}" fill="none"/><path d="M${it.style === 'square' ? 13 : 15} 46 L6 44 M${it.style === 'square' ? 87 : 85} 46 L94 44" stroke="${fr}" stroke-width="${sw}"/><path d="M22 44 L30 40 M62 44 L70 40" stroke="rgba(255,255,255,.5)" stroke-width="2"/>`;
}

function chainArt(it: Item, id: string): string {
  const f = it.metal ? `url(#${id}m)` : esc(it.c1 ?? '#ccc');
  const c2 = esc(it.c2 ?? '#fff');
  const st = it.style;
  const arc = 'M18 22 Q50 92 82 22';
  let chain: string;
  if (st === 'beads') chain = `<path d="${arc}" stroke="${esc(it.c1 ?? '#8a5a32')}" stroke-width="8" stroke-dasharray="0.1 9" stroke-linecap="round" fill="none"/>`;
  else if (st === 'tennis' || st === 'icecuban') chain = `<path d="${arc}" stroke="${f}" stroke-width="${st === 'icecuban' ? 8 : 5}" fill="none"/><path d="${arc}" stroke="#fff" stroke-width="${st === 'icecuban' ? 5 : 3}" stroke-dasharray="0.1 5" stroke-linecap="round" fill="none"/>`;
  else if (st === 'cuban' || st === 'star') chain = `<path d="${arc}" stroke="${f}" stroke-width="7" fill="none"/><path d="${arc}" stroke="rgba(0,0,0,.3)" stroke-width="7" stroke-dasharray="1 4" fill="none"/>`;
  else if (st === 'dogtag') chain = `<path d="${arc}" stroke="${f}" stroke-width="3" stroke-dasharray="0.1 3.5" stroke-linecap="round" fill="none"/>`;
  else chain = `<path d="${arc}" stroke="${f}" stroke-width="4.5" fill="none"/><path d="${arc}" stroke="rgba(0,0,0,.3)" stroke-width="4.5" stroke-dasharray="2 2" fill="none" transform="translate(0 .6)"/>`;
  let pend = '';
  if (st === 'ball') pend = `<circle cx="50" cy="66" r="11" fill="${f}" ${OUT}/><path d="M50 60 L55 64 L53 70 H47 L45 64 Z" fill="${c2}"/>`;
  if (st === 'star') pend = `<path d="M50 54 L54 63 L64 64 L56 70 L59 80 L50 74 L41 80 L44 70 L36 64 L46 63 Z" fill="${f}" stroke="#fff" stroke-width="1.2"/>`;
  if (st === 'dogtag') pend = `<rect x="42" y="56" width="16" height="24" rx="4" fill="${f}" ${OUT}/>`;
  return chain + pend;
}

function wristArt(it: Item, id: string): string {
  const f = it.metal ? `url(#${id}m)` : esc(it.c1 ?? '#222');
  const c2 = esc(it.c2 ?? '#c6ff3d');
  const st = it.style ?? 'cuff';
  if (/watch/.test(st)) {
    const iced = st === 'icewatch';
    return `<rect x="38" y="8" width="24" height="84" rx="8" fill="${f}" ${OUT}/>${st !== 'watch' ? `<path d="M38 20 H62 M38 30 H62 M38 70 H62 M38 80 H62" stroke="rgba(0,0,0,.25)" stroke-width="1.2"/>` : ''}<circle cx="50" cy="50" r="19" fill="${f}" ${OUT}/><circle cx="50" cy="50" r="14" fill="${c2}"/>${iced ? `<circle cx="50" cy="50" r="17" fill="none" stroke="#fff" stroke-width="2.4" stroke-dasharray="0.1 3.6" stroke-linecap="round"/>` : ''}<path d="M50 50 V40 M50 50 L57 53" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`;
  }
  const ring = 'M16 50 A34 16 0 1 0 84 50 A34 16 0 1 0 16 50';
  switch (st) {
    case 'beads': return `<path d="${ring}" stroke="${esc(it.c1 ?? '#111')}" stroke-width="10" stroke-dasharray="0.1 11" stroke-linecap="round" fill="none"/><circle cx="50" cy="66" r="5" fill="${c2}"/>`;
    case 'string': return `<path d="${ring}" stroke="${esc(it.c1 ?? '#e0244a')}" stroke-width="3" fill="none"/><path d="${ring}" stroke="${c2}" stroke-width="3" fill="none" transform="translate(0 5)"/><path d="${ring}" stroke="#f4f4f0" stroke-width="2" fill="none" transform="translate(0 -5)"/>`;
    case 'tennis': return `<path d="${ring}" stroke="${f}" stroke-width="4" fill="none"/><path d="${ring}" stroke="#fff" stroke-width="3.4" stroke-dasharray="0.1 5" stroke-linecap="round" fill="none"/>`;
    case 'cuban': return `<path d="${ring}" stroke="${f}" stroke-width="8" fill="none"/><path d="${ring}" stroke="rgba(0,0,0,.3)" stroke-width="8" stroke-dasharray="1 5" fill="none"/>`;
    default: return `<path d="${ring}" stroke="${f}" stroke-width="14" fill="none"/><path d="M20 44 A30 12 0 0 1 80 44" stroke="rgba(255,255,255,.5)" stroke-width="2" fill="none"/>`;
  }
}

// ---------- Name borders ----------

export const borderClass = (it?: Item) => (it ? `nb nb-${it.style}` : '');
export const borderVars = (it?: Item) => (it ? `--b1:${esc(it.c1 ?? '#fff')};--b2:${esc(it.c2 ?? '#fff')}` : '');

/** A player's name in their equipped name border (plain when none). */
export function nameTag(name: string, border?: Item): Raw {
  if (!border) return raw(esc(name));
  return raw(`<span class="name-tag ${borderClass(border)}" style="${borderVars(border)}">${border.style === 'legend' ? '<i class="nb-crown"></i>' : ''}${esc(name)}</span>`);
}
