import { describe, expect, it } from 'vitest';
import type { LaneId, RegimeId } from '../sim/config';
import { createRng } from '../sim/rng';
import { LANE_CHANGE_TIME, meetZ, phaseAt, Spawner } from './spawner';
import { GameSession } from './session';
import { autopilot } from './autopilot';

const REGIMES: RegimeId[] = ['CALM', 'TRENDING', 'VOLATILE', 'CRASH'];

/** drive a bare spawner through many rows with a changing recommendation */
function rows(seed: number, n = 160) {
  const sp = new Spawner(createRng(seed));
  const r = createRng(seed + 99);
  const speed = 48;
  let gateZ = 800;
  let rec: LaneId = 1;
  const placed: { rec: LaneId; kind: string; lane: number; changeTo?: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (sp.nextZ > gateZ) gateZ += 800;
    if (i % 6 === 0) rec = r.int(0, 2) as LaneId;
    const regime = REGIMES[i % 4];
    const danger = (regime === 'VOLATILE' || regime === 'CRASH') && rec !== 0 ? 1 : 0;
    const res = sp.next({ playerZ: sp.nextZ - 200, speed, regime, progress: (sp.nextZ % 800) / 800, district: Math.floor(i / 30), lap: 0, t: i, gateZ, rec, danger });
    for (const o of res.obstacles) placed.push({ rec, kind: o.kind, lane: o.lane, changeTo: o.changeTo });
    sp.nextZ += res.gap;
  }
  return { sp, placed, speed };
}

describe('v3 course: the recommended lane is never blocked', () => {
  it('no non-jumpable obstacle is ever placed in the recommended lane', () => {
    let checked = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const p of rows(seed).placed) {
        if (p.kind === 'barrier') continue; // low barriers are jumpable gimmicks
        checked++;
        expect(p.lane, `${p.kind} placed in the recommended lane`).not.toBe(p.rec);
        if (p.changeTo !== undefined) expect(p.changeTo).not.toBe(p.rec);
      }
    }
    expect(checked).toBeGreaterThan(200);
  });

  it('every committed row leaves a reachable free lane (independent re-check)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const { sp, speed } = rows(seed);
      const rs = sp.rows;
      for (let i = 1; i < rs.length; i++) {
        const free = 0b111 & ~rs[i].mask;
        expect(free).not.toBe(0);
        const steps = Math.floor((rs[i].z - rs[i - 1].z) / speed / LANE_CHANGE_TIME);
        let reach = 0b111 & ~rs[i - 1].mask;
        for (let k = 0; k < steps; k++) reach = (reach | (reach << 1) | (reach >> 1)) & 0b111;
        expect(reach & free).not.toBe(0);
      }
    }
  });

  it('dangerous lanes get warnings / hazards, the recommended lane gets coins', () => {
    const sp = new Spawner(createRng(5));
    let warnings = 0;
    let coinsInRec = 0;
    let coinsElsewhere = 0;
    let gateZ = 800;
    for (let i = 0; i < 120; i++) {
      if (sp.nextZ > gateZ) gateZ += 800;
      const res = sp.next({ playerZ: sp.nextZ - 200, speed: 48, regime: 'VOLATILE', progress: 0.3, district: 2, lap: 0, t: i, gateZ, rec: 2, danger: 1 });
      warnings += res.obstacles.filter((o) => o.lane === 0 && o.kind !== 'barrier').length;
      coinsInRec += res.pickups.filter((p) => p.kind === 'coin' && p.lane === 2).length;
      coinsElsewhere += res.pickups.filter((p) => p.kind === 'coin' && p.lane !== 2).length;
      sp.nextZ += res.gap;
    }
    expect(warnings).toBeGreaterThan(30);
    expect(coinsInRec).toBeGreaterThan(100);
    expect(coinsElsewhere).toBe(0);
  });

  it('moving obstacles are checked where the player meets them', () => {
    expect(meetZ(100, 0, 0, 40)).toBeCloseTo(100);
    expect(meetZ(100, 20, 0, 40)).toBeCloseTo(200);
    expect(meetZ(100, -20, 0, 40)).toBeCloseTo(66.67, 1);
  });

  it('pacing has breathers and a clear runway before each gate', () => {
    expect(phaseAt(0.05)).toBe('INTRO');
    expect(phaseAt(0.5)).toBe('BREATHER');
    expect(phaseAt(0.9)).toBe('RUNWAY');
  });
});

describe('v3 session: following the glowing lane is safe', () => {
  it('when the recommendation moves, its lane is cleared of blocking obstacles', () => {
    let moves = 0;
    for (const seed of [11, 22, 33, 44]) {
      const s = new GameSession(seed, 'board');
      s.timeLeft = 9999;
      s.stability = 999;
      for (let f = 0; f < 60 * 90 && !s.ended; f++) {
        s.update(autopilot(s, f));
        for (const e of s.drainEvents()) {
          if (e.type !== 'recLane') continue;
          moves++;
          const blocked = s.obstacles.filter((o) => o.alive && o.kind !== 'barrier' && o.z - s.z > 16 && (o.lane === e.lane || o.targetLane === e.lane));
          expect(blocked).toEqual([]);
        }
      }
    }
    expect(moves).toBeGreaterThan(5);
  });

  it('a player who follows the glowing lane (and jumps) almost never crashes', () => {
    let collisions = 0;
    let minutes = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = new GameSession(seed * 97, 'bike'); // slowest steering
      s.timeLeft = 9999;
      s.stability = 999;
      for (let f = 0; f < 60 * 75 && !s.ended; f++) {
        s.update(autopilot(s, f));
        s.drainEvents();
      }
      collisions += s.collisions;
      minutes += s.t / 60;
    }
    expect(collisions / minutes).toBeLessThan(0.5);
  });

  it('the first 15 seconds teach the glowing lane: coins, a jump gimmick, a ramp', () => {
    const s = new GameSession(7, 'board');
    for (let f = 0; f < 60 * 15; f++) {
      s.update(autopilot(s, f));
      s.drainEvents();
    }
    expect(s.coins).toBeGreaterThanOrEqual(4);
    expect(s.pickups.some((p) => p.kind === 'ramp')).toBe(true);
    expect(s.gauge + s.alphaCount * 100).toBeGreaterThanOrEqual(50);
  });
});
