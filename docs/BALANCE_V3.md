# QUANT RUSH v3 — balance review (rules revision v3.1)

> **These are computer models, not a human playtest.** Every number below comes from scripted player
> models (`scripts/lib/playModels.ts`). They have a reaction delay, a distraction delay, jump-timing
> noise and a chance to overlook an obstacle. Real people read the screen, learn, panic, get bored and
> misread the UI in ways none of this captures. Use these results to compare rule variants, then confirm
> them with people.

Reproduce: `npm run playstyles -- 80 81 --bursts` (80 holdout seeds 81–160; tuning used seeds 1–80).

## Versioning — what is separate from v2
- v1 / v2 rules are frozen on `archive/v1` / `archive/v2` (tags `v1.0.0-prototype` / `v2.0.0-prototype`).
  `tests/golden/gameplay-v2.json` is unchanged.
- The scenery branch (`feature/scenery-upgrade`, PR #2) is untouched.
- All v3 rule changes live in the game layer:
  - values in `src/game/gameBalanceConfig.ts` (`RULES_VERSION = 'v3.1'`)
  - logic in `session.ts` and `recommend.ts`
- The market simulator `src/sim/` is unchanged, apart from one optional `computeScore` parameter whose
  default keeps v1/v2 scoring (and the Quant Lab) identical.
- `tests/golden/gameplay-v3.json` was re-recorded on purpose for v3.1. The v3.0 record is in git history
  at commit d33c0e3.

## Player models (same seeds for every style)
| Model | reaction | distraction (mean) | jump error | overlooked obstacles | decision |
|---|---|---|---|---|---|
| BOT | 0 | 0 | 0 | 0 | built-in autopilot (reference only) |
| BEGINNER | 0.9 s | 1.2 s | 0.11 s | 8 % | follow glow, hedge at the HEDGE! prompt (70 %) |
| CASUAL | 0.55 s | 0.6 s | 0.07 s | 4 % | follow glow, hedge at 70 % |
| SKILLED / GREEDY | 0.35 s | 0.25 s | 0.04 s | 1.5 % | follow glow, hedge at 85 % / 95 % |
| CASUAL decision variants | as CASUAL | | | | hedge at 40 % / never / at 95 %; fixed lanes; THINKER (own tape reading: pre-hedge before blocks, cut one-sided risk early, tight lane in calm rush); block reader / gambler |

All models read the RISK banner before a gate and react to the red OVERLOAD state like any other prompt.

## 1. Forced liquidations (RISK BURST)
**Finding (v3.0):** a burst was mostly impossible to avoid:
- From 70 % to 100 % took a median of **0.15 s**: one 100–300-share lot moved the gauge 11–33 % at once.
- 27 % of bursts skipped the warning zone entirely.
- 57 % hit 100 % while HEDGE was still on its 3 s cooldown.
- Even a player hedging at 40 % burst 5 times per run.

**v3.1 rules**
- The gauge climbs toward the exposure at no more than **35 %/s**. It falls quickly and is empty after a settlement.
- At 100 % a visible **OVERLOAD countdown (1.5 s)** starts. It only runs while HEDGE is usable.
- A burst is a clear failure:
  - money: a penalty fill, booked as hedge cost
  - score: −1,500 points
  - clock: −3 s
  - combo is lost

Bursts per run, holdout seeds:

| Model | v3.0 | v3.1 | runs with ≥ 1 burst (v3.1) |
|---|---|---|---|
| BOT | 3.48 | 0.00 | 0 % |
| SKILLED | 4.17 | 0.01 | 1 % |
| GREEDY (skilled, hedges at 95 %) | 4.64 | 0.04 | 4 % |
| CAUTIOUS (hedges at 40 %) | 5.14 | 0.05 | 5 % |
| CASUAL | 5.59 | 0.20 | 19 % |
| CASUAL CHICKEN (casual, hedges at 95 %) | 6.60 | 0.40 | 36 % |
| BEGINNER | 6.36 | 0.81 | 55 % |
| NO-HEDGE | 6.66 | 2.16 | 98 % |

Warning time, v3.0 → v3.1:
- From 70 % to 100 %: median 0.15 s → 0.85 s, plus the 1.5 s countdown.
- Bursts reached on cooldown: 57 % → 2%.

A burst is now caused by attention or greed, not by luck. The BEGINNER model (mean 2.1 s from prompt to
key press) still bursts about once every two runs. Check this with people. If it is too harsh, the levers are
`risk.riseRate` and `risk.burstGrace`.

## 2. The glowing lane vs. money
**Finding (v3.0):**
- The glow copied the SIGNAL READER bot, which calls short-lived switches to the tight lane.
- With hysteresis and a human reaction delay, most of those calls arrived after the opportunity.
- The score barely depended on money:
  - PnL was about 2 % of the bot's score.
  - Fills were scored on the spread alone, ×1.5 in the glowing lane.
  - Coins gave 60 points × combo.
- Result: the cautious style ranked 2nd in score while losing money, and fixed-right (best PnL among the
  human models) ranked 8th.

**v3.1 rules: financial judgement and score point the same way**
- **Robust lane policy:**
  - RIGHT in fast or one-sided markets (VOLATILE / CRASH / ONE_SIDED / ANNOUNCED, or a fast trend)
  - LEFT only in a calm market with busy two-sided flow
  - CENTER otherwise
  - The glow reacts faster (confirm 0.5 s, hold 1.5 s) and stays put during the first 8 s (intro).
- **No artificial lane bonus.** The ×1.5 glowing-lane multiplier is gone, and coins are 15 points (were 60).
  Coins still fill the ALPHA gauge.
- **Fills are scored on their 2-second markout** (spread ± price move), so toxic fills lose points.
- **PnL weight** in the final score is 20 points/$ (v1/v2: 10).
- **Settlement bonus only from 70 % (the sweet spot).** Small hedges are safe but earn no bonus: two-sided
  flow often nets them out for free, while a hedge always costs money.

Holdout seeds, PnL / RAR / score:

| Model | v3.0 PnL | v3.1 PnL | v3.1 max DD | v3.1 RAR | v3.1 score |
|---|---|---|---|---|---|
| CASUAL follow | −137 | +2 | 706 | 0.17 | 33.6k |
| SKILLED follow | −18 | +161 | 734 | 0.48 | 48.3k |
| CAUTIOUS follow (hedge 40 %) | −134 | +116 | 677 | 0.42 | 42.5k |
| THINKER (follow + own reading) | −107 | +296 | 600 | 0.76 | 46.8k |
| FIXED RIGHT (casual) | +102 | +89 | 650 | 0.41 | 30.5k |
| FIXED CENTER (casual) | −484 | −258 | 920 | −0.29 | 25.1k |
| FIXED LEFT (casual) | −990 | −462 | 938 | −0.67 | 11.7k |

- Rank correlation of score with PnL over all 14 models went from 0.83 to 0.88, and with RAR from 0.82 to 0.89.
- Remaining caveat: for the CASUAL model, following the glow is about as profitable as sitting in the right
  lane (+$2 / +$81 on holdout / tuning vs. +$89 / +$89; within noise, about ±$70). Right-lane-only also has a
  smaller drawdown.
  - Following wins on score and run length, and clearly wins for skilled players and early hedgers.
  - This reflects the market model: wide quotes are a strong, low-risk default in `src/sim`.
  - Changing that is a market-model change, which would also change v2 / Quant Lab, so it was not done here.

## 3. Is it just "follow the gold"?
**Finding:** the 95 % time-in-lane and 0.1 collisions/run figures came from the perfect autopilot. The human models
spend 81–92 % in the glowing lane and collide 0.2–0.9 times per minute.

**v3.1:** decisions the glow does not make for you now move the result. At the **same** casual motor skill (holdout):

| Decision style | PnL | score |
|---|---|---|
| THINKER (reads the tape, pre-hedges before blocks) | +296 | 46.8k |
| CAUTIOUS hedging | +116 | 42.5k |
| BLOCK READER (takes blocks only when announced / wide lane) | +32 | 36.5k |
| plain follow, hedge at prompt | +2 | 33.6k |
| CHICKEN (waits to 95 %) | +13 | 31.2k |
| GAMBLER (chases every block) | −52 | 33.1k |
| NO-HEDGE | −73 | 10.8k |

- Following the glow is a safe, beginner-friendly baseline, not the best play.
- Low barriers and ramps in the glowing lane now become more frequent per district (30 % → 54 % of rows), so
  timing skill matters later in a run.
- Block orders are still weak as a decision: reading them only limits losses versus chasing them; it does not
  turn them into a clear win. Worth revisiting with people.

## Run length (`npm run balance`, autopilot)
- board 90 s, bike 127 s, pod 73 s, idle 38 s.
- Human models on board: BEGINNER 72 s, CASUAL 84 s, SKILLED 98 s.
- The bike was already the longest in v3.0 (103 s). Check vehicle balance in a playtest.

## Not covered by these models (needs people)
- Whether the OVERLOAD countdown and the alarm are noticed in time.
- Whether a lane that moves every ≥ 1.5 s feels nervous.
- Whether "no bonus below 70 %" reads as fair.
- Whether players understand markout scoring (TOXIC −pts popups).
- Whether the glowing lane is trusted too much or too little.
- Fatigue, learning across runs, and mobile thumb reach.
