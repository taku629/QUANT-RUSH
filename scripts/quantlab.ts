/**
 * QUANT LAB CLI — compare strategies on identical market seeds.
 *   npm run lab            (200 seeds × 90s)
 *   npm run lab -- 50 120  (50 seeds × 120s)
 */
import { benchmarkStrategies, FixedSpreadStrategy, RandomStrategy, runEpisode, type Strategy } from '../src/sim/strategies';
import { REGIMES, type LaneId } from '../src/sim/config';

const nSeeds = Number(process.argv[2] ?? 200);
const seconds = Number(process.argv[3] ?? 90);
const makers: (() => Strategy)[] = [
  ...benchmarkStrategies().map((s) => () => s),
  () => new FixedSpreadStrategy(0, 600),
  () => new FixedSpreadStrategy(1, 600),
  () => new RandomStrategy(7),
];

console.log(`QUANT LAB — ${nSeeds} seeds × ${seconds}s`);
console.log('strategy'.padEnd(28), 'meanPnL', ' stdPnL', ' sharpe', '  maxDD', ' fills', ' spread', ' invPnL', ' hedge$');
for (const mk of makers) {
  const rows: ReturnType<typeof runEpisode>['stats'][] = [];
  for (let s = 1; s <= nSeeds; s++) rows.push(runEpisode(s * 7919, mk(), seconds).stats);
  const avg = (f: (r: (typeof rows)[0]) => number) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
  const m = avg((r) => r.pnl);
  const sd = Math.sqrt(avg((r) => (r.pnl - m) ** 2));
  console.log(
    mk().name.padEnd(28),
    m.toFixed(0).padStart(7), sd.toFixed(0).padStart(7), avg((r) => r.sharpe).toFixed(2).padStart(7),
    avg((r) => r.maxDrawdown).toFixed(0).padStart(7), avg((r) => r.fills).toFixed(0).padStart(6),
    avg((r) => r.spreadPnL).toFixed(0).padStart(7), avg((r) => r.inventoryPnL).toFixed(0).padStart(7), avg((r) => r.hedgeCost).toFixed(0).padStart(7),
  );
}

// Per-regime lane economics: expected spread income and markout per second of exposure
console.log('\nPer-regime lane economics (flow value per second, markout incl. spread, no inventory carry):');
for (const regime of REGIMES) {
  const cells: string[] = [];
  for (const lane of [0, 1, 2] as LaneId[]) {
    let mk = 0, secs = 0;
    for (let s = 1; s <= nSeeds; s++) {
      const r = runEpisode(s * 7919, new FixedSpreadStrategy(lane, 1), seconds);
      const e = r.engine;
      secs += e.laneTicks[regime][lane] * e.cfg.dt;
      for (const f of e.fills) if (f.regime === regime) mk += f.markout ?? 0;
    }
    cells.push(`${['AGG', 'BAL', 'DEF'][lane]} ${(mk / Math.max(secs, 1)).toFixed(2).padStart(6)}$/s`);
  }
  console.log(regime.padEnd(9), cells.join('   '));
}
