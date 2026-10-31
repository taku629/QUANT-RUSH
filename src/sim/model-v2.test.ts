import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, LANES, type LaneId } from './config';
import { MarketMakerEngine } from './engine';
import { computeSignals } from './signals';
import { FixedSpreadStrategy, InventoryAwareStrategy, SignalAwareStrategy, runEpisode } from './strategies';
import { generateTape, type MarketTape } from './tape';

const SEEDS = Array.from({ length: 60 }, (_, i) => (i + 1) * 7919);
const tapes = SEEDS.map((s) => generateTape(s));
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('v2 market model', () => {
  it('is deterministic and keeps PnL integrity with blocks and impact', () => {
    const a = generateTape(31337);
    const b = generateTape(31337);
    expect(Array.from(a.mid)).toEqual(Array.from(b.mid));
    expect(a.episodes).toEqual(b.episodes);
    expect(a.orders.some((o) => o.block !== undefined)).toBe(true);
    a.orders.forEach((o, i) => expect(o.id).toBe(i));
    for (const s of [new SignalAwareStrategy(), new FixedSpreadStrategy(0)]) {
      const e = runEpisode(a, s, 120).engine;
      expect(e.spreadPnL + e.rebatePnL - e.hedgeCost + e.inventoryPnL).toBeCloseTo(e.pnl, 6);
      expect(e.cash + e.inventory * e.mid - e.initialEquity).toBeCloseTo(e.pnl, 9);
    }
  });

  it('block orders only trade with quotes from the lane they sit in', () => {
    const tape = tapes[0];
    const block = tape.orders.find((o) => o.block !== undefined && o.arriveTick < 1500)!;
    const other = ((block.block! + 1) % 3) as LaneId;
    const e = new MarketMakerEngine(tape);
    let reason: string | undefined;
    while (e.tick <= block.arriveTick) {
      const ev = e.step({ lane: other, hedge: false });
      const m = ev.misses.find((x) => x.order.id === block.id);
      if (m) reason = m.reason;
      expect(ev.fills.find((f) => f.orderId === block.id)).toBeUndefined();
    }
    expect(reason).toBe('ROUTE');
  });

  it('public signals do not depend on the future or on hidden attributes', () => {
    const tape = tapes[3];
    const t = 900;
    const s1 = computeSignals(tape, t);
    // scramble everything a player must not see: future mids, informed flags, queue draws, future orders
    const mid = Float64Array.from(tape.mid);
    for (let i = t + 1; i < mid.length; i++) mid[i] = 50 + Math.random();
    const orders = tape.orders.map((o) => ({ ...o, informed: !o.informed, queueDraw: Math.random() }));
    const arrivals = new Map<number, typeof orders>();
    for (const o of orders) {
      if (o.spawnTick > t) continue; // orders not yet visible are removed entirely
      const l = arrivals.get(o.arriveTick) ?? [];
      l.push(o);
      arrivals.set(o.arriveTick, l);
    }
    const scrambled: MarketTape = { ...tape, mid, orders, arrivals, news: tape.news.filter((n) => n.tick <= t), episodes: [] };
    expect(computeSignals(scrambled, t)).toEqual(s1);
  });

  it('announced sweeps push the price temporarily and it reverts afterwards', () => {
    const after: number[] = [];
    for (const tape of tapes)
      for (const ep of tape.episodes) {
        if (ep.kind !== 'SWEEP' || ep.endTick + 80 >= tape.totalTicks) continue;
        after.push((tape.mid[ep.endTick + 80] - tape.mid[ep.endTick]) * -ep.side); // positive = reversion
      }
    expect(after.length).toBeGreaterThan(30);
    expect(avg(after)).toBeGreaterThan(0);
  });

  it('a one-sided flow read is a real (but imperfect) warning of informed flow', () => {
    let hit = 0, n = 0, toxicTicks = 0, all = 0;
    for (const tape of tapes.slice(0, 30))
      for (let t = 40; t < 1700; t += 5) {
        const ep = tape.episodes.find((x) => x.startTick <= t && t < x.endTick)!;
        all++;
        if (ep.kind === 'TOXIC') toxicTicks++;
        if (computeSignals(tape, t).read === 'ONE_SIDED') {
          n++;
          if (ep.kind === 'TOXIC') hit++;
        }
      }
    const base = toxicTicks / all;
    expect(hit / n).toBeGreaterThan(base * 1.8); // informative…
    expect(hit / n).toBeLessThan(0.9); // …but not an oracle
  });

  it('the best lane inside one regime depends on the flow, not only on the label', () => {
    const val: Record<string, number[]> = {};
    for (const tape of tapes.slice(0, 40))
      for (const lane of [0, 2] as LaneId[]) {
        const e = runEpisode(tape, new FixedSpreadStrategy(lane, 1), 90).engine;
        for (const f of e.fills) {
          if (f.regime !== 'CALM') continue;
          const ep = tape.episodes.find((x) => x.startTick <= f.tick && f.tick < x.endTick)!;
          (val[ep.kind] ??= [0, 0, 0])[lane] += f.markout ?? 0;
        }
      }
    expect(val.TWO_SIDED[0]).toBeGreaterThan(val.TWO_SIDED[2]); // calm & balanced: tight wins
    expect(val.TOXIC[2]).toBeGreaterThan(val.TOXIC[0]); // calm but informed: wide wins
  });

  it('reading the tape beats memorizing the regime; no fixed lane dominates', () => {
    const stat = (mk: () => { decide: SignalAwareStrategy['decide'] } & { name: string; description: string }) => {
      const r = tapes.map((t) => runEpisode(t, mk(), 90).stats);
      return { pnl: avg(r.map((x) => x.pnl)), rar: avg(r.map((x) => x.sharpe)) };
    };
    const reader = stat(() => new SignalAwareStrategy());
    const regime = stat(() => new InventoryAwareStrategy());
    const fixed = ([0, 1, 2] as LaneId[]).map((l) => stat(() => new FixedSpreadStrategy(l)));
    expect(reader.pnl).toBeGreaterThan(regime.pnl);
    for (const f of fixed) {
      expect(reader.pnl).toBeGreaterThan(f.pnl);
      expect(reader.rar).toBeGreaterThan(f.rar);
    }
  });

  it('hedging is not free: flattening at every chance loses to risk-based hedging', () => {
    const always = avg(tapes.map((t) => runEpisode(t, new FixedSpreadStrategy(1, 1), 90).stats.pnl));
    const smart = avg(tapes.map((t) => runEpisode(t, new SignalAwareStrategy(), 90).stats.pnl));
    expect(smart).toBeGreaterThan(always);
    const e = runEpisode(tapes[1], new FixedSpreadStrategy(1, 1), 90).engine;
    const minGap = e.hedges.slice(1).reduce((m, h, i) => Math.min(m, h.tick - e.hedges[i].tick), Infinity);
    expect(minGap).toBeGreaterThanOrEqual(DEFAULT_CONFIG.hedgeCooldown / DEFAULT_CONFIG.dt);
    expect(LANES).toHaveLength(3);
  });
});
