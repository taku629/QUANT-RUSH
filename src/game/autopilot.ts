/** Simple autopilot used for the title-screen attract mode, balance checks, full-game bots and smoke tests. */
import type { LaneId } from '../sim/config';
import { LANE_X } from './content';
import { BALANCE } from './gameBalanceConfig';
import type { GameSession, Input } from './session';

/** seconds until the player meets the first non-jumpable obstacle in a lane */
export function timeToHazard(s: GameSession, lane: LaneId): number {
  let best = Infinity;
  const sp = Math.max(10, s.speed);
  for (const o of s.obstacles) {
    if (!o.alive || o.passed || o.kind === 'barrier') continue;
    const ahead = o.z - o.len / 2 - s.z;
    if (ahead + o.len < -2.5) continue;
    const xs = o.changeAt > 0 && o.targetLane !== o.lane ? [o.x, LANE_X[o.targetLane]] : [o.x];
    if (!xs.some((x) => Math.abs(x - LANE_X[lane]) < o.w / 2 + 0.9)) continue;
    if (o.kind === 'debris' && o.y > 12 && ahead > 60) continue;
    const t = Math.max(0, ahead) / Math.max(1, sp - o.speed);
    best = Math.min(best, t);
  }
  return best;
}

export function autopilot(s: GameSession, frame: number, preferred?: LaneId): Input {
  const inp: Input = { left: 0, right: 0, jump: false, hedge: false, alpha: false };
  const wall = s.obstacles.some((o) => o.alive && o.kind === 'barrier' && !o.passed && Math.abs(o.x - s.x) < o.w / 2 + 0.6 && o.z - s.z > 3 && o.z - s.z < 3 + s.speed * 0.16);
  if (wall) inp.jump = true;
  const regime = s.engine.regime;
  // v3: follow the glowing recommended lane unless a caller (e.g. a Quant Lab strategy) asks otherwise
  const pref: LaneId = preferred ?? s.advisor.lane;
  void regime;
  const cur = s.targetLane;
  const safe = 1.1;
  const c = [0, 1, 2].map((l) => timeToHazard(s, l as LaneId));
  const reachable = [cur - 1, cur, cur + 1].filter((l) => l >= 0 && l <= 2) as LaneId[];
  let target: LaneId = cur;
  if (c[cur] < safe) target = reachable.reduce((a, b) => (c[b] > c[a] ? b : a), cur);
  else if (frame % 12 === 0 && pref !== cur) {
    const next = (cur + Math.sign(pref - cur)) as LaneId;
    if (c[next] > safe * 1.5) target = next;
  }
  if (target < cur) inp.left = 1;
  else if (target > cur) inp.right = 1;
  // v3: settle in the RISK sweet spot (≥ 75 %) before the gauge bursts
  if (s.risk >= 0.75 && frame % 20 === 0) inp.hedge = true;
  // read the gate's RISK CHECK like a player: lighten up before it if the true exposure is too high
  const g = s.nextGate;
  if (g && g.z - s.z < 200 && s.currentExposure() >= BALANCE.risk.gateMax && frame % 20 === 0) inp.hedge = true;
  if (s.alphaReady) inp.alpha = true;
  return inp;
}
