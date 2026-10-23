// Shop & locker: buy cosmetics with coins, try them on a 3D preview, equip
// them, and edit your look.
import { sanitizeAppearance, type Appearance } from '../../shared/appearance.ts';
import { ITEM_BY_ID, ITEMS, RARITY_COLORS, SLOT_LABELS, SLOTS, gear, type Equipped, type Item, type Slot } from '../../shared/cosmetics.ts';
import { api } from '../api.ts';
import { avatar } from '../art.ts';
import { afterPaint, html, mount, type Raw } from '../dom.ts';
import { cardBackground, itemArt } from '../gearArt.ts';
import { icon } from '../icons.ts';
import { mountLookStudio } from '../lookEditor.ts';
import { refreshMe, state } from '../state.ts';
import { achievementToasts, confirmModal, errorBox, skeleton, toast } from '../ui.ts';
import type { Turntable } from '../viewer/turntable.ts';

type Tab = 'shop' | 'locker' | 'look';

interface ShopData {
  kit: { primary: string; secondary: string };
  shirt: number;
  coins: number;
  featured: string[];
  deal: string;
  prices: Record<string, number>;
  nextRotation: string;
  owned: string[];
  equipped: Equipped;
}

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
  let tab: Tab = (params[0] as Tab) || initial;
  let filter: Slot | 'all' = 'all';
  let trying: string | null = null;
  let look: Appearance = sanitizeAppearance(me.appearance);
  let lookDirty = false;
  let motto = me.motto ?? '';
  let tt: Turntable | null = null;
  let disposed = false;
  let rotTimer = 0;
  let studio: { destroy(): void } | null = null;

  const owned = () => new Set(d.owned);
  const preview = (): Equipped => {
    const eq = { ...d.equipped };
    if (trying) eq[ITEM_BY_ID[trying].slot] = trying;
    return eq;
  };

  const rarityTag = (it: Item) => html`<span class="rarity" style="--rc:${RARITY_COLORS[it.rarity]}">${it.rarity}</span>`;

  const priceTag = (it: Item): Raw => {
    if (owned().has(it.id)) return html`<span class="chip lime">${icon('sparkle', 12)} Owned</span>`;
    const pr = d.prices[it.id];
    if (!pr) return html`<span class="chip">Earn it</span>`;
    const deal = it.id === d.deal;
    return html`<span class="price ${pr > d.coins ? 'short' : ''}">${icon('coin', 14)} ${pr.toLocaleString()}${deal ? html` <s class="dim">${it.price.toLocaleString()}</s>` : ''}</span>`;
  };

  const itemCard = (it: Item, big = false): Raw => html`<button type="button" class="item-card ${big ? 'big' : ''} ${trying === it.id ? 'sel' : ''} ${owned().has(it.id) ? 'owned' : ''}" data-item="${it.id}" style="--rc:${RARITY_COLORS[it.rarity]}">
    ${it.id === d.deal ? html`<span class="deal">-30%</span>` : ''}
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
    return html`<div class="try-bar fade-in" style="--rc:${RARITY_COLORS[it.rarity]}">
      <div class="grow"><div class="row" style="gap:8px">${rarityTag(it)}<span class="tiny muted">${SLOT_LABELS[it.slot]}</span></div>
        <div style="font-weight:800;font-size:17px;margin-top:4px">${it.name}</div>
        <div class="small muted">${it.desc}${!pr && !has && it.source ? html` <span class="lime">${it.source}.</span>` : ''}</div></div>
      <div class="row" style="gap:8px">
        ${has ? (equipped ? html`<button class="btn" data-unequip="${it.slot}">Unequip</button>` : html`<button class="btn primary" data-equip="${it.id}">Equip</button>`)
          : pr ? html`<button class="btn primary" data-buy="${it.id}" ${pr > d.coins ? 'disabled' : ''}>${icon('coin', 16)} Buy ${pr.toLocaleString()}</button>` : ''}
        <button class="btn ghost" data-untry aria-label="Stop trying on">${icon('x', 16)}</button>
      </div>
    </div>`;
  };

  const shopTab = (): Raw => {
    const list = ITEMS.filter((i) => filter === 'all' || i.slot === filter).sort((a, b) => Number(!a.price) - Number(!b.price) || a.price - b.price);
    return html`
      <div class="card" style="margin-bottom:16px">
        <div class="card-head"><div><div class="eyebrow">Featured today</div><div class="h2" style="margin-top:2px">Daily drop</div></div><span class="chip">${icon('clock', 12)} <span id="rot">${rotLabel()}</span></span></div>
        <div class="item-grid featured">${d.featured.map((id) => itemCard(ITEM_BY_ID[id], true))}</div>
      </div>
      <div class="filter-row">${(['all', ...SLOTS] as const).map((s) => html`<button class="fchip ${filter === s ? 'on' : ''}" data-filter="${s}">${s === 'all' ? 'All' : SLOT_LABELS[s]}</button>`)}</div>
      <div class="item-grid">${list.map((it) => itemCard(it))}</div>`;
  };

  const lockerTab = (): Raw => {
    const own = owned();
    return html`<div class="stack" style="gap:12px">${SLOTS.map((slot) => {
      const items = ITEMS.filter((i) => i.slot === slot && own.has(i.id));
      const cur = d.equipped[slot];
      return html`<div class="card locker-row">
        <div class="row between" style="margin-bottom:10px"><div class="h3">${SLOT_LABELS[slot]}</div><span class="tiny muted">${cur ? ITEM_BY_ID[cur].name : slot === 'boots' || slot === 'head' || slot === 'wrist' || slot === 'neck' ? 'Using your basic look' : 'Nothing equipped'}</span></div>
        ${items.length ? html`<div class="locker-scroll">
          <button class="lslot ${!cur ? 'on' : ''}" data-unequip="${slot}"><div class="none">—</div><div class="tiny">None</div></button>
          ${items.map((it) => html`<button class="lslot ${cur === it.id ? 'on' : ''}" data-equip="${it.id}" style="--rc:${RARITY_COLORS[it.rarity]}">${itemArt(it, 64)}<div class="tiny ellipsis">${it.name}</div></button>`)}
        </div>` : html`<div class="small dim">You don't own any ${SLOT_LABELS[slot].toLowerCase()} yet. <a href="#" data-goshop="${slot}" class="lime">Browse the shop</a></div>`}
      </div>`;
    })}</div>`;
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
      <div class="grow"><div style="font-weight:800" class="ellipsis">${me.name}</div>
        ${g.title ? html`<div class="title-tag" style="--rc:${RARITY_COLORS[g.title.rarity]}">${g.title.name}</div>` : html`<div class="tiny muted">${me.position} · ${me.ovr} OVR</div>`}</div>
    </div>`;
  };

  const render = () => {
    const g = gear(preview());
    mount(el, html`
      <div class="shop-layout">
        <div class="shop-stage-col">
          <div class="shop-stage card flush">
            <div id="tt" class="tt-host"></div>
            <div class="stage-tags">
              ${trying ? html`<span class="chip lime">Trying on: ${ITEM_BY_ID[trying].name}</span>` : ''}
            </div>
            ${g.celebration ? html`<button class="btn sm stage-cel" id="celebrate">${icon('sparkle', 14)} ${g.celebration.name}</button>` : ''}
            <div class="tiny dim stage-hint">Drag to turn</div>
          </div>
          <div style="margin-top:12px">${profilePreview()}</div>
        </div>
        <div class="shop-main">
          <div class="page-head"><div><div class="eyebrow">Style</div><div class="h1">Shop & locker</div></div>
            <span class="coin-pill">${icon('coin', 18)} <b id="coins">${d.coins.toLocaleString()}</b></span></div>
          <div class="tabs">${(['shop', 'locker', 'look'] as Tab[]).map((t) => html`<button class="${t === tab ? 'on' : ''}" data-tab="${t}">${t === 'shop' ? 'Shop' : t === 'locker' ? 'Locker' : 'Look'}</button>`)}</div>
          <div id="detail">${detail()}</div>
          <div class="fade-in">${tab === 'shop' ? shopTab() : tab === 'locker' ? lockerTab() : lookTab()}</div>
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
      tt.set(look, preview(), d.kit, me.position === 'GK');
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
      tt.set(look, preview(), d.kit, me.position === 'GK');
      tt.focus(tab === 'look' ? 'face' : 'body');
    } catch {
      host.innerHTML = html`<div class="empty small">3D preview is not available on this device.</div>`.html;
    }
  };

  const refreshStage = () => {
    tt?.set(look, preview(), d.kit, me.position === 'GK');
    const pv = el.querySelector('.mini-card');
    if (pv) pv.outerHTML = profilePreview().html;
  };

  function rotLabel() {
    const ms = new Date(d.nextRotation).getTime() - Date.now();
    if (ms <= 0) return 'New items now';
    const h = Math.floor(ms / 3600_000);
    const m = Math.floor((ms % 3600_000) / 60_000);
    return `New items in ${h}h ${m}m`;
  }
  rotTimer = window.setInterval(() => {
    const r = el.querySelector('#rot');
    if (r) r.textContent = rotLabel();
  }, 30_000);

  const equip = async (slot: Slot, itemId: string | null) => {
    try {
      const r = await api.post('/api/locker/equip', { slot, itemId });
      d.equipped = r.equipped;
      if (state.player) state.player.equipped = r.equipped;
      if (trying && ITEM_BY_ID[trying].slot === slot) trying = null;
      render();
      if (itemId && slot === 'celebration') tt?.celebrate();
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
    const f = t.closest('[data-filter]') as HTMLElement | null;
    if (f) { filter = f.dataset.filter as Slot | 'all'; return render(); }
    const gs = t.closest('[data-goshop]') as HTMLElement | null;
    if (gs) { e.preventDefault(); tab = 'shop'; filter = gs.dataset.goshop as Slot; return render(); }
    if (t.closest('[data-untry]')) { trying = null; return render(); }
    const buy = t.closest('[data-buy]') as HTMLElement | null;
    if (buy) {
      const it = ITEM_BY_ID[buy.dataset.buy!];
      const pr = d.prices[it.id];
      if (!(await confirmModal(`Buy ${it.name}?`, `${pr.toLocaleString()} coins. Cosmetic only: it changes how you look, not how you play.`, 'Buy'))) return;
      try {
        const r = await api.post('/api/shop/buy', { itemId: it.id });
        d.coins = r.coins;
        d.owned = [...d.owned, it.id];
        toast(`${it.name} is yours!`, 'ok');
        achievementToasts(r.achievements);
        await equip(it.slot, it.id);
        await refreshMe();
        if (state.player) {
          d.coins = state.player.coins;
          const c = el.querySelector('#coins');
          if (c) c.textContent = d.coins.toLocaleString();
        }
      } catch (err) {
        toast((err as Error).message, 'err');
      }
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
      if (tags) tags.innerHTML = it ? html`<span class="chip lime">Trying on: ${it.name}</span>`.html : '';
      refreshStage();
      if (it?.slot === 'celebration') tt?.celebrate();
      if (trying && window.innerWidth < 900) el.querySelector('.shop-stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (t.closest('#celebrate')) return tt?.celebrate();
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
    if (tt) { parkedTT?.dispose(); tt.park(); parkedTT = tt; }
    if (lookDirty) toast('Unsaved look changes were discarded');
  };
}

export const lockerPage = (el: HTMLElement, params: string[]) => shopPage(el, params, 'locker');
