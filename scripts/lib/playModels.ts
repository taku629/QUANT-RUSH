/**
 * Simulated play styles — COMPUTER MODELS, NOT A HUMAN PLAYTEST.
 *
 * Each style is a crude model of a player: a perception→action delay, a distraction delay before a
 * HEDGE prompt is noticed, jump-timing noise and a chance to overlook an obstacle. Real people read
 * the screen, learn, panic and get bored in ways none of this captures; use the numbers to compare
 * rule variants against each other, never as a substitute for watching people play.
 *
 */
import { GameSession, type Input, type Obstacle } from '../../src/game/session';
import { autopilot } from '../../src/game/autopilot';
import { LANE_X } from '../../src/game/content';
import { BALANCE } from '../../src/game/gameBalanceConfig';
import { createRng, type Rng } from '../../src/sim/rng';
import { riskStats } from '../../src/sim/scoring';
import type { LaneId } from '../../src/sim/config';

export type Style = {
  name: string;
  /** perception → action delay (s) */
  reaction: number;
  /** mean extra delay before a HEDGE prompt is noticed (s, exponential) */
  distract: number;
  /** gauge level the player waits for before hedging (null = never hedges) */
  hedgeAt: number | null;
  /** lane policy: follow the glowing lane, sit in a fixed lane, or follow it but use own judgement */
  lane: 'rec' | 'think' | 'blocks' | 'gamble' | LaneId;
  /** std of jump timing error (s) */
  jumpErr: number;
  /** chance to overlook an obstacle completely */
  lapse: number;
  /** use the built-in perfect autopilot (reference only) */
  bot?: boolean;
};

const C = { reaction: 0.55, distract: 0.6, jumpErr: 0.07, lapse: 0.04 }; // "casual"
export const STYLES: Style[] = [
  { name: 'BOT (perfect autopilot)', reaction: 0, distract: 0, hedgeAt: 0.75, lane: 'rec', jumpErr: 0, lapse: 0, bot: true },
  { name: 'BEGINNER follow+hedge@prompt', reaction: 0.9, distract: 1.2, hedgeAt: 0.7, lane: 'rec', jumpErr: 0.11, lapse: 0.08 },
  { name: 'CASUAL follow+hedge@prompt', ...C, hedgeAt: 0.7, lane: 'rec' },
  { name: 'SKILLED follow+hedge@85', reaction: 0.35, distract: 0.25, hedgeAt: 0.85, lane: 'rec', jumpErr: 0.04, lapse: 0.015 },
  { name: 'GREEDY follow+hedge@95', reaction: 0.35, distract: 0.25, hedgeAt: 0.95, lane: 'rec', jumpErr: 0.04, lapse: 0.015 },
  { name: 'CAUTIOUS follow+hedge@40', ...C, hedgeAt: 0.4, lane: 'rec' },
  { name: 'NO-HEDGE follow', ...C, hedgeAt: null, lane: 'rec' },
  { name: 'FIXED LEFT  hedge@prompt', ...C, hedgeAt: 0.7, lane: 0 },
  { name: 'FIXED CENTER hedge@prompt', ...C, hedgeAt: 0.7, lane: 1 },
  { name: 'FIXED RIGHT hedge@prompt', ...C, hedgeAt: 0.7, lane: 2 },
  { name: 'THINKER (reads tape)', ...C, hedgeAt: 0.7, lane: 'think' },
  { name: 'BLOCK READER (picks blocks)', ...C, hedgeAt: 0.7, lane: 'blocks' },
  { name: 'GAMBLER (chases all blocks)', ...C, hedgeAt: 0.7, lane: 'gamble' },
  { name: 'CASUAL CHICKEN hedge@95', ...C, hedgeAt: 0.95, lane: 'rec' },
];

type Snap = { risk: number; rec: LaneId; overload: boolean };

/** a player model driving a GameSession */
export class ModelPlayer {
  private hist: Snap[] = [];
  private seen = new Map<number, boolean>();
  private jumpOff = new Map<number, number>();
  private promptAt: number | null = null;
  private noticeAt = 0;
  private rng: Rng;
  constructor(readonly st: Style, seed: number) {
    this.rng = createRng(seed ^ 0x9a17);
  }
  private gauss() {
    const u = Math.max(1e-9, this.rng.next());
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.rng.next());
  }
  private noticed(o: Obstacle) {
    let v = this.seen.get(o.id);
    if (v === undefined) this.seen.set(o.id, (v = this.rng.next() >= this.st.lapse));
    return v;
  }
  private tth(s: GameSession, lane: LaneId) {
    let best = Infinity;
    const sp = Math.max(10, s.speed);
    for (const o of s.obstacles) {
      if (!o.alive || o.passed || o.kind === 'barrier' || !this.noticed(o)) continue;
      const ahead = o.z - o.len / 2 - s.z;
      if (ahead + o.len < -2.5) continue;
      const xs = o.changeAt > 0 && o.targetLane !== o.lane ? [o.x, LANE_X[o.targetLane]] : [o.x];
      if (!xs.some((x) => Math.abs(x - LANE_X[lane]) < o.w / 2 + 0.9)) continue;
      if (o.kind === 'debris' && o.y > 12 && ahead > 60) continue;
      best = Math.min(best, Math.max(0, ahead) / Math.max(1, sp - o.speed));
    }
    return best;
  }
  /** own judgement on top of the glowing lane (public information only) */
  private think(s: GameSession, rec: LaneId): { lane: LaneId; hedge: boolean } {
    const e = s.engine;
    const sig = e.signals();
    let lane = rec;
    let hedge = false;
    if (this.st.lane === 'blocks' || this.st.lane === 'gamble') {
      // block orders: big size in one lane. Gambler takes every one; the reader only when the tape is calm
      // or the flow is announced (forced, temporary) and the gauge has room — and lightens up first.
      let best: { lane: LaneId; t: number } | null = null;
      e.forEachVisibleOrder((o, _tier, ticks) => {
        const t = ticks * e.cfg.dt;
        if (o.block !== undefined && t > 0.3 && (!best || t < best.t)) best = { lane: o.block, t };
      });
      const b = best as { lane: LaneId; t: number } | null;
      if (b) {
        const ok = this.st.lane === 'gamble' || ((sig.read === 'ANNOUNCED' || (b.lane === 2 && sig.read !== 'ONE_SIDED')) && e.regime !== 'CRASH' && s.risk < 0.45);
        if (ok) {
          lane = b.lane;
          if (this.st.lane === 'blocks' && s.risk > 0.25) hedge = true;
        }
      }
      return { lane, hedge };
    }
    // a block order is about to reach my lane: lighten up first so it does not overload me
    let blockLane: LaneId | null = null;
    e.forEachVisibleOrder((o, _tier, ticks) => {
      if (o.block !== undefined && ticks * e.cfg.dt < 2.2) blockLane = o.block;
    });
    if (blockLane !== null && s.risk > 0.3) hedge = true;
    // one-sided flow running against my inventory: cut it before the gauge says so
    const flow = 0.5 * sig.incomingImbalance + 0.5 * sig.recentImbalance;
    if (sig.read === 'ONE_SIDED' && e.inventory * flow < 0 && s.risk > 0.3) hedge = true;
    if ((e.regime === 'CRASH' || e.regime === 'VOLATILE') && s.risk > 0.5) hedge = true;
    // busy two-sided flow and a calm tape: the tight lane earns more than the glow says
    if (sig.read === 'RUSH' && e.regime === 'CALM') lane = 0;
    return { lane, hedge };
  }

  act(s: GameSession, f: number): Input {
    if (this.st.bot) return autopilot(s, f, typeof this.st.lane === 'number' ? this.st.lane : undefined);
    const inp: Input = { left: 0, right: 0, jump: false, hedge: false, alpha: false };
    this.hist.push({ risk: s.risk, rec: s.advisor.lane, overload: s.overload > 0 });
    const d = this.hist[Math.max(0, this.hist.length - 1 - Math.round(this.st.reaction * 60))];
    // jumps: low barriers, with timing noise
    for (const o of s.obstacles) {
      if (!o.alive || o.passed || o.kind !== 'barrier' || Math.abs(o.x - s.x) > o.w / 2 + 0.6 || !this.noticed(o)) continue;
      let off = this.jumpOff.get(o.id);
      if (off === undefined) this.jumpOff.set(o.id, (off = this.gauss() * this.st.jumpErr));
      const ahead = o.z - s.z;
      if (ahead > 0 && ahead < 3 + s.speed * Math.max(0.02, 0.16 + off)) inp.jump = true;
    }
    // lane
    const judg = this.st.lane === 'think' || this.st.lane === 'blocks' || this.st.lane === 'gamble' ? this.think(s, d.rec) : null;
    const pref: LaneId = typeof this.st.lane === 'number' ? this.st.lane : judg ? judg.lane : d.rec;
    const step = Math.max(4, Math.round(this.st.reaction * 20));
    if (f % step === 0) {
      const cur = s.targetLane;
      const safe = 0.6 + this.st.reaction;
      const c = [0, 1, 2].map((l) => this.tth(s, l as LaneId));
      const reach = [cur - 1, cur, cur + 1].filter((l) => l >= 0 && l <= 2) as LaneId[];
      let target: LaneId = cur;
      if (c[cur] < safe) target = reach.reduce((a, b) => (c[b] > c[a] ? b : a), cur);
      else if (pref !== cur) {
        const next = (cur + Math.sign(pref - cur)) as LaneId;
        if (c[next] > safe * 1.5) target = next;
      }
      if (target < cur) inp.left = 1;
      else if (target > cur) inp.right = 1;
    }
    // hedge: wait for the chosen level (or the red OVERLOAD flash), notice it after a distraction delay
    if (this.st.hedgeAt !== null) {
      // the gate banner ("RISK CHECK < 60 %") is read like any other prompt
      const g = s.nextGate;
      const gateCheck = !!g && g.z - s.z < 220 && s.currentExposure() >= BALANCE.risk.gateMax; // the gauge shows exposure as a ghost bar
      const want = d.risk >= this.st.hedgeAt || d.overload || gateCheck || (judg?.hedge ?? false);
      if (want) {
        if (this.promptAt === null) {
          this.promptAt = s.t;
          this.noticeAt = s.t + -Math.log(Math.max(1e-6, this.rng.next())) * this.st.distract;
        }
        if (s.t >= this.noticeAt && f % 6 === 0) inp.hedge = true;
      } else if (d.risk < this.st.hedgeAt * 0.8) this.promptAt = null;
    }
    if (s.alphaReady && this.hist.length % 30 === 0) inp.alpha = true;
    return inp;
  }
}

export type BurstInfo = { warnTime: number; jump: number; cooldown: number; block: boolean; regime: boolean; overloadSeen: number };

export type RunResult = {
  seconds: number; end: string; pnl: number; dd: number; rar: number; score: number; coll: number; settles: number; bursts: number;
  inRec: number; trade: number; action: number; pnlPts: number; hedgeCost: number; spread: number; invPnl: number; adverse: number; hedges: number; bi: BurstInfo[]; sweet: number;
};

export function runStyle(st: Style, seed: number, vehicle: 'board' | 'bike' | 'pod' = 'board'): RunResult {
  const s = new GameSession(seed, vehicle);
  const p = new ModelPlayer(st, seed);
  const R = BALANCE.risk;
  let prev = 0, crossT = 0, regime = s.engine.regime, fills = 0, sweet = 0;
  let pending: BurstInfo | null = null;
  const bi: BurstInfo[] = [];
  for (let f = 0; f < 60 * 400 && !s.ended; f++) {
    s.update(p.act(s, f));
    for (const ev of s.drainEvents()) {
      if (ev.type === 'riskBurst' && pending) bi.push(pending);
      if (ev.type === 'settle' && ev.sweet) sweet++;
    }
    if (s.frame % 3 !== 0) continue;
    const e = s.engine;
    if (s.risk >= R.warnAt && prev < R.warnAt) crossT = s.t;
    if (s.risk >= 1 && prev < 1) {
      const newFills = e.fills.slice(fills);
      pending = {
        warnTime: s.t - crossT, jump: s.risk - prev, cooldown: Math.max(0, e.hedgeReadyTick - e.tick) * e.cfg.dt,
        block: newFills.some((x) => e.tape.orders[x.orderId].block !== undefined), regime: e.regime !== regime, overloadSeen: 0,
      };
    }
    if (pending && s.risk >= 1) pending.overloadSeen = s.overload;
    prev = s.risk;
    fills = e.fills.length;
    regime = e.regime;
  }
  if (!s.ended) s.finish('TIME');
  const r = riskStats(s.engine);
  const sc = s.score();
  return {
    seconds: s.t, end: s.endReason ?? '?', pnl: r.pnl, dd: r.maxDrawdown, rar: r.rar, score: sc.total, coll: s.collisions, settles: s.settlements,
    bursts: s.riskBursts, trade: sc.tradingPoints, action: sc.actionPoints, pnlPts: sc.total - sc.tradingPoints - sc.actionPoints, inRec: s.recLaneTime / Math.max(1, s.engine.time), hedgeCost: r.hedgeCost, spread: r.spreadPnL, invPnl: r.inventoryPnL,
    adverse: r.adverseSelection, hedges: r.hedges, bi, sweet,
  };
}

export function summarize(rows: RunResult[]) {
  const avg = (fn: (r: RunResult) => number) => rows.reduce((a, r) => a + fn(r), 0) / rows.length;
  const sorted = rows.map((r) => r.pnl).sort((a, b) => a - b);
  const mins = avg((r) => r.seconds) / 60;
  return {
    len: avg((r) => r.seconds), pnl: avg((r) => r.pnl), pnlP10: sorted[Math.floor(rows.length * 0.1)], dd: avg((r) => r.dd), rar: avg((r) => r.rar),
    score: avg((r) => r.score), collPerMin: avg((r) => r.coll) / mins, settles: avg((r) => r.settles), sweet: avg((r) => r.sweet), bursts: avg((r) => r.bursts),
    burstRuns: rows.filter((r) => r.bursts > 0).length / rows.length, inRec: avg((r) => r.inRec), hedgeCost: avg((r) => r.hedgeCost),
    spread: avg((r) => r.spread), invPnl: avg((r) => r.invPnl), adverse: avg((r) => r.adverse),
    trade: avg((r) => r.trade), action: avg((r) => r.action), pnlPts: avg((r) => r.pnlPts),
    ko: rows.filter((r) => r.end === 'KNOCKOUT').length / rows.length,
  };
}

