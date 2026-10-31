/** Parameter sweep for the signal-reading bot (research). */
import { generateTape } from '../../src/sim/tape';
import { runEpisode, type Strategy } from '../../src/sim/strategies';
import type { Action, Observation } from '../../src/sim/engine';
import type { LaneId } from '../../src/sim/config';
function mk(pen: [number, number, number], varLim: number, invFrac: number, volWide: number): Strategy {
  return {
    name: 'x', description: '',
    decide(obs: Observation): Action {
      const s = obs.signals;
      const flow = 0.5 * s.incomingImbalance + 0.5 * s.recentImbalance;
      const v = s.laneIncome.map((x, i) => x * (1 - pen[i]));
      let lane = (v[0] >= v[1] && v[0] >= v[2] ? 0 : v[1] >= v[2] ? 1 : 2) as LaneId;
      if (obs.realizedVol > volWide && lane === 0) lane = 1;
      let hedge = false;
      const inv = obs.inventory;
      if (s.read === 'ONE_SIDED') { lane = 2; if (inv * flow < 0 && Math.abs(inv) >= 200) hedge = true; }
      else if (s.read === 'ANNOUNCED') { lane = 2; if (Math.abs(inv) >= 900) hedge = true; }
      else if (s.read === 'RUSH') lane = 0;
      if (!hedge && s.read !== 'ANNOUNCED') hedge = obs.var95 > varLim || Math.abs(inv) >= obs.positionLimit * invFrac;
      return { lane, hedge: hedge && obs.hedgeReady };
    },
  };
}
const tapes = Array.from({ length: 80 }, (_, i) => generateTape((i + 1) * 7919));
for (const pen of [[0, 0, 0], [0.3, 0.15, 0], [0.5, 0.25, 0]] as [number, number, number][])
  for (const varLim of [50, 70, 100])
    for (const invFrac of [0.5, 0.75])
      for (const volWide of [0.05, 1]) {
        const r = tapes.map((t) => runEpisode(t, mk(pen, varLim, invFrac, volWide), 90).stats);
        const m = r.reduce((a, x) => a + x.pnl, 0) / r.length;
        const sh = r.reduce((a, x) => a + x.sharpe, 0) / r.length;
        console.log(JSON.stringify(pen), varLim, invFrac, volWide, m.toFixed(0), sh.toFixed(2));
      }
