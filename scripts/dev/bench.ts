/** CPU cost of the simulation layers (no rendering). */
import { GameSession } from '../../src/game/session';
import { autopilot } from '../../src/game/autopilot';
import { buildReview } from '../../src/sim/analysis';
const s = new GameSession(12345, 'board');
s.timeLeft = 9999; s.stability = 999;
const frames = 60 * 120;
const t0 = performance.now();
for (let f = 0; f < frames && !s.ended; f++) { s.update(autopilot(s, f)); s.drainEvents(); }
const t1 = performance.now();
let obs = 0;
for (let i = 0; i < 2000; i++) obs += s.engine.observe().incoming.length;
const t2 = performance.now();
const rv = buildReview(s.engine);
const t3 = performance.now();
const mem = process.memoryUsage().heapUsed / 1e6;
console.log(`session.update+autopilot: ${(((t1 - t0) / frames) * 1000).toFixed(1)} µs/frame (${frames} frames)`);
console.log(`engine.observe() (HUD, 15 Hz): ${(((t2 - t1) / 2000) * 1000).toFixed(1)} µs/call`);
console.log(`buildReview incl. ${rv.moments.length} key moments with counterfactual replays: ${(t3 - t2).toFixed(0)} ms`);
console.log(`obstacles alive: ${s.obstacles.length}, pickups: ${s.pickups.length}, spawner rows: ${s.spawner.rows.length}, forks: ${s.spawner.forks.length}, heap ${mem.toFixed(0)} MB`);
void obs;
