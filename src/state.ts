import { api } from './api.ts';
import type { Appearance } from '../shared/appearance.ts';
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
}

export const state: { user: { id: string; username: string } | null; player: MePlayer | null; loaded: boolean } = {
  user: null,
  player: null,
  loaded: false,
};

export async function refreshMe() {
  const r = await api.get('/api/me');
  state.user = r.user;
  state.player = r.player ?? null;
  state.loaded = true;
  document.dispatchEvent(new CustomEvent('me-changed'));
}
