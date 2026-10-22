// Vector art: club badges and player portraits, generated from data so every
// club and player has a consistent look.
import { ACCESSORIES, BOOT_COLORS, HAIR_COLORS, SKIN_TONES, type Appearance } from '../shared/appearance.ts';
import { esc, raw, type Raw } from './dom.ts';
import { gear, type Equipped } from '../shared/cosmetics.ts';
import { outfitBody, portraitGear } from './gearArt.ts';
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

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * k)));
  return `#${((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0')}`;
}

function hairPath(style: number): string {
  switch (style) {
    case 0: return 'M33 40 C34 28 42 22 50 22 C58 22 66 28 67 40 C64 33 58 30 50 30 C42 30 36 33 33 40 Z'; // buzz
    case 1: return 'M31 42 C30 26 40 18 51 18 C62 18 71 26 69 42 C66 32 60 28 50 28 C42 28 35 32 31 42 Z';
    case 2: return 'M31 43 C29 24 41 16 52 17 C63 18 72 26 69 43 C68 34 63 27 54 27 C50 30 40 31 31 43 Z';
    case 3: return 'M31 42 C29 24 38 13 54 12 C66 12 73 22 69 42 C67 32 62 26 52 27 C45 26 36 32 31 42 Z';
    case 4: return 'M28 44 C22 34 28 18 40 16 C44 10 58 10 62 16 C74 18 78 34 72 44 C70 36 66 30 60 30 C56 26 44 26 40 30 C34 30 30 36 28 44 Z';
    case 5: return 'M24 46 C14 30 24 6 50 6 C76 6 86 30 76 46 C74 36 68 30 62 29 C56 26 44 26 38 29 C32 30 26 36 24 46 Z';
    case 6: return 'M29 66 C24 50 26 22 50 18 C74 22 76 50 71 66 C70 56 68 44 67 40 C64 32 58 28 50 28 C42 28 36 32 33 40 C32 44 30 56 29 66 Z';
    case 7: return 'M31 42 C30 26 40 19 50 19 C60 19 70 26 69 42 C66 32 60 28 50 28 C40 28 34 32 31 42 Z M42 14 A8 8 0 1 1 58 14 A8 8 0 1 1 42 14 Z';
    case 8: return 'M44 30 C44 18 47 8 50 6 C53 8 56 18 56 30 C54 28 46 28 44 30 Z';
    default: return '';
  }
}

function beardPath(b: number): string {
  switch (b) {
    case 1: return 'M35 52 C36 64 42 72 50 72 C58 72 64 64 65 52 C62 60 57 64 50 64 C43 64 38 60 35 52 Z';
    case 2: return 'M44 62 C45 70 47 74 50 74 C53 74 55 70 56 62 C54 64 46 64 44 62 Z M43 59 C46 57 54 57 57 59 C54 60 46 60 43 59 Z';
    case 3: return 'M34 48 C34 66 41 76 50 76 C59 76 66 66 66 48 C64 58 60 64 56 62 C53 60 47 60 44 62 C40 64 36 58 34 48 Z';
    case 4: return 'M42 59 C45 56 55 56 58 59 C56 62 54 60 50 60 C46 60 44 62 42 59 Z';
    default: return '';
  }
}

/** Player portrait in club colours. */
export function avatarSvg(a: Appearance, kit: { primary: string; secondary: string } = { primary: '#2a313a', secondary: '#c6ff3d' }, size = 48, number?: number, opts: { eq?: Equipped; offPitch?: boolean } = {}): Raw {
  const id = `av${uid++}`;
  const g = gear(opts.eq);
  const outfit = opts.offPitch ? g.outfit : undefined;
  const pg = portraitGear(g, id);
  const skin = SKIN_TONES[a.skin] ?? SKIN_TONES[1];
  const skinD = shade(skin, 0.82);
  const hair = HAIR_COLORS[a.hairColor] ?? HAIR_COLORS[0];
  const hp = hairPath(a.hair);
  const bp = beardPath(a.beard);
  const eyeY = 46;
  const brow = a.face === 3 ? 'M39 41 L46 43 M61 41 L54 43' : a.face === 1 ? 'M39 42 L46 42 M54 42 L61 42' : 'M39 42 Q42.5 40 46 42 M54 42 Q57.5 40 61 42';
  const mouth = a.face === 2 ? 'M44 57 Q50 62 56 57' : a.face === 3 ? 'M45 58 L55 58' : 'M45 57.5 Q50 59.5 55 57.5';
  const acc = ACCESSORIES[a.accessory];
  const p = esc(kit.primary);
  const s = esc(kit.secondary);
  return raw(`<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <radialGradient id="${id}bg" cx=".5" cy=".3" r=".8"><stop offset="0" stop-color="${shade(kit.primary, 1.15)}"/><stop offset="1" stop-color="${shade(kit.primary, 0.45)}"/></radialGradient>
      <linearGradient id="${id}sk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${skin}"/><stop offset="1" stop-color="${skinD}"/></linearGradient>
      ${pg.defs}
    </defs>
    <rect width="100" height="100" fill="url(#${id}bg)"/>
    ${outfit ? `<rect x="43" y="60" width="14" height="14" rx="4" fill="${skinD}"/>${outfitBody(outfit, id + 'o')}` : `
    <path d="M14 104 C16 80 30 72 50 72 C70 72 84 80 86 104 Z" fill="${p}"/>
    <path d="M40 72 L50 84 L60 72" fill="none" stroke="${s}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M14 104 C16 86 22 80 30 77 L28 104 Z M86 104 C84 86 78 80 70 77 L72 104 Z" fill="${s}" opacity=".85"/>
    ${number !== undefined ? `<text x="50" y="99" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="14" fill="${s}">${number}</text>` : ''}
    <rect x="43" y="60" width="14" height="14" rx="4" fill="${skinD}"/>`}
    ${a.hair === 6 ? `<path d="${hp}" fill="${hair}"/>` : ''}
    <ellipse cx="50" cy="46" rx="17" ry="20" fill="url(#${id}sk)"/>
    <ellipse cx="33" cy="48" rx="3" ry="4.5" fill="${skinD}"/><ellipse cx="67" cy="48" rx="3" ry="4.5" fill="${skinD}"/>
    ${bp ? `<path d="${bp}" fill="${hair}" opacity="${a.beard === 1 ? 0.45 : 0.95}"/>` : ''}
    ${hp && a.hair !== 6 ? `<path d="${hp}" fill="${hair}"/>` : ''}
    ${a.hair === 6 ? `<path d="M33 40 C36 32 42 28 50 28 C58 28 64 32 67 40 C62 34 56 32 50 32 C44 32 38 34 33 40 Z" fill="${hair}"/>` : ''}
    <path d="${brow}" stroke="${shade(hair, 0.9)}" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    <ellipse cx="42.5" cy="${eyeY}" rx="2.3" ry="${a.face === 1 ? 1.6 : 2.4}" fill="#1a1410"/><ellipse cx="57.5" cy="${eyeY}" rx="2.3" ry="${a.face === 1 ? 1.6 : 2.4}" fill="#1a1410"/>
    <circle cx="43.3" cy="${eyeY - 0.9}" r=".8" fill="#fff"/><circle cx="58.3" cy="${eyeY - 0.9}" r=".8" fill="#fff"/>
    <path d="M50 47 L48 53 L51 53.5" stroke="${skinD}" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <path d="${mouth}" stroke="#7a3b2e" stroke-width="2" fill="none" stroke-linecap="round"/>
    ${acc === 'Headband' ? `<path d="M33 36 C40 31 60 31 67 36 L67 40 C60 35 40 35 33 40 Z" fill="${s}"/>` : ''}
    ${acc === 'Earring' ? '<circle cx="32.5" cy="53" r="1.8" fill="#ffd54a"/>' : ''}
    ${acc === 'Gold chain' ? '<path d="M38 74 Q50 84 62 74" stroke="#ffd54a" stroke-width="2" fill="none"/>' : ''}
    ${acc === 'Sweatband' && !g.wrist ? `<rect x="15" y="92" width="10" height="6" rx="2" fill="${s}"/>` : ''}
    ${pg.over}
  </svg>`);
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
