// Match event glyphs (24×24) for commentary, the ticker and the data board.
// Each one carries its own colours, so it reads at a glance on dark glass.
import { raw, type Raw } from './dom.ts';

const LIME = '#c6ff3d';
const AMBER = '#ffbf3c';
const RED = '#ff5a5f';
const BLUE = '#55b8ff';
const WHITE = '#f4f6f8';
const MUTED = '#9aa4b1';

const st = (c: string, w = 1.8) => `fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
const ballAt = (x: number, y: number, r: number, c = WHITE) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="#0b0e12" ${st(c, 1.6)}/><path d="M${x} ${y - r * 0.42}l${r * 0.4} ${r * 0.29}-${r * 0.15} ${r * 0.47}h-${r * 0.5}l-${r * 0.15}-${r * 0.47}z" fill="${c}"/>`;

const G: Record<string, string> = {
  kickoff: `${ballAt(12, 12, 8)}<path d="M12 2.5v2M12 19.5v2" ${st(MUTED, 1.4)}/>`,
  halftime: `<circle cx="12" cy="12" r="8.5" ${st(MUTED)}/><path d="M9.5 8.5v7M14.5 8.5v7" ${st(WHITE, 2.4)}/>`,
  fulltime: `<path d="M3.5 11.5a4.5 4.5 0 1 0 9 0l8-2.8V6l-9 2.9a4.5 4.5 0 0 0-8 2.6z" fill="${LIME}" fill-opacity=".18" ${st(LIME)}/><circle cx="8" cy="11.5" r="1.4" fill="${LIME}"/>`,
  goal: `<path d="M2.5 19V6.5h19V19" ${st(WHITE)}/><path d="M6 6.5v12.5M10 6.5v12.5M14 6.5v12.5M18 6.5v12.5M2.5 10.5h19M2.5 14.5h19" ${st(MUTED, 0.8)} stroke-opacity=".7"/>${ballAt(15.5, 15.5, 3.6, LIME)}`,
  save: `<path d="M7 21v-3.5L4.2 12.8a1.6 1.6 0 0 1 2.7-1.7L8.5 13V5.2a1.5 1.5 0 0 1 3 0V11V3.8a1.5 1.5 0 0 1 3 0V11V5a1.5 1.5 0 0 1 3 0v6.5V8a1.5 1.5 0 0 1 3 0v6.5c0 3.2-1.8 5.4-4 6.5z" fill="${BLUE}" fill-opacity=".2" ${st(BLUE, 1.6)}/><path d="M7 18h9" ${st(BLUE, 1.6)}/>`,
  post: `<path d="M5 21V4h14" ${st(WHITE, 2.2)}/><path d="M12.5 9.5l2-2M15 12h3M12.8 14.2l2 2" ${st(AMBER, 1.6)}/>${ballAt(9.5, 12, 3.2, AMBER)}`,
  block: `<path d="M12 2.8l7.5 2.7v6c0 4.7-3.2 8.2-7.5 9.7-4.3-1.5-7.5-5-7.5-9.7v-6z" fill="${MUTED}" fill-opacity=".18" ${st(WHITE, 1.7)}/><path d="M8.5 12.5l2.5 2.5 4.5-5" ${st(WHITE, 1.8)}/>`,
  miss: `<path d="M3 20V9h9" ${st(MUTED, 1.8)}/><path d="M7 16c3-5 7-8 13-10M15.5 5.2L20 6l-1.6 4.3" ${st(WHITE, 1.8)}/>`,
  penalty: `<path d="M3 5h18M7 5v8h10V5" ${st(MUTED, 1.6)}/><path d="M9 13a3 3 0 0 0 6 0" ${st(MUTED, 1.6)}/><circle cx="12" cy="18.5" r="1.6" fill="${RED}"/><path d="M12 7.5v2.5" ${st(RED, 2.2)}/>`,
  yellow: `<rect x="7" y="3.5" width="10.5" height="15" rx="2" transform="rotate(10 12 12)" fill="${AMBER}"/><rect x="7" y="3.5" width="10.5" height="15" rx="2" transform="rotate(10 12 12)" fill="none" stroke="#000" stroke-opacity=".25"/>`,
  red: `<rect x="7" y="3.5" width="10.5" height="15" rx="2" transform="rotate(10 12 12)" fill="${RED}"/><rect x="7" y="3.5" width="10.5" height="15" rx="2" transform="rotate(10 12 12)" fill="none" stroke="#000" stroke-opacity=".25"/>`,
  foul: `<path d="M3.5 12.5a4.5 4.5 0 1 0 9 0l8-2.8V7l-9 2.9a4.5 4.5 0 0 0-8 2.6z" fill="${AMBER}" fill-opacity=".18" ${st(AMBER)}/><circle cx="8" cy="12.5" r="1.4" fill="${AMBER}"/><path d="M15 3.5l1 2M19 4l-.8 2" ${st(AMBER, 1.4)}/>`,
  corner: `<path d="M3 21a8 8 0 0 1 8-8" ${st(MUTED, 1.4)}/><path d="M3 21V3.5" ${st(WHITE, 1.8)}/><path d="M3.5 4h11l-3 3.5 3 3.5h-11z" fill="${LIME}"/>`,
  offside: `<path d="M6 21V3.5" ${st(WHITE, 1.8)}/><path d="M6.5 4h12v8h-12z" fill="${AMBER}"/><path d="M6.5 4h6v4h-6zM12.5 8h6v4h-6z" fill="${RED}"/>`,
  freekick: `<circle cx="12" cy="12" r="8.5" ${st(AMBER, 1.6)}/><circle cx="12" cy="12" r="4.5" ${st(AMBER, 1.6)}/><circle cx="12" cy="12" r="1.5" fill="${AMBER}"/>`,
  through: `<path d="M13.5 2.5L5 13.5h6l-1.5 8 9-11.5h-6z" fill="${LIME}" fill-opacity=".22" ${st(LIME, 1.7)}/>`,
  dribble: `<path d="M3 19c3 0 4-3 6-6s3-6 6-6" ${st(LIME, 1.8)} stroke-dasharray="2.6 2.6"/>${ballAt(17.5, 7, 3.6)}<path d="M2.5 9h3M2 13h2.5" ${st(MUTED, 1.4)}/>`,
  cross: `<path d="M3 18C6 6 15 4 19.5 9.5" ${st(LIME, 1.8)}/><path d="M20.5 5.5l-1 4-4-.8" ${st(LIME, 1.8)}/>${ballAt(19, 17.5, 3)}`,
  star: `<path d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" fill="${LIME}"/>`,
};

export function evIcon(name: string, size = 18): Raw {
  return raw(`<svg class="evi" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${G[name] ?? ''}</svg>`);
}
