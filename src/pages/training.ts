// Training: pick a drill, play a short timing game on the 3D training ground,
// and bank XP scaled by how well you did. While recovering you can still practise.
import { ATTR_GROUPS, ATTR_LABELS, KEY_ATTRS, xpToNext, type Attr, type Position } from '../../shared/attributes.ts';
import { api } from '../api.ts';
import { sfx } from '../audio.ts';
import { afterPaint, html, mount } from '../dom.ts';
import { icon } from '../icons.ts';
import { refreshMe } from '../state.ts';
import { achievementToasts, countdown, errorBox, skeleton, toast } from '../ui.ts';
import type { DrillId, Outcome, TrainingGround } from '../viewer/trainingGround.ts';

const REPS = 6;
const COOLDOWN_H = 4;

const CATEGORY: Record<string, Attr[]> = {
  physical: ['pace', 'acceleration', 'stamina', 'strength'],
  technical: ['passing', 'ballControl', 'dribbling', 'vision'],
  defending: ['marking', 'tackling', 'defPositioning', 'interception'],
  attacking: ['finishing', 'shooting', 'offPositioning', 'keyPassing'],
};

const FOCI = [
  { id: 'position', name: 'Position drills', sub: 'Your five key attributes', icon: 'sparkle', accent: '#c6ff3d' },
  { id: 'attacking', name: 'Finishing', sub: 'Shooting and movement', icon: 'target', accent: '#ff5d73' },
  { id: 'technical', name: 'Passing', sub: 'Touch, vision and range', icon: 'send', accent: '#3dd6ff' },
  { id: 'physical', name: 'Speed & power', sub: 'Pace, stamina, strength', icon: 'fast', accent: '#ffb020' },
  { id: 'defending', name: 'Tackling', sub: 'Marking and timing', icon: 'shield', accent: '#a78bfa' },
] as const;

const DRILLS: Record<DrillId, { name: string; how: string; verb: string }> = {
  shooting: { name: 'Target finishing', how: 'Strike in the lime zone to hit the lit target. White is perfect.', verb: 'Shoot' },
  passing: { name: 'Rebound passing', how: 'Time the pass to find the lit board and take it back.', verb: 'Pass' },
  sprint: { name: 'Speed gates', how: 'Hit the burst on time to fly through each gate.', verb: 'Burst' },
  defending: { name: 'Slide tackling', how: 'Time the slide to win the ball cleanly.', verb: 'Tackle' },
  keeper: { name: 'Shot stopping', how: 'React in the zone to dive and hold the shot.', verb: 'Dive' },
};

function drillFor(focus: string, pos: Position): DrillId {
  if (focus === 'position') return pos === 'GK' ? 'keeper' : ['CB', 'FB', 'DM'].includes(pos) ? 'defending' : pos === 'CM' ? 'passing' : 'shooting';
  if (focus === 'attacking') return 'shooting';
  if (focus === 'technical') return 'passing';
  if (focus === 'physical') return 'sprint';
  if (focus === 'defending') return 'defending';
  const group = ATTR_GROUPS.find((g) => g.attrs.includes(focus as Attr))?.name;
  return group === 'Goalkeeping' ? 'keeper' : group === 'Defending' ? 'defending' : group === 'Physical' ? 'sprint' : group === 'Playmaking' ? 'passing' : 'shooting';
}

function targetsOf(focus: string, pos: Position): Attr[] {
  if (focus === 'position') return KEY_ATTRS[pos];
  return CATEGORY[focus] ?? [focus as Attr];
}

const grade = (s: number) => (s >= 90 ? 'S' : s >= 75 ? 'A' : s >= 55 ? 'B' : s >= 35 ? 'C' : 'D');
const mult = (s: number) => Math.round((0.8 + s / 200) * 100) / 100;
const accentOf = (focus: string) => FOCI.find((f) => f.id === focus)?.accent ?? '#e5e7eb';

let parked: TrainingGround | null = null;

export async function trainingPage(el: HTMLElement) {
  mount(el, html`<div class="stack">${skeleton(120, 3)}</div>`);
  let d: any;
  try {
    d = await api.page('/api/home');
  } catch (e) {
    mount(el, errorBox((e as Error).message));
    return;
  }
  const pos = d.player.position as Position;
  let focus: string = 'position';
  let phase: 'idle' | 'countdown' | 'playing' | 'results' = 'idle';
  let practice = false;
  let tg: TrainingGround | null = null;
  let disposed = false;
  let raf = 0;
  const timers = new Set<number>();
  const later = (ms: number, fn: () => void) => {
    const id = window.setTimeout(() => { timers.delete(id); if (!disposed) fn(); }, ms);
    timers.add(id);
  };
  const sleep = (ms: number) => new Promise<void>((r) => later(ms, r));

  const ready = () => d.training.ready as boolean;
  const lastTrain = () => new Date(d.training.availableAt).getTime() - COOLDOWN_H * 3600_000;
  const streakOn = () => {
    const last = lastTrain();
    return last > 0 && Date.now() - last < 24 * 3600_000;
  };

  mount(el, html`
    <div class="tr">
      <div class="tr-stage" id="stage">
        <div class="tr-3d" id="tg"></div>
        <div class="tr-shade"></div>
        <div class="tr-hud">
          <div class="tr-top">
            <div class="tr-title" id="title"></div>
            <div class="tr-side"><div class="tr-chips" id="chips"></div><div class="tr-tally" id="tally"></div></div>
          </div>
          <div class="tr-menu" id="drills"></div>
          <div class="tr-pop" id="pop"></div>
          <div class="tr-bottom">
            <div class="tr-meter" id="meter" hidden>
              <div class="tr-track" id="track"><i class="good" id="mgood"></i><i class="perfect" id="mperfect"></i><b class="needle" id="needle"></b></div>
              <div class="tr-hint"><kbd>Space</kbd> or tap to <span id="verb">strike</span></div>
            </div>
            <div class="tr-cta" id="cta"></div>
          </div>
        </div>
        <div class="tr-results" id="results" hidden></div>
      </div>
      <div class="card" id="progress"></div>
    </div>`);

  const $ = <T extends HTMLElement = HTMLElement>(s: string) => el.querySelector(s) as T;

  // ---- Static parts ----
  const renderChips = () => {
    $('#chips').innerHTML = html`
      ${ready() && streakOn() ? html`<span class="chip lime">${icon('flame', 13)} Regularity +15%</span>` : ''}
      <span class="chip ${ready() ? 'lime' : ''}">${icon('clock', 13)} ${ready() ? 'Session ready' : html`Recovering · <span data-cd="${d.training.availableAt}">${countdown(d.training.availableAt)}</span>`}</span>`.html;
  };

  const renderTitle = () => {
    const dr = DRILLS[drillFor(focus, pos)];
    $('#stage').style.setProperty('--ac', accentOf(focus));
    $('#title').innerHTML = html`<div class="eyebrow">Training ground · ${practice ? 'Practice' : 'Drill'}</div><div class="tr-name">${dr.name}</div><div class="tr-how">${dr.how}</div>`.html;
  };

  const renderCta = () => {
    const cta = $('#cta');
    if (phase !== 'idle') {
      cta.innerHTML = '';
      return;
    }
    cta.innerHTML = ready()
      ? html`<div class="tr-go"><button class="btn white lg tr-start" data-start>${icon('play', 18)} Start drill</button>
          <button class="btn ghost" data-quick title="Skip the drill and train at the standard rate">Quick session</button></div>
          <div class="tr-note">Your score scales the XP: ×0.8 to ×1.3</div>`.html
      : html`<div class="tr-rest"><div class="tr-ring" style="--p:${restProgress()}"><span>${icon('clock', 18)}</span></div>
          <div><div class="h3">Recovering</div><div class="small muted">Next session in <b data-cd="${d.training.availableAt}">${countdown(d.training.availableAt)}</b></div></div></div>
          <button class="btn tr-start" data-start>${icon('play', 15)} Practise for fun</button>`.html;
  };
  const restProgress = () => {
    const end = new Date(d.training.availableAt).getTime();
    return Math.max(0, Math.min(1, 1 - (end - Date.now()) / (COOLDOWN_H * 3600_000))).toFixed(3);
  };

  const renderDrills = () => {
    const keys = new Set(KEY_ATTRS[pos]);
    const single = !FOCI.some((f) => f.id === focus);
    $('#drills').innerHTML = html`
      ${FOCI.map((f) => {
        const t = targetsOf(f.id, pos);
        const k = t.filter((a) => keys.has(a)).length;
        return html`<button class="tr-item ${focus === f.id ? 'on' : ''}" data-focus="${f.id}" style="--ac:${f.accent}" ${phase !== 'idle' ? 'disabled' : ''}>
          <span class="tr-ic">${icon(f.icon, 18)}</span>
          <span class="tr-it"><b>${f.name}</b><small>${DRILLS[drillFor(f.id, pos)].name}${k ? html` · <em>${k} key</em>` : ''}</small></span>
        </button>`;
      })}
      <label class="tr-item tr-single ${single ? 'on' : ''}" style="--ac:#e5e7eb">
        <span class="tr-ic">${icon('dumbbell', 18)}</span>
        <span class="tr-it"><b>Specialist</b><select id="single" ${phase !== 'idle' ? 'disabled' : ''}><option value="">One attribute…</option>${ATTR_GROUPS.map((g) => html`<optgroup label="${g.name}">${g.attrs.map((a) => html`<option value="${a}" ${focus === a ? 'selected' : ''}>${ATTR_LABELS[a]}${keys.has(a) ? ' ●' : ''}</option>`)}</optgroup>`)}</select></span>
      </label>`.html;
  };

  const renderProgress = (flash: Attr[] = []) => {
    const p = d.player;
    const xp = (d.training.xp ?? {}) as Record<string, number>;
    const keys = new Set(KEY_ATTRS[pos]);
    const tgt = new Set(targetsOf(focus, pos));
    const fl = new Set(flash);
    $('#progress').innerHTML = html`
      <div class="card-head"><div class="h2">Attributes</div><div class="row" style="gap:8px"><span class="chip"><span class="lime">●</span> Key for ${pos}</span><span class="chip">${p.ovr} OVR</span></div></div>
      <div class="tr-attrs">${ATTR_GROUPS.map((g) => html`<div class="stack" style="gap:9px"><div class="label">${g.name}</div>
        ${g.attrs.map((a) => {
          const v = p.attrs[a];
          const need = xpToNext(v);
          const have = xp[a] ?? 0;
          return html`<div class="attr ${keys.has(a) ? 'key' : ''} ${tgt.has(a) ? 'tgt' : ''} ${fl.has(a) ? 'up' : ''}"><span class="n">${ATTR_LABELS[a]}${keys.has(a) ? html` <span class="lime">●</span>` : ''}</span><span class="v">${v}</span>
            <div class="bar" title="${have}/${need} XP to ${v + 1}"><i style="width:${Math.min(100, (have / need) * 100)}%"></i></div></div>`;
        })}</div>`)}</div>
      <p class="tiny dim" style="margin:14px 0 0">Highlighted attributes improve with the selected drill. Key attributes train 25% faster; bars show XP toward the next point.</p>`.html;
  };

  const setPhase = (p: typeof phase) => {
    phase = p;
    $('#stage').dataset.phase = p;
  };

  const renderAll = () => {
    renderChips();
    renderTitle();
    renderCta();
    renderDrills();
    renderProgress();
  };
  setPhase('idle');
  renderAll();

  // ---- 3D ----
  // Let the page paint first; the 3D pitch arrives a frame later, and is reused between visits.
  await afterPaint();
  if (disposed) return;
  if (parked) {
    tg = parked;
    parked = null;
    tg.attach($('#tg'));
    tg.setView('hero');
    tg.reset();
  } else {
    const { createTrainingGround } = await import('../viewer/trainingGround.ts');
    if (disposed) return;
    tg = createTrainingGround($('#tg'));
  }
  const kit = d.club?.colors ?? { primary: '#1d2329', secondary: '#c6ff3d' };
  tg.setPlayer(d.player.appearance, d.player.equipped ?? {}, kit, pos === 'GK');
  tg.setDrill(drillFor(focus, pos));

  /** Switching drills: a quick dip so the cut to the new spot reads as intended. */
  const pickFocus = (f: string) => {
    if (f === focus) return;
    focus = f;
    const host = $('#tg');
    host.classList.remove('swap');
    void host.offsetWidth;
    host.classList.add('swap');
    later(140, () => tg?.setDrill(drillFor(focus, pos)));
    renderTitle();
    renderDrills();
    renderProgress();
  };

  // ---- The timing game ----
  let needle = 0;
  let dir = 1;
  let speed = 1;
  let zone = { c: 0.5, good: 0.22, perfect: 0.07 };
  let armed = false;
  let pressed: ((o: Outcome) => void) | null = null;
  let total = 0;
  let combo = 0;
  let outcomes: Outcome[] = [];

  const tally = () => {
    $('#tally').innerHTML = phase === 'playing' || phase === 'countdown' ? html`
      <div class="tr-dots">${Array.from({ length: REPS }, (_, i) => html`<i class="${outcomes[i] ?? (i === outcomes.length ? 'now' : '')}"></i>`)}</div>
      <div class="tr-pts">${combo > 1 ? html`<span class="tr-combo">${icon('flame', 12)} ×${combo}</span>` : ''}<b class="num">${Math.round(total)}</b></div>`.html : '';
  };
  const pop = (text: string, cls: string, sub = '') => {
    const p = $('#pop');
    p.innerHTML = html`<span class="${cls}">${text}</span>${sub ? html`<small>${sub}</small>` : ''}`.html;
    p.classList.remove('go');
    void p.offsetWidth;
    p.classList.add('go');
  };

  const meterLoop = (t0: number) => {
    let last = t0;
    const step = (now: number) => {
      if (!armed || disposed) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      needle += dir * speed * dt;
      if (needle > 1) { needle = 2 - needle; dir = -1; }
      if (needle < 0) { needle = -needle; dir = 1; }
      $('#needle').style.left = `${needle * 100}%`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };

  const strike = () => {
    if (!armed || !pressed) return;
    armed = false;
    cancelAnimationFrame(raf);
    const off = Math.abs(needle - zone.c);
    const o: Outcome = off <= zone.perfect / 2 ? 'perfect' : off <= zone.good / 2 ? 'good' : 'miss';
    // The bar answers at once: a flash in the outcome's colour and a ripple where the needle stopped.
    const tr = $('#track');
    tr.dataset.hit = o;
    const ripple = document.createElement('i');
    ripple.className = `ripple ${o}`;
    ripple.style.left = `${Math.max(0, Math.min(1, needle)) * 100}%`;
    tr.appendChild(ripple);
    later(700, () => ripple.remove());
    const fn = pressed;
    pressed = null;
    fn(o);
  };

  const rep = (i: number) =>
    new Promise<Outcome>((resolve) => {
      speed = 0.85 + i * 0.16 + Math.random() * 0.08;
      const good = 0.24 - i * 0.022;
      const perfect = 0.075 - i * 0.006;
      zone = { c: good / 2 + 0.05 + Math.random() * (0.9 - good), good, perfect };
      needle = Math.random() < 0.5 ? 0 : 1;
      dir = needle === 0 ? 1 : -1;
      $('#mgood').style.cssText = `left:${(zone.c - good / 2) * 100}%;width:${good * 100}%`;
      $('#mperfect').style.cssText = `left:${(zone.c - perfect / 2) * 100}%;width:${perfect * 100}%`;
      delete $('#track').dataset.hit;
      $('#meter').hidden = false;
      $('#meter').classList.remove('done');
      tg?.prepare(i);
      pressed = resolve;
      armed = true;
      meterLoop(performance.now());
      // Too slow counts as a miss.
      later(7000, () => { if (pressed === resolve) { needle = -1; armed = true; strike(); } });
    });

  const run = async () => {
    if (phase !== 'idle' || !tg) return;
    practice = !ready();
    setPhase('countdown');
    total = 0;
    combo = 0;
    outcomes = [];
    renderTitle();
    renderCta();
    renderDrills();
    tg.setView('play');
    tg.reset();
    tally();
    await sleep(350);
    for (const n of ['3', '2', '1']) {
      pop(n, 'count');
      sfx('tick');
      await sleep(650);
      if (disposed) return;
    }
    const verb = DRILLS[drillFor(focus, pos)].verb;
    pop(verb + '!', 'go-word');
    sfx('whistle');
    $('#verb').textContent = verb.toLowerCase();
    setPhase('playing');
    for (let i = 0; i < REPS; i++) {
      tally();
      const o = await rep(i);
      if (disposed) return;
      $('#meter').classList.add('done');
      if (o === 'perfect') combo++;
      else if (o === 'miss') combo = 0;
      const gain = o === 'perfect' ? 100 * (1 + 0.1 * Math.max(0, combo - 1)) : o === 'good' ? 60 : 0;
      total += gain;
      outcomes.push(o);
      tally();
      pop(o === 'perfect' ? 'Perfect' : o === 'good' ? 'Good' : 'Miss', o, o === 'perfect' && combo > 1 ? `Combo ×${combo} · +${Math.round(gain)}` : gain ? `+${Math.round(gain)}` : '');
      await tg.play(o);
      if (disposed) return;
    }
    $('#meter').hidden = true;
    const score = Math.min(100, Math.round(total / REPS));
    await finish(score);
  };

  /** Rolls a number up from zero. */
  const countUp = (node: HTMLElement, to: number, ms = 900) => {
    const t0 = performance.now();
    const step = (now: number) => {
      if (disposed) return;
      const u = Math.min(1, (now - t0) / ms);
      node.textContent = String(Math.round(to * (1 - Math.pow(1 - u, 3))));
      if (u < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  const finish = async (score: number | null) => {
    const bonus = !practice && streakOn();
    setPhase('results');
    renderCta();
    const res = $('#results');
    const g = score == null ? '—' : grade(score);
    const head = html`<div class="tr-grade g-${g}"><span>${g}</span></div>
      <div class="tr-rh"><div class="eyebrow">${practice ? 'Practice round' : score == null ? 'Quick session' : 'Session complete'}</div>
      <div class="tr-rs">${score == null ? 'Standard session' : html`<b class="num" id="rscore">0</b><span>/100</span>`}</div>
      ${outcomes.length ? html`<div class="tr-rdots">${outcomes.map((o) => html`<i class="${o}"></i>`)}</div>` : ''}
      ${practice ? html`<div class="small muted">No XP while recovering. Next session in ${countdown(d.training.availableAt)}.</div>` : html`<div class="small muted">XP ×${score == null ? '1.00' : mult(score).toFixed(2)}${bonus ? ' · regularity bonus +15%' : ''}</div>`}</div>`;
    res.innerHTML = html`<div class="tr-rcard">${head}<div id="gains" class="tr-gains">${practice ? '' : html`<div class="small muted">Banking XP…</div>`}</div>
      <div class="row" style="gap:10px;justify-content:center;margin-top:6px"><button class="btn white" data-again>${practice ? 'Practise again' : 'Done'}</button></div></div>`.html;
    res.hidden = false;
    if (score != null) countUp($('#rscore'), score);
    if (score != null && score >= 75) tg?.cheer();
    if (practice) return;
    try {
      const before = { attrs: { ...d.player.attrs }, xp: { ...(d.training.xp ?? {}) } as Record<string, number> };
      const r = await api.post('/api/train', score == null ? { focus } : { focus, score });
      const targets = targetsOf(focus, pos);
      d = await api.get('/api/home');
      if (disposed) return;
      void refreshMe();
      const ups = r.levelUps as { attr: Attr; to: number }[];
      const gains = $('#gains');
      gains.innerHTML = html`${targets.map((a) => {
        const v0 = before.attrs[a];
        const v1 = r.attrs[a];
        const p0 = Math.min(100, ((before.xp[a] ?? 0) / xpToNext(v0)) * 100);
        const p1 = Math.min(100, ((r.xp[a] ?? 0) / xpToNext(v1)) * 100);
        const gained = v1 - v0;
        return html`<div class="tr-gain ${gained ? 'lvl' : ''}" data-p0="${p0}" data-p1="${p1}" data-lv="${gained}">
          <span class="n">${ATTR_LABELS[a]}</span><span class="v">${gained ? html`${v0} → <b>${v1}</b>` : v1}</span>
          <div class="bar"><i style="width:${p0}%"></i></div>${gained ? html`<span class="tr-plus">+${gained}</span>` : ''}</div>`;
      })}`.html;
      // Fill the bars: to the top and over for a level-up, then on to the new value.
      later(120, () => {
        gains.querySelectorAll<HTMLElement>('.tr-gain').forEach((row) => {
          const bar = row.querySelector<HTMLElement>('.bar > i')!;
          if (+row.dataset.lv!) {
            bar.style.width = '100%';
            later(850, () => {
              row.classList.add('pop');
              sfx('perfect', 0.6);
              bar.style.transition = 'none';
              bar.style.width = '0%';
              void bar.offsetWidth;
              bar.style.transition = '';
              bar.style.width = `${row.dataset.p1}%`;
            });
          } else bar.style.width = `${row.dataset.p1}%`;
        });
      });
      if (ups.length) tg?.cheer();
      achievementToasts(r.achievements);
      toast(ups.length ? `Level up: ${ups.map((u) => `${ATTR_LABELS[u.attr]} ${u.to}`).join(', ')}` : 'Training complete', 'ok');
      renderChips();
      renderProgress(ups.map((u) => u.attr));
    } catch (err) {
      $('#gains').innerHTML = html`<div class="small" style="color:var(--red)">${(err as Error).message}</div>`.html;
    }
  };

  const closeResults = () => {
    $('#results').hidden = true;
    setPhase('idle');
    practice = false;
    tg?.setView('hero');
    tg?.reset();
    tally();
    $('#pop').innerHTML = '';
    renderAll();
  };

  // ---- Input ----
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const f = t.closest('[data-focus]') as HTMLElement | null;
    if (f && phase === 'idle') {
      pickFocus(f.dataset.focus!);
      return;
    }
    if (t.closest('[data-start]')) void run();
    else if (t.closest('[data-quick]')) {
      if (phase !== 'idle') return;
      practice = false;
      void finish(null);
    } else if (t.closest('[data-again]')) {
      const again = practice;
      closeResults();
      if (again) void run();
    } else if (phase === 'playing' && t.closest('#stage')) strike();
  });
  // Touch: strike on the press itself, not the release, so timing feels instant.
  el.addEventListener('pointerdown', (e) => {
    if (phase !== 'playing' || e.pointerType === 'mouse') return;
    if (!(e.target as HTMLElement).closest('#stage')) return;
    strike();
  });
  el.addEventListener('change', (e) => {
    const s = e.target as HTMLSelectElement;
    if (s.id === 'single' && s.value) pickFocus(s.value);
  });
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    if (phase !== 'playing') return;
    if ((e.target as HTMLElement)?.closest?.('input, select, textarea')) return;
    e.preventDefault();
    strike();
  };
  window.addEventListener('keydown', onKey);

  const tick = window.setInterval(() => {
    el.querySelectorAll<HTMLElement>('[data-cd]').forEach((c) => (c.textContent = countdown(c.dataset.cd!)));
    const ring = el.querySelector<HTMLElement>('.tr-ring');
    if (ring) ring.style.setProperty('--p', restProgress());
    if (phase === 'idle' && !ready() && new Date(d.training.availableAt).getTime() <= Date.now()) {
      void api.get('/api/home').then((x) => { if (!disposed) { d = x; renderAll(); } });
      d.training.ready = true;
    }
  }, 1000);

  return () => {
    disposed = true;
    armed = false;
    cancelAnimationFrame(raf);
    clearInterval(tick);
    timers.forEach((id) => clearTimeout(id));
    window.removeEventListener('keydown', onKey);
    if (tg) { parked?.dispose(); tg.park(); parked = tg; }
  };
}
