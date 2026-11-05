/**
 * Play-style comparison — COMPUTER MODELS, NOT A HUMAN PLAYTEST (see scripts/lib/playModels.ts).
 * Usage: npm run playstyles -- [seeds=40] [firstSeed=1] [--bursts]
 */
import { STYLES, runStyle, summarize, type BurstInfo } from './lib/playModels';

{
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const N = Number(args[0] ?? 40);
  const first = Number(args[1] ?? 1);
  const seeds = Array.from({ length: N }, (_, i) => (first + i) * 7919);
  console.log(`play-style models (NOT a human playtest), ${N} seeds from #${first}`);
  console.log('style'.padEnd(30), 'len  KO%  pnl   p10    maxDD  RAR   score   coll/m settle(sweet) burst burstRun% inRec spread  hedge  invPnL');
  const allBursts: BurstInfo[] = [];
  for (const st of STYLES) {
    const rows = seeds.map((sd) => runStyle(st, sd));
    rows.forEach((r) => allBursts.push(...r.bi));
    const m = summarize(rows);
    console.log(
      st.name.padEnd(30), m.len.toFixed(0).padStart(3), (m.ko * 100).toFixed(0).padStart(4), m.pnl.toFixed(0).padStart(5), m.pnlP10.toFixed(0).padStart(6),
      m.dd.toFixed(0).padStart(6), m.rar.toFixed(2).padStart(6), m.score.toFixed(0).padStart(7), m.collPerMin.toFixed(2).padStart(6),
      `${m.settles.toFixed(1)}(${m.sweet.toFixed(1)})`.padStart(11), m.bursts.toFixed(2).padStart(6), (m.burstRuns * 100).toFixed(0).padStart(7),
      (m.inRec * 100).toFixed(0).padStart(5), m.spread.toFixed(0).padStart(6), m.hedgeCost.toFixed(0).padStart(6), m.invPnl.toFixed(0).padStart(7),
    );
  }
  if (process.argv.includes('--bursts') && allBursts.length) {
    const n = allBursts.length;
    const pct = (fn: (b: BurstInfo) => boolean) => ((100 * allBursts.filter(fn).length) / n).toFixed(0) + '%';
    const warn = allBursts.map((b) => b.warnTime).sort((a, b) => a - b);
    console.log(`\nforced liquidations: ${n}`);
    console.log(`  warning time (70% → 100%): median ${warn[Math.floor(n / 2)].toFixed(2)}s, under 1 s: ${pct((b) => b.warnTime < 1)}, 0 s (jumped straight past the warning): ${pct((b) => b.warnTime === 0)}`);
    console.log(`  reached 100% with HEDGE on cooldown: ${pct((b) => b.cooldown > 0)} · in a single tick jump ≥ 30 pts: ${pct((b) => b.jump >= 0.3)} · on a block fill: ${pct((b) => b.block)} · on a regime change: ${pct((b) => b.regime)}`);
  }
}
