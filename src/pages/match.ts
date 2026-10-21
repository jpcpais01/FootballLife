import type { Equipped } from '../../shared/cosmetics.ts';
import { commentary, type CommentaryLine } from '../../shared/commentary.ts';
import { minuteLabel } from '../../shared/config.ts';
import type { MatchEvent, PlayerLine, TeamStats } from '../../shared/sim/types.ts';
import { clockAt, rateAt, realAt, totalReal, type Segment } from '../../shared/timeline.ts';
import { api } from '../api.ts';
import { avatarSvg } from '../art.ts';
import { badge, posChip, type MatchBrief } from '../components.ts';
import { html, mount, raw, type Raw } from '../dom.ts';
import { icon } from '../icons.ts';
import { countdown, errorBox, kickoffLabel, skeleton } from '../ui.ts';
import type { CameraMode, MatchViewer, Quality } from '../viewer/viewer.ts';

interface Snap {
  clubId: string;
  name: string;
  short: string;
  colors: { primary: string; secondary: string };
  badge: { shape: number; icon: number };
  formation: string;
  tactics: any;
  players: { id: string; name: string; number: number; pos: string; role: string; ovr: number; bot: boolean; app: Record<string, number>; eq?: Equipped }[];
}

const LIVE_DELAY = 3.5; // seconds behind the server clock so the next event is known

export async function matchPage(el: HTMLElement, [id]: string[]) {
  mount(el, html`${skeleton(420, 1)}`);
  let alive = true;
  let raf = 0;
  let poll = 0;
  let viewer: MatchViewer | null = null;
  let data: any;
  try {
    data = await api.get(`/api/matches/${id}`);
  } catch (e) {
    mount(el, errorBox((e as Error).message));
    return;
  }
  const cleanup = () => {
    alive = false;
    cancelAnimationFrame(raf);
    clearInterval(poll);
    viewer?.dispose();
  };

  // ---------- pre-match ----------
  if (!data.ready) {
    const m: MatchBrief = data.match;
    const renderPre = () => mount(el, html`<div class="card hero-card" style="padding:34px 24px;text-align:center">
      <div class="eyebrow">${m.kind === 'friendly' ? 'Friendly' : m.cup ? `FootbalLife Cup · ${m.cup.name}` : `League · Round ${m.round}`}</div>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;margin:26px 0">
        <a href="/club/${m.home.id}" class="stack" style="align-items:center;gap:10px">${badge(m.home, 96)}<div class="h2">${m.home.name}</div></a>
        <div><div class="countdown" style="font-size:44px" id="cd">${countdown(m.kickoffAt)}</div><div class="small muted">${kickoffLabel(m.kickoffAt)}</div></div>
        <a href="/club/${m.away.id}" class="stack" style="align-items:center;gap:10px">${badge(m.away, 96)}<div class="h2">${m.away.name}</div></a>
      </div>
      <p class="muted small" style="max-width:520px;margin:0 auto">The match is simulated on the server at kick-off and plays out live for everyone. Line-ups lock at kick-off — coaches can still change tactics until then.</p>
    </div>`);
    renderPre();
    poll = window.setInterval(async () => {
      const cd = el.querySelector('#cd');
      if (cd) cd.textContent = countdown(m.kickoffAt);
      if (new Date(m.kickoffAt).getTime() - Date.now() < -1500) {
        const d = await api.get(`/api/matches/${id}`).catch(() => null);
        if (d?.ready && alive) {
          clearInterval(poll);
          cleanup();
          void matchPage(el, [id]);
        }
      }
    }, 1000);
    return cleanup;
  }

  // ---------- match ----------
  const m: MatchBrief = data.match;
  const lineups: [Snap, Snap] = data.lineups;
  const timeline: Segment[] = data.timeline;
  const halftimeAt: number = data.halftimeAt;
  let events: MatchEvent[] = data.events;
  let revealed: number = data.revealed;
  let finished: boolean = data.finished;
  let stats: [TeamStats, TeamStats] | undefined = data.stats;
  let players: PlayerLine[] | undefined = data.players;
  let motm: number | undefined = data.motm;
  let pens: { score: [number, number]; kicks: { s: 0 | 1; p: number; in: boolean }[] } | undefined = data.pens;
  const serverOffset = data.serverNow - Date.now();
  const kickoff: number = data.kickoffAt;
  const total = totalReal(timeline);
  const teams: [any, any] = [
    { short: lineups[0].short, name: lineups[0].name, players: lineups[0].players },
    { short: lineups[1].short, name: lineups[1].name, players: lineups[1].players },
  ];
  const lines: (CommentaryLine | null)[] = [];
  const computeLines = () => {
    for (let i = lines.length; i < events.length; i++) lines.push(commentary(events[i], i, teams, halftimeAt));
  };
  computeLines();

  // Replay state (finished matches).
  let replayReal = finished ? 0 : 0;
  let playing = true;
  let speed = 1;
  let tab: 'feed' | 'stats' | 'lineups' = 'feed';
  const kickoffHour = new Date(kickoff).getHours();
  const night = kickoffHour >= 17 || kickoffHour < 7;
  const prefQ = (localStorage.getItem('fl-quality') as Quality | null) ?? undefined;
  let mode: CameraMode = 'broadcast';

  const kitBar = (c: { primary: string }) => html`<span class="kit" style="background:${c.primary}"></span>`;
  mount(el, html`
    <div class="row between" style="margin-bottom:14px;flex-wrap:wrap;gap:10px">
      <div class="row" style="gap:10px"><button class="btn sm ghost" onclick="history.back()" aria-label="Back">${icon('back', 16)}</button>
        <div><div class="eyebrow">${m.kind === 'friendly' ? 'Friendly' : m.cup ? `FootbalLife Cup · ${m.cup.name}` : `League · Round ${m.round}`}</div><div class="h3">${m.home.name} vs ${m.away.name}</div></div></div>
      <span class="chip" id="status"></span>
    </div>
    <div class="match-wrap">
      <div>
        <div class="stage" id="stage">
          <div class="scorebug">
            <div>${kitBar(lineups[0].colors)}<span>${lineups[0].short}</span></div>
            <div class="sb-score" id="score">0–0</div>
            <div><span>${lineups[1].short}</span>${kitBar(lineups[1].colors)}</div>
            <div class="sb-clock" id="clock">0'</div>
          </div>
          <div id="pens"></div>
          <div class="stage-ticker" id="ticker"></div>
          <div class="stage-toolbar">
            <button data-cam="broadcast" title="Broadcast camera" class="on">${icon('camera')}</button>
            <button data-cam="tactical" title="Tactical view">${icon('top')}</button>
            <button data-cam="orbit" title="Free camera">${icon('sparkle')}</button>
            <button data-q title="Toggle HD effects" style="font-weight:800;font-size:11px">HD</button>
          </div>
          <div id="flash"></div>
          <div class="overlay-msg" id="loading"><div><div class="countdown">Loading stadium…</div></div></div>
        </div>
        <div id="controls"></div>
      </div>
      <div class="card" style="padding:14px">
        <div class="tabs" style="margin-bottom:10px">${(['feed', 'stats', 'lineups'] as const).map((t) => html`<button data-tab="${t}" class="${t === tab ? 'on' : ''}">${t === 'feed' ? 'Commentary' : t === 'stats' ? 'Stats' : 'Line-ups'}</button>`)}</div>
        <div id="panel"></div>
      </div>
    </div>`);

  const stage = el.querySelector('#stage') as HTMLElement;
  const { MatchViewer: MV } = await import('../viewer/viewer.ts');
  if (!alive) return;
  const toTeam = (s: Snap) => ({ name: s.name, short: s.short, colors: s.colors, formation: s.formation, tactics: s.tactics, players: s.players.map((p) => ({ name: p.name, number: p.number, app: p.app, eq: p.eq })) });
  try {
    viewer = new MV(stage, [toTeam(lineups[0]), toTeam(lineups[1])], halftimeAt, { night, quality: prefQ });
  } catch (e) {
    el.querySelector('#loading')!.innerHTML = html`<div class="muted">3D view unavailable on this device (${(e as Error).message}). Commentary and stats still update live.</div>`.html;
  }
  viewer?.setEvents(events);
  el.querySelector('#loading')?.remove();
  el.querySelector('[data-q]')?.classList.toggle('on', viewer?.quality === 'high');

  // ---------- clock ----------
  const liveReal = () => (Date.now() + serverOffset - kickoff) / 1000 - LIVE_DELAY;
  const currentClock = (): number => {
    if (finished && !isLiveCatchup()) return clockAt(replayReal, timeline);
    let t = clockAt(Math.max(0, liveReal()), timeline);
    // Never run past what the server has revealed.
    const lastT = events.length ? events[events.length - 1].t : 0;
    if (!finished && t > lastT) t = lastT;
    return t;
  };
  // If the user opens a match that just finished, they still watch "live" until caught up.
  let catchup = !finished;
  const isLiveCatchup = () => catchup;

  // ---------- rendering helpers ----------
  let lastIndex = -1;
  let lastGoals = 0;
  const scoreAt = (t: number): [number, number] => {
    let sc: [number, number] = [0, 0];
    for (const e of events) {
      if (e.t > t) break;
      if (e.k === 'goal' && e.sc) sc = e.sc;
    }
    return sc;
  };

  const indexAt = (t: number) => {
    let i = -1;
    for (let k = 0; k < events.length && events[k].t <= t; k++) i = k;
    return i;
  };

  const liveStats = (upto: number): [any, any] => {
    const s = [0, 1].map(() => ({ shots: 0, onTarget: 0, corners: 0, fouls: 0, yellow: 0, red: 0, passes: 0, offsides: 0, xg: 0 }));
    for (let i = 0; i <= upto && i < events.length; i++) {
      const e = events[i];
      const t = s[e.s];
      if (e.k === 'shot') { t.shots++; t.xg += e.xg ?? 0; if (e.o === 'goal' || e.o === 'saved' || e.o === 'parried') t.onTarget++; }
      if (e.k === 'corner') t.corners++;
      if (e.k === 'foul') t.fouls++;
      if (e.k === 'card') { if (e.o === 'yellow') t.yellow++; else { t.red++; if (e.o === 'second') t.yellow++; } }
      if (e.k === 'pass') t.passes++;
      if (e.k === 'offside') t.offsides++;
    }
    return s as [any, any];
  };

  // Penalty shootout result, shown once a drawn cup tie reaches full time.
  const shootoutStrip = (): Raw => {
    const p = pens!;
    const row = (side: 0 | 1) => html`<div class="so-row"><b>${lineups[side].short}</b>${p.kicks.filter((k) => k.s === side).map((k) => html`<i class="${k.in ? 'in' : 'miss'}" title="${lineups[side].players[k.p]?.name ?? ''}"></i>`)}<b class="num">${p.score[side]}</b></div>`;
    const w = p.score[0] > p.score[1] ? 0 : 1;
    return html`<div class="shootout fade-in"><div class="tiny eyebrow">Penalties</div>${row(0)}${row(1)}<div class="tiny" style="margin-top:4px">${lineups[w].name} win ${Math.max(...p.score)}–${Math.min(...p.score)} on penalties</div></div>`;
  };

  const renderPanel = (t: number) => {
    const panel = el.querySelector('#panel')!;
    const i = indexAt(t);
    if (tab === 'feed') {
      const items: Raw[] = [];
      for (let k = i; k >= 0 && items.length < 80; k--) {
        const l = lines[k];
        if (!l) continue;
        items.push(html`<div class="ev ${l.big ? 'big' : ''}"><span class="m">${minuteLabel(events[k].t, halftimeAt)}</span><span class="ic">${l.icon}</span><span>${l.text}</span></div>`);
      }
      panel.innerHTML = html`<div class="feed">${items.length ? items : html`<div class="empty small">Kick-off is moments away…</div>`}</div>`.html;
    } else if (tab === 'stats') {
      const done = finished && !catchup && t >= events[events.length - 1].t;
      const st = done && stats ? stats.map((x) => ({ ...x })) : liveStats(i);
      const passTotal = st[0].passes + st[1].passes || 1;
      const poss = done && stats ? [stats[0].possession, stats[1].possession] : [Math.round((st[0].passes / passTotal) * 100), 100 - Math.round((st[0].passes / passTotal) * 100)];
      const row = (label: string, a: number, b: number, fmt = (x: number) => String(x)) => {
        const tot = a + b || 1;
        return html`<div><div class="stat-row"><span>${fmt(a)}</span><div><div class="lbl">${label}</div><div class="bars"><i><b style="width:${(a / tot) * 100}%;background:${lineups[0].colors.primary}"></b></i><i><b style="width:${(b / tot) * 100}%;background:${lineups[1].colors.primary}"></b></i></div></div><span class="r">${fmt(b)}</span></div></div>`;
      };
      panel.innerHTML = html`<div class="row between" style="margin-bottom:8px">${badge(m.home, 30)}<span class="label">Match stats</span>${badge(m.away, 30)}</div>
        ${row('Possession %', poss[0], poss[1])}
        ${row('Shots', st[0].shots, st[1].shots)}
        ${row('On target', st[0].onTarget, st[1].onTarget)}
        ${row('Expected goals', +st[0].xg.toFixed(2), +st[1].xg.toFixed(2), (x) => x.toFixed(2))}
        ${row('Passes', st[0].passes, st[1].passes)}
        ${row('Corners', st[0].corners, st[1].corners)}
        ${row('Fouls', st[0].fouls, st[1].fouls)}
        ${row('Yellow cards', st[0].yellow, st[1].yellow)}
        ${row('Red cards', st[0].red, st[1].red)}
        ${row('Offsides', st[0].offsides, st[1].offsides)}`.html;
    } else {
      const done = finished && !catchup && players;
      const col = (s: Snap, side: number) => html`<div class="stack" style="gap:2px">
        <div class="row" style="gap:8px;margin-bottom:6px">${badge({ ...s, id: s.clubId }, 24)}<span class="h3 ellipsis">${s.short}</span><span class="chip tiny">${s.formation}</span></div>
        ${s.players.map((p, k) => {
          const line = done ? players![side * 11 + k] : null;
          return html`<a href="/player/${p.id}" class="row" style="gap:7px;padding:6px 2px;border-top:1px solid var(--line)">
            <span class="dim tiny" style="width:18px;text-align:right;font-weight:800">${p.number}</span>
            ${avatarSvg(p.app as any, s.colors, 24, undefined, { eq: p.eq })}
            <span class="grow small ellipsis" style="font-weight:600">${p.name.split(' ').slice(-1)[0]}${p.bot ? '' : html` <span class="lime">●</span>`}</span>
            ${line?.goals ? html`<span class="tiny lime">${'⚽'.repeat(Math.min(3, line.goals))}</span>` : ''}
            ${line ? html`<span class="tiny" style="font-weight:800;color:${line.rating >= 7.5 ? 'var(--lime)' : 'var(--muted)'}">${line.rating.toFixed(1)}${motm === side * 11 + k ? '★' : ''}</span>` : html`<span class="tiny dim">${p.role}</span>`}
          </a>`;
        })}</div>`;
      panel.innerHTML = html`<div class="grid cols-2" style="gap:14px">${col(lineups[0], 0)}${col(lineups[1], 1)}</div>
        ${done && motm !== undefined ? html`<div class="chip lime" style="margin-top:12px">★ Player of the match: ${lineups[motm < 11 ? 0 : 1].players[motm % 11].name}</div>` : ''}`.html;
    }
  };

  const renderControls = () => {
    const c = el.querySelector('#controls')!;
    if (!finished || catchup) {
      c.innerHTML = html`<div class="row between small muted" style="margin-top:10px"><span class="row" style="gap:6px"><span class="chip live">LIVE</span> Everyone watching sees the same moment.</span><span id="ff"></span></div>`.html;
      return;
    }
    const marks = events.map((e) => {
      if (e.k === 'goal') return html`<i class="mk goal" style="left:${(realAt(e.t, timeline) / total) * 100}%" title="${minuteLabel(e.t, halftimeAt)} goal"></i>`;
      if (e.k === 'card') return html`<i class="mk ${e.o === 'yellow' ? 'card' : 'red'}" style="left:${(realAt(e.t, timeline) / total) * 100}%"></i>`;
      return '';
    });
    c.innerHTML = html`<div class="row" style="margin-top:10px;gap:8px">
      <button class="btn sm" id="pp">${icon(playing ? 'pause' : 'play', 16)}</button>
      <div class="seg">${[1, 2, 4, 8].map((s) => html`<button data-speed="${s}" class="${speed === s ? 'on' : ''}">${s}×</button>`)}</div>
      <button class="btn sm ghost" id="nextgoal" title="Jump to next goal">${icon('fast', 16)} Next goal</button>
      <span class="grow"></span><span class="tiny muted" id="ff"></span>
    </div>
    <div class="timeline" id="tl"><div class="track"></div><div class="fill" id="fill"></div>${marks}<div class="knob" id="knob"></div></div>`.html;
  };

  const setStatus = () => {
    const st = el.querySelector('#status')!;
    if (!finished || catchup) st.outerHTML = html`<span class="chip live" id="status">LIVE</span>`.html;
    else st.outerHTML = html`<span class="chip" id="status">Full-time · Replay</span>`.html;
  };

  renderControls();
  setStatus();
  renderPanel(0);

  // ---------- frame loop ----------
  let lastPanel = 0;
  let panelDirty = true;
  let lastFrame = performance.now();
  const frame = () => {
    if (!alive) return;
    const now = performance.now();
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (finished && !catchup && playing) {
      replayReal = Math.min(total, replayReal + dt * speed);
      if (replayReal >= total) playing = false;
    }
    if (catchup && finished && liveReal() >= total) {
      catchup = false;
      replayReal = total;
      playing = false;
      renderControls();
      setStatus();
    }
    const t = currentClock();
    const rate = rateAt(t, timeline);
    viewer?.render(t, rate * (finished && !catchup ? speed : 1));

    // HUD.
    const sc = scoreAt(t);
    const scoreEl = el.querySelector('#score')!;
    const txt = `${sc[0]}–${sc[1]}`;
    if (scoreEl.textContent !== txt) scoreEl.textContent = txt;
    const lastEv = events[events.length - 1];
    const ended = finished && lastEv && t >= lastEv.t;
    const ht = Math.abs(t - halftimeAt) < 0.5 && events.some((e) => e.k === 'halftime' && e.t <= t);
    el.querySelector('#clock')!.textContent = ended ? (pens ? 'PENS' : 'FT') : ht ? 'HT' : minuteLabel(t, halftimeAt);
    const pensEl = el.querySelector('#pens')!;
    const showPens = !!(ended && pens);
    if (pensEl.childElementCount !== (showPens ? 1 : 0)) pensEl.innerHTML = showPens ? shootoutStrip().html : '';
    const ff = el.querySelector('#ff');
    if (ff) ff.textContent = rate > 6 ? '» Fast-forwarding build-up play' : '';
    // Goal flash + ticker on new events.
    const idx = indexAt(t);
    if (idx !== lastIndex) {
      const from = lastIndex;
      lastIndex = idx;
      const goals = events.slice(0, idx + 1).filter((e) => e.k === 'goal').length;
      if (goals > lastGoals && idx - from < 30) {
        const g = events.slice(0, idx + 1).filter((e) => e.k === 'goal').pop()!;
        viewer?.goal(g.s);
        const scorer = lineups[g.s].players[(g.p ?? 0) % 11];
        el.querySelector('#flash')!.innerHTML = html`<div class="goal-flash"><div class="txt">GOAL!</div><div class="sub">${scorer?.name ?? ''} · ${lineups[g.s].short}</div></div>`.html;
        setTimeout(() => { const f = el.querySelector('#flash'); if (f) f.innerHTML = ''; }, 2700);
      }
      lastGoals = goals;
      if (idx > from && idx - from < 30) {
        const ticker = el.querySelector('#ticker')!;
        for (let k = from + 1; k <= idx; k++) {
          const l = lines[k];
          if (!l || (!l.big && l.kind !== 'save' && l.kind !== 'chance' && l.kind !== 'card' && l.kind !== 'post')) continue;
          const d = document.createElement('div');
          d.className = 'line';
          d.innerHTML = raw(`${l.icon} `).html + html`${l.text}`.html;
          ticker.appendChild(d);
          while (ticker.children.length > 2) ticker.firstElementChild!.remove();
          setTimeout(() => d.remove(), 6000);
        }
      }
      panelDirty = true;
    }
    if ((panelDirty && now - lastPanel > 400) || (tab !== 'feed' && now - lastPanel > 1500)) {
      lastPanel = now;
      panelDirty = false;
      renderPanel(t);
    }
    // Scrubber.
    if (finished && !catchup) {
      const p = (replayReal / total) * 100;
      const fill = el.querySelector('#fill') as HTMLElement | null;
      const knob = el.querySelector('#knob') as HTMLElement | null;
      if (fill) fill.style.width = `${p}%`;
      if (knob) knob.style.left = `${p}%`;
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  // ---------- live polling ----------
  if (!finished) {
    poll = window.setInterval(async () => {
      try {
        const d = await api.get(`/api/matches/${id}?since=${revealed}`);
        if (!alive) return;
        if (d.events?.length) {
          events = events.concat(d.events);
          viewer?.setEvents(events);
          computeLines();
        }
        revealed = d.revealed;
        if (d.finished) {
          finished = true;
          stats = d.stats;
          players = d.players;
          motm = d.motm;
          pens = d.pens;
          clearInterval(poll);
        }
      } catch {
        /* keep trying */
      }
    }, 2500);
  }

  // ---------- interactions ----------
  el.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const cam = t.closest('[data-cam]') as HTMLElement | null;
    if (cam && viewer) {
      mode = cam.dataset.cam as CameraMode;
      viewer.setMode(mode);
      el.querySelectorAll('[data-cam]').forEach((b) => b.classList.toggle('on', b === cam));
    }
    if (t.closest('[data-q]') && viewer) {
      const q: Quality = viewer.quality === 'high' ? 'low' : 'high';
      viewer.setQuality(q);
      try { localStorage.setItem('fl-quality', q); } catch { /* ignore */ }
      el.querySelector('[data-q]')!.classList.toggle('on', q === 'high');
    }
    const tb = t.closest('[data-tab]') as HTMLElement | null;
    if (tb) {
      tab = tb.dataset.tab as typeof tab;
      el.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b === tb));
      renderPanel(currentClock());
    }
    if (t.closest('#pp')) {
      if (replayReal >= total) replayReal = 0;
      playing = !playing;
      renderControls();
    }
    const sp = t.closest('[data-speed]') as HTMLElement | null;
    if (sp) { speed = Number(sp.dataset.speed); renderControls(); }
    if (t.closest('#nextgoal')) {
      const now = clockAt(replayReal, timeline);
      const g = events.find((ev) => ev.k === 'goal' && ev.t > now + 1);
      if (g) { replayReal = Math.max(0, realAt(g.t, timeline) - 9); playing = true; lastIndex = -1; lastGoals = events.filter((ev) => ev.k === 'goal' && ev.t < g.t).length; renderControls(); }
    }
    const tl = t.closest('#tl') as HTMLElement | null;
    if (tl) {
      const r = tl.getBoundingClientRect();
      replayReal = Math.max(0, Math.min(1, ((e as MouseEvent).clientX - r.left) / r.width)) * total;
      const nt = clockAt(replayReal, timeline);
      lastIndex = indexAt(nt);
      lastGoals = events.filter((ev) => ev.k === 'goal' && ev.t <= nt).length;
      renderPanel(nt);
    }
  });

  return cleanup;
}

export { posChip };
