import { esc, html, raw, type Raw } from './dom.ts';

export function toast(msg: string, kind: 'ok' | 'err' | '' = '') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const t = document.createElement('div');
  t.className = `toast ${kind}`;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => {
    t.style.transition = 'opacity .4s';
    t.style.opacity = '0';
    setTimeout(() => t.remove(), 400);
  }, 3600);
}

export function confirmModal(title: string, body: string, okLabel = 'Confirm', danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = html`<div class="modal" role="dialog" aria-modal="true">
      <div class="h2" style="margin-bottom:8px">${title}</div>
      <p class="muted" style="margin:0 0 20px">${body}</p>
      <div class="row" style="justify-content:flex-end">
        <button class="btn ghost" data-r="0">Cancel</button>
        <button class="btn ${danger ? 'danger' : 'primary'}" data-r="1">${okLabel}</button>
      </div></div>`.html;
    const done = (v: boolean) => {
      back.remove();
      resolve(v);
    };
    back.addEventListener('click', (e) => {
      const r = (e.target as HTMLElement).closest('[data-r]') as HTMLElement | null;
      if (r) done(r.dataset.r === '1');
      else if (e.target === back) done(false);
    });
    document.body.appendChild(back);
  });
}

export function promptModal(title: string, label: string, placeholder = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = html`<form class="modal">
      <div class="h2" style="margin-bottom:14px">${title}</div>
      <div class="field"><label>${label}</label><input class="input" name="v" placeholder="${placeholder}" autocomplete="off" required></div>
      <div class="row" style="justify-content:flex-end;margin-top:18px">
        <button type="button" class="btn ghost" data-x>Cancel</button><button class="btn primary">Continue</button>
      </div></form>`.html;
    const form = back.querySelector('form')!;
    const done = (v: string | null) => {
      back.remove();
      resolve(v);
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      done((form.elements.namedItem('v') as HTMLInputElement).value.trim());
    });
    back.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('[data-x]') || e.target === back) done(null);
    });
    document.body.appendChild(back);
    (form.elements.namedItem('v') as HTMLInputElement).focus();
  });
}

export function relTime(iso: string | number): string {
  const t = typeof iso === 'number' ? iso : new Date(iso).getTime();
  const d = t - Date.now();
  const abs = Math.abs(d);
  const fmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < 60_000) return fmt.format(Math.round(d / 1000), 'second');
  if (abs < 3600_000) return fmt.format(Math.round(d / 60_000), 'minute');
  if (abs < 86400_000) return fmt.format(Math.round(d / 3600_000), 'hour');
  return fmt.format(Math.round(d / 86400_000), 'day');
}

export function kickoffLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(Date.now() + 86400_000);
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Today ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
}

export function countdown(iso: string): string {
  const s = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function skeleton(h = 140, n = 3): Raw {
  return raw(Array.from({ length: n }, () => `<div class="skeleton" style="height:${h}px"></div>`).join(''));
}

export function errorBox(msg: string): Raw {
  return html`<div class="card empty"><div class="h3">Something went wrong</div><div>${msg}</div></div>`;
}

export { esc };

/** Celebratory banner for newly unlocked achievements. */
export function achievementToasts(ids: string[] | undefined) {
  if (!ids?.length) return;
  import('../shared/achievements.ts').then(({ ACH_BY_ID, TIER_COLORS }) => {
    ids.forEach((id, i) => {
      const a = ACH_BY_ID[id];
      if (!a) return;
      setTimeout(() => {
        let wrap = document.querySelector('.ach-wrap');
        if (!wrap) {
          wrap = document.createElement('div');
          wrap.className = 'ach-wrap';
          document.body.appendChild(wrap);
        }
        const t = document.createElement('div');
        t.className = 'ach-toast';
        t.style.setProperty('--tier', TIER_COLORS[a.tier]);
        t.innerHTML = html`<div class="ach-medal">★</div><div><div class="tiny" style="color:var(--tier);font-weight:800;letter-spacing:.12em">ACHIEVEMENT UNLOCKED</div><div style="font-weight:800">${a.name}</div><div class="tiny muted">${a.coins ? `+${a.coins} coins` : a.desc}</div></div>`.html;
        wrap.appendChild(t);
        setTimeout(() => {
          t.classList.add('out');
          setTimeout(() => t.remove(), 500);
        }, 4200);
      }, i * 700);
    });
  });
}
