import './styles/main.css';
import { registerSW } from 'virtual:pwa-register';
import { api, markTouched, newVisit, onStaleData } from './api.ts';
import { avatarSvg, brandMark } from './art.ts';
import { html, mount } from './dom.ts';
import { icon } from './icons.ts';
import { addRoute, match, navigate, runPage, startRouter } from './router.ts';
import { refreshMe, state } from './state.ts';
import { errorBox } from './ui.ts';
import { fullscreenOnFirstTap } from './fullscreen.ts';

registerSW({ immediate: true });

addRoute('/', () => import('./pages/home.ts').then((m) => m.homePage));
addRoute('/login', () => import('./pages/auth.ts').then((m) => m.authPage), false);
addRoute('/create', () => import('./pages/create.ts').then((m) => m.createPage), false);
addRoute('/clubs/new', () => import('./pages/clubs.ts').then((m) => m.newClubPage));
addRoute('/clubs', () => import('./pages/clubs.ts').then((m) => m.clubsPage));
addRoute('/club/:id', () => import('./pages/club.ts').then((m) => m.clubPage));
addRoute('/league', () => import('./pages/league.ts').then((m) => m.leaguePage));
addRoute('/match/:id', () => import('./pages/match.ts').then((m) => m.matchPage));
addRoute('/player/:id', () => import('./pages/player.ts').then((m) => m.playerPage));
addRoute('/training', () => import('./pages/training.ts').then((m) => m.trainingPage));
addRoute('/shop', () => import('./pages/shop.ts').then((m) => m.shopPage));
addRoute('/shop/:tab', () => import('./pages/shop.ts').then((m) => m.shopPage));
addRoute('/house', () => import('./pages/house.ts').then((m) => m.housePage));
addRoute('/house/:id', () => import('./pages/house.ts').then((m) => m.housePage));
addRoute('/transfers', () => import('./pages/transfers.ts').then((m) => m.transfersPage));
addRoute('/join/:code', () => import('./pages/join.ts').then((m) => m.joinPage));
addRoute('/patch-notes', () => import('./pages/patchnotes.ts').then((m) => m.patchNotesPage));

// The API data each page opens with, so it can be fetched before the tap lands.
function dataFor(path: string): string | null {
  const [, a, b] = path.split('?')[0].split('/');
  if (!a || a === 'training') return '/api/home';
  if (a === 'league' || a === 'shop' || a === 'transfers' || (a === 'clubs' && !b)) return `/api/${a}`;
  if (a === 'club' && b) return `/api/clubs/${b}`;
  if (a === 'player' && b) return `/api/players/${b}`;
  if (a === 'house') return b || state.player ? `/api/house/${b ?? state.player!.id}` : null;
  return null;
}
const warmed = new Set<string>();
function prefetch(path: string) {
  const m = match(path.split('?')[0]);
  if (!m || !state.player) return;
  if (!warmed.has(m.route.re.source)) { warmed.add(m.route.re.source); void m.route.page().catch(() => {}); }
  const d = dataFor(path);
  if (d) api.prefetch(d);
}
const hrefOf = (t: EventTarget | null) => {
  const el = (t as HTMLElement | null)?.closest?.('a[href], [data-href]') as HTMLElement | null;
  const h = el?.getAttribute('href') ?? el?.dataset.href;
  return h && h.startsWith('/') && !h.startsWith('/api/') ? h : null;
};
// Start loading on press (and hover with a mouse), ~100 ms before the click fires.
document.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest?.('#page')) markTouched();
  const h = hrefOf(e.target);
  if (h) prefetch(h);
}, { capture: true, passive: true });
document.addEventListener('keydown', (e) => { if ((e.target as HTMLElement).closest?.('#page')) markTouched(); }, { capture: true });
document.addEventListener('pointerover', (e) => {
  if (e.pointerType !== 'mouse') return;
  const h = hrefOf(e.target);
  if (h) prefetch(h);
}, { passive: true });
// Once the app is up, quietly load every page's code and the main tabs' data.
let warmedUp = false;
function warmUp() {
  if (warmedUp || !state.player) return;
  warmedUp = true;
  const idle = (fn: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1200));
  idle(() => {
    for (const p of ['/', '/league', '/training', '/shop', '/clubs', '/transfers', '/house', '/patch-notes', '/match/x', '/player/x', '/club/x']) {
      const m = match(p);
      if (m && !warmed.has(m.route.re.source)) { warmed.add(m.route.re.source); void m.route.page().catch(() => {}); }
    }
    const mine = [state.player?.clubId ? `/club/${state.player.clubId}` : '/clubs', '/league', '/shop', '/'];
    mine.forEach((p, i) => setTimeout(() => { const d = dataFor(p); if (d) api.prefetch(d); }, 400 * i));
  });
}

const root = document.getElementById('app')!;

const NAV = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/club', label: 'My club', icon: 'shield' },
  { href: '/league', label: 'League', icon: 'trophy' },
  { href: '/training', label: 'Training', icon: 'dumbbell' },
  { href: '/shop', label: 'Shop', icon: 'bag' },
  { href: '/house', label: 'My home', icon: 'sofa' },
  { href: '/transfers', label: 'Transfers', icon: 'swap' },
  { href: '/clubs', label: 'Clubs', icon: 'users' },
];

// The phone menu: a scrolling row of mini tiles, the same ones as the home screen rail.
const DOCK = [
  { href: '/', label: 'Home', icon: 'home', accent: '#c6ff3d' },
  { href: '/club', label: 'My club', icon: 'shield', accent: '#3d6bff' },
  { href: '/training', label: 'Training', icon: 'dumbbell', accent: '#3dd6ff' },
  { href: '/league', label: 'League', icon: 'trophy', accent: '#ffcf3d' },
  { href: '/shop', label: 'Shop', icon: 'bag', accent: '#ff4d9d' },
  { href: '/house', label: 'My home', icon: 'sofa', accent: '#ff9a3d' },
  { href: '/transfers', label: 'Transfers', icon: 'swap', accent: '#8a6bff' },
  { href: '/clubs', label: 'Clubs', icon: 'users', accent: '#e3e8ee' },
  { href: '/me', label: 'Profile', icon: 'user', accent: '#c6ff3d' },
];

function navHref(href: string) {
  if (href === '/club') return state.player?.clubId ? `/club/${state.player.clubId}` : '/clubs';
  if (href === '/me') return state.player ? `/player/${state.player.id}` : '/';
  return href;
}

function isActive(href: string, path: string) {
  const mine = state.player?.clubId ? `/club/${state.player.clubId}` : '';
  if (href === '/') return path === '/';
  if (href === '/club') return !!mine && path === mine;
  if (href === '/clubs') return path.startsWith('/clubs') || (path.startsWith('/club/') && path !== mine);
  if (href === '/house') return path === '/house' || path === `/house/${state.player?.id}`;
  if (href === '/me') return !!state.player && path === `/player/${state.player.id}`;
  return path.startsWith(href);
}

let shellMounted = false;
let enterSeq = 0;
// A background refresh found newer data: re-run the page in place, keeping the scroll.
let quiet = false;
onStaleData(() => {
  const y = window.scrollY;
  quiet = true;
  void render(location.pathname).then(() => window.scrollTo({ top: y }));
});

const clockText = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function meTop() {
  const p = state.player;
  if (!p) return html``;
  return html`<a href="/shop" class="coin-chip" aria-label="Coins">${icon('coin', 15)}<b>${p.coins.toLocaleString()}</b></a>
    <a href="/" class="top-icon ${state.unread ? 'has-dot' : ''}" aria-label="Inbox" data-inbox>${icon('bell', 19)}</a>
    <button class="top-avatar" data-menu aria-label="Menu">${avatarSvg(p.appearance, state.club?.colors, 36, undefined, { eq: p.equipped })}</button>`;
}

function menu() {
  const p = state.player;
  return html`<div class="user-menu" id="user-menu" hidden>
    ${p ? html`<a href="/player/${p.id}" class="um-head">${avatarSvg(p.appearance, state.club?.colors, 44, undefined, { eq: p.equipped })}<div class="grow"><div class="name ellipsis">${p.name}</div><div class="sub">${p.position} · ${p.ovr} OVR${state.club ? ` · ${state.club.short}` : ''}</div></div></a>` : ''}
    <a href="${p ? `/player/${p.id}` : '/'}">${icon('user', 17)} Profile</a>
    <a href="/house">${icon('sofa', 17)} My home</a>
    <a href="/transfers">${icon('swap', 17)} Transfers</a>
    <a href="/clubs">${icon('users', 17)} Clubs</a>
    <a href="/patch-notes">${icon('notes', 17)} Patch notes</a>
    <button data-logout>${icon('logout', 17)} Sign out</button>
  </div>`;
}

/** Tints the ambient background with your club colours. */
function applyTint() {
  const c = state.club?.colors;
  document.documentElement.style.setProperty('--tint-a', c?.primary ?? '#3d6bff');
  document.documentElement.style.setProperty('--tint-b', c?.secondary ?? '#c6ff3d');
}

function renderShell(path: string) {
  const links = (cls: string) => NAV.map((n) => html`<a href="${navHref(n.href)}" class="${cls} ${isActive(n.href, path) ? 'active' : ''}" title="${n.label}">${icon(n.icon)}<span>${n.label}</span>${n.href === '/clubs' && state.invites ? html`<i class="nav-dot">${state.invites}</i>` : ''}</a>`);
  mount(root, html`<div class="app">
    <div class="ambient" aria-hidden="true"><i class="a1"></i><i class="a2"></i><i class="a3"></i><div class="grain"></div></div>
    <header class="topnav">
      <a href="/" class="brand" aria-label="FootbalLife home">${brandMark(30)}<span class="wordmark">FOOTBAL<b>LIFE</b></span></a>
      <nav class="topnav-links">${links('tn-link')}</nav>
      <div class="topnav-right" >
        <div class="row" style="gap:10px" id="me-top">${meTop()}</div>
        <div class="clock" id="clock">${clockText()}</div>
      </div>
      ${menu()}
    </header>
    <nav class="dock" aria-label="Main menu">${DOCK.map((n, i) => html`<a href="${navHref(n.href)}" class="dk ${isActive(n.href, path) ? 'active' : ''}" style="--accent:${n.href === '/club' && state.club ? state.club.colors.primary : n.accent};--i:${i}"><i class="dk-face">${icon(n.icon)}</i><span>${n.label}</span>${n.href === '/club' && state.invites ? html`<b class="nav-dot">${state.invites}</b>` : ''}</a>`)}</nav>
    <main id="page"></main>
  </div>`);
  dockState(path, true);
  applyTint();
  shellMounted = true;
}

function updateNav(path: string) {
  root.querySelectorAll<HTMLAnchorElement>('.topnav-links a').forEach((a, i) => {
    const n = NAV[i];
    if (!n) return;
    a.href = navHref(n.href);
    a.classList.toggle('active', isActive(n.href, path));
    if (n.href === '/clubs') {
      a.querySelector('.nav-dot')?.remove();
      if (state.invites) a.insertAdjacentHTML('beforeend', `<i class="nav-dot">${state.invites}</i>`);
    }
  });
  root.querySelectorAll<HTMLAnchorElement>('.dock a').forEach((a, i) => {
    const n = DOCK[i];
    a.href = navHref(n.href);
    a.classList.toggle('active', isActive(n.href, path));
    if (n.href === '/club') {
      a.querySelector('.nav-dot')?.remove();
      if (state.invites) a.insertAdjacentHTML('beforeend', `<b class="nav-dot">${state.invites}</b>`);
    }
  });
  dockState(path);
  closeMenu();
}

/** The home screen has its own big rail, so the dock hides there; elsewhere it keeps the current page in view. */
function dockState(path: string, first = false) {
  const app = root.querySelector('.app');
  app?.classList.toggle('at-home', path === '/');
  const dock = root.querySelector<HTMLElement>('.dock');
  const on = dock?.querySelector<HTMLElement>('.active');
  if (!dock || !on || path === '/') return;
  const x = on.offsetLeft - (dock.clientWidth - on.offsetWidth) / 2;
  dock.scrollTo({ left: Math.max(0, x), behavior: first ? 'auto' : 'smooth' });
}

function closeMenu() {
  const m = document.getElementById('user-menu');
  if (m) m.hidden = true;
}

// Shell-level clicks: the user menu and sign out. Bound once on the root.
root.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('[data-menu]')) {
    const m = document.getElementById('user-menu');
    if (m) m.hidden = !m.hidden;
    return;
  }
  if (t.closest('[data-logout]')) {
    closeMenu();
    await api.post('/api/auth/logout').catch(() => {});
    state.user = null;
    state.player = null;
    shellMounted = false;
    navigate('/login', true);
    return;
  }
  if (!t.closest('#user-menu')) closeMenu();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });
setInterval(() => {
  const c = document.getElementById('clock');
  if (c) c.textContent = clockText();
}, 10_000);

async function render(path: string) {
  try {
    if (!state.loaded) await refreshMe();
  } catch {
    state.loaded = false;
  }
  // Auth gates. Invite links survive signing up.
  if (!state.user && path.startsWith('/join/')) safeSet('fl-next', path);
  if (!state.user && path !== '/login' && path !== '/patch-notes') return navigate('/login', true);
  if (state.user && state.player) {
    const next = safeTake('fl-next');
    if (next && next !== path) return navigate(next, true);
  }
  if (state.user && !state.player && path !== '/create' && path !== '/patch-notes') return navigate('/create', true);
  if (state.user && state.player && (path === '/login' || path === '/create')) return navigate('/', true);

  const m = match(path);
  if (!m) return navigate('/', true);
  let el: HTMLElement;
  if (m.route.shell && state.user) {
    if (!shellMounted || !document.getElementById('page')) renderShell(path);
    else updateNav(path);
    el = document.getElementById('page')!;
  } else {
    shellMounted = false;
    el = root;
  }
  newVisit();
  if (quiet) {
    quiet = false;
  } else {
    el.innerHTML = '';
    el.classList.remove('page-enter');
    void el.offsetWidth;
    el.classList.add('page-enter');
    const enter = ++enterSeq;
    setTimeout(() => { if (enter === enterSeq) el.classList.remove('page-enter'); }, 400);
  }
  warmUp();
  try {
    const page = await m.route.page();
    await runPage(el, page, m.params);
  } catch (e) {
    console.error(e);
    mount(el, errorBox((e as Error).message));
  }
}

// Refresh the coins, avatar, menu and badges in place when the player changes.
// (The page element must survive: pages keep listeners on it.)
document.addEventListener('me-changed', () => {
  if (!shellMounted || !state.player) return;
  const top = document.getElementById('me-top');
  if (top) top.innerHTML = meTop().html;
  const m = document.getElementById('user-menu');
  if (m) m.outerHTML = menu().html;
  applyTint();
  updateNav(location.pathname);
});

function safeSet(k: string, v: string) {
  try { sessionStorage.setItem(k, v); } catch { /* storage unavailable */ }
}
function safeTake(k: string) {
  try {
    const v = sessionStorage.getItem(k);
    if (v) sessionStorage.removeItem(k);
    return v;
  } catch {
    return null;
  }
}

startRouter(render);
fullscreenOnFirstTap();
