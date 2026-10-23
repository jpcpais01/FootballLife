// Stars balance changes. Every change goes through here and is written to the
// ledger, so purchases, ad rewards and donations can be audited later.
import type { Db } from './db.ts';
import { newId } from './http.ts';

/** Adds stars; returns the new balance. */
export async function addStars(db: Db, playerId: string, n: number, reason: string): Promise<number> {
  const r = await db.query<{ stars: number }>('UPDATE players SET stars = stars + $2 WHERE id = $1 RETURNING stars', [playerId, n]);
  await db.query('INSERT INTO star_ledger (id, player_id, delta, reason) VALUES ($1, $2, $3, $4)', [newId('s_'), playerId, n, reason]);
  return r[0]?.stars ?? 0;
}

/** Spends stars if the player has enough; returns the new balance, or null when short. */
export async function spendStars(db: Db, playerId: string, n: number, reason: string): Promise<number | null> {
  const r = await db.query<{ stars: number }>('UPDATE players SET stars = stars - $2 WHERE id = $1 AND stars >= $2 RETURNING stars', [playerId, n]);
  if (!r.length) return null;
  await db.query('INSERT INTO star_ledger (id, player_id, delta, reason) VALUES ($1, $2, $3, $4)', [newId('s_'), playerId, -n, reason]);
  return r[0].stars;
}
