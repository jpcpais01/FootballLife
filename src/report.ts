// The full-time report: your own match, told in one card. Rating first, then
// what you did, then what it earned and how it sits against your season.
import { ATTR_LABELS, type Attr } from '../shared/attributes.ts';
import type { PlayerLine } from '../shared/sim/types.ts';
import { html, type Raw } from './dom.ts';
import { icon } from './icons.ts';

export interface MyReport { coins: number | null; fame: number | null; ups: { attr: string; to: number }[]; avg: number | null; best: number | null; games: number }

export interface ReportInput {
  line: PlayerLine;
  motm: boolean;
  score: [number, number];
  side: 0 | 1;
  pens?: [number, number];
  opp: string;
  friendly: boolean;
  portrait: Raw;
  name: string;
  mine?: MyReport;
}

const tone = (r: number) => (r >= 8 ? 'top' : r >= 7 ? 'good' : r >= 6 ? 'ok' : 'low');

/** One sentence that reads the match the way a coach would. */
function verdict(r: ReportInput): string {
  const { line: l, mine } = r;
  if (r.motm) return 'Player of the match. Everyone saw it.';
  if (mine?.best != null && l.rating > mine.best && mine.games >= 2) return 'Your best performance this season.';
  if (l.goals >= 2) return `${l.goals === 2 ? 'A brace' : 'A hat-trick'}. Defenders will remember your name.`;
  if (mine?.avg != null && l.rating >= mine.avg + 0.6) return 'Well above your usual level.';
  if (l.rating >= 7.5) return 'A big shift. The gaffer noticed.';
  if (mine?.avg != null && l.rating <= mine.avg - 0.8) return 'An off day. Training tomorrow fixes that.';
  if (l.rating < 6) return 'Tough one. Shake it off and go again.';
  return 'Solid work. Keep stacking these.';
}

function stats(l: PlayerLine): Raw {
  const s: [string, number | string][] = [];
  if (l.goals) s.push(['Goals', l.goals]);
  if (l.assists) s.push(['Assists', l.assists]);
  if (l.shots) s.push(['Shots', `${l.onTarget}/${l.shots}`]);
  if (l.passes) s.push(['Passes', `${Math.round((l.passesDone / l.passes) * 100)}%`]);
  if (l.keyPasses) s.push(['Chances made', l.keyPasses]);
  if (l.tackles + l.interceptions) s.push(['Won back', l.tackles + l.interceptions]);
  if (l.saves) s.push(['Saves', l.saves]);
  return html`<div class="rp-stats">${s.slice(0, 6).map(([k, v]) => html`<div><b class="num">${v}</b><span>${k}</span></div>`)}</div>`;
}

export function showReport(r: ReportInput) {
  const gf = r.score[r.side];
  const ga = r.score[1 - r.side];
  const won = gf > ga || (gf === ga && !!r.pens && r.pens[r.side] > r.pens[1 - r.side]);
  const lost = gf < ga || (gf === ga && !!r.pens && r.pens[r.side] < r.pens[1 - r.side]);
  const res = won ? 'Win' : lost ? 'Defeat' : 'Draw';
  const m = r.mine;
  const diff = m?.avg != null ? r.line.rating - m.avg : null;
  const back = document.createElement('div');
  back.className = 'rp-back';
  back.innerHTML = html`<div class="rp" role="dialog" aria-modal="true" aria-label="Your match" data-tone="${tone(r.line.rating)}">
    <button class="dly-x" data-rclose aria-label="Close">${icon('x', 18)}</button>
    <section class="rp-hero">
      <div class="rp-ring"><span class="rp-av">${r.portrait}</span>${r.motm ? html`<i class="rp-star">${icon('star', 16)}</i>` : ''}</div>
      <div class="rp-rate num" data-to="${r.line.rating.toFixed(1)}">0.0</div>
      <div class="rp-name">${r.name}</div>
      ${diff != null ? html`<div class="rp-form ${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '+' : ''}${diff.toFixed(1)} vs season avg</div>` : ''}
    </section>
    <section class="rp-body">
      <div class="eyebrow">Full time · <span class="rp-res ${won ? 'w' : lost ? 'l' : 'd'}">${res}</span> ${gf}–${ga}${r.pens ? ` (${r.pens[r.side]}–${r.pens[1 - r.side]} pens)` : ''} vs ${r.opp}</div>
      <div class="rp-verdict">${verdict(r)}</div>
      ${stats(r.line)}
      <div class="rp-earn">
        ${m?.coins ? html`<span class="rp-chip coin">${icon('coin', 14)} +<b class="num" data-to="${m.coins}">0</b></span>` : ''}
        ${m?.fame ? html`<span class="rp-chip fame">${icon('star', 14)} +<b class="num" data-to="${m.fame}">0</b> fame</span>` : ''}
        ${(m?.ups ?? []).slice(0, 3).map((u) => html`<span class="rp-chip up">${icon('arrow', 14)} ${ATTR_LABELS[u.attr as Attr] ?? u.attr} ${u.to}</span>`)}
        ${r.friendly ? html`<span class="rp-chip">Friendly, no coins</span>` : ''}
      </div>
      <div class="rp-actions">
        <button class="btn ghost" data-rclose>${icon('play', 16)} Watch it back</button>
        <a class="btn primary" href="/" data-rclose>${icon('home', 16)} Home</a>
      </div>
    </section>
  </div>`.html;
  document.body.appendChild(back);
  const close = () => { back.classList.add('out'); setTimeout(() => back.remove(), 300); };
  back.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el === back || el.closest('[data-rclose]')) close();
  });
  // Numbers count up, the rating last and slowest: it's the headline.
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  back.querySelectorAll<HTMLElement>('[data-to]').forEach((n, i) => {
    const to = Number(n.dataset.to);
    const dp = n.dataset.to!.includes('.') ? 1 : 0;
    if (still) { n.textContent = to.toFixed(dp); return; }
    const dur = dp ? 1100 : 700;
    const t0 = performance.now() + 250 + i * 120;
    const step = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - t0) / dur));
      n.textContent = (to * (1 - (1 - k) ** 3)).toFixed(dp);
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}
