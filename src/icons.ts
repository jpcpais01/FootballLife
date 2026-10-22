// Inline stroke icons (24×24), currentColor.
import { raw, type Raw } from './dom.ts';

const P: Record<string, string> = {
  chart: '<path d="M3 20h18M5 16l4-5 4 3 6-8"/><circle cx="19" cy="6" r="1.2"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a3 3 0 0 0 4 3M16 6h4v1a3 3 0 0 1-4 3M12 13v4M8 21h8M9 17h6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  dumbbell: '<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/>',
  play: '<path d="M7 4.5v15l13-7.5z"/>',
  pause: '<path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  top: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 4v16M4 12h4M16 12h4"/><circle cx="12" cy="12" r="2.5"/>',
  fast: '<path d="M4 6v12l8-6zM12 6v12l8-6z"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M14.5 9.2c-.6-.8-1.5-1.2-2.5-1.2-1.6 0-2.8.9-2.8 2 0 2.6 5.6 1.4 5.6 4 0 1.1-1.2 2-2.8 2-1.1 0-2.1-.5-2.6-1.3M12 6.5V8M12 16v1.5"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  notes: '<path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/>',
  ball: '<circle cx="12" cy="12" r="8.5"/><path d="m12 7.5 3.2 2.3-1.2 3.8h-4l-1.2-3.8zM12 3.5v4M15.2 9.8l4-1.3M14 13.6l2.4 3.4M10 13.6 7.6 17M8.8 9.8l-4-1.3"/>',
  bag: '<path d="M5 8h14l-1 12H6zM9 8V6a3 3 0 0 1 6 0v2"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14a4.2 4.2 0 0 0 7 0"/><circle cx="9.2" cy="9.8" r=".9"/><circle cx="14.8" cy="9.8" r=".9"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/>',
  medal: '<circle cx="12" cy="15" r="5"/><path d="M8.5 11 6 3h4l2 5 2-5h4l-2.5 8"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  car: '<path d="M4 16v-3l2-5h12l2 5v3zM4 16v2h3v-2M17 16v2h3v-2M6.5 13h11"/><circle cx="7.5" cy="14.5" r=".6"/><circle cx="16.5" cy="14.5" r=".6"/>',
  shirt: '<path d="M8 3 3 6l2 4 2-1v12h10V9l2 1 2-4-5-3a4 4 0 0 1-8 0z"/>',
  swap: '<path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4"/>',
  sofa: '<path d="M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M3 11h18v6H3zM5 17v2M19 17v2"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>',
  paint: '<path d="M4 4h13v5H4zM17 6.5h3v5h-8.5V15M10 15h3v6h-3z"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5M4 4v4h4M4 13a8 8 0 0 0 14.6 4.5M20 20v-4h-4"/>',
  whistle: '<path d="M3 11a5 5 0 1 0 10 0l8-3V5l-9 3.2A5 5 0 0 0 3 11z"/>',
};

export function icon(name: string, size = 20): Raw {
  return raw(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`);
}

// The menu set: duotone glyphs drawn for the dock. Each has a soft fill (.d),
// a crisp outline, and one accent detail (.k) that picks up the tile colour.
const N: Record<string, string> = {
  home: '<path class="d" d="M5 10 12 4.2 19 10v9a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19z"/>'
    + '<path d="M3 11.2 12 3.6l9 7.6M5 9.6V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V9.6"/>'
    + '<path class="k" d="M10 20.5v-3.8a2 2 0 0 1 4 0v3.8"/>',
  club: '<path class="d" d="M12 3 5 5.6v5.9c0 4.6 3 7.9 7 9.5 4-1.6 7-4.9 7-9.5V5.6z"/>'
    + '<path d="M12 3 5 5.6v5.9c0 4.6 3 7.9 7 9.5 4-1.6 7-4.9 7-9.5V5.6z"/>'
    + '<path class="k f" d="M12 7.8 12.85 10.03 15.23 10.15 13.38 11.65 14 13.95 12 12.65 10 13.95 10.62 11.65 8.77 10.15 11.15 10.03z"/>',
  match: '<circle class="d" cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="8.5"/>'
    + '<path d="M12.00 8.70L12.00 5.90M12.00 5.90L8.53 4.24M12.00 5.90L15.47 4.24M15.14 10.98L17.80 10.11M17.80 10.11L18.31 6.31M17.80 10.11L20.45 12.90M13.94 14.67L15.59 16.94M15.59 16.94L19.37 16.24M15.59 16.94L13.76 20.32M10.06 14.67L8.41 16.94M8.41 16.94L10.24 20.32M8.41 16.94L4.63 16.24M8.86 10.98L6.20 10.11M6.20 10.11L3.55 12.90M6.20 10.11L5.69 6.31"/>'
    + '<path class="k f" d="M12 8.7 15.14 10.98 13.94 14.67H10.06L8.86 10.98z"/>',
  training: '<path class="d" d="M10.4 4h3.2l4.6 15.5H5.8z"/>'
    + '<path d="M10.4 4h3.2l4.6 15.5H5.8zM3.5 20h17"/>'
    + '<path class="k" d="M8.9 9.6h6.2M7.6 14.2h8.8"/>',
  league: '<path class="d" d="M7.5 3.8h9v5.7a4.5 4.5 0 0 1-9 0z"/>'
    + '<path d="M7.5 3.8h9v5.7a4.5 4.5 0 0 1-9 0zM7.5 5.8h-3v1a3.4 3.4 0 0 0 3.2 3.4M16.5 5.8h3v1a3.4 3.4 0 0 1-3.2 3.4M12 14v3.2M8.5 17.2h7v3.3h-7z"/>'
    + '<path class="k f" d="M12 6.1 12.53 7.47 14 7.55 12.86 8.48 13.23 9.9 12 9.1 10.77 9.9 11.14 8.48 10 7.55 11.47 7.47z"/>',
  shop: '<path class="d" d="M8.6 3.6 4 6.2l-1.6 4.4 3.3 1.3L7 10.4v10.1h10V10.4l1.3 1.5 3.3-1.3L20 6.2l-4.6-2.6a3.4 3.4 0 0 1-6.8 0z"/>'
    + '<path d="M8.6 3.6 4 6.2l-1.6 4.4 3.3 1.3L7 10.4v10.1h10V10.4l1.3 1.5 3.3-1.3L20 6.2l-4.6-2.6"/>'
    + '<path class="k" d="M8.6 3.6a3.4 3.4 0 0 0 6.8 0M10 14.5h4"/>',
  house: '<path class="d" d="M3 12.6a1.6 1.6 0 0 1 3.2 0V14h11.6v-1.4a1.6 1.6 0 0 1 3.2 0V18H3z"/>'
    + '<path d="M5.2 11V8.6A2.6 2.6 0 0 1 7.8 6h8.4a2.6 2.6 0 0 1 2.6 2.6V11M3 12.6a1.6 1.6 0 0 1 3.2 0V14h11.6v-1.4a1.6 1.6 0 0 1 3.2 0V18H3zM5.5 18v2M18.5 18v2"/>'
    + '<path class="k" d="M12 6.6V13.6"/>',
  transfers: '<circle class="d" cx="12" cy="12" r="7.5"/>'
    + '<path d="M4.6 10.4A7.6 7.6 0 0 1 18 6.8M18.8 3.3v3.9h-3.9M19.4 13.6A7.6 7.6 0 0 1 6 17.2M5.2 20.7v-3.9h3.9"/>'
    + '<circle class="k f" cx="12" cy="12" r="2.3"/>',
  clubs: '<path class="d" d="M10 6.2 4 8.4v4.5c0 3.9 2.6 6.6 6 8 3.4-1.4 6-4.1 6-8V8.4z"/>'
    + '<path d="M10 6.2 4 8.4v4.5c0 3.9 2.6 6.6 6 8 3.4-1.4 6-4.1 6-8V8.4zM13.4 4.7 15 4.1l5 1.9v4.5c0 3-1.6 5.3-4 6.8"/>'
    + '<path class="k" d="m7.4 12.4 2.6 1.9 2.6-1.9"/>',
  profile: '<path class="d" d="M4.5 20.5c.5-3.9 3.6-6.6 7.5-6.6s7 2.7 7.5 6.6z"/>'
    + '<circle cx="12" cy="7.8" r="3.7"/><path d="M4.5 20.5c.5-3.9 3.6-6.6 7.5-6.6s7 2.7 7.5 6.6z"/>'
    + '<path class="k" d="M10 14.2 12 17l2-2.8"/>',
};

export function navIcon(name: string, size = 24): Raw {
  return raw(`<svg class="nv" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${N[name] ?? ''}</svg>`);
}
