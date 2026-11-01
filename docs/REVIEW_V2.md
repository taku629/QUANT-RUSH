# QUANT RUSH v1 → v2 review (Phase 0)

Baseline at commit `ad253d1` (v1):

| Check | Result |
|---|---|
| `npm run build` | OK (three 704 kB / r3f 461 kB / app 115 kB, gzip 181/142/40 kB) |
| `npm test` (Vitest) | 35 / 35 passed |
| `npm run e2e` (Playwright desktop + Pixel 7) | 4 / 4 passed |
| `npm run balance` (autopilot) | avg run 76 s, 4.6 collisions/run, mostly KNOCKOUT |

## Why the game gets monotonous
1. **The regime label is the answer.** In v1 the best lane is a lookup table: CALM→AGG, TRENDING→BAL, VOLATILE/CRASH→DEF.
   Measured (`scripts/dev/review-v1.ts`): the regime's lane is ex-post best in only 50% of 1-second windows, but the remaining
   variance is pure noise — nothing observable predicts it. Quant Lab: "REGIME MEMORIZER" (+395) ≥ a tape-reading bot (+371).
   There is nothing to learn after the first 2 plays.
2. **The road is a straight corridor.** No curves, hills, ramps, forks, oncoming traffic or pacing; obstacle rows are uniform random,
   so there is no tension / release rhythm. The first 10–15 s are empty-ish.
3. **Orbs are decorative.** Order flow fills automatically; the player cannot meaningfully act on individual orders.
4. **Vehicles feel the same** (only speed/jump numbers differ; lateral motion is a fixed curve).
5. **Districts differ only in color** (same box buildings everywhere).

## Hard to understand
- What the rings mean and how they relate to the lane (±2/5/10¢) is only in HOW TO PLAY.
- TOXIC FLOW appears 2 s after the fill without context ("why was that bad?").
- The gate rule (|inventory| ≤ 500) is only shown on the gate banner.
- No first-play tutorial; jargon (VaR, markout, adverse selection) appears without explanation.

## Financially inaccurate / misleading
- **"More rings ⇒ more informed traders"** (HOW TO PLAY / learning report) is **false** in v1 data:
  CALM T1 5% / T3 6%, VOLATILE T1 21% / T3 8% — only CRASH shows the pattern. Removed.
- **"Sharpe"** is `PnL / (σ of 1-s PnL changes × √T)` with a floor — a t-statistic-like *session* ratio, not the Sharpe ratio
  (no risk-free rate, not annualised, not mean/σ of returns on capital). Renamed to **RAR (Risk-Adjusted Return ratio, game metric)** with the definition shown.
- "逆選択コスト" summed *all* negative markouts (including noise trades hit by random moves). Renamed "負のマークアウト合計" and explained.
- VaR95 is a 1-second parametric VaR from realised volatility; the HUD did not say so.

## Mobile portrait
- Bottom area stacks the inventory panel, lane chips, ALPHA and HEDGE — it covers the near road where obstacles must be read.
- Top HUD (PnL / time / route / regime) is dense; popups appear exactly over the lane ahead.
- Swipes: only one swipe per touch (cannot chain left-left without lifting).

## Performance / memory risks
- `Obstacles` / `Orders` look up their slot with nested loops over a Map every frame (O(pool²)).
- Per-frame allocations: `new THREE.Color(...)` in Player / SpeedLines every frame → GC churn on phones.
- Each pooled obstacle slot creates its own geometries/materials (40 × ~12 meshes).
- HUD state is pushed at 15 Hz into one big object → the whole HUD re-renders; popups re-render the HUD too.
- `PerformanceMonitor.onChange` re-renders the whole `<Canvas>` tree.
- No WebGL-unavailable / context-lost handling.
- CRASH chromatic aberration + red flashing + shake reduce readability; no reduced-motion option.

## Exploits / balance
- Always-DEFENSIVE is near-optimal in fast markets; regime memorisation needs no reading of the market.
- Hedge right before a gate always passes the risk check (intended trade-off, but free in CALM where hedge cost is 3¢).
- ALPHA DRIVE score ×2 + SMASH points can be farmed by staying in traffic during ALPHA; rebate is paid on any fill (incl. toxic).
- Distance points accrue regardless of trading.

## v2 response (summary — see PR)
Phase 3 market model v2 (episodes, public signals, block orders, temporary impact), Phase 1 running (curved/hilly world,
pattern spawner with reachability guarantee, ramps, boost pads, oncoming traffic, forks, per-vehicle handling, hit-stop),
Phase 5 tutorial / coach / timeline with counterfactual replays, Phase 7 quality presets, reduced motion, WebGL fallback,
Phase 2 district geometry & landmarks, Phase 6 daily / same-seed / ghost / Quant Lab screen.

## v2 verification (computer-based; no human playtest was possible in this environment)

| Check | v1 | v2 |
|---|---|---|
| Vitest | 35 | 53 (all pass; the 35 v1 tests are kept — 1 updated: benchmark count 4→5 because a 5th bot was added) |
| Playwright E2E (desktop + Pixel 7) | 4 | 8 (all pass) |
| Regime memoriser vs tape reader (200 seeds × 90 s) | +395 vs +371 | +201 vs **+340** (RAR 0.68 vs 1.05) |
| Best fixed lane | DEF −12 | DEF +174 (RAR 0.44 < reader 1.05) |
| Hedge every chance | +92 | −168 (hedging is not free) |
| ALPHA rebate / spread income | — | ≈6% (no farming) |
| Avg run (autopilot) | 76 s, 4.6 collisions | BOARD 69 s / BIKE 88 s / POD 60 s, 0.2–0.7 collisions |
| Idle player | KNOCKOUT ~22 s | KNOCKOUT ~32 s |
| Sim CPU cost | — | 13 µs / frame, observe() 11 µs, learning review 128 ms once |

Not verified: real-device FPS (only headless SwiftShader CPU rendering, ~6–12 FPS, which says nothing about GPUs),
audio quality by ear, and human fun/difficulty.
