# CLAUDE.md — QUANT RUSH

3D arcade game (Vite + React + R3F) about market making. Static site, deployable to Cloudflare Pages (`dist/`).

## Commands
- `npm run dev` — dev server
- `npm test` — Vitest (src/**/*.test.ts). Must stay green.
- `npm run build` — `tsc -b` + vite build (TypeScript errors fail the build)
- `npm run e2e` — Playwright smoke tests (desktop + mobile; uses SwiftShader WebGL flags)
- `npm run lab` / `npm run balance` — strategy comparison / difficulty check (vite-node)

## Architecture (keep these boundaries)
- `src/sim/` — pure financial simulator. NO imports from React/Three/DOM. Deterministic from a seed.
  - `tape.ts` pre-generates the market (prices, regimes, orders). The tape must never depend on player actions.
  - `engine.ts` is the only place money moves: `cash` and `inventory` are the single source of truth.
    `PnL = cash + inventory*mid - initialEquity`. Attribution fields are explanatory only — never add them to PnL.
  - `observe()` must not leak future data (`informed`, `willingness`, future mids). Tests enforce this.
- `src/game/session.ts` — action layer (movement, obstacles, gates, ALPHA DRIVE) at fixed 60 Hz; calls `engine.step` every 3 frames.
  Couplings to finance must be explicit and consistent (lane → spread, knockdown → quotes offline, ALPHA → rebate booked as its own line).
- `src/game/store.ts` — Zustand UI state + `dispatchEvents` (sim events → audio / fx / popups). Runtime objects live in `runtime`, not in React state.
- `src/scene/` — R3F components read the active session in `useFrame` (no per-frame React re-renders). Use pools/instancing.
- `src/ui/` — DOM overlay (HUD, title, results, learning).

## Conventions
- Tunables: market params in `src/sim/config.ts`, game rules in `GAME_RULES` (session.ts), content in `src/game/content.ts`.
- After changing market params run `npm run lab` and keep the "best lane differs by regime" property (also a unit test).
- After changing obstacle/gate params run `npm run balance` (target avg run ≈ 60–90 s).
- `window.__QUANT_RUSH__` exposes `{ runtime, useGame, autopilot }` for E2E tests.
- No external assets: textures are canvas-generated, audio is WebAudio-synthesized.
