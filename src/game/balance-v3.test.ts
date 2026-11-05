import { describe, expect, it } from 'vitest';
import { autopilot } from './autopilot';
import { BALANCE } from './gameBalanceConfig';
import { rawRecommendation } from './recommend';
import { GameSession } from './session';
import type { MarketSignals } from '../sim/signals';

/** v3.1 balance rules: a forced liquidation is always avoidable, and the score follows trading quality */
describe('v3.1 RISK gauge: forced liquidation is a visible, avoidable failure', () => {
  it('the gauge never jumps: it climbs at most riseRate per second', () => {
    for (const seed of [3, 17, 29]) {
      const s = new GameSession(seed, 'board');
      s.timeLeft = 9999;
      s.stability = 999;
      let prev = 0;
      for (let f = 0; f < 60 * 60 && !s.ended; f++) {
        const inp = autopilot(s, f);
        inp.hedge = false; // never hedge → the gauge is pushed as hard as the market allows
        s.update(inp);
        s.drainEvents();
        if (s.frame % 3 === 0) {
          expect(s.risk - prev).toBeLessThanOrEqual(BALANCE.risk.riseRate * s.engine.cfg.dt + 1e-9);
          prev = s.risk;
        }
      }
    }
  });

  it('every forced liquidation follows a full OVERLOAD countdown with HEDGE usable', () => {
    let bursts = 0;
    for (const seed of [3, 17, 29, 41]) {
      const s = new GameSession(seed, 'board');
      s.timeLeft = 9999;
      s.stability = 999;
      let usableOverload = 0;
      for (let f = 0; f < 60 * 90 && !s.ended; f++) {
        const inp = autopilot(s, f);
        inp.hedge = false;
        const ready = s.engine.tick >= s.engine.hedgeReadyTick;
        const wasOver = s.risk >= 1;
        s.update(inp);
        for (const e of s.drainEvents()) {
          if (e.type !== 'riskBurst') continue;
          bursts++;
          expect(usableOverload).toBeGreaterThanOrEqual(BALANCE.risk.burstGrace - 0.05);
          expect(e.points).toBe(BALANCE.risk.burstScore);
          usableOverload = 0;
        }
        if (s.frame % 3 === 0) usableOverload = wasOver && s.risk >= 1 ? usableOverload + (ready ? s.engine.cfg.dt : 0) : 0;
      }
    }
    expect(bursts).toBeGreaterThan(0); // a player who never hedges does burst
  });

  it('an attentive player who hedges at the HEDGE! prompt practically never bursts', () => {
    let bursts = 0;
    for (const seed of [5, 6, 7, 8, 9, 10]) {
      const s = new GameSession(seed * 31, 'board');
      for (let f = 0; f < 60 * 120 && !s.ended; f++) {
        s.update(autopilot(s, f));
        s.drainEvents();
      }
      bursts += s.riskBursts;
    }
    expect(bursts).toBe(0);
  });

  it('settlement bonus only from the sweet-spot threshold up; small hedges are free of bonus', () => {
    const s = new GameSession(12, 'board');
    let low = 0, high = 0;
    for (let f = 0; f < 60 * 90 && !s.ended; f++) {
      const inp = autopilot(s, f);
      inp.hedge = s.risk > 0.3 && f % 20 === 0;
      s.update(inp);
      for (const e of s.drainEvents()) {
        if (e.type !== 'settle') continue;
        if (e.risk < BALANCE.risk.settleMin) {
          low++;
          expect(e.points).toBe(0);
        } else {
          high++;
          expect(e.points).toBeGreaterThan(0);
        }
      }
    }
    expect(low + high).toBeGreaterThan(0);
  });
});

describe('v3.1 score follows trading quality', () => {
  it('toxic fills lose trading points when their markout is known', () => {
    const s = new GameSession(424242, 'board');
    let toxic = 0;
    for (let f = 0; f < 60 * 60 && !s.ended; f++) {
      s.update(autopilot(s, f, 0)); // tight lane: plenty of adverse selection
      for (const e of s.drainEvents()) {
        if (e.type !== 'toxic') continue;
        toxic++;
        expect(e.points).toBeLessThan(0);
      }
    }
    expect(toxic).toBeGreaterThan(0);
  });

  it('the glowing lane favours wide quotes in fast or one-sided markets and tight only in calm busy flow', () => {
    const sig = (read: MarketSignals['read']): MarketSignals => ({
      incomingImbalance: 0, recentImbalance: 0, momentum1s: 0, momentum3s: 0, orderRate: 4, avgTier: 1.5, laneIncome: [1, 1, 1], news: null, read,
    });
    expect(rawRecommendation(sig('BALANCED'), 'CRASH', 0.02)).toBe(2);
    expect(rawRecommendation(sig('BALANCED'), 'VOLATILE', 0.02)).toBe(2);
    expect(rawRecommendation(sig('ONE_SIDED'), 'CALM', 0.01)).toBe(2);
    expect(rawRecommendation(sig('ANNOUNCED'), 'CALM', 0.01)).toBe(2);
    expect(rawRecommendation(sig('RUSH'), 'CALM', 0.01)).toBe(0);
    expect(rawRecommendation(sig('RUSH'), 'CALM', 0.05)).toBe(1);
    expect(rawRecommendation(sig('BALANCED'), 'CALM', 0.01)).toBe(1);
  });
});

describe('v3.1 review fixes (regressions)', () => {
  it('the live HUD score is exactly the final score function (no separate formula)', async () => {
    const { useGame, runtime } = await import('./store');
    const s = new GameSession(424242, 'board');
    runtime.session = s;
    let checked = 0;
    for (let f = 0; f < 60 * 70 && !s.ended; f++) {
      s.update(autopilot(s, f));
      s.drainEvents();
      if (f % 300 === 299) {
        useGame.getState().updateHud();
        expect(useGame.getState().hud!.score).toBe(s.score().total);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
    expect(s.engine.pnl).not.toBe(0); // PnL weight actually matters for this check
    runtime.session = null;
  });

  it('a gate checks the true exposure, not the lagged gauge', () => {
    const s = new GameSession(7, 'board');
    s.timerFrozen = true;
    for (let f = 0; f < 60 * 3; f++) s.update(autopilot(s, f));
    const g = s.nextGate!;
    // a big position appears just before the gate: the gauge has not caught up yet …
    s.engine.inventory = Math.round(BALANCE.risk.fullInventory * 0.9);
    s.risk = 0.1;
    s.z = g.z - 0.5;
    s.drainEvents();
    const inp = { left: 0, right: 0, jump: false, hedge: false, alpha: false };
    for (let f = 0; f < 3 && !s.nextGate?.passed && s.gates[g.index].passed === false; f++) s.update(inp);
    const gate = s.drainEvents().find((e) => e.type === 'gate');
    expect(s.risk).toBeLessThan(BALANCE.risk.gateMax); // … but the gate still sees the real risk
    expect(gate && gate.type === 'gate' && gate.passed).toBe(false);
  });

  it('a gate is passed when the true exposure is low, whatever the gauge says', () => {
    const s = new GameSession(7, 'board');
    s.timerFrozen = true;
    for (let f = 0; f < 60 * 3; f++) s.update(autopilot(s, f));
    const g = s.nextGate!;
    s.engine.inventory = 0;
    s.risk = 0.9;
    s.z = g.z - 0.5;
    s.drainEvents();
    s.update({ left: 0, right: 0, jump: false, hedge: false, alpha: false });
    const gate = s.drainEvents().find((e) => e.type === 'gate');
    expect(gate && gate.type === 'gate' && gate.passed).toBe(true);
  });

  it('a toxic fill is worth negative points in total, even with combo and ALPHA multipliers', () => {
    let toxic = 0;
    for (const seed of [424242, 777, 31]) {
      const s = new GameSession(seed, 'board');
      s.timeLeft = 9999;
      s.stability = 999;
      const fillPts = new Map<number, number>();
      for (let f = 0; f < 60 * 90 && !s.ended; f++) {
        const inp = autopilot(s, f, 0); // tight lane: lots of adverse selection, long combos
        s.update(inp);
        for (const e of s.drainEvents()) {
          if (e.type === 'fill') fillPts.set(e.fill.orderId, e.points);
          if (e.type === 'toxic') {
            toxic++;
            expect((fillPts.get(e.fill.orderId) ?? 0) + e.points).toBeLessThanOrEqual(0);
          }
        }
      }
      expect(s.alphaCount + s.maxCombo).toBeGreaterThan(5); // multipliers were really in play
    }
    expect(toxic).toBeGreaterThan(20);
  });
});
