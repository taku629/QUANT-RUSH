/**
 * Key moments + counterfactual replays for the post-game timeline.
 * Because the market tape never depends on the player, we can replay the exact same market with one
 * decision changed and measure the difference — no guesswork.
 */
import { LANES, type LaneId, type RegimeId } from './config';
import { MarketMakerEngine, type Action } from './engine';
import { computeSignals, type FlowRead } from './signals';
import type { MarketTape } from './tape';

export type Alternative = { label: string; delta: number };

export type KeyMoment = {
  tick: number;
  time: number;
  kind: 'DRAWDOWN' | 'BEST' | 'CRASH' | 'TOXIC_BURST';
  title: string;
  /** what the player could observe at that moment */
  context: { regime: RegimeId; read: FlowRead; imbalance: number; momentum1s: number; inventory: number; lane: LaneId; news: string | null };
  /** what happened (PnL change over the window) */
  pnlChange: number;
  windowSec: number;
  alternatives: Alternative[];
  /** best alternative if it beats what was done by a meaningful margin */
  lesson: string;
};

const LN = ['AGGRESSIVE', 'BALANCED', 'DEFENSIVE'] as const;

/** replay `actions` with a patch applied for ticks in [from, to); return PnL at tick `at` */
export function counterfactualPnL(tape: MarketTape, actions: Action[], from: number, to: number, patch: (a: Action, tick: number) => Action, at: number): number {
  const e = new MarketMakerEngine(tape);
  const end = Math.min(at, actions.length);
  for (let t = 0; t < end && !e.done; t++) {
    const a = actions[t];
    e.step(t >= from && t < to ? patch(a, t) : a);
  }
  return e.pnl;
}

function pnlAt(tape: MarketTape, actions: Action[], at: number) {
  return counterfactualPnL(tape, actions, 0, 0, (a) => a, at);
}

export function findKeyMoments(engine: MarketMakerEngine, max = 6): KeyMoment[] {
  const tape = engine.tape;
  const actions = engine.actions;
  const dt = tape.config.dt;
  const W = Math.round(3 / dt); // decision window
  const H = Math.round(2 / dt); // let the consequences play out
  const series = engine.pnlBySecond;
  const sec = Math.round(1 / dt);
  const candidates: { tick: number; change: number }[] = [];
  for (let s = 0; s + 3 < series.length; s++) candidates.push({ tick: s * sec, change: series[s + 3] - series[s] });
  const pick = (list: typeof candidates, n: number) => {
    const out: typeof candidates = [];
    for (const c of list) {
      if (out.length >= n) break;
      if (out.every((o) => Math.abs(o.tick - c.tick) >= W * 2)) out.push(c);
    }
    return out;
  };
  const worst = pick([...candidates].sort((a, b) => a.change - b.change).filter((c) => c.change < -40), 4);
  const best = pick([...candidates].sort((a, b) => b.change - a.change).filter((c) => c.change > 40), 1);
  const crash = tape.segments.find((g) => g.regime === 'CRASH' && g.startTick < engine.tick - W);

  const moments: KeyMoment[] = [];
  const build = (tick: number, kind: KeyMoment['kind'], title: string) => {
    if (tick + W > actions.length) return;
    const sig = computeSignals(tape, tick);
    const inv = timelineInventory(engine, tick);
    const lane = actions[tick]?.lane ?? 1;
    const at = Math.min(actions.length, tick + W + H);
    const base = pnlAt(tape, actions, at);
    const before = pnlAt(tape, actions, tick);
    const alts: Alternative[] = [];
    for (const l of [0, 1, 2] as LaneId[]) {
      if (actions.slice(tick, tick + W).every((a) => a.lane === l)) continue;
      const v = counterfactualPnL(tape, actions, tick, tick + W, (a) => ({ ...a, lane: l }), at);
      alts.push({ label: `${W * dt}秒間 ${LN[l]}（±${Math.round(LANES[l].halfSpread * 100)}¢）`, delta: v - base });
    }
    if (inv !== 0) {
      const v = counterfactualPnL(tape, actions, tick, tick + 1, (a) => ({ ...a, hedge: true }), at);
      alts.push({ label: 'この瞬間に HEDGE', delta: v - base });
    }
    alts.sort((a, b) => b.delta - a.delta);
    const top = alts[0];
    const lesson =
      top && top.delta > 15
        ? `「${top.label}」なら ${top.delta >= 0 ? '+' : '−'}$${Math.abs(top.delta).toFixed(0)} 良い結果でした。`
        : 'この場面での判断はほぼ最善でした（他の選択肢との差は小さい）。';
    moments.push({
      tick,
      time: tick * dt,
      kind,
      title,
      context: { regime: tape.regime[Math.min(tick, tape.totalTicks - 1)], read: sig.read, imbalance: 0.5 * (sig.incomingImbalance + sig.recentImbalance), momentum1s: sig.momentum1s, inventory: inv, lane, news: sig.news?.text ?? null },
      pnlChange: base - before,
      windowSec: (W + H) * dt,
      alternatives: alts,
      lesson,
    });
  };
  for (const w of worst) build(w.tick, 'DRAWDOWN', '損失が膨らんだ場面');
  for (const b of best) build(b.tick, 'BEST', '最も稼いだ場面');
  if (crash && !worst.some((w) => Math.abs(w.tick - crash.startTick) < W * 2)) build(crash.startTick, 'CRASH', '暴落の始まり');
  moments.sort((a, b) => a.tick - b.tick);
  return moments.slice(0, max);
}

/** inventory at a tick, reconstructed from the trade blotter */
export function timelineInventory(e: MarketMakerEngine, tick: number): number {
  let inv = 0;
  for (const f of e.fills) if (f.tick < tick) inv += f.qty;
  for (const h of e.hedges) if (h.tick < tick) inv += h.qty;
  return inv;
}
