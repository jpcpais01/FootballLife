import './styles/main.css';
import { registerSW } from 'virtual:pwa-register';
import { api } from './api.ts';
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
addRoute('/join/:code', () => import('./pages/join.ts').then((m) => m.joinPage));
addRoute('/patch-notes', () => import('./pages/patchnotes.ts').then((m) => m.patchNotesPage));

const root = document.getElementById('app')!;

const NAV = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/club', label: 'My club', icon: 'shield' },
  { href: '/league', label: 'League', icon: 'trophy' },
  { href: '/training', label: 'Training', icon: 'dumbbell' },
  { href: '/shop', label: 'Shop', icon: 'bag' },
  { href: '/clubs', label: 'Clubs', icon: 'users', desktopOnly: true },
];

function navHref(href: string) {
  if (href === '/club') return state.player?.clubId ? `/club/${state.player.clubId}` : '/clubs';
  return href;
}

function isActive(href: string, path: string) {
  const mine = state.player?.clubId ? `/club/${state.player.clubId}` : '';
  if (href === '/') return path === '/';
  if (href === '/club') return !!mine && path === mine;
  if (href === '/clubs') return path.startsWith('/clubs') || (path.startsWith('/club/') && path !== mine);
  return path.startsWith(href);
}

let shellMounted = false;

function meSide() {
  const p = state.player;
  return p ? html`<a href="/player/${p.id}" class="me-chip">${avatarSvg(p.appearance, undefined, 38, undefined, { eq: p.equipped })}<div class="grow"><div class="name ellipsis">${p.name}</div><div class="sub">${p.position} · ${p.ovr} OVR · <span class="lime">${p.coins.toLocaleString()} coins</span></div></div></a>` : html``;
}

function meTop() {
  const p = state.player;
  return html`${p ? html`<a href="/shop" class="chip lime">${icon('coin', 13)} ${p.coins.toLocaleString()}</a>` : ''}
    <a href="/patch-notes" class="muted" aria-label="Patch notes">${icon('notes')}</a>
    ${p ? html`<a href="/player/${p.id}" aria-label="My profile">${avatarSvg(p.appearance, undefined, 34, undefined, { eq: p.equipped })}</a>` : ''}`;
}

function renderShell(path: string) {
  const links = (cls: string, mobile = false) => NAV.filter((n) => !(mobile && n.desktopOnly)).map((n) => html`<a href="${navHref(n.href)}" class="${cls} ${isActive(n.href, path) ? 'active' : ''}">${icon(n.icon)}<span>${n.label}</span>${n.href === '/clubs' || (mobile && n.href === '/club') ? (state.invites ? html`<i class="nav-dot">${state.invites}</i>` : '') : ''}</a>`);
  mount(root, html`<div class="app">
    <aside class="sidebar">
      <a href="/" class="brand">${brandMark()}<span class="wordmark">FOOTBAL<b>LIFE</b></span></a>
      ${links('nav-link')}
      <a href="/patch-notes" class="nav-link ${path === '/patch-notes' ? 'active' : ''}">${icon('notes')}<span>Patch notes</span></a>
      <div class="spacer"></div>
      <div id="me-side">${meSide()}</div>
      <button class="nav-link" style="border:0;background:none;cursor:pointer;width:100%" data-logout>${icon('logout')}<span>Sign out</span></button>
    </aside>
    <header class="topbar">
      <a href="/" class="row">${brandMark(28)}<span class="wordmark">FOOTBAL<b>LIFE</b></span></a>
      <div class="row" style="gap:14px" id="me-top">${meTop()}</div>
    </header>
    <main id="page"></main>
    <nav class="tabbar">${links('', true)}</nav>
  </div>`);
  root.querySelector('[data-logout]')?.addEventListener('click', async () => {
    await api.post('/api/auth/logout').catch(() => {});
    state.user = null;
    state.player = null;
    navigate('/login', true);
  });
  shellMounted = true;
}

function updateNav(path: string) {
  for (const group of [root.querySelectorAll<HTMLAnchorElement>('.sidebar .nav-link[href]'), root.querySelectorAll<HTMLAnchorElement>('.tabbar a')]) {
    group.forEach((a, i) => {
      const n = (a.closest('.tabbar') ? NAV.filter((x) => !x.desktopOnly) : NAV)[i];
      if (!n) {
        a.classList.toggle('active', path === a.getAttribute('href'));
        return;
      }
      a.href = navHref(n.href);
      a.classList.toggle('active', isActive(n.href, path));
      if (n.href === (a.closest('.tabbar') ? '/club' : '/clubs')) {
        a.querySelector('.nav-dot')?.remove();
        if (state.invites) a.insertAdjacentHTML('beforeend', `<i class="nav-dot">${state.invites}</i>`);
      }
    });
  }
}

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
  el.innerHTML = '';
  try {
    const page = await m.route.page();
    await runPage(el, page, m.params);
  } catch (e) {
    console.error(e);
    mount(el, errorBox((e as Error).message));
  }
}

// Re-render the shell's player chip when coins/ovr/club change.
// Refresh the player chip, coins and invite dots in place when the player changes.
// (The page element must survive: pages keep listeners on it.)
document.addEventListener('me-changed', () => {
  if (!shellMounted || !state.player) return;
  const side = document.getElementById('me-side');
  const top = document.getElementById('me-top');
  if (side) side.innerHTML = meSide().html;
  if (top) top.innerHTML = meTop().html;
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
