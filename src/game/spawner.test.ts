import { describe, expect, it } from 'vitest';
import { createRng } from '../sim/rng';
import { LANE_CHANGE_TIME, meetZ, phaseAt, Spawner } from './spawner';
import { GameSession } from './session';
import { autopilot } from './autopilot';

describe('pattern spawner fairness', () => {
  it('every committed row leaves a reachable free lane (independent re-check)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const sp = new Spawner(createRng(seed));
      const speed = 48;
      let gateZ = 800;
      for (let i = 0; i < 160; i++) {
        if (sp.nextZ > gateZ) gateZ += 800;
        const regime = (['CALM', 'TRENDING', 'VOLATILE', 'CRASH'] as const)[i % 4];
        const res = sp.next({ playerZ: sp.nextZ - 200, speed, regime, progress: ((sp.nextZ % 800) / 800), district: Math.floor(i / 30), lap: 0, t: i, gateZ });
        sp.nextZ += res.gap;
      }
      const rows = sp.rows;
      for (let i = 1; i < rows.length; i++) {
        const free = 0b111 & ~rows[i].mask;
        expect(free).not.toBe(0);
        const steps = Math.floor((rows[i].z - rows[i - 1].z) / speed / LANE_CHANGE_TIME);
        let reach = 0b111 & ~rows[i - 1].mask;
        for (let k = 0; k < steps; k++) reach = (reach | (reach << 1) | (reach >> 1)) & 0b111;
        expect(reach & free).not.toBe(0);
      }
    }
  });

  it('moving obstacles are checked where the player meets them', () => {
    expect(meetZ(100, 0, 0, 40)).toBeCloseTo(100);
    expect(meetZ(100, 20, 0, 40)).toBeCloseTo(200); // slower car is met further away
    expect(meetZ(100, -20, 0, 40)).toBeCloseTo(66.67, 1); // oncoming car is met sooner
  });

  it('pacing has breathers and a clear runway before each gate', () => {
    expect(phaseAt(0.05)).toBe('INTRO');
    expect(phaseAt(0.5)).toBe('BREATHER');
    expect(phaseAt(0.9)).toBe('RUNWAY');
  });

  it('a careful driver rarely crashes (collisions per minute)', () => {
    let collisions = 0;
    let minutes = 0;
    for (let seed = 1; seed <= 25; seed++) {
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
    expect(collisions / minutes).toBeLessThan(1.0);
  });

  it('the first 15 seconds showcase ramp, boost and a near miss', () => {
    const s = new GameSession(7, 'board');
    const kinds = new Set<string>();
    for (let f = 0; f < 60 * 15; f++) {
      s.update(autopilot(s, f));
      for (const e of s.drainEvents()) kinds.add(e.type);
    }
    expect(s.pickups.some((p) => p.kind === 'ramp')).toBe(true);
    expect(kinds.has('boost') || kinds.has('ramp')).toBe(true);
    expect(s.gauge + s.alphaCount * 100).toBeGreaterThanOrEqual(50);
  });
});
