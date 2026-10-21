import type { Position } from './attributes.ts';

/**
 * A formation slot. `x` runs from own goal (0) to the opponent's goal (1),
 * `y` across the pitch from -1 (left) to 1 (right), both in the team's own
 * attacking frame. Values describe the shape when the ball is in midfield.
 */
export interface Slot {
  id: string;
  role: Position;
  x: number;
  y: number;
}

export interface Formation {
  name: string;
  slots: Slot[];
}

const s = (id: string, role: Position, x: number, y: number): Slot => ({ id, role, x, y });
const GK = s('GK', 'GK', 0.04, 0);

export const FORMATIONS: Record<string, Formation> = {
  '4-4-2': {
    name: '4-4-2',
    slots: [GK,
      s('LB', 'FB', 0.24, -0.72), s('LCB', 'CB', 0.2, -0.26), s('RCB', 'CB', 0.2, 0.26), s('RB', 'FB', 0.24, 0.72),
      s('LM', 'WG', 0.48, -0.72), s('LCM', 'CM', 0.44, -0.22), s('RCM', 'CM', 0.44, 0.22), s('RM', 'WG', 0.48, 0.72),
      s('LS', 'ST', 0.7, -0.18), s('RS', 'ST', 0.7, 0.18)],
  },
  '4-3-3': {
    name: '4-3-3',
    slots: [GK,
      s('LB', 'FB', 0.24, -0.72), s('LCB', 'CB', 0.2, -0.26), s('RCB', 'CB', 0.2, 0.26), s('RB', 'FB', 0.24, 0.72),
      s('DM', 'DM', 0.36, 0), s('LCM', 'CM', 0.48, -0.32), s('RCM', 'CM', 0.48, 0.32),
      s('LW', 'WG', 0.68, -0.7), s('ST', 'ST', 0.74, 0), s('RW', 'WG', 0.68, 0.7)],
  },
  '4-2-3-1': {
    name: '4-2-3-1',
    slots: [GK,
      s('LB', 'FB', 0.24, -0.72), s('LCB', 'CB', 0.2, -0.26), s('RCB', 'CB', 0.2, 0.26), s('RB', 'FB', 0.24, 0.72),
      s('LDM', 'DM', 0.38, -0.2), s('RDM', 'DM', 0.38, 0.2),
      s('LW', 'WG', 0.6, -0.68), s('AM', 'AM', 0.58, 0), s('RW', 'WG', 0.6, 0.68),
      s('ST', 'ST', 0.76, 0)],
  },
  '4-1-4-1': {
    name: '4-1-4-1',
    slots: [GK,
      s('LB', 'FB', 0.24, -0.72), s('LCB', 'CB', 0.2, -0.26), s('RCB', 'CB', 0.2, 0.26), s('RB', 'FB', 0.24, 0.72),
      s('DM', 'DM', 0.35, 0),
      s('LM', 'WG', 0.58, -0.7), s('LCM', 'CM', 0.53, -0.24), s('RCM', 'CM', 0.53, 0.24), s('RM', 'WG', 0.58, 0.7),
      s('ST', 'ST', 0.76, 0)],
  },
  '3-5-2': {
    name: '3-5-2',
    slots: [GK,
      s('LCB', 'CB', 0.2, -0.4), s('CB', 'CB', 0.18, 0), s('RCB', 'CB', 0.2, 0.4),
      s('LWB', 'FB', 0.42, -0.8), s('LCM', 'CM', 0.44, -0.28), s('DM', 'DM', 0.36, 0), s('RCM', 'CM', 0.44, 0.28), s('RWB', 'FB', 0.42, 0.8),
      s('LS', 'ST', 0.72, -0.18), s('RS', 'ST', 0.72, 0.18)],
  },
  '5-3-2': {
    name: '5-3-2',
    slots: [GK,
      s('LWB', 'FB', 0.28, -0.8), s('LCB', 'CB', 0.18, -0.4), s('CB', 'CB', 0.16, 0), s('RCB', 'CB', 0.18, 0.4), s('RWB', 'FB', 0.28, 0.8),
      s('LCM', 'CM', 0.44, -0.3), s('DM', 'DM', 0.38, 0), s('RCM', 'CM', 0.44, 0.3),
      s('LS', 'ST', 0.7, -0.18), s('RS', 'ST', 0.7, 0.18)],
  },
};

export const FORMATION_KEYS = Object.keys(FORMATIONS);
export const DEFAULT_FORMATION = '4-3-3';

export function getFormation(key: string | null | undefined): Formation {
  return FORMATIONS[key ?? ''] ?? FORMATIONS[DEFAULT_FORMATION];
}

export interface Tactics {
  mentality: 'defensive' | 'balanced' | 'attacking';
  tempo: 'patient' | 'normal' | 'direct';
  pressing: 'low' | 'medium' | 'high';
  width: 'narrow' | 'normal' | 'wide';
}

export const DEFAULT_TACTICS: Tactics = { mentality: 'balanced', tempo: 'normal', pressing: 'medium', width: 'normal' };

export const TACTIC_OPTIONS: { [K in keyof Tactics]: Tactics[K][] } = {
  mentality: ['defensive', 'balanced', 'attacking'],
  tempo: ['patient', 'normal', 'direct'],
  pressing: ['low', 'medium', 'high'],
  width: ['narrow', 'normal', 'wide'],
};

export function sanitizeTactics(t: Partial<Tactics> | null | undefined): Tactics {
  const out = { ...DEFAULT_TACTICS };
  if (!t) return out;
  for (const k of Object.keys(TACTIC_OPTIONS) as (keyof Tactics)[]) {
    const v = t[k];
    if (v && (TACTIC_OPTIONS[k] as string[]).includes(v)) (out as Record<string, string>)[k] = v;
  }
  return out;
}

/** How well a player's natural position suits a slot role (1 = perfect). */
export function roleFit(natural: Position, role: Position): number {
  if (natural === role) return 1;
  if (natural === 'GK' || role === 'GK') return 0.35;
  const near: Record<Position, Position[]> = {
    GK: [],
    CB: ['DM', 'FB'],
    FB: ['CB', 'WG'],
    DM: ['CM', 'CB'],
    CM: ['DM', 'AM'],
    AM: ['CM', 'WG', 'ST'],
    WG: ['AM', 'FB', 'ST'],
    ST: ['AM', 'WG'],
  };
  return near[natural].includes(role) ? 0.86 : 0.7;
}
