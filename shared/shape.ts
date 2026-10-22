import type { Slot, Tactics } from './formations.ts';

/**
 * Team shape model, shared by the simulation (to choose receivers and
 * defenders) and the 3D viewer (to place players), so what you see is what
 * the engine reasoned about.
 *
 * Everything here is in the team's own attacking frame: u from own goal (0)
 * to opponent goal (1), v across (-1..1).
 */
export interface Pt {
  u: number;
  v: number;
}

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

export function slotPosition(
  slot: Slot,
  ball: Pt, // ball in this team's frame
  inPossession: boolean,
  tactics: Tactics,
): Pt {
  if (slot.role === 'GK') {
    const u = inPossession ? 0.05 + Math.max(0, ball.u - 0.5) * 0.12 : 0.025 + Math.max(0, 0.4 - ball.u) * 0.03;
    return { u, v: clamp(ball.v * 0.18, -0.12, 0.12) };
  }
  const ment = tactics.mentality === 'attacking' ? 0.012 : tactics.mentality === 'defensive' ? -0.012 : 0;
  const press = tactics.pressing === 'high' ? 0.06 : tactics.pressing === 'low' ? -0.06 : 0;
  const widthK = tactics.width === 'wide' ? 1.12 : tactics.width === 'narrow' ? 0.85 : 1;
  let u: number;
  let v: number;
  if (inPossession) {
    // Block steps up behind the ball; forwards stretch the pitch.
    u = slot.x * 0.78 + ball.u * 0.42 - 0.08 + ment;
    v = slot.y * widthK * 0.92 + ball.v * 0.14;
  } else {
    // Compact block that drops off and slides across toward the ball.
    u = slot.x * 0.52 + ball.u * 0.44 - 0.03 + press + ment * 0.5;
    v = slot.y * widthK * 0.62 + ball.v * 0.36;
  }
  return { u: clamp(u, 0.06, 0.95), v: clamp(v, -0.96, 0.96) };
}

/** Flip a point from one team's frame into the other's. */
export function flip(p: Pt): Pt {
  return { u: 1 - p.u, v: -p.v };
}

export const PITCH_L = 105;
export const PITCH_W = 68;

/** Distance in metres between two points in the same frame. */
export function distM(a: Pt, b: Pt): number {
  const dx = (a.u - b.u) * PITCH_L;
  const dy = ((a.v - b.v) * PITCH_W) / 2;
  return Math.hypot(dx, dy);
}

/**
 * Converts a frame point to absolute pitch metres. `dir` is +1 when the team
 * attacks toward +x, -1 otherwise.
 */
export function toAbs(p: Pt, dir: 1 | -1): { x: number; y: number } {
  return { x: dir * (p.u - 0.5) * PITCH_L, y: (dir * p.v * PITCH_W) / 2 };
}

export function fromAbs(x: number, y: number, dir: 1 | -1): Pt {
  return { u: (dir * x) / PITCH_L + 0.5, v: (dir * y * 2) / PITCH_W };
}
