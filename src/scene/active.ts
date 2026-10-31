import { runtime } from '../game/store';
import type { GameSession } from '../game/session';

/** The session currently rendered: the player's run, or the title-screen demo run. */
export const active = (): GameSession | null => runtime.session ?? runtime.demo;

/** frame interpolation alpha within the current fixed step (for smoothing) */
export const frameState = { alpha: 0 };
