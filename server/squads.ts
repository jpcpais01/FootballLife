import type { Badge } from '../shared/badge.ts';
import { generateAttributes, overall, POSITIONS, STARTING_LEVEL, type Attributes, type Position } from '../shared/attributes.ts';
import { randomAppearance } from '../shared/appearance.ts';
import { getFormation, roleFit } from '../shared/formations.ts';
import { hashSeed, Rng } from '../shared/rng.ts';
import type { Db } from './db.ts';
import { newId } from './http.ts';
import { FIRST_NAMES, LAST_NAMES } from './names.ts';

export interface PlayerRow {
  id: string;
  user_id: string | null;
  club_id: string | null;
  club_role: string;
  is_bot: boolean;
  name: string;
  position: Position;
  shirt: number;
  appearance: Record<string, number>;
  attrs: Attributes;
  xp: Partial<Record<string, number>>;
  coins: number;
  last_train_at: Date | null;
  created_at: Date;
  equipped: Record<string, string>;
  motto: string;
  train_count: number;
  home: Record<string, unknown>;
  transfer_status: string;
  transfer_note: string;
}

export interface ClubRow {
  id: string;
  name: string;
  short: string;
  colors: { primary: string; secondary: string };
  badge: Badge;
  is_bot: boolean;
  founder_user_id: string | null;
  join_mode: 'open' | 'invite';
  invite_code: string;
  formation: string;
  tactics: Record<string, string>;
  lineup: Record<string, string>;
  bench_size: number;
  level: number;
  active: boolean;
  last_friendly_at: Date | null;
  created_at: Date;
}

/** Squad shape the bots fill toward: enough cover in every position. */
const SQUAD_TEMPLATE: Position[] = ['GK', 'GK', 'CB', 'CB', 'CB', 'FB', 'FB', 'FB', 'DM', 'CM', 'CM', 'CM', 'AM', 'WG', 'WG', 'WG', 'ST', 'ST'];

export function botName(rng: Rng): string {
  return `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
}

export async function clubPlayers(db: Db, clubId: string): Promise<PlayerRow[]> {
  return db.query<PlayerRow>('SELECT * FROM players WHERE club_id = $1 ORDER BY is_bot, created_at', [clubId]);
}

/**
 * Bot level for a club: anchored to the league baseline and pulled toward
 * the club's human average, but never above the humans — recruiting real
 * people should always be the better upgrade.
 */
export function botLevelFor(clubLevel: number, humans: PlayerRow[]): number {
  if (!humans.length) return clubLevel;
  const avg = humans.reduce((s, p) => s + overall(p.attrs, p.position), 0) / humans.length;
  return Math.round(Math.min(avg - 1, 0.5 * avg + 0.5 * clubLevel));
}

function freeShirt(taken: Set<number>, pos: Position): number {
  const pref: Record<Position, number[]> = {
    GK: [1, 12, 13, 99], CB: [4, 5, 3, 15, 24], FB: [2, 3, 22, 26], DM: [6, 16, 18], CM: [8, 14, 20],
    AM: [10, 19, 21], WG: [7, 11, 17, 27], ST: [9, 23, 29, 30],
  };
  for (const n of pref[pos]) if (!taken.has(n)) return n;
  for (let n = 2; n < 100; n++) if (!taken.has(n)) return n;
  return 0;
}

export async function makeBot(db: Db, clubId: string, pos: Position, level: number, taken: Set<number>, seedKey: string) {
  const rng = new Rng(hashSeed(seedKey));
  const id = newId('p_');
  const lvl = level + Math.round(rng.range(-3, 3));
  const shirt = freeShirt(taken, pos);
  taken.add(shirt);
  await db.query(
    'INSERT INTO players (id, club_id, is_bot, name, position, shirt, appearance, attrs) VALUES ($1, $2, true, $3, $4, $5, $6, $7)',
    [id, clubId, botName(rng), pos, shirt, JSON.stringify(randomAppearance(() => rng.next())), JSON.stringify(generateAttributes(pos, lvl, seedKey, 6))],
  );
}

/**
 * Tops up a club's squad with bots so it can always field a full side, and
 * trims surplus bots once humans fill their places.
 */
export async function syncSquad(db: Db, club: ClubRow) {
  const players = await clubPlayers(db, club.id);
  const humans = players.filter((p) => !p.is_bot);
  const bots = players.filter((p) => p.is_bot);
  const target = Math.max(11 + club.bench_size, SQUAD_TEMPLATE.length);
  const level = botLevelFor(club.level, humans);
  const taken = new Set(players.map((p) => p.shirt));

  // Needs per position from the template, minus what humans already cover.
  const need = new Map<Position, number>();
  for (const pos of SQUAD_TEMPLATE) need.set(pos, (need.get(pos) ?? 0) + 1);
  for (const h of humans) need.set(h.position, (need.get(h.position) ?? 0) - 1);

  // Remove bots in positions now covered by humans (weakest first), and any over capacity.
  const byPos = new Map<Position, PlayerRow[]>();
  for (const b of bots) byPos.set(b.position, [...(byPos.get(b.position) ?? []), b]);
  const remove: string[] = [];
  for (const pos of POSITIONS) {
    const list = (byPos.get(pos) ?? []).sort((a, b) => overall(a.attrs, a.position) - overall(b.attrs, b.position));
    let excess = list.length - Math.max(0, need.get(pos) ?? 0);
    while (excess-- > 0 && list.length) remove.push(list.shift()!.id);
    byPos.set(pos, list);
  }
  if (remove.length) {
    await db.query('UPDATE players SET club_id = NULL WHERE id = ANY($1::text[])', [remove]);
  }
  // Add bots for missing positions.
  let count = players.length - remove.length;
  let i = 0;
  for (const pos of POSITIONS) {
    const have = (byPos.get(pos) ?? []).length;
    const missing = Math.max(0, (need.get(pos) ?? 0) - have);
    for (let k = 0; k < missing && count < target; k++, count++) {
      await makeBot(db, club.id, pos, level, taken, `${club.id}:${pos}:${Date.now()}:${i++}`);
    }
  }
  // Always guarantee at least one goalkeeper and 11 bodies.
  const fresh = await clubPlayers(db, club.id);
  if (!fresh.some((p) => p.position === 'GK')) await makeBot(db, club.id, 'GK', level, taken, `${club.id}:gk:${Date.now()}`);
  for (let k = fresh.length; k < 11; k++) await makeBot(db, club.id, 'CM', level, taken, `${club.id}:fill:${k}:${Date.now()}`);
}

export interface LineupEntry {
  slotId: string;
  role: Position;
  player: PlayerRow;
}

/**
 * Resolves the starting XI: honours the coach's picks where valid and fills
 * gaps with the best available fit. Humans get a small preference on ties.
 */
export function resolveLineup(club: ClubRow, players: PlayerRow[]): { xi: LineupEntry[]; bench: PlayerRow[] } {
  const formation = getFormation(club.formation);
  const byId = new Map(players.map((p) => [p.id, p]));
  const used = new Set<string>();
  const xi: (LineupEntry | null)[] = formation.slots.map((slot) => {
    const pid = club.lineup?.[slot.id];
    const p = pid ? byId.get(pid) : undefined;
    if (p && !used.has(p.id)) {
      used.add(p.id);
      return { slotId: slot.id, role: slot.role, player: p };
    }
    return null;
  });
  // Fill empty slots: GK first, then the rest in formation order.
  const order = formation.slots.map((_, i) => i).sort((a, b) => (formation.slots[a].role === 'GK' ? -1 : 0) - (formation.slots[b].role === 'GK' ? -1 : 0));
  for (const i of order) {
    if (xi[i]) continue;
    const slot = formation.slots[i];
    let best: PlayerRow | null = null;
    let bs = -Infinity;
    for (const p of players) {
      if (used.has(p.id)) continue;
      const s = overall(p.attrs, p.position) * roleFit(p.position, slot.role) + (p.is_bot ? 0 : 1.5);
      if (s > bs) {
        bs = s;
        best = p;
      }
    }
    if (best) {
      used.add(best.id);
      xi[i] = { slotId: slot.id, role: slot.role, player: best };
    }
  }
  const bench = players
    .filter((p) => !used.has(p.id))
    .sort((a, b) => overall(b.attrs, b.position) - overall(a.attrs, a.position))
    .slice(0, club.bench_size);
  return { xi: xi.filter((x): x is LineupEntry => !!x), bench };
}

export function clubStrength(players: PlayerRow[], club: ClubRow): number {
  const { xi } = resolveLineup(club, players);
  if (!xi.length) return 0;
  return Math.round(xi.reduce((s, e) => s + overall(e.player.attrs, e.player.position) * roleFit(e.player.position, e.role), 0) / xi.length);
}

export { STARTING_LEVEL };
