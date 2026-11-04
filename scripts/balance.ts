/**
 * Balance check (computer verification, not a human playtest):
 * autopilot drivers on each vehicle + an idle player, over many seeds.
 */
import { GameSession } from '../src/game/session';
import { autopilot } from '../src/game/autopilot';
import type { VehicleId } from '../src/game/content';

const N = Number(process.argv[2] ?? 40);
type Row = { t: number; reason: string | null; d: number; pnl: number; coll: number; nm: number; gp: number; gf: number; rebate: number; spread: number; alphas: number; ramps: number; coins: number; settles: number; bursts: number; recShare: number; recMoves: number };
const run = (vehicle: VehicleId, idle: boolean) => {
  const rows: Row[] = [];
  for (let k = 1; k <= N; k++) {
    const s = new GameSession(k * 1013, vehicle);
    let f = 0;
    while (!s.ended && f < 60 * 300) {
      s.update(idle ? { left: 0, right: 0, jump: false, hedge: false, alpha: false } : autopilot(s, f));
      s.drainEvents();
      f++;
    }
    const e = s.engine;
    rows.push({ t: s.t, reason: s.endReason, d: s.district, pnl: e.pnl, coll: s.collisions, nm: s.nearMisses, gp: s.gatesPassed, gf: s.gatesFailed, rebate: e.rebatePnL, spread: e.spreadPnL, alphas: s.alphaCount, ramps: s.ramps, coins: s.coins, settles: s.settlements, bursts: s.riskBursts, recShare: s.recLaneTime / Math.max(1, e.time), recMoves: s.advisor.changes });
  }
  const avg = (fn: (r: Row) => number) => rows.reduce((a, r) => a + fn(r), 0) / rows.length;
  const reasons: Record<string, number> = {};
  rows.forEach((r) => (reasons[r.reason ?? '?'] = (reasons[r.reason ?? '?'] ?? 0) + 1));
  console.log(
    `${(idle ? 'idle' : 'autopilot') + ' ' + vehicle}`.padEnd(20),
    `len ${avg((r) => r.t).toFixed(1)}s`, `districts ${avg((r) => r.d).toFixed(1)}`, `coll ${avg((r) => r.coll).toFixed(1)}`, `nearMiss ${avg((r) => r.nm).toFixed(1)}`,
    `gates ${avg((r) => r.gp).toFixed(1)}/${avg((r) => r.gf).toFixed(1)}`, `ALPHA ${avg((r) => r.alphas).toFixed(1)}`, `ramps ${avg((r) => r.ramps).toFixed(1)}`,
    `pnl ${avg((r) => r.pnl).toFixed(0)}`, `coins ${avg((r) => r.coins).toFixed(0)}`, `settle/burst ${avg((r) => r.settles).toFixed(1)}/${avg((r) => r.bursts).toFixed(1)}`, `inRec ${(100 * avg((r) => r.recShare)).toFixed(0)}%`, `recMoves ${avg((r) => r.recMoves).toFixed(1)}`, `rebate/spread ${((100 * avg((r) => r.rebate)) / Math.max(1, avg((r) => r.spread))).toFixed(1)}%`, JSON.stringify(reasons),
  );
};
for (const v of ['board', 'bike', 'pod'] as VehicleId[]) run(v, false);
run('board', true);
