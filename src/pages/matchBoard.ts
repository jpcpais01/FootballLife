// The fast-forward board: while build-up play is skipped (and at half-time),
// the 3D pitch gives way to a live data screen: attack momentum, where the
// ball has been, and the numbers so far.
import type { CommentaryLine } from '../../shared/commentary.ts';
import { minuteLabel } from '../../shared/config.ts';
import type { MatchEvent } from '../../shared/sim/types.ts';
import { html } from '../dom.ts';
import { evIcon } from '../eventIcons.ts';
import { icon } from '../icons.ts';

interface BoardTeam {
  short: string;
  primary: string;
  secondary: string;
}

export interface BoardContext {
  teams: [BoardTeam, BoardTeam];
  halftimeAt: number;
  events: () => MatchEvent[];
  lines: () => (CommentaryLine | null)[];
}

export interface BoardState {
  /** Clock now, and the clock the skip runs to (equal at half-time). */
  t: number;
  from: number;
  to: number;
  /** Game seconds per real second, for the speed chip. */
  rate: number;
  /** Real seconds left of the half-time break, or null outside it. */
  breakLeft: number | null;
  idx: number;
}

const hexRgb = (h: string) => {
  const n = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = (h: string) => {
  const [r, g, b] = hexRgb(h);
  return (0.3 * r + 0.59 * g + 0.11 * b) / 255;
};
const mixHex = (a: string, b: string, t: number) => {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
};
const dist = (a: string, b: string) => {
  const x = hexRgb(a);
  const y = hexRgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** Team colours that read on a dark board and against each other. */
function boardColors(teams: [BoardTeam, BoardTeam]): [string, string] {
  const lift = (c: string) => (lum(c) < 0.28 ? mixHex(c, '#ffffff', 0.45) : c);
  const home = lift(teams[0].primary);
  let away = lift(teams[1].primary);
  if (dist(home, away) < 120) away = lift(teams[1].secondary);
  if (dist(home, away) < 120) away = lum(home) > 0.6 ? '#3dd6ff' : '#f4f4f4';
  return [home, away];
}

/** How much each event pushes its side forward. */
function threat(e: MatchEvent, progress: number): number {
  const deep = Math.max(0, progress);
  switch (e.k) {
    case 'goal': return 5;
    case 'shot': return 2.2 + (e.xg ?? 0) * 9;
    case 'chance': return 1.6;
    case 'corner': return 1.3;
    case 'penalty': return 3;
    case 'cross': return 0.9 + deep * 0.6;
    case 'dribble':
    case 'carry': return deep * 0.8;
    case 'pass': return deep * deep * 0.55;
    case 'freekick': return deep > 0.4 ? 1 : 0.2;
    default: return 0;
  }
}

export function createBoard(stage: HTMLElement, ctx: BoardContext) {
  const colors = boardColors(ctx.teams);
  const el = document.createElement('div');
  el.className = 'ffb';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = html`
    <div class="ffb-bg"></div>
    <div class="ffb-in">
      <div class="ffb-head">
        <span class="ffb-tag" id="ffb-tag"><i class="ffb-chev">${icon('fast', 14)}</i><span id="ffb-title">Fast-forward</span></span>
        <span class="ffb-skip"><span id="ffb-range"></span><i class="ffb-prog"><b id="ffb-prog"></b></i><span class="ffb-rate" id="ffb-rate"></span></span>
      </div>
      <div class="ffb-pitch">
        <svg viewBox="-3 -3 111 74" id="ffb-pitch"></svg>
        <div class="ffb-tilt"><span class="k">Field tilt</span><b class="v" id="ffb-tilt-h"></b><i><b id="ffb-tilt-b"></b></i><b class="v" id="ffb-tilt-a"></b></div>
      </div>
      <div class="ffb-tiles" id="ffb-tiles"></div>
      <div class="ffb-graph">
        <div class="ffb-lbl"><span style="color:${colors[0]}">${ctx.teams[0].short}</span><span class="dim">Momentum</span><span style="color:${colors[1]}">${ctx.teams[1].short}</span></div>
        <svg preserveAspectRatio="none" id="ffb-mom"></svg>
      </div>
      <div class="ffb-feed" id="ffb-feed"></div>
    </div>`.html;
  stage.appendChild(el);
  const $ = (id: string) => el.querySelector('#' + id) as HTMLElement;
  const momSvg = $('ffb-mom') as unknown as SVGSVGElement;
  const pitchSvg = $('ffb-pitch') as unknown as SVGSVGElement;

  // Static pitch markings, then layers that change.
  const line = 'fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="0.45"';
  pitchSvg.innerHTML = `
    <defs>
      <radialGradient id="ffbH0"><stop offset="0" stop-color="${colors[0]}" stop-opacity="0.85"/><stop offset="1" stop-color="${colors[0]}" stop-opacity="0"/></radialGradient>
      <radialGradient id="ffbH1"><stop offset="0" stop-color="${colors[1]}" stop-opacity="0.85"/><stop offset="1" stop-color="${colors[1]}" stop-opacity="0"/></radialGradient>
      <clipPath id="ffbClip"><rect x="0" y="0" width="105" height="68" rx="1.5"/></clipPath>
      <linearGradient id="ffbTurf" x1="0" x2="1"><stop offset="0" stop-color="#0f2a19"/><stop offset="1" stop-color="#0b2014"/></linearGradient>
    </defs>
    <rect x="0" y="0" width="105" height="68" rx="1.5" fill="url(#ffbTurf)"/>
    ${Array.from({ length: 10 }, (_, i) => `<rect x="${i * 10.5}" y="0" width="5.25" height="68" fill="rgba(255,255,255,0.025)"/>`).join('')}
    <g id="ffb-heat" clip-path="url(#ffbClip)" style="mix-blend-mode:screen"></g>
    <rect x="0" y="0" width="105" height="68" ${line}/>
    <line x1="52.5" y1="0" x2="52.5" y2="68" ${line}/>
    <circle cx="52.5" cy="34" r="9.15" ${line}/>
    <rect x="0" y="13.84" width="16.5" height="40.32" ${line}/><rect x="88.5" y="13.84" width="16.5" height="40.32" ${line}/>
    <rect x="0" y="24.84" width="5.5" height="18.32" ${line}/><rect x="99.5" y="24.84" width="5.5" height="18.32" ${line}/>
    <polyline id="ffb-trail" fill="none" stroke="url(#ffbTrail)" stroke-width="0.9" stroke-linejoin="round" stroke-linecap="round"/>
    <g id="ffb-dots"></g>
    <circle id="ffb-ball" r="1.5" fill="#fff" class="ffb-ball"/>
    <g id="ffb-dir"></g>`;
  const heat = pitchSvg.querySelector('#ffb-heat')!;
  const trail = pitchSvg.querySelector('#ffb-trail')!;
  const dots = pitchSvg.querySelector('#ffb-dots')!;
  const ballEl = pitchSvg.querySelector('#ffb-ball') as SVGCircleElement;
  const dirEl = pitchSvg.querySelector('#ffb-dir')!;

  let shown = false;
  let lastDraw = 0;
  let lastIdx = -2;
  let lastHalf = 0;
  let lastFeed = '';
  let seen = new Set<number>();
  const tween = new Map<string, number>();

  const dirAt = (side: 0 | 1, t: number) => (t <= ctx.halftimeAt ? 1 : -1) * (side === 0 ? 1 : -1);

  const drawMomentum = (t: number, idx: number) => {
    const evs = ctx.events();
    const lastT = evs.length ? evs[evs.length - 1].t : 0;
    // The axis grows with the match, so the strip is never mostly empty.
    const full = Math.max(95 * 60, lastT + 60, ctx.halftimeAt * 2 + 120);
    const span = Math.min(full, Math.max(15 * 60, t + 4 * 60));
    const bins = Math.ceil(span / 60);
    const raw = [new Float32Array(bins), new Float32Array(bins)];
    const goals: { m: number; s: 0 | 1 }[] = [];
    for (let i = 0; i <= idx && i < evs.length; i++) {
      const e = evs[i];
      const progress = (e.x * dirAt(e.s, e.t)) / 52.5;
      raw[e.s][Math.min(bins - 1, Math.floor(e.t / 60))] += threat(e, progress);
      if (e.k === 'goal') goals.push({ m: e.t / 60, s: e.s });
    }
    const nowBin = Math.min(bins - 1, Math.floor(t / 60));
    // Smoothed difference: home above the line, away below.
    const vals: number[] = [];
    let a = 0;
    let b = 0;
    for (let m = 0; m <= nowBin; m++) {
      a = a * 0.55 + raw[0][m];
      b = b * 0.55 + raw[1][m];
      vals.push(Math.max(-1, Math.min(1, (a - b) / 9)));
    }
    // Scale to the biggest swing so far, so a quiet spell still has shape.
    const peak = Math.max(0.4, ...vals.map(Math.abs));
    for (let m = 0; m < vals.length; m++) vals[m] = (vals[m] / peak) * 0.92;
    // Draw in real pixels so goal markers stay round.
    const W = Math.max(120, Math.round(momSvg.clientWidth || 960));
    const H = Math.max(40, Math.round(momSvg.clientHeight || 200));
    const mid = H / 2;
    const amp = mid - 3;
    momSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const x = (m: number) => (m / bins) * W;
    const bw = Math.min(14, (W / bins) * 0.62);
    const bars = vals
      .map((v, m) => {
        const h = Math.abs(v) * amp;
        const y = v >= 0 ? mid - h : mid;
        return `<rect x="${(x(m + 0.5) - bw / 2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1.5, h).toFixed(1)}" rx="2" fill="${v >= 0 ? colors[0] : colors[1]}" opacity="${(0.28 + Math.abs(v) * 0.5).toFixed(2)}"/>`;
      })
      .join('');
    // Smooth area along the bars.
    let path = `M${x(0.5).toFixed(1)},${mid}`;
    vals.forEach((v, m) => (path += ` L${x(m + 0.5).toFixed(1)},${(mid - v * amp).toFixed(1)}`));
    path += ` L${x(vals.length - 0.5).toFixed(1)},${mid} Z`;
    const ht = x(ctx.halftimeAt / 60);
    const cur = x(Math.min(bins, t / 60));
    const goalMarks = goals
      .map((g) => `<g transform="translate(${x(g.m).toFixed(1)},${g.s === 0 ? 8 : H - 8})"><circle r="6" fill="#0b0d10" stroke="${colors[g.s]}" stroke-width="2"/><circle r="2.4" fill="#fff"/></g>`)
      .join('');
    momSvg.innerHTML = `
      <defs>
        <linearGradient id="ffbArea" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}">
          <stop offset="0" stop-color="${colors[0]}" stop-opacity="0.75"/><stop offset="0.5" stop-color="${colors[0]}" stop-opacity="0.05"/>
          <stop offset="0.5" stop-color="${colors[1]}" stop-opacity="0.05"/><stop offset="1" stop-color="${colors[1]}" stop-opacity="0.75"/>
        </linearGradient>
        <linearGradient id="ffbCur" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--lime)" stop-opacity="0"/><stop offset="0.5" style="stop-color:var(--lime)"/><stop offset="1" style="stop-color:var(--lime)" stop-opacity="0"/></linearGradient>
      </defs>
      ${[15, 30, 60, 75].filter((mm) => mm * 60 < span).map((mm) => `<line x1="${x(mm)}" y1="4" x2="${x(mm)}" y2="${H - 4}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`).join('')}
      ${ctx.halftimeAt < span ? `<line x1="${ht}" y1="2" x2="${ht}" y2="${H - 2}" stroke="rgba(255,255,255,0.22)" stroke-width="1" stroke-dasharray="3 4"/>` : ''}
      <line x1="0" y1="${mid}" x2="${W}" y2="${mid}" stroke="rgba(255,255,255,0.16)" stroke-width="1"/>
      ${bars}
      <path d="${path}" fill="url(#ffbArea)" stroke="none"/>
      ${goalMarks}
      <rect x="${(cur - 1).toFixed(1)}" y="0" width="2" height="${H}" fill="url(#ffbCur)" class="ffb-cur"/>`;
  };

  const drawPitch = (t: number, idx: number) => {
    const evs = ctx.events();
    const from = Math.max(0, t - 8 * 60);
    const cells = new Map<string, [number, number]>();
    const tilt = [0, 0];
    const pts: string[] = [];
    let dotsHtml = '';
    for (let i = Math.max(0, idx - 400); i <= idx && i < evs.length; i++) {
      const e = evs[i];
      if (e.t < from) continue;
      const cx = Math.round((e.x + 52.5) / 7);
      const cy = Math.round((e.y + 34) / 7);
      const key = `${cx},${cy}`;
      const c = cells.get(key) ?? [0, 0];
      c[e.s] += 1;
      cells.set(key, c);
      const progress = (e.x * dirAt(e.s, e.t)) / 52.5;
      if (progress > 0.33) tilt[e.s]++;
    }
    let heatHtml = '';
    for (const [key, [h, a]] of cells) {
      const [cx, cy] = key.split(',').map(Number);
      const n = h + a;
      if (n < 1) continue;
      const r = Math.min(13, 5 + n * 0.9);
      const op = Math.min(0.75, 0.12 + n * 0.05);
      const side = h >= a ? 0 : 1;
      heatHtml += `<circle cx="${cx * 7}" cy="${cy * 7}" r="${r.toFixed(1)}" fill="url(#ffbH${side})" opacity="${op.toFixed(2)}"/>`;
    }
    heat.innerHTML = heatHtml;
    // The ball's recent path: the last dozen touches.
    const recent = evs.slice(Math.max(0, idx - 12), idx + 1).filter((e) => e.t >= t - 90);
    for (const e of recent) pts.push(`${(e.x + 52.5).toFixed(1)},${(e.y + 34).toFixed(1)}`);
    trail.setAttribute('points', pts.join(' '));
    recent.forEach((e, i) => {
      const o = (0.25 + (i / Math.max(1, recent.length - 1)) * 0.6).toFixed(2);
      dotsHtml += `<circle cx="${(e.x + 52.5).toFixed(1)}" cy="${(e.y + 34).toFixed(1)}" r="${e.k === 'shot' || e.k === 'goal' ? 1.6 : 0.8}" fill="${colors[e.s]}" opacity="${o}"/>`;
    });
    dots.innerHTML = dotsHtml;
    if (!pitchSvg.querySelector('#ffbTrail')) {
      pitchSvg.querySelector('defs')!.insertAdjacentHTML('beforeend', '<linearGradient id="ffbTrail" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.08"/><stop offset="1" stop-color="#fff" stop-opacity="0.7"/></linearGradient>');
    }
    // Who attacks which way this half.
    const half = t <= ctx.halftimeAt ? 1 : 2;
    if (half !== lastHalf) {
      lastHalf = half;
      const homeRight = half === 1;
      const arrow = (x: number, side: 0 | 1, right: boolean) =>
        `<g transform="translate(${x},${side === 0 ? -1.2 : 69.2})" fill="${colors[side]}" font-size="3.2" font-weight="800" text-anchor="middle" dominant-baseline="middle" font-family="Barlow Condensed, Inter, sans-serif">
          <text>${right ? '' : '◀ '}${ctx.teams[side].short}${right ? ' ▶' : ''}</text></g>`;
      dirEl.innerHTML = arrow(homeRight ? 20 : 85, 0, homeRight) + arrow(homeRight ? 85 : 20, 1, !homeRight);
    }
    const tot = tilt[0] + tilt[1] || 1;
    const hp = Math.round((tilt[0] / tot) * 100);
    $('ffb-tilt-h').textContent = `${hp}%`;
    $('ffb-tilt-a').textContent = `${100 - hp}%`;
    const tb = $('ffb-tilt-b');
    tb.style.width = `${hp}%`;
    tb.style.background = colors[0];
    (tb.parentElement as HTMLElement).style.background = colors[1];
  };

  const stats = (idx: number) => {
    const evs = ctx.events();
    const s = [0, 1].map(() => ({ shots: 0, on: 0, xg: 0, passes: 0, corners: 0 }));
    for (let i = 0; i <= idx && i < evs.length; i++) {
      const e = evs[i];
      const x = s[e.s];
      if (e.k === 'shot') { x.shots++; x.xg += e.xg ?? 0; if (e.o === 'goal' || e.o === 'saved' || e.o === 'parried') x.on++; }
      if (e.k === 'pass') x.passes++;
      if (e.k === 'corner') x.corners++;
    }
    return s;
  };

  const drawTiles = (idx: number) => {
    const s = stats(idx);
    const pt = s[0].passes + s[1].passes || 1;
    const poss = Math.round((s[0].passes / pt) * 100);
    const tile = (key: string, label: string, a: number, b: number, fmt: (v: number) => string = (v) => String(Math.round(v)), sub?: [string, string]) => {
      const tot = a + b || 1;
      return html`<div class="ffb-tile">
        <div class="ffb-nums"><b style="color:${colors[0]}" data-tw="${key}0" data-v="${a}" data-f="${fmt === fx ? 'x' : 'i'}">${fmt(tween.get(key + '0') ?? a)}</b><span>${label}</span><b style="color:${colors[1]}" data-tw="${key}1" data-v="${b}" data-f="${fmt === fx ? 'x' : 'i'}">${fmt(tween.get(key + '1') ?? b)}</b></div>
        <i class="ffb-split"><b style="width:${(a / tot) * 100}%;background:${colors[0]}"></b><b style="width:${(b / tot) * 100}%;background:${colors[1]}"></b></i>
        ${sub ? html`<div class="ffb-sub"><span>${sub[0]}</span><span>${sub[1]}</span></div>` : ''}
      </div>`;
    };
    $('ffb-tiles').innerHTML = html`
      ${tile('poss', 'Possession', poss, 100 - poss, (v) => `${Math.round(v)}%`)}
      ${tile('shots', 'Shots', s[0].shots, s[1].shots, undefined, [`${s[0].on} on target`, `${s[1].on} on target`])}
      ${tile('xg', 'xG', s[0].xg, s[1].xg, fx)}
      ${tile('pass', 'Passes', s[0].passes, s[1].passes)}
      ${tile('corn', 'Corners', s[0].corners, s[1].corners)}`.html;
  };
  const fx = (v: number) => v.toFixed(2);

  const drawFeed = (idx: number) => {
    const evs = ctx.events();
    const ls = ctx.lines();
    const items: string[] = [];
    const shownNow = new Set<number>();
    for (let k = idx; k >= 0 && items.length < 4; k--) {
      const l = ls[k];
      if (!l || !(l.big || ['save', 'chance', 'card', 'post'].includes(l.kind))) continue;
      shownNow.add(k);
      items.push(html`<div class="ffb-ev${seen.has(k) ? '' : ' new'}"><span class="m">${minuteLabel(evs[k].t, ctx.halftimeAt)}</span><span>${evIcon(l.icon, 16)}</span><span class="tx">${l.text}</span></div>`.html);
    }
    const next = items.length ? items.join('') : html`<div class="ffb-ev dim"><span class="tx">Quiet spell. Both sides probing.</span></div>`.html;
    // Only touch the DOM when a line arrives, and only new lines fade in.
    if (next !== lastFeed) $('ffb-feed').innerHTML = lastFeed = next;
    seen = shownNow;
  };

  return {
    get visible() {
      return shown;
    },
    show(on: boolean) {
      if (on === shown) return;
      shown = on;
      el.classList.toggle('on', on);
      stage.classList.toggle('ff-on', on);
      if (on) lastIdx = -2;
    },
    update(st: BoardState) {
      if (!shown) return;
      const now = performance.now();
      const ht = st.breakLeft !== null;
      $('ffb-title').textContent = ht ? 'Half-time' : 'Fast-forward';
      el.classList.toggle('ht', ht);
      if (ht) {
        $('ffb-range').textContent = `Second half in ${Math.max(0, Math.ceil(st.breakLeft!))}s`;
        $('ffb-rate').textContent = '';
        $('ffb-prog').style.width = '0%';
      } else {
        $('ffb-range').textContent = `${minuteLabel(st.from, ctx.halftimeAt)} → ${minuteLabel(st.to, ctx.halftimeAt)}`;
        $('ffb-rate').textContent = `×${Math.round(st.rate)}`;
        $('ffb-prog').style.width = `${Math.max(0, Math.min(1, (st.t - st.from) / Math.max(1, st.to - st.from))) * 100}%`;
      }
      // The ball glides between touches every frame.
      const evs = ctx.events();
      const a = evs[st.idx];
      const b = evs[st.idx + 1];
      if (a) {
        const k = b && b.t > a.t ? Math.max(0, Math.min(1, (st.t - a.t) / (b.t - a.t))) : 0;
        const bx = a.x + ((b?.x ?? a.x) - a.x) * k;
        const by = a.y + ((b?.y ?? a.y) - a.y) * k;
        ballEl.setAttribute('cx', (bx + 52.5).toFixed(2));
        ballEl.setAttribute('cy', (by + 34).toFixed(2));
      }
      // Numbers count toward their targets.
      el.querySelectorAll<HTMLElement>('[data-tw]').forEach((n) => {
        const key = n.dataset.tw!;
        const target = Number(n.dataset.v);
        const cur = tween.get(key) ?? target;
        const next = Math.abs(target - cur) < 0.005 ? target : cur + (target - cur) * 0.18;
        tween.set(key, next);
        n.textContent = n.dataset.f === 'x' ? next.toFixed(2) : key.startsWith('poss') ? `${Math.round(next)}%` : String(Math.round(next));
      });
      if (now - lastDraw < 220 && st.idx === lastIdx) return;
      if (now - lastDraw < 120) return;
      lastDraw = now;
      lastIdx = st.idx;
      drawMomentum(st.t, st.idx);
      drawPitch(st.t, st.idx);
      drawTiles(st.idx);
      drawFeed(st.idx);
    },
    dispose() {
      el.remove();
      stage.classList.remove('ff-on');
    },
  };
}

export type Board = ReturnType<typeof createBoard>;
