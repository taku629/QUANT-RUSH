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

export function rawRecommendation(sig: MarketSignals, regime: RegimeId, realizedVol: number): LaneId {
  if (regime === 'CRASH') return 2;
  if (sig.read === 'ONE_SIDED' || sig.read === 'ANNOUNCED') return 2;
  if (sig.read === 'RUSH') return 0;
  // spread income estimated from public prints, haircut for adverse selection (tighter = more exposed)
  const v = [sig.laneIncome[0] * 0.5, sig.laneIncome[1] * 0.75, sig.laneIncome[2]];
  let lane = (v[0] >= v[1] && v[0] >= v[2] ? 0 : v[1] >= v[2] ? 1 : 2) as LaneId;
  if (realizedVol > 0.05 && lane === 0) lane = 1;
  return lane;
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
    if (this.candidate !== this.lane && t - this.candSince >= R.confirm && t - this.lastChange >= R.minHold) {
      this.lane = this.candidate;
      this.lastChange = t;
      this.changes++;
      moved = this.lane;
    }
    this.danger = dangerMask(this.lane, e.regime, sig.read);
    return moved;
  }
}
