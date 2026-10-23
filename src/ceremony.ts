// Awards night: the first time you open the game after a season ends, the
// season is closed out on stage. Final placing, the champions, each award in
// turn, then your own season. Tap to move on; it is shown once per season.
import { TROPHY_KINDS } from '../shared/achievements.ts';
import { api } from './api.ts';
import { badge } from './components.ts';
import { html, type Raw } from './dom.ts';
import { trophyArt } from './gearArt.ts';
import { icon } from './icons.ts';
import { state } from './state.ts';

interface ClubLite { id: string; name: string; short: string; colors: { primary: string; secondary: string }; badge: any }
interface Ceremony {
  season: number;
  table: (ClubLite & { pos: number; clubId: string; points: number; won: number; drawn: number; lost: number })[];
  champion: { id: string; clubId: string; name: string; short: string; colors: ClubLite['colors']; badge: any; points: number; won: number; drawn: number; lost: number } | null;
  cup: ClubLite | null;
  awards: { kind: string; playerId: string; name: string; position: string; isBot: boolean; value: number | null; club: ClubLite | null; me: boolean }[];
  me: { clubId: string; pos: number; reward: number; games: number; goals: number; assists: number; avg: number | null; motm: number; honours: string[] } | null;
}

const KEY = 'fl-ceremony';
const ord = (n: number) => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');
const unit: Record<string, string> = { golden_boot: 'goals', playmaker: 'assists', golden_glove: 'clean sheets', pots: 'average rating' };

function stages(d: Ceremony): Raw[] {
  const out: Raw[] = [];
  const myRow = d.me ? d.table.find((t) => t.clubId === d.me!.clubId) : null;
  out.push(html`<div class="cer-stage intro">
    <div class="eyebrow">Season ${d.season} · Awards night</div>
    <div class="cer-title">The season is over</div>
    ${myRow ? html`<div class="cer-place">${badge(myRow, 64)}<div><div class="cer-big num">${ord(myRow.pos)}</div><div class="muted">${myRow.name} · ${myRow.points} pts</div></div></div>
      <div class="cer-coin">${icon('coin', 16)} +${d.me!.reward} coins for your finish</div>` : html`<p class="muted">Here's how it ended.</p>`}
  </div>`);
  if (d.champion) {
    const c = d.champion;
    out.push(html`<div class="cer-stage champ ${d.me?.clubId === c.clubId ? 'mine' : ''}">
      <div class="cer-rays"></div>
      <div class="eyebrow">League champions</div>
      <div class="cer-badge">${badge(c, 120)}</div>
      <div class="cer-title">${c.name}</div>
      <div class="muted">${c.points} points · ${c.won}W ${c.drawn}D ${c.lost}L</div>
      ${d.me?.clubId === c.clubId ? html`<div class="cer-you">${icon('trophy', 16)} That's your club. Champions!</div>` : ''}
      ${d.cup ? html`<div class="cer-cup">${trophyArt('cup', 34)}<span>Cup winners: <b>${d.cup.name}</b></span></div>` : ''}
    </div>`);
  }
  for (const a of d.awards) {
    const label = TROPHY_KINDS[a.kind as keyof typeof TROPHY_KINDS]?.label ?? a.kind;
    out.push(html`<div class="cer-stage award ${a.me ? 'mine' : ''}">
      <div class="cer-rays"></div>
      <div class="eyebrow">${label}</div>
      <div class="cer-trophy">${trophyArt(a.kind, 120)}</div>
      <div class="cer-title">${a.name}</div>
      <div class="muted">${a.club ? `${a.club.name} · ` : ''}${a.value ?? ''} ${unit[a.kind] ?? ''}</div>
      ${a.me ? html`<div class="cer-you">${icon('star', 16)} That's you!</div>` : ''}
    </div>`);
  }
  const m = d.me;
  if (m) {
    out.push(html`<div class="cer-stage you">
      <div class="eyebrow">Your season ${d.season}</div>
      <div class="cer-stats">
        <div><b class="num">${m.games}</b><span>Games</span></div>
        <div><b class="num">${m.goals}</b><span>Goals</span></div>
        <div><b class="num">${m.assists}</b><span>Assists</span></div>
        <div><b class="num">${m.avg != null ? m.avg.toFixed(2) : '–'}</b><span>Avg rating</span></div>
        <div><b class="num">${m.motm}</b><span>MOTM</span></div>
      </div>
      ${m.honours.length ? html`<div class="cer-honours">${m.honours.map((k) => html`<span class="cer-hon">${trophyArt(k, 30)}${TROPHY_KINDS[k as keyof typeof TROPHY_KINDS]?.short ?? k}</span>`)}</div>`
        : html`<p class="muted">No silverware this time. A new season means a clean slate.</p>`}
      <button class="btn primary lg" data-cer-close>Bring on season ${d.season + 1} ${icon('arrow', 16)}</button>
    </div>`);
  }
  return out;
}

function show(d: Ceremony) {
  const list = stages(d);
  let at = 0;
  const back = document.createElement('div');
  back.className = 'cer-back';
  const draw = () => {
    back.innerHTML = html`<div class="cer" role="dialog" aria-modal="true" aria-label="Awards night">
      <button class="cer-skip" data-cer-skip>${at < list.length - 1 ? 'Skip' : ''}</button>
      ${list[at]}
      <div class="cer-foot"><div class="cer-dots">${list.map((_, i) => html`<i class="${i === at ? 'on' : i < at ? 'done' : ''}"></i>`)}</div>
        ${at < list.length - 1 ? html`<span class="tiny muted">Tap to continue</span>` : ''}</div>
    </div>`.html;
  };
  const close = () => { back.classList.add('out'); setTimeout(() => back.remove(), 350); };
  back.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    if (el.closest('[data-cer-close]')) return close();
    if (el.closest('[data-cer-skip]')) { at = list.length - 1; return draw(); }
    if (at < list.length - 1) { at++; draw(); } else close();
  });
  draw();
  document.body.appendChild(back);
}

let busy = false;
/** Called when /api/me refreshes: opens the ceremony once for a season that has just ended. */
export async function watchCeremony() {
  const n = state.ceremony;
  if (!n || busy) return;
  let seen = 0;
  try { seen = Number(localStorage.getItem(KEY) ?? 0); } catch { /* storage unavailable */ }
  if (seen >= n) return;
  busy = true;
  try {
    const d: Ceremony = await api.get(`/api/season/ceremony/${n}`);
    try { localStorage.setItem(KEY, String(n)); } catch { /* storage unavailable */ }
    show(d);
  } catch {
    /* try again next time */
  } finally {
    busy = false;
  }
}
