// Life off the pitch: your home (a 3D diorama you furnish), your garage and
// your collection of trophies and memorabilia. Anyone can visit.
import { TROPHY_KINDS, type TrophyKind } from '../../shared/achievements.ts';
import { CAR_BY_ID, CAR_COLORS, CARS, FLOOR_STYLES, FURNITURE, FURNITURE_BY_ID, FURNITURE_LABELS, FURNITURE_SLOTS, HOUSE_BY_ID, HOUSES, RESPRAY_COST, WALL_COLORS, type FurnitureSlot, type Home } from '../../shared/life.ts';
import { api } from '../api.ts';
import { avatarSvg } from '../art.ts';
import { badge } from '../components.ts';
import { afterPaint, html, mount, type Raw } from '../dom.ts';
import { trophyArt } from '../gearArt.ts';
import { icon } from '../icons.ts';
import { refreshMe, state } from '../state.ts';
import { achievementToasts, confirmModal, errorBox, relTime, skeleton, toast } from '../ui.ts';
import type { HomeScene } from '../viewer/home3d.ts';

type Tab = 'furnish' | 'move' | 'garage' | 'collection';

interface HouseData {
  mine: boolean;
  player: { id: string; name: string; position: string; appearance: never; equipped: never; shirt: number };
  club: { id: string; name: string; short: string; colors: { primary: string; secondary: string }; badge: never; isBot: boolean } | null;
  coins?: number;
  home: Home;
  houses: string[];
  furniture: string[];
  cars: { id: string; color: string; at: string }[];
  collectibles: { id: string; kind: 'shirt' | 'ball'; label: string; at: string; data: { primary?: string; secondary?: string; number?: number; club?: string; matchId?: string; score?: string } }[];
  trophies: { kind: string; season: number }[];
}

const FLOOR_NAMES: Record<string, string> = { oak: 'Oak', walnut: 'Walnut', marble: 'Marble', concrete: 'Concrete' };

export async function housePage(el: HTMLElement, params: string[]) {
  const id = params[0] ?? state.player?.id;
  mount(el, html`${skeleton(420, 1)}`);
  let d: HouseData;
  try {
    d = await api.page(`/api/house/${id}`);
  } catch (e) {
    mount(el, errorBox((e as Error).message));
    return;
  }
  const want = new URLSearchParams(location.search).get('tab') as Tab | null;
  let tab: Tab = want && (d.mine || want === 'garage' || want === 'collection') ? want : d.mine ? 'furnish' : 'collection';
  let slot: FurnitureSlot | 'style' = 'sofa';
  let paint: Record<string, string> = {};
  let scene: HomeScene | null = null;
  let disposed = false;
  let busy = false;

  const kit = d.club?.colors ?? { primary: '#1d2329', secondary: '#c6ff3d' };
  const tier = () => HOUSE_BY_ID[d.home.tier];
  const showGarage = () => tab === 'garage';

  const coinsPill = (): Raw => (d.mine ? html`<span class="coin-pill">${icon('coin', 18)} <b id="coins">${(d.coins ?? 0).toLocaleString()}</b></span>` : html``);

  const swatch = (c1: string, c2?: string) => html`<span class="life-sw" style="--c1:${c1};--c2:${c2 ?? c1}"></span>`;

  const furnishTab = (): Raw => {
    const owned = new Set(d.furniture);
    const chips = html`<div class="filter-row">${FURNITURE_SLOTS.map((s) => html`<button class="fchip ${slot === s ? 'on' : ''}" data-slot="${s}">${FURNITURE_LABELS[s]}</button>`)}<button class="fchip ${slot === 'style' ? 'on' : ''}" data-slot="style">${icon('paint', 13)} Walls & floor</button></div>`;
    if (slot === 'style') {
      return html`${chips}<div class="card stack" style="gap:16px">
        <div><div class="h3" style="margin-bottom:10px">Wall colour</div><div class="row wrap" style="gap:10px">${WALL_COLORS.map((c, i) => html`<button class="color-dot ${d.home.wall === i ? 'on' : ''}" style="--c:${c}" data-wall="${i}" aria-label="Wall colour ${i + 1}"></button>`)}</div></div>
        <div><div class="h3" style="margin-bottom:10px">Floor</div><div class="row wrap" style="gap:8px">${FLOOR_STYLES.map((f, i) => html`<button class="fchip ${d.home.floor === i ? 'on' : ''}" data-floor="${i}">${FLOOR_NAMES[f]}</button>`)}</div></div>
        <div class="tiny dim">Restyling is free.</div>
      </div>`;
    }
    const s = slot;
    const items = FURNITURE.filter((f) => f.slot === s);
    const cur = d.home.furniture[s];
    return html`${chips}<div class="life-grid">
      ${items.map((f) => {
        const has = owned.has(f.id);
        const placed = cur === f.id;
        return html`<button class="life-card ${placed ? 'sel' : ''}" data-furn="${f.id}">
          <div class="row" style="gap:10px">${swatch(f.c1, f.c2)}<div class="grow" style="min-width:0"><div class="nm ellipsis">${f.name}</div><div class="tiny muted">${FURNITURE_LABELS[f.slot]}</div></div></div>
          <div class="row between" style="margin-top:10px">${placed ? html`<span class="chip lime">${icon('check', 12)} In your home</span>` : has ? html`<span class="chip">Owned · place it</span>` : f.price === 0 ? html`<span class="chip">Free</span>` : html`<span class="price ${f.price > (d.coins ?? 0) ? 'short' : ''}">${icon('coin', 14)} ${f.price.toLocaleString()}</span>`}</div>
        </button>`;
      })}
      ${cur ? html`<button class="life-card ghost" data-clear="${s}"><div class="nm">Remove ${FURNITURE_LABELS[s].toLowerCase()}</div><div class="tiny muted">Keep it in storage</div></button>` : ''}
    </div>`;
  };

  const moveTab = (): Raw => html`<div class="stack" style="gap:12px">${HOUSES.map((h) => {
    const has = d.houses.includes(h.id);
    const here = d.home.tier === h.id;
    return html`<div class="card house-row ${here ? 'here' : ''}">
      <div class="house-thumb view-${h.view}"></div>
      <div class="grow" style="min-width:0">
        <div class="row" style="gap:8px"><div class="h3">${h.name}</div>${here ? html`<span class="chip lime">You live here</span>` : has ? html`<span class="chip">Owned</span>` : ''}</div>
        <div class="small muted" style="margin-top:2px">${h.desc}</div>
        <div class="row wrap tiny dim" style="gap:12px;margin-top:6px"><span>${h.size[0]} × ${h.size[1]} m</span><span>${icon('car', 12)} ${h.garage} car${h.garage === 1 ? '' : 's'}</span><span>${h.view === 'sea' ? 'Sea view' : h.view === 'park' ? 'Park view' : h.view === 'skyline' ? 'Skyline view' : 'City view'}</span></div>
      </div>
      ${here ? '' : has ? html`<button class="btn" data-house="${h.id}">Move in</button>` : html`<button class="btn primary" data-house="${h.id}" ${h.price > (d.coins ?? 0) ? 'disabled' : ''}>${icon('coin', 16)} ${h.price.toLocaleString()}</button>`}
    </div>`;
  })}</div>`;

  const garageTab = (): Raw => {
    const cap = tier().garage;
    const ownedIds = new Set(d.cars.map((c) => c.id));
    const mine = d.cars.map((c) => {
      const m = CAR_BY_ID[c.id];
      if (!m) return html``;
      const fav = d.home.favCar === c.id;
      return html`<div class="card car-row">
        <div class="row" style="gap:12px">${swatch(c.color)}<div class="grow"><div class="h3">${m.name}</div><div class="tiny muted">${m.kmh} km/h · bought ${relTime(c.at)}</div></div>
          ${d.mine ? (fav ? html`<span class="chip lime">${icon('sparkle', 12)} Favourite</span>` : html`<button class="btn sm" data-fav="${c.id}">Make favourite</button>`) : ''}</div>
        ${d.mine ? html`<div class="row wrap" style="gap:8px;margin-top:12px"><span class="tiny dim" style="margin-right:4px">Respray · ${RESPRAY_COST}</span>${CAR_COLORS.map((col) => html`<button class="color-dot sm ${c.color === col ? 'on' : ''}" style="--c:${col}" data-respray="${c.id}" data-color="${col}" aria-label="Paint"></button>`)}</div>` : ''}
      </div>`;
    });
    return html`
      <div class="row between" style="margin-bottom:10px"><div class="h2">${d.mine ? 'Your garage' : 'Garage'}</div><span class="chip">${d.cars.length} / ${cap} spaces</span></div>
      ${d.cars.length ? html`<div class="stack" style="gap:10px">${mine}</div>` : html`<div class="empty small">${d.mine ? 'No cars yet. Every footballer needs a ride to training.' : 'No cars yet.'}</div>`}
      ${d.mine ? html`<div class="h2" style="margin:22px 0 10px">Dealership</div>
        ${d.cars.length >= cap ? html`<div class="small muted" style="margin-bottom:10px">Your garage is full. A bigger home has more space.</div>` : ''}
        <div class="life-grid">${CARS.map((m) => {
          const pick = paint[m.id] ?? CAR_COLORS[(m.price / 100) % CAR_COLORS.length | 0];
          const has = ownedIds.has(m.id);
          return html`<div class="life-card static">
            <div class="row between"><div class="nm">${m.name}</div><span class="tiny muted">${m.kmh} km/h</span></div>
            <div class="tiny muted" style="margin:4px 0 10px">${m.desc}</div>
            ${has ? html`<span class="chip lime">${icon('check', 12)} In your garage</span>` : html`
              <div class="row wrap" style="gap:6px;margin-bottom:10px">${CAR_COLORS.map((col) => html`<button class="color-dot sm ${pick === col ? 'on' : ''}" style="--c:${col}" data-paint="${m.id}" data-color="${col}" aria-label="Paint"></button>`)}</div>
              <button class="btn primary sm" data-car="${m.id}" ${m.price > (d.coins ?? 0) || d.cars.length >= cap ? 'disabled' : ''}>${icon('coin', 14)} ${m.price.toLocaleString()}</button>`}
          </div>`;
        })}</div>` : ''}`;
  };

  const shirtSvg = (c: HouseData['collectibles'][number]) => {
    const p = c.data.primary ?? '#eee';
    const s = c.data.secondary ?? '#222';
    return html`<svg width="54" height="54" viewBox="0 0 100 100" aria-hidden="true"><rect x="4" y="4" width="92" height="92" rx="8" fill="#f2efe9" stroke="#16181b" stroke-width="5"/><path d="M34 20 L44 16 Q50 24 56 16 L66 20 L82 34 L74 44 L68 40 L68 84 L32 84 L32 40 L26 44 L18 34 Z" fill="${p}" stroke="${s}" stroke-width="3"/><text x="50" y="68" font-size="26" font-weight="800" text-anchor="middle" fill="${s}" font-family="system-ui">${c.data.number ?? ''}</text></svg>`;
  };

  const collectionTab = (): Raw => html`
    <div class="card" style="margin-bottom:14px"><div class="card-head"><div class="h2">Trophy shelf</div><span class="tiny muted">${d.trophies.length}</span></div>
      ${d.trophies.length ? html`<div class="cabinet">${d.trophies.map((t) => html`<div class="trophy">${trophyArt(t.kind, 60)}<div class="tiny" style="font-weight:800">${TROPHY_KINDS[t.kind as TrophyKind]?.label ?? t.kind}</div><div class="tiny dim">Season ${t.season}</div></div>`)}</div>`
        : html`<div class="empty small">The shelf is waiting. Win the league, the cup or a season award.</div>`}
    </div>
    <div class="card"><div class="card-head"><div class="h2">Memorabilia</div><span class="tiny muted">${d.collectibles.length}</span></div>
      ${d.collectibles.length ? html`<div class="list">${d.collectibles.map((c) => html`<a class="list-item" ${c.data.matchId ? html`href="/match/${c.data.matchId}"` : ''}>
          ${c.kind === 'shirt' ? shirtSvg(c) : html`<span class="memo-ball">${icon('ball', 28)}</span>`}
          <div class="grow" style="min-width:0"><div class="ellipsis" style="font-weight:700">${c.label}</div><div class="tiny muted">${c.kind === 'shirt' ? `Swapped after a match${c.data.club ? ` with ${c.data.club}` : ''}` : c.data.score ?? 'Match ball'} · ${relTime(c.at)}</div></div>
        </a>`)}</div>`
        : html`<div class="empty small">Swap shirts after matches and score hat-tricks to fill your walls. Shirt swaps happen after about one in three official matches.</div>`}
    </div>`;

  const tabs: Tab[] = d.mine ? ['furnish', 'move', 'garage', 'collection'] : ['collection', 'garage'];
  const TAB_LABEL: Record<Tab, string> = { furnish: 'Furnish', move: 'Move house', garage: 'Garage', collection: 'Collection' };

  const panel = (): Raw => (tab === 'furnish' ? furnishTab() : tab === 'move' ? moveTab() : tab === 'garage' ? garageTab() : collectionTab());

  const stageTitle = (): Raw => html`<div class="stage-title"><div class="eyebrow">${showGarage() ? 'Garage' : tier().name}</div>
    <div style="font-weight:800">${showGarage() ? `${d.cars.length} of ${tier().garage} spaces` : `${tier().size[0]} × ${tier().size[1]} m · ${tier().view} view`}</div></div>`;

  // The layout is drawn once; only the side panel and stage labels change, so
  // the 3D canvas never has to move.
  mount(el, html`
    <div class="page-head"><div class="row" style="gap:12px">${avatarSvg(d.player.appearance, kit, 52, d.club ? d.player.shirt : undefined, { eq: d.player.equipped })}<div><div class="eyebrow">Off the pitch</div><div class="h1">${d.mine ? 'My home' : `${d.player.name}'s place`}</div></div></div>
      <div class="row" style="gap:10px">${d.club ? html`<a href="/club/${d.club.id}" class="chip">${badge(d.club as never, 18)} ${d.club.short}</a>` : ''}${!d.mine ? html`<a class="btn sm" href="/player/${d.player.id}">${icon('user', 14)} Profile</a>` : ''}${coinsPill()}</div></div>
    <div class="house-layout">
      <div class="house-stage card flush">
        <div id="h3d" class="h3d-host"></div>
        <div id="stage-title">${stageTitle()}</div>
        <div class="stage-switch"><button data-stage="room" class="${showGarage() ? '' : 'on'}">${icon('sofa', 14)} Home</button><button data-stage="garage" class="${showGarage() ? 'on' : ''}">${icon('car', 14)} Garage</button></div>
        <div class="tiny dim stage-hint">Drag to look around</div>
      </div>
      <div class="house-main">
        <div class="tabs" id="htabs">${tabs.map((t) => html`<button class="${t === tab ? 'on' : ''}" data-tab="${t}">${TAB_LABEL[t]}</button>`)}</div>
        <div id="hpanel" class="fade-in">${panel()}</div>
      </div>
    </div>`);

  const roomData = () => ({
    home: d.home,
    trophies: d.trophies,
    collectibles: d.collectibles,
    owner: { appearance: d.player.appearance, equipped: d.player.equipped, kit, keeper: d.player.position === 'GK' },
  });
  const garageData = () => ({ cars: d.cars, capacity: tier().garage, fav: d.home.favCar });

  let lastStage = '';
  const drawStage = (force = false) => {
    const which = showGarage() ? 'garage' : 'room';
    const key = which + JSON.stringify(which === 'garage' ? garageData() : [d.home, d.trophies.length, d.collectibles.length]);
    if (!scene || (!force && key === lastStage)) return;
    lastStage = key;
    if (which === 'garage') scene.garage(garageData());
    else scene.room(roomData());
  };

  const refresh = () => {
    el.querySelector('#htabs')!.innerHTML = tabs.map((t) => html`<button class="${t === tab ? 'on' : ''}" data-tab="${t}">${TAB_LABEL[t]}</button>`.html).join('');
    el.querySelector('#hpanel')!.innerHTML = panel().html;
    el.querySelector('#stage-title')!.innerHTML = stageTitle().html;
    el.querySelectorAll<HTMLElement>('[data-stage]').forEach((b) => b.classList.toggle('on', (b.dataset.stage === 'garage') === showGarage()));
    const c = el.querySelector('#coins');
    if (c) c.textContent = (d.coins ?? 0).toLocaleString();
    drawStage();
  };

  (async () => {
    const host = el.querySelector<HTMLElement>('#h3d')!;
    try {
      const { createHomeScene } = await import('../viewer/home3d.ts');
      await afterPaint();
      if (disposed) return;
      scene = createHomeScene(host);
      drawStage(true);
    } catch {
      host.innerHTML = html`<div class="empty small">3D view is not available on this device.</div>`.html;
    }
  })();

  const act = async (fn: () => Promise<void>) => {
    if (busy) return;
    busy = true;
    try {
      await fn();
      refresh();
    } catch (err) {
      toast((err as Error).message, 'err');
    } finally {
      busy = false;
    }
  };

  const syncCoins = async () => {
    await refreshMe();
    if (state.player) d.coins = state.player.coins;
  };

  el.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const tb = t.closest('[data-tab]') as HTMLElement | null;
    if (tb) { tab = tb.dataset.tab as Tab; return refresh(); }
    const st = t.closest('[data-stage]') as HTMLElement | null;
    if (st) {
      const g = st.dataset.stage === 'garage';
      if (g !== showGarage()) tab = g ? 'garage' : d.mine ? 'furnish' : 'collection';
      return refresh();
    }
    if (!d.mine) return;
    const sl = t.closest('[data-slot]') as HTMLElement | null;
    if (sl) { slot = sl.dataset.slot as FurnitureSlot | 'style'; return refresh(); }
    const fu = t.closest('[data-furn]') as HTMLElement | null;
    if (fu) {
      const f = FURNITURE_BY_ID[fu.dataset.furn!];
      if (d.home.furniture[f.slot] === f.id) return;
      const has = d.furniture.includes(f.id);
      if (!has && !(await confirmModal(`Buy ${f.name}?`, `${f.price.toLocaleString()} coins. It goes straight into your home.`, 'Buy'))) return;
      return act(async () => {
        const r = has ? await api.post('/api/house/arrange', { itemId: f.id }) : await api.post('/api/house/furniture', { itemId: f.id });
        d.home = r.home;
        if (!has) {
          d.furniture.push(f.id);
          d.coins = r.coins;
          toast(`${f.name} delivered!`, 'ok');
          await syncCoins();
        }
      });
    }
    const cl = t.closest('[data-clear]') as HTMLElement | null;
    if (cl) return act(async () => { d.home = (await api.post('/api/house/arrange', { clear: cl.dataset.clear })).home; });
    const wl = t.closest('[data-wall]') as HTMLElement | null;
    if (wl) return act(async () => { d.home = (await api.post('/api/house/arrange', { wall: +wl.dataset.wall! })).home; });
    const fl = t.closest('[data-floor]') as HTMLElement | null;
    if (fl) return act(async () => { d.home = (await api.post('/api/house/arrange', { floor: +fl.dataset.floor! })).home; });
    const hb = t.closest('[data-house]') as HTMLElement | null;
    if (hb) {
      const h = HOUSE_BY_ID[hb.dataset.house!];
      const has = d.houses.includes(h.id);
      if (!has && !(await confirmModal(`Buy the ${h.name}?`, `${h.price.toLocaleString()} coins. You move in straight away, keep your furniture, and get space for ${h.garage} car${h.garage === 1 ? '' : 's'}. You can move back to any home you own for free.`, 'Buy and move in'))) return;
      return act(async () => {
        const r = await api.post('/api/house/buy', { houseId: h.id });
        d.home = r.home;
        d.coins = r.coins;
        if (!has) {
          d.houses.push(h.id);
          toast(`Welcome to your ${h.name}!`, 'ok');
          achievementToasts(r.achievements);
          await syncCoins();
        }
        tab = 'furnish';
      });
    }
    const pt = t.closest('[data-paint]') as HTMLElement | null;
    if (pt) { paint[pt.dataset.paint!] = pt.dataset.color!; return refresh(); }
    const cb = t.closest('[data-car]') as HTMLElement | null;
    if (cb) {
      const m = CAR_BY_ID[cb.dataset.car!];
      const color = paint[m.id] ?? CAR_COLORS[(m.price / 100) % CAR_COLORS.length | 0];
      if (!(await confirmModal(`Buy the ${m.name}?`, `${m.price.toLocaleString()} coins. Purely for style: it lives in your garage for everyone to see.`, 'Buy'))) return;
      return act(async () => {
        const r = await api.post('/api/garage/buy', { carId: m.id, color });
        d.coins = r.coins;
        d.cars.push({ id: m.id, color, at: new Date().toISOString() });
        if (!d.home.favCar) d.home.favCar = m.id;
        toast(`The ${m.name} is in your garage!`, 'ok');
        achievementToasts(r.achievements);
        await syncCoins();
      });
    }
    const rs = t.closest('[data-respray]') as HTMLElement | null;
    if (rs) {
      const car = d.cars.find((c) => c.id === rs.dataset.respray)!;
      if (car.color === rs.dataset.color) return;
      if (!(await confirmModal('Respray?', `A new coat of paint costs ${RESPRAY_COST} coins.`, 'Respray'))) return;
      return act(async () => {
        const r = await api.post('/api/garage/respray', { carId: car.id, color: rs.dataset.color });
        car.color = rs.dataset.color!;
        d.coins = r.coins;
        await syncCoins();
      });
    }
    const fv = t.closest('[data-fav]') as HTMLElement | null;
    if (fv) return act(async () => { d.home = (await api.post('/api/garage/favourite', { carId: fv.dataset.fav })).home; });
  });

  return () => {
    disposed = true;
    scene?.dispose();
  };
}
