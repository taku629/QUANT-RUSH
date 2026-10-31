/**
 * QUANT LAB — headless strategies that play the same market as the player.
 * A Strategy only sees the Observation (no future data, no hidden informed flags).
 */
import type { LaneId, SimConfig } from './config';
import { DEFAULT_CONFIG } from './config';
import { MarketMakerEngine, type Action, type Observation } from './engine';
import { createRng, hashSeed } from './rng';
import { generateTape, type MarketTape } from './tape';
import { riskStats, type RiskStats } from './scoring';

export interface Strategy {
  readonly name: string;
  readonly description: string;
  decide(obs: Observation): Action;
}

export class FixedSpreadStrategy implements Strategy {
  readonly name: string;
  readonly description: string;
  constructor(private lane: LaneId, private hedgeAt = Infinity) {
    const n = ['AGGRESSIVE', 'BALANCED', 'DEFENSIVE'][lane];
    this.name = `FIXED ${n}${Number.isFinite(hedgeAt) ? ' + HEDGE' : ''}`;
    this.description = `常に${n}レーンで固定スプレッドを提示${Number.isFinite(hedgeAt) ? `、在庫が${hedgeAt}株を超えたらヘッジ` : ''}`;
  }
  decide(obs: Observation): Action {
    return { lane: this.lane, hedge: Math.abs(obs.inventory) >= this.hedgeAt && obs.hedgeReady };
  }
}

export class RandomStrategy implements Strategy {
  readonly name = 'RANDOM';
  readonly description = 'ランダムにレーン変更・ヘッジ';
  private rng;
  private lane: LaneId = 1;
  constructor(seed = 1) {
    this.rng = createRng(hashSeed(seed, 'random-strategy'));
  }
  decide(): Action {
    if (this.rng.next() < 0.03) this.lane = this.rng.int(0, 2) as LaneId;
    return { lane: this.lane, hedge: this.rng.next() < 0.01 };
  }
}

/**
 * Regime- and inventory-aware market maker: widen in fast markets, tighten when calm,
 * hedge when the inventory's VaR grows too large.
 */
export class InventoryAwareStrategy implements Strategy {
  readonly name = 'INVENTORY AWARE';
  readonly description = 'レジームに応じてスプレッドを調整し、在庫リスク(VaR)が閾値を超えたらヘッジ';
  constructor(private varLimit = 60) {}
  decide(obs: Observation): Action {
    let lane: LaneId = 1;
    if (obs.regime === 'CALM') lane = 0;
    else if (obs.regime === 'VOLATILE' || obs.regime === 'CRASH') lane = 2;
    const hedge = obs.hedgeReady && (obs.var95 > this.varLimit || Math.abs(obs.inventory) >= obs.positionLimit * 0.8);
    return { lane, hedge };
  }
}

export type EpisodeResult = { strategy: string; seed: number; stats: RiskStats; engine: MarketMakerEngine };

export function runEpisode(seedOrTape: number | MarketTape, strategy: Strategy, maxSeconds = 90, config: SimConfig = DEFAULT_CONFIG): EpisodeResult {
  const tape = typeof seedOrTape === 'number' ? generateTape(seedOrTape, config) : seedOrTape;
  const e = new MarketMakerEngine(tape);
  const maxTicks = Math.min(tape.totalTicks, Math.round(maxSeconds / tape.config.dt));
  while (!e.done && e.tick < maxTicks) e.step(strategy.decide(e.observe()));
  e.end();
  return { strategy: strategy.name, seed: tape.seed, stats: riskStats(e), engine: e };
}

/** Replay a recorded action log on the same seed — reproduces the exact same result. */
export function replay(seed: number, actions: Action[], config: SimConfig = DEFAULT_CONFIG): MarketMakerEngine {
  const e = new MarketMakerEngine(seed, config);
  for (const a of actions) {
    if (e.done) break;
    e.step(a);
  }
  e.end();
  return e;
}

export function benchmarkStrategies(): Strategy[] {
  return [
    new FixedSpreadStrategy(0),
    new FixedSpreadStrategy(1),
    new FixedSpreadStrategy(2),
    new InventoryAwareStrategy(),
  ];
}
