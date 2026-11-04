/**
 * ============================================================================
 *  QUANT RUSH — GAME BALANCE CONFIG  (v3)
 *  Every number you might want to tune by hand lives here.
 *  Change a value → `npm run balance` (difficulty/run length) and `npm test`.
 *  Note: changing anything here changes gameplay, so the v3 golden test will
 *  report a diff — re-record it only when the change is intended:
 *    npx vite-node scripts/dev/golden.ts tests/golden/gameplay-v3.json
 *
 *  Market-model parameters (prices, order flow, spreads) stay in src/sim/config.ts.
 * ============================================================================
 */

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
    /** seconds of "OVERLOAD" warning at 100 % before the forced liquidation (HEDGE still settles normally) */
    burstGrace: 0.6,
    /** gauge level at which the HUD says "HEDGE!" (the chicken-race sweet spot starts here) */
    warnAt: 0.7,
    /** settlement bonus (score points, NOT money) when you HEDGE: pointsPerPercent × gauge % */
    settlePointsPerPct: 12,
    /** extra multiplier on the settlement bonus when hedging inside the sweet spot (≥ warnAt, < 100 %) */
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
    confirm: 1.0,
    /** and the glowing lane never moves more often than this (s) */
    minHold: 3.0,
  },

  // ---------------------------------------------------------------- profit & score
  score: {
    /** trading points per $ of spread captured (× combo multiplier, ×2 during ALPHA) */
    perSpreadDollar: 10,
    /** extra trading-point multiplier for fills made in the recommended lane */
    recLaneMul: 1.5,
    /** profit coin (in the recommended lane): points and ALPHA gauge */
    coinPoints: 60,
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
    gimmickChance: 0.35,
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
