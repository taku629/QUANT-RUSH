/**
 * Gameplay fingerprint: a compact, exact record of everything the rules decide for a given
 * seed + input script (market, orders, fills, inventory, cash, PnL, hedges, ALPHA, obstacles,
 * collisions, gates, clock, score). Used to prove that visual-only changes never alter gameplay.
 * Test/QA helper only — not used by the game itself.
 */
import { createRng } from '../sim/rng';
import { computeScore, riskStats } from '../sim/scoring';
import { autopilot } from './autopilot';
import { GameSession, type Input } from './session';
import type { VehicleId } from './content';

/** FNV-1a over a string — stable across platforms */
function fnv(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const r6 = (v: number) => Math.round(v * 1e6) / 1e6;

export type Fingerprint = Record<string, string | number>;

/** Run a deterministic scripted session (mix of autopilot and scripted noise inputs). */
export function runScripted(seed: number, vehicle: VehicleId, seconds: number): GameSession {
  const s = new GameSession(seed, vehicle);
  const noise = createRng(seed ^ 0x5eed);
  for (let f = 0; f < seconds * 60 && !s.ended; f++) {
    const inp: Input = autopilot(s, f);
    // scripted extra inputs so hedges / jumps / ALPHA / lane changes all happen
    if (noise.next() < 0.004) inp.hedge = true;
    if (noise.next() < 0.003) inp.jump = true;
    if (noise.next() < 0.002) inp.left = 1;
    s.update(inp);
    s.drainEvents();
  }
  return s;
}

export function fingerprint(s: GameSession): Fingerprint {
  const e = s.engine;
  const tape = e.tape;
  const risk = riskStats(e);
  const score = computeScore(risk, s.tradingPoints, s.actionPoints + s.distancePoints);
  return {
    ticks: e.tick,
    frames: s.frame,
    prices: fnv(Array.from(tape.mid.slice(0, e.tick + 1), r6).join(',')),
    orders: fnv(tape.orders.map((o) => `${o.id}:${o.side}:${o.qty}:${o.arriveTick}:${o.block ?? '-'}`).join('|')),
    fills: fnv(e.fills.map((f) => `${f.orderId}:${f.tick}:${f.qty}:${r6(f.price)}:${f.lane}`).join('|')),
    fillCount: e.fills.length,
    hedges: fnv(e.hedges.map((h) => `${h.tick}:${h.qty}:${r6(h.price)}`).join('|')),
    hedgeCount: e.hedges.length,
    inventoryPath: fnv(e.timeline.map((p) => `${p.tick}:${p.inventory}:${p.lane}`).join('|')),
    inventory: e.inventory,
    cash: r6(e.cash),
    pnl: r6(e.pnl),
    alpha: s.alphaCount,
    obstacles: fnv(s.obstacles.map((o) => `${o.id}:${o.kind}:${o.lane}:${r6(o.z)}:${o.alive}:${o.hit}`).join('|')),
    pickups: fnv(s.pickups.map((p) => `${p.id}:${p.kind}:${p.lane}:${r6(p.z)}:${p.used}`).join('|')),
    collisions: s.collisions,
    nearMisses: s.nearMisses,
    gates: `${s.gatesPassed}/${s.gatesFailed}`,
    district: s.district,
    timeLeft: r6(s.timeLeft),
    distance: r6(s.z),
    endReason: s.endReason ?? 'RUNNING',
    score: score.total,
  };
}

export const GOLDEN_CASES: { seed: number; vehicle: VehicleId; seconds: number }[] = [
  { seed: 424242, vehicle: 'board', seconds: 120 },
  { seed: 777, vehicle: 'bike', seconds: 120 },
  { seed: 20261101, vehicle: 'pod', seconds: 90 },
];
