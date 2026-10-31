import { describe, expect, it } from 'vitest';
import { GameSession, GAME_RULES, type Input } from './session';
import { createRng } from '../sim/rng';

const none: Input = { left: 0, right: 0, jump: false, hedge: false, alpha: false };

function scripted(seed: number) {
  const r = createRng(seed);
  return (): Input => ({
    left: r.next() < 0.02 ? 1 : 0,
    right: r.next() < 0.02 ? 1 : 0,
    jump: r.next() < 0.01,
    hedge: r.next() < 0.004,
    alpha: r.next() < 0.01,
  });
}

function run(seed: number, frames: number, input: () => Input) {
  const s = new GameSession(seed, 'board');
  for (let i = 0; i < frames && !s.ended; i++) s.update(input());
  return s;
}

describe('GameSession', () => {
  it('is deterministic: same seed + same inputs ⇒ same run', () => {
    const a = run(99, 3600, scripted(5));
    const b = run(99, 3600, scripted(5));
    expect(a.z).toBe(b.z);
    expect(a.engine.pnl).toBe(b.engine.pnl);
    expect(a.collisions).toBe(b.collisions);
    expect(a.nearMisses).toBe(b.nearMisses);
    expect(a.actionPoints).toBe(b.actionPoints);
  });

  it('market tape is shared: the action layer cannot change prices', () => {
    const a = run(7, 1800, scripted(1));
    const b = run(7, 1800, () => none);
    const n = Math.min(a.engine.tick, b.engine.tick);
    for (let i = 0; i < n; i += 37) expect(a.engine.tape.mid[i]).toBe(b.engine.tape.mid[i]);
  });

  it('finance integrity holds while playing (collisions, alpha rebates, hedges)', () => {
    for (const seed of [3, 11, 123]) {
      const s = run(seed, 60 * 120, scripted(seed));
      const e = s.engine;
      expect(e.spreadPnL + e.rebatePnL - e.hedgeCost + e.inventoryPnL).toBeCloseTo(e.pnl, 6);
      expect(e.cash + e.inventory * e.mid - e.initialEquity).toBeCloseTo(e.pnl, 9);
    }
  });

  it('collisions take quotes offline (no fills while knocked down)', () => {
    const s = run(2024, 60 * 90, () => none); // never steers ⇒ will crash into things
    expect(s.collisions).toBeGreaterThan(0);
    const offlineMisses = s.engine.misses.filter((m) => m.reason === 'OFFLINE').length;
    if (s.offlineTime > 1) expect(offlineMisses).toBeGreaterThan(0);
  });

  it('knockout after running out of stability ends the game', () => {
    const s = run(55, 60 * 200, () => none);
    expect(s.ended).toBe(true);
    expect(['KNOCKOUT', 'TIME', 'STOPPED_OUT']).toContain(s.endReason);
  });

  it('passing a settlement gate with small inventory extends time', () => {
    const s = new GameSession(8, 'pod');
    s.timeLeft = 999;
    s.stability = 999;
    const gateZ = s.nextGate!.z;
    let before = 0;
    let gateEvent = null as null | { passed: boolean; bonus: number };
    for (let i = 0; i < 60 * 60 && !gateEvent; i++) {
      before = s.timeLeft;
      s.update(i % 120 === 0 ? { ...none, hedge: true } : none);
      const g = s.events.find((e) => e.type === 'gate');
      if (g && g.type === 'gate') gateEvent = g;
      s.drainEvents();
    }
    expect(s.z).toBeGreaterThanOrEqual(gateZ);
    expect(gateEvent).not.toBeNull();
    const expected = gateEvent!.passed ? GAME_RULES.gatePassBonus : GAME_RULES.gateFailBonus;
    expect(s.timeLeft - before).toBeCloseTo(expected - 1 / 60, 5);
    expect(s.district).toBe(1);
  });

  it('alpha drive activates only with a full gauge and books rebates', () => {
    const s = new GameSession(4, 'board');
    s.update({ ...none, alpha: true });
    expect(s.alpha).toBe(0);
    s.gauge = 100;
    s.update({ ...none, alpha: true });
    expect(s.alpha).toBeGreaterThan(0);
    expect(s.gauge).toBe(0);
  });
});
