// Vector art: club badges and player portraits, generated from data so every
// club and player has a consistent look.
import { ACCESSORIES, BOOT_COLORS, HAIR_COLORS, SKIN_TONES, type Appearance } from '../shared/appearance.ts';
import { esc, raw, type Raw } from './dom.ts';

let uid = 0;

export const BADGE_SHAPES = ['Shield', 'Roundel', 'Diamond', 'Crest'];
export const BADGE_ICONS = ['Star', 'Ball', 'Bolt', 'Crown', 'Wing', 'Flame'];

const SHAPES = [
  'M50 4 L92 16 V50 C92 76 72 92 50 98 C28 92 8 76 8 50 V16 Z',
  'M50 4 A46 46 0 1 1 49.9 4 Z',
  'M50 3 L95 50 L50 97 L5 50 Z',
  'M14 8 H86 L92 30 C92 66 74 88 50 97 C26 88 8 66 8 30 Z',
];
const ICONS = [
  'M50 26 L56.5 42 L74 43 L60.5 54 L65 71 L50 61.5 L35 71 L39.5 54 L26 43 L43.5 42 Z',
  'M50 30 A20 20 0 1 1 49.9 30 Z M50 38 L57 43 L54.5 51 H45.5 L43 43 Z',
  'M55 24 L36 54 H49 L44 76 L64 44 H51 Z',
  'M30 66 L27 38 L40 50 L50 32 L60 50 L73 38 L70 66 Z',
  'M26 58 C34 40 52 32 76 32 C70 40 62 44 54 46 C62 48 66 52 70 58 C58 58 48 56 40 52 C36 56 32 58 26 58 Z',
  'M50 24 C58 36 68 42 66 58 C64 70 56 76 50 76 C42 76 34 70 34 58 C34 50 40 44 44 38 C46 46 50 48 52 48 C54 40 52 32 50 24 Z',
];

export function badgeSvg(colors: { primary: string; secondary: string }, badge: { shape: number; icon: number }, size = 40, short = ''): Raw {
  const id = `bg${uid++}`;
  const shape = SHAPES[badge.shape % SHAPES.length];
  const icon = ICONS[badge.icon % ICONS.length];
  const p = esc(colors.primary);
  const s = esc(colors.secondary);
  return raw(`<svg class="badge-svg" width="${size}" height="${size}" viewBox="0 0 100 100" aria-label="${esc(short)} badge">
    <defs>
      <linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient>
      <clipPath id="${id}c"><path d="${shape}"/></clipPath>
    </defs>
    <path d="${shape}" fill="${p}"/>
    <g clip-path="url(#${id}c)"><path d="M0 0 H100 L0 100 Z" fill="${s}" opacity=".18"/><rect x="0" y="80" width="100" height="20" fill="${s}" opacity=".9"/></g>
    <path d="${icon}" fill="${s}" stroke="rgba(0,0,0,.25)" stroke-width="1.5"/>
    <path d="${shape}" fill="url(#${id}g)"/>
    <path d="${shape}" fill="none" stroke="${s}" stroke-width="4"/>
    <path d="${shape}" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1"/>
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
export function avatarSvg(a: Appearance, kit: { primary: string; secondary: string } = { primary: '#2a313a', secondary: '#c6ff3d' }, size = 48, number?: number): Raw {
  const id = `av${uid++}`;
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
    </defs>
    <rect width="100" height="100" fill="url(#${id}bg)"/>
    <path d="M14 104 C16 80 30 72 50 72 C70 72 84 80 86 104 Z" fill="${p}"/>
    <path d="M40 72 L50 84 L60 72" fill="none" stroke="${s}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M14 104 C16 86 22 80 30 77 L28 104 Z M86 104 C84 86 78 80 70 77 L72 104 Z" fill="${s}" opacity=".85"/>
    ${number !== undefined ? `<text x="50" y="99" text-anchor="middle" font-family="Barlow Condensed, sans-serif" font-weight="800" font-size="14" fill="${s}">${number}</text>` : ''}
    <rect x="43" y="60" width="14" height="14" rx="4" fill="${skinD}"/>
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
    ${acc === 'Sweatband' ? `<rect x="15" y="92" width="10" height="6" rx="2" fill="${s}"/>` : ''}
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
