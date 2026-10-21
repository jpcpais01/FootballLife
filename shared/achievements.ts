// Achievements: career milestones checked on the server after matches,
// training, purchases and club changes. Each pays coins once, and some unlock
// items that cannot be bought.

export interface AchStats {
  apps: number;
  goals: number;
  assists: number;
  cleanSheets: number;
  saves: number;
  wins: number;
  motm: number;
  bestMatchGoals: number;
  bestRating: number;
  trainCount: number;
  ovr: number;
  inClub: boolean;
  founded: boolean;
  owned: number;
  titles: number;
  cups: number;
  awards: number;
  houses: number;
  cars: number;
  memorabilia: number;
}

export type Tier = 'bronze' | 'silver' | 'gold';
export const TIER_COLORS: Record<Tier, string> = { bronze: '#d08a4e', silver: '#cfd6de', gold: '#ffc23d' };

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  tier: Tier;
  icon: string;
  coins: number;
  item?: string;
  /** Current progress and the target. */
  progress: (s: AchStats) => [number, number];
}

const count = (key: keyof AchStats, target: number) => (s: AchStats) => [Math.min(Number(s[key]), target), target] as [number, number];
const flag = (key: keyof AchStats) => (s: AchStats) => [s[key] ? 1 : 0, 1] as [number, number];

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'debut', name: 'Debut', desc: 'Play your first league match.', tier: 'bronze', icon: 'whistle', coins: 50, progress: count('apps', 1) },
  { id: 'club', name: 'Part of something', desc: 'Join or found a club.', tier: 'bronze', icon: 'shield', coins: 50, progress: flag('inClub') },
  { id: 'founder', name: 'Founder', desc: 'Found your own club.', tier: 'bronze', icon: 'plus', coins: 80, progress: flag('founded') },
  { id: 'train1', name: 'First session', desc: 'Complete a training session.', tier: 'bronze', icon: 'dumbbell', coins: 30, progress: count('trainCount', 1) },
  { id: 'train25', name: 'Gym rat', desc: 'Complete 25 training sessions.', tier: 'silver', icon: 'dumbbell', coins: 200, progress: count('trainCount', 25) },
  { id: 'train100', name: 'Relentless', desc: 'Complete 100 training sessions.', tier: 'gold', icon: 'dumbbell', coins: 600, progress: count('trainCount', 100) },
  { id: 'goal1', name: 'Off the mark', desc: 'Score your first league goal.', tier: 'bronze', icon: 'ball', coins: 60, item: 'title-firstgoal', progress: count('goals', 1) },
  { id: 'goal10', name: 'Finisher', desc: 'Score 10 league goals.', tier: 'silver', icon: 'ball', coins: 250, progress: count('goals', 10) },
  { id: 'goal50', name: 'Goal machine', desc: 'Score 50 league goals.', tier: 'gold', icon: 'ball', coins: 800, progress: count('goals', 50) },
  { id: 'hattrick', name: 'Hat-trick hero', desc: 'Score three goals in one match.', tier: 'gold', icon: 'sparkle', coins: 300, item: 'title-hattrick', progress: count('bestMatchGoals', 3) },
  { id: 'assist1', name: 'Provider', desc: 'Make your first league assist.', tier: 'bronze', icon: 'arrow', coins: 50, progress: count('assists', 1) },
  { id: 'assist15', name: 'Playmaker', desc: 'Make 15 league assists.', tier: 'silver', icon: 'arrow', coins: 300, progress: count('assists', 15) },
  { id: 'cs1', name: 'Shut out', desc: 'Keep your first clean sheet.', tier: 'bronze', icon: 'shield', coins: 50, progress: count('cleanSheets', 1) },
  { id: 'cs10', name: 'Iron curtain', desc: 'Keep 10 clean sheets.', tier: 'silver', icon: 'shield', coins: 300, progress: count('cleanSheets', 10) },
  { id: 'saves50', name: 'Safe hands', desc: 'Make 50 saves.', tier: 'silver', icon: 'shield', coins: 250, progress: count('saves', 50) },
  { id: 'win1', name: 'Winning feeling', desc: 'Win a league match.', tier: 'bronze', icon: 'trophy', coins: 40, progress: count('wins', 1) },
  { id: 'win25', name: 'Serial winner', desc: 'Win 25 league matches.', tier: 'gold', icon: 'trophy', coins: 500, progress: count('wins', 25) },
  { id: 'motm1', name: 'Star of the show', desc: 'Be named player of the match.', tier: 'silver', icon: 'sparkle', coins: 120, progress: count('motm', 1) },
  { id: 'motm10', name: 'Big-game player', desc: 'Win 10 player of the match awards.', tier: 'gold', icon: 'sparkle', coins: 500, progress: count('motm', 10) },
  { id: 'rating9', name: 'Masterclass', desc: 'Get a 9.0 rating or higher in a match.', tier: 'gold', icon: 'sparkle', coins: 300, progress: (s) => [Math.min(s.bestRating, 9), 9] },
  { id: 'apps25', name: 'Regular', desc: 'Play 25 league matches.', tier: 'silver', icon: 'calendar', coins: 200, progress: count('apps', 25) },
  { id: 'apps100', name: 'Centurion', desc: 'Play 100 league matches.', tier: 'gold', icon: 'calendar', coins: 800, item: 'title-centurion', progress: count('apps', 100) },
  { id: 'ovr55', name: 'Going places', desc: 'Reach 55 overall.', tier: 'silver', icon: 'user', coins: 200, progress: count('ovr', 55) },
  { id: 'ovr70', name: 'Elite', desc: 'Reach 70 overall.', tier: 'gold', icon: 'user', coins: 800, progress: count('ovr', 70) },
  { id: 'shop1', name: 'Fresh fit', desc: 'Buy your first item in the shop.', tier: 'bronze', icon: 'coin', coins: 40, progress: count('owned', 1) },
  { id: 'shop10', name: 'Collector', desc: 'Own 10 items.', tier: 'silver', icon: 'coin', coins: 300, progress: count('owned', 10) },
  { id: 'house', name: 'Moving up', desc: 'Buy a new home.', tier: 'silver', icon: 'home', coins: 150, progress: count('houses', 1) },
  { id: 'car1', name: 'First wheels', desc: 'Buy your first car.', tier: 'bronze', icon: 'car', coins: 80, progress: count('cars', 1) },
  { id: 'car3', name: 'Petrolhead', desc: 'Own three cars.', tier: 'gold', icon: 'car', coins: 400, progress: count('cars', 3) },
  { id: 'swap1', name: 'Keepsake', desc: 'Collect your first piece of memorabilia.', tier: 'bronze', icon: 'shirt', coins: 50, progress: count('memorabilia', 1) },
  { id: 'memo10', name: 'Museum', desc: 'Collect 10 pieces of memorabilia.', tier: 'silver', icon: 'shirt', coins: 250, progress: count('memorabilia', 10) },
  { id: 'title', name: 'Champions', desc: 'Win the league.', tier: 'gold', icon: 'trophy', coins: 0, progress: count('titles', 1) },
  { id: 'cup', name: 'Cup glory', desc: 'Win the FootbalLife Cup.', tier: 'gold', icon: 'trophy', coins: 0, progress: count('cups', 1) },
  { id: 'award', name: 'Decorated', desc: 'Win an individual season award.', tier: 'gold', icon: 'trophy', coins: 0, progress: count('awards', 1) },
];

export const ACH_BY_ID: Record<string, Achievement> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

export function earnedNow(s: AchStats): string[] {
  return ACHIEVEMENTS.filter((a) => {
    const [cur, target] = a.progress(s);
    return cur >= target;
  }).map((a) => a.id);
}

// ---------- season trophies ----------

export const TROPHY_KINDS = {
  champion: { label: 'League champions', short: 'Champions' },
  runner_up: { label: 'Runners-up', short: '2nd' },
  third: { label: 'Third place', short: '3rd' },
  cup: { label: 'FootbalLife Cup', short: 'Cup winners' },
  golden_boot: { label: 'Golden Boot', short: 'Top scorer' },
  playmaker: { label: 'Playmaker award', short: 'Most assists' },
  golden_glove: { label: 'Golden Glove', short: 'Most clean sheets' },
  pots: { label: 'Player of the Season', short: 'Best rating' },
} as const;
export type TrophyKind = keyof typeof TROPHY_KINDS;
