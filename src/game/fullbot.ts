/**
 * Full-game bots: a finance Strategy that must ALSO drive the course (obstacles, time limit, gates).
 * Steering is the shared autopilot; the strategy only expresses a preferred lane and hedging.
 * This puts bots under the same running constraints as a human (collisions take quotes offline, etc.).
 */
import type { Strategy } from '../sim/strategies';
import { riskStats } from '../sim/scoring';
import { autopilot } from './autopilot';
import { GameSession } from './session';
import type { VehicleId } from './content';

export function runFullGameBot(seed: number, strategy: Strategy, vehicle: VehicleId = 'board', maxSeconds = 240) {
  const s = new GameSession(seed, vehicle);
  let pref = strategy.decide(s.engine.observe());
  for (let f = 0; f < maxSeconds * 60 && !s.ended; f++) {
    if (f % 3 === 0) pref = strategy.decide(s.engine.observe());
    const inp = autopilot(s, f, pref.lane);
    inp.hedge = pref.hedge;
    inp.alpha = s.alphaReady;
    s.update(inp);
    s.drainEvents();
  }
  if (!s.ended) s.finish('TIME');
  const risk = riskStats(s.engine);
  const score = s.score();
  return { name: strategy.name, pnl: risk.pnl, rar: risk.rar, score: score.total, distance: s.z, collisions: s.collisions, seconds: s.t, end: s.endReason };
}
