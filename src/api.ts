// Thin JSON client for the game API.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'You appear to be offline');
  }
  let data: unknown = null;
  try {
    data = await r.json();
  } catch {
    /* non-JSON */
  }
  if (!r.ok) throw new ApiError(r.status, (data as { error?: string })?.error ?? `Request failed (${r.status})`);
  return data as T;
}

// Page data cache. Pages open instantly from the last copy (stale-while-revalidate)
// and GETs started by a prefetch are shared with the page that asks next.
const cache = new Map<string, { at: number; json: string }>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_AGE = 10 * 60_000;

function fetchGet<T>(path: string): Promise<T> {
  const running = inflight.get(path);
  if (running) return running as Promise<T>;
  const p = request<T>('GET', path)
    .then((d) => {
      cache.set(path, { at: Date.now(), json: JSON.stringify(d) });
      return d;
    })
    .finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
}

let visit = 0;
let touched = false;
let staleHandler: (() => void) | null = null;
/** A new page visit starts; stale data can only refresh the visit that asked for it. */
export function newVisit() {
  visit++;
  touched = false;
}
/** The player has interacted with this page, so a background refresh must not reset it. */
export function markTouched() {
  touched = true;
}
export function onStaleData(fn: () => void) {
  staleHandler = fn;
}

export const api = {
  get: <T = any>(path: string) => fetchGet<T>(path),
  post: <T = any>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  /** Warm the cache for a page the player is about to open. */
  prefetch(path: string) {
    const c = cache.get(path);
    if (inflight.has(path) || (c && Date.now() - c.at < 8000)) return;
    fetchGet(path).catch(() => {});
  },
  /**
   * Initial data for a page: the cached copy right away when there is one
   * (revalidated in the background, re-rendering the page if it changed and
   * the player hasn't touched it yet), otherwise the network.
   */
  page<T = any>(path: string): Promise<T> {
    const c = cache.get(path);
    if (!c || Date.now() - c.at > MAX_AGE) return fetchGet<T>(path);
    if (Date.now() - c.at > 1500 || inflight.has(path)) {
      const v = visit;
      fetchGet<T>(path)
        .then((d) => { if (JSON.stringify(d) !== c.json && v === visit && !touched) staleHandler?.(); })
        .catch(() => {});
    }
    return Promise.resolve(JSON.parse(c.json) as T);
  },
};
