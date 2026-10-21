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
  if (replace) history.replaceState(null, '', path);
  else history.pushState(null, '', path);
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

export async function runPage(el: HTMLElement, page: Page, params: string[]) {
  const id = ++renderId;
  if (cleanup) {
    try { cleanup(); } catch { /* ignore */ }
    cleanup = null;
  }
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
