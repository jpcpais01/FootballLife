// Attract mode for the sign-in screen: two AI clubs play a client-side match
// in the stadium, on a loop, with the camera drifting.
import { randomAppearance } from '../../shared/appearance.ts';
import { generateAttributes } from '../../shared/attributes.ts';
import { DEFAULT_TACTICS, getFormation } from '../../shared/formations.ts';
import { Rng } from '../../shared/rng.ts';
import { simulateMatch } from '../../shared/sim/engine.ts';
import type { SimTeam } from '../../shared/sim/types.ts';
import { decodeWindow } from '../../shared/sim/tracks.ts';
import { MatchViewer, type ViewerTeam } from './viewer.ts';

function team(name: string, short: string, primary: string, secondary: string, seed: number): { sim: SimTeam; view: ViewerTeam } {
  const f = getFormation('4-3-3');
  const rng = new Rng(seed);
  const players = f.slots.map((_, i) => ({ name: `${name} ${i}`, number: i + 1, app: randomAppearance(() => rng.next()) as unknown as Record<string, number> }));
  return {
    sim: {
      clubId: short, name, short, colors: { primary, secondary }, formation: f.name, tactics: DEFAULT_TACTICS,
      players: f.slots.map((s, i) => ({ id: `${short}${i}`, name: players[i].name, number: i + 1, natural: s.role, slotId: s.id, role: s.role, attrs: generateAttributes(s.role, 55, `${short}${i}`), bot: true })),
    },
    view: { name, short, colors: { primary, secondary }, formation: f.name, tactics: DEFAULT_TACTICS, players },
  };
}

export function startDemo(container: HTMLElement): () => void {
  const a = team('Lime Rockets', 'LRK', '#c6ff3d', '#111111', 3);
  const b = team('Real Marea', 'MAR', '#f5f5f5', '#7a1fd1', 9);
  const res = simulateMatch(a.sim, b.sim, 20261021);
  const night = new Date().getHours() >= 18 || new Date().getHours() < 7;
  const viewer = new MatchViewer(container, [a.view, b.view], res.halftimeAt, { night, quality: 'low', crowd: 4000 });
  viewer.setEvents(res.events);
  viewer.setTracks((res.tracks ?? []).map(decodeWindow));
  viewer.setMode('broadcast');
  // Loop the match's highlights back to back, at true speed, straight from the recording.
  const wins = (res.tracks ?? []).map((w) => [w.t0 + 1, w.t1 - 1] as const).filter(([a, b]) => b > a);
  let wi = 0;
  let t = wins.length ? wins[0][0] : 30;
  let raf = 0;
  let last = performance.now();
  let lastGoals = res.events.filter((e) => e.k === 'goal' && e.t <= t).length;
  const loop = () => {
    const now = performance.now();
    t += Math.min(0.1, (now - last) / 1000);
    last = now;
    if (wins.length && t > wins[wi][1]) {
      wi = (wi + 1) % wins.length;
      t = wins[wi][0];
      lastGoals = res.events.filter((e) => e.k === 'goal' && e.t <= t).length;
    }
    const goals = res.events.filter((e) => e.k === 'goal' && e.t <= t).length;
    if (goals > lastGoals) {
      const g = res.events.filter((e) => e.k === 'goal' && e.t <= t).pop()!;
      viewer.goal(g.s);
    }
    lastGoals = goals;
    viewer.render(t, 1);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    viewer.dispose();
  };
}
