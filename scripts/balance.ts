/** Balance check: run the autopilot (and an idle player) over many seeds and report run length / outcomes. */
import { GameSession } from '../src/game/session';
import { autopilot } from '../src/game/autopilot';

const N = Number(process.argv[2] ?? 40);
for (const mode of ['autopilot', 'idle'] as const) {
  const rows: { t: number; reason: string | null; d: number; pnl: number; coll: number; nm: number; gp: number; gf: number }[] = [];
  for (let k = 1; k <= N; k++) {
    const s = new GameSession(k * 1013, 'board');
    let f = 0;
    while (!s.ended && f < 60 * 300) {
      s.update(mode === 'autopilot' ? autopilot(s, f) : { left: 0, right: 0, jump: false, hedge: false, alpha: false });
      s.drainEvents();
      f++;
    }
    rows.push({ t: s.t, reason: s.endReason, d: s.district, pnl: s.engine.pnl, coll: s.collisions, nm: s.nearMisses, gp: s.gatesPassed, gf: s.gatesFailed });
  }
  const avg = (fn: (r: (typeof rows)[0]) => number) => (rows.reduce((a, r) => a + fn(r), 0) / rows.length).toFixed(1);
  const reasons: Record<string, number> = {};
  rows.forEach((r) => (reasons[r.reason ?? '?'] = (reasons[r.reason ?? '?'] ?? 0) + 1));
  console.log(mode, 'len', avg((r) => r.t), 's  districts', avg((r) => r.d), ' pnl', avg((r) => r.pnl), ' collisions', avg((r) => r.coll), ' nearMiss', avg((r) => r.nm), ' gates ok/fail', avg((r) => r.gp), avg((r) => r.gf), JSON.stringify(reasons));
}
