// Where clips come from: hand-made placeholders first, replaced by name with
// converted mocap once a bundle is available. Mirrored copies are made on demand.
import { type Clip, type PackedClip, mirrorClip, unpack } from './clip.ts';
import { placeholderClips } from './placeholder.ts';

let clips: Map<string, Clip> | null = null;
/** The hand-made set, still reachable as `ph:name` after mocap replaces a name. */
let handMade: Map<string, Clip> | null = null;
const mirrored = new Map<string, Clip>();
/** Bumps whenever clips are swapped, so animators drop cached references. */
export let libraryVersion = 0;

function all() {
  if (!clips) {
    handMade = placeholderClips();
    clips = new Map(handMade);
  }
  return clips;
}

/** A clip by name, optionally mirrored left-right. Unknown names fall back to `fallback`. */
export function getClip(name: string, mirror = false, fallback = 'idle'): Clip {
  let m = all();
  if (name.startsWith('ph:')) {
    m = handMade!;
    name = name.slice(3);
  }
  if (mirror && m.has(`${name}_m`)) return m.get(`${name}_m`)!;
  const c = m.get(name) ?? m.get(fallback)!;
  if (!mirror) return c;
  const key = (m === handMade ? 'ph:' : '') + c.name;
  let r = mirrored.get(key);
  if (!r) {
    r = mirrorClip(c, c.name);
    mirrored.set(key, r);
  }
  return r;
}

export function hasClip(name: string) {
  if (name.startsWith('ph:')) return all() && handMade!.has(name.slice(3));
  return all().has(name);
}

/** Adds or replaces clips (e.g. a mocap bundle). */
export function installClips(list: Clip[]) {
  const m = all();
  for (const c of list) {
    m.set(c.name, c);
    mirrored.delete(c.name);
  }
  libraryVersion++;
}

let loading: Promise<void> | null = null;

/** Loads a converted mocap bundle once (see scripts/mixamo-convert.mjs). Failures keep the placeholders. */
export function loadMocap(url: string): Promise<void> {
  if (!loading) {
    loading = fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`mocap ${r.status}`))))
      .then((b: { clips: PackedClip[] }) => installClips(b.clips.map(unpack)))
      .catch((e) => console.warn('[rig] mocap unavailable, using hand-made motion', e));
  }
  return loading;
}
