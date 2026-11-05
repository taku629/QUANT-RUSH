/**
 * Recommended lane ("where should I be right now?") — computed ONLY from public market information
 * (the same reading as the SIGNAL READER bot: flow imbalance, momentum, order rush, news, volatility).
 * No future prices and no hidden trader types are used. It is right on average, not always.
 *
 * Hysteresis keeps the glowing lane stable: a new answer must persist `confirm` seconds and the lane
 * never moves more often than every `minHold` seconds.
 */
import type { LaneId, RegimeId } from '../sim/config';
import type { MarketMakerEngine } from '../sim/engine';
import type { FlowRead, MarketSignals } from '../sim/signals';
import { BALANCE } from './gameBalanceConfig';

/**
 * v3.1 "robust" policy. A human follows the glow ~0.5–1 s late, so short-lived calls for the tight lane
 * (the v3.0 policy copied the SIGNAL READER bot) mostly arrived after the opportunity and lost money.
 * Tight (LEFT) only in a calm market with busy two-sided flow; wide (RIGHT) whenever the market is fast
 * or the flow is one-sided; CENTER otherwise. Measured with scripts/playstyles.ts (models, not people).
 */
export function rawRecommendation(sig: MarketSignals, regime: RegimeId, realizedVol: number): LaneId {
  if (regime === 'CRASH' || regime === 'VOLATILE') return 2;
  if (sig.read === 'ONE_SIDED' || sig.read === 'ANNOUNCED') return 2;
  if (regime === 'TRENDING') return realizedVol > 0.04 ? 2 : 1;
  if (sig.read === 'RUSH' && realizedVol < 0.03) return 0;
  return 1;
}

/** lanes that are actually dangerous right now (fast / one-sided markets punish the tight AGGRESSIVE quote) */
export function dangerMask(rec: LaneId, regime: RegimeId, read: FlowRead): number {
  const fast = regime === 'VOLATILE' || regime === 'CRASH' || read === 'ONE_SIDED';
  if (!fast || rec === 0) return 0;
  return 0b001; // AGGRESSIVE lane
}

export class LaneAdvisor {
  lane: LaneId = 1;
  danger = 0;
  read: FlowRead = 'BALANCED';
  changes = 0;
  private candidate: LaneId = 1;
  private candSince = 0;
  private lastChange = -999;
  private started = false;

  /** call once per market tick; returns the new lane when the recommendation moved */
  update(e: MarketMakerEngine, t: number): LaneId | null {
    const sig = e.signals();
    const raw = rawRecommendation(sig, e.regime, e.realizedVol());
    this.read = sig.read;
    if (!this.started) {
      this.started = true;
      this.lane = raw;
      this.candidate = raw;
      this.candSince = t;
      this.lastChange = t;
      this.danger = dangerMask(raw, e.regime, sig.read);
      return null;
    }
    if (raw !== this.candidate) {
      this.candidate = raw;
      this.candSince = t;
    }
    let moved: LaneId | null = null;
    const R = BALANCE.recommend;
    if (this.candidate !== this.lane && t >= R.introHold && t - this.candSince >= R.confirm && t - this.lastChange >= R.minHold) {
      this.lane = this.candidate;
      this.lastChange = t;
      this.changes++;
      moved = this.lane;
    }
    this.danger = dangerMask(this.lane, e.regime, sig.read);
    return moved;
  }
}
