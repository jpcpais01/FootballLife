// The daily loop on the client: the check-in sheet, goal cards, the Fame bar,
// and the little celebrations when a goal completes or you level up.
import { api } from './api.ts';
import { html, type Raw } from './dom.ts';
import { icon } from './icons.ts';
import { refreshMe, state } from './state.ts';
import { countdown, toast } from './ui.ts';
import { fameTitle, GOAL_BY_ID, levelCoins } from '../shared/daily.ts';

export interface Goal { id: string; text: string; icon: string; href: string; target: number; progress: number; coins: number; fame: number; done: boolean; claimed: boolean }
export interface Daily {
  day: string;
  resetsAt: string;
  checkin: { done: boolean; streak: number; day: number; week: { coins: number; fame: number }[]; reward: { coins: number; fame: number } };
  goals: Goal[];
  bonus: { coins: number; fame: number; ready: boolean; claimed: boolean };
  fame: { level: number; into: number; need: number; total: number; title: string };
}

/** Where a goal's link should go, now that we know the player's club. */
function goalHref(g: Goal) {
  const club = state.player?.clubId;
  if (g.href.startsWith('/club') && !g.href.startsWith('/clubs')) return club ? g.href.replace('/club', `/club/${club}`) : '/clubs';
  return g.href;
}

export function fameBar(f: Daily['fame'], big = false): Raw {
  const pct = Math.round((f.into / f.need) * 100);
  return html`<div class="fame ${big ? 'big' : ''}">
    <div class="fame-lv"><span>LV</span><b>${f.level}</b></div>
    <div class="fame-body"><div class="fame-row"><b>${f.title}</b><span class="num">${f.into} / ${f.need}</span></div>
      <div class="fame-track"><i style="width:${pct}%"></i></div></div></div>`;
}

export function streakWeek(d: Daily): Raw {
  const c = d.checkin;
  // Which day of the week-long cycle you're on: done days, today, and the ones to come.
  const pos = ((c.day - 1) % 7) + 1;
  return html`<div class="streak-week">${c.week.map((r, i) => {
    const n = i + 1;
    const st = n < pos || (n === pos && c.done) ? 'got' : n === pos ? 'today' : 'next';
    return html`<div class="sw-day ${st} ${n === 7 ? 'big' : ''}"><span class="sw-n">Day ${n}</span><i>${st === 'got' ? icon('check', 18) : n === 7 ? icon('gift', 20) : icon('coin', 18)}</i><b>${r.coins}</b></div>`;
  })}</div>`;
}

export function goalRows(d: Daily, compact = false): Raw {
  const row = (g: Goal) => html`<div class="goal ${g.claimed ? 'claimed' : g.done ? 'ready' : ''}">
    <i class="goal-ic">${icon(g.claimed ? 'check' : g.icon, 18)}</i>
    <div class="goal-body"><div class="goal-text">${g.text}</div>
      <div class="goal-track"><i style="width:${Math.round((g.progress / g.target) * 100)}%"></i></div>
      <div class="goal-meta"><span>${icon('coin', 12)} ${g.coins}</span><span>${icon('star', 12)} ${g.fame} fame</span>${g.target > 1 ? html`<span class="num">${g.progress}/${g.target}</span>` : ''}</div></div>
    ${g.claimed ? html`<span class="goal-done">Done</span>`
      : g.done ? html`<button class="btn sm primary" data-dclaim="${g.id}">Claim</button>`
      : html`<a class="btn sm ghost" href="${goalHref(g)}" data-dclose>Go</a>`}
  </div>`;
  const b = d.bonus;
  return html`<div class="goals ${compact ? 'compact' : ''}">${d.goals.map(row)}
    <div class="goal bonus ${b.claimed ? 'claimed' : b.ready ? 'ready' : ''}">
      <i class="goal-ic">${icon(b.claimed ? 'check' : 'gift', 18)}</i>
      <div class="goal-body"><div class="goal-text">Finish all three</div>
        <div class="goal-meta"><span>${icon('coin', 12)} ${b.coins}</span><span>${icon('star', 12)} ${b.fame} fame</span><span>${d.goals.filter((g) => g.done).length}/3</span></div></div>
      ${b.claimed ? html`<span class="goal-done">Done</span>` : b.ready ? html`<button class="btn sm primary" data-dclaim="bonus">Open</button>` : html`<span class="goal-lock">${icon('lock', 16)}</span>`}
    </div></div>`;
}

function sheet(d: Daily): Raw {
  const c = d.checkin;
  return html`<div class="dly" role="dialog" aria-modal="true" aria-label="Today">
    <button class="dly-x" data-dclose aria-label="Close">${icon('x', 18)}</button>
    <section class="dly-left">
      <div class="eyebrow">${icon('flame', 14)} ${c.done ? `${c.streak}-day streak` : c.streak ? `${c.streak}-day streak, keep it going` : 'Start a streak'}</div>
      <div class="dly-title">${c.done ? 'See you tomorrow' : `Day ${c.day} reward`}</div>
      ${streakWeek(d)}
      ${c.done ? html`<p class="dly-note">Come back tomorrow for day ${c.day + 1 > 7 ? ((c.day % 7) + 1) : c.day + 1}. Miss a day and the streak starts again.</p>`
        : html`<button class="btn primary lg block dly-claim" data-checkin>${icon('coin')} Claim ${c.reward.coins} coins</button>`}
      ${fameBar(d.fame, true)}
    </section>
    <section class="dly-right">
      <div class="dly-head"><span class="h3">Daily goals</span><span class="chip">${icon('clock', 12)} New in <b class="num" data-countdown="${d.resetsAt}">${countdown(d.resetsAt)}</b></span></div>
      ${goalRows(d)}
    </section>
  </div>`;
}

let open: HTMLElement | null = null;

export async function openDaily() {
  if (open) return;
  const back = document.createElement('div');
  back.className = 'modal-back dly-back';
  open = back;
  back.innerHTML = html`<div class="dly loading">${icon('target', 30)}</div>`.html;
  document.body.appendChild(back);
  const life = new AbortController();
  const close = () => { back.remove(); open = null; clearInterval(t); life.abort(); };
  const t = window.setInterval(() => back.querySelectorAll<HTMLElement>('[data-countdown]').forEach((c) => (c.textContent = countdown(c.dataset.countdown!))), 1000);
  back.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el === back || el.closest('[data-dclose]')) close();
  });
  document.addEventListener('daily-changed', (e) => {
    back.innerHTML = sheet((e as CustomEvent<Daily>).detail).html;
  }, { signal: life.signal });
  try {
    back.innerHTML = sheet(await api.get('/api/daily')).html;
  } catch (e) {
    close();
    toast((e as Error).message, 'err');
  }
}

// Claims work the same from the sheet and from the home card.
document.addEventListener('click', async (e) => {
  const el = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-checkin], [data-dclaim]');
  if (!el || el.disabled) return;
  el.disabled = true;
  try {
    const r = el.dataset.dclaim
      ? await api.post('/api/daily/claim', { id: el.dataset.dclaim })
      : await api.post('/api/daily/checkin');
    coinBurst(el, r.reward.coins);
    toast(`+${r.reward.coins} coins · +${r.reward.fame} fame`, 'ok');
    document.dispatchEvent(new CustomEvent('daily-changed', { detail: r.daily }));
    await refreshMe();
  } catch (err) {
    el.disabled = false;
    toast((err as Error).message, 'err');
  }
});

/** A handful of coins fly from the button to your coin count. */
export function coinBurst(from: Element, coins: number) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const a = from.getBoundingClientRect();
  const chip = document.querySelector('.coin-chip');
  const b = chip && chip.getBoundingClientRect().width ? chip.getBoundingClientRect() : { left: innerWidth - 80, top: 10, width: 40, height: 30 };
  const n = Math.min(12, 4 + Math.round(coins / 50));
  for (let i = 0; i < n; i++) {
    const c = document.createElement('i');
    c.className = 'fly-coin';
    c.innerHTML = icon('coin', 18).html;
    document.body.appendChild(c);
    const x0 = a.left + a.width / 2 + (Math.random() - 0.5) * a.width * 0.6;
    const y0 = a.top + a.height / 2;
    const x1 = b.left + b.width / 2;
    const y1 = b.top + b.height / 2;
    const mx = x0 + (Math.random() - 0.5) * 160;
    const my = Math.min(y0, y1) - 40 - Math.random() * 80;
    c.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(.4)`, opacity: 0 },
      { transform: `translate(${mx}px, ${my}px) scale(1.15)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${x1}px, ${y1}px) scale(.6)`, opacity: 0.9 },
    ], { duration: 700 + Math.random() * 300, delay: i * 45, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'both' }).onfinish = () => {
      c.remove();
      chip?.animate([{ transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 220 });
    };
  }
}

/** Full-screen moment for reaching a new Fame level. */
function levelUp(level: number, title: string) {
  const el = document.createElement('div');
  el.className = 'lvl-up';
  el.innerHTML = html`<div class="lvl-card"><div class="lvl-rays"></div><div class="eyebrow">Fame level up</div><div class="lvl-num">${level}</div><div class="lvl-title">${title}</div><div class="lvl-coins">${icon('coin', 16)} +${levelCoins(level)} coins</div><div class="tiny muted">Tap to continue</div></div>`.html;
  document.body.appendChild(el);
  const done = () => { el.classList.add('out'); setTimeout(() => el.remove(), 400); };
  el.addEventListener('click', done);
  setTimeout(done, 4200);
}

function goalToast(text: string) {
  let wrap = document.querySelector('.ach-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'ach-wrap';
    document.body.appendChild(wrap);
  }
  const t = document.createElement('div');
  t.className = 'ach-toast';
  t.style.setProperty('--tier', 'var(--lime)');
  t.innerHTML = html`<div class="ach-medal">${icon('target', 22)}</div><div><div class="tiny" style="color:var(--tier);font-weight:800;letter-spacing:.12em">DAILY GOAL COMPLETE</div><div style="font-weight:800">${text}</div><div class="tiny muted">Claim it from Today</div></div>`.html;
  wrap.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 500); }, 3800);
}

let seen: { level: number; ready: string[] } | null = null;

/** Called whenever /api/me refreshes: celebrates what changed since last time. */
export function watchDaily() {
  const d = state.daily;
  if (!d) return;
  if (seen) {
    if (d.level > seen.level) {
      levelUp(d.level, fameTitle(d.level));
    }
    const fresh = d.ready.filter((id) => id !== 'bonus' && !seen!.ready.includes(id));
    if (fresh.length) {
      fresh.forEach((id, i) => setTimeout(() => goalToast(GOAL_BY_ID[id]?.text ?? 'Goal complete'), i * 600));
    }
  }
  seen = { level: d.level, ready: d.ready };
  // Once a day, the check-in greets you on the home screen.
  if (d.checkin && location.pathname === '/') {
    let shown = '';
    try { shown = localStorage.getItem('fl-checkin') ?? ''; } catch { /* storage unavailable */ }
    const today = new Date().toISOString().slice(0, 10);
    if (shown !== today) {
      try { localStorage.setItem('fl-checkin', today); } catch { /* storage unavailable */ }
      setTimeout(() => void openDaily(), 700);
    }
  }
}
