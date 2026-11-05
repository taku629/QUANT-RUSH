/**
 * ============================================================================
 *  QUANT RUSH — GAME BALANCE CONFIG  (v3 rules, revision v3.1 — see docs/balance-v3.md)
 *  Every number you might want to tune by hand lives here.
 *  Change a value → `npm run balance` (difficulty/run length) and `npm test`.
 *  Note: changing anything here changes gameplay, so the v3 golden test will
 *  report a diff — re-record it only when the change is intended:
 *    npx vite-node scripts/dev/golden.ts tests/golden/gameplay-v3.json
 *
 *  Market-model parameters (prices, order flow, spreads) stay in src/sim/config.ts.
 * ============================================================================
 */

/** rules revision of this file (v1/v2 rules are frozen on archive/v1 and archive/v2) */
export const RULES_VERSION = 'v3.1';

export const BALANCE = {
  // ---------------------------------------------------------------- clock
  time: {
    /** seconds on the clock at the start */
    start: 30,
    /** time bonus for a passed gate: pass − district × decay (never below min) */
    gatePass: 16,
    gateDecay: 1.5,
    gateMin: 9,
    gateFail: 6,
    overtimePass: 8,
    overtimeFail: 3,
  },

  // ---------------------------------------------------------------- speed
  speed: {
    /** multiplier on every vehicle's base speed */
    baseMul: 1.0,
    /** extra m/s per district reached (capped at 4 districts) */
    perDistrict: 2.2,
    /** extra m/s per overtime lap */
    perLap: 4,
    /** extra m/s per combo step (capped at 40) */
    perCombo: 0.22,
    /** boost pad: extra m/s and duration (s) */
    boost: 14,
    boostTime: 1.3,
  },

  // ---------------------------------------------------------------- RISK gauge (0–100 %)
  risk: {
    /** inventory (shares) that fills the gauge to 100 % in a CALM market */
    fullInventory: 900,
    /** volatility multipliers: the same inventory is riskier in fast markets */
    regimeMul: { CALM: 0.9, TRENDING: 1.0, VOLATILE: 1.15, CRASH: 1.35 } as Record<string, number>,
    /** the gauge climbs toward the exposure at most this fast (gauge / s) and falls this fast */
    riseRate: 0.35,
    fallRate: 1.5,
    /** seconds of "OVERLOAD" at 100 % before the forced liquidation; only counts while HEDGE is usable */
    burstGrace: 1.5,
    /** a forced liquidation also costs score points and clock seconds (it is a failure, not a routine event) */
    burstScore: 1500,
    burstTime: 3,
    /** gauge level at which the HUD says "HEDGE!" (the chicken-race sweet spot starts here) */
    warnAt: 0.7,
    /** settlement bonus (score points, NOT money) when you HEDGE: pointsPerPercent × gauge % × sweetSpotMul */
    settlePointsPerPct: 10,
    /**
     * no settlement bonus for hedges below this gauge level: hedging small positions is allowed (and safe)
     * but not rewarded — two-sided flow often nets them out for free, while the hedge always costs money
     */
    settleMin: 0.7,
    /** multiplier on the settlement bonus inside the sweet spot (≥ warnAt, < 100 %) */
    sweetSpotMul: 1.5,
    /**
     * At 100 % the position is force-liquidated ("RISK BURST"): flattened at the market with this
     * extra cost per share on top of the normal hedge cost (booked as hedge cost — real money).
     */
    burstPenaltyPerShare: 0.06,
    /** gate risk check: the gate is passed when RISK is below this level */
    gateMax: 0.6,
  },

  // ---------------------------------------------------------------- recommended lane
  recommend: {
    /** a new recommendation must persist this long (s) before the glowing lane moves */
    confirm: 0.5,
    /** and the glowing lane never moves more often than this (s) */
    minHold: 1.5,
    /** the glowing lane stays put for the first seconds of a run (the intro teaches it with coins) */
    introHold: 8,
  },

  // ---------------------------------------------------------------- profit & score
  score: {
    /** trading points per $ of spread captured (× combo multiplier, ×2 during ALPHA) */
    perSpreadDollar: 10,
    /** final-score points per $ of PnL (× the risk multiplier when profitable) — v1/v2 used 10 */
    pnlPerDollar: 20,
    /**
     * when a fill's 2-second markout is known, its points are corrected by (markout − spread) × perSpreadDollar × this:
     * fills against informed flow lose points, so the score follows real trading quality
     */
    markoutWeight: 1,
    /** profit coin (in the recommended lane): points and ALPHA gauge */
    coinPoints: 15,
    coinGauge: 2.5,
    nearMissPoints: 150,
    gatePoints: 1000,
    goalPoints: 5000,
    smashPoints: 250,
    smashCapPerAlpha: 5,
  },

  // ---------------------------------------------------------------- course (spawner)
  course: {
    /** base distance between obstacle rows by regime (m) — larger = easier */
    gap: { CALM: 52, TRENDING: 44, VOLATILE: 38, CRASH: 33 } as Record<string, number>,
    /** coins per row placed in the recommended lane */
    coinsPerRow: 3,
    /** chance that a row contains a jumpable gimmick (low barrier / ramp) in the recommended lane */
    gimmickChance: 0.3,
    /** + this per district reached (capped at gimmickMax): the glowing lane asks more timing skill later on */
    gimmickPerDistrict: 0.06,
    gimmickMax: 0.55,
    /** chance of slow traffic in a NON-recommended lane in calm markets */
    calmTraffic: 0.35,
  },

  // ---------------------------------------------------------------- action
  action: {
    offlineTime: 1.4,
    invulnTime: 2.2,
    alphaDuration: 6.5,
    alphaSpeedMul: 1.55,
    comboTimeout: 3.5,
    nearMissGap: 0.75,
    /** ALPHA gauge sources */
    gaugeStart: 50,
    gaugeNearMiss: 12,
    gaugeGate: 20,
  },
} as const;

export type Balance = typeof BALANCE;
