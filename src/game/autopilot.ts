/** Simple autopilot used for the title-screen attract mode (and smoke tests). */
import type { LaneId } from '../sim/config';
import { LANE_X } from './content';
import type { GameSession, Input } from './session';

export function autopilot(s: GameSession, frame: number): Input {
  const inp: Input = { left: 0, right: 0, jump: false, hedge: false, alpha: false };
  const danger = (lane: LaneId, range: number) =>
    s.obstacles.some((o) => {
      if (!o.alive || o.passed) return false;
      const ahead = o.z - s.z;
      if (ahead < -2 || ahead > range) return false;
      return Math.abs(o.x - LANE_X[lane]) < o.w / 2 + 0.9 && !(o.kind === 'barrier' && o.span === 3);
    });
  const wall = s.obstacles.some((o) => o.alive && o.kind === 'barrier' && !o.passed && Math.abs(o.x - s.x) < o.w / 2 + 0.6 && o.z - s.z > 4 && o.z - s.z < 4 + s.speed * 0.2);
  if (wall) inp.jump = true;
  const regime = s.engine.regime;
  const preferred: LaneId = regime === 'CALM' ? 0 : regime === 'TRENDING' ? 1 : 2;
  const cur = s.targetLane;
  const range = 18 + s.speed * 0.9;
  if (danger(cur, range)) {
    const options = ([cur - 1, cur + 1].filter((l) => l >= 0 && l <= 2) as LaneId[]).filter((l) => !danger(l, range));
    if (options.length) {
      if (options[0] < cur) inp.left = 1;
      else inp.right = 1;
    }
  } else if (frame % 30 === 0 && preferred !== cur) {
    const next = (cur + Math.sign(preferred - cur)) as LaneId;
    if (!danger(next, range)) {
      if (next < cur) inp.left = 1;
      else inp.right = 1;
    }
  }
  if (Math.abs(s.engine.inventory) > 450 && frame % 20 === 0) inp.hedge = true;
  if (s.alphaReady) inp.alpha = true;
  return inp;
}
