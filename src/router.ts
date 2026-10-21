// Minimal History API router.
export type Cleanup = void | (() => void);
export type Page = (el: HTMLElement, params: string[]) => Cleanup | Promise<Cleanup>;

interface Route {
  re: RegExp;
  page: () => Promise<Page>;
  shell: boolean;
}

const routes: Route[] = [];
let cleanup: (() => void) | null = null;
let renderId = 0;
let renderFn: (path: string) => Promise<void> = async () => {};

export function addRoute(path: string, page: () => Promise<Page>, shell = true) {
  routes.push({ re: new RegExp('^' + path.replace(/:[a-z]+/g, '([^/]+)') + '/?$'), page, shell });
}

export function match(path: string) {
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) return { route: r, params: m.slice(1).map(decodeURIComponent) };
  }
  return null;
}

export function navigate(path: string, replace = false) {
  // `idx` counts in-app steps, so a back button knows whether there is a page to go back to.
  const idx: number = history.state?.idx ?? 0;
  if (replace) history.replaceState({ idx }, '', path);
  else history.pushState({ idx: idx + 1 }, '', path);
  void renderFn(location.pathname);
  window.scrollTo({ top: 0 });
}

export function startRouter(render: (path: string) => Promise<void>) {
  renderFn = render;
  window.addEventListener('popstate', () => void renderFn(location.pathname));
  document.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null;
    if (!a || a.target || a.hasAttribute('download') || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const raw = a.getAttribute('href') ?? '';
    if (raw.startsWith('#') || raw.startsWith('javascript:')) return;
    const url = new URL(a.href);
    if (url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
    e.preventDefault();
    navigate(url.pathname + url.search);
  });
  void renderFn(location.pathname);
}

// Pages attach listeners to the long-lived page element. Each visit gets its
// own AbortSignal so those listeners go away with the page instead of piling up.
let listeners = new AbortController();
const scoped = new WeakSet<HTMLElement>();
function scopeListeners(el: HTMLElement) {
  if (scoped.has(el)) return;
  scoped.add(el);
  const native = el.addEventListener.bind(el);
  el.addEventListener = ((type: string, fn: EventListenerOrEventListenerObject, opts?: boolean | AddEventListenerOptions) => {
    const o = typeof opts === 'object' ? opts : { capture: !!opts };
    native(type, fn, { ...o, signal: o.signal ?? listeners.signal });
  }) as typeof el.addEventListener;
}

export async function runPage(el: HTMLElement, page: Page, params: string[]) {
  const id = ++renderId;
  if (cleanup) {
    try { cleanup(); } catch { /* ignore */ }
    cleanup = null;
  }
  listeners.abort();
  listeners = new AbortController();
  scopeListeners(el);
  const c = await page(el, params);
  if (id !== renderId) {
    if (typeof c === 'function') c();
    return;
  }
  cleanup = typeof c === 'function' ? c : null;
}

export function isCurrent(id: number) {
  return id === renderId;
}
