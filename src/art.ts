// Vector art: club badges and player portraits, generated from data so every
// club has a consistent look. Player portraits come from the 3D model.
import { BOOT_COLORS, type Appearance } from '../shared/appearance.ts';
import { esc, raw, type Raw } from './dom.ts';
import type { Equipped } from '../shared/cosmetics.ts';
import { portrait } from './portrait.ts';
import { BADGE_ICONS, BADGE_SHAPES, fullBadge, type Badge } from '../shared/badge.ts';

let uid = 0;

const starPath = (cx: number, cy: number, r: number) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    return `${(cx + Math.cos(a) * rr).toFixed(2)} ${(cy + Math.sin(a) * rr).toFixed(2)}`;
  });
  return `M${pts.join(' L')} Z`;
};

function patternSvg(n: number, c: string): string {
  const fill = `fill="${c}"`;
  switch (n) {
    case 0: return `<path d="M0 0 H100 L0 100 Z" ${fill} opacity=".18"/><rect x="0" y="80" width="100" height="20" ${fill} opacity=".9"/>`;
    case 2: return [5, 25, 45, 65, 85].map((x) => `<rect x="${x}" y="0" width="10" height="100" ${fill}/>`).join('');
    case 3: return [12, 34, 56, 78].map((y) => `<rect x="0" y="${y}" width="100" height="11" ${fill}/>`).join('');
    case 4: return `<rect x="50" y="0" width="50" height="100" ${fill}/>`;
    case 5: return `<rect x="50" y="0" width="50" height="50" ${fill}/><rect x="0" y="50" width="50" height="50" ${fill}/>`;
    case 6: return `<path d="M-10 8 L8 -10 L110 92 L92 110 Z" ${fill}/>`;
    case 7: return `<path d="M0 38 L50 66 L100 38 V58 L50 86 L0 58 Z" ${fill}/>`;
    case 8: {
      let r = '';
      for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) if ((i + j) % 2 === 0) r += `<rect x="${i * 16.7}" y="${j * 16.7}" width="16.8" height="16.8" ${fill}/>`;
      return r;
    }
    case 9: return Array.from({ length: 9 }, (_, i) => `<rect x="${9.2 + i * 10}" y="0" width="1.6" height="100" ${fill}/>`).join('');
    case 10: return `<rect x="42" y="0" width="16" height="100" ${fill}/><rect x="0" y="42" width="100" height="16" ${fill}/>`;
    case 11: return `<path d="M-6 6 L6 -6 L106 94 L94 106 Z M106 6 L94 -6 L-6 94 L6 106 Z" ${fill} fill-rule="nonzero"/>`;
    case 12: return Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2, b = a + Math.PI / 12;
      return `<path d="M50 50 L${(50 + Math.cos(a) * 90).toFixed(1)} ${(50 + Math.sin(a) * 90).toFixed(1)} L${(50 + Math.cos(b) * 90).toFixed(1)} ${(50 + Math.sin(b) * 90).toFixed(1)} Z" ${fill}/>`;
    }).join('');
    case 13: return `<path d="M100 0 V100 H0 Z" ${fill}/>`;
    case 14: return `<rect x="0" y="0" width="100" height="30" ${fill}/>`;
    case 15: {
      let r = '';
      for (let j = 0; j < 7; j++) for (let i = 0; i < 7; i++) r += `<circle cx="${i * 16 + (j % 2 ? 8 : 0)}" cy="${j * 16 + 4}" r="3.6" ${fill}/>`;
      return r;
    }
    default: return '';
  }
}

/** Black or white, whichever reads better on `hex`. */
export function readableOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const lum = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 150 ? '#111111' : '#ffffff';
}

/** Club badge, drawn from the club's badge settings and kit colours. */
export function badgeSvg(colors: { primary: string; secondary: string }, badge: Partial<Badge>, size = 40, short = ''): Raw {
  const id = `bg${uid++}`;
  const b = fullBadge(badge, colors);
  const shape = BADGE_SHAPES[b.shape % BADGE_SHAPES.length].d;
  const icon = BADGE_ICONS[b.icon % BADGE_ICONS.length];
  const col = (v: string) => esc(v);
  const [base, pc, ec, bc, ac] = [b.base, b.patternColor, b.emblemColor, b.borderColor, b.accent].map(col);
  const font = `font-family="'Barlow Condensed', 'Inter Variable', sans-serif" font-weight="800"`;
  const text = esc(b.text);
  const textPos = b.text ? b.textPos : 0;
  // Text colour: the club's pick, or black / white against what it sits on.
  const tc = col(b.textColor || readableOn(textPos === 1 ? b.borderColor : textPos === 3 ? b.accent : b.base));
  // Squeeze long names into the space instead of letting them spill.
  const fit = (fs: number, room: number) => (b.text.length * fs * 0.52 > room ? ` textLength="${room}" lengthAdjust="spacingAndGlyphs"` : '');

  // Emblem: auto-fit around text, then the club's own size / offset / tilt.
  let sc = b.iconScale / 100;
  let dy = b.iconY;
  if (textPos === 1) { sc *= 0.8; dy -= 8; }
  if (textPos === 2) { sc *= 0.76; dy += 7; }
  const emT = `translate(${50 + b.iconX} ${50 + dy}) rotate(${b.iconRot}) scale(${sc.toFixed(3)}) translate(-50 -50)`;
  let emblem: string;
  if (icon.name === 'Monogram') {
    const letters = esc((short || b.text || 'FC').slice(0, 4));
    const fs = [0, 44, 38, 30, 24][Math.max(1, Math.min(4, letters.length))];
    emblem = `<text x="50" y="51" text-anchor="middle" dominant-baseline="central" ${font} font-size="${fs}" letter-spacing="1" fill="${ec}" stroke="rgba(0,0,0,.25)" stroke-width="2.5" paint-order="stroke">${letters}</text>`;
  } else {
    const paths = icon.d.map((d) => `<path d="${d}"/>`).join('');
    emblem = `<g fill-rule="evenodd" stroke-linejoin="round"><g fill="rgba(0,0,0,.25)" stroke="rgba(0,0,0,.25)" stroke-width="3">${paths}</g><g fill="${ec}">${paths}</g></g>`;
  }

  // Inside-only border strokes keep every border within the shape.
  const inner = (w: number, c: string) => `<path d="${shape}" fill="none" stroke="${c}" stroke-width="${w * 2}" clip-path="url(#${id}c)"/>`;
  const outline = `<path d="${shape}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1"/>`;
  let border = '';
  switch (b.border) {
    case 1: border = inner(2, bc) + outline; break;
    case 2: border = `<path d="${shape}" fill="none" stroke="${bc}" stroke-width="4"/>${outline}`; break;
    case 3: border = inner(7, bc) + outline; break;
    case 4: border = inner(7, bc) + inner(4.6, base) + inner(3, bc) + outline; break;
    case 5: border = inner(3, bc) + `<path d="${shape}" fill="none" stroke="${bc}" stroke-width="2.2" transform="translate(50 50) scale(.84) translate(-50 -50)"/>` + outline; break;
    default: border = outline;
  }

  let band = '';
  if (textPos === 1) {
    const fs = Math.min(12, 64 / Math.max(1, b.text.length * 0.5));
    band = `<rect x="0" y="66" width="100" height="16" fill="${bc}"/><text x="50" y="74.5" text-anchor="middle" dominant-baseline="central" ${font} font-size="${fs.toFixed(1)}" letter-spacing=".6" fill="${tc}"${fit(fs, 78)}>${text}</text>`;
  }
  let arc = '';
  if (textPos === 2) {
    const fs = Math.min(11, 84 / Math.max(1, b.text.length * 0.52));
    arc = `<path id="${id}a" d="M19 54 A31 31 0 0 1 81 54" fill="none"/><text ${font} font-size="${fs.toFixed(1)}" letter-spacing="1" fill="${tc}" dominant-baseline="central" stroke="rgba(0,0,0,.2)" stroke-width="1.5" paint-order="stroke"><textPath href="#${id}a" startOffset="50%" text-anchor="middle"${fit(fs, 84)}>${text}</textPath></text>`;
  }

  // Stars above and a ribbon below shrink the shield to make room.
  const top = b.stars ? 15 : 2;
  const bottom = textPos === 3 ? 90 : 98;
  const s = (bottom - top) / 96;
  const shapeT = s < 1 ? ` transform="translate(${(50 * (1 - s)).toFixed(2)} ${(top - 2 * s).toFixed(2)}) scale(${s.toFixed(4)})"` : '';
  const stars = b.stars ? Array.from({ length: b.stars }, (_, i) => `<path d="${starPath(50 + (i - (b.stars - 1) / 2) * 13, 7.5, 5.6)}" fill="${ac}" stroke="rgba(0,0,0,.3)" stroke-width=".8"/>`).join('') : '';
  let ribbon = '';
  if (textPos === 3) {
    const fs = Math.min(11, 62 / Math.max(1, b.text.length * 0.5));
    ribbon = `<path d="M2 82 L14 80 L14 96 L2 98 L7 89 Z M98 82 L86 80 L86 96 L98 98 L93 89 Z" fill="${ac}" style="filter:brightness(.72)"/>
      <path d="M10 78 Q50 70 90 78 V94 Q50 86 10 94 Z" fill="${ac}" stroke="rgba(0,0,0,.3)" stroke-width=".8"/>
      <text x="50" y="84.5" text-anchor="middle" dominant-baseline="central" ${font} font-size="${fs.toFixed(1)}" letter-spacing=".6" fill="${tc}"${fit(fs, 64)}>${text}</text>`;
  }

  return raw(`<svg class="badge-svg" width="${size}" height="${size}" viewBox="0 0 100 100" aria-label="${esc(short)} badge">
    <defs>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
      <clipPath id="${id}c"><path d="${shape}"/></clipPath>
    </defs>
    ${stars}
    <g${shapeT}>
      <path d="${shape}" fill="${base}"/>
      <g clip-path="url(#${id}c)">${patternSvg(b.pattern, pc)}${band}</g>
      <g transform="${emT}">${emblem}</g>
      ${arc}
      ${b.gloss ? `<path d="${shape}" fill="url(#${id}g)"/>` : ''}
      ${border}
    </g>
    ${ribbon}
  </svg>`);
}

/**
 * Player portrait: a shot of the 3D player in club colours. (`number` is kept
 * for call sites that pass a shirt number; the kit itself shows it.)
 */
export function avatar(a: Appearance, kit?: { primary: string; secondary: string }, size = 48, _number?: number, opts: { eq?: Equipped; offPitch?: boolean } = {}): Raw {
  return portrait(a, kit, size, { eq: opts.eq, casual: opts.offPitch });
}

export function bootColor(a: Appearance) {
  return BOOT_COLORS[a.boots] ?? BOOT_COLORS[0];
}

export function brandMark(size = 34): Raw {
  const id = `bm${uid++}`;
  return raw(`<svg class="brand-mark" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2ff8a"/><stop offset="1" stop-color="#8fd400"/></linearGradient></defs>
    <rect width="64" height="64" rx="16" fill="#121611"/>
    <circle cx="32" cy="32" r="19" fill="url(#${id})"/>
    <path d="M32 21 L40.5 27.2 L37.3 37 H26.7 L23.5 27.2 Z" fill="#121611"/>
    <path d="M32 13v8M40.5 27.2l8-2.6M37.3 37l5 6.7M26.7 37l-5 6.7M23.5 27.2l-8-2.6" stroke="#121611" stroke-width="2.6" stroke-linecap="round"/>
  </svg>`);
}
