/**
 * Market "tape": the full exogenous market scenario for one seed.
 *
 * The tape (mid prices, regimes, taker orders, headlines) is generated up-front and does NOT
 * depend on player actions. Only fills / inventory / cash depend on the player. This makes:
 *   - same seed ⇒ identical market for every player or bot (fair strategy comparison)
 *   - same seed + same actions ⇒ identical result (replayability)
 *
 * The engine only ever reveals tape data at or before the current tick (plus orders that are
 * already "in flight" — visible taker orders on their way to the book). Future prices are never
 * exposed through the observation API.
 */
import { createRng, hashSeed } from './rng';
import { DEFAULT_CONFIG, LOT_SIZES, REGIME_PARAMS, type RegimeId, type SimConfig } from './config';

export type Side = 'BUY' | 'SELL'; // the TAKER's side. Taker BUY ⇒ we sell (inventory decreases)

export type TakerOrder = {
  id: number;
  /** tick the order becomes visible */
  spawnTick: number;
  /** tick the order reaches our quotes and may fill */
  arriveTick: number;
  side: Side;
  qty: number;
  /** max half-spread ($ away from mid) the taker is willing to pay */
  willingness: number;
  /** hidden: informed traders know the next infoHorizon seconds of price action */
  informed: boolean;
  /** hidden: uniform draw deciding queue priority vs. competing market makers */
  queueDraw: number;
};

export type Segment = { regime: RegimeId; startTick: number; endTick: number; direction: 1 | -1 };

export type Headline = { tick: number; regime: RegimeId; text: string };

export type MarketTape = {
  seed: number;
  config: SimConfig;
  totalTicks: number;
  /** mid[t] for t = 0..totalTicks + horizon padding */
  mid: Float64Array;
  regime: RegimeId[];
  segments: Segment[];
  orders: TakerOrder[];
  /** orders indexed by arrival tick */
  arrivals: Map<number, TakerOrder[]>;
  headlines: Headline[];
};

const HEADLINES: Record<RegimeId, string[]> = {
  CALM: ['MARKETS QUIET AHEAD OF DATA', 'LIQUIDITY RETURNS — SPREADS TIGHTEN', 'VOLUMES LIGHT IN NEO-TOKYO SESSION', 'CALM RETURNS TO THE TAPE'],
  TRENDING: ['CENTRAL BANK SURPRISE — MOMENTUM BUILDS', 'FUNDS CHASE THE TREND', 'EARNINGS BEAT — FLOWS ONE-SIDED', 'MACRO DATA SHIFTS EXPECTATIONS'],
  VOLATILE: ['VOLATILITY SPIKES — VIX JUMPS', 'CONFLICTING HEADLINES WHIPSAW PRICES', 'ALGO FLOWS AMPLIFY SWINGS', 'OPTIONS EXPIRY CHURN'],
  CRASH: ['FLASH CRASH — LIQUIDITY VANISHES', 'MARGIN CALLS CASCADE', 'SYSTEMIC SHOCK — SELL EVERYTHING', 'CIRCUIT BREAKER WARNING'],
};

function buildSegments(seed: number, cfg: SimConfig, totalTicks: number): Segment[] {
  const rng = createRng(hashSeed(seed, 'regimes'));
  const sec = (s: number) => Math.round(s / cfg.dt);
  const segments: Segment[] = [];
  // crash windows: one likely in the first act, more possible in long runs / overtime
  const crashStarts: number[] = [];
  if (rng.next() < cfg.crashChance) crashStarts.push(sec(rng.range(35, 58)));
  if (rng.next() < 0.6) crashStarts.push(sec(rng.range(105, 135)));
  if (rng.next() < 0.7) crashStarts.push(sec(rng.range(170, 200)));
  let ci = 0;
  let t = 0;
  let prev: RegimeId = 'CALM';
  const push = (regime: RegimeId, len: number) => {
    const end = Math.min(t + len, totalTicks);
    if (end <= t) return;
    segments.push({ regime, startTick: t, endTick: end, direction: rng.next() < 0.5 ? 1 : -1 });
    t = end;
    prev = regime;
  };
  push('CALM', sec(rng.range(9, 13)));
  while (t < totalTicks) {
    const crashStart = ci < crashStarts.length ? crashStarts[ci] : Infinity;
    if (t + sec(4) >= crashStart) {
      push('CRASH', sec(rng.range(6, 8)));
      push('VOLATILE', sec(rng.range(6, 9)));
      ci++;
      continue;
    }
    const options = (['CALM', 'TRENDING', 'VOLATILE'] as RegimeId[]).filter((r) => r !== prev);
    const next = rng.pick(options);
    let len = sec(rng.range(8, 14));
    if (t + len > crashStart) len = Math.max(sec(4), crashStart - t);
    push(next, len);
  }
  return segments;
}

export function generateTape(seed: number, config: SimConfig = DEFAULT_CONFIG): MarketTape {
  const cfg = config;
  const totalTicks = Math.round(cfg.duration / cfg.dt);
  const horizonTicks = Math.round(cfg.infoHorizon / cfg.dt);
  const leadTicks = Math.round(cfg.orderLead / cfg.dt);
  const padded = totalTicks + horizonTicks + 2;

  const segments = buildSegments(seed, cfg, totalTicks);
  const regime: RegimeId[] = new Array(padded);
  const dir: number[] = new Array(padded);
  for (const s of segments) {
    for (let i = s.startTick; i < s.endTick; i++) {
      regime[i] = s.regime;
      dir[i] = s.direction;
    }
  }
  const last = segments[segments.length - 1];
  for (let i = totalTicks; i < padded; i++) {
    regime[i] = last.regime;
    dir[i] = last.direction;
  }

  // ---- price path (arithmetic random walk with drift + jumps) ----
  const prng = createRng(hashSeed(seed, 'price'));
  const mid = new Float64Array(padded + 1);
  mid[0] = cfg.initialMid;
  const sqdt = Math.sqrt(cfg.dt);
  for (let i = 0; i < padded; i++) {
    const p = REGIME_PARAMS[regime[i]];
    let drift = 0;
    if (regime[i] === 'TRENDING') drift = p.drift * dir[i];
    else if (regime[i] === 'CRASH') drift = p.drift;
    let d = drift * cfg.dt + p.sigma * sqdt * prng.normal();
    if (p.jumpRate > 0 && prng.next() < p.jumpRate * cfg.dt) {
      let j = prng.normal() * p.jumpSize;
      if (regime[i] === 'CRASH') j = -Math.abs(j);
      d += j;
    }
    mid[i + 1] = Math.max(1, mid[i] + d);
  }

  // ---- taker order flow ----
  const orng = createRng(hashSeed(seed, 'orders'));
  const orders: TakerOrder[] = [];
  const arrivals = new Map<number, TakerOrder[]>();
  let id = 0;
  // the first orders spawn at tick 0 and arrive after the lead time
  for (let s = 0; s + leadTicks < totalTicks; s++) {
    const arrive = s + leadTicks;
    const p = REGIME_PARAMS[regime[arrive]];
    // Poisson thinning per tick (rate * dt << 1)
    const lambda = p.orderRate * cfg.dt;
    let n = 0;
    if (orng.next() < lambda) {
      n = 1;
      if (orng.next() < lambda * 0.5) n = 2;
    }
    for (let k = 0; k < n; k++) {
      const informed = orng.next() < p.informedShare;
      const qty = orng.pick(LOT_SIZES);
      const queueDraw = orng.next();
      let side: 'BUY' | 'SELL';
      let willingness: number;
      if (informed) {
        // informed traders know mid at arrive + horizon
        const move = mid[Math.min(arrive + horizonTicks, padded)] - mid[arrive];
        side = move >= 0 ? 'BUY' : 'SELL';
        willingness = Math.abs(move) * orng.range(0.5, 1.0);
      } else {
        // noise traders: side is a coin flip, slightly biased with the trend (herding)
        let pBuy = 0.5;
        if (regime[arrive] === 'TRENDING') pBuy = dir[arrive] > 0 ? 0.55 : 0.45;
        if (regime[arrive] === 'CRASH') pBuy = 0.35;
        side = orng.next() < pBuy ? 'BUY' : 'SELL';
        willingness = orng.exp(p.noiseUrgency);
      }
      const order: TakerOrder = { id: id++, spawnTick: s, arriveTick: arrive, side, qty, willingness, informed, queueDraw };
      orders.push(order);
      const list = arrivals.get(arrive);
      if (list) list.push(order);
      else arrivals.set(arrive, [order]);
    }
  }

  // ---- headlines at each regime change (shown when the regime starts — never before) ----
  const hrng = createRng(hashSeed(seed, 'news'));
  const headlines: Headline[] = segments.map((s) => {
    let text = hrng.pick(HEADLINES[s.regime]);
    if (s.regime === 'TRENDING') text += s.direction > 0 ? ' ▲' : ' ▼';
    return { tick: s.startTick, regime: s.regime, text };
  });

  return { seed, config: cfg, totalTicks, mid, regime, segments, orders, arrivals, headlines };
}
