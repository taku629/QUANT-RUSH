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
  { id: 1, name: 'BALANCED', halfSpread: 0.05, queueWin: 0.82 },
  { id: 2, name: 'DEFENSIVE', halfSpread: 0.1, queueWin: 0.62 },
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
  /** model version (v1 = regime-only flow, v2 = episodes + blocks + impact) */
  model: 1 | 2;
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
  model: 2,
};

export const LOT_SIZES = [100, 100, 200, 200, 300] as const;

/**
 * Micro "flow episodes" (hidden state, 2–6 s) layered on top of the macro regime.
 * They are what makes the best quote situation-dependent: the regime label is a clue, not the answer.
 *  - TWO_SIDED: balanced noise flow. Quote near the takers' typical urgency.
 *  - RUSH:      many small, low-urgency, two-sided retail orders. Tight quotes win on volume.
 *  - TOXIC:     an informed burst. One-sided flow + price drifting the same way. Widen / hedge.
 *  - SWEEP:     a PUBLICLY announced one-sided liquidity need (index rebalance, margin liquidation).
 *               It pushes the price temporarily; the push decays. Providing liquidity is rewarded.
 */
export type EpisodeKind = 'TWO_SIDED' | 'RUSH' | 'TOXIC' | 'SWEEP';

export const EPISODE_MIX: Record<RegimeId, Record<EpisodeKind, number>> = {
  CALM: { TWO_SIDED: 0.58, RUSH: 0.18, TOXIC: 0.14, SWEEP: 0.1 },
  TRENDING: { TWO_SIDED: 0.45, RUSH: 0.15, TOXIC: 0.25, SWEEP: 0.15 },
  VOLATILE: { TWO_SIDED: 0.38, RUSH: 0.25, TOXIC: 0.2, SWEEP: 0.17 },
  CRASH: { TWO_SIDED: 0.3, RUSH: 0.0, TOXIC: 0.4, SWEEP: 0.3 },
};

export const EPISODE_PARAMS = {
  /** order-rate multiplier */
  rate: { TWO_SIDED: 1, RUSH: 3.0, TOXIC: 1.15, SWEEP: 1.5 } as Record<EpisodeKind, number>,
  /** urgency (willingness) multiplier for noise takers */
  urgency: { TWO_SIDED: 1, RUSH: 0.45, TOXIC: 1, SWEEP: 1.6 } as Record<EpisodeKind, number>,
  /** informed share inside a TOXIC burst */
  toxicInformed: 0.45,
  /** price drift ($/s) impounded during a TOXIC burst, by regime */
  toxicDrift: { CALM: 0.03, TRENDING: 0.04, VOLATILE: 0.07, CRASH: 0.09 } as Record<RegimeId, number>,
  /** noise traders herd behind an informed burst (probability of trading on the burst's side) */
  toxicHerd: 0.65,
  /** share of SWEEP orders on the announced side */
  sweepOneSided: 0.85,
  /** temporary price impact per share of sweep flow ($/share) and its half-life (s) */
  sweepImpact: 0.00011,
  impactHalfLife: 1.6,
};

/** Large institutional "block" orders that physically appear in one lane. You must ride in that lane to trade them. */
export const BLOCK = { ratePerSec: 0.11, lead: 3.0, minQty: 500, maxQty: 800 };

/** Urgency tiers drawn as rings on order orbs: tier n fills lanes 0..n-1 (if queue priority wins). */
export function urgencyTier(willingness: number): 0 | 1 | 2 | 3 {
  if (willingness >= LANES[2].halfSpread) return 3;
  if (willingness >= LANES[1].halfSpread) return 2;
  if (willingness >= LANES[0].halfSpread) return 1;
  return 0;
}
