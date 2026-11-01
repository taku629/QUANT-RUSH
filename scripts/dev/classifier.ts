/** How well does the public-signal flow read match the hidden episode? (research only) */
import { generateTape } from '../../src/sim/tape';
import { computeSignals } from '../../src/sim/signals';
const m: Record<string, Record<string, number>> = {};
for (let s = 1; s <= 80; s++) {
  const tape = generateTape(s * 7919);
  for (let t = 40; t < 1800; t += 5) {
    const ep = tape.episodes.find((x) => x.startTick <= t && t < x.endTick)!;
    const r = computeSignals(tape, t).read;
    m[ep.kind] ??= {};
    m[ep.kind][r] = (m[ep.kind][r] ?? 0) + 1;
  }
}
for (const k of Object.keys(m)) {
  const tot = Object.values(m[k]).reduce((a, b) => a + b, 0);
  console.log(k.padEnd(10), Object.entries(m[k]).map(([r, n]) => `${r}:${((100 * n) / tot).toFixed(0)}%`).join('  '));
}
