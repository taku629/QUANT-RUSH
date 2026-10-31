import { runtime } from '../game/store';
import type { GameSession } from '../game/session';

/** The session currently rendered: the player's run, or the title-screen demo run. */
export const active = (): GameSession | null => runtime.session ?? runtime.demo;

/** frame interpolation alpha within the current fixed step (for smoothing) */
export const frameState = { alpha: 0 };

/** true once per new active session (title demo → run, retry…) for a given consumer key */
const seen = new Map<string, GameSession | null>();
export function sessionChanged(key: string, s: GameSession | null): boolean {
  if (seen.get(key) === s) return false;
  seen.set(key, s);
  return true;
}
