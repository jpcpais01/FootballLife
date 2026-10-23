// Player portraits: shots of the 3D player model, rendered in the background
// and cached, so the same face shows on the pitch and everywhere in the menus.
import type { Appearance } from '../shared/appearance.ts';
import type { Equipped } from '../shared/cosmetics.ts';
import { esc, raw, type Raw } from './dom.ts';

type Kit = { primary: string; secondary: string };
interface Job { app: Appearance; kit: Kit; eq?: Equipped; px: number; full: boolean; casual?: boolean }

const DEFAULT_KIT: Kit = { primary: '#2a313a', secondary: '#c6ff3d' };
const cache = new Map<string, string>();
const jobs = new Map<string, Job>();
let running = false;
type Render = typeof import('./viewer/portraitRender.ts').renderPortrait;
let render: Render | null = null;
async function renderer(): Promise<Render> {
  if (!render) {
    const m = await import('./viewer/portraitRender.ts');
    await m.portraitsReady();
    render = m.renderPortrait;
  }
  return render;
}

const keyOf = (j: Job) => JSON.stringify([j.app, j.kit.primary, j.kit.secondary, j.eq ?? null, j.px, j.full, !!j.casual]);

/** Image size to render for a portrait shown at `size` CSS pixels. */
const bucket = (size: number) => (size * Math.min(2, window.devicePixelRatio || 1) > 200 ? 512 : size > 56 ? 256 : 128);

/**
 * A player portrait. Returns an <img> right away; until the 3D shot is ready it
 * shows a soft disc in the club colour, then fills in.
 */
export function portrait(a: Appearance, kit: Kit = DEFAULT_KIT, size = 48, opts: { eq?: Equipped; full?: boolean; cls?: string; casual?: boolean } = {}): Raw {
  const job: Job = { app: a, kit: kit ?? DEFAULT_KIT, eq: opts.eq, px: bucket(size), full: !!opts.full, casual: !!opts.casual };
  const key = keyOf(job);
  const src = cache.get(key);
  if (!src) queue(key, job);
  const ph = `background:radial-gradient(circle at 50% 35%, ${esc(job.kit.primary)}, #0b0e12 90%)`;
  return raw(`<img class="avatar av3d ${opts.cls ?? ''}" data-avk="${esc(key)}" width="${size}" height="${size}" alt="" draggable="false" style="${src ? '' : ph}" ${src ? `src="${src}"` : ''}>`);
}

/** Renders a portrait now and returns its image URL (for the editor's option tiles). */
export async function portraitUrl(a: Appearance, kit: Kit, px = 128, eq?: Equipped): Promise<string> {
  const job: Job = { app: a, kit, eq, px, full: false };
  const key = keyOf(job);
  const hit = cache.get(key);
  if (hit) return hit;
  const url = await (await renderer())(job.app, job.kit, job.eq, job.px);
  cache.set(key, url);
  return url;
}

function queue(key: string, job: Job) {
  jobs.set(key, job);
  if (!running) {
    running = true;
    setTimeout(drain, 0);
  }
}

async function drain() {
  try {
    const render = await renderer();
    while (jobs.size) {
      const [key, job] = jobs.entries().next().value!;
      jobs.delete(key);
      let url = cache.get(key);
      if (!url) {
        try {
          url = await render(job.app, job.kit, job.eq, job.px, { full: job.full, casual: job.casual });
        } catch {
          continue;
        }
        cache.set(key, url);
      }
      for (const img of document.querySelectorAll<HTMLImageElement>('img.av3d')) {
        if (img.dataset.avk === key) {
          img.src = url;
          img.style.background = '';
        }
      }
      // Let the page breathe between shots.
      await new Promise((r) => setTimeout(r, 0));
    }
  } finally {
    running = false;
    if (jobs.size) queue(...(jobs.entries().next().value as [string, Job]));
  }
}
