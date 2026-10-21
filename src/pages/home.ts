import { api } from '../api.ts';
import { avatarSvg } from '../art.ts';
import { badge, keyAttrs, linkRows, matchRow, posChip, roleLabel, standingsTable, type MatchBrief } from '../components.ts';
import { html, mount, type Raw } from '../dom.ts';
import { icon } from '../icons.ts';
import { navigate } from '../router.ts';
import { refreshMe } from '../state.ts';
import { countdown, errorBox, kickoffLabel, relTime, skeleton, toast } from '../ui.ts';

export async function homePage(el: HTMLElement) {
  mount(el, html`<div class="dash">${skeleton(180, 4)}</div>`);
  let data: any;
  let timer = 0;
  let poll = 0;
  let alive = true;

  const load = async () => {
    try {
      data = await api.get('/api/home');
      if (!alive) return;
      render();
    } catch (e) {
      if (alive && !data) mount(el, errorBox((e as Error).message));
    }
  };

  const render = () => {
    const d = data;
    const p = d.player;
    const kit = d.club?.colors;
    const greet = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening';
    const unread = d.notifications.filter((n: any) => !n.read).length;

    const nextCard = (): Raw => {
      const m: MatchBrief | null = d.live ?? d.next;
      if (!d.club) {
        return html`<div class="card hero-card span-7" style="padding:26px">
          <div class="eyebrow">Get started</div>
          <div class="h1" style="font-size:38px;margin:8px 0">Find your club</div>
          <p class="muted" style="max-width:460px;margin:0 0 18px">Every career needs a team. Create your own club and invite friends, or join a club that's recruiting. AI players fill any empty spots so you can play right away.</p>
          <div class="row wrap"><a class="btn primary" href="/clubs/new">${icon('plus')} Create a club</a><a class="btn" href="/clubs">Browse clubs</a></div>
          ${d.invites?.length ? html`<div class="divider"></div><div class="label" style="margin-bottom:6px">Your invites & requests</div><div class="list">${d.invites.map((i: any) => html`<div class="list-item">${badge(i.club, 34)}
            <div class="grow"><a href="/club/${i.club.id}" style="font-weight:700">${i.club.name}</a><div class="tiny muted">${i.kind === 'invite' ? `Invited by ${i.from ?? 'the club'}` : 'You asked to join'} · ${relTime(i.at)}</div></div>
            ${i.kind === 'invite' ? html`<button class="btn sm primary" data-respond="${i.id}" data-accept="1">Accept</button><button class="btn sm ghost" data-respond="${i.id}" data-accept="0">Decline</button>` : html`<span class="chip">Pending</span>`}</div>`)}</div>` : ''}
        </div>`;
      }
      if (!m) {
        return html`<div class="card hero-card span-7" style="padding:26px"><div class="eyebrow">Next match</div><div class="h2" style="margin-top:10px">No fixtures yet</div><p class="muted">Your club joins the league next season. In the meantime, arrange a friendly from your club page.</p><a class="btn" href="/club/${d.club.id}">Go to club</a></div>`;
      }
      const live = m.status === 'live';
      return html`<a class="card hero-card span-7" href="/match/${m.id}" style="display:block">
        <div style="padding:22px 24px 0" class="row between">
          <div class="eyebrow">${live ? 'Live now' : m.kind === 'friendly' ? 'Friendly' : `Next match · Round ${m.round}`}</div>
          ${live ? html`<span class="chip live">LIVE</span>` : html`<span class="chip">${icon('calendar', 13)} ${kickoffLabel(m.kickoffAt)}</span>`}
        </div>
        <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px;padding:22px 24px">
          <div class="stack" style="align-items:center;text-align:center;gap:8px">${badge(m.home, 72)}<div class="h3">${m.home.name}</div></div>
          <div class="stack" style="align-items:center;gap:4px">
            ${live ? html`<div class="countdown lime">LIVE</div><div class="tiny muted">Tap to watch</div>` : html`<div class="countdown" data-countdown="${m.kickoffAt}">${countdown(m.kickoffAt)}</div><div class="tiny muted">until kickoff</div>`}
          </div>
          <div class="stack" style="align-items:center;text-align:center;gap:8px">${badge(m.away, 72)}<div class="h3">${m.away.name}</div></div>
        </div>
        <div style="padding:14px 24px;border-top:1px solid var(--line);display:flex;justify-content:space-between;align-items:center">
          <span class="small muted">${live ? 'Everyone is watching the same match, live.' : 'Matches simulate on the server and play out live for everyone.'}</span>
          <span class="lime" style="font-weight:700;display:flex;align-items:center;gap:6px">${live ? 'Watch' : 'Preview'} ${icon('arrow', 16)}</span>
        </div>
      </a>`;
    };

    const training = d.training;
    mount(el, html`
      <div class="page-head">
        <div><div class="eyebrow">${greet}</div><div class="h1" style="margin-top:6px">${p.name.split(' ')[0]}</div></div>
        ${d.season ? html`<div class="chip lime">${icon('trophy', 13)} Season ${d.season.number}${d.position ? html` · ${ordinal(d.position)}` : ''}</div>` : ''}
      </div>
      <div class="dash stagger">
        <div class="pcard span-5">
          <div class="row between" style="align-items:flex-start">
            <div>
              <div class="big-ovr">${p.ovr}</div>
              <div style="margin-top:6px">${posChip(p.position)}</div>
            </div>
            ${avatarSvg(p.appearance, kit, 96, d.club ? p.shirt : undefined, { eq: p.equipped })}
          </div>
          <div class="pname" style="margin-top:12px">${p.name}</div>
          ${d.club ? html`<a href="/club/${d.club.id}" class="row" style="margin-top:8px;gap:8px">${badge(d.club, 22)}<span style="font-weight:600">${d.club.name}</span><span class="chip">${roleLabel(p.role)}</span></a>` : html`<div class="muted small" style="margin-top:8px">Free agent</div>`}
          <div class="divider"></div>
          <div class="grid" style="grid-template-columns:repeat(4,1fr);text-align:center;gap:6px">
            ${[['Apps', p.career.apps], ['Goals', p.career.goals], ['Assists', p.career.assists], ['Rating', p.career.rating?.toFixed(2) ?? '–']].map(([k, v]) => html`<div><div style="font-family:var(--display);font-weight:800;font-size:26px">${v}</div><div class="tiny muted">${k}</div></div>`)}
          </div>
        </div>
        ${nextCard()}

        <div class="card span-4">
          <div class="card-head"><div class="h2">Training</div><a class="card-link" href="/training">Open</a></div>
          ${training.ready
            ? html`<div class="stack" style="gap:12px"><div class="row" style="gap:12px"><div class="ovr hi">${icon('dumbbell', 20)}</div><div><div class="h3">Session ready</div><div class="small muted">Develop an attribute now.</div></div></div><a class="btn primary block" href="/training">Train now</a></div>`
            : html`<div class="stack" style="gap:10px"><div class="small muted">Next session in</div><div class="countdown" data-countdown="${training.availableAt}">${countdown(training.availableAt)}</div><div class="tiny dim">One session every 4 hours. Matches give XP too.</div></div>`}
        </div>
        <div class="card span-4">
          <div class="card-head"><div class="h2">Key attributes</div><a class="card-link" href="/player/${p.id}">All</a></div>
          ${keyAttrs(p.attrs, p.position)}
        </div>
        <div class="card span-4">
          <div class="card-head"><div class="h2">Inbox ${unread ? html`<span class="chip lime" style="margin-left:6px">${unread}</span>` : ''}</div>${unread ? html`<button class="btn sm ghost" data-read>Mark read</button>` : ''}</div>
          ${d.notifications.length ? html`<div class="list">${d.notifications.slice(0, 5).map((n: any) => html`<${n.data?.matchId ? 'a' : 'div'} class="list-item" ${n.data?.matchId ? html`href="/match/${n.data.matchId}"` : ''} style="align-items:flex-start">
              <span style="color:${n.read ? 'var(--dim)' : 'var(--lime)'};margin-top:2px">${icon(n.kind === 'result' ? 'ball' : n.kind === 'season' ? 'trophy' : 'bell', 16)}</span>
              <div class="grow"><div class="small" style="${n.read ? 'color:var(--muted)' : ''}">${n.text}</div><div class="tiny dim">${relTime(n.at)}</div></div>
            </${n.data?.matchId ? 'a' : 'div'}>`)}</div>`
            : html`<div class="empty small">No messages yet. Results and rewards will land here.</div>`}
        </div>

        <div class="card span-7">
          <div class="card-head"><div class="h2">League table</div><a class="card-link" href="/league">Full table</a></div>
          ${d.table ? html`<div id="tbl">${standingsTable(d.table, d.club?.id, true)}</div>` : html`<div class="empty">The league is being set up…</div>`}
        </div>
        <div class="card span-5">
          <div class="card-head"><div class="h2">${d.recent.length ? 'Recent results' : 'Around the league'}</div></div>
          ${d.recent.length ? html`<div>${d.recent.map((m: MatchBrief) => matchRow(m, d.club?.id))}</div>` : ''}
          ${d.liveNow.length ? html`<div class="label" style="margin:${d.recent.length ? '16px' : '0'} 0 6px">Live now</div><div>${d.liveNow.map((m: MatchBrief) => matchRow(m, d.club?.id))}</div>` : ''}
          ${!d.recent.length && !d.liveNow.length ? html`<div class="empty small">No results yet. League matches kick off every morning and evening.</div>` : ''}
        </div>
      </div>`);
    const tbl = el.querySelector('#tbl') as HTMLElement | null;
    if (tbl) linkRows(tbl, navigate);
    el.querySelectorAll<HTMLElement>('[data-respond]').forEach((b) => b.addEventListener('click', async () => {
      try {
        const r = await api.post(`/api/invites/${b.dataset.respond}/respond`, { accept: b.dataset.accept === '1' });
        await refreshMe();
        if (r.clubId) { toast('Welcome to your new club!', 'ok'); navigate(`/club/${r.clubId}`); } else void load();
      } catch (err) { toast((err as Error).message, 'err'); }
    }));
    el.querySelector('[data-read]')?.addEventListener('click', async () => {
      await api.post('/api/notifications/read');
      void load();
    });
  };

  await load();
  void refreshMe().catch(() => {});
  timer = window.setInterval(() => {
    el.querySelectorAll<HTMLElement>('[data-countdown]').forEach((c) => {
      c.textContent = countdown(c.dataset.countdown!);
      if (new Date(c.dataset.countdown!).getTime() <= Date.now() && !c.dataset.fired) {
        c.dataset.fired = '1';
        setTimeout(load, 1500);
      }
    });
  }, 1000);
  poll = window.setInterval(load, 30_000);
  return () => {
    alive = false;
    clearInterval(timer);
    clearInterval(poll);
  };
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
