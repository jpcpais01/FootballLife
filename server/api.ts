import type { IncomingMessage, ServerResponse } from 'node:http';
import { ATTRIBUTES, generateAttributes, overall, POSITIONS, STARTING_LEVEL, type Attr } from '../shared/attributes.ts';
import { sanitizeAppearance } from '../shared/appearance.ts';
import { FRIENDLY_COOLDOWN_MIN, TRAINING_COOLDOWN_H } from '../shared/config.ts';
import { realAt } from '../shared/timeline.ts';
import { FORMATION_KEYS, getFormation, sanitizeTactics } from '../shared/formations.ts';
import { hashSeed } from '../shared/rng.ts';
import type { MatchResult } from '../shared/sim/types.ts';
import { clearCookie, currentUser, login, logout, register, sessionCookie, type User } from './auth.ts';
import { getDb, hasDatabaseConfig, type Db } from './db.ts';
import { bad, forbidden, hexColor, HttpError, newId, notFound, oneOf, readJson, sendJson, str } from './http.ts';
import { currentSeason, placeNewClub, standings, tick, type LineupSnapshot } from './league.ts';
import { trainingSession, TRAINING_FOCI, type TrainingFocus } from './progression.ts';
import { clubPlayers, clubStrength, resolveLineup, syncSquad, type ClubRow, type PlayerRow } from './squads.ts';

// ---------- roles & permissions ----------

export const ROLES = ['founder', 'president', 'coach', 'captain', 'player'] as const;
type Role = (typeof ROLES)[number];
const CAN = {
  tactics: ['founder', 'president', 'coach'],
  settings: ['founder', 'president'],
  invite: ['founder', 'president', 'captain'],
  friendly: ['founder', 'president', 'coach', 'captain'],
  roles: ['founder', 'president'],
  kick: ['founder', 'president'],
} satisfies Record<string, Role[]>;
const RANK: Record<Role, number> = { founder: 4, president: 3, coach: 2, captain: 1, player: 0 };

function can(role: string | undefined, action: keyof typeof CAN) {
  return !!role && (CAN[action] as string[]).includes(role);
}

// ---------- context ----------

interface Ctx {
  db: Db;
  req: IncomingMessage;
  res: ServerResponse;
  user: User | null;
  body: Record<string, unknown>;
  params: string[];
  query: URLSearchParams;
  secure: boolean;
}

type Handler = (c: Ctx) => Promise<unknown>;

function needUser(c: Ctx): User {
  if (!c.user) throw new HttpError(401, 'Please sign in');
  return c.user;
}

async function myPlayer(c: Ctx): Promise<PlayerRow> {
  const u = needUser(c);
  const p = (await c.db.query<PlayerRow>('SELECT * FROM players WHERE user_id = $1', [u.id]))[0];
  if (!p) throw bad('Create your player first');
  return p;
}

async function getClub(db: Db, id: string): Promise<ClubRow> {
  const c = (await db.query<ClubRow>('SELECT * FROM clubs WHERE id = $1', [id]))[0];
  if (!c) throw notFound('Club not found');
  return c;
}

// ---------- DTOs ----------

const clubBrief = (c: Pick<ClubRow, 'id' | 'name' | 'short' | 'colors' | 'badge' | 'is_bot'>) => ({
  id: c.id, name: c.name, short: c.short, colors: c.colors, badge: c.badge, isBot: c.is_bot,
});

function playerDto(p: PlayerRow, full = true) {
  return {
    id: p.id,
    name: p.name,
    position: p.position,
    shirt: p.shirt,
    isBot: p.is_bot,
    role: p.club_role,
    clubId: p.club_id,
    appearance: sanitizeAppearance(p.appearance),
    ovr: overall(p.attrs, p.position),
    attrs: full ? p.attrs : undefined,
  };
}

function matchStatus(m: { status: string; kickoff_at: Date; ends_at: Date | null }, now = Date.now()) {
  if (m.status === 'scheduled') return new Date(m.kickoff_at).getTime() <= now ? 'live' : 'scheduled';
  if (m.status === 'final') return 'finished';
  return m.ends_at && new Date(m.ends_at).getTime() <= now ? 'finished' : 'live';
}

interface MatchListRow {
  id: string; kind: string; round: number | null; kickoff_at: Date; ends_at: Date | null; status: string;
  home_goals: number | null; away_goals: number | null;
  h_id: string; h_name: string; h_short: string; h_colors: never; h_badge: never; h_bot: boolean;
  a_id: string; a_name: string; a_short: string; a_colors: never; a_badge: never; a_bot: boolean;
}

const MATCH_SELECT = `
  SELECT m.id, m.kind, m.round, m.kickoff_at, m.ends_at, m.status, m.home_goals, m.away_goals,
    h.id h_id, h.name h_name, h.short h_short, h.colors h_colors, h.badge h_badge, h.is_bot h_bot,
    a.id a_id, a.name a_name, a.short a_short, a.colors a_colors, a.badge a_badge, a.is_bot a_bot
  FROM matches m JOIN clubs h ON h.id = m.home_id JOIN clubs a ON a.id = m.away_id`;

function matchDto(m: MatchListRow) {
  const status = matchStatus(m);
  return {
    id: m.id,
    kind: m.kind,
    round: m.round,
    kickoffAt: new Date(m.kickoff_at).toISOString(),
    endsAt: m.ends_at ? new Date(m.ends_at).toISOString() : null,
    status,
    home: { id: m.h_id, name: m.h_name, short: m.h_short, colors: m.h_colors, badge: m.h_badge, isBot: m.h_bot },
    away: { id: m.a_id, name: m.a_name, short: m.a_short, colors: m.a_colors, badge: m.a_badge, isBot: m.a_bot },
    // Scores are only revealed once the match has played out.
    score: status === 'finished' ? [m.home_goals, m.away_goals] : null,
  };
}

async function notifications(db: Db, playerId: string) {
  const rows = await db.query<{ id: string; kind: string; text: string; data: unknown; read: boolean; created_at: Date }>(
    'SELECT * FROM notifications WHERE player_id = $1 ORDER BY created_at DESC LIMIT 12',
    [playerId],
  );
  return rows.map((n) => ({ id: n.id, kind: n.kind, text: n.text, data: n.data, read: n.read, at: new Date(n.created_at).toISOString() }));
}

function trainingInfo(p: PlayerRow) {
  const last = p.last_train_at ? new Date(p.last_train_at).getTime() : 0;
  const next = last + TRAINING_COOLDOWN_H * 3600_000;
  return { availableAt: new Date(Math.max(next, 0)).toISOString(), ready: Date.now() >= next, xp: p.xp };
}

async function careerTotals(db: Db, playerId: string) {
  const r = await db.query<{ apps: string; goals: string; assists: string; saves: string; cs: string; rating: string | null }>(
    `SELECT count(*) apps, coalesce(sum(goals),0) goals, coalesce(sum(assists),0) assists, coalesce(sum(saves),0) saves,
       coalesce(sum(CASE WHEN clean_sheet THEN 1 ELSE 0 END),0) cs, avg(rating) rating
     FROM player_match_stats WHERE player_id = $1 AND kind = 'league'`,
    [playerId],
  );
  const x = r[0];
  return { apps: +x.apps, goals: +x.goals, assists: +x.assists, saves: +x.saves, cleanSheets: +x.cs, rating: x.rating ? Math.round(+x.rating * 100) / 100 : null };
}

// ---------- handlers ----------

const routes: [string, RegExp, Handler][] = [];
const route = (method: string, path: string, h: Handler) => {
  const re = new RegExp('^' + path.replace(/:[a-z]+/g, '([^/]+)') + '$');
  routes.push([method, re, h]);
};

route('GET', '/api/health', async () => ({ ok: true }));

route('POST', '/api/auth/register', async (c) => {
  const { token, expires } = await register(c.db, c.body);
  c.res.setHeader('Set-Cookie', sessionCookie(token, expires, c.secure));
  return { ok: true };
});

route('POST', '/api/auth/login', async (c) => {
  const { token, expires } = await login(c.db, c.body);
  c.res.setHeader('Set-Cookie', sessionCookie(token, expires, c.secure));
  return { ok: true };
});

route('POST', '/api/auth/logout', async (c) => {
  await logout(c.db, c.req);
  c.res.setHeader('Set-Cookie', clearCookie(c.secure));
  return { ok: true };
});

route('GET', '/api/me', async (c) => {
  if (!c.user) return { user: null };
  const p = (await c.db.query<PlayerRow>('SELECT * FROM players WHERE user_id = $1', [c.user.id]))[0];
  return { user: c.user, player: p ? { ...playerDto(p), coins: p.coins } : null };
});

route('POST', '/api/player', async (c) => {
  const u = needUser(c);
  const exists = await c.db.query('SELECT 1 FROM players WHERE user_id = $1', [u.id]);
  if (exists.length) throw bad('You already have a player');
  const name = str(c.body.name, 'Player name', 3, 24);
  if (!/^[\p{L}\p{M}' .-]+$/u.test(name)) throw bad('Player name can only use letters, spaces, apostrophes and dashes');
  const position = oneOf(c.body.position, POSITIONS, 'position');
  const appearance = sanitizeAppearance(c.body.appearance);
  const id = newId('p_');
  const attrs = generateAttributes(position, STARTING_LEVEL, id, 3);
  await c.db.query(
    'INSERT INTO players (id, user_id, name, position, appearance, attrs, coins) VALUES ($1, $2, $3, $4, $5, $6, 250)',
    [id, u.id, name, position, JSON.stringify(appearance), JSON.stringify(attrs)],
  );
  return { id };
});

route('POST', '/api/player/appearance', async (c) => {
  const p = await myPlayer(c);
  await c.db.query('UPDATE players SET appearance = $2 WHERE id = $1', [p.id, JSON.stringify(sanitizeAppearance(c.body.appearance))]);
  return { ok: true };
});

route('POST', '/api/train', async (c) => {
  const p = await myPlayer(c);
  const focus = c.body.focus as TrainingFocus;
  if (!(TRAINING_FOCI as readonly string[]).includes(focus) && !(ATTRIBUTES as readonly string[]).includes(focus)) throw bad('Pick something to train');
  const info = trainingInfo(p);
  if (!info.ready) throw bad('You are still recovering from your last session');
  // Regularity bonus: training again within a day of the last session.
  const last = p.last_train_at ? new Date(p.last_train_at).getTime() : 0;
  const streak = last && Date.now() - last < 24 * 3600_000 ? 0.15 : 0;
  const res = trainingSession(p.position, p.attrs, p.xp as Partial<Record<Attr, number>>, focus, streak);
  const updated = await c.db.query(
    'UPDATE players SET attrs = $2, xp = $3, last_train_at = now() WHERE id = $1 AND (last_train_at IS NULL OR last_train_at = $4) RETURNING id',
    [p.id, JSON.stringify(res.attrs), JSON.stringify(res.xp), p.last_train_at],
  );
  if (!updated.length) throw bad('Training already in progress');
  return { levelUps: res.levelUps, xp: res.xp, attrs: res.attrs, ovr: overall(res.attrs, p.position), streak: streak > 0 };
});

route('GET', '/api/home', async (c) => {
  const p = await myPlayer(c);
  const season = await currentSeason(c.db);
  let club = null;
  let next = null;
  let live = null;
  let recent: ReturnType<typeof matchDto>[] = [];
  let table = null;
  let position = null;
  if (p.club_id) {
    const cl = await getClub(c.db, p.club_id);
    const players = await clubPlayers(c.db, cl.id);
    club = { ...clubBrief(cl), role: p.club_role, strength: clubStrength(players, cl), humans: players.filter((x) => !x.is_bot).length, size: players.length };
    const ms = (await c.db.query<MatchListRow>(`${MATCH_SELECT} WHERE (m.home_id = $1 OR m.away_id = $1) ORDER BY m.kickoff_at`, [cl.id])).map(matchDto);
    live = ms.find((m) => m.status === 'live') ?? null;
    next = ms.find((m) => m.status === 'scheduled') ?? null;
    recent = ms.filter((m) => m.status === 'finished').slice(-5).reverse();
    if (season) {
      table = await standings(c.db, season.id);
      const idx = table.findIndex((r) => r.clubId === cl.id);
      position = idx >= 0 ? idx + 1 : null;
    }
  } else if (season) {
    table = await standings(c.db, season.id);
  }
  const anyLive = (await c.db.query<MatchListRow>(`${MATCH_SELECT} WHERE m.status <> 'final' AND m.kickoff_at <= now() ORDER BY m.kickoff_at DESC LIMIT 6`)).map(matchDto).filter((m) => m.status === 'live');
  return {
    player: { ...playerDto(p), coins: p.coins, career: await careerTotals(c.db, p.id) },
    training: trainingInfo(p),
    club,
    season: season ? { id: season.id, number: season.number } : null,
    position,
    table,
    next,
    live,
    liveNow: anyLive,
    recent,
    notifications: await notifications(c.db, p.id),
  };
});

route('POST', '/api/notifications/read', async (c) => {
  const p = await myPlayer(c);
  await c.db.query('UPDATE notifications SET read = true WHERE player_id = $1', [p.id]);
  return { ok: true };
});

route('GET', '/api/clubs', async (c) => {
  const season = await currentSeason(c.db);
  const rows = await c.db.query<ClubRow & { humans: string; in_season: boolean }>(
    `SELECT c.*, (SELECT count(*) FROM players p WHERE p.club_id = c.id AND NOT p.is_bot) humans,
       EXISTS (SELECT 1 FROM season_clubs sc WHERE sc.club_id = c.id AND sc.season_id = $1) in_season
     FROM clubs c WHERE c.active ORDER BY c.is_bot, c.created_at`,
    [season?.id ?? ''],
  );
  const out = [];
  for (const r of rows) {
    const players = await clubPlayers(c.db, r.id);
    out.push({ ...clubBrief(r), joinMode: r.join_mode, humans: +r.humans, inSeason: r.in_season, strength: clubStrength(players, r), formation: r.formation });
  }
  return { clubs: out };
});

route('POST', '/api/clubs', async (c) => {
  const p = await myPlayer(c);
  if (p.club_id) throw bad('Leave your current club first');
  const name = str(c.body.name, 'Club name', 3, 24);
  if (!/^[\p{L}\p{M}\p{N}' .&-]+$/u.test(name)) throw bad('Club name has unsupported characters');
  const short = str(c.body.short, 'Short name', 2, 4).toUpperCase();
  if (!/^[A-Z0-9]+$/.test(short)) throw bad('Short name must be letters or numbers');
  const colors = { primary: hexColor(c.body.primary, 'primary colour'), secondary: hexColor(c.body.secondary, 'secondary colour') };
  const badge = { shape: Math.max(0, Math.min(3, Number(c.body.shape) | 0)), icon: Math.max(0, Math.min(5, Number(c.body.icon) | 0)) };
  const joinMode = oneOf(c.body.joinMode ?? 'open', ['open', 'invite'] as const, 'join mode');
  const taken = await c.db.query('SELECT 1 FROM clubs WHERE name_lc = $1', [name.toLowerCase()]);
  if (taken.length) throw bad('That club name is taken');
  const id = newId('c_');
  const placement = await c.db.tx(async (db) => {
    await db.query(
      `INSERT INTO clubs (id, name, name_lc, short, colors, badge, founder_user_id, join_mode, invite_code, level)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, name, name.toLowerCase(), short, JSON.stringify(colors), JSON.stringify(badge), p.user_id, joinMode, inviteCode(), STARTING_LEVEL],
    );
    await db.query("UPDATE players SET club_id = $2, club_role = 'founder', shirt = $3 WHERE id = $1", [p.id, id, defaultShirt(p.position)]);
    const club = await getClub(db, id);
    await syncSquad(db, club);
    return placeNewClub(db, id);
  });
  return { id, placement };
});

function inviteCode() {
  return newId().slice(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
}

function defaultShirt(pos: string): number {
  return ({ GK: 1, CB: 4, FB: 2, DM: 6, CM: 8, AM: 10, WG: 7, ST: 9 } as Record<string, number>)[pos] ?? 14;
}

route('GET', '/api/clubs/:id', async (c) => {
  const club = await getClub(c.db, c.params[0]);
  const players = await clubPlayers(c.db, club.id);
  const me = c.user ? (await c.db.query<PlayerRow>('SELECT * FROM players WHERE user_id = $1', [c.user.id]))[0] : undefined;
  const myRole = me && me.club_id === club.id ? me.club_role : undefined;
  const { xi, bench } = resolveLineup(club, players);
  const season = await currentSeason(c.db);
  const fixtures = (await c.db.query<MatchListRow>(
    `${MATCH_SELECT} WHERE (m.home_id = $1 OR m.away_id = $1) AND (m.season_id = $2 OR m.kind = 'friendly') ORDER BY m.kickoff_at`,
    [club.id, season?.id ?? ''],
  )).map(matchDto);
  const roleOrder = (r: string) => -(RANK[r as Role] ?? 0);
  return {
    club: {
      ...clubBrief(club),
      joinMode: club.join_mode,
      formation: getFormation(club.formation).name,
      tactics: sanitizeTactics(club.tactics as never),
      benchSize: club.bench_size,
      strength: clubStrength(players, club),
      inviteCode: can(myRole, 'invite') ? club.invite_code : undefined,
      createdAt: new Date(club.created_at).toISOString(),
    },
    members: players.sort((a, b) => Number(a.is_bot) - Number(b.is_bot) || roleOrder(a.club_role) - roleOrder(b.club_role)).map((p) => playerDto(p)),
    lineup: Object.fromEntries(xi.map((e) => [e.slotId, e.player.id])),
    bench: bench.map((p) => p.id),
    fixtures,
    me: { role: myRole ?? null, inClub: !!myRole, hasClub: !!me?.club_id, perms: myRole ? Object.fromEntries(Object.keys(CAN).map((k) => [k, can(myRole, k as keyof typeof CAN)])) : {} },
  };
});

route('POST', '/api/clubs/:id/join', async (c) => {
  const p = await myPlayer(c);
  if (p.club_id) throw bad('Leave your current club first');
  const club = await getClub(c.db, c.params[0]);
  if (club.is_bot || !club.active) throw bad('AI clubs cannot be joined — create your own club or join a player club');
  if (club.join_mode === 'invite' && String(c.body.code ?? '').trim().toUpperCase() !== club.invite_code) throw bad('This club is invite-only. Ask a member for the invite code.');
  const humans = await c.db.query('SELECT 1 FROM players WHERE club_id = $1 AND NOT is_bot', [club.id]);
  if (humans.length >= 23) throw bad('This club is full');
  await c.db.tx(async (db) => {
    const shirts = new Set((await db.query<{ shirt: number }>('SELECT shirt FROM players WHERE club_id = $1', [club.id])).map((r) => r.shirt));
    let shirt = defaultShirt(p.position);
    // The bot wearing our preferred number gives it up when it leaves; otherwise pick a free one.
    const botWithShirt = (await db.query<{ id: string }>('SELECT id FROM players WHERE club_id = $1 AND is_bot AND shirt = $2', [club.id, shirt]))[0];
    if (shirts.has(shirt) && !botWithShirt) for (shirt = 14; shirts.has(shirt); shirt++);
    if (botWithShirt) {
      let free = 30;
      while (shirts.has(free)) free++;
      await db.query('UPDATE players SET shirt = $2 WHERE id = $1', [botWithShirt.id, free]);
    }
    await db.query("UPDATE players SET club_id = $2, club_role = 'player', shirt = $3 WHERE id = $1", [p.id, club.id, shirt]);
    await syncSquad(db, club);
  });
  return { ok: true };
});

route('POST', '/api/clubs/leave', async (c) => {
  const p = await myPlayer(c);
  if (!p.club_id) throw bad('You are not in a club');
  const club = await getClub(c.db, p.club_id);
  await c.db.tx(async (db) => {
    await db.query("UPDATE players SET club_id = NULL, club_role = 'player' WHERE id = $1", [p.id]);
    const others = await db.query<PlayerRow>('SELECT * FROM players WHERE club_id = $1 AND NOT is_bot ORDER BY created_at', [club.id]);
    if (p.club_role === 'founder') {
      if (others.length) {
        const heir = others.find((o) => o.club_role === 'president') ?? others[0];
        await db.query("UPDATE players SET club_role = 'founder' WHERE id = $1", [heir.id]);
        await db.query('UPDATE clubs SET founder_user_id = $2 WHERE id = $1', [club.id, heir.user_id]);
      } else {
        // Nobody left: the club carries on under AI control so the league is unaffected.
        await db.query('UPDATE clubs SET is_bot = true, founder_user_id = NULL WHERE id = $1', [club.id]);
      }
    }
    await syncSquad(db, await getClub(db, club.id));
  });
  return { ok: true };
});

route('POST', '/api/clubs/:id/lineup', async (c) => {
  const p = await myPlayer(c);
  const club = await getClub(c.db, c.params[0]);
  if (p.club_id !== club.id || !can(p.club_role, 'tactics')) throw forbidden('Only the founder, president or coach can change tactics');
  const formation = oneOf(c.body.formation ?? club.formation, FORMATION_KEYS, 'formation');
  const tactics = sanitizeTactics(c.body.tactics as never);
  const players = await clubPlayers(c.db, club.id);
  const ids = new Set(players.map((x) => x.id));
  const slots = new Set(getFormation(formation).slots.map((s) => s.id));
  const lineup: Record<string, string> = {};
  const used = new Set<string>();
  const raw = (c.body.lineup ?? {}) as Record<string, unknown>;
  for (const [slot, pid] of Object.entries(raw)) {
    if (!slots.has(slot) || typeof pid !== 'string' || !ids.has(pid) || used.has(pid)) continue;
    lineup[slot] = pid;
    used.add(pid);
  }
  await c.db.query('UPDATE clubs SET formation = $2, tactics = $3, lineup = $4 WHERE id = $1', [club.id, formation, JSON.stringify(tactics), JSON.stringify(lineup)]);
  return { ok: true };
});

route('POST', '/api/clubs/:id/settings', async (c) => {
  const p = await myPlayer(c);
  const club = await getClub(c.db, c.params[0]);
  if (p.club_id !== club.id || !can(p.club_role, 'settings')) throw forbidden();
  const joinMode = oneOf(c.body.joinMode ?? club.join_mode, ['open', 'invite'] as const, 'join mode');
  const colors = c.body.primary ? { primary: hexColor(c.body.primary, 'primary colour'), secondary: hexColor(c.body.secondary, 'secondary colour') } : club.colors;
  const badge = c.body.shape !== undefined ? { shape: Math.max(0, Math.min(3, Number(c.body.shape) | 0)), icon: Math.max(0, Math.min(5, Number(c.body.icon) | 0)) } : club.badge;
  const code = c.body.newCode ? inviteCode() : club.invite_code;
  await c.db.query('UPDATE clubs SET join_mode = $2, colors = $3, badge = $4, invite_code = $5 WHERE id = $1', [club.id, joinMode, JSON.stringify(colors), JSON.stringify(badge), code]);
  return { ok: true, inviteCode: code };
});

route('POST', '/api/clubs/:id/role', async (c) => {
  const p = await myPlayer(c);
  const club = await getClub(c.db, c.params[0]);
  if (p.club_id !== club.id || !can(p.club_role, 'roles')) throw forbidden('Only the founder or president can assign roles');
  const role = oneOf(c.body.role, ['president', 'coach', 'captain', 'player'] as const, 'role');
  const target = (await c.db.query<PlayerRow>('SELECT * FROM players WHERE id = $1 AND club_id = $2 AND NOT is_bot', [c.body.playerId, club.id]))[0];
  if (!target) throw notFound('Member not found');
  if (target.id === p.id) throw bad('You cannot change your own role');
  const myRank = RANK[p.club_role as Role];
  if (RANK[target.club_role as Role] >= myRank || RANK[role] >= myRank) throw forbidden('You can only manage roles below your own');
  if (role === 'president' || role === 'captain') {
    // One president and one captain at a time.
    await c.db.query("UPDATE players SET club_role = 'player' WHERE club_id = $1 AND club_role = $2", [club.id, role]);
  }
  await c.db.query('UPDATE players SET club_role = $2 WHERE id = $1', [target.id, role]);
  return { ok: true };
});

route('POST', '/api/clubs/:id/kick', async (c) => {
  const p = await myPlayer(c);
  const club = await getClub(c.db, c.params[0]);
  if (p.club_id !== club.id || !can(p.club_role, 'kick')) throw forbidden('Only the founder or president can remove members');
  const target = (await c.db.query<PlayerRow>('SELECT * FROM players WHERE id = $1 AND club_id = $2 AND NOT is_bot', [c.body.playerId, club.id]))[0];
  if (!target) throw notFound('Member not found');
  if (RANK[target.club_role as Role] >= RANK[p.club_role as Role]) throw forbidden('You can only remove members below your role');
  await c.db.tx(async (db) => {
    await db.query("UPDATE players SET club_id = NULL, club_role = 'player' WHERE id = $1", [target.id]);
    await db.query('INSERT INTO notifications (id, player_id, kind, text) VALUES ($1, $2, $3, $4)', [newId('n_'), target.id, 'club', `You were removed from ${club.name}.`]);
    await syncSquad(db, club);
  });
  return { ok: true };
});

route('POST', '/api/clubs/:id/friendly', async (c) => {
  const p = await myPlayer(c);
  const club = await getClub(c.db, c.params[0]);
  if (p.club_id !== club.id || !can(p.club_role, 'friendly')) throw forbidden('Only club staff or the captain can arrange friendlies');
  const opp = await getClub(c.db, String(c.body.opponentId ?? ''));
  if (opp.id === club.id || !opp.active) throw bad('Pick another club');
  if (club.last_friendly_at && Date.now() - new Date(club.last_friendly_at).getTime() < FRIENDLY_COOLDOWN_MIN * 60_000) {
    throw bad(`Your club can arrange a friendly every ${FRIENDLY_COOLDOWN_MIN} minutes`);
  }
  const busy = await c.db.query(
    "SELECT 1 FROM matches WHERE (home_id = ANY($1::text[]) OR away_id = ANY($1::text[])) AND status <> 'final' AND kickoff_at <= now() + interval '15 minutes' AND (ends_at IS NULL OR ends_at > now())",
    [[club.id, opp.id]],
  );
  if (busy.length) throw bad('One of the clubs is playing soon — try again after the match');
  const id = newId('m_');
  const kickoff = new Date(Date.now() + 20_000);
  await c.db.query("UPDATE clubs SET last_friendly_at = now() WHERE id = $1", [club.id]);
  await c.db.query(
    "INSERT INTO matches (id, kind, home_id, away_id, kickoff_at, seed) VALUES ($1, 'friendly', $2, $3, $4, $5)",
    [id, club.id, opp.id, kickoff.toISOString(), hashSeed(id) & 0x7fffffff],
  );
  return { id };
});

route('GET', '/api/league', async (c) => {
  const season = await currentSeason(c.db);
  if (!season) return { season: null };
  const table = await standings(c.db, season.id);
  const matches = (await c.db.query<MatchListRow>(`${MATCH_SELECT} WHERE m.season_id = $1 ORDER BY m.round, m.kickoff_at`, [season.id])).map(matchDto);
  const leaders = async (order: string, where = '') =>
    c.db.query<{ player_id: string; name: string; position: string; is_bot: boolean; club_id: string; club: string; v: string; apps: string }>(
      `SELECT s.player_id, p.name, p.position, p.is_bot, s.club_id, cl.short club, ${order} v, count(*) apps
       FROM player_match_stats s JOIN players p ON p.id = s.player_id JOIN clubs cl ON cl.id = s.club_id
       WHERE s.season_id = $1 AND s.kind = 'league' ${where}
       GROUP BY s.player_id, p.name, p.position, p.is_bot, s.club_id, cl.short
       HAVING ${order} > 0 ORDER BY v DESC, apps ASC LIMIT 8`,
      [season.id],
    );
  const map = (rows: Awaited<ReturnType<typeof leaders>>) => rows.map((r) => ({ playerId: r.player_id, name: r.name, position: r.position, isBot: r.is_bot, clubId: r.club_id, club: r.club, value: Math.round(+r.v * 100) / 100, apps: +r.apps }));
  return {
    season: { id: season.id, number: season.number },
    table,
    matches,
    scorers: map(await leaders('sum(s.goals)')),
    assists: map(await leaders('sum(s.assists)')),
    keepers: map(await leaders("sum(CASE WHEN s.clean_sheet THEN 1 ELSE 0 END)", "AND p.position = 'GK'")),
  };
});

route('GET', '/api/matches/:id', async (c) => {
  const rows = await c.db.query<MatchListRow & { lineups: [LineupSnapshot, LineupSnapshot] | null; result: MatchResult | null; season_id: string | null }>(
    `SELECT m.lineups, m.result, m.season_id, ${MATCH_SELECT.replace('SELECT', '')} WHERE m.id = $1`,
    [c.params[0]],
  );
  const m = rows[0];
  if (!m) throw notFound('Match not found');
  const dto = matchDto(m);
  const now = Date.now();
  if (!m.result || !m.lineups) return { match: dto, serverNow: now, ready: false };
  const res = m.result;
  const kickoff = new Date(m.kickoff_at).getTime();
  const elapsed = (now - kickoff) / 1000;
  const finished = dto.status === 'finished';
  // Only events that have "happened" in real time are sent while live.
  let revealed = res.events.length;
  if (!finished) {
    revealed = 0;
    while (revealed < res.events.length && realAt(res.events[revealed].t, res.timeline) <= elapsed) revealed++;
  }
  const since = Math.max(0, Math.min(revealed, Number(c.query.get('since')) || 0));
  return {
    match: dto,
    ready: true,
    serverNow: now,
    kickoffAt: kickoff,
    halftimeAt: res.halftimeAt,
    duration: res.duration,
    timeline: res.timeline,
    lineups: m.lineups,
    events: res.events.slice(since, revealed),
    from: since,
    revealed,
    finished,
    stats: finished ? res.stats : undefined,
    players: finished ? res.players : undefined,
    motm: finished ? res.motm : undefined,
  };
});

route('GET', '/api/players/:id', async (c) => {
  const p = (await c.db.query<PlayerRow>('SELECT * FROM players WHERE id = $1', [c.params[0]]))[0];
  if (!p) throw notFound('Player not found');
  const club = p.club_id ? await getClub(c.db, p.club_id) : null;
  const recent = await c.db.query<{ match_id: string; goals: number; assists: number; rating: number; kickoff_at: Date; home: string; away: string; hg: number; ag: number; club_id: string; home_id: string }>(
    `SELECT s.match_id, s.goals, s.assists, s.rating, m.kickoff_at, h.short home, a.short away, m.home_goals hg, m.away_goals ag, s.club_id, m.home_id
     FROM player_match_stats s JOIN matches m ON m.id = s.match_id JOIN clubs h ON h.id = m.home_id JOIN clubs a ON a.id = m.away_id
     WHERE s.player_id = $1 ORDER BY m.kickoff_at DESC LIMIT 10`,
    [p.id],
  );
  return {
    player: { ...playerDto(p), createdAt: new Date(p.created_at).toISOString() },
    club: club ? clubBrief(club) : null,
    career: await careerTotals(c.db, p.id),
    recent: recent.map((r) => ({ matchId: r.match_id, goals: r.goals, assists: r.assists, rating: r.rating, at: new Date(r.kickoff_at).toISOString(), label: `${r.home} ${r.hg}–${r.ag} ${r.away}` })),
  };
});

// ---------- entry ----------

export async function handleApi(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const secure = (req.headers['x-forwarded-proto'] ?? '') === 'https';
  try {
    if (!hasDatabaseConfig()) throw new HttpError(503, 'The game server is not connected to a database yet.');
    const db = await getDb();
    const method = req.method ?? 'GET';
    for (const [m, re, h] of routes) {
      if (m !== method) continue;
      const match = url.pathname.match(re);
      if (!match) continue;
      // Keep the world moving on every request (cheap when nothing is due).
      await tick(db).catch((e) => console.error('tick failed', e));
      const ctx: Ctx = { db, req, res, user: await currentUser(db, req), body: await readJson(req), params: match.slice(1).map(decodeURIComponent), query: url.searchParams, secure };
      if (method !== 'GET' && !sameOrigin(req)) throw forbidden('Cross-site request blocked');
      const out = await h(ctx);
      return sendJson(res, 200, out);
    }
    throw notFound('Unknown endpoint');
  } catch (e) {
    if (e instanceof HttpError) return sendJson(res, e.status, { error: e.message });
    console.error(e);
    return sendJson(res, 500, { error: 'Something went wrong on the server' });
  }
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === (req.headers['x-forwarded-host'] ?? req.headers.host);
  } catch {
    return false;
  }
}
