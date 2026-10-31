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
import { BLOCK, DEFAULT_CONFIG, EPISODE_MIX, EPISODE_PARAMS, LOT_SIZES, REGIME_PARAMS, type EpisodeKind, type LaneId, type RegimeId, type SimConfig } from './config';

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
  /** block orders sit physically in one lane: only quotes from that lane can trade with them */
  block?: LaneId;
};

/** hidden micro flow state (see EPISODE_MIX in config) */
export type Episode = { kind: EpisodeKind; startTick: number; endTick: number; side: 1 | -1 };

/** Public news: shown to the player from `tick` on (never earlier). */
export type NewsItem = { tick: number; kind: 'SWEEP' | 'REVEAL'; side: 1 | -1; text: string };

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
  /** v2 only */
  episodes: Episode[];
  news: NewsItem[];
  /** largest order lead time in ticks (for visibility windows) */
  maxLeadTicks: number;
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
  return config.model === 1 ? generateTapeV1(seed, config) : generateTapeV2(seed, config);
}

/** v1 model (regime-only order flow). Kept for comparison in Quant Lab / review scripts. */
export function generateTapeV1(seed: number, config: SimConfig = DEFAULT_CONFIG): MarketTape {
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

  return { seed, config: cfg, totalTicks, mid, regime, segments, orders, arrivals, headlines, episodes: [], news: [], maxLeadTicks: leadTicks };
}

const SWEEP_TEXT: Record<string, string[]> = {
  '-1': ['INDEX REBALANCE: PENSION FUND SELLING', 'MARGIN CALL LIQUIDATION — FORCED SELLERS', 'ETF OUTFLOW: BASKET SELL PROGRAM'],
  '1': ['INDEX INCLUSION: PASSIVE FUNDS BUYING', 'SHORT COVERING PROGRAM ANNOUNCED', 'ETF INFLOW: BASKET BUY PROGRAM'],
};
const REVEAL_TEXT: Record<string, string[]> = {
  '-1': ['GUIDANCE CUT CONFIRMED — EARLY SELLERS KNEW', 'DOWNGRADE PUBLISHED AFTER HEAVY SELLING'],
  '1': ['TAKEOVER BID CONFIRMED — EARLY BUYERS KNEW', 'UPGRADE PUBLISHED AFTER HEAVY BUYING'],
};

/**
 * v2 model: regimes (macro) × flow episodes (micro, hidden) × block orders × temporary impact.
 * mid = fundamental + temporary impact. Informed traders know the mid `infoHorizon` ahead.
 */
export function generateTapeV2(seed: number, config: SimConfig = DEFAULT_CONFIG): MarketTape {
  const cfg = config;
  const totalTicks = Math.round(cfg.duration / cfg.dt);
  const horizonTicks = Math.round(cfg.infoHorizon / cfg.dt);
  const leadTicks = Math.round(cfg.orderLead / cfg.dt);
  const blockLead = Math.round(BLOCK.lead / cfg.dt);
  const padded = totalTicks + horizonTicks + 2;
  const sec = (x: number) => Math.round(x / cfg.dt);

  const segments = buildSegments(seed, cfg, totalTicks);
  const regime: RegimeId[] = new Array(padded);
  const dir: number[] = new Array(padded);
  for (const s of segments) for (let i = s.startTick; i < s.endTick; i++) { regime[i] = s.regime; dir[i] = s.direction; }
  const last = segments[segments.length - 1];
  for (let i = totalTicks; i < padded; i++) { regime[i] = last.regime; dir[i] = last.direction; }

  // ---- episodes (hidden) ----
  const erng = createRng(hashSeed(seed, 'episodes'));
  const episodes: Episode[] = [];
  const epAt: Episode[] = new Array(padded);
  let t = 0;
  // the first seconds are always a calm, two-sided warm-up
  const warm: Episode = { kind: 'TWO_SIDED', startTick: 0, endTick: sec(4), side: 1 };
  episodes.push(warm);
  t = warm.endTick;
  let prevKind: EpisodeKind = 'TWO_SIDED';
  while (t < padded) {
    const r = regime[Math.min(t, padded - 1)];
    const mix = EPISODE_MIX[r];
    let u = erng.next();
    let kind: EpisodeKind = 'TWO_SIDED';
    for (const k of Object.keys(mix) as EpisodeKind[]) {
      if (u < mix[k]) { kind = k; break; }
      u -= mix[k];
    }
    if (kind === prevKind && kind !== 'TWO_SIDED' && erng.next() < 0.6) kind = 'TWO_SIDED';
    const len = kind === 'TWO_SIDED' ? erng.range(2, 6) : kind === 'TOXIC' ? erng.range(2.5, 5) : erng.range(2, 4);
    let side: 1 | -1 = erng.next() < 0.5 ? 1 : -1;
    if (r === 'TRENDING' && kind === 'TOXIC' && erng.next() < 0.7) side = dir[t] > 0 ? 1 : -1;
    if (r === 'CRASH' && (kind === 'TOXIC' || kind === 'SWEEP') && erng.next() < 0.8) side = -1;
    const ep: Episode = { kind, startTick: t, endTick: Math.min(padded, t + sec(len)), side };
    episodes.push(ep);
    t = ep.endTick;
    prevKind = kind;
  }
  for (const ep of episodes) for (let i = ep.startTick; i < ep.endTick && i < padded; i++) epAt[i] = ep;

  // ---- fundamental value ----
  const prng = createRng(hashSeed(seed, 'price'));
  const F = new Float64Array(padded + 1);
  F[0] = cfg.initialMid;
  const sqdt = Math.sqrt(cfg.dt);
  for (let i = 0; i < padded; i++) {
    const p = REGIME_PARAMS[regime[i]];
    let drift = 0;
    if (regime[i] === 'TRENDING') drift = p.drift * dir[i];
    else if (regime[i] === 'CRASH') drift = p.drift;
    const ep = epAt[i];
    if (ep.kind === 'TOXIC') drift += EPISODE_PARAMS.toxicDrift[regime[i]] * ep.side;
    let d = drift * cfg.dt + p.sigma * sqdt * prng.normal();
    if (p.jumpRate > 0 && prng.next() < p.jumpRate * cfg.dt) {
      let j = prng.normal() * p.jumpSize;
      if (regime[i] === 'CRASH') j = -Math.abs(j);
      d += j;
    }
    F[i + 1] = Math.max(1, F[i] + d);
  }

  // ---- order skeleton (sides of sweep orders are known before prices; informed sides need mid) ----
  const orng = createRng(hashSeed(seed, 'orders'));
  type Draft = TakerOrder & { kind: 'noise' | 'informed' | 'sweep'; urg: number };
  const drafts: Draft[] = [];
  let id = 0;
  for (let s0 = 0; s0 + leadTicks < totalTicks; s0++) {
    const arrive = s0 + leadTicks;
    const reg = regime[arrive];
    const p = REGIME_PARAMS[reg];
    const ep = epAt[arrive];
    const lambda = p.orderRate * EPISODE_PARAMS.rate[ep.kind] * cfg.dt;
    let n = 0;
    if (orng.next() < lambda) {
      n = 1;
      if (orng.next() < lambda * 0.5) n = 2;
    }
    for (let k = 0; k < n; k++) {
      const u = orng.next();
      const qtyDraw = orng.pick(LOT_SIZES);
      const queueDraw = orng.next();
      const sideDraw = orng.next();
      const urgDraw = orng.exp(1);
      const infoDraw = orng.range(0.5, 1.0);
      let kind: Draft['kind'] = 'noise';
      if (ep.kind === 'TOXIC' && u < EPISODE_PARAMS.toxicInformed) kind = 'informed';
      else if (ep.kind === 'SWEEP' && u < EPISODE_PARAMS.sweepOneSided) kind = 'sweep';
      else if (u < p.informedShare * 0.35) kind = 'informed';
      let side: Side;
      let qty: number = qtyDraw;
      let urg = urgDraw * p.noiseUrgency * EPISODE_PARAMS.urgency[ep.kind];
      if (kind === 'sweep') {
        side = ep.side > 0 ? 'BUY' : 'SELL';
        qty = qtyDraw >= 200 ? 300 : 200;
      } else {
        let pBuy = 0.5;
        if (reg === 'TRENDING') pBuy = dir[arrive] > 0 ? 0.55 : 0.45;
        if (reg === 'CRASH') pBuy = 0.4;
        if (ep.kind === 'TOXIC') pBuy = ep.side > 0 ? EPISODE_PARAMS.toxicHerd : 1 - EPISODE_PARAMS.toxicHerd;
        side = sideDraw < pBuy ? 'BUY' : 'SELL';
        if (ep.kind === 'RUSH') qty = qtyDraw >= 300 ? 200 : 100;
      }
      drafts.push({ id: id++, spawnTick: s0, arriveTick: arrive, side, qty, willingness: urg, informed: kind === 'informed', queueDraw, kind, urg: infoDraw });
    }
  }
  // block orders
  const brng = createRng(hashSeed(seed, 'blocks'));
  for (let s0 = sec(6); s0 + blockLead < totalTicks; s0++) {
    if (brng.next() >= BLOCK.ratePerSec * cfg.dt) continue;
    const arrive = s0 + blockLead;
    const ep = epAt[arrive];
    const lane = brng.int(0, 2) as LaneId;
    const qty = Math.round(brng.range(BLOCK.minQty, BLOCK.maxQty) / 100) * 100;
    const urg = brng.range(0.055, 0.16);
    const sideDraw = brng.next();
    const infoDraw = brng.range(0.7, 1.1);
    const informed = ep.kind === 'TOXIC';
    const sweep = ep.kind === 'SWEEP';
    const side: Side = sweep ? (ep.side > 0 ? 'BUY' : 'SELL') : sideDraw < 0.5 ? 'BUY' : 'SELL';
    drafts.push({ id: id++, spawnTick: s0, arriveTick: arrive, side, qty, willingness: urg, informed, queueDraw: brng.next() * 0.5, block: lane, kind: informed ? 'informed' : sweep ? 'sweep' : 'noise', urg: infoDraw });
  }
  drafts.sort((a, b) => a.arriveTick - b.arriveTick || a.id - b.id);

  // ---- temporary impact from sweep flow, then mid = F + I ----
  const impactAt = new Map<number, number>();
  for (const d of drafts) if (d.kind === 'sweep') impactAt.set(d.arriveTick, (impactAt.get(d.arriveTick) ?? 0) + (d.side === 'BUY' ? 1 : -1) * d.qty * EPISODE_PARAMS.sweepImpact);
  const decay = Math.pow(0.5, cfg.dt / EPISODE_PARAMS.impactHalfLife);
  const mid = new Float64Array(padded + 1);
  let I = 0;
  for (let i = 0; i <= padded; i++) {
    I = I * decay + (impactAt.get(i) ?? 0);
    mid[i] = Math.max(1, F[i] + I);
  }

  // ---- finalize informed orders (side & willingness from the future mid they know) ----
  const orders: TakerOrder[] = [];
  const arrivals = new Map<number, TakerOrder[]>();
  for (const d of drafts) {
    const o: TakerOrder = { id: d.id, spawnTick: d.spawnTick, arriveTick: d.arriveTick, side: d.side, qty: d.qty, willingness: d.willingness, informed: d.informed, queueDraw: d.queueDraw };
    if (d.block !== undefined) o.block = d.block;
    if (d.kind === 'informed') {
      const move = mid[Math.min(d.arriveTick + horizonTicks, padded)] - mid[d.arriveTick];
      o.side = move >= 0 ? 'BUY' : 'SELL';
      // informed traders pay up to most of the move they expect, but look like ordinary flow
      o.willingness = Math.max(Math.abs(move) * d.urg, d.block !== undefined ? d.willingness * 0.6 : 0);
    }
    orders.push(o);
  }
  // ids must equal array index
  orders.sort((a, b) => a.id - b.id);
  for (const o of orders) {
    const l = arrivals.get(o.arriveTick);
    if (l) l.push(o);
    else arrivals.set(o.arriveTick, [o]);
  }

  // ---- news: regime headlines + public sweep announcements + post-hoc reveals of toxic bursts ----
  const hrng = createRng(hashSeed(seed, 'news'));
  const headlines: Headline[] = segments.map((g) => {
    let text = hrng.pick(HEADLINES[g.regime]);
    if (g.regime === 'TRENDING') text += g.direction > 0 ? ' ▲' : ' ▼';
    return { tick: g.startTick, regime: g.regime, text };
  });
  const news: NewsItem[] = [];
  for (const ep of episodes) {
    if (ep.startTick >= totalTicks) break;
    if (ep.kind === 'SWEEP') news.push({ tick: ep.startTick, kind: 'SWEEP', side: ep.side, text: hrng.pick(SWEEP_TEXT[String(ep.side)]) });
    if (ep.kind === 'TOXIC' && hrng.next() < 0.5) news.push({ tick: Math.min(totalTicks - 1, ep.endTick + sec(1)), kind: 'REVEAL', side: ep.side, text: hrng.pick(REVEAL_TEXT[String(ep.side)]) });
  }
  news.sort((a, b) => a.tick - b.tick);

  return { seed, config: cfg, totalTicks, mid, regime, segments, orders, arrivals, headlines, episodes, news, maxLeadTicks: Math.max(leadTicks, blockLead) };
}
