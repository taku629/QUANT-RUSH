/** Simple autopilot used for the title-screen attract mode, balance checks and smoke tests. */
import type { LaneId } from '../sim/config';
import { LANE_X } from './content';
import type { GameSession, Input } from './session';

/** distance to the first obstacle ahead in a lane that cannot be jumped */
function clearance(s: GameSession, lane: LaneId): number {
  let best = Infinity;
  for (const o of s.obstacles) {
    if (!o.alive || o.passed) continue;
    if (o.kind === 'barrier') continue; // barriers are jumped
    const ahead = o.z - o.len / 2 - s.z;
    if (ahead < -2.5) continue;
    // lane-changing cars occupy both lanes while they are close
    const xs = o.changeAt > 0 && o.targetLane !== o.lane ? [o.x, LANE_X[o.targetLane]] : [o.x];
    if (xs.some((x) => Math.abs(x - LANE_X[lane]) < o.w / 2 + 0.9)) best = Math.min(best, ahead);
  }
  return best;
}

export function autopilot(s: GameSession, frame: number): Input {
  const inp: Input = { left: 0, right: 0, jump: false, hedge: false, alpha: false };
  const wall = s.obstacles.some((o) => o.alive && o.kind === 'barrier' && !o.passed && Math.abs(o.x - s.x) < o.w / 2 + 0.6 && o.z - s.z > 3 && o.z - s.z < 3 + s.speed * 0.16);
  if (wall) inp.jump = true;
  const regime = s.engine.regime;
  const preferred: LaneId = regime === 'CALM' ? 0 : regime === 'TRENDING' ? 1 : 2;
  const cur = s.targetLane;
  const safe = 14 + s.speed * 0.75;
  const c = [0, 1, 2].map((l) => clearance(s, l as LaneId));
  const reachable = [cur - 1, cur, cur + 1].filter((l) => l >= 0 && l <= 2) as LaneId[];
  // passing through the middle lane to reach the far lane must be safe too
  let target: LaneId = cur;
  if (c[cur] < safe) {
    target = reachable.reduce((a, b) => (c[b] > c[a] ? b : a), cur);
  } else if (frame % 20 === 0 && preferred !== cur) {
    const next = (cur + Math.sign(preferred - cur)) as LaneId;
    if (c[next] > safe * 1.3) target = next;
  }
  if (target < cur) inp.left = 1;
  else if (target > cur) inp.right = 1;
  if (Math.abs(s.engine.inventory) > 450 && frame % 20 === 0) inp.hedge = true;
  if (s.alphaReady) inp.alpha = true;
  return inp;
}
