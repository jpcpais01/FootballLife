// Inline stroke icons (24×24), currentColor.
import { raw, type Raw } from './dom.ts';

const P: Record<string, string> = {
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
  whistle: '<path d="M3 11a5 5 0 1 0 10 0l8-3V5l-9 3.2A5 5 0 0 0 3 11z"/>',
};

export function icon(name: string, size = 20): Raw {
  return raw(`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] ?? ''}</svg>`);
}
