/** Phase 0 review of the v1 market model: does the regime label alone tell you the best lane? */
import { generateTape } from '../../src/sim/tape';
import { urgencyTier, REGIMES } from '../../src/sim/config';
const cnt: Record<string, [number, number]> = {};
for (let s = 1; s <= 200; s++) {
  const t = generateTape(s * 31);
  for (const o of t.orders) {
    if (o.arriveTick > 1800) continue;
    const k = `${t.regime[o.arriveTick]}-T${urgencyTier(o.willingness)}`;
    cnt[k] ??= [0, 0]; cnt[k][0]++; if (o.informed) cnt[k][1]++;
  }
}
console.log('informed share by urgency tier:');
for (const r of REGIMES) console.log(' ', r.padEnd(9), [0, 1, 2, 3].map((t) => { const c = cnt[`${r}-T${t}`]; return c ? `T${t}:${(100 * c[1] / c[0]).toFixed(0)}%` : ''; }).join(' '));
let agree = 0, total = 0;
for (let s = 1; s <= 60; s++) {
  const tape = generateTape(s * 17);
  for (let w = 0; w < 1700; w += 20) {
    const vals = [0, 1, 2].map((lane) => {
      let v = 0;
      for (let a = w; a < w + 20; a++) for (const o of tape.arrivals.get(a) ?? []) {
        const h = [0.02, 0.05, 0.1][lane]; const q = [0.95, 0.85, 0.75][lane];
        if (o.willingness >= h && o.queueDraw < q) { const sgn = o.side === 'BUY' ? -1 : 1; v += o.qty * sgn * (tape.mid[a + 40] - (tape.mid[a] - sgn * h)); }
      }
      return v;
    });
    const best = vals.indexOf(Math.max(...vals));
    const r = tape.regime[w];
    const pref = r === 'CALM' ? 0 : r === 'TRENDING' ? 1 : 2;
    if (vals.some((v) => v !== 0)) { total++; if (best === pref) agree++; }
  }
}
console.log('regime-lookup lane is the ex-post best lane in', (100 * agree / total).toFixed(0), '% of 1-second windows');
