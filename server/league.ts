import { overall, type Attr, type Position } from '../shared/attributes.ts';
import { KICKOFF_HOURS_UTC, LEAGUE_SIZE, MATCH_COINS, POINTS } from '../shared/config.ts';
import { totalReal } from '../shared/timeline.ts';
import { getFormation, sanitizeTactics, type Tactics } from '../shared/formations.ts';
import { hashSeed, Rng } from '../shared/rng.ts';
import { simulateMatch } from '../shared/sim/engine.ts';
import type { MatchResult, SimTeam } from '../shared/sim/types.ts';
import type { Db } from './db.ts';
import { newId } from './http.ts';
import { BOT_CLUBS } from './names.ts';
import { matchXp } from './progression.ts';
import { clubPlayers, resolveLineup, STARTING_LEVEL, syncSquad, type ClubRow, type PlayerRow } from './squads.ts';

// ---------- schedule helpers ----------

/** The next `n` kickoff slots strictly after `from`. */
export function kickoffSlots(from: Date, n: number): Date[] {
  const out: Date[] = [];
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const hours = [...KICKOFF_HOURS_UTC].sort((a, b) => a - b);
  while (out.length < n) {
    for (const h of hours) {
      const slot = new Date(d.getTime() + h * 3600_000);
      if (slot > from && out.length < n) out.push(slot);
    }
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Double round-robin (circle method). Returns rounds of [home, away] pairs. */
export function roundRobin(ids: string[]): [string, string][][] {
  const list = [...ids];
  if (list.length % 2) list.push('BYE');
  const n = list.length;
  const rounds: [string, string][][] = [];
  for (let r = 0; r < n - 1; r++) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = list[i];
      const b = list[n - 1 - i];
      if (a === 'BYE' || b === 'BYE') continue;
      pairs.push(r % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    list.splice(1, 0, list.pop()!);
  }
  const second = rounds.map((rd) => rd.map(([h, a]) => [a, h] as [string, string]));
  return [...rounds, ...second];
}

// ---------- world bootstrap ----------

export async function createBotClub(db: Db, index: number, level: number): Promise<string> {
  const used = await db.query<{ name_lc: string }>('SELECT name_lc FROM clubs');
  const taken = new Set(used.map((r) => r.name_lc));
  let tpl = BOT_CLUBS[index % BOT_CLUBS.length];
  let name = tpl.name;
  for (let k = 0; taken.has(name.toLowerCase()); k++) {
    tpl = BOT_CLUBS[(index + k + 1) % BOT_CLUBS.length];
    name = k >= BOT_CLUBS.length ? `${tpl.name} ${k}` : tpl.name;
  }
  const id = newId('c_');
  const formations = ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '4-1-4-1', '5-3-2'];
  const rng = new Rng(hashSeed(id));
  const tactics = {
    mentality: rng.pick(['balanced', 'balanced', 'attacking', 'defensive']),
    tempo: rng.pick(['normal', 'patient', 'direct']),
    pressing: rng.pick(['medium', 'high', 'low']),
    width: rng.pick(['normal', 'wide', 'narrow']),
  };
  await db.query(
    `INSERT INTO clubs (id, name, name_lc, short, colors, badge, is_bot, invite_code, formation, tactics, level)
     VALUES ($1, $2, $3, $4, $5, $6, true, $7, $8, $9, $10)`,
    [id, name, name.toLowerCase(), tpl.short, JSON.stringify({ primary: tpl.primary, secondary: tpl.secondary }), JSON.stringify({ shape: tpl.shape, icon: tpl.icon }), newId(), rng.pick(formations), JSON.stringify(tactics), level],
  );
  const club = (await db.query<ClubRow>('SELECT * FROM clubs WHERE id = $1', [id]))[0];
  await syncSquad(db, club);
  return id;
}

export async function currentSeason(db: Db) {
  const rows = await db.query<{ id: string; number: number; status: string; starts_at: Date }>(
    "SELECT * FROM seasons WHERE status = 'active' ORDER BY number DESC LIMIT 1",
  );
  return rows[0] ?? null;
}

async function claim(db: Db, key: string): Promise<boolean> {
  const r = await db.query("INSERT INTO meta (key, value) VALUES ($1, 'true') ON CONFLICT (key) DO NOTHING RETURNING key", [key]);
  return r.length > 0;
}

export async function ensureWorld(db: Db) {
  if (await currentSeason(db)) return;
  const any = await db.query('SELECT 1 FROM seasons LIMIT 1');
  if (any.length) return; // between seasons; tick handles rollover
  if (!(await claim(db, 'bootstrap'))) return;
  const ids: string[] = [];
  for (let i = 0; i < LEAGUE_SIZE; i++) {
    const level = STARTING_LEVEL - 4 + Math.round((i / (LEAGUE_SIZE - 1)) * 8);
    ids.push(await createBotClub(db, i, level));
  }
  await createSeason(db, 1, ids, new Date());
}

export async function createSeason(db: Db, number: number, clubIds: string[], after: Date) {
  const id = newId('s_');
  const rounds = roundRobin(clubIds);
  const slots = kickoffSlots(after, rounds.length);
  await db.query('INSERT INTO seasons (id, number, starts_at) VALUES ($1, $2, $3)', [id, number, slots[0].toISOString()]);
  for (const c of clubIds) await db.query('INSERT INTO season_clubs (season_id, club_id) VALUES ($1, $2)', [id, c]);
  for (let r = 0; r < rounds.length; r++) {
    for (const [h, a] of rounds[r]) {
      await db.query(
        'INSERT INTO matches (id, season_id, kind, round, home_id, away_id, kickoff_at, seed) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [newId('m_'), id, 'league', r + 1, h, a, slots[r].toISOString(), hashSeed(`${id}:${r}:${h}:${a}`) & 0x7fffffff],
      );
    }
  }
  return id;
}

/**
 * Places a newly created human club into the league: it takes over an AI
 * club's place (and remaining fixtures) in the current season, or joins the
 * next season when every place is already human.
 */
export async function placeNewClub(db: Db, clubId: string): Promise<'joined' | 'queued'> {
  const season = await currentSeason(db);
  if (!season) return 'queued';
  const bots = await db.query<{ id: string }>(
    `SELECT c.id FROM season_clubs sc JOIN clubs c ON c.id = sc.club_id
     WHERE sc.season_id = $1 AND c.is_bot ORDER BY c.level ASC, c.created_at DESC LIMIT 1`,
    [season.id],
  );
  if (!bots.length) return 'queued';
  const botId = bots[0].id;
  await db.query("UPDATE matches SET home_id = $1 WHERE season_id = $2 AND home_id = $3 AND status = 'scheduled'", [clubId, season.id, botId]);
  await db.query("UPDATE matches SET away_id = $1 WHERE season_id = $2 AND away_id = $3 AND status = 'scheduled'", [clubId, season.id, botId]);
  await db.query('DELETE FROM season_clubs WHERE season_id = $1 AND club_id = $2', [season.id, botId]);
  await db.query('INSERT INTO season_clubs (season_id, club_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [season.id, clubId]);
  await db.query('UPDATE clubs SET active = false WHERE id = $1', [botId]);
  return 'joined';
}

// ---------- match processing ----------

export interface LineupSnapshot {
  clubId: string;
  name: string;
  short: string;
  colors: { primary: string; secondary: string };
  badge: { shape: number; icon: number };
  formation: string;
  tactics: Tactics;
  players: { id: string; name: string; number: number; pos: Position; role: Position; slot: string; ovr: number; bot: boolean; app: Record<string, number> }[];
}

export function buildTeam(club: ClubRow, players: PlayerRow[]): { team: SimTeam; snap: LineupSnapshot } {
  const { xi } = resolveLineup(club, players);
  const formation = getFormation(club.formation);
  // Order by formation slot so index 0 is the goalkeeper.
  const ordered = formation.slots.map((s) => xi.find((e) => e.slotId === s.id)!).filter(Boolean);
  const tactics = sanitizeTactics(club.tactics as never);
  const team: SimTeam = {
    clubId: club.id,
    name: club.name,
    short: club.short,
    colors: club.colors,
    formation: formation.name,
    tactics,
    players: ordered.map((e) => ({
      id: e.player.id,
      name: e.player.name,
      number: e.player.shirt,
      natural: e.player.position,
      slotId: e.slotId,
      role: e.role,
      attrs: e.player.attrs,
      bot: e.player.is_bot,
    })),
  };
  const snap: LineupSnapshot = {
    clubId: club.id,
    name: club.name,
    short: club.short,
    colors: club.colors,
    badge: club.badge,
    formation: formation.name,
    tactics,
    players: ordered.map((e) => ({
      id: e.player.id,
      name: e.player.name,
      number: e.player.shirt,
      pos: e.player.position,
      role: e.role,
      slot: e.slotId,
      ovr: overall(e.player.attrs, e.player.position),
      bot: e.player.is_bot,
      app: e.player.appearance,
    })),
  };
  return { team, snap };
}

interface MatchRow {
  id: string;
  season_id: string | null;
  kind: 'league' | 'friendly';
  round: number | null;
  home_id: string;
  away_id: string;
  kickoff_at: Date;
  status: 'scheduled' | 'played' | 'final';
  seed: number;
  home_goals: number | null;
  away_goals: number | null;
  ends_at: Date | null;
  lineups: [LineupSnapshot, LineupSnapshot] | null;
  result: MatchResult | null;
}

async function loadClub(db: Db, id: string) {
  return (await db.query<ClubRow>('SELECT * FROM clubs WHERE id = $1', [id]))[0];
}

async function playMatch(db: Db, m: MatchRow) {
  const [home, away] = await Promise.all([loadClub(db, m.home_id), loadClub(db, m.away_id)]);
  if (home.is_bot || !(await clubPlayers(db, home.id)).length) await syncSquad(db, home);
  if (away.is_bot || !(await clubPlayers(db, away.id)).length) await syncSquad(db, away);
  const [hp, ap] = await Promise.all([clubPlayers(db, home.id), clubPlayers(db, away.id)]);
  const h = buildTeam(home, hp);
  const a = buildTeam(away, ap);
  const result = simulateMatch(h.team, a.team, m.seed, { homeAdvantage: m.kind === 'friendly' ? 0 : undefined });
  const endsAt = new Date(new Date(m.kickoff_at).getTime() + totalReal(result.timeline) * 1000);
  const r = await db.query(
    `UPDATE matches SET status = 'played', home_goals = $2, away_goals = $3, ends_at = $4, lineups = $5, result = $6
     WHERE id = $1 AND status = 'scheduled' RETURNING id`,
    [m.id, result.score[0], result.score[1], endsAt.toISOString(), JSON.stringify([h.snap, a.snap]), JSON.stringify(result)],
  );
  return r.length > 0;
}

async function notify(db: Db, playerId: string, kind: string, text: string, data: Record<string, unknown> = {}) {
  await db.query('INSERT INTO notifications (id, player_id, kind, text, data) VALUES ($1, $2, $3, $4, $5)', [newId('n_'), playerId, kind, text, JSON.stringify(data)]);
}

async function finalizeMatch(db: Db, m: MatchRow) {
  const claimed = await db.query("UPDATE matches SET status = 'final' WHERE id = $1 AND status = 'played' RETURNING id", [m.id]);
  if (!claimed.length || !m.result || !m.lineups) return;
  const res = m.result;
  const official = m.kind === 'league';
  for (let side = 0; side < 2; side++) {
    const snap = m.lineups[side];
    const gf = res.score[side];
    const ga = res.score[1 - side];
    const outcome = gf > ga ? 'win' : gf === ga ? 'draw' : 'loss';
    for (let i = 0; i < snap.players.length; i++) {
      const sp = snap.players[i];
      const line = res.players[side * 11 + i];
      await db.query(
        `INSERT INTO player_match_stats (match_id, player_id, club_id, season_id, kind, goals, assists, shots, saves, tackles, clean_sheet, rating)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT DO NOTHING`,
        [m.id, sp.id, snap.clubId, m.season_id, m.kind, line.goals, line.assists, line.shots, line.saves, line.tackles, ga === 0, line.rating],
      );
      if (sp.bot) continue;
      const rows = await db.query<PlayerRow>('SELECT * FROM players WHERE id = $1', [sp.id]);
      const p = rows[0];
      if (!p) continue;
      const opp = m.lineups[1 - side].name;
      const score = `${gf}–${ga}`;
      if (official) {
        const coins = MATCH_COINS[outcome] + line.goals * MATCH_COINS.goal + line.assists * MATCH_COINS.assist;
        const xpRes = matchXp(p.position, p.attrs, p.xp as Partial<Record<Attr, number>>, line.rating, (m.seed + i) >>> 0);
        await db.query('UPDATE players SET coins = coins + $2, attrs = $3, xp = $4 WHERE id = $1', [p.id, coins, JSON.stringify(xpRes.attrs), JSON.stringify(xpRes.xp)]);
        const ups = xpRes.levelUps.length ? ` Level up: ${[...new Set(xpRes.levelUps.map((u) => u.attr))].join(', ')}.` : '';
        await notify(db, p.id, 'result', `${outcome === 'win' ? 'Win' : outcome === 'draw' ? 'Draw' : 'Defeat'} vs ${opp} (${score}). Rating ${line.rating.toFixed(1)}, +${coins} coins.${ups}`, { matchId: m.id });
      } else {
        await notify(db, p.id, 'result', `Friendly vs ${opp} finished ${score}. Rating ${line.rating.toFixed(1)}.`, { matchId: m.id });
      }
    }
  }
}

async function maybeRollSeason(db: Db) {
  const season = await currentSeason(db);
  if (!season) return;
  const open = await db.query("SELECT 1 FROM matches WHERE season_id = $1 AND status <> 'final' LIMIT 1", [season.id]);
  if (open.length) return;
  if (!(await claim(db, `season-end-${season.number}`))) return;
  const table = await standings(db, season.id);
  for (let i = 0; i < table.length; i++) {
    await db.query('UPDATE season_clubs SET final_pos = $3 WHERE season_id = $1 AND club_id = $2', [season.id, table[i].clubId, i + 1]);
    const reward = [600, 400, 280][i] ?? 120;
    const humans = await db.query<{ id: string }>('SELECT id FROM players WHERE club_id = $1 AND NOT is_bot', [table[i].clubId]);
    for (const h of humans) {
      await db.query('UPDATE players SET coins = coins + $2 WHERE id = $1', [h.id, reward]);
      await notify(db, h.id, 'season', `Season ${season.number} is over: your club finished ${ordinal(i + 1)}. +${reward} coins.${i === 0 ? ' Champions!' : ''}`);
    }
  }
  await db.query("UPDATE seasons SET status = 'finished', ended_at = now() WHERE id = $1", [season.id]);

  // Next season: every active human club (by last finish), then AI clubs to fill.
  const humanClubs = await db.query<{ id: string }>(
    `SELECT c.id FROM clubs c LEFT JOIN season_clubs sc ON sc.club_id = c.id AND sc.season_id = $1
     WHERE c.active AND NOT c.is_bot ORDER BY sc.final_pos NULLS LAST, c.created_at`,
    [season.id],
  );
  let ids = humanClubs.map((r) => r.id);
  const size = Math.max(LEAGUE_SIZE, ids.length + (ids.length % 2));
  if (ids.length < size) {
    const bots = await db.query<{ id: string }>('SELECT id FROM clubs WHERE active AND is_bot ORDER BY created_at LIMIT $1', [size - ids.length]);
    ids = ids.concat(bots.map((b) => b.id));
    for (let i = ids.length; i < size; i++) ids.push(await createBotClub(db, i, STARTING_LEVEL));
  }
  // Refresh AI squads around the league's current level.
  const humanOvr = await db.query<{ attrs: never; position: Position }>('SELECT attrs, position FROM players WHERE NOT is_bot AND club_id IS NOT NULL');
  const avg = humanOvr.length ? humanOvr.reduce((s, p) => s + overall(p.attrs, p.position), 0) / humanOvr.length : STARTING_LEVEL;
  for (const id of ids) {
    const c = await loadClub(db, id);
    if (c.is_bot) {
      const level = Math.round(Math.min(avg, STARTING_LEVEL + (season.number) * 2) + (Math.random() * 6 - 3));
      await db.query('UPDATE clubs SET level = $2 WHERE id = $1', [id, level]);
      await db.query('UPDATE players SET club_id = NULL WHERE club_id = $1 AND is_bot', [id]);
      await syncSquad(db, { ...c, level });
    }
  }
  await createSeason(db, season.number + 1, ids, new Date(Date.now() + 2 * 3600_000));
}

function ordinal(n: number) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

let lastTick = 0;

/**
 * Advances the world: simulates matches whose kickoff has passed, finalizes
 * matches that have finished playing out live, and rolls seasons over. It is
 * idempotent and safe to call from concurrent requests.
 */
export async function tick(db: Db, force = false) {
  const now = Date.now();
  if (!force && now - lastTick < 4000) return;
  lastTick = now;
  await ensureWorld(db);
  const due = await db.query<MatchRow>("SELECT * FROM matches WHERE status = 'scheduled' AND kickoff_at <= now() ORDER BY kickoff_at LIMIT 12");
  for (const m of due) await playMatch(db, m);
  const done = await db.query<MatchRow>("SELECT * FROM matches WHERE status = 'played' AND ends_at <= now() ORDER BY ends_at LIMIT 20");
  for (const m of done) await finalizeMatch(db, m);
  if (done.length) await maybeRollSeason(db);
}

// ---------- standings ----------

export interface StandingRow {
  clubId: string;
  name: string;
  short: string;
  colors: { primary: string; secondary: string };
  badge: { shape: number; icon: number };
  isBot: boolean;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  points: number;
  form: string[];
}

export async function standings(db: Db, seasonId: string): Promise<StandingRow[]> {
  const clubs = await db.query<ClubRow>('SELECT c.* FROM season_clubs sc JOIN clubs c ON c.id = sc.club_id WHERE sc.season_id = $1', [seasonId]);
  const rows = new Map<string, StandingRow>();
  for (const c of clubs) {
    rows.set(c.id, { clubId: c.id, name: c.name, short: c.short, colors: c.colors, badge: c.badge, isBot: c.is_bot, played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, points: 0, form: [] });
  }
  const ms = await db.query<{ home_id: string; away_id: string; home_goals: number; away_goals: number }>(
    "SELECT home_id, away_id, home_goals, away_goals FROM matches WHERE season_id = $1 AND kind = 'league' AND status = 'final' ORDER BY kickoff_at",
    [seasonId],
  );
  for (const m of ms) {
    for (const [id, gf, ga] of [[m.home_id, m.home_goals, m.away_goals], [m.away_id, m.away_goals, m.home_goals]] as [string, number, number][]) {
      const r = rows.get(id);
      if (!r) continue;
      r.played++;
      r.gf += gf;
      r.ga += ga;
      if (gf > ga) { r.won++; r.points += POINTS.win; r.form.push('W'); }
      else if (gf === ga) { r.drawn++; r.points += POINTS.draw; r.form.push('D'); }
      else { r.lost++; r.points += POINTS.loss; r.form.push('L'); }
    }
  }
  const list = [...rows.values()];
  for (const r of list) r.form = r.form.slice(-5);
  list.sort((a, b) => b.points - a.points || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf || a.name.localeCompare(b.name));
  return list;
}

