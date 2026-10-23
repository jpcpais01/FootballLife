// The daily loop: a check-in streak, three goals that change every day, and
// Fame, a career level that everything you do feeds into. All of it pays
// coins, and none of it ever takes anything away.
import { hashSeed } from './rng.ts';

/** The game day, in UTC (YYYY-MM-DD). Goals and check-ins reset at midnight UTC. */
export function dayKey(t = Date.now()): string {
  return new Date(t).toISOString().slice(0, 10);
}

export function nextReset(t = Date.now()): string {
  const d = new Date(t);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)).toISOString();
}

export function prevDay(day: string): string {
  return dayKey(Date.parse(`${day}T12:00:00Z`) - 86_400_000);
}

// ---------- check-in streak ----------

/** A week of check-in rewards. The streak keeps counting past day 7 and the week repeats. */
export const STREAK_REWARDS = [
  { coins: 50, fame: 10 },
  { coins: 75, fame: 10 },
  { coins: 100, fame: 15 },
  { coins: 125, fame: 15 },
  { coins: 150, fame: 20 },
  { coins: 200, fame: 25 },
  { coins: 400, fame: 60 },
];

export const streakReward = (streak: number) => STREAK_REWARDS[(Math.max(1, streak) - 1) % STREAK_REWARDS.length];

// ---------- fame ----------

/** Fame needed to go from `level` to the next one. */
export const fameToNext = (level: number) => 120 + 60 * (level - 1);

/** Coins paid on reaching a level. */
export const levelCoins = (level: number) => 50 + 25 * level;

export function fameLevel(fame: number) {
  let level = 1;
  let left = Math.max(0, fame);
  while (left >= fameToNext(level)) {
    left -= fameToNext(level);
    level++;
  }
  return { level, into: left, need: fameToNext(level), total: fame };
}

/** A title for each stage of a career, shown under your level. */
export function fameTitle(level: number): string {
  const t = ['Academy prospect', 'Squad player', 'Rising talent', 'First-team regular', 'Fan favourite', 'Star player', 'Club legend', 'World class', 'Icon'];
  return t[Math.min(t.length - 1, Math.floor((level - 1) / 3))];
}

// ---------- daily goals ----------

/** Things the server counts through the day. */
export type GoalEvent = 'train' | 'drill' | 'chat' | 'home' | 'locker' | 'scout' | 'match' | 'shop' | 'club' | 'clubs';

export interface GoalDef {
  id: string;
  event: GoalEvent;
  text: string;
  target: number;
  coins: number;
  fame: number;
  icon: string;
  href: string;
}

const EASY: GoalDef[] = [
  { id: 'home', event: 'home', text: 'Drop by your home', target: 1, coins: 40, fame: 25, icon: 'sofa', href: '/house' },
  { id: 'locker', event: 'locker', text: 'Change something in your locker', target: 1, coins: 40, fame: 25, icon: 'shirt', href: '/shop/locker' },
  { id: 'scout', event: 'scout', text: 'Scout 3 player profiles', target: 3, coins: 45, fame: 25, icon: 'user', href: '/league?tab=leaders' },
  { id: 'match', event: 'match', text: 'Open a match centre', target: 1, coins: 40, fame: 25, icon: 'ball', href: '/league?tab=fixtures' },
  { id: 'shop', event: 'shop', text: "Check today's shop drop", target: 1, coins: 35, fame: 20, icon: 'bag', href: '/shop' },
];

const TRAINING: GoalDef[] = [
  { id: 'train', event: 'train', text: 'Complete a training session', target: 1, coins: 70, fame: 45, icon: 'dumbbell', href: '/training' },
  { id: 'drill', event: 'drill', text: 'Score 80 or more in a drill', target: 1, coins: 90, fame: 55, icon: 'sparkle', href: '/training' },
  { id: 'train2', event: 'train', text: 'Complete 2 training sessions', target: 2, coins: 110, fame: 70, icon: 'dumbbell', href: '/training' },
];

const SOCIAL: GoalDef[] = [
  { id: 'chat', event: 'chat', text: 'Send a message in club chat', target: 1, coins: 50, fame: 30, icon: 'chat', href: '/club?tab=chat' },
  { id: 'club', event: 'club', text: 'Check in at your club', target: 1, coins: 40, fame: 25, icon: 'shield', href: '/club' },
];

const SOLO: GoalDef[] = [
  { id: 'clubs', event: 'clubs', text: 'Look for a club to join', target: 1, coins: 40, fame: 25, icon: 'users', href: '/clubs' },
];

export const GOAL_BY_ID: Record<string, GoalDef> = Object.fromEntries([...EASY, ...TRAINING, ...SOCIAL, ...SOLO].map((g) => [g.id, g]));

/** Finishing all three goals pays this on top. */
export const DAILY_BONUS = { coins: 150, fame: 80 };

/** Today's three goals: one quick one, one on the training ground and one with your club. Fixed for the whole day. */
export function dailyGoals(playerId: string, day: string, inClub: boolean): GoalDef[] {
  const pick = (list: GoalDef[], slot: number) => list[hashSeed(`daily:${playerId}:${day}:${slot}`) % list.length];
  const social = inClub ? SOCIAL : SOLO;
  return [pick(EASY, 0), pick(TRAINING, 1), pick(social, 2)];
}

export interface DailyState {
  day: string;
  n: Partial<Record<GoalEvent, number>>;
  claimed: string[];
}

export function freshDaily(raw: unknown, day = dayKey()): DailyState {
  const d = (raw ?? {}) as Partial<DailyState>;
  if (d.day !== day) return { day, n: {}, claimed: [] };
  return { day, n: { ...(d.n ?? {}) }, claimed: Array.isArray(d.claimed) ? d.claimed.filter((x) => typeof x === 'string') : [] };
}
