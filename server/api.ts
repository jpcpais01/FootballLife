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
import { drillMultiplier, trainingSession, TRAINING_FOCI, type TrainingFocus } from './progression.ts';
import { clubPlayers, clubStrength, resolveLineup, syncSquad, type ClubRow, type PlayerRow } from './squads.ts';
import { ACHIEVEMENTS, ACH_BY_ID } from '../shared/achievements.ts';
import { featured, ITEM_BY_ID, ITEMS, priceOf, sanitizeEquipped, shopDay, SLOTS, type Slot } from '../shared/cosmetics.ts';
import { achStats, checkAchievements, notify } from './rewards.ts';
import { CHAT_MAX, clubMessage, defaultShirt, leaveClub, MAX_HUMANS, moveToClub, notifyStaff } from './social.ts';
import { CAR_BY_ID, CAR_COLORS, DEFAULT_HOME, FLOOR_STYLES, FURNITURE, FURNITURE_BY_ID, FURNITURE_SLOTS, HOUSE_BY_ID, HOUSES, RESPRAY_COST, sanitizeHome, WALL_COLORS, type FurnitureSlot } from '../shared/life.ts';

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
    equipped: p.is_bot ? {} : sanitizeEquipped(p.equipped),
    motto: p.motto ?? '',
    transferOpen: p.transfer_status === 'open',
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
  home_goals: number | null; away_goals: number | null; pens: [number, number] | null; meta: { stage?: number; total?: number; tie?: number; name?: string } | null;
  h_id: string; h_name: string; h_short: string; h_colors: never; h_badge: never; h_bot: boolean;
  a_id: string; a_name: string; a_short: string; a_colors: never; a_badge: never; a_bot: boolean;
}

const MATCH_SELECT = `
  SELECT m.id, m.kind, m.round, m.kickoff_at, m.ends_at, m.status, m.home_goals, m.away_goals, m.pens, m.meta,
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
    pens: status === 'finished' ? m.pens : null,
    cup: m.kind === 'cup' && m.meta?.name ? { stage: m.meta.stage, total: m.meta.total, tie: m.meta.tie, name: m.meta.name } : undefined,
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
  const club = p?.club_id ? (await c.db.query<ClubRow>('SELECT * FROM clubs WHERE id = $1', [p.club_id]))[0] : null;
  const unread = p ? +((await c.db.query<{ n: string }>('SELECT count(*) n FROM notifications WHERE player_id = $1 AND NOT read', [p.id]))[0].n) : 0;
  // The club's live or next match, for the menu's match tile.
  let match: { id: string; live: boolean; kickoffAt: string } | null = null;
  if (club) {
    const ms = await c.db.query<{ id: string; status: string; kickoff_at: Date; ends_at: Date | null }>(
      "SELECT id, status, kickoff_at, ends_at FROM matches WHERE (home_id = $1 OR away_id = $1) AND status <> 'final' ORDER BY kickoff_at LIMIT 3",
      [club.id],
    );
    const m = ms.find((x) => matchStatus(x) !== 'finished');
    if (m) match = { id: m.id, live: matchStatus(m) === 'live', kickoffAt: new Date(m.kickoff_at).toISOString() };
  }
  return { user: c.user, club: club ? clubBrief(club) : null, unread, match, trainReady: p ? trainingInfo(p).ready : false, player: p ? { ...playerDto(p), coins: p.coins } : null, invites: p && !p.club_id ? (await myInvites(c.db, p.id)).filter((i) => i.kind === 'invite').length : 0 };
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
  // The drill score scales the session: 0.8× for a botched drill up to 1.3× for a perfect one.
  const perf = drillMultiplier(c.body.score as number | undefined);
  const res = trainingSession(p.position, p.attrs, p.xp as Partial<Record<Attr, number>>, focus, streak, perf);
  const updated = await c.db.query(
    'UPDATE players SET attrs = $2, xp = $3, last_train_at = now(), train_count = train_count + 1 WHERE id = $1 AND (last_train_at IS NULL OR last_train_at = $4) RETURNING id',
    [p.id, JSON.stringify(res.attrs), JSON.stringify(res.xp), p.last_train_at],
  );
  if (!updated.length) throw bad('Training already in progress');
  const achievements = await checkAchievements(c.db, p.id);
  return { achievements, levelUps: res.levelUps, xp: res.xp, attrs: res.attrs, ovr: overall(res.attrs, p.position), streak: streak > 0, perf };
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
  let cupTie: ReturnType<typeof matchDto> | null = null;
  if (p.club_id) {
    const cl = await getClub(c.db, p.club_id);
    const players = await clubPlayers(c.db, cl.id);
    club = { ...clubBrief(cl), role: p.club_role, strength: clubStrength(players, cl), humans: players.filter((x) => !x.is_bot).length, size: players.length };
    const ms = (await c.db.query<MatchListRow>(`${MATCH_SELECT} WHERE (m.home_id = $1 OR m.away_id = $1) ORDER BY m.kickoff_at`, [cl.id])).map(matchDto);
    live = ms.find((m) => m.status === 'live') ?? null;
    next = ms.find((m) => m.status === 'scheduled') ?? null;
    recent = ms.filter((m) => m.status === 'finished').slice(-5).reverse();
    cupTie = ms.filter((m) => m.kind === 'cup').pop() ?? null;
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
    invites: p.club_id ? [] : await myInvites(c.db, p.id),
    cupTie,
    life: {
      tier: homeOf(p).tier,
      cars: +((await c.db.query<{ n: string }>("SELECT count(*) n FROM life_items WHERE player_id = $1 AND item_id LIKE 'car-%'", [p.id]))[0].n),
      memorabilia: +((await c.db.query<{ n: string }>('SELECT count(*) n FROM collectibles WHERE player_id = $1', [p.id]))[0].n),
      trophies: +((await c.db.query<{ n: string }>('SELECT count(*) n FROM trophies WHERE player_id = $1', [p.id]))[0].n),
    },
    shop: { ...featured(shopDay()) },
    market: { vacancies: +((await c.db.query<{ n: string }>('SELECT count(*) n FROM vacancies v JOIN clubs cl ON cl.id = v.club_id WHERE v.active AND cl.active AND NOT cl.is_bot'))[0].n) },
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
    await clubMessage(db, id, `${p.name} founded ${name}`);
    return placeNewClub(db, id);
  });
  await checkAchievements(c.db, p.id);
  return { id, placement };
});

function inviteCode() {
  return newId().slice(0, 8).toUpperCase().replace(/[^A-Z0-9]/g, 'X');
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
  const trophies = await c.db.query<{ kind: string; season_number: number; value: number | null }>(
    'SELECT kind, season_number, value FROM trophies WHERE club_id = $1 AND player_id IS NULL ORDER BY season_number DESC', [club.id]);
  const history = await c.db.query<{ number: number; final_pos: number }>(
    "SELECT s.number, sc.final_pos FROM season_clubs sc JOIN seasons s ON s.id = sc.season_id WHERE sc.club_id = $1 AND sc.final_pos IS NOT NULL ORDER BY s.number DESC", [club.id]);
  const staffView = can(myRole, 'invite');
  const pending = staffView ? await inviteDtos(c.db, await c.db.query<InviteRow>("SELECT * FROM club_invites WHERE club_id = $1 AND status = 'pending' ORDER BY created_at DESC", [club.id])) : [];
  const myPending = me && !me.club_id ? (await c.db.query<{ id: string; kind: string }>("SELECT id, kind FROM club_invites WHERE club_id = $1 AND player_id = $2 AND status = 'pending'", [club.id, me.id]))[0] ?? null : null;
  return {
    trophies: trophies.map((t) => ({ kind: t.kind, season: t.season_number, value: t.value })),
    history: history.map((h) => ({ season: h.number, pos: h.final_pos })),
    requests: pending.filter((x) => x.kind === 'request'),
    invitesOut: pending.filter((x) => x.kind === 'invite'),
    myPending,
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
  if (p.club_id && p.transfer_status !== 'open') throw bad('Leave your current club first, or make yourself open to transfers');
  const club = await getClub(c.db, c.params[0]);
  if (club.is_bot || !club.active) throw bad('AI clubs cannot be joined — create your own club or join a player club');
  const code = String(c.body.code ?? '').trim().toUpperCase();
  if (club.join_mode === 'invite' && code !== club.invite_code) {
    // An accepted invite also lets you in.
    const inv = await c.db.query("SELECT 1 FROM club_invites WHERE club_id = $1 AND player_id = $2 AND kind = 'invite' AND status = 'pending'", [club.id, p.id]);
    if (!inv.length) throw bad('This club is invite-only. Ask a member for the invite code, or send a join request.');
  }
  await c.db.tx((db) => moveToClub(db, p, club));
  await checkAchievements(c.db, p.id);
  return { ok: true };
});

route('POST', '/api/clubs/leave', async (c) => {
  const p = await myPlayer(c);
  if (!p.club_id) throw bad('You are not in a club');
  await c.db.tx((db) => leaveClub(db, p));
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
  await clubMessage(c.db, club.id, `${target.name} is now ${role === 'player' ? 'a player' : `the ${role}`}`);
  await notify(c.db, target.id, 'club', `Your role at ${club.name} is now ${role}.`);
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
    await notify(db, target.id, 'club', `You were removed from ${club.name}.`);
    await clubMessage(db, club.id, `${target.name} was removed from the club`);
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
  const all = (await c.db.query<MatchListRow>(`${MATCH_SELECT} WHERE m.season_id = $1 ORDER BY m.round, m.kickoff_at`, [season.id])).map(matchDto);
  const matches = all.filter((m) => m.kind === 'league');
  const cupTies = all.filter((m) => m.kind === 'cup').sort((a, b) => a.cup!.stage! - b.cup!.stage! || a.cup!.tie! - b.cup!.tie!);
  const byes = (await c.db.query<{ value: { byes: string[] } }>('SELECT value FROM meta WHERE key = $1', [`cup-byes:${season.id}`]))[0]?.value.byes ?? [];
  const byeClubs = byes.length ? await c.db.query<ClubRow>('SELECT * FROM clubs WHERE id = ANY($1::text[])', [byes]) : [];
  const cupTotal = cupTies[0]?.cup?.total ?? 0;
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
  const past = await c.db.query<{ season_number: number; kind: string; value: number | null; club: string | null; club_id: string | null; player: string | null; player_id: string | null }>(
    `SELECT t.season_number, t.kind, t.value, cl.name club, t.club_id, p.name player, t.player_id FROM trophies t
     LEFT JOIN clubs cl ON cl.id = t.club_id LEFT JOIN players p ON p.id = t.player_id
     WHERE (t.player_id IS NULL AND t.kind IN ('champion','cup')) OR t.kind IN ('golden_boot','playmaker','golden_glove','pots')
     ORDER BY t.season_number DESC LIMIT 50`);
  const honours = new Map<number, Record<string, unknown>>();
  for (const t of past) {
    const h = honours.get(t.season_number) ?? { season: t.season_number };
    h[t.kind] = { club: t.club, clubId: t.club_id, player: t.player, playerId: t.player_id, value: t.value };
    honours.set(t.season_number, h);
  }
  return {
    honours: [...honours.values()],
    season: { id: season.id, number: season.number },
    table,
    matches,
    cup: cupTies.length ? { total: cupTotal, ties: cupTies, byes: byes.map((id) => byeClubs.find((b) => b.id === id)).filter(Boolean).map((b) => clubBrief(b!)) } : null,
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
    pens: finished ? res.pens : undefined,
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
  const trophies = await c.db.query<{ kind: string; season_number: number; value: number | null; club_id: string | null; short: string | null }>(
    'SELECT t.kind, t.season_number, t.value, t.club_id, cl.short FROM trophies t LEFT JOIN clubs cl ON cl.id = t.club_id WHERE t.player_id = $1 ORDER BY t.season_number DESC', [p.id]);
  const earned = await c.db.query<{ ach_id: string; earned_at: Date }>('SELECT ach_id, earned_at FROM player_achievements WHERE player_id = $1', [p.id]);
  const mine = !!c.user && p.user_id === c.user.id;
  let progress: Record<string, [number, number]> | undefined;
  if (mine) {
    const st = await achStats(c.db, p);
    progress = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a.progress(st)]));
  }
  return {
    trophies: trophies.map((t) => ({ kind: t.kind, season: t.season_number, value: t.value, club: t.short })),
    achievements: earned.filter((e) => ACH_BY_ID[e.ach_id]).map((e) => ({ id: e.ach_id, at: new Date(e.earned_at).toISOString() })),
    progress,
    player: { ...playerDto(p), createdAt: new Date(p.created_at).toISOString() },
    club: club ? clubBrief(club) : null,
    career: await careerTotals(c.db, p.id),
    recent: recent.map((r) => ({ matchId: r.match_id, goals: r.goals, assists: r.assists, rating: r.rating, at: new Date(r.kickoff_at).toISOString(), label: `${r.home} ${r.hg}–${r.ag} ${r.away}` })),
  };
});

// ---------- profile ----------

route('POST', '/api/player/profile', async (c) => {
  const p = await myPlayer(c);
  const motto = String(c.body.motto ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
  await c.db.query('UPDATE players SET motto = $2 WHERE id = $1', [p.id, motto]);
  return { ok: true, motto };
});

// ---------- shop & locker ----------

async function ownedIds(db: Db, playerId: string) {
  return new Set((await db.query<{ item_id: string }>('SELECT item_id FROM inventory WHERE player_id = $1', [playerId])).map((r) => r.item_id));
}

route('GET', '/api/shop', async (c) => {
  const p = await myPlayer(c);
  const day = shopDay();
  const f = featured(day);
  const owned = await ownedIds(c.db, p.id);
  const club = p.club_id ? await getClub(c.db, p.club_id) : null;
  return {
    kit: club ? club.colors : { primary: '#1d2329', secondary: '#c6ff3d' },
    shirt: p.shirt,
    coins: p.coins,
    featured: f.ids,
    deal: f.deal,
    prices: Object.fromEntries(ITEMS.map((i) => [i.id, priceOf(i, day)])),
    nextRotation: new Date((day + 1) * 86_400_000).toISOString(),
    owned: [...owned],
    equipped: sanitizeEquipped(p.equipped, owned),
  };
});

route('POST', '/api/shop/buy', async (c) => {
  const p = await myPlayer(c);
  const item = ITEM_BY_ID[String(c.body.itemId ?? '')];
  if (!item) throw notFound('Item not found');
  const price = priceOf(item);
  if (price <= 0) throw bad(`${item.name} cannot be bought. ${item.source ?? ''}`.trim());
  const coins = await c.db.tx(async (db) => {
    const have = await db.query('SELECT 1 FROM inventory WHERE player_id = $1 AND item_id = $2', [p.id, item.id]);
    if (have.length) throw bad('You already own this');
    const r = await db.query<{ coins: number }>('UPDATE players SET coins = coins - $2 WHERE id = $1 AND coins >= $2 RETURNING coins', [p.id, price]);
    if (!r.length) throw bad('Not enough coins');
    await db.query("INSERT INTO inventory (player_id, item_id, source, price) VALUES ($1, $2, 'shop', $3)", [p.id, item.id, price]);
    return r[0].coins;
  });
  const achievements = await checkAchievements(c.db, p.id);
  return { ok: true, coins, achievements };
});

route('POST', '/api/locker/equip', async (c) => {
  const p = await myPlayer(c);
  const slot = oneOf(c.body.slot, SLOTS, 'slot') as Slot;
  const itemId = c.body.itemId == null ? null : String(c.body.itemId);
  const owned = await ownedIds(c.db, p.id);
  const eq = sanitizeEquipped(p.equipped, owned);
  if (itemId) {
    if (ITEM_BY_ID[itemId]?.slot !== slot) throw bad('That item does not go there');
    if (!owned.has(itemId)) throw bad('You do not own that item');
    eq[slot] = itemId;
  } else delete eq[slot];
  await c.db.query('UPDATE players SET equipped = $2 WHERE id = $1', [p.id, JSON.stringify(eq)]);
  return { ok: true, equipped: eq };
});

// ---------- invites & join requests ----------

interface InviteRow { id: string; club_id: string; player_id: string; kind: 'invite' | 'request'; from_player_id: string | null; status: string; created_at: Date }

async function inviteDtos(db: Db, rows: InviteRow[]) {
  const out = [];
  for (const r of rows) {
    const club = (await db.query<ClubRow>('SELECT * FROM clubs WHERE id = $1', [r.club_id]))[0];
    const player = (await db.query<PlayerRow>('SELECT * FROM players WHERE id = $1', [r.player_id]))[0];
    const from = r.from_player_id ? (await db.query<{ name: string }>('SELECT name FROM players WHERE id = $1', [r.from_player_id]))[0] : null;
    if (!club || !player) continue;
    out.push({ id: r.id, kind: r.kind, at: new Date(r.created_at).toISOString(), club: clubBrief(club), player: playerDto(player, false), from: from?.name ?? null });
  }
  return out;
}

async function myInvites(db: Db, playerId: string) {
  const rows = await db.query<InviteRow>("SELECT * FROM club_invites WHERE player_id = $1 AND status = 'pending' ORDER BY created_at DESC", [playerId]);
  return inviteDtos(db, rows);
}

route('GET', '/api/invites', async (c) => {
  const p = await myPlayer(c);
  return { invites: await myInvites(c.db, p.id) };
});

route('GET', '/api/free-agents', async (c) => {
  await myPlayer(c);
  const q = `%${String(c.query.get('q') ?? '').trim().toLowerCase().replace(/[%_]/g, '')}%`;
  const rows = await c.db.query<PlayerRow>('SELECT * FROM players WHERE NOT is_bot AND club_id IS NULL AND lower(name) LIKE $1 ORDER BY created_at DESC LIMIT 12', [q]);
  return { players: rows.map((r) => playerDto(r, false)) };
});

route('POST', '/api/clubs/:id/request', async (c) => {
  const p = await myPlayer(c);
  const club = await getClub(c.db, c.params[0]);
  if (p.club_id === club.id) throw bad('You are already in this club');
  if (p.club_id && p.transfer_status !== 'open') throw bad('Make yourself open to transfers first, or leave your current club');
  if (club.is_bot || !club.active) throw bad('AI clubs cannot be joined');
  const dup = await c.db.query("SELECT 1 FROM club_invites WHERE club_id = $1 AND player_id = $2 AND status = 'pending'", [club.id, p.id]);
  if (dup.length) throw bad('You already have a pending request or invite for this club');
  const open = await c.db.query("SELECT count(*) n FROM club_invites WHERE player_id = $1 AND kind = 'request' AND status = 'pending'", [p.id]);
  if (+(open[0] as { n: string }).n >= 5) throw bad('You can have at most 5 open requests');
  const id = newId('i_');
  await c.db.query("INSERT INTO club_invites (id, club_id, player_id, kind) VALUES ($1, $2, $3, 'request')", [id, club.id, p.id]);
  await notifyStaff(c.db, club.id, CAN.invite, `${p.name} (${p.position}, ${overall(p.attrs, p.position)} OVR) asked to join ${club.name}.`, { clubId: club.id });
  return { ok: true, id };
});

route('POST', '/api/clubs/:id/invite', async (c) => {
  const p = await myPlayer(c);
  const club = await getClub(c.db, c.params[0]);
  if (p.club_id !== club.id || !can(p.club_role, 'invite')) throw forbidden('Only the founder, president or captain can invite players');
  const target = (await c.db.query<PlayerRow>('SELECT * FROM players WHERE id = $1 AND NOT is_bot', [String(c.body.playerId ?? '')]))[0];
  if (!target) throw notFound('Player not found');
  if (target.club_id === club.id) throw bad(`${target.name} is already in your club`);
  if (target.club_id && target.transfer_status !== 'open') throw bad(`${target.name} is already in a club and not open to transfers`);
  const pending = (await c.db.query<InviteRow>("SELECT * FROM club_invites WHERE club_id = $1 AND player_id = $2 AND status = 'pending'", [club.id, target.id]))[0];
  if (pending?.kind === 'request') {
    // They already asked: inviting them is the same as accepting.
    await c.db.tx(async (db) => {
      await db.query("UPDATE club_invites SET status = 'accepted', resolved_at = now() WHERE id = $1", [pending.id]);
      await moveToClub(db, target, club);
    });
    await notify(c.db, target.id, 'club', `Welcome to ${club.name}! Your request was accepted.`, { clubId: club.id });
    await checkAchievements(c.db, target.id);
    return { ok: true, joined: true };
  }
  if (pending) throw bad(`${target.name} already has an invite from your club`);
  await c.db.query("INSERT INTO club_invites (id, club_id, player_id, kind, from_player_id) VALUES ($1, $2, $3, 'invite', $4)", [newId('i_'), club.id, target.id, p.id]);
  await notify(c.db, target.id, 'invite', `${p.name} invited you to join ${club.name}.`, { clubId: club.id });
  return { ok: true };
});

route('POST', '/api/invites/:id/respond', async (c) => {
  const p = await myPlayer(c);
  const inv = (await c.db.query<InviteRow>("SELECT * FROM club_invites WHERE id = $1 AND status = 'pending'", [c.params[0]]))[0];
  if (!inv) throw notFound('This invite is no longer open');
  const club = await getClub(c.db, inv.club_id);
  const accept = c.body.accept === true;
  if (inv.kind === 'invite') {
    if (inv.player_id !== p.id) throw forbidden();
    if (accept) {
      if (p.club_id && p.transfer_status !== 'open') throw bad('Leave your current club first, or make yourself open to transfers');
      await c.db.tx(async (db) => {
        await db.query("UPDATE club_invites SET status = 'accepted', resolved_at = now() WHERE id = $1", [inv.id]);
        await moveToClub(db, p, club);
      });
      await checkAchievements(c.db, p.id);
    } else {
      await c.db.query("UPDATE club_invites SET status = 'declined', resolved_at = now() WHERE id = $1", [inv.id]);
    }
    return { ok: true, clubId: accept ? club.id : null };
  }
  // A join request: club staff decide.
  if (p.club_id !== club.id || !can(p.club_role, 'invite')) throw forbidden('Only the founder, president or captain can answer requests');
  const target = (await c.db.query<PlayerRow>('SELECT * FROM players WHERE id = $1', [inv.player_id]))[0];
  if (accept) {
    await c.db.tx(async (db) => {
      await db.query("UPDATE club_invites SET status = 'accepted', resolved_at = now() WHERE id = $1", [inv.id]);
      await moveToClub(db, target, club);
    });
    await notify(c.db, target.id, 'club', `Welcome to ${club.name}! Your request was accepted.`, { clubId: club.id });
    await checkAchievements(c.db, target.id);
  } else {
    await c.db.query("UPDATE club_invites SET status = 'declined', resolved_at = now() WHERE id = $1", [inv.id]);
    await notify(c.db, target.id, 'club', `${club.name} turned down your request this time.`, { clubId: club.id });
  }
  return { ok: true };
});

route('POST', '/api/invites/:id/cancel', async (c) => {
  const p = await myPlayer(c);
  const inv = (await c.db.query<InviteRow>("SELECT * FROM club_invites WHERE id = $1 AND status = 'pending'", [c.params[0]]))[0];
  if (!inv) throw notFound('This invite is no longer open');
  const mine = inv.kind === 'request' && inv.player_id === p.id;
  const staff = inv.kind === 'invite' && p.club_id === inv.club_id && can(p.club_role, 'invite');
  if (!mine && !staff) throw forbidden();
  await c.db.query("UPDATE club_invites SET status = 'cancelled', resolved_at = now() WHERE id = $1", [inv.id]);
  return { ok: true };
});

route('GET', '/api/join/:code', async (c) => {
  const code = c.params[0].trim().toUpperCase();
  const club = (await c.db.query<ClubRow>('SELECT * FROM clubs WHERE invite_code = $1 AND active AND NOT is_bot', [code]))[0];
  if (!club) throw notFound('This invite link is not valid any more');
  const players = await clubPlayers(c.db, club.id);
  return { club: { ...clubBrief(club), strength: clubStrength(players, club), humans: players.filter((x) => !x.is_bot).length, maxHumans: MAX_HUMANS }, code };
});

// ---------- club chat ----------

async function chatAccess(c: Ctx) {
  const p = await myPlayer(c);
  const club = await getClub(c.db, c.params[0]);
  if (p.club_id !== club.id) throw forbidden('Only club members can see the chat');
  return { p, club };
}

route('GET', '/api/clubs/:id/chat', async (c) => {
  const { club } = await chatAccess(c);
  const after = c.query.get('after');
  const rows = await c.db.query<{ id: string; player_id: string | null; kind: string; text: string; data: Record<string, unknown>; created_at: Date; name: string | null; appearance: never; equipped: never; club_role: string | null }>(
    `SELECT * FROM (SELECT m.*, p.name, p.appearance, p.equipped, p.club_role FROM club_messages m LEFT JOIN players p ON p.id = m.player_id
       WHERE m.club_id = $1 ${after ? 'AND m.created_at > $2' : ''} ORDER BY m.created_at DESC LIMIT 60) x ORDER BY created_at`,
    after ? [club.id, after] : [club.id],
  );
  return {
    messages: rows.map((m) => ({
      id: m.id, kind: m.kind, text: m.text, data: m.data, at: new Date(m.created_at).toISOString(),
      author: m.player_id ? { id: m.player_id, name: m.name, role: m.club_role, appearance: sanitizeAppearance(m.appearance), equipped: sanitizeEquipped(m.equipped) } : null,
    })),
  };
});

const lastChat = new Map<string, number>();

route('POST', '/api/clubs/:id/chat', async (c) => {
  const { p, club } = await chatAccess(c);
  const text = String(c.body.text ?? '').replace(/[\u0000-\u0008\u000B-\u001F]/g, '').trim();
  if (!text) throw bad('Write something first');
  if (text.length > CHAT_MAX) throw bad(`Keep it under ${CHAT_MAX} characters`);
  const now = Date.now();
  if (now - (lastChat.get(p.id) ?? 0) < 1200) throw bad('Slow down a little');
  const recent = await c.db.query("SELECT 1 FROM club_messages WHERE player_id = $1 AND created_at > now() - interval '1 second'", [p.id]);
  if (recent.length) throw bad('Slow down a little');
  lastChat.set(p.id, now);
  const id = newId('cm_');
  await c.db.query("INSERT INTO club_messages (id, club_id, player_id, kind, text) VALUES ($1, $2, $3, 'msg', $4)", [id, club.id, p.id, text]);
  return { ok: true, id };
});

// ---------- home, garage & memorabilia ----------

interface LifeRow { item_id: string; data: { color?: string }; price: number; acquired_at: Date }

async function lifeItems(db: Db, playerId: string) {
  return db.query<LifeRow>('SELECT item_id, data, price, acquired_at FROM life_items WHERE player_id = $1 ORDER BY acquired_at', [playerId]);
}

function homeOf(p: PlayerRow) {
  return sanitizeHome(Object.keys(p.home ?? {}).length ? p.home : DEFAULT_HOME);
}

function ownedLife(rows: LifeRow[]) {
  const houses = new Set(['studio']);
  const furniture = new Set(FURNITURE.filter((f) => f.price === 0).map((f) => f.id));
  const cars: { id: string; color: string; at: string }[] = [];
  for (const r of rows) {
    if (HOUSE_BY_ID[r.item_id]) houses.add(r.item_id);
    else if (FURNITURE_BY_ID[r.item_id]) furniture.add(r.item_id);
    else if (CAR_BY_ID[r.item_id]) cars.push({ id: r.item_id, color: r.data.color ?? CAR_COLORS[0], at: new Date(r.acquired_at).toISOString() });
  }
  return { houses, furniture, cars };
}

route('GET', '/api/house/:id', async (c) => {
  const p = (await c.db.query<PlayerRow>('SELECT * FROM players WHERE id = $1 AND NOT is_bot', [c.params[0]]))[0];
  if (!p) throw notFound('Player not found');
  const owned = ownedLife(await lifeItems(c.db, p.id));
  const club = p.club_id ? await getClub(c.db, p.club_id) : null;
  const items = await c.db.query<{ id: string; kind: string; label: string; data: unknown; created_at: Date }>(
    'SELECT id, kind, label, data, created_at FROM collectibles WHERE player_id = $1 ORDER BY created_at DESC LIMIT 60', [p.id]);
  const trophies = await c.db.query<{ kind: string; season_number: number }>('SELECT kind, season_number FROM trophies WHERE player_id = $1 ORDER BY season_number DESC', [p.id]);
  const mine = !!c.user && p.user_id === c.user.id;
  return {
    mine,
    player: playerDto(p, false),
    club: club ? clubBrief(club) : null,
    coins: mine ? p.coins : undefined,
    home: homeOf(p),
    houses: [...owned.houses],
    furniture: [...owned.furniture],
    cars: owned.cars,
    collectibles: items.map((i) => ({ id: i.id, kind: i.kind, label: i.label, data: i.data, at: new Date(i.created_at).toISOString() })),
    trophies: trophies.map((t) => ({ kind: t.kind, season: t.season_number })),
  };
});

async function spend(db: Db, playerId: string, price: number) {
  const r = await db.query<{ coins: number }>('UPDATE players SET coins = coins - $2 WHERE id = $1 AND coins >= $2 RETURNING coins', [playerId, price]);
  if (!r.length) throw bad('Not enough coins');
  return r[0].coins;
}

route('POST', '/api/house/buy', async (c) => {
  const p = await myPlayer(c);
  const house = HOUSE_BY_ID[String(c.body.houseId ?? '')];
  if (!house) throw notFound('House not found');
  const owned = ownedLife(await lifeItems(c.db, p.id));
  const home = homeOf(p);
  let coins = p.coins;
  if (!owned.houses.has(house.id)) {
    coins = await c.db.tx(async (db) => {
      const left = await spend(db, p.id, house.price);
      await db.query('INSERT INTO life_items (player_id, item_id, price) VALUES ($1, $2, $3)', [p.id, house.id, house.price]);
      return left;
    });
  }
  // Buying a home also moves you in; owned homes can be moved back into for free.
  home.tier = house.id;
  await c.db.query('UPDATE players SET home = $2 WHERE id = $1', [p.id, JSON.stringify(home)]);
  const achievements = await checkAchievements(c.db, p.id);
  return { ok: true, coins, home, achievements };
});

route('POST', '/api/house/furniture', async (c) => {
  const p = await myPlayer(c);
  const f = FURNITURE_BY_ID[String(c.body.itemId ?? '')];
  if (!f) throw notFound('Item not found');
  const owned = ownedLife(await lifeItems(c.db, p.id));
  let coins = p.coins;
  if (!owned.furniture.has(f.id)) {
    coins = await c.db.tx(async (db) => {
      const left = await spend(db, p.id, f.price);
      await db.query('INSERT INTO life_items (player_id, item_id, price) VALUES ($1, $2, $3)', [p.id, f.id, f.price]);
      return left;
    });
  }
  const home = homeOf(p);
  home.furniture[f.slot] = f.id;
  await c.db.query('UPDATE players SET home = $2 WHERE id = $1', [p.id, JSON.stringify(home)]);
  return { ok: true, coins, home };
});

route('POST', '/api/house/arrange', async (c) => {
  const p = await myPlayer(c);
  const owned = ownedLife(await lifeItems(c.db, p.id));
  const home = homeOf(p);
  if (c.body.wall !== undefined) {
    const w = Number(c.body.wall);
    if (!Number.isInteger(w) || w < 0 || w >= WALL_COLORS.length) throw bad('Unknown wall colour');
    home.wall = w;
  }
  if (c.body.floor !== undefined) {
    const f = Number(c.body.floor);
    if (!Number.isInteger(f) || f < 0 || f >= FLOOR_STYLES.length) throw bad('Unknown floor');
    home.floor = f;
  }
  if (c.body.clear !== undefined) {
    const slot = oneOf(c.body.clear, FURNITURE_SLOTS, 'slot') as FurnitureSlot;
    delete home.furniture[slot];
  }
  if (c.body.itemId !== undefined) {
    const f = FURNITURE_BY_ID[String(c.body.itemId)];
    if (!f || !owned.furniture.has(f.id)) throw bad('You do not own that');
    home.furniture[f.slot] = f.id;
  }
  await c.db.query('UPDATE players SET home = $2 WHERE id = $1', [p.id, JSON.stringify(home)]);
  return { ok: true, home };
});

route('POST', '/api/garage/buy', async (c) => {
  const p = await myPlayer(c);
  const car = CAR_BY_ID[String(c.body.carId ?? '')];
  if (!car) throw notFound('Car not found');
  const color = String(c.body.color ?? CAR_COLORS[0]);
  if (!CAR_COLORS.includes(color)) throw bad('Pick one of the paint colours');
  const owned = ownedLife(await lifeItems(c.db, p.id));
  if (owned.cars.some((x) => x.id === car.id)) throw bad(`You already own a ${car.name}`);
  const home = homeOf(p);
  const space = HOUSE_BY_ID[home.tier].garage;
  if (owned.cars.length >= space) throw bad(`Your garage holds ${space} car${space === 1 ? '' : 's'}. Move somewhere bigger for more space.`);
  const coins = await c.db.tx(async (db) => {
    const left = await spend(db, p.id, car.price);
    await db.query('INSERT INTO life_items (player_id, item_id, price, data) VALUES ($1, $2, $3, $4)', [p.id, car.id, car.price, JSON.stringify({ color })]);
    return left;
  });
  if (!home.favCar) {
    home.favCar = car.id;
    await c.db.query('UPDATE players SET home = $2 WHERE id = $1', [p.id, JSON.stringify(home)]);
  }
  const achievements = await checkAchievements(c.db, p.id);
  return { ok: true, coins, achievements };
});

route('POST', '/api/garage/respray', async (c) => {
  const p = await myPlayer(c);
  const carId = String(c.body.carId ?? '');
  const color = String(c.body.color ?? '');
  if (!CAR_COLORS.includes(color)) throw bad('Pick one of the paint colours');
  const row = (await lifeItems(c.db, p.id)).find((r) => r.item_id === carId && CAR_BY_ID[carId]);
  if (!row) throw bad('You do not own that car');
  if (row.data.color === color) return { ok: true, coins: p.coins };
  const coins = await c.db.tx(async (db) => {
    const left = await spend(db, p.id, RESPRAY_COST);
    await db.query('UPDATE life_items SET data = $3 WHERE player_id = $1 AND item_id = $2', [p.id, carId, JSON.stringify({ ...row.data, color })]);
    return left;
  });
  return { ok: true, coins };
});

route('POST', '/api/garage/favourite', async (c) => {
  const p = await myPlayer(c);
  const carId = String(c.body.carId ?? '');
  const owned = ownedLife(await lifeItems(c.db, p.id));
  if (!owned.cars.some((x) => x.id === carId)) throw bad('You do not own that car');
  const home = homeOf(p);
  home.favCar = carId;
  await c.db.query('UPDATE players SET home = $2 WHERE id = $1', [p.id, JSON.stringify(home)]);
  return { ok: true, home };
});

route('GET', '/api/life/catalog', async () => ({ houses: HOUSES, furniture: FURNITURE }));

// ---------- transfer market ----------

interface VacancyRow { id: string; club_id: string; position: string; min_ovr: number; note: string; created_at: Date }

route('GET', '/api/transfers', async (c) => {
  const me = c.user ? (await c.db.query<PlayerRow>('SELECT * FROM players WHERE user_id = $1', [c.user.id]))[0] : undefined;
  const vac = await c.db.query<VacancyRow>(
    'SELECT v.* FROM vacancies v JOIN clubs cl ON cl.id = v.club_id WHERE v.active AND cl.active AND NOT cl.is_bot ORDER BY v.created_at DESC LIMIT 60');
  const clubs = new Map<string, ClubRow>();
  for (const v of vac) if (!clubs.has(v.club_id)) clubs.set(v.club_id, await getClub(c.db, v.club_id));
  const humans = new Map<string, number>();
  for (const id of clubs.keys()) humans.set(id, +((await c.db.query<{ n: string }>('SELECT count(*) n FROM players WHERE club_id = $1 AND NOT is_bot', [id]))[0].n));
  const avail = await c.db.query<PlayerRow>(
    "SELECT * FROM players WHERE NOT is_bot AND (club_id IS NULL OR transfer_status = 'open') ORDER BY created_at DESC LIMIT 80");
  const availClubs = new Map<string, ClubRow>();
  for (const a of avail) if (a.club_id && !availClubs.has(a.club_id)) availClubs.set(a.club_id, await getClub(c.db, a.club_id));
  const myClubVacancies = me?.club_id ? vac.filter((v) => v.club_id === me.club_id).map((v) => v.id) : [];
  return {
    me: me ? { id: me.id, clubId: me.club_id, open: me.transfer_status === 'open', note: me.transfer_note, canPost: !!me.club_id && can(me.club_role, 'invite'), position: me.position, ovr: overall(me.attrs, me.position) } : null,
    vacancies: vac.map((v) => ({
      id: v.id, position: v.position, minOvr: v.min_ovr, note: v.note, at: new Date(v.created_at).toISOString(),
      club: clubBrief(clubs.get(v.club_id)!), humans: humans.get(v.club_id) ?? 0, maxHumans: MAX_HUMANS, mine: myClubVacancies.includes(v.id),
    })),
    players: avail
      .map((a) => ({ ...playerDto(a, false), note: a.transfer_note, club: a.club_id ? clubBrief(availClubs.get(a.club_id)!) : null }))
      .sort((x, y) => y.ovr - x.ovr),
  };
});

route('POST', '/api/transfers/status', async (c) => {
  const p = await myPlayer(c);
  const open = c.body.open === true;
  if (open && !p.club_id) throw bad('Free agents are always on the market. Join a club first.');
  const note = String(c.body.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  await c.db.query('UPDATE players SET transfer_status = $2, transfer_note = $3 WHERE id = $1', [p.id, open ? 'open' : '', note]);
  if (p.club_id && open !== (p.transfer_status === 'open')) {
    await clubMessage(c.db, p.club_id, open ? `${p.name} is now open to offers from other clubs` : `${p.name} is staying put and off the transfer list`);
  }
  return { ok: true, open, note };
});

route('POST', '/api/clubs/:id/vacancies', async (c) => {
  const p = await myPlayer(c);
  const club = await getClub(c.db, c.params[0]);
  if (p.club_id !== club.id || !can(p.club_role, 'invite')) throw forbidden('Only the founder, president or captain can post vacancies');
  const position = oneOf(c.body.position, POSITIONS, 'position');
  const minOvr = Math.max(0, Math.min(99, Math.round(Number(c.body.minOvr) || 0)));
  const note = String(c.body.note ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const n = +((await c.db.query<{ n: string }>('SELECT count(*) n FROM vacancies WHERE club_id = $1 AND active', [club.id]))[0].n);
  if (n >= 3) throw bad('A club can have at most 3 open vacancies. Close one first.');
  const id = newId('v_');
  await c.db.query('INSERT INTO vacancies (id, club_id, position, min_ovr, note) VALUES ($1, $2, $3, $4, $5)', [id, club.id, position, minOvr, note]);
  await clubMessage(c.db, club.id, `${p.name} posted a vacancy: ${position}${minOvr ? `, ${minOvr}+ OVR` : ''}`);
  return { ok: true, id };
});

route('POST', '/api/vacancies/:id/close', async (c) => {
  const p = await myPlayer(c);
  const v = (await c.db.query<VacancyRow>('SELECT * FROM vacancies WHERE id = $1 AND active', [c.params[0]]))[0];
  if (!v) throw notFound('Vacancy not found');
  if (p.club_id !== v.club_id || !can(p.club_role, 'invite')) throw forbidden();
  await c.db.query('UPDATE vacancies SET active = false WHERE id = $1', [v.id]);
  return { ok: true };
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
      // Reads run alongside it so a page never waits for the tick; writes wait,
      // since they act on the state it brings up to date.
      const ticking = tick(db).catch((e) => console.error('tick failed', e));
      if (method !== 'GET') await ticking;
      const ctx: Ctx = { db, req, res, user: await currentUser(db, req), body: await readJson(req), params: match.slice(1).map(decodeURIComponent), query: url.searchParams, secure };
      if (method !== 'GET' && !sameOrigin(req)) throw forbidden('Cross-site request blocked');
      const out = await h(ctx).finally(() => ticking);
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
