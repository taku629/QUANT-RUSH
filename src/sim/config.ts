/**
 * All tunable parameters of the market model live here.
 * Prices are in "dollars" for an asset starting at $100; quantities are in shares.
 */
export type RegimeId = 'CALM' | 'TRENDING' | 'VOLATILE' | 'CRASH';
export type LaneId = 0 | 1 | 2; // 0 = AGGRESSIVE (left), 1 = BALANCED, 2 = DEFENSIVE (right)

export const REGIMES: readonly RegimeId[] = ['CALM', 'TRENDING', 'VOLATILE', 'CRASH'];

export type RegimeParams = {
  /** diffusion volatility, $ per sqrt(second) */
  sigma: number;
  /** absolute drift, $ per second (sign set per segment for TRENDING; negative for CRASH) */
  drift: number;
  /** jump intensity per second and jump size std ($) */
  jumpRate: number;
  jumpSize: number;
  /** taker order arrival rate (orders / second) */
  orderRate: number;
  /** mean of noise-trader willingness to pay (half-spread, $) — exponential */
  noiseUrgency: number;
  /** share of order flow that is informed (knows the next ~2s of price action) */
  informedShare: number;
  /** extra cost per share to hedge in this regime (market-wide spread widening) */
  hedgeExtra: number;
};

export const REGIME_PARAMS: Record<RegimeId, RegimeParams> = {
  CALM: { sigma: 0.018, drift: 0, jumpRate: 0, jumpSize: 0, orderRate: 3.6, noiseUrgency: 0.025, informedShare: 0.05, hedgeExtra: 0 },
  TRENDING: { sigma: 0.03, drift: 0.035, jumpRate: 0.1, jumpSize: 0.05, orderRate: 4.0, noiseUrgency: 0.055, informedShare: 0.15, hedgeExtra: 0.01 },
  VOLATILE: { sigma: 0.055, drift: 0, jumpRate: 0.3, jumpSize: 0.1, orderRate: 4.4, noiseUrgency: 0.11, informedShare: 0.15, hedgeExtra: 0.03 },
  CRASH: { sigma: 0.07, drift: -0.16, jumpRate: 0.6, jumpSize: 0.12, orderRate: 5.0, noiseUrgency: 0.14, informedShare: 0.35, hedgeExtra: 0.06 },
};

export type LaneParams = {
  id: LaneId;
  name: 'AGGRESSIVE' | 'BALANCED' | 'DEFENSIVE';
  /** our quoted half-spread around mid ($) */
  halfSpread: number;
  /** probability we win the order when the taker accepts our price (queue priority vs. competing makers) */
  queueWin: number;
};

export const LANES: readonly LaneParams[] = [
  { id: 0, name: 'AGGRESSIVE', halfSpread: 0.02, queueWin: 0.95 },
  { id: 1, name: 'BALANCED', halfSpread: 0.05, queueWin: 0.85 },
  { id: 2, name: 'DEFENSIVE', halfSpread: 0.1, queueWin: 0.75 },
];

export type SimConfig = {
  /** simulation step (seconds) */
  dt: number;
  /** length of the generated market tape (seconds). The game's time limit is controlled by the action layer
   *  (checkpoints extend it), but can never exceed this. */
  duration: number;
  initialMid: number;
  initialCash: number;
  /** absolute inventory limit (shares) */
  positionLimit: number;
  /** visible lead time between an order appearing and reaching the player (seconds) */
  orderLead: number;
  /** horizon informed traders know about, also used for markouts (seconds) */
  infoHorizon: number;
  hedgeBaseCost: number;
  hedgeCooldown: number;
  /** probability the first act (≈35–60s) contains a crash */
  crashChance: number;
  /** stop-loss: the session ends when PnL falls to this level ($) */
  stopLoss: number;
  /** maker rebate per share paid by the venue while ALPHA DRIVE (liquidity incentive) is active */
  rebatePerShare: number;
  /** seconds without a fill before the combo times out */
  comboTimeout: number;
};

export const DEFAULT_CONFIG: SimConfig = {
  dt: 0.05,
  duration: 240,
  initialMid: 100,
  initialCash: 100_000,
  positionLimit: 1000,
  orderLead: 1.6,
  infoHorizon: 2,
  hedgeBaseCost: 0.03,
  hedgeCooldown: 3,
  crashChance: 0.85,
  stopLoss: -3000,
  rebatePerShare: 0.01,
  comboTimeout: 3.5,
};

export const LOT_SIZES = [100, 100, 200, 200, 300] as const;

/** Urgency tiers drawn as rings on order orbs: tier n fills lanes 0..n-1 (if queue priority wins). */
export function urgencyTier(willingness: number): 0 | 1 | 2 | 3 {
  if (willingness >= LANES[2].halfSpread) return 3;
  if (willingness >= LANES[1].halfSpread) return 2;
  if (willingness >= LANES[0].halfSpread) return 1;
  return 0;
}
