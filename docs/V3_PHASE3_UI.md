# QUANT RUSH v3 — Phase 3: simpler HUD and thumb controls

Branch `feature/v3-intuitive`. UI only: gameplay is unchanged in this phase. The golden test
`tests/golden/gameplay-v3.json` passes unmodified, and scenery, rendering and quality tiers are untouched.

## The HUD in four elements
| # | Where | What | Why |
|---|---|---|---|
| 1 | top-left | **PnL** (large), score, combo chip, durability pips. Small rising `+$` / falling `−$` ticks show each gain or loss. | The number the game is about. Gains and losses are felt without per-fill popups. |
| 2 | top-center | **District and clock in one bar**: district name, progress to the gate, remaining seconds inside the bar. A red striped zone marks where the clock runs out at the current speed. | "Will I make the gate?" is answered at a glance. The clock has no separate readout. |
| 3 | top-right | **Market badge**: regime and one line of tape reading (e.g. 公表済みの大口フロー), plus pause. | Says why the glowing lane is where it is. |
| 4 | bottom | **RISK gauge** with a status line above it: `◀ 光るレーンへ` when you are off the glow, `QUOTES OFFLINE` when knocked down, `ROUTE LOCKED` in a fork. **ALPHA** (bottom-left) and **HEDGE** (bottom-right) are thumb buttons. HEDGE pulses gold when the gauge says HEDGE!. | One place for the main decision. The status line has its own row, so it can never cover the gauge (this fixes the reported overlap). |

## Removed or moved
| Item | Change |
|---|---|
| Tape panel (FLOW / MOM / VOL), speed readout | Moved to **PRO HUD** (Settings or Pause, off by default) for players who read the tape themselves. |
| Lane chips (±2¢ / ±5¢ / ±10¢) | Removed. The road already shows TIGHT / MID / WIDE and the glow. |
| Separate timer, 5-stop route strip, gate distance line | Merged into the district bar. |
| Big combo counter | Now a small chip under the score. |
| Camera button | Moved to the Pause menu (the C key still works). |

Popups:
- No per-fill popup (was 3–5 per second); the PnL ticks replace it.
- No full-width "◀◀ LEFT" banner when the glow moves; the road glow and the status line replace it.
- No RAMP popup; near-miss popups are smaller; TOXIC is shorter.

## First 5 seconds
- **Title screen:** three chips above the vehicle choice: ▲ 光るレーンを走る · $ 約定とコインで稼ぐ · ! RISK が溜まったら HEDGE.
- **Countdown (3.6 s):** each number carries one of those steps (① ② ③), so the rules are read before GO.

## Controls
| | PC | Phone |
|---|---|---|
| Lane | A/D, ←/→ | swipe left/right, or tap the left/right edge |
| Jump | W, ↑ | swipe up |
| HEDGE | SPACE | bottom-right button (96 px) |
| ALPHA | SHIFT, S, ↓ | bottom-left button (76×88 px), or swipe down |
| Pause | P, ESC | ‖ button |

On phones, the district bar gets its own full-width row, with PnL and the market badge under it.

## Verification
- `npm test`: 73 / 73.
- `npm run build`: OK.
- `npm run e2e`: 12 / 12, desktop and mobile. The new HUD test checks:
  - OFFLINE never overlaps the RISK gauge.
  - Thumb buttons sit in the corners; on mobile they are at least 72 px.
  - PnL, district bar and market badge don't collide.
  - The tape panel is hidden by default.
  - The live score equals `GameSession.score()`.
  - The HEDGE button works.
- The "wait until playing" step in the E2E tests now allows 45 s: the countdown is frame-capped, and software
  WebGL here is sometimes below 1 FPS while shaders compile. The same timeout happened before this phase.
- **FPS** (`scripts/dev/perf.cjs`, software rendering, same seed, 5 districts, two runs each):

  | | draw calls before → after | FPS before → after |
  |---|---|---|
  | desktop | 58 → 58–61 | 3.7 / 3.7 → 4.2 / 3.4 |
  | mobile | 53 → 53 | 11.7 / 11.3 → 11.9 / 11.8 |

  No measurable change. Absolute FPS here is not a GPU number.

## Screenshots
`docs/screenshots/v3-phase3/`:
- `before-*`: the Phase 2 HUD
- `pc-*` / `mobile-*`: title, countdown, play, high RISK, OFFLINE + RISK, OVERLOAD, PRO HUD

## Still to check with people
- Whether first-time players read the title and countdown steps.
- Whether the red "time runs out here" zone is understood without explanation.
- Thumb reach on large phones and in landscape.
