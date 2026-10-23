import './styles/main.css';
import { registerSW } from 'virtual:pwa-register';
import { api, markTouched, newVisit, onStaleData } from './api.ts';
import { avatar } from './art.ts';
import { html, mount } from './dom.ts';
import { icon, navIcon } from './icons.ts';
import { addRoute, match, navigate, runPage, startRouter } from './router.ts';
import { refreshMe, state } from './state.ts';
import { errorBox, relTime } from './ui.ts';
import { fullscreenOnFirstTap } from './fullscreen.ts';
import { initSound, setScene, setSoundPrefs, soundPrefs } from './audio.ts';
import { openDaily, watchDaily } from './daily.ts';

const dailyDue = () => !!state.daily && (state.daily.checkin || state.daily.ready.length > 0);

// New deploys install in the background and switch over while the game is out
// of sight, never by reloading the page under the player.
let swUpdate: ((reload?: boolean) => Promise<void>) | null = null;
let swReg: ServiceWorkerRegistration | undefined;
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    swUpdate = updateSW;
    if (document.hidden) void updateSW(true);
  },
  onRegisteredSW(_url, reg) {
    swReg = reg;
  },
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && swUpdate) void swUpdate(true);
  else if (!document.hidden) void swReg?.update().catch(() => {});
});

addRoute('/', () => import('./pages/home.ts').then((m) => m.homePage));
addRoute('/login', () => import('./pages/auth.ts').then((m) => m.authPage), false);
addRoute('/create', () => import('./pages/create.ts').then((m) => m.createPage), false);
addRoute('/clubs/new', () => import('./pages/clubs.ts').then((m) => m.newClubPage));
addRoute('/clubs', () => import('./pages/clubs.ts').then((m) => m.clubsPage));
addRoute('/club/:id/edit', () => import('./pages/clubs.ts').then((m) => m.editClubPage));
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
  { href: '/', label: 'Home', icon: 'home', accent: 'var(--lime)' },
  { href: '/club', label: 'My club', icon: 'club', accent: '#3d6bff' },
  { href: '/training', label: 'Training', icon: 'training', accent: '#3dd6ff' },
  { href: '/league', label: 'League', icon: 'league', accent: '#ffcf3d' },
  { href: '/shop', label: 'Shop', icon: 'shop', accent: '#ff4d9d' },
  { href: '/house', label: 'My home', icon: 'house', accent: '#ff9a3d' },
  { href: '/transfers', label: 'Transfers', icon: 'transfers', accent: '#8a6bff' },
  { href: '/clubs', label: 'Clubs', icon: 'clubs', accent: '#4fe3b0' },
  { href: '/me', label: 'Profile', icon: 'profile', accent: 'var(--lime)' },
];

function dockHtml(path: string) {
  const items = [...DOCK];
  // Your live or next match leads the dock.
  const m = state.match;
  if (m) items.splice(1, 0, { href: `/match/${m.id}`, label: m.live ? 'Live' : 'Match', icon: 'match', accent: m.live ? '#ff3d5a' : '#e3e8ee' });
  return items.map((n, i) => {
    const badge = n.href === '/club' && state.invites ? html`<b class="nav-dot">${state.invites}</b>`
      : n.icon === 'match' && m?.live ? html`<b class="dk-live">LIVE</b>`
      : n.href === '/training' && state.trainReady ? html`<b class="dk-dot"></b>`
      : n.href === '/' && dailyDue() ? html`<b class="dk-dot"></b>`
      : '';
    const accent = n.href === '/club' && state.club ? state.club.colors.primary : n.accent;
    const active = n.href.startsWith('/match/') ? path === n.href : isActive(n.href, path);
    return html`<a href="${navHref(n.href)}" class="dk ${active ? 'active' : ''}" style="--accent:${accent};--i:${i}" aria-label="${n.label}" title="${n.label}"><i class="dk-face">${navIcon(n.icon)}${badge}</i></a>`;
  });
}

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
// Markup last written into a shell element, so unchanged refreshes leave it alone
// instead of rebuilding it (which flickers images and icons).
const written = new WeakMap<Element, string>();
function setInner(el: Element, h: string) {
  if (written.get(el) === h) return;
  el.innerHTML = h;
  written.set(el, h);
}
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
    <a href="/shop/stars" class="coin-chip star-chip" aria-label="Stars">${icon('star', 15)}<b>${(p.stars ?? 0).toLocaleString()}</b></a>
    <button class="top-icon ${dailyDue() ? 'has-dot' : ''}" aria-label="Today: daily goals and rewards" title="Today" data-daily>${icon('target', 19)}</button>
    <button class="top-icon" aria-label="Refresh the game" title="Refresh for updates" data-refresh>${icon('refresh', 18)}</button>
    <button class="top-icon ${state.unread ? 'has-dot' : ''}" aria-label="Inbox" data-inbox>${icon('bell', 19)}</button>
    <button class="top-avatar" data-menu aria-label="Menu">${avatar(p.appearance, state.club?.colors, 36, undefined, { eq: p.equipped })}${state.daily ? html`<b class="av-lv" style="--f:${Math.round(state.daily.fame * 100)}%">${state.daily.level}</b>` : ''}</button>`;
}

function menu() {
  const p = state.player;
  return html`<div class="user-menu" id="user-menu" hidden>
    ${p ? html`<a href="/player/${p.id}" class="um-head">${avatar(p.appearance, state.club?.colors, 44, undefined, { eq: p.equipped })}<div class="grow"><div class="name ellipsis">${p.name}</div><div class="sub">${p.position} · ${p.ovr} OVR${state.club ? ` · ${state.club.short}` : ''}</div></div></a>` : ''}
    <a href="${p ? `/player/${p.id}` : '/'}">${icon('user', 17)} Profile</a>
    <a href="/house">${icon('sofa', 17)} My home</a>
    <a href="/transfers">${icon('swap', 17)} Transfers</a>
    <a href="/clubs">${icon('users', 17)} Clubs</a>
    <a href="/patch-notes">${icon('notes', 17)} Patch notes</a>
    <div class="um-themes"><div class="label">Theme</div><div class="theme-row">${THEMES.map((t) => html`<button type="button" class="theme-sw ${t.id === theme() ? 'on' : ''}" data-theme-pick="${t.id}" style="--sw-acc:${t.accent}"><i style="background:${t.swatch}"></i>${t.name}</button>`)}</div></div>
    ${soundMenu()}
    <button data-logout>${icon('logout', 17)} Sign out</button>
  </div>`;
}

// Sound: menu music and the match crowd, each on or off, with one volume.
function soundMenu() {
  const p = soundPrefs();
  return html`<div class="um-sound"><div class="label">Sound</div><div class="snd-row">
    <button type="button" class="snd-tog ${p.music ? 'on' : ''}" data-snd="music" aria-pressed="${p.music}">${icon('music', 16)} Music</button>
    <button type="button" class="snd-tog ${p.crowd ? 'on' : ''}" data-snd="crowd" aria-pressed="${p.crowd}">${icon('users', 16)} Crowd</button>
    <input type="range" class="snd-vol" data-vol min="0" max="100" step="1" value="${Math.round(p.vol * 100)}" aria-label="Volume" style="--v:${Math.round(p.vol * 100)}%">
  </div></div>`;
}
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-snd]');
  if (!b) return;
  const k = b.dataset.snd as 'music' | 'crowd';
  const on = !soundPrefs()[k];
  setSoundPrefs({ [k]: on });
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
});
document.addEventListener('input', (e) => {
  const r = e.target as HTMLInputElement;
  if (!r.matches?.('[data-vol]')) return;
  r.style.setProperty('--v', `${r.value}%`);
  setSoundPrefs({ vol: +r.value / 100 });
});

// Colour themes: the classic floodlit look plus two alternatives, remembered per device.
const THEMES = [
  { id: 'classic', name: 'Floodlight', accent: '#c6ff3d', swatch: 'radial-gradient(120% 120% at 20% 0%, #1d2a3a, #05070a 70%)', bar: '#05070a' },
  { id: 'aero', name: 'Aero', accent: '#8cf542', swatch: 'linear-gradient(180deg, #7fdcff 0%, #1aa3dc 45%, #0a6f9e 55%, #0b8f8a 100%)', bar: '#0d7fb3' },
  { id: 'gold', name: "Ballon d'Or", accent: '#f3c45a', swatch: 'radial-gradient(120% 120% at 20% 0%, #3a2a12, #070605 70%)', bar: '#070605' },
];
function theme() {
  try { return localStorage.getItem('fl-theme') ?? 'classic'; } catch { return 'classic'; }
}
function applyTheme(id = theme()) {
  const t = THEMES.find((x) => x.id === id) ?? THEMES[0];
  if (t.id === 'classic') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t.id;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.bar);
  applyTint();
}
applyTheme();
document.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-theme-pick]');
  if (!b) return;
  try { localStorage.setItem('fl-theme', b.dataset.themePick!); } catch { /* storage unavailable */ }
  applyTheme(b.dataset.themePick);
  document.querySelectorAll('.theme-sw').forEach((x) => x.classList.toggle('on', x === b));
});

/** Tints the ambient background with your club colours. */
function applyTint() {
  const st = document.documentElement.style;
  // Alternative themes bring their own palette.
  if (document.documentElement.dataset.theme) {
    st.removeProperty('--tint-a');
    st.removeProperty('--tint-b');
    return;
  }
  const c = state.club?.colors;
  document.documentElement.style.setProperty('--tint-a', c?.primary ?? '#3d6bff');
  document.documentElement.style.setProperty('--tint-b', c?.secondary ?? '#c6ff3d');
}

function renderShell(path: string) {
  const links = (cls: string) => NAV.map((n) => html`<a href="${navHref(n.href)}" class="${cls} ${isActive(n.href, path) ? 'active' : ''}" title="${n.label}">${icon(n.icon)}<span>${n.label}</span>${n.href === '/clubs' && state.invites ? html`<i class="nav-dot">${state.invites}</i>` : ''}</a>`);
  mount(root, html`<div class="app">
    <div class="ambient" aria-hidden="true"><i class="a1"></i><i class="a2"></i><i class="a3"></i><div class="grain"></div></div>
    <header class="topnav">
      <button class="top-back" data-back aria-label="Go back" title="Go back">${icon('back', 18)}</button>
      <nav class="topnav-links">${links('tn-link')}</nav>
      <div class="topnav-right" >
        <div class="row" style="gap:10px" id="me-top">${meTop()}</div>
        <div class="clock" id="clock">${clockText()}</div>
      </div>
      ${menu()}
    </header>
    <main id="page"></main>
    <nav class="dock" aria-label="Main menu"><div class="dock-in" id="dock">${dockHtml(path)}</div></nav>
    <div class="rotate-hint" role="dialog" aria-label="Turn your phone sideways"><div><div class="rh-phone"></div><h2>Turn your phone sideways</h2><p>FootbalLife is made to be played in landscape.</p><button class="btn ghost" data-portrait>Stay in portrait</button></div></div>
  </div>`);
  written.set(document.getElementById('dock')!, dockHtml(path).map((r) => r.html).join(''));
  written.set(document.getElementById('me-top')!, meTop().html);
  written.set(document.getElementById('user-menu')!, menu().html);
  dockState(path, true);
  applyTint();
  try { if (sessionStorage.getItem('fl-portrait') === '1') root.querySelector('.app')?.classList.add('portrait-ok'); } catch { /* storage unavailable */ }
  shellMounted = true;
}

function updateNav(path: string, close = true) {
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
  const dock = document.getElementById('dock');
  const dh = dockHtml(path).map((r) => r.html).join('');
  // Only touch the dock when it changed, so it doesn't flicker on every refresh.
  if (dock) setInner(dock, dh);
  dockState(path);
  if (close) closeMenu();
}

/** Keeps the current page's tile in view. */
function dockState(path: string, first = false) {
  root.querySelector('.app')?.classList.toggle('at-home', path === '/');
  root.querySelector('.app')?.classList.toggle('at-match', path.startsWith('/match/'));
  const dock = document.getElementById('dock');
  const on = dock?.querySelector<HTMLElement>('.active');
  // Pages that aren't a dock destination are sub-pages: they get a back button.
  root.querySelector('.app')?.classList.toggle('is-sub', path !== '/' && !on);
  if (!dock || !on) return;
  const x = on.offsetLeft - (dock.clientWidth - on.offsetWidth) / 2;
  dock.scrollTo({ left: Math.max(0, x), behavior: first ? 'auto' : 'smooth' });
}

/** Back to the previous page, or home when the page was opened directly. */
export function goBack() {
  if ((history.state?.idx ?? 0) > 0) history.back();
  else navigate('/');
}
document.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('[data-back]')) goBack();
  const r = (e.target as HTMLElement).closest<HTMLElement>('[data-refresh]');
  if (r) {
    r.classList.add('spinning');
    void hardReload();
  }
});

/** Reloads the whole game from the network: fetches the newest deploy and drops every cached file. */
async function hardReload() {
  const settle = <T,>(p: Promise<T>) => Promise.race([p.catch(() => undefined), new Promise<undefined>((r) => setTimeout(r, 2500))]);
  try {
    const reg = await settle(navigator.serviceWorker?.getRegistration() ?? Promise.resolve(undefined));
    if (reg) {
      await settle(reg.update());
      await settle(reg.unregister());
    }
    if ('caches' in window) await settle(caches.keys().then((ks) => Promise.all(ks.map((k) => caches.delete(k)))));
  } finally {
    location.reload();
  }
}

function closeMenu() {
  const m = document.getElementById('user-menu');
  if (m) m.hidden = true;
  const b = document.getElementById('inbox');
  if (b) b.hidden = true;
}

// The inbox: results, rewards and invites, opened from the bell.
async function openInbox() {
  let box = document.getElementById('inbox');
  if (!box) {
    root.querySelector('.topnav')?.insertAdjacentHTML('beforeend', '<div class="user-menu inbox" id="inbox" hidden></div>');
    box = document.getElementById('inbox')!;
  }
  if (!box.hidden) { box.hidden = true; return; }
  closeMenu();
  box.hidden = false;
  box.innerHTML = html`<div class="ib-head"><span class="h3">Inbox</span></div><div class="ib-empty">Loading…</div>`.html;
  try {
    const r = await api.get('/api/notifications');
    const list = (r.notifications ?? []) as { kind: string; text: string; data?: { matchId?: string }; read: boolean; at: string }[];
    const kindIcon = (k: string) => (k === 'result' ? 'ball' : k === 'season' ? 'trophy' : k === 'collect' ? 'shirt' : 'bell');
    box.innerHTML = html`<div class="ib-head"><span class="h3">Inbox</span>${state.unread ? html`<span class="chip lime">${state.unread} new</span>` : ''}</div>
      ${list.length ? html`<div class="ib-list">${list.map((n) => html`<${n.data?.matchId ? 'a' : 'div'} class="ib-item ${n.read ? '' : 'new'}" ${n.data?.matchId ? html`href="/match/${n.data.matchId}"` : ''}>
        <i>${icon(kindIcon(n.kind), 16)}</i><div class="grow"><div class="ib-text">${n.text}</div><div class="tiny dim">${relTime(n.at)}</div></div></${n.data?.matchId ? 'a' : 'div'}>`)}</div>`
        : html`<div class="ib-empty">Results, rewards and invites land here.</div>`}`.html;
    if (state.unread) {
      await api.post('/api/notifications/read').catch(() => {});
      void refreshMe().catch(() => {});
    }
  } catch (e) {
    box.innerHTML = html`<div class="ib-head"><span class="h3">Inbox</span></div><div class="ib-empty">${(e as Error).message}</div>`.html;
  }
}

// Shell-level clicks: the user menu and sign out. Bound once on the root.
root.addEventListener('click', async (e) => {
  const t = e.target as HTMLElement;
  if (t.closest('[data-portrait]')) {
    root.querySelector('.app')?.classList.add('portrait-ok');
    safeSet('fl-portrait', '1');
    return;
  }
  if (t.closest('[data-daily]')) {
    closeMenu();
    void openDaily();
    return;
  }
  if (t.closest('[data-inbox]')) {
    void openInbox();
    return;
  }
  if (t.closest('[data-menu]')) {
    const m = document.getElementById('user-menu');
    const open = !!m?.hidden;
    closeMenu();
    if (m) m.hidden = !open;
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
  if (!t.closest('#user-menu') && !t.closest('#inbox')) closeMenu();
  else if (t.closest('#inbox a')) closeMenu();
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
  setScene(path.startsWith('/match/') ? 'match' : 'menu');
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
  watchDaily();
  if (!shellMounted || !state.player) return;
  // Rewrite each piece only when its markup changed: a no-op refresh must not flash.
  const top = document.getElementById('me-top');
  if (top) setInner(top, meTop().html);
  const m = document.getElementById('user-menu');
  const mh = menu().html;
  if (m && written.get(m) !== mh) {
    const open = !m.hidden;
    m.outerHTML = mh;
    const n = document.getElementById('user-menu')!;
    written.set(n, mh);
    n.hidden = !open;
  }
  applyTint();
  updateNav(location.pathname, false);
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
initSound();
// No pinch-zoom or ctrl-wheel zoom on the page (the 3D views handle their own gestures),
// and no browser long-press menu outside text fields.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 && !(e.target as HTMLElement).closest?.('canvas')) e.preventDefault(); }, { passive: false });
document.addEventListener('wheel', (e) => { if (e.ctrlKey) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', (e) => { if (!(e.target as HTMLElement).closest?.('input, textarea, [contenteditable], .selectable')) e.preventDefault(); });
