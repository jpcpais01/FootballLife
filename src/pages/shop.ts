// Shop & locker: streetwear, accessories, matchday gear and profile flair.
// Everything can be tried on the 3D player before buying. Also home to the
// free daily box (twice a day) and stars, the premium currency.
import { sanitizeAppearance, type Appearance } from '../../shared/appearance.ts';
import {
  CASUAL_SLOTS, ITEM_BY_ID, ITEMS, RARITIES, RARITY_COLORS, RARITY_LABELS, SECTIONS, SLOT_LABELS, gear,
  type BoxPrize, type Equipped, type Item, type Rarity, type Slot,
} from '../../shared/cosmetics.ts';
import type { StarPack } from '../../shared/stars.ts';
import { api } from '../api.ts';
import { avatar } from '../art.ts';
import { afterPaint, html, mount, type Raw } from '../dom.ts';
import { cardBackground, itemArt, nameTag } from '../gearArt.ts';
import { icon } from '../icons.ts';
import { mountLookStudio } from '../lookEditor.ts';
import { refreshMe, state } from '../state.ts';
import { achievementToasts, confirmModal, errorBox, skeleton, toast } from '../ui.ts';
import type { Turntable } from '../viewer/turntable.ts';

type Tab = 'shop' | 'box' | 'stars' | 'locker' | 'look';

interface ShopData {
  kit: { primary: string; secondary: string };
  shirt: number;
  coins: number;
  stars: number;
  featured: string[];
  deal: string;
  prices: Record<string, number>;
  nextRotation: string;
  owned: string[];
  equipped: Equipped;
  box: { ready: boolean; slot: 'am' | 'pm'; next: string; odds: Record<string, number> };
  ads: { left: number; limit: number; reward: number; seconds: number };
  packs: StarPack[];
  paymentsLive: boolean;
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'shop', label: 'Shop' },
  { id: 'box', label: 'Daily box' },
  { id: 'stars', label: 'Stars' },
  { id: 'locker', label: 'Locker' },
  { id: 'look', label: 'Look' },
];
/** Gear only worn on the pitch: the stage shows the kit while it is tried on. */
const PITCH: Slot[] = ['boots', 'band', 'sweat', 'celebration'];

// The turntable outlives the page so coming back to the shop is instant.
let parkedTT: Turntable | null = null;

export async function shopPage(el: HTMLElement, params: string[], initial: Tab = 'shop') {
  mount(el, html`${skeleton(420, 1)}`);
  let d: ShopData;
  try {
    d = await api.page('/api/shop');
  } catch (e) {
    mount(el, errorBox((e as Error).message));
    return;
  }
  const me = state.player!;
  let tab: Tab = TABS.some((t) => t.id === params[0]) ? (params[0] as Tab) : initial;
  let section = SECTIONS[0].id;
  let slotF: Slot | 'all' = 'all';
  let rarityF: Rarity | 'all' = 'all';
  let trying: string | null = null;
  let street = true;
  let still = false;
  let look: Appearance = sanitizeAppearance(me.appearance);
  let lookDirty = false;
  let motto = me.motto ?? '';
  let tt: Turntable | null = null;
  let disposed = false;
  let rotTimer = 0;
  let adTimer = 0;
  let studio: { destroy(): void } | null = null;
  let opening = false;

  const owned = () => new Set(d.owned);
  const preview = (): Equipped => {
    const eq = { ...d.equipped };
    if (trying) eq[ITEM_BY_ID[trying].slot] = trying;
    return eq;
  };
  /** Street clothes on the stage, unless matchday gear is being tried on or the kit is chosen. */
  const casualStage = () => (trying ? !PITCH.includes(ITEM_BY_ID[trying].slot) : street);

  const rarityTag = (it: Item) => html`<span class="rarity r-${it.rarity}" style="--rc:${RARITY_COLORS[it.rarity]}">${RARITY_LABELS[it.rarity]}</span>`;
  const starPrice = (n: number, short = false) => html`<span class="price star ${short ? 'short' : ''}">${icon('star', 13)} ${n.toLocaleString()}</span>`;

  const priceTag = (it: Item): Raw => {
    if (owned().has(it.id)) return html`<span class="chip lime">${icon('sparkle', 12)} Owned</span>`;
    const pr = d.prices[it.id];
    if (!pr && it.stars) return starPrice(it.stars, it.stars > d.stars);
    if (!pr) return html`<span class="chip">Earn it</span>`;
    const deal = it.id === d.deal;
    return html`<span class="price ${pr > d.coins ? 'short' : ''}">${icon('coin', 14)} ${pr.toLocaleString()}${deal ? html` <s class="dim">${it.price.toLocaleString()}</s>` : ''}</span>`;
  };

  const itemCard = (it: Item, big = false): Raw => html`<button type="button" class="item-card r-${it.rarity} ${big ? 'big' : ''} ${trying === it.id ? 'sel' : ''} ${owned().has(it.id) ? 'owned' : ''}" data-item="${it.id}" style="--rc:${RARITY_COLORS[it.rarity]}">
    ${it.id === d.deal ? html`<span class="deal">-30%</span>` : it.stars && !it.price && !owned().has(it.id) ? html`<span class="deal star-deal">${icon('star', 11)}</span>` : ''}
    <div class="art">${itemArt(it, big ? 120 : 84)}</div>
    <div class="nm ellipsis">${it.name}</div>
    <div class="row between" style="gap:6px">${rarityTag(it)}${priceTag(it)}</div>
  </button>`;

  const detail = (): Raw => {
    if (!trying) return html``;
    const it = ITEM_BY_ID[trying];
    const has = owned().has(it.id);
    const pr = d.prices[it.id];
    const equipped = d.equipped[it.slot] === it.id;
    return html`<div class="try-bar fade-in r-${it.rarity}" style="--rc:${RARITY_COLORS[it.rarity]}">
      <div class="grow"><div class="row" style="gap:8px">${rarityTag(it)}<span class="tiny muted">${SLOT_LABELS[it.slot]}</span></div>
        <div style="font-weight:800;font-size:17px;margin-top:4px">${it.name}</div>
        <div class="small muted">${it.desc}${!pr && !it.stars && !has && it.source ? html` <span class="lime">${it.source}.</span>` : ''}</div></div>
      <div class="row wrap" style="gap:8px">
        ${has ? (equipped ? html`<button class="btn" data-unequip="${it.slot}">Unequip</button>` : html`<button class="btn primary" data-equip="${it.id}">Wear it</button>`)
          : html`${pr ? html`<button class="btn primary" data-buy="${it.id}" ${pr > d.coins ? 'disabled' : ''}>${icon('coin', 16)} ${pr.toLocaleString()}</button>` : ''}
            ${it.stars ? html`<button class="btn star-btn" data-buystars="${it.id}" ${it.stars > d.stars ? 'disabled' : ''}>${icon('star', 16)} ${it.stars.toLocaleString()}</button>` : ''}
            ${it.stars && it.stars > d.stars ? html`<button class="btn ghost sm" data-tab="stars">Get stars</button>` : ''}`}
        <button class="btn ghost" data-untry aria-label="Stop trying on">${icon('x', 16)}</button>
      </div>
    </div>`;
  };

  const shopTab = (): Raw => {
    const sec = SECTIONS.find((s) => s.id === section)!;
    const list = ITEMS.filter((i) => sec.slots.includes(i.slot) && (slotF === 'all' || i.slot === slotF) && (rarityF === 'all' || i.rarity === rarityF))
      .sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity) || (a.price || (a.stars ?? 0) * 25) - (b.price || (b.stars ?? 0) * 25));
    return html`
      <div class="card drop-card" style="margin-bottom:16px">
        <div class="card-head"><div><div class="eyebrow">Featured today</div><div class="h2" style="margin-top:2px">Daily drop</div></div><span class="chip">${icon('clock', 12)} <span id="rot">${rotLabel()}</span></span></div>
        <div class="item-grid featured">${d.featured.map((id) => itemCard(ITEM_BY_ID[id], true))}</div>
      </div>
      <div class="seg-row">${SECTIONS.map((s) => html`<button class="sec-btn ${section === s.id ? 'on' : ''}" data-section="${s.id}">${s.label}</button>`)}</div>
      <div class="filter-row">
        <button class="fchip ${slotF === 'all' ? 'on' : ''}" data-filter="all">All</button>
        ${sec.slots.map((s) => html`<button class="fchip ${slotF === s ? 'on' : ''}" data-filter="${s}">${SLOT_LABELS[s]}</button>`)}
        <span class="fsep"></span>
        ${RARITIES.map((r) => html`<button class="fchip rchip ${rarityF === r ? 'on' : ''}" data-rarity="${r}" style="--rc:${RARITY_COLORS[r]}"><i></i>${RARITY_LABELS[r]}</button>`)}
      </div>
      ${list.length ? html`<div class="item-grid">${list.map((it) => itemCard(it))}</div>` : html`<div class="empty small">Nothing here at that rarity. Try another filter.</div>`}`;
  };

  // ---- Daily box ----
  const boxTab = (): Raw => {
    const odds = d.box.odds;
    const rows: [string, string, number][] = [
      ['Coins', '#c6ff3d', odds.coins],
      ['Stars', '#ffd25e', odds.stars],
      ...(['common', 'rare', 'epic', 'legendary'] as Rarity[]).map((r): [string, string, number] => [`${RARITY_LABELS[r]} item`, RARITY_COLORS[r], odds[r]]),
    ];
    return html`<div class="box-wrap">
      <div class="card box-card ${d.box.ready ? 'ready' : ''}">
        <div class="eyebrow">${d.box.slot === 'am' ? 'Morning box' : 'Evening box'}</div>
        <div class="h2" style="margin-top:2px">${d.box.ready ? 'Your free box is ready' : 'Box opened'}</div>
        <div class="small muted" style="margin-top:4px">A free box every morning and every evening. Items you already own turn into coins.</div>
        <div class="box-stage" id="boxstage">${boxArt()}</div>
        ${d.box.ready
          ? html`<button class="btn primary big-btn" id="openbox">${icon('gift', 18)} Open box</button>`
          : html`<div class="box-next">${icon('clock', 14)} Next box in <b id="boxnext">${untilLabel(d.box.next)}</b></div>`}
      </div>
      <div class="card odds-card">
        <div class="h3">What's inside</div>
        <div class="tiny muted" style="margin:2px 0 10px">The chance of each prize in one box.</div>
        ${rows.map(([label, c, pct]) => html`<div class="odds-row"><i style="background:${c}"></i><span class="grow">${label}</span><b>${pct}%</b></div><div class="odds-bar"><i style="width:${Math.max(2, pct * 2)}%;background:${c}"></i></div>`)}
        <div class="tiny dim" style="margin-top:10px">Mythic pieces never drop from boxes. They are sold for stars only.</div>
      </div>
    </div>`;
  };
  const boxArt = () => html`<div class="lootbox"><div class="lb-glow"></div><div class="lb-lid"></div><div class="lb-body"><span class="lb-band"></span><span class="lb-mark">${icon('star', 26)}</span></div></div>`;

  const prizeCard = (p: BoxPrize): Raw => {
    if (p.kind === 'coins') return html`<div class="prize" style="--rc:#c6ff3d"><div class="prize-big">${icon('coin', 44)}</div><div class="h2">+${p.amount} coins</div></div>`;
    if (p.kind === 'stars') return html`<div class="prize" style="--rc:#ffd25e"><div class="prize-big star">${icon('star', 44)}</div><div class="h2">+${p.amount} stars</div></div>`;
    const it = ITEM_BY_ID[p.itemId];
    return html`<div class="prize r-${it.rarity}" style="--rc:${RARITY_COLORS[it.rarity]}">
      <div class="prize-art">${itemArt(it, 130)}</div>${rarityTag(it)}<div class="h2" style="margin-top:4px">${it.name}</div>
      ${p.dupe ? html`<div class="small muted">Already yours, so it pays <b class="lime">${p.dupe} coins</b>.</div>` : html`<button class="btn primary" data-equip="${it.id}" style="margin-top:10px">Wear it</button>`}
    </div>`;
  };

  // ---- Stars ----
  const starsTab = (): Raw => html`<div class="stack" style="gap:16px">
    <div class="card stars-hero">
      <div class="row" style="gap:14px"><div class="star-orb">${icon('star', 34)}</div>
        <div class="grow"><div class="eyebrow">Your stars</div><div class="star-bal">${d.stars.toLocaleString()}</div>
          <div class="small muted">Stars are the premium currency. They buy the rarest legendary and mythic pieces, and you can donate them to your club.</div></div></div>
    </div>
    <div class="card ad-card">
      <div class="row between wrap" style="gap:12px">
        <div><div class="h3">Watch a short ad</div><div class="small muted">+${d.ads.reward} stars each, ${d.ads.limit} a day.</div></div>
        <div class="row" style="gap:10px"><div class="ad-pips">${Array.from({ length: d.ads.limit }, (_, i) => html`<i class="${i < d.ads.limit - d.ads.left ? 'on' : ''}"></i>`)}</div>
          <button class="btn star-btn" id="watchad" ${d.ads.left ? '' : 'disabled'}>${icon('play', 15)} ${d.ads.left ? 'Watch' : 'Done for today'}</button></div>
      </div>
    </div>
    <div>
      <div class="row between" style="margin:4px 2px 10px"><div class="h3">Star packs</div>${d.paymentsLive ? '' : html`<span class="chip">Coming soon</span>`}</div>
      <div class="pack-grid">${d.packs.map((p, i) => html`<button class="pack-card ${p.tag ? 'tagged' : ''}" data-pack="${p.id}" ${d.paymentsLive ? '' : 'aria-disabled="true"'}>
        ${p.tag ? html`<span class="pack-tag">${p.tag}</span>` : ''}
        <div class="pack-stars" style="--n:${i + 1}">${Array.from({ length: Math.min(4, i + 1) }, () => icon('star', 22 + i * 3))}</div>
        <div class="pack-n">${p.stars.toLocaleString()}${p.bonus ? html` <small>+${p.bonus}</small>` : ''}</div>
        <div class="pack-price">${p.price}</div>
      </button>`)}</div>
      ${d.paymentsLive ? '' : html`<div class="tiny dim" style="margin-top:8px">Buying stars with real money opens soon. Until then, earn them from ads and the daily box.</div>`}
    </div>
  </div>`;

  // ---- Locker ----
  const lockerTab = (): Raw => {
    const own = owned();
    const groups: { label: string; slots: Slot[] }[] = [{ label: 'Off the pitch', slots: CASUAL_SLOTS }, { label: 'Matchday', slots: PITCH }, { label: 'Profile', slots: ['border', 'card', 'title'] }];
    return html`<div class="stack" style="gap:18px">${groups.map((gp) => html`<div><div class="eyebrow" style="margin:0 2px 8px">${gp.label}</div><div class="stack" style="gap:10px">${gp.slots.map((slot) => {
      const items = ITEMS.filter((i) => i.slot === slot && own.has(i.id));
      const cur = d.equipped[slot];
      return html`<div class="card locker-row">
        <div class="row between" style="margin-bottom:10px"><div class="h3">${SLOT_LABELS[slot]}</div><span class="tiny muted">${cur ? ITEM_BY_ID[cur].name : slot === 'top' || slot === 'bottom' || slot === 'shoes' ? 'Wearing the basics' : 'Nothing equipped'}</span></div>
        ${items.length ? html`<div class="locker-scroll">
          <button class="lslot ${!cur ? 'on' : ''}" data-unequip="${slot}"><div class="none">—</div><div class="tiny">None</div></button>
          ${items.map((it) => html`<button class="lslot r-${it.rarity} ${cur === it.id ? 'on' : ''}" data-equip="${it.id}" style="--rc:${RARITY_COLORS[it.rarity]}">${itemArt(it, 64)}<div class="tiny ellipsis">${it.name}</div></button>`)}
        </div>` : html`<div class="small dim">You don't own any ${SLOT_LABELS[slot].toLowerCase()} yet. <a href="#" data-goshop="${slot}" class="lime">Browse the shop</a></div>`}
      </div>`;
    })}</div></div>`)}</div>`;
  };

  const lookTab = (): Raw => html`<div class="card stack look-card" style="gap:16px">
    <div id="lk"></div>
    <div class="field"><label>Motto <span class="dim">(shown on your profile)</span></label><input class="input" id="motto" maxlength="80" placeholder="e.g. Never stop running." value="${motto}"></div>
    <button class="btn primary" id="savelook">Save look</button>
  </div>`;

  const profilePreview = (): Raw => {
    const g = gear(preview());
    return html`<div class="mini-card" style="background:${cardBackground(g.card)}">
      ${avatar(look, d.kit, 64, undefined, { eq: preview(), offPitch: true })}
      <div class="grow" style="min-width:0"><div style="font-weight:800" class="ellipsis">${nameTag(me.name, g.border)}</div>
        ${g.title ? html`<div class="title-tag" style="--rc:${RARITY_COLORS[g.title.rarity]}">${g.title.name}</div>` : html`<div class="tiny muted">${me.position} · ${me.ovr} OVR</div>`}</div>
    </div>`;
  };

  const wallet = () => html`<div class="row" style="gap:8px"><span class="coin-pill">${icon('coin', 18)} <b id="coins">${d.coins.toLocaleString()}</b></span>
    <button class="coin-pill star-pill" data-tab="stars" aria-label="Stars">${icon('star', 18)} <b id="stars">${d.stars.toLocaleString()}</b>${icon('plus', 14)}</button></div>`;

  const stageTags = () => html`${trying ? html`<span class="chip lime">Trying on: ${ITEM_BY_ID[trying].name}</span>` : ''}`;

  const render = () => {
    const g = gear(preview());
    mount(el, html`
      <div class="shop-layout">
        <div class="shop-stage-col">
          <div class="shop-stage card flush">
            <div id="tt" class="tt-host"></div>
            <div class="stage-tags">${stageTags()}</div>
            <div class="stage-mode seg">${[true, false].map((s) => html`<button class="${casualStage() === s ? 'on' : ''}" data-street="${s ? 1 : 0}">${s ? 'Street' : 'Matchday'}</button>`)}</div>
            ${g.celebration && !casualStage() ? html`<button class="btn sm stage-cel" id="celebrate">${icon('sparkle', 14)} ${g.celebration.name}</button>` : ''}
            <button class="btn sm stage-still ${still ? 'on' : ''}" id="still" aria-pressed="${still}" title="Hold him still to look closely; you can still turn him">${icon(still ? 'play' : 'pause', 14)} ${still ? 'Animate' : 'Hold still'}</button>
            <div class="tiny dim stage-hint">Drag to turn</div>
          </div>
          <div style="margin-top:12px">${profilePreview()}</div>
        </div>
        <div class="shop-main">
          <div class="page-head"><div><div class="eyebrow">Style</div><div class="h1">Shop & locker</div></div>${wallet()}</div>
          <div class="tabs">${TABS.map((t) => html`<button class="${t.id === tab ? 'on' : ''}" data-tab="${t.id}">${t.label}${t.id === 'box' && d.box.ready ? html`<i class="tab-dot"></i>` : ''}</button>`)}</div>
          <div id="detail">${detail()}</div>
          <div class="fade-in">${tab === 'shop' ? shopTab() : tab === 'box' ? boxTab() : tab === 'stars' ? starsTab() : tab === 'locker' ? lockerTab() : lookTab()}</div>
        </div>
      </div>`);
    studio?.destroy();
    studio = null;
    const lk = el.querySelector<HTMLElement>('#lk');
    if (lk) {
      studio = mountLookStudio(lk, look, {
        kit: d.kit,
        eq: preview(),
        onChange: () => { lookDirty = true; refreshStage(); },
        onFocus: (m) => tt?.focus(m),
      });
    } else tt?.focus('body');
    mountStage();
  };

  const setStage = () => tt?.set(look, preview(), d.kit, me.position === 'GK', casualStage());

  // The 3D stage survives re-renders: its canvas moves into the new host.
  let loading = false;
  const mountStage = async () => {
    const host = el.querySelector<HTMLElement>('#tt');
    if (!host) return;
    if (!tt && parkedTT) {
      tt = parkedTT;
      parkedTT = null;
      await afterPaint();
      if (disposed) return;
    }
    if (tt) {
      tt.attach(host);
      tt.freeze(still);
      setStage();
      tt.focus(tab === 'look' ? 'face' : 'body');
      return;
    }
    if (loading) return;
    loading = true;
    try {
      const { createTurntable } = await import('../viewer/turntable.ts');
      await afterPaint();
      if (disposed) return;
      tt = createTurntable(el.querySelector<HTMLElement>('#tt') ?? host);
      tt.freeze(still);
      setStage();
      tt.focus(tab === 'look' ? 'face' : 'body');
    } catch {
      host.innerHTML = html`<div class="empty small">3D preview is not available on this device.</div>`.html;
    }
  };

  const refreshStage = () => {
    setStage();
    const pv = el.querySelector('.mini-card');
    if (pv) pv.outerHTML = profilePreview().html;
    el.querySelectorAll<HTMLElement>('[data-street]').forEach((b) => b.classList.toggle('on', (b.dataset.street === '1') === casualStage()));
  };

  function rotLabel() {
    const ms = new Date(d.nextRotation).getTime() - Date.now();
    if (ms <= 0) return 'New items now';
    const h = Math.floor(ms / 3600_000);
    const m = Math.floor((ms % 3600_000) / 60_000);
    return `New items in ${h}h ${m}m`;
  }
  function untilLabel(iso: string) {
    const ms = Math.max(0, new Date(iso).getTime() - Date.now());
    const h = Math.floor(ms / 3600_000);
    const m = Math.floor((ms % 3600_000) / 60_000);
    return h ? `${h}h ${m}m` : `${m}m`;
  }
  rotTimer = window.setInterval(() => {
    const r = el.querySelector('#rot');
    if (r) r.textContent = rotLabel();
    const b = el.querySelector('#boxnext');
    if (b) b.textContent = untilLabel(d.box.next);
    // A new box window opened while the page is up.
    if (!d.box.ready && Date.now() >= new Date(d.box.next).getTime()) {
      d.box = { ...d.box, ready: true, slot: d.box.slot === 'am' ? 'pm' : 'am' };
      if (tab === 'box') render();
    }
  }, 30_000);

  const balances = (r: { coins?: number; stars?: number }) => {
    if (typeof r.coins === 'number') d.coins = r.coins;
    if (typeof r.stars === 'number') d.stars = r.stars;
    if (state.player) {
      state.player.coins = d.coins;
      state.player.stars = d.stars;
    }
    const c = el.querySelector('#coins');
    if (c) c.textContent = d.coins.toLocaleString();
    const s = el.querySelector('#stars');
    if (s) s.textContent = d.stars.toLocaleString();
  };

  const equip = async (slot: Slot, itemId: string | null) => {
    try {
      const r = await api.post('/api/locker/equip', { slot, itemId });
      d.equipped = r.equipped;
      if (state.player) state.player.equipped = r.equipped;
      if (trying && ITEM_BY_ID[trying].slot === slot) trying = null;
      if (itemId) street = !PITCH.includes(slot);
      render();
      if (itemId && slot === 'celebration') tt?.celebrate();
    } catch (err) {
      toast((err as Error).message, 'err');
    }
  };

  const buy = async (it: Item, currency: 'coins' | 'stars') => {
    const amount = currency === 'stars' ? it.stars! : d.prices[it.id];
    const what = currency === 'stars' ? `${amount.toLocaleString()} stars` : `${amount.toLocaleString()} coins`;
    if (!(await confirmModal(`Buy ${it.name}?`, `${what}. Cosmetic only: it changes how you look, not how you play.`, 'Buy'))) return;
    try {
      const r = await api.post('/api/shop/buy', { itemId: it.id, currency });
      balances(r);
      d.owned = [...d.owned, it.id];
      toast(`${it.name} is yours!`, 'ok');
      achievementToasts(r.achievements);
      await equip(it.slot, it.id);
      void refreshMe();
    } catch (err) {
      toast((err as Error).message, 'err');
    }
  };

  const openBox = async () => {
    if (opening) return;
    opening = true;
    const stage = el.querySelector<HTMLElement>('#boxstage');
    stage?.querySelector('.lootbox')?.classList.add('shake');
    const btn = el.querySelector<HTMLButtonElement>('#openbox');
    if (btn) btn.disabled = true;
    try {
      const [r] = await Promise.all([api.post('/api/box/open', {}), new Promise((res) => setTimeout(res, 1300))]);
      balances(r);
      d.box = r.box;
      d.ads = r.ads;
      const p = r.prize as BoxPrize;
      if (p.kind === 'item' && !p.dupe) d.owned = [...d.owned, p.itemId];
      const rarity = p.kind === 'item' ? ITEM_BY_ID[p.itemId].rarity : 'common';
      stage?.querySelector('.lootbox')?.classList.add('burst');
      await new Promise((res) => setTimeout(res, 450));
      if (stage) {
        stage.classList.add(`won-${rarity}`);
        stage.innerHTML = prizeCard(p).html;
      }
      const head = el.querySelector('.box-card .h2');
      if (head) head.textContent = 'Box opened';
      btn?.replaceWith(Object.assign(document.createElement('div'), { className: 'box-next', innerHTML: html`${icon('clock', 14)} Next box in <b id="boxnext">${untilLabel(d.box.next)}</b>`.html }));
      el.querySelector('.tabs .tab-dot')?.remove();
      achievementToasts(r.achievements);
      if (p.kind === 'item' && !p.dupe) {
        trying = p.itemId;
        street = !PITCH.includes(ITEM_BY_ID[p.itemId].slot);
        refreshStage();
      }
      void refreshMe();
    } catch (err) {
      toast((err as Error).message, 'err');
      stage?.querySelector('.lootbox')?.classList.remove('shake');
      if (btn) btn.disabled = false;
    } finally {
      opening = false;
    }
  };

  /** A rewarded ad. No ad network yet: a short sponsored break stands in for it. */
  const watchAd = async () => {
    try {
      const r = await api.post('/api/stars/ad/start', {});
      const secs: number = r.seconds;
      const ov = document.createElement('div');
      ov.className = 'ad-overlay fade-in';
      ov.innerHTML = html`<div class="ad-box"><div class="eyebrow">Sponsored break</div>
        <div class="ad-art">${icon('star', 56)}</div>
        <div class="h2">FootbalLife Pro Kit</div><div class="small muted">Your ad plays here. Stars arrive when it ends.</div>
        <div class="ad-bar"><i id="adfill"></i></div><div class="tiny muted"><span id="adleft">${secs}</span>s</div>
        <button class="btn ghost sm" id="adskip">Close (no stars)</button></div>`.html;
      document.body.appendChild(ov);
      const t0 = performance.now();
      const done = await new Promise<boolean>((res) => {
        ov.querySelector('#adskip')!.addEventListener('click', () => res(false));
        adTimer = window.setInterval(() => {
          const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
          (ov.querySelector('#adfill') as HTMLElement).style.width = `${k * 100}%`;
          ov.querySelector('#adleft')!.textContent = String(Math.ceil(secs * (1 - k)));
          if (k >= 1) res(true);
        }, 100);
      });
      clearInterval(adTimer);
      ov.remove();
      if (!done) return;
      const c = await api.post('/api/stars/ad/claim', {});
      d.ads = c.ads;
      d.box = c.box;
      balances({ stars: c.stars });
      toast(`+${c.reward} stars`, 'ok');
      if (tab === 'stars') render();
    } catch (err) {
      toast((err as Error).message, 'err');
    }
  };

  el.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const tb = t.closest('[data-tab]') as HTMLElement | null;
    if (tb) {
      tab = tb.dataset.tab as Tab;
      history.replaceState(history.state, '', tab === 'shop' ? '/shop' : `/shop/${tab}`);
      return render();
    }
    const st = t.closest('[data-street]') as HTMLElement | null;
    if (st) { street = st.dataset.street === '1'; if (trying && PITCH.includes(ITEM_BY_ID[trying].slot) === street) trying = null; return render(); }
    const sec = t.closest('[data-section]') as HTMLElement | null;
    if (sec) { section = sec.dataset.section!; slotF = 'all'; return render(); }
    const f = t.closest('[data-filter]') as HTMLElement | null;
    if (f) { slotF = f.dataset.filter as Slot | 'all'; return render(); }
    const rf = t.closest('[data-rarity]') as HTMLElement | null;
    if (rf) { rarityF = rarityF === rf.dataset.rarity ? 'all' : (rf.dataset.rarity as Rarity); return render(); }
    const gs = t.closest('[data-goshop]') as HTMLElement | null;
    if (gs) {
      e.preventDefault();
      const slot = gs.dataset.goshop as Slot;
      tab = 'shop';
      section = SECTIONS.find((s) => s.slots.includes(slot))!.id;
      slotF = slot;
      return render();
    }
    if (t.closest('[data-untry]')) { trying = null; return render(); }
    const b = t.closest('[data-buy]') as HTMLElement | null;
    if (b) return buy(ITEM_BY_ID[b.dataset.buy!], 'coins');
    const bs = t.closest('[data-buystars]') as HTMLElement | null;
    if (bs) return buy(ITEM_BY_ID[bs.dataset.buystars!], 'stars');
    if (t.closest('#openbox')) return openBox();
    if (t.closest('#watchad')) return watchAd();
    if (t.closest('[data-pack]')) {
      if (!d.paymentsLive) toast('Star packs open soon. For now, earn stars from ads and the daily box.');
      return;
    }
    const eq = t.closest('[data-equip]') as HTMLElement | null;
    if (eq) { const it = ITEM_BY_ID[eq.dataset.equip!]; return equip(it.slot, it.id); }
    const un = t.closest('[data-unequip]') as HTMLElement | null;
    if (un) return equip(un.dataset.unequip as Slot, null);
    const card = t.closest('[data-item]') as HTMLElement | null;
    if (card) {
      trying = trying === card.dataset.item ? null : card.dataset.item!;
      const it = trying ? ITEM_BY_ID[trying] : null;
      el.querySelector('#detail')!.innerHTML = detail().html;
      el.querySelectorAll('.item-card').forEach((c) => c.classList.toggle('sel', (c as HTMLElement).dataset.item === trying));
      const tags = el.querySelector('.stage-tags');
      if (tags) tags.innerHTML = stageTags().html;
      refreshStage();
      if (it?.slot === 'celebration') tt?.celebrate();
      if (trying && window.innerWidth < 900) el.querySelector('.shop-stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (t.closest('#still')) {
      still = !still;
      tt?.freeze(still);
      const b2 = el.querySelector('#still');
      if (b2) b2.outerHTML = html`<button class="btn sm stage-still ${still ? 'on' : ''}" id="still" aria-pressed="${still}">${icon(still ? 'play' : 'pause', 14)} ${still ? 'Animate' : 'Hold still'}</button>`.html;
      return;
    }
    if (t.closest('#celebrate')) {
      if (still) { still = false; tt?.freeze(false); render(); }
      return tt?.celebrate();
    }
    if (t.closest('#savelook')) {
      try {
        motto = (el.querySelector<HTMLInputElement>('#motto')?.value ?? '').trim();
        await api.post('/api/player/appearance', { appearance: look });
        await api.post('/api/player/profile', { motto });
        lookDirty = false;
        await refreshMe();
        toast('Look saved', 'ok');
      } catch (err) {
        toast((err as Error).message, 'err');
      }
    }
  });

  render();
  return () => {
    disposed = true;
    studio?.destroy();
    clearInterval(rotTimer);
    clearInterval(adTimer);
    if (tt) { tt.freeze(false); parkedTT?.dispose(); tt.park(); parkedTT = tt; }
    if (lookDirty) toast('Unsaved look changes were discarded');
  };
}

export const lockerPage = (el: HTMLElement, params: string[]) => shopPage(el, params, 'locker');
