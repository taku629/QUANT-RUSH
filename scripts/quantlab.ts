/**
 * QUANT LAB CLI — compare strategies on identical market seeds.
 *   npm run lab            (200 seeds × 90s)
 *   npm run lab -- 50 120  (50 seeds × 120s)
 */
import { benchmarkStrategies, FixedSpreadStrategy, RandomStrategy, runEpisode, type Strategy } from '../src/sim/strategies';
import { DEFAULT_CONFIG, REGIMES, type EpisodeKind, type LaneId } from '../src/sim/config';
import { generateTape } from '../src/sim/tape';

const model = process.argv[4] === 'v1' ? 1 : 2;
const cfg = { ...DEFAULT_CONFIG, model } as typeof DEFAULT_CONFIG;

const nSeeds = Number(process.argv[2] ?? 200);
const seconds = Number(process.argv[3] ?? 90);
const makers: (() => Strategy)[] = [
  ...benchmarkStrategies().map((s) => () => s),
  () => new FixedSpreadStrategy(0, 600),
  () => new FixedSpreadStrategy(1, 600),
  () => new RandomStrategy(7),
];

console.log(`QUANT LAB — model v${model} — ${nSeeds} seeds × ${seconds}s`);
console.log('strategy'.padEnd(28), 'meanPnL', ' stdPnL', ' sharpe', '  maxDD', ' fills', ' spread', ' invPnL', ' hedge$');
for (const mk of makers) {
  const rows: ReturnType<typeof runEpisode>['stats'][] = [];
  for (let s = 1; s <= nSeeds; s++) rows.push(runEpisode(generateTape(s * 7919, cfg), mk(), seconds).stats);
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
      const r = runEpisode(generateTape(s * 7919, cfg), new FixedSpreadStrategy(lane, 1), seconds);
      const e = r.engine;
      secs += e.laneTicks[regime][lane] * e.cfg.dt;
      for (const f of e.fills) if (f.regime === regime) mk += f.markout ?? 0;
    }
    cells.push(`${['AGG', 'BAL', 'DEF'][lane]} ${(mk / Math.max(secs, 1)).toFixed(2).padStart(6)}$/s`);
  }
  console.log(regime.padEnd(9), cells.join('   '));
}

// Hidden-state research view (not available to players): which lane is best inside each flow episode?
if (model === 2) {
  console.log('\nPer-episode lane economics (research only — episodes are hidden in game):');
  const kinds: EpisodeKind[] = ['TWO_SIDED', 'RUSH', 'TOXIC', 'SWEEP'];
  const acc: Record<string, number[]> = {};
  for (let s = 1; s <= nSeeds; s++) {
    for (const lane of [0, 1, 2] as LaneId[]) {
      const tape = generateTape(s * 7919, cfg);
      const e = runEpisode(tape, new FixedSpreadStrategy(lane, 1), seconds).engine;
      const epAt = (t: number) => tape.episodes.find((x) => x.startTick <= t && t < x.endTick)!;
      for (const f of e.fills) {
        const k = `${f.regime}|${epAt(f.tick).kind}`;
        acc[k] ??= [0, 0, 0];
        acc[k][lane] += f.markout ?? 0;
      }
    }
  }
  for (const r of REGIMES) for (const k of kinds) {
    const v = acc[`${r}|${k}`];
    if (!v) continue;
    const best = v.indexOf(Math.max(...v));
    console.log(r.padEnd(9), k.padEnd(10), v.map((x) => x.toFixed(0).padStart(8)).join(' '), '  best:', ['AGG', 'BAL', 'DEF'][best]);
  }
}
