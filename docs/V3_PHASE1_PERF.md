# v3 Phase 1 — rendering optimization (branch `feature/v3-intuitive`)

Gameplay unchanged: `src/game/golden.test.ts` (v2 fingerprint) is green; `src/sim` only gained an allocation-free
iterator (`engine.forEachVisibleOrder`) — same data as `visibleOrders()`.

## What changed
| Area | Before | After |
|---|---|---|
| Obstacles | 40 pooled groups × ~20 meshes | 9 InstancedMeshes (unit boxes scaled per instance, per-instance colour) |
| Order orbs | 28 groups × 6 meshes | 4 InstancedMeshes (core / halo / rings / arrow), pooled records, no per-frame Set/Map |
| Ramps & boost pads | 24 groups × 3 | 3 InstancedMeshes |
| Signs | 26 meshes, 26 textures | 1 InstancedMesh + 2048² sign atlas (per-instance UV rect) |
| Player | ~20 meshes | merged to 1–2 meshes (vertex colours) |
| Landmarks | 20–60 meshes each | static parts merged (haze in shader); only animated parts separate |
| City draw distance | 770 m of buildings (fog ends 380–560 m) | 616 m (HIGH) / 480 m (MEDIUM) / 370 m (LOW) with matching fog cap |
| Ground grid | 400 m wide additive plane | 64 m wide opaque plane |
| Lane strips | 3 full-length blended planes | only the active lane is drawn |
| Sky dome | shaded first, under the whole city | drawn after the opaque city with depth test |
| Allocations | `new Vector3` per frame (camera), Set/Map/filter (orbs/blocks) | reused objects |
| Particles | 900-slot loop + uploads every frame | skipped when nothing is alive |
| Material bend scan | every 30 frames | first 10 frames, then every 240 |
| Phones | AUTO→MEDIUM with bloom | **post-processing off by default** (only explicit HIGH gets a light bloom, never chromatic aberration), **DPR ≤ 1.5**, cheap facade sampling |
| MEDIUM bloom | full-res, 5 levels | half-res, 3 levels |
| FPS counter | optional, React state | on by default (dev), top-left, DOM-only updates; FPS · draw calls · triangles · tier |

## Measurements (headless Chromium, software WebGL — compare builds only; NOT a GPU/phone number)
Same seed (424242), same positions in all 5 districts, frames counted over 3 s each.

| | draw calls before → after | FPS before → after |
|---|---|---|
| Desktop LOW | 144–178 → **46–52** | 8.7 → **9.9** |
| Desktop MEDIUM | 170–205 → **57–66** | ≈3.4 → ≈3 (bound by resolution + post in software) |
| Desktop HIGH | 187–217 → **68–74** | ≈2.8 → ≈2.9 (bound by post in software) |
| Phone emulation (iPhone 13, AUTO) | 147–178 → **47–52** | 19.4 → **23.1** |

Draw calls are ~67% lower everywhere (this mostly helps real GPUs / mobile drivers, where per-call CPU cost is
significant). In software rendering the frame is fill-bound; the opaque ground grid and single lane strip gave the
measurable +14–19%. Real-device FPS must be checked on the preview URL with the on-screen counter.

Screenshots: `docs/screenshots/v3-phase1/` (scenery version top vs Phase 1 bottom; phone).
