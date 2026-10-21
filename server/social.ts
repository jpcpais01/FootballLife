// Club membership changes, invites and the club chat.
import type { Db } from './db.ts';
import { bad, newId } from './http.ts';
import { notify } from './rewards.ts';
import { syncSquad, type ClubRow, type PlayerRow } from './squads.ts';

export const MAX_HUMANS = 23;
export const CHAT_MAX = 280;

export async function clubMessage(db: Db, clubId: string, text: string, data?: Record<string, unknown>) {
  await db.query("INSERT INTO club_messages (id, club_id, kind, text, data) VALUES ($1, $2, 'system', $3, $4)", [newId('cm_'), clubId, text, JSON.stringify(data ?? {})]);
}

export function defaultShirt(pos: string): number {
  return ({ GK: 1, CB: 4, FB: 2, DM: 6, CM: 8, AM: 10, WG: 7, ST: 9 } as Record<string, number>)[pos] ?? 14;
}

/** Puts a free agent into a club, taking their preferred shirt from a bot if needed. Run inside a transaction. */
export async function joinClub(db: Db, p: PlayerRow, club: ClubRow) {
  const fresh = (await db.query<PlayerRow>('SELECT * FROM players WHERE id = $1', [p.id]))[0];
  if (fresh.club_id) throw bad(`${fresh.name} is already in a club`);
  if (club.is_bot || !club.active) throw bad('AI clubs cannot be joined');
  const humans = await db.query('SELECT 1 FROM players WHERE club_id = $1 AND NOT is_bot', [club.id]);
  if (humans.length >= MAX_HUMANS) throw bad('This club is full');
  const shirts = new Set((await db.query<{ shirt: number }>('SELECT shirt FROM players WHERE club_id = $1', [club.id])).map((r) => r.shirt));
  let shirt = defaultShirt(p.position);
  const botWithShirt = (await db.query<{ id: string }>('SELECT id FROM players WHERE club_id = $1 AND is_bot AND shirt = $2', [club.id, shirt]))[0];
  if (shirts.has(shirt) && !botWithShirt) for (shirt = 14; shirts.has(shirt); shirt++);
  if (botWithShirt) {
    let free = 30;
    while (shirts.has(free)) free++;
    await db.query('UPDATE players SET shirt = $2 WHERE id = $1', [botWithShirt.id, free]);
  }
  await db.query("UPDATE players SET club_id = $2, club_role = 'player', shirt = $3 WHERE id = $1", [p.id, club.id, shirt]);
  // Any other pending invites or requests for this player are settled.
  await db.query("UPDATE club_invites SET status = 'cancelled', resolved_at = now() WHERE player_id = $1 AND status = 'pending'", [p.id]);
  await syncSquad(db, club);
  await clubMessage(db, club.id, `${p.name} joined the club`);
}

/** Players in a club allowed to handle invites and requests. */
export async function clubStaff(db: Db, clubId: string, roles: string[]) {
  return db.query<{ id: string }>('SELECT id FROM players WHERE club_id = $1 AND NOT is_bot AND club_role = ANY($2::text[])', [clubId, roles]);
}

export async function notifyStaff(db: Db, clubId: string, roles: string[], text: string, data: Record<string, unknown> = {}) {
  for (const s of await clubStaff(db, clubId, roles)) await notify(db, s.id, 'club', text, data);
}
