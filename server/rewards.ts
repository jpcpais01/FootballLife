// Coins, items, achievements and notifications.
import { ACH_BY_ID, earnedNow, type AchStats } from '../shared/achievements.ts';
import { overall } from '../shared/attributes.ts';
import { ITEM_BY_ID } from '../shared/cosmetics.ts';
import { HOUSES } from '../shared/life.ts';
import type { Db } from './db.ts';
import { newId } from './http.ts';
import type { PlayerRow } from './squads.ts';

export async function notify(db: Db, playerId: string, kind: string, text: string, data: Record<string, unknown> = {}) {
  await db.query('INSERT INTO notifications (id, player_id, kind, text, data) VALUES ($1, $2, $3, $4, $5)', [newId('n_'), playerId, kind, text, JSON.stringify(data)]);
}

/** Gives an item if the player does not already own it. Returns true when newly granted. */
export async function grantItem(db: Db, playerId: string, itemId: string, source: string, price = 0): Promise<boolean> {
  if (!ITEM_BY_ID[itemId]) return false;
  const r = await db.query('INSERT INTO inventory (player_id, item_id, source, price) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING item_id', [playerId, itemId, source, price]);
  return r.length > 0;
}

export async function achStats(db: Db, p: PlayerRow): Promise<AchStats> {
  const [s] = await db.query<Record<string, string | null>>(
    `SELECT count(*) apps, coalesce(sum(goals),0) goals, coalesce(sum(assists),0) assists,
       coalesce(sum(CASE WHEN clean_sheet THEN 1 ELSE 0 END),0) cs, coalesce(sum(saves),0) saves,
       coalesce(sum(CASE WHEN outcome = 'W' THEN 1 ELSE 0 END),0) wins,
       coalesce(sum(CASE WHEN motm THEN 1 ELSE 0 END),0) motm,
       coalesce(max(goals),0) best_goals, coalesce(max(rating),0) best_rating
     FROM player_match_stats WHERE player_id = $1 AND kind = 'league'`,
    [p.id],
  );
  const [inv] = await db.query<{ n: string }>('SELECT count(*) n FROM inventory WHERE player_id = $1', [p.id]);
  const [tr] = await db.query<{ titles: string; awards: string; cups: string }>(
    "SELECT coalesce(sum(CASE WHEN kind = 'champion' THEN 1 ELSE 0 END),0) titles, coalesce(sum(CASE WHEN kind = 'cup' THEN 1 ELSE 0 END),0) cups, coalesce(sum(CASE WHEN kind IN ('golden_boot','playmaker','golden_glove','pots') THEN 1 ELSE 0 END),0) awards FROM trophies WHERE player_id = $1",
    [p.id],
  );
  const [life] = await db.query<{ houses: string; cars: string; memo: string }>(
    `SELECT (SELECT count(*) FROM life_items WHERE player_id = $1 AND item_id IN (${HOUSES.filter((h) => h.price > 0).map((h) => `'${h.id}'`).join(',')})) houses,
       (SELECT count(*) FROM life_items WHERE player_id = $1 AND item_id LIKE 'car-%') cars,
       (SELECT count(*) FROM collectibles WHERE player_id = $1) memo`,
    [p.id],
  );
  const founded = p.user_id ? (await db.query('SELECT 1 FROM clubs WHERE founder_user_id = $1 LIMIT 1', [p.user_id])).length > 0 || p.club_role === 'founder' : false;
  return {
    apps: +s.apps!, goals: +s.goals!, assists: +s.assists!, cleanSheets: +s.cs!, saves: +s.saves!, wins: +s.wins!, motm: +s.motm!,
    bestMatchGoals: +s.best_goals!, bestRating: Math.round(+s.best_rating! * 10) / 10,
    trainCount: p.train_count ?? 0, ovr: overall(p.attrs, p.position), inClub: !!p.club_id, founded,
    owned: +inv.n, titles: +tr.titles, cups: +tr.cups, awards: +tr.awards,
    houses: +life.houses, cars: +life.cars, memorabilia: +life.memo,
  };
}

/**
 * Awards any achievements the player has newly reached. Idempotent: each one
 * is inserted once, and its coins and items are only paid on that insert.
 */
export async function checkAchievements(db: Db, playerId: string): Promise<string[]> {
  const p = (await db.query<PlayerRow>('SELECT * FROM players WHERE id = $1 AND NOT is_bot', [playerId]))[0];
  if (!p) return [];
  const have = new Set((await db.query<{ ach_id: string }>('SELECT ach_id FROM player_achievements WHERE player_id = $1', [p.id])).map((r) => r.ach_id));
  const fresh: string[] = [];
  // Owning items can itself unlock achievements, so loop until nothing changes.
  for (let pass = 0; pass < 3; pass++) {
    const stats = await achStats(db, p);
    const due = earnedNow(stats).filter((id) => !have.has(id));
    if (!due.length) break;
    for (const id of due) {
      have.add(id);
      const r = await db.query('INSERT INTO player_achievements (player_id, ach_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING ach_id', [p.id, id]);
      if (!r.length) continue;
      const a = ACH_BY_ID[id];
      fresh.push(id);
      if (a.coins) await db.query('UPDATE players SET coins = coins + $2 WHERE id = $1', [p.id, a.coins]);
      const item = a.item && (await grantItem(db, p.id, a.item, 'achievement')) ? ITEM_BY_ID[a.item] : null;
      const extra = [a.coins ? `+${a.coins} coins` : '', item ? `unlocked ${item.name}` : ''].filter(Boolean).join(', ');
      await notify(db, p.id, 'achievement', `Achievement unlocked: ${a.name}.${extra ? ` ${extra[0].toUpperCase()}${extra.slice(1)}.` : ''}`, { ach: id });
    }
  }
  return fresh;
}
