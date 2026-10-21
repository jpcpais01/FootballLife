import { overall, type Position } from '../../shared/attributes.ts';
import { FORMATION_KEYS, getFormation, roleFit, TACTIC_OPTIONS, type Tactics } from '../../shared/formations.ts';
import { api } from '../api.ts';
import { avatarSvg } from '../art.ts';
import { badge, matchRow, ovrChip, posChip, roleLabel } from '../components.ts';
import { html, mount, type Raw } from '../dom.ts';
import { icon } from '../icons.ts';
import { navigate } from '../router.ts';
import { refreshMe, state } from '../state.ts';
import { confirmModal, errorBox, skeleton, toast } from '../ui.ts';

type Tab = 'squad' | 'tactics' | 'fixtures' | 'manage';

export async function clubPage(el: HTMLElement, [id]: string[]) {
  mount(el, html`${skeleton(120, 3)}`);
  let d: any;
  let tab: Tab = 'squad';
  // Tactics editor draft.
  let draft: { formation: string; tactics: Tactics; lineup: Record<string, string> } | null = null;
  let selSlot: string | null = null;

  const load = async () => {
    d = await api.get(`/api/clubs/${id}`);
    draft = { formation: d.club.formation, tactics: { ...d.club.tactics }, lineup: { ...d.lineup } };
    render();
  };

  const byId = () => new Map<string, any>(d.members.map((m: any) => [m.id, m]));

  const squadTab = (): Raw => html`<div class="card flush"><table class="table">
    <thead><tr><th class="c">#</th><th>Player</th><th>Pos</th><th class="c">OVR</th><th class="hide-sm">Role</th></tr></thead>
    <tbody>${d.members.map((m: any) => html`<tr class="click" data-href="/player/${m.id}">
      <td class="c dim" style="font-weight:800">${m.shirt}</td>
      <td><div class="row" style="gap:10px">${avatarSvg(m.appearance, d.club.colors, 34)}<div class="grow"><div style="font-weight:600" class="ellipsis">${m.name}</div><div class="tiny ${m.isBot ? 'dim' : 'lime'}">${m.isBot ? 'AI player' : 'Human'}${d.lineup && Object.values(d.lineup).includes(m.id) ? ' · Starter' : ''}</div></div></div></td>
      <td>${posChip(m.position)}</td>
      <td class="c">${ovrChip(m.ovr, true)}</td>
      <td class="hide-sm">${m.isBot ? html`<span class="dim small">—</span>` : html`<span class="chip ${m.role === 'founder' ? 'lime' : ''}">${roleLabel(m.role)}</span>`}</td>
    </tr>`)}</tbody></table></div>`;

  const tacticsTab = (): Raw => {
    const canEdit = !!d.me.perms?.tactics;
    const f = getFormation(draft!.formation);
    const map = byId();
    const lineupIds = new Set(Object.values(draft!.lineup));
    const pitch = html`<div class="pitch2d">
      <div class="ln" style="left:-2px;right:-2px;top:50%;height:0;border-width:2px 0 0"></div>
      <div class="ln" style="left:50%;top:50%;width:24%;aspect-ratio:1;border-radius:50%;transform:translate(-50%,-50%)"></div>
      <div class="ln" style="left:22%;right:22%;bottom:-2px;height:16%"></div><div class="ln" style="left:36%;right:36%;bottom:-2px;height:6%"></div>
      <div class="ln" style="left:22%;right:22%;top:-2px;height:16%"></div><div class="ln" style="left:36%;right:36%;top:-2px;height:6%"></div>
      ${f.slots.map((s) => {
        const p = map.get(draft!.lineup[s.id]);
        const fit = p ? roleFit(p.position, s.role) : 1;
        return html`<div class="slot ${selSlot === s.id ? 'sel' : ''} ${p && !p.isBot ? 'human' : ''}" data-slot="${s.id}" style="left:${50 + s.y * 42}%;top:${94 - s.x * 104}%">
          <div class="dot" style="position:relative;background:${d.club.colors.primary};color:${d.club.colors.secondary}">${p?.shirt ?? '?'}</div>
          <div class="nm">${p ? p.name.split(' ').slice(-1)[0] : s.id}</div>
          ${fit < 1 ? html`<div class="fit">${s.role} · ${Math.round(fit * 100)}%</div>` : ''}
        </div>`;
      })}
    </div>`;
    const seg = (k: keyof Tactics) => html`<div class="field"><label>${k}</label><div class="seg">${TACTIC_OPTIONS[k].map((o) => html`<button type="button" class="${draft!.tactics[k] === o ? 'on' : ''}" data-tac="${k}" data-v="${o}" ${canEdit ? '' : 'disabled'}>${o}</button>`)}</div></div>`;
    const benchList = d.members.filter((m: any) => !lineupIds.has(m.id));
    const selRole = selSlot ? f.slots.find((s) => s.id === selSlot)?.role : null;
    return html`<div class="dash">
      <div class="card span-6">
        <div class="card-head"><div class="h2">Starting XI</div>
          <select class="input" id="formation" style="width:auto;height:38px" ${canEdit ? '' : 'disabled'}>${FORMATION_KEYS.map((k) => html`<option ${k === draft!.formation ? 'selected' : ''}>${k}</option>`)}</select></div>
        ${pitch}
        <p class="tiny muted" style="text-align:center;margin:12px 0 0">${canEdit ? 'Tap a position, then tap a player below to put them there. Players out of position lose effectiveness.' : 'Only the founder, president or coach can change the line-up.'}</p>
      </div>
      <div class="span-6 stack" style="gap:16px">
        <div class="card stack" style="gap:14px"><div class="h2">Team instructions</div>${seg('mentality')}${seg('tempo')}${seg('pressing')}${seg('width')}
          <p class="tiny dim" style="margin:0">Attacking sides create more but leave space behind. A deep block concedes less but scores less. High pressing wins the ball higher but tires players and gives away fouls.</p></div>
        <div class="card"><div class="card-head"><div class="h2">${selSlot ? `Pick for ${selSlot}` : 'Substitutes & reserves'}</div>${selSlot ? html`<span class="chip">${selRole}</span>` : ''}</div>
          <div class="list">${(selSlot ? [...d.members].sort((a: any, b: any) => overall(b.attrs, b.position) * roleFit(b.position, selRole as Position) - overall(a.attrs, a.position) * roleFit(a.position, selRole as Position)) : benchList).map((m: any) => html`
            <div class="list-item ${canEdit && selSlot ? 'click' : ''}" ${canEdit && selSlot ? html`data-pick="${m.id}" style="cursor:pointer"` : ''}>
              <span class="dim" style="width:22px;font-weight:800;text-align:center">${m.shirt}</span>${posChip(m.position)}
              <span class="grow ellipsis" style="font-weight:600">${m.name}${m.isBot ? '' : html` <span class="lime tiny">●</span>`}</span>
              ${selSlot && lineupIds.has(m.id) ? html`<span class="chip tiny">In XI</span>` : ''}
              ${ovrChip(selRole ? Math.round(m.ovr * roleFit(m.position, selRole as Position)) : m.ovr, true)}
            </div>`)}</div></div>
        ${canEdit ? html`<div class="row"><button class="btn primary grow" id="save">Save tactics</button><button class="btn" id="auto">Auto-pick</button></div>` : ''}
      </div>
    </div>`;
  };

  const fixturesTab = (): Raw => html`<div class="card">${d.fixtures.length ? d.fixtures.map((m: any) => matchRow(m, d.club.id)) : html`<div class="empty">No fixtures yet.</div>`}</div>`;

  const manageTab = (): Raw => {
    const perms = d.me.perms;
    const humans = d.members.filter((m: any) => !m.isBot);
    return html`<div class="dash">
      ${d.club.inviteCode ? html`<div class="card span-5 stack" style="gap:12px"><div class="h2">Invite friends</div>
        <p class="small muted" style="margin:0">${d.club.joinMode === 'open' ? 'Your club is open: anyone can join from the Clubs page. Share the code too.' : 'Your club is invite-only. Friends need this code to join.'}</p>
        <div class="row"><div class="input row" style="font-family:var(--display);font-weight:800;font-size:24px;letter-spacing:3px;justify-content:center">${d.club.inviteCode}</div><button class="btn" data-copy="${d.club.inviteCode}">${icon('copy')}</button></div>
        ${perms.settings ? html`<div class="row wrap"><div class="seg">${['open', 'invite'].map((m) => html`<button class="${d.club.joinMode === m ? 'on' : ''}" data-joinmode="${m}">${m === 'open' ? 'Anyone' : 'Invite only'}</button>`)}</div><button class="btn sm ghost" id="newcode">New code</button></div>` : ''}
      </div>` : ''}
      <div class="card span-7"><div class="card-head"><div class="h2">Members & roles</div></div>
        <div class="list">${humans.map((m: any) => {
          const editable = perms.roles && m.id !== state.player?.id && m.role !== 'founder' && !(d.me.role === 'president' && m.role === 'president');
          return html`<div class="list-item">${avatarSvg(m.appearance, d.club.colors, 34)}<div class="grow"><div style="font-weight:600">${m.name}</div><div class="tiny muted">${m.position} · ${m.ovr} OVR</div></div>
            ${editable ? html`<select class="input" style="width:auto;height:34px" data-role="${m.id}">${(d.me.role === 'founder' ? ['president', 'coach', 'captain', 'player'] : ['coach', 'captain', 'player']).map((r) => html`<option value="${r}" ${m.role === r ? 'selected' : ''}>${roleLabel(r)}</option>`)}</select>
              ${perms.kick ? html`<button class="btn sm ghost danger" data-kick="${m.id}" data-name="${m.name}">Remove</button>` : ''}` : html`<span class="chip ${m.role === 'founder' ? 'lime' : ''}">${roleLabel(m.role)}</span>`}
          </div>`;
        })}</div>
        <p class="tiny dim" style="margin:12px 0 0">Founder: everything. President: settings, roles, members. Coach: line-up and tactics. Captain: invites and friendlies. Roles can only be managed below your own.</p>
      </div>
    </div>`;
  };

  const render = () => {
    const c = d.club;
    const me = d.me;
    const tabs: Tab[] = ['squad', 'tactics', 'fixtures', ...(me.inClub ? (['manage'] as Tab[]) : [])];
    const humans = d.members.filter((m: any) => !m.isBot).length;
    mount(el, html`
      <div class="card hero-card" style="padding:24px;margin-bottom:18px;background:radial-gradient(600px 300px at 100% 0%, ${c.colors.primary}33, transparent 60%), linear-gradient(135deg, #171c20, #121518)">
        <div class="row wrap" style="gap:18px">
          ${badge(c, 88)}
          <div class="grow">
            <div class="eyebrow">${c.isBot ? 'AI club' : `Founded ${new Date(c.createdAt).toLocaleDateString()}`}</div>
            <div class="h1" style="margin-top:4px">${c.name}</div>
            <div class="row wrap" style="margin-top:10px;gap:8px">
              <span class="chip">${icon('users', 13)} ${humans} human${humans === 1 ? '' : 's'} · ${d.members.length - humans} AI</span>
              <span class="chip">Strength ${c.strength}</span><span class="chip">${c.formation}</span>
              ${me.role ? html`<span class="chip lime">You: ${roleLabel(me.role)}</span>` : ''}
            </div>
          </div>
          <div class="row wrap">
            ${me.perms?.friendly ? html`<button class="btn primary" id="friendly">${icon('play')} Friendly</button>` : ''}
            ${me.inClub ? html`<button class="btn ghost" id="leave">Leave</button>` : ''}
            ${!me.hasClub && !c.isBot ? html`<button class="btn primary" id="join">Join club</button>` : ''}
          </div>
        </div>
      </div>
      <div class="tabs">${tabs.map((t) => html`<button class="${t === tab ? 'on' : ''}" data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`)}</div>
      <div class="fade-in">${tab === 'squad' ? squadTab() : tab === 'tactics' ? tacticsTab() : tab === 'fixtures' ? fixturesTab() : manageTab()}</div>
      <div id="friendly-modal"></div>`);
  };

  el.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    const tb = t.closest('[data-tab]') as HTMLElement | null;
    if (tb) { tab = tb.dataset.tab as Tab; selSlot = null; return render(); }
    const tr = t.closest('tr[data-href]') as HTMLElement | null;
    if (tr) return navigate(tr.dataset.href!);
    const slot = t.closest('[data-slot]') as HTMLElement | null;
    if (slot && d.me.perms?.tactics) { selSlot = selSlot === slot.dataset.slot ? null : slot.dataset.slot!; return render(); }
    const pick = t.closest('[data-pick]') as HTMLElement | null;
    if (pick && selSlot && draft) {
      const pid = pick.dataset.pick!;
      const prevSlot = Object.keys(draft.lineup).find((k) => draft!.lineup[k] === pid);
      const current = draft.lineup[selSlot];
      if (prevSlot) { if (current) draft.lineup[prevSlot] = current; else delete draft.lineup[prevSlot]; }
      draft.lineup[selSlot] = pid;
      selSlot = null;
      return render();
    }
    const tac = t.closest('[data-tac]') as HTMLElement | null;
    if (tac && draft) { (draft.tactics as any)[tac.dataset.tac!] = tac.dataset.v; return render(); }
    if (t.closest('#save') && draft) {
      try { await api.post(`/api/clubs/${id}/lineup`, draft); toast('Tactics saved', 'ok'); await load(); } catch (err) { toast((err as Error).message, 'err'); }
      return;
    }
    if (t.closest('#auto') && draft) {
      try { await api.post(`/api/clubs/${id}/lineup`, { formation: draft.formation, tactics: draft.tactics, lineup: {} }); toast('Best XI picked', 'ok'); await load(); } catch (err) { toast((err as Error).message, 'err'); }
      return;
    }
    if (t.closest('#leave')) {
      const founder = d.me.role === 'founder';
      if (!(await confirmModal('Leave club?', founder ? 'You are the founder. Leadership passes to the president (or the longest-serving member). If nobody is left, the club continues under AI control.' : 'You will become a free agent. You can join another club any time.', 'Leave club', true))) return;
      try { await api.post('/api/clubs/leave'); await refreshMe(); toast('You left the club'); navigate('/clubs'); } catch (err) { toast((err as Error).message, 'err'); }
      return;
    }
    if (t.closest('#join')) {
      try { await api.post(`/api/clubs/${id}/join`, {}); await refreshMe(); toast('Welcome to the club!', 'ok'); await load(); } catch (err) { toast((err as Error).message, 'err'); }
      return;
    }
    const cp = t.closest('[data-copy]') as HTMLElement | null;
    if (cp) { await navigator.clipboard?.writeText(cp.dataset.copy!).catch(() => {}); toast('Invite code copied', 'ok'); return; }
    const jm = t.closest('[data-joinmode]') as HTMLElement | null;
    if (jm) { await api.post(`/api/clubs/${id}/settings`, { joinMode: jm.dataset.joinmode }).catch((err) => toast(err.message, 'err')); return load(); }
    if (t.closest('#newcode')) {
      if (!(await confirmModal('New invite code?', 'The old code will stop working.', 'Generate'))) return;
      await api.post(`/api/clubs/${id}/settings`, { newCode: true }).catch((err) => toast(err.message, 'err'));
      return load();
    }
    const kick = t.closest('[data-kick]') as HTMLElement | null;
    if (kick) {
      if (!(await confirmModal(`Remove ${kick.dataset.name}?`, 'They will leave the club immediately and become a free agent.', 'Remove', true))) return;
      try { await api.post(`/api/clubs/${id}/kick`, { playerId: kick.dataset.kick }); toast('Member removed'); await load(); } catch (err) { toast((err as Error).message, 'err'); }
      return;
    }
    if (t.closest('#friendly')) return openFriendly();
  });

  el.addEventListener('change', async (e) => {
    const t = e.target as HTMLSelectElement;
    if (t.id === 'formation' && draft) {
      draft.formation = t.value;
      draft.lineup = {};
      // Re-seat everyone in their natural slots where possible.
      const f = getFormation(t.value);
      const used = new Set<string>();
      const pool = [...d.members].sort((a: any, b: any) => Number(a.isBot) - Number(b.isBot) || b.ovr - a.ovr);
      for (const s of f.slots) {
        const p = pool.find((m: any) => !used.has(m.id) && m.position === s.role) ?? pool.filter((m: any) => !used.has(m.id)).sort((a: any, b: any) => b.ovr * roleFit(b.position, s.role) - a.ovr * roleFit(a.position, s.role))[0];
        if (p) { used.add(p.id); draft.lineup[s.id] = p.id; }
      }
      render();
    }
    if (t.dataset.role) {
      try { await api.post(`/api/clubs/${id}/role`, { playerId: t.dataset.role, role: t.value }); toast('Role updated', 'ok'); await load(); } catch (err) { toast((err as Error).message, 'err'); await load(); }
    }
  });

  const openFriendly = async () => {
    const clubs = (await api.get('/api/clubs')).clubs.filter((c: any) => c.id !== id);
    const back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = html`<div class="modal" style="width:min(520px,100%)">
      <div class="h2" style="margin-bottom:6px">Arrange a friendly</div>
      <p class="small muted" style="margin:0 0 12px">Kicks off in 20 seconds and plays out live. Friendlies don't affect the table or give rewards.</p>
      <div class="list" style="max-height:50vh;overflow:auto">${clubs.map((c: any) => html`<button class="list-item" data-opp="${c.id}" style="background:none;border-left:0;border-right:0;border-bottom:0;cursor:pointer;text-align:left;width:100%">${badge(c, 32)}<span class="grow" style="font-weight:600">${c.name}</span><span class="chip">Str ${c.strength}</span></button>`)}</div>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" data-x>Cancel</button></div></div>`.html;
    document.body.appendChild(back);
    back.addEventListener('click', async (ev) => {
      const t = ev.target as HTMLElement;
      if (t === back || t.closest('[data-x]')) return back.remove();
      const o = t.closest('[data-opp]') as HTMLElement | null;
      if (!o) return;
      try {
        const r = await api.post(`/api/clubs/${id}/friendly`, { opponentId: o.dataset.opp });
        back.remove();
        toast('Friendly arranged — kick-off in 20 seconds!', 'ok');
        navigate(`/match/${r.id}`);
      } catch (err) {
        toast((err as Error).message, 'err');
      }
    });
  };

  try {
    await load();
  } catch (e) {
    mount(el, errorBox((e as Error).message));
  }
}
