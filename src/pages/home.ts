// Home screen, console style: a rail of tiles across the top, and a big hero
// that changes as you move along the rail (hover, arrow keys or a tap). Below
// it, a row of activity cards.
import { HOUSE_BY_ID } from '../../shared/life.ts';
import { ITEM_BY_ID, RARITY_COLORS } from '../../shared/cosmetics.ts';
import { api } from '../api.ts';
import { avatarSvg } from '../art.ts';
import { badge, keyAttrs, linkRows, matchRow, posChip, roleLabel, standingsTable, type MatchBrief } from '../components.ts';
import { html, mount, type Raw } from '../dom.ts';
import { itemArt, trophyArt } from '../gearArt.ts';
import { icon } from '../icons.ts';
import { navigate } from '../router.ts';
import { refreshMe } from '../state.ts';
import { countdown, errorBox, kickoffLabel, relTime, skeleton, toast } from '../ui.ts';

interface Tile {
  id: string;
  label: string;
  href: string;
  accent: string;
  art: () => Raw;
  hero: () => Raw;
}

let lastFocus = 'match';

export async function homePage(el: HTMLElement) {
  mount(el, html`<div class="home-skel">${skeleton(130, 1)}${skeleton(360, 1)}</div>`);
  let data: any;
  let timer = 0;
  let poll = 0;
  let alive = true;
  let focus = lastFocus;
  let tiles: Tile[] = [];
  let pointer = 'mouse';
  let downAt = 0;

  const load = async () => {
    try {
      data = await api.get('/api/home');
      if (!alive) return;
      render();
    } catch (e) {
      if (alive && !data) mount(el, errorBox((e as Error).message));
    }
  };

  const ordinal = (n: number) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  const buildTiles = (): Tile[] => {
    const d = data;
    const p = d.player;
    const kit = d.club?.colors ?? { primary: '#2a3340', secondary: '#c6ff3d' };
    const m: MatchBrief | null = d.live ?? d.next;
    const t: Tile[] = [];

    // ---- next match / find a club ----
    if (!d.club) {
      t.push({
        id: 'match', label: 'Find a club', href: '/clubs', accent: '#c6ff3d',
        art: () => html`<div class="ta-icon">${icon('shield', 46)}</div>`,
        hero: () => html`<div class="hero-copy">
            <div class="eyebrow">Get started</div>
            <div class="hero-title">Find your club</div>
            <p class="hero-desc">Every career needs a team. Found your own club and invite friends, or join one that's recruiting. AI players fill the empty spots, so you can play right away.</p>
            <div class="hero-cta"><a class="btn white lg" href="/clubs/new">${icon('plus')} Create a club</a><a class="btn lg" href="/clubs">Browse clubs</a></div>
            ${d.invites?.length ? html`<div class="hero-invites">${d.invites.map((i: any) => html`<div class="hi-row">${badge(i.club, 30)}
              <div class="grow"><a href="/club/${i.club.id}" style="font-weight:700">${i.club.name}</a><div class="tiny muted">${i.kind === 'invite' ? `Invited by ${i.from ?? 'the club'}` : 'You asked to join'} · ${relTime(i.at)}</div></div>
              ${i.kind === 'invite' ? html`<button class="btn sm primary" data-respond="${i.id}" data-accept="1">Accept</button><button class="btn sm ghost" data-respond="${i.id}" data-accept="0">Decline</button>` : html`<span class="chip">Pending</span>`}</div>`)}</div>` : ''}
          </div>
          <div class="hero-art">${avatarSvg(p.appearance, undefined, 220, undefined, { eq: p.equipped })}</div>`,
      });
    } else {
      const live = m?.status === 'live';
      t.push({
        id: 'match', label: live ? 'Live now' : 'Next match', href: m ? `/match/${m.id}` : `/club/${d.club.id}`, accent: kit.primary,
        art: () => (m ? html`<div class="ta-vs">${badge(m.home, 44)}${badge(m.away, 44)}</div>${live ? html`<span class="ta-live">LIVE</span>` : ''}` : html`<div class="ta-icon">${icon('calendar', 44)}</div>`),
        hero: () => {
          if (!m) {
            return html`<div class="hero-copy"><div class="eyebrow">Next match</div><div class="hero-title">No fixtures yet</div>
              <p class="hero-desc">Your club joins the league next season. In the meantime, arrange a friendly from your club page.</p>
              <div class="hero-cta"><a class="btn white lg" href="/club/${d.club.id}">Go to club</a></div></div><div class="hero-art">${badge(d.club, 200)}</div>`;
          }
          const tag = m.kind === 'friendly' ? 'Friendly' : m.cup ? `Cup · ${m.cup.name}` : `League · Round ${m.round}`;
          return html`<div class="hero-copy">
              <div class="eyebrow">${live ? 'Live now' : tag}</div>
              <div class="hero-title">${m.home.short} <span class="vs">vs</span> ${m.away.short}</div>
              <div class="hero-meta">${live ? html`<span class="chip live">LIVE</span> Everyone is watching the same match` : html`${icon('calendar', 15)} ${kickoffLabel(m.kickoffAt)} · <b class="num" data-countdown="${m.kickoffAt}">${countdown(m.kickoffAt)}</b>`}</div>
              <p class="hero-desc">${live ? 'The match is being played right now. Jump in and watch it unfold in 3D.' : `${m.home.name} host ${m.away.name}. Matches simulate on the server and play out live for everyone.`}</p>
              <div class="hero-cta"><a class="btn white lg" href="/match/${m.id}">${icon(live ? 'play' : 'arrow')} ${live ? 'Watch live' : 'Match preview'}</a>${d.club ? html`<a class="btn lg" href="/club/${d.club.id}">Tactics</a>` : ''}</div>
            </div>
            <div class="hero-art hero-vs">
              <div class="hv-team">${badge(m.home, 150)}<div class="h3">${m.home.name}</div></div>
              <div class="hv-mid">${live ? html`<div class="hv-live">LIVE</div>` : html`<div class="hv-vs">VS</div>`}</div>
              <div class="hv-team">${badge(m.away, 150)}<div class="h3">${m.away.name}</div></div>
            </div>`;
        },
      });
      t.push({
        id: 'club', label: d.club.name, href: `/club/${d.club.id}`, accent: kit.secondary,
        art: () => html`<div class="ta-icon">${badge(d.club, 64)}</div>`,
        hero: () => html`<div class="hero-copy">
            <div class="eyebrow">My club · ${roleLabel(p.role)}</div>
            <div class="hero-title">${d.club.name}</div>
            <div class="hero-stats"><div><b>${d.position ? ordinal(d.position) : '–'}</b><span>League</span></div><div><b>${d.club.strength}</b><span>Strength</span></div><div><b>${d.club.humans}</b><span>Players</span></div></div>
            <div class="hero-cta"><a class="btn white lg" href="/club/${d.club.id}">Open club</a><a class="btn lg" href="/club/${d.club.id}?tab=chat">${icon('chat')} Club chat</a></div>
          </div>
          <div class="hero-art">${badge(d.club, 230)}</div>`,
      });
    }

    // ---- training ----
    const tr = d.training;
    t.push({
      id: 'training', label: 'Training', href: '/training', accent: '#3dd6ff',
      art: () => html`<div class="ta-icon">${icon('dumbbell', 46)}</div>${tr.ready ? html`<span class="ta-dot"></span>` : ''}`,
      hero: () => html`<div class="hero-copy">
          <div class="eyebrow">Training ground</div>
          <div class="hero-title">${tr.ready ? 'Session ready' : 'Recovering'}</div>
          <div class="hero-meta">${tr.ready ? html`${icon('sparkle', 15)} Pick a drill and develop an attribute` : html`${icon('clock', 15)} Next session in <b class="num" data-countdown="${tr.availableAt}">${countdown(tr.availableAt)}</b>`}</div>
          <p class="hero-desc">One session every 4 hours. Matches give experience too, so the more you play, the faster you grow.</p>
          <div class="hero-cta"><a class="btn ${tr.ready ? 'white' : ''} lg" href="/training">${tr.ready ? 'Train now' : 'Open training'}</a></div>
        </div>
        <div class="hero-art"><div class="hero-attrs">${keyAttrs(p.attrs, p.position)}</div></div>`,
    });

    // ---- league ----
    if (d.season) {
      t.push({
        id: 'league', label: 'League', href: '/league', accent: '#ffcf3d',
        art: () => html`<div class="ta-icon">${trophyArt('champion', 70)}</div>`,
        hero: () => html`<div class="hero-copy">
            <div class="eyebrow">Division 1 · Season ${d.season.number}</div>
            <div class="hero-title">${d.position ? `${ordinal(d.position)} place` : 'The league'}</div>
            <p class="hero-desc">${d.table?.[0] ? `${d.table[0].name} lead with ${d.table[0].points} points.` : ''} Top three earn the biggest season rewards, and the champions get medals.</p>
            <div class="hero-cta"><a class="btn white lg" href="/league">Full table</a><a class="btn lg" href="/league?tab=leaders">Top scorers</a></div>
          </div>
          <div class="hero-art"><div class="hero-table" id="htbl">${d.table ? standingsTable(d.table.slice(0, 6), d.club?.id, true) : ''}</div></div>`,
      });
      const ct = d.cupTie as MatchBrief | null;
      t.push({
        id: 'cup', label: 'The Cup', href: '/league?tab=cup', accent: '#e3e8ee',
        art: () => html`<div class="ta-icon">${trophyArt('cup', 70)}</div>`,
        hero: () => {
          let line = 'A knockout cup runs alongside every season. Drawn ties go to penalties.';
          let title = 'FootbalLife Cup';
          if (ct && d.club) {
            const mine = ct.home.id === d.club.id ? 0 : 1;
            const opp = mine === 0 ? ct.away : ct.home;
            if (ct.status !== 'finished') {
              title = ct.cup?.name ?? 'Cup tie';
              line = ct.status === 'live' ? `Playing ${opp.name} right now.` : `Next up: ${opp.name}, ${kickoffLabel(ct.kickoffAt)}.`;
            } else {
              const won = ct.score![mine] > ct.score![1 - mine] || (ct.score![0] === ct.score![1] && !!ct.pens && ct.pens[mine] > ct.pens[1 - mine]);
              title = won ? (ct.cup?.stage === ct.cup?.total ? 'Cup winners!' : 'Through!') : 'Knocked out';
              line = `${won ? 'Beat' : 'Lost to'} ${opp.name} ${ct.score![mine]}–${ct.score![1 - mine]}${ct.pens ? ` (${ct.pens[mine]}–${ct.pens[1 - mine]} on pens)` : ''} in the ${ct.cup?.name?.toLowerCase() ?? 'cup'}.`;
            }
          }
          return html`<div class="hero-copy"><div class="eyebrow">Knockout</div><div class="hero-title">${title}</div>
            <p class="hero-desc">${line} Winners lift the trophy and take home 500 coins and the match ball.</p>
            <div class="hero-cta"><a class="btn white lg" href="/league?tab=cup">See the bracket</a></div></div>
            <div class="hero-art">${trophyArt('cup', 240)}</div>`;
        },
      });
    }

    // ---- shop ----
    const deal = ITEM_BY_ID[d.shop?.deal];
    t.push({
      id: 'shop', label: 'Shop', href: '/shop', accent: '#ff4d9d',
      art: () => html`<div class="ta-icon">${icon('bag', 46)}</div>`,
      hero: () => html`<div class="hero-copy">
          <div class="eyebrow">Daily drop</div>
          <div class="hero-title">${deal ? deal.name : 'Shop & locker'}</div>
          <div class="hero-meta">${deal ? html`<span class="rarity" style="--rc:${RARITY_COLORS[deal.rarity]}">${deal.rarity}</span> 30% off today ·` : ''} ${icon('coin', 15)} <b>${p.coins.toLocaleString()}</b> coins</div>
          <p class="hero-desc">Boots, chains, outfits, profile cards, titles and goal celebrations. Four featured items rotate every day.</p>
          <div class="hero-cta"><a class="btn white lg" href="/shop">Browse the shop</a><a class="btn lg" href="/shop/locker">My locker</a></div>
        </div>
        <div class="hero-art hero-items">${(d.shop?.ids ?? []).map((id: string) => ITEM_BY_ID[id] ? html`<div class="hi-item" style="--rc:${RARITY_COLORS[ITEM_BY_ID[id].rarity]}">${itemArt(ITEM_BY_ID[id], 96)}</div>` : '')}</div>`,
    });

    // ---- life ----
    const house = HOUSE_BY_ID[d.life?.tier] ?? HOUSE_BY_ID.studio;
    t.push({
      id: 'home', label: 'My home', href: '/house', accent: '#ff9a3d',
      art: () => html`<div class="ta-icon">${icon('sofa', 46)}</div>`,
      hero: () => html`<div class="hero-copy">
          <div class="eyebrow">Off the pitch</div>
          <div class="hero-title">${house.name}</div>
          <div class="hero-stats"><div><b>${d.life?.cars ?? 0}</b><span>Cars</span></div><div><b>${d.life?.trophies ?? 0}</b><span>Trophies</span></div><div><b>${d.life?.memorabilia ?? 0}</b><span>Memorabilia</span></div></div>
          <div class="hero-cta"><a class="btn white lg" href="/house">Go home</a><a class="btn lg" href="/house?tab=garage">${icon('car')} Garage</a></div>
        </div>
        <div class="hero-art"><div class="house-thumb big view-${house.view}"></div></div>`,
    });

    // ---- transfers ----
    t.push({
      id: 'transfers', label: 'Transfers', href: '/transfers', accent: '#8a6bff',
      art: () => html`<div class="ta-icon">${icon('swap', 46)}</div>`,
      hero: () => html`<div class="hero-copy">
          <div class="eyebrow">Market</div>
          <div class="hero-title">Transfers</div>
          <p class="hero-desc">${d.market?.vacancies ? `${d.market.vacancies} open ${d.market.vacancies === 1 ? 'vacancy' : 'vacancies'} right now.` : 'No open vacancies right now.'} Clubs post the roles they need, and players can make themselves open to offers.</p>
          <div class="hero-cta"><a class="btn white lg" href="/transfers">Open the market</a></div>
        </div>
        <div class="hero-art"><div class="ta-big">${icon('swap', 160)}</div></div>`,
    });

    // ---- profile ----
    t.push({
      id: 'profile', label: p.name, href: `/player/${p.id}`, accent: '#c6ff3d',
      art: () => html`<div class="ta-icon">${avatarSvg(p.appearance, d.club?.colors, 70, d.club ? p.shirt : undefined, { eq: p.equipped })}</div>`,
      hero: () => html`<div class="hero-copy">
          <div class="eyebrow">${d.club ? d.club.name : 'Free agent'}</div>
          <div class="hero-title">${p.name}</div>
          <div class="hero-stats"><div><b class="lime">${p.ovr}</b><span>${posChip(p.position)}</span></div><div><b>${p.career.apps}</b><span>Apps</span></div><div><b>${p.career.goals}</b><span>Goals</span></div><div><b>${p.career.assists}</b><span>Assists</span></div><div><b>${p.career.rating?.toFixed(1) ?? '–'}</b><span>Rating</span></div></div>
          <div class="hero-cta"><a class="btn white lg" href="/player/${p.id}">My profile</a><a class="btn lg" href="/shop/look">Edit look</a></div>
        </div>
        <div class="hero-art">${avatarSvg(p.appearance, d.club?.colors, 240, d.club ? p.shirt : undefined, { eq: p.equipped })}</div>`,
    });
    return t;
  };

  const tileEl = (t: Tile, i: number): Raw => html`<a class="tile ${t.id === focus ? 'focus' : ''}" href="${t.href}" data-tile="${t.id}" style="--accent:${t.accent};--i:${i}" aria-label="${t.label}">
      <div class="tile-face">${t.art()}</div><div class="tile-label ellipsis">${t.label}</div></a>`;

  const heroEl = (): Raw => {
    const t = tiles.find((x) => x.id === focus) ?? tiles[0];
    return html`<div class="hero-bg" style="--accent:${t.accent}"></div><div class="hero-inner" data-hero="${t.id}">${t.hero()}</div>`;
  };

  const activity = (): Raw => {
    const d = data;
    const unread = d.notifications.filter((n: any) => !n.read).length;
    const cards: Raw[] = [];
    if (d.liveNow.length) cards.push(html`<div class="act-card"><div class="act-head"><span class="chip live">LIVE</span><span class="h3">Live now</span></div>${d.liveNow.slice(0, 3).map((m: MatchBrief) => matchRow(m, d.club?.id))}</div>`);
    cards.push(html`<div class="act-card"><div class="act-head"><span class="h3">Inbox</span>${unread ? html`<span class="chip lime">${unread} new</span><button class="btn sm ghost" data-read style="margin-left:auto">Mark read</button>` : ''}</div>
      ${d.notifications.length ? html`<div class="list">${d.notifications.slice(0, 4).map((n: any) => html`<${n.data?.matchId ? 'a' : 'div'} class="list-item" ${n.data?.matchId ? html`href="/match/${n.data.matchId}"` : ''} style="align-items:flex-start">
          <span style="color:${n.read ? 'var(--dim)' : 'var(--lime)'};margin-top:2px">${icon(n.kind === 'result' ? 'ball' : n.kind === 'season' ? 'trophy' : n.kind === 'collect' ? 'shirt' : 'bell', 16)}</span>
          <div class="grow"><div class="small" style="${n.read ? 'color:var(--muted)' : ''}">${n.text}</div><div class="tiny dim">${relTime(n.at)}</div></div>
        </${n.data?.matchId ? 'a' : 'div'}>`)}</div>`
        : html`<div class="empty small">Results and rewards land here.</div>`}</div>`);
    cards.push(html`<div class="act-card"><div class="act-head"><span class="h3">${d.recent.length ? 'Recent results' : 'Results'}</span><a class="card-link" style="margin-left:auto" href="/league?tab=fixtures">Fixtures</a></div>
      ${d.recent.length ? d.recent.slice(0, 4).map((m: MatchBrief) => matchRow(m, d.club?.id)) : html`<div class="empty small">No results yet. League matches kick off every morning and evening.</div>`}</div>`);
    if (d.table) cards.push(html`<div class="act-card wide"><div class="act-head"><span class="h3">League table</span><a class="card-link" style="margin-left:auto" href="/league">Full table</a></div><div id="tbl">${standingsTable(d.table, d.club?.id, true)}</div></div>`);
    return html`${cards}`;
  };

  const render = () => {
    const d = data;
    tiles = buildTiles();
    if (!tiles.some((t) => t.id === focus)) focus = tiles[0].id;
    const greet = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
    mount(el, html`
      <div class="home-top">
        <div><div class="eyebrow">${greet}</div><div class="home-name">${d.player.name.split(' ')[0]}</div></div>
        ${d.season ? html`<div class="chip">${icon('trophy', 13)} Season ${d.season.number}${d.position ? html` · ${ordinal(d.position)}` : ''}</div>` : ''}
      </div>
      <div class="rail" id="rail" role="toolbar" aria-label="Main menu">${tiles.map(tileEl)}</div>
      <section class="hero" id="hero">${heroEl()}</section>
      <div class="act-title"><span class="h2">Your activity</span></div>
      <div class="act-row">${activity()}</div>`);
    bind();
  };

  const setFocus = (id: string, scroll = false) => {
    if (id === focus) return;
    focus = id;
    lastFocus = id;
    el.querySelectorAll<HTMLElement>('[data-tile]').forEach((t) => t.classList.toggle('focus', t.dataset.tile === id));
    const hero = el.querySelector('#hero');
    if (hero) hero.innerHTML = heroEl().html;
    bindHero();
    if (scroll) el.querySelector<HTMLElement>(`[data-tile="${id}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  };

  const bindHero = () => {
    const ht = el.querySelector('#htbl') as HTMLElement | null;
    if (ht) linkRows(ht, navigate);
  };

  const bind = () => {
    const tbl = el.querySelector('#tbl') as HTMLElement | null;
    if (tbl) linkRows(tbl, navigate);
    bindHero();
    const rail = el.querySelector<HTMLElement>('#rail')!;
    rail.querySelectorAll<HTMLElement>('[data-tile]').forEach((t) => {
      t.addEventListener('pointerenter', (e) => { if ((e as PointerEvent).pointerType === 'mouse') setFocus(t.dataset.tile!); });
      // Keyboard focus moves the selection; a tap's focus is handled by the click below.
      t.addEventListener('focus', () => { if (pointer === 'mouse' || Date.now() - downAt > 600) setFocus(t.dataset.tile!); });
      t.addEventListener('pointerdown', (e) => { pointer = (e as PointerEvent).pointerType; downAt = Date.now(); });
      // On touch, the first tap selects a tile (like moving onto it with a controller), the second opens it.
      t.addEventListener('click', (e) => {
        if (pointer !== 'mouse' && t.dataset.tile !== focus) {
          e.preventDefault();
          e.stopPropagation();
          setFocus(t.dataset.tile!, true);
        }
      }, true);
    });
    rail.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      const i = tiles.findIndex((x) => x.id === focus);
      const next = tiles[Math.max(0, Math.min(tiles.length - 1, i + (e.key === 'ArrowRight' ? 1 : -1)))];
      el.querySelector<HTMLElement>(`[data-tile="${next.id}"]`)?.focus();
    });
  };

  el.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const b = t.closest('[data-respond]') as HTMLElement | null;
    if (b) {
      try {
        const r = await api.post(`/api/invites/${b.dataset.respond}/respond`, { accept: b.dataset.accept === '1' });
        await refreshMe();
        if (r.clubId) { toast('Welcome to your new club!', 'ok'); navigate(`/club/${r.clubId}`); } else void load();
      } catch (err) { toast((err as Error).message, 'err'); }
      return;
    }
    if (t.closest('[data-read]')) {
      await api.post('/api/notifications/read');
      void load();
      void refreshMe();
    }
  });

  await load();
  void refreshMe().catch(() => {});
  timer = window.setInterval(() => {
    el.querySelectorAll<HTMLElement>('[data-countdown]').forEach((c) => {
      c.textContent = countdown(c.dataset.countdown!);
      if (new Date(c.dataset.countdown!).getTime() <= Date.now() && !c.dataset.fired) {
        c.dataset.fired = '1';
        setTimeout(load, 1500);
      }
    });
  }, 1000);
  poll = window.setInterval(load, 30_000);
  return () => {
    alive = false;
    clearInterval(timer);
    clearInterval(poll);
  };
}
