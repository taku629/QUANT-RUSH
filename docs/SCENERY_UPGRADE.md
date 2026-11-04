# Scenery upgrade (branch `feature/scenery-upgrade`)

Goal: make the five districts look like **different places** without changing a single game rule.
Base: `v2.0.0-prototype` = `9756d6c` (head of PR #1 on 2026-11-01).

## Preserved versions

| Version | Commit | Tag (created) | Archive branch (pushed) | Restore check |
|---|---|---|---|---|
| v1 prototype | `ad253d1` (last commit before any v2 work; head of PR #1 when it was opened) | `v1.0.0-prototype` | `archive/v1` | fresh clone → `npm ci` → build OK → 35/35 tests |
| v2 prototype | `9756d6c` (head of PR #1 today) | `v2.0.0-prototype` | `archive/v2` | fresh clone → `npm ci` → build OK → 53/53 tests |

Note: the tags were created as annotated tags, but **pushing tags was refused by the session's git proxy (HTTP 403)**,
so they exist only in the build container. The archive branches *are* on GitHub. To publish the tags from your machine:

```bash
git fetch origin
git tag -a v1.0.0-prototype ad253d1639022d59a51d7a01ed5aa782d3746788 -m "QUANT RUSH v1 prototype"
git tag -a v2.0.0-prototype 9756d6c045d93370191d3e147448c6afa3382adc -m "QUANT RUSH v2 prototype"
git push origin v1.0.0-prototype v2.0.0-prototype
```

## What changed (visual only)

| District | Silhouette & facades | Rooflines | Street level | Landmark (road passes through/under it) | Sky / light |
|---|---|---|---|---|---|
| 兜町 KABUTOCHO | low (7–22 m), wide stone facades with pilasters and tall warm windows | vermilion flared eaves | lantern posts, granite paving, stone curbs, LED ticker fence, vermilion street gates | classical exchange hall colonnade + pediment + floating ticker ring | deep indigo, warm key light |
| 大手町 OTEMACHI | towering (55–140 m) dark glass curtain walls | stepped glass crowns, antennas | skybridges high over the road, elevated expressway behind the street wall, glass canopies, steel paving | twin glass towers with gold edges and two sky bridges | cold blue haze, longer view |
| 丸の内 MARUNOUCHI | even 18–26 m red-brick street wall, arched windows, white stone bands | white cornices (orderly roofline) | avenue trees, warm lamp posts, low hedges, arched underpass, brick herringbone paving | domed red-brick station with a central arch | warm amber night |
| 六本木 ROPPONGI | slender towers up to 170 m, near-black with vertical neon fins | setback upper towers + spires | light pillars, distant elevated interchange ramps, sweeping searchlights, purple LED paving | red/white lattice tower straddling the road | violet haze, longest view |
| 渋谷 SHIBUYA | dense 16–52 m commercial blocks covered with sign panels | rooftop billboards facing the road | scramble crossing stripes, giant facade screens, street kiosks, hanging banners, LED tiles | giant LED screen bridge over the crossing + cylindrical tower | bright, dense, short view |

Also: a far-skyline band per district (low roofs / tower wall / station & domes / hills & towers / dense blocks),
per-district signage styles (shop boards, corporate plates, brass plates, neon tubes, pop colours),
an open plaza around each landmark so its silhouette reads from far away, and a district title card when you enter
a new district (shown after the existing RISK CHECK popup; top of screen; never captures input).

Landmarks sit at the middle of each district — the spawner's obstacle-free *breather* section — and emerge from the
haze from roughly 400 m away. Tests check every landmark vertex stays out of the road corridor (|x| < 9 m below 12 m)
and every decor piece stays off the lanes (|x| < 6.5 m below 5 m).

## What did NOT change

`src/sim/**` is byte-identical to v2. In `src/game/`, only `store.ts` changed (the district-entry popup became the title
card — display only). Session, spawner, content, autopilot, coach, ghost, input, track: unchanged.

**Golden gameplay test** (`src/game/golden.test.ts`, baseline recorded on `v2.0.0-prototype` *before* any scenery change):
3 seeds × 3 vehicles, scripted inputs; prices, orders, fills, inventory path, cash, PnL, hedges, ALPHA activations,
obstacle & pickup placement, collisions, near misses, gates, remaining time, distance, end reason and final score must
match exactly — they do.

## Performance

Measured in headless Chromium with **software** WebGL (SwiftShader — not representative of a GPU), LOW tier
(no post-processing so draw calls are countable), same seed and positions, 5 districts:

| | draw calls | triangles | FPS (software) |
|---|---|---|---|
| v2 | 139–180 | 24.8k–30.2k | mean 11.3 |
| scenery upgrade | 144–178 | 19.6k–29.0k | mean 8.5 |

- Buildings: one InstancedMesh with a per-instance facade style (atlas) + one roofline mesh + spires.
- Decor families for districts that are neither current nor next are not drawn at all.
- LOW tier: facade sampled without mipmaps (measured ~1.6× faster fill in software), far skyline and sidewalk paving off.
- The remaining gap is per-pixel (fill) cost: at 320×180 the two builds run at the same FPS (33 vs 30).
  Real-device GPU measurements were not possible in this environment.

## Screenshots (`docs/screenshots/scenery-upgrade/`)

Same seed (424242), same deterministic inputs, game clock frozen while rendering (test hook only), 1280×720 and iPhone 13.

- `overview-before-top-after-bottom.jpg` — 5 districts, v2 (top) vs upgrade (bottom)
- `compare-1-kabutocho.jpg` … `compare-5-shibuya.jpg` — per district, near the landmark and on the street
- `landmarks-far-top-near-bottom.jpg` — landmarks from ~350 m and ~110 m
- `gate-transition.jpg` — 大手町 → 丸の内 across the settlement gate, v2 vs upgrade
- `mobile-before-top-after-bottom.jpg` — portrait phone
- `low-quality-before-top-after-bottom.jpg` — LOW tier
- `district-title-card.jpg` — entry card on PC and phone
