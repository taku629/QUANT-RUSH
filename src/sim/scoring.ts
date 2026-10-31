/** Risk-adjusted performance metrics and the arcade score. Score never feeds back into PnL. */
import type { MarketMakerEngine } from './engine';

export type RiskStats = {
  pnl: number;
  /** PnL divided by the volatility of the PnL path (per-second increments, scaled to the session) */
  sharpe: number;
  maxDrawdown: number;
  /** PnL / max drawdown (return on risk taken) */
  returnOnDrawdown: number;
  avgAbsInventory: number;
  /** share of time spent pinned at the position limit */
  limitShare: number;
  fills: number;
  hedges: number;
  spreadPnL: number;
  rebatePnL: number;
  hedgeCost: number;
  inventoryPnL: number;
  adverseSelection: number;
  seconds: number;
};

export function riskStats(e: MarketMakerEngine): RiskStats {
  const s = e.pnlBySecond;
  const incs: number[] = [];
  for (let i = 1; i < s.length; i++) incs.push(s[i] - s[i - 1]);
  const n = Math.max(1, incs.length);
  const mean = incs.reduce((a, b) => a + b, 0) / n;
  const variance = incs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const pathVol = Math.sqrt(variance * n);
  const pnl = e.pnl;
  const sharpe = pathVol > 1e-9 ? pnl / Math.max(pathVol, 25) : 0;
  const adverse = e.fills.reduce((a, f) => a + Math.min(0, f.markout ?? 0), 0);
  return {
    pnl,
    sharpe,
    maxDrawdown: e.maxDrawdown,
    returnOnDrawdown: pnl / Math.max(e.maxDrawdown, 50),
    avgAbsInventory: e.tick > 0 ? e.sumAbsInventory / e.tick : 0,
    limitShare: e.tick > 0 ? e.ticksAtLimit / e.tick : 0,
    fills: e.fills.length,
    hedges: e.hedges.length,
    spreadPnL: e.spreadPnL,
    rebatePnL: e.rebatePnL,
    hedgeCost: e.hedgeCost,
    inventoryPnL: e.inventoryPnL,
    adverseSelection: adverse,
    seconds: e.time,
  };
}

export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';

/** Risk grade: rewards earning money smoothly, not gambling on inventory. */
export function riskGrade(r: RiskStats): Grade {
  if (r.pnl <= 0) return r.pnl > -200 ? 'C' : 'D';
  const q = r.sharpe * 0.6 + Math.min(r.returnOnDrawdown, 6) * 0.4 - r.limitShare * 4;
  if (q >= 3.2) return 'S';
  if (q >= 2.0) return 'A';
  if (q >= 1.0) return 'B';
  return 'C';
}

export function riskMultiplier(r: RiskStats): number {
  if (r.pnl <= 0) return 1;
  return Math.max(0.6, Math.min(2.5, 0.8 + 0.3 * r.sharpe - r.limitShare));
}

export type ScoreBreakdown = {
  pnlPoints: number;
  riskMultiplier: number;
  tradingPoints: number;
  actionPoints: number;
  total: number;
};

/**
 * total = PnL×10 × risk multiplier (only when profitable) + trading points (combo fills) + action points (near-miss, gates…)
 */
export function computeScore(r: RiskStats, tradingPoints: number, actionPoints: number): ScoreBreakdown {
  const pnlPoints = Math.round(r.pnl * 10);
  const mult = riskMultiplier(r);
  const total = Math.max(0, Math.round(pnlPoints * mult + tradingPoints + actionPoints));
  return { pnlPoints, riskMultiplier: mult, tradingPoints: Math.round(tradingPoints), actionPoints: Math.round(actionPoints), total };
}
