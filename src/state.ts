import type { Badge } from '../shared/badge.ts';
import { api } from './api.ts';
import type { Appearance } from '../shared/appearance.ts';
import type { Equipped } from '../shared/cosmetics.ts';
import type { Attributes, Position } from '../shared/attributes.ts';

export interface MePlayer {
  id: string;
  name: string;
  position: Position;
  shirt: number;
  role: string;
  clubId: string | null;
  appearance: Appearance;
  ovr: number;
  attrs: Attributes;
  coins: number;
  /** Premium currency. */
  stars: number;
  equipped: Equipped;
  motto: string;
}

export interface MeClub { id: string; name: string; short: string; colors: { primary: string; secondary: string }; badge: Badge; isBot: boolean }

export const state: { user: { id: string; username: string } | null; player: MePlayer | null; club: MeClub | null; loaded: boolean; invites: number; unread: number; match: { id: string; live: boolean; kickoffAt: string } | null; trainReady: boolean; daily: { checkin: boolean; ready: string[]; level: number; fame: number } | null } = {
  daily: null,
  match: null,
  trainReady: false,
  invites: 0,
  unread: 0,
  club: null,
  user: null,
  player: null,
  loaded: false,
};

export async function refreshMe() {
  const r = await api.get('/api/me');
  state.user = r.user;
  state.player = r.player ?? null;
  state.invites = r.invites ?? 0;
  state.club = r.club ?? null;
  state.unread = r.unread ?? 0;
  state.match = r.match ?? null;
  state.trainReady = !!r.trainReady;
  state.daily = r.daily ?? null;
  state.loaded = true;
  document.dispatchEvent(new CustomEvent('me-changed'));
}
