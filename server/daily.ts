// Daily check-in, daily goals and Fame. See shared/daily.ts for the rules.
import { DAILY_BONUS, dailyGoals, dayKey, fameLevel, fameTitle, freshDaily, GOAL_BY_ID, levelCoins, nextReset, prevDay, STREAK_REWARDS, streakReward, type DailyState, type GoalEvent } from '../shared/daily.ts';
import type { Db } from './db.ts';
import { bad } from './http.ts';
import { notify } from './rewards.ts';
import type { PlayerRow } from './squads.ts';

/** Adds Fame, paying coins and sending a note for every level reached. */
export async function addFame(db: Db, playerId: string, amount: number): Promise<number[]> {
  if (amount <= 0) return [];
  const r = await db.query<{ fame: number }>('UPDATE players SET fame = fame + $2 WHERE id = $1 AND NOT is_bot RETURNING fame', [playerId, Math.round(amount)]);
  if (!r.length) return [];
  const before = fameLevel(r[0].fame - Math.round(amount)).level;
  const after = fameLevel(r[0].fame).level;
  const ups: number[] = [];
  for (let l = before + 1; l <= after; l++) {
    ups.push(l);
    await db.query('UPDATE players SET coins = coins + $2 WHERE id = $1', [playerId, levelCoins(l)]);
    await notify(db, playerId, 'level', `Fame level ${l}: you're now a ${fameTitle(l).toLowerCase()}. +${levelCoins(l)} coins.`, { level: l });
  }
  return ups;
}

/** Counts something the player did today towards their daily goals. */
export async function bump(db: Db, p: PlayerRow, event: GoalEvent, by = 1) {
  if (p.is_bot) return;
  // One atomic update, so it never undoes a claim landing at the same moment.
  const r = await db.query<{ daily: Record<string, unknown> }>(
    `UPDATE players SET daily = CASE WHEN daily->>'day' = $2 AND daily ? 'n'
       THEN jsonb_set(daily, ARRAY['n', $3::text], to_jsonb(coalesce((daily->'n'->>$3::text)::int, 0) + $4::int))
       ELSE jsonb_build_object('day', $2::text, 'n', jsonb_build_object($3::text, $4::int), 'claimed', '[]'::jsonb) END
     WHERE id = $1 RETURNING daily`,
    [p.id, dayKey(), event, by],
  );
  if (r[0]) p.daily = r[0].daily;
}

function goalsOf(p: PlayerRow, d: DailyState) {
  return dailyGoals(p.id, d.day, !!p.club_id).map((g) => {
    const progress = Math.min(g.target, d.n[g.event] ?? 0);
    return { id: g.id, text: g.text, icon: g.icon, href: g.href, target: g.target, progress, coins: g.coins, fame: g.fame, done: progress >= g.target, claimed: d.claimed.includes(g.id) };
  });
}

/** Whether the streak is still alive (checked in today or yesterday). */
function liveStreak(p: PlayerRow, today: string) {
  return p.streak_day === today || p.streak_day === prevDay(today) ? p.streak : 0;
}

export function dailyDto(p: PlayerRow) {
  const today = dayKey();
  const d = freshDaily(p.daily, today);
  const goals = goalsOf(p, d);
  const streak = liveStreak(p, today);
  const checkedIn = p.streak_day === today;
  // The streak you would be on after today's check-in.
  const next = checkedIn ? streak : streak + 1;
  const allDone = goals.every((g) => g.done);
  return {
    day: today,
    resetsAt: nextReset(),
    checkin: { done: checkedIn, streak, day: next, week: STREAK_REWARDS, reward: streakReward(next) },
    goals,
    bonus: { ...DAILY_BONUS, ready: allDone, claimed: d.claimed.includes('bonus') },
    fame: { ...fameLevel(p.fame ?? 0), title: fameTitle(fameLevel(p.fame ?? 0).level) },
  };
}

/** The small summary /api/me carries for badges and pop-ups. */
export function dailyBrief(p: PlayerRow) {
  const d = dailyDto(p);
  return {
    checkin: !d.checkin.done,
    ready: d.goals.filter((g) => g.done && !g.claimed).map((g) => g.id).concat(d.bonus.ready && !d.bonus.claimed ? ['bonus'] : []),
    level: d.fame.level,
    fame: d.fame.into / d.fame.need,
  };
}

export async function checkIn(db: Db, p: PlayerRow) {
  const today = dayKey();
  if (p.streak_day === today) throw bad('You already checked in today');
  const streak = liveStreak(p, today) + 1;
  const reward = streakReward(streak);
  // Only one check-in per day, however many taps arrive at once.
  const r = await db.query<{ coins: number }>(
    'UPDATE players SET streak = $2, streak_day = $3, coins = coins + $4 WHERE id = $1 AND streak_day IS NOT DISTINCT FROM $5 RETURNING coins',
    [p.id, streak, today, reward.coins, p.streak_day],
  );
  if (!r.length) throw bad('You already checked in today');
  const levelUps = await addFame(db, p.id, reward.fame);
  return { streak, reward, levelUps };
}

export async function claimGoal(db: Db, p: PlayerRow, id: string) {
  const d = freshDaily(p.daily);
  if (d.claimed.includes(id)) throw bad('Already claimed');
  const goals = goalsOf(p, d);
  let reward: { coins: number; fame: number };
  if (id === 'bonus') {
    if (!goals.every((g) => g.done)) throw bad('Finish all three goals first');
    reward = DAILY_BONUS;
  } else {
    const g = goals.find((x) => x.id === id);
    if (!g || !GOAL_BY_ID[id]) throw bad('That is not one of today\'s goals');
    if (!g.done) throw bad('Not finished yet');
    reward = g;
  }
  d.claimed.push(id);
  // Guard against a double tap: the claim only lands on the state we read.
  const r = await db.query('UPDATE players SET daily = $2, coins = coins + $3 WHERE id = $1 AND daily = $4::jsonb RETURNING id', [p.id, JSON.stringify(d), reward.coins, JSON.stringify(p.daily ?? {})]);
  if (!r.length) throw bad('Try that again');
  const levelUps = await addFame(db, p.id, reward.fame);
  return { reward: { coins: reward.coins, fame: reward.fame }, levelUps };
}
