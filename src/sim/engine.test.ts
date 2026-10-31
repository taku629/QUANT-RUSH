import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, LANES, type LaneId } from './config';
import { MarketMakerEngine, type Action } from './engine';
import { createRng } from './rng';
import { FixedSpreadStrategy, InventoryAwareStrategy, RandomStrategy, replay, runEpisode } from './strategies';
import { generateTape, type MarketTape, type TakerOrder } from './tape';
import { computeScore, riskStats } from './scoring';
import { buildReview } from './analysis';


/** Build a hand-made tape with a flat price and given orders, for exact accounting checks. */
function flatTape(orders: Partial<TakerOrder>[], mids?: number[]): MarketTape {
  const base = generateTape(1);
  const mid = new Float64Array(base.mid.length).fill(100);
  if (mids) mids.forEach((m, i) => (mid[i] = m));
  const arrivals = new Map<number, TakerOrder[]>();
  const full = orders.map((o, i) => {
    const t: TakerOrder = { id: i, spawnTick: 0, arriveTick: 1, side: 'BUY', qty: 100, willingness: 1, informed: false, queueDraw: 0, ...o };
    const l = arrivals.get(t.arriveTick) ?? [];
    l.push(t);
    arrivals.set(t.arriveTick, l);
    return t;
  });
  return { ...base, mid, orders: full, arrivals, regime: base.regime.map(() => 'CALM'), segments: [{ regime: 'CALM', startTick: 0, endTick: base.totalTicks, direction: 1 }], headlines: [], news: [] };
}

const idle = (lane: LaneId = 1): Action => ({ lane, hedge: false });

describe('RNG & tape determinism', () => {
  it('same seed ⇒ identical tape', () => {
    const a = generateTape(12345);
    const b = generateTape(12345);
    expect(Array.from(a.mid)).toEqual(Array.from(b.mid));
    expect(a.orders).toEqual(b.orders);
    expect(a.segments).toEqual(b.segments);
  });
  it('different seed ⇒ different market', () => {
    expect(generateTape(1).mid[500]).not.toBe(generateTape(2).mid[500]);
  });
  it('rng is uniform-ish and normal has ~unit variance', () => {
    const r = createRng(9);
    let s = 0, s2 = 0;
    for (let i = 0; i < 20000; i++) {
      const z = r.normal();
      s += z;
      s2 += z * z;
    }
    expect(Math.abs(s / 20000)).toBeLessThan(0.03);
    expect(Math.abs(s2 / 20000 - 1)).toBeLessThan(0.05);
  });
  it('tape covers all four regimes across seeds and starts CALM', () => {
    const seen = new Set<string>();
    for (let s = 1; s < 30; s++) {
      const t = generateTape(s);
      expect(t.segments[0].regime).toBe('CALM');
      t.segments.forEach((g) => seen.add(g.regime));
    }
    expect(seen).toEqual(new Set(['CALM', 'TRENDING', 'VOLATILE', 'CRASH']));
  });
});

describe('fills & accounting', () => {
  it('taker BUY fills at ask: cash up, inventory down, spread captured', () => {
    const e = new MarketMakerEngine(flatTape([{ side: 'BUY', qty: 200 }]));
    e.step(idle(1));
    const ev = e.step(idle(1));
    expect(ev.fills).toHaveLength(1);
    const h = LANES[1].halfSpread;
    expect(ev.fills[0].price).toBeCloseTo(100 + h, 10);
    expect(e.inventory).toBe(-200);
    expect(e.cash).toBeCloseTo(DEFAULT_CONFIG.initialCash + 200 * (100 + h), 8);
    expect(e.pnl).toBeCloseTo(200 * h, 8); // flat price ⇒ PnL = spread
    expect(e.spreadPnL).toBeCloseTo(200 * h, 8);
  });

  it('taker SELL fills at bid and builds long inventory', () => {
    const e = new MarketMakerEngine(flatTape([{ side: 'SELL', qty: 100 }]));
    e.step(idle(0));
    e.step(idle(0));
    expect(e.inventory).toBe(100);
    expect(e.fills[0].price).toBeCloseTo(100 - LANES[0].halfSpread, 10);
  });

  it('wider spread ⇒ fewer fills but more per fill (willingness gate)', () => {
    const orders = [{ willingness: 0.03 }, { willingness: 0.07, arriveTick: 2 }, { willingness: 0.2, arriveTick: 3 }];
    const res = ([0, 1, 2] as LaneId[]).map((lane) => {
      const e = new MarketMakerEngine(flatTape(orders));
      for (let i = 0; i < 5; i++) e.step(idle(lane));
      return { fills: e.fills.length, perFill: e.spreadPnL / Math.max(1, e.fills.length) };
    });
    expect(res.map((r) => r.fills)).toEqual([3, 2, 1]);
    expect(res[0].perFill).toBeLessThan(res[1].perFill);
    expect(res[1].perFill).toBeLessThan(res[2].perFill);
  });

  it('queue priority: lower win probability on wide lanes', () => {
    const e = new MarketMakerEngine(flatTape([{ queueDraw: 0.8 }]));
    e.step(idle(2));
    const ev = e.step(idle(2));
    expect(ev.misses[0].reason).toBe('QUEUE'); // 0.8 ≥ 0.75
    const e2 = new MarketMakerEngine(flatTape([{ queueDraw: 0.8 }]));
    e2.step(idle(0));
    expect(e2.step(idle(0)).fills).toHaveLength(1); // 0.8 < 0.95
  });

  it('position limit caps inventory (partial fill, then LIMIT)', () => {
    const orders = Array.from({ length: 6 }, (_, i) => ({ side: 'SELL' as const, qty: 300, arriveTick: i + 1 }));
    const e = new MarketMakerEngine(flatTape(orders));
    let limit = false;
    for (let i = 0; i < 8; i++) limit = e.step(idle(0)).limitHit || limit;
    expect(e.inventory).toBe(DEFAULT_CONFIG.positionLimit);
    expect(limit).toBe(true);
    expect(e.misses.some((m) => m.reason === 'LIMIT')).toBe(true);
  });

  it('offline quotes never fill', () => {
    const e = new MarketMakerEngine(flatTape([{}]));
    e.step({ lane: 0, hedge: false, quoting: false });
    const ev = e.step({ lane: 0, hedge: false, quoting: false });
    expect(ev.fills).toHaveLength(0);
    expect(ev.misses[0].reason).toBe('OFFLINE');
  });

  it('hedge flattens inventory, charges cost once, respects cooldown', () => {
    const orders = [{ side: 'SELL' as const, qty: 300 }, { side: 'SELL' as const, qty: 300, arriveTick: 5 }];
    const e = new MarketMakerEngine(flatTape(orders));
    e.step(idle(0));
    e.step(idle(0));
    expect(e.inventory).toBe(300);
    const pnlBefore = e.pnl;
    const ev = e.step({ lane: 0, hedge: true });
    expect(ev.hedge).not.toBeNull();
    expect(e.inventory).toBe(0);
    const c = e.hedgeCostPerShare();
    expect(ev.hedge!.cost).toBeCloseTo(300 * c, 10);
    expect(e.pnl).toBeCloseTo(pnlBefore - 300 * c, 8); // cost hits PnL exactly once
    for (let i = 0; i < 3; i++) e.step(idle(0)); // second order fills at tick 5
    expect(e.inventory).toBe(300);
    expect(e.step({ lane: 0, hedge: true }).hedgeRejected).toBe('COOLDOWN');
  });

  it('hedge when flat is rejected and costs nothing', () => {
    const e = new MarketMakerEngine(flatTape([]));
    const ev = e.step({ lane: 1, hedge: true });
    expect(ev.hedgeRejected).toBe('FLAT');
    expect(e.pnl).toBe(0);
  });

  it('inventory is marked to market: long inventory loses when price drops', () => {
    const mids = [100, 100, 100, 99, 99];
    const e = new MarketMakerEngine(flatTape([{ side: 'SELL', qty: 100 }], mids));
    for (let i = 0; i < 4; i++) e.step(idle(0));
    // bought 100 @ 99.98, price 99 ⇒ PnL = 100 × (99 − 99.98)
    expect(e.pnl).toBeCloseTo(100 * (99 - (100 - LANES[0].halfSpread)), 8);
    expect(e.inventoryPnL).toBeCloseTo(-100, 8);
  });

  it('rebate is booked separately and only when active', () => {
    const e = new MarketMakerEngine(flatTape([{ qty: 200 }]));
    e.step({ lane: 1, hedge: false, rebate: true });
    e.step({ lane: 1, hedge: false, rebate: true });
    expect(e.rebatePnL).toBeCloseTo(200 * DEFAULT_CONFIG.rebatePerShare, 10);
    expect(e.pnl).toBeCloseTo(200 * LANES[1].halfSpread + 200 * DEFAULT_CONFIG.rebatePerShare, 8);
  });

  it('markout flags toxic fills (price moved against us) and breaks combo', () => {
    const mids = Array(200).fill(100);
    for (let i = 2; i < 200; i++) mids[i] = 101; // price jumps up right after we sold
    const e = new MarketMakerEngine(flatTape([{ side: 'BUY', qty: 100 }], mids));
    let broke = false;
    for (let i = 0; i < 60; i++) broke = e.step(idle(1)).comboBroken === 'TOXIC' || broke;
    expect(e.fills[0].toxic).toBe(true);
    expect(e.fills[0].markout).toBeCloseTo(-100 * (101 - 100.05), 8);
    expect(broke).toBe(true);
  });
});

describe('PnL integrity on real simulated markets', () => {
  const strategies = () => [new FixedSpreadStrategy(0), new FixedSpreadStrategy(2, 500), new InventoryAwareStrategy(), new RandomStrategy(3)];
  for (const seed of [1, 42, 777, 2024, 99991]) {
    it(`seed ${seed}: PnL = cash + inv×mid − equity = spread + rebate − hedge + inventoryPnL`, () => {
      for (const s of strategies()) {
        const { engine: e } = runEpisode(seed, s, 120);
        const direct = e.cash + e.inventory * e.mid - e.initialEquity;
        expect(e.pnl).toBeCloseTo(direct, 9);
        expect(e.spreadPnL + e.rebatePnL - e.hedgeCost + e.inventoryPnL).toBeCloseTo(e.pnl, 6);
        const byRegime = Object.values(e.inventoryPnLByRegime).reduce((a, b) => a + b, 0);
        expect(byRegime).toBeCloseTo(e.inventoryPnL, 6);
        expect(Math.abs(e.inventory)).toBeLessThanOrEqual(e.cfg.positionLimit);
        // spread line equals sum of per-fill spreads (no double counting)
        expect(e.fills.reduce((a, f) => a + f.spread, 0)).toBeCloseTo(e.spreadPnL, 6);
        expect(e.hedges.reduce((a, h) => a + h.cost, 0)).toBeCloseTo(e.hedgeCost, 6);
        // cash flow reconciliation from the trade blotter
        const cashFlow = -e.fills.reduce((a, f) => a + f.qty * f.price - f.rebate, 0) - e.hedges.reduce((a, h) => a + h.qty * h.price, 0);
        expect(e.cash - e.cfg.initialCash).toBeCloseTo(cashFlow, 6);
        const invFlow = e.fills.reduce((a, f) => a + f.qty, 0) + e.hedges.reduce((a, h) => a + h.qty, 0);
        expect(e.inventory).toBe(invFlow);
      }
    });
  }
});

describe('replay & observation', () => {
  it('same seed + same actions ⇒ identical result', () => {
    const a = runEpisode(31337, new RandomStrategy(5), 90).engine;
    const b = replay(31337, a.actions);
    expect(b.pnl).toBe(a.pnl);
    expect(b.fills.length).toBe(a.fills.length);
    expect(b.inventory).toBe(a.inventory);
  });

  it('observation never leaks future prices or hidden flags', () => {
    const e = new MarketMakerEngine(4242);
    for (let i = 0; i < 300; i++) e.step(idle(1));
    const obs = e.observe();
    expect(obs.mid).toBe(e.tape.mid[e.tick]);
    for (const o of obs.incoming) {
      expect(o.spawnTick).toBeLessThanOrEqual(e.tick);
      expect(o).not.toHaveProperty('informed');
      expect(o).not.toHaveProperty('willingness');
      expect(o).not.toHaveProperty('queueDraw');
    }
    expect(JSON.stringify(obs)).not.toContain(String(e.tape.mid[e.tick + 40]));
  });

  it('market path is independent of player actions', () => {
    const a = runEpisode(5, new FixedSpreadStrategy(0), 60).engine;
    const b = runEpisode(5, new FixedSpreadStrategy(2), 60).engine;
    expect(a.timeline.map((p) => p.mid)).toEqual(b.timeline.map((p) => p.mid));
  });
});

describe('strategy economics (lane design is not dominated)', () => {
  it('regime-aware + hedging beats always-aggressive on average', () => {
    let aware = 0, agg = 0;
    for (let s = 1; s <= 40; s++) {
      aware += runEpisode(s * 101, new InventoryAwareStrategy(), 90).stats.pnl;
      agg += runEpisode(s * 101, new FixedSpreadStrategy(0), 90).stats.pnl;
    }
    expect(aware).toBeGreaterThan(agg);
  });

  it('best lane differs by regime: AGG wins CALM, DEF wins VOLATILE', () => {
    const value = (lane: LaneId, regime: 'CALM' | 'VOLATILE') => {
      let mk = 0, secs = 0;
      for (let s = 1; s <= 40; s++) {
        const e = runEpisode(s * 101, new FixedSpreadStrategy(lane, 1), 90).engine;
        secs += e.laneTicks[regime][lane] * e.cfg.dt;
        for (const f of e.fills) if (f.regime === regime) mk += f.markout ?? 0;
      }
      return mk / secs;
    };
    expect(value(0, 'CALM')).toBeGreaterThan(value(2, 'CALM'));
    expect(value(2, 'VOLATILE')).toBeGreaterThan(value(0, 'VOLATILE'));
  });
});

describe('scoring & review', () => {
  it('score is non-negative and rewards risk-adjusted profit', () => {
    const r = riskStats(runEpisode(77, new InventoryAwareStrategy(), 90).engine);
    const s = computeScore(r, 500, 300);
    expect(s.total).toBeGreaterThanOrEqual(0);
    if (r.pnl > 0) expect(s.total).toBeGreaterThan(800);
  });

  it('review is built from the log with benchmarks on the same seed', () => {
    const e = runEpisode(2024, new FixedSpreadStrategy(0), 90).engine;
    const rv = buildReview(e, { collisions: 1, offlineSeconds: 1.5, alphaDrives: 0, gatesPassed: 2, gatesFailed: 1 });
    expect(rv.benchmarks).toHaveLength(5);
    expect(rv.insights.length).toBeGreaterThan(0);
    expect(rv.attribution.total).toBeCloseTo(e.pnl, 9);
    const sumRegimeSeconds = rv.regimes.reduce((a, r) => a + r.seconds, 0);
    expect(sumRegimeSeconds).toBeCloseTo(e.time, 6);
  });

  it('stop-loss ends the session', () => {
    const mids = Array.from({ length: 300 }, (_, i) => (i < 3 ? 100 : 80));
    const e = new MarketMakerEngine(flatTape(Array.from({ length: 4 }, (_, i) => ({ side: 'SELL' as const, qty: 300, arriveTick: i + 1 })), mids));
    for (let i = 0; i < 10 && !e.done; i++) e.step(idle(0));
    expect(e.stoppedOut).toBe(true);
    expect(e.done).toBe(true);
  });
});
