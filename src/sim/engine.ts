/**
 * MarketMakerEngine — the financial core of QUANT RUSH.
 *
 * Pure TypeScript, no DOM / Three.js. Drive it with `step(action)` once per tick (dt = config.dt).
 * The same engine powers the 3D game, the unit tests and the Quant Lab strategy runner, and its
 * observation/action interface is shaped so it can be ported to Python / RL environments.
 *
 * Accounting (single source of truth):
 *   cash, inventory are the only state that money flows through.
 *   PnL = cash + inventory × mid − initialEquity
 * Attribution lines (spread, rebate, hedge cost, inventory PnL) are tracked separately ONLY for
 * explanation; they are never added to PnL. Invariant (tested):
 *   PnL ≡ spreadPnL + rebatePnL − hedgeCost + inventoryPnL
 */
import { DEFAULT_CONFIG, LANES, REGIME_PARAMS, urgencyTier, type LaneId, type RegimeId, type SimConfig } from './config';
import { generateTape, type Headline, type MarketTape, type NewsItem, type Side, type TakerOrder } from './tape';
import { computeSignals, type MarketSignals } from './signals';

export type Action = {
  /** which quote width we show (0 = AGGRESSIVE … 2 = DEFENSIVE) */
  lane: LaneId;
  /** request to flatten inventory at market (subject to cooldown) */
  hedge: boolean;
  /** false while the player is knocked down — our quotes are offline and nothing fills */
  quoting?: boolean;
  /** liquidity-incentive program active (ALPHA DRIVE): maker rebate on fills + hedge exchange fee waived */
  rebate?: boolean;
  /**
   * Forced liquidation ("RISK BURST"): flatten now, ignoring the hedge cooldown, paying this extra cost per share
   * on top of the normal hedge cost. Booked as hedge cost (real money), so PnL accounting stays exact.
   */
  forceFlatten?: number;
};

export type MissReason = 'PRICE' | 'QUEUE' | 'LIMIT' | 'OFFLINE' | 'ROUTE';

export type Fill = {
  orderId: number;
  tick: number;
  takerSide: Side;
  /** signed change of OUR inventory (+ bought, − sold) */
  qty: number;
  price: number;
  mid: number;
  lane: LaneId;
  regime: RegimeId;
  halfSpread: number;
  /** spread captured vs. mid at fill time = |qty| × halfSpread */
  spread: number;
  rebate: number;
  /** hidden during play — revealed only in post-game analysis */
  informed: boolean;
  /** qty × (mid[t + horizon] − price): value of the trade after `infoHorizon` seconds (null until known) */
  markout: number | null;
  toxic: boolean;
};

export type HedgeRecord = {
  tick: number;
  /** signed change of our inventory */
  qty: number;
  price: number;
  mid: number;
  costPerShare: number;
  cost: number;
  regime: RegimeId;
  inventoryBefore: number;
  /** true when this was a forced liquidation */
  forced?: boolean;
};

export type StepEvents = {
  tick: number;
  fills: Fill[];
  misses: { order: TakerOrder; reason: MissReason }[];
  hedge: HedgeRecord | null;
  hedgeRejected: 'COOLDOWN' | 'FLAT' | null;
  /** fills whose markout became known this tick */
  markouts: Fill[];
  headline: Headline | null;
  /** public news published this tick */
  news: NewsItem[];
  comboBroken: 'TOXIC' | 'TIMEOUT' | null;
  limitHit: boolean;
  stoppedOut: boolean;
};

export type VisibleOrder = {
  id: number;
  side: Side;
  qty: number;
  /** urgency rings: how wide a spread this taker will pay (0–3) */
  tier: 0 | 1 | 2 | 3;
  ticksToArrival: number;
  spawnTick: number;
  arriveTick: number;
  /** block orders: the lane they physically sit in */
  block?: LaneId;
};

/** Everything a player (or agent) is allowed to know at the current tick. No future data. */
export type Observation = {
  tick: number;
  time: number;
  mid: number;
  regime: RegimeId;
  inventory: number;
  cash: number;
  pnl: number;
  lane: LaneId;
  hedgeReady: boolean;
  hedgeCooldown: number;
  hedgeCostPerShare: number;
  positionLimit: number;
  combo: number;
  /** realised 1-second volatility estimate from past mids ($) */
  realizedVol: number;
  /** 1-tick-horizon parametric VaR of current inventory (95%, 1s, $) */
  var95: number;
  incoming: VisibleOrder[];
  /** public tape / flow signals */
  signals: MarketSignals;
};

export type TimelinePoint = { tick: number; mid: number; pnl: number; inventory: number; lane: LaneId; regime: RegimeId };

export class MarketMakerEngine {
  readonly tape: MarketTape;
  readonly cfg: SimConfig;
  readonly horizonTicks: number;
  readonly leadTicks: number;
  readonly cooldownTicks: number;
  readonly initialEquity: number;

  tick = 0;
  cash: number;
  inventory = 0;
  lane: LaneId = 1;
  hedgeReadyTick = 0;
  ended = false;
  stoppedOut = false;

  // combo & score-side counters (do not affect PnL)
  combo = 0;
  maxCombo = 0;
  lastFillTick = -1;

  // attribution (explanatory only)
  spreadPnL = 0;
  rebatePnL = 0;
  hedgeCost = 0;
  inventoryPnL = 0;
  /** inventory PnL broken down by the regime it was earned/lost in */
  inventoryPnLByRegime: Record<RegimeId, number> = { CALM: 0, TRENDING: 0, VOLATILE: 0, CRASH: 0 };

  // risk stats
  peakPnL = 0;
  maxDrawdown = 0;
  maxAbsInventory = 0;
  ticksAtLimit = 0;
  sumAbsInventory = 0;
  /** PnL at each whole second (index = second) */
  pnlBySecond: number[] = [0];

  fills: Fill[] = [];
  hedges: HedgeRecord[] = [];
  misses: { orderId: number; tick: number; reason: MissReason; lane: LaneId; regime: RegimeId; tier: number }[] = [];
  timeline: TimelinePoint[] = [];
  /** ticks spent in each lane, per regime */
  laneTicks: Record<RegimeId, [number, number, number]> = { CALM: [0, 0, 0], TRENDING: [0, 0, 0], VOLATILE: [0, 0, 0], CRASH: [0, 0, 0] };
  /** action log for exact replay */
  actions: Action[] = [];

  private pendingMarkouts: Fill[] = [];
  private newsCursor = 0;

  constructor(seedOrTape: number | MarketTape, config: SimConfig = DEFAULT_CONFIG) {
    this.tape = typeof seedOrTape === 'number' ? generateTape(seedOrTape, config) : seedOrTape;
    this.cfg = this.tape.config;
    this.horizonTicks = Math.round(this.cfg.infoHorizon / this.cfg.dt);
    this.leadTicks = Math.round(this.cfg.orderLead / this.cfg.dt);
    this.cooldownTicks = Math.round(this.cfg.hedgeCooldown / this.cfg.dt);
    this.cash = this.cfg.initialCash;
    this.initialEquity = this.cfg.initialCash; // start flat: no inventory
    this.timeline.push(this.point());
  }

  get mid(): number {
    return this.tape.mid[this.tick];
  }
  get regime(): RegimeId {
    return this.tape.regime[Math.min(this.tick, this.tape.totalTicks - 1)];
  }
  get pnl(): number {
    return this.cash + this.inventory * this.mid - this.initialEquity;
  }
  get time(): number {
    return this.tick * this.cfg.dt;
  }
  get done(): boolean {
    return this.ended || this.tick >= this.tape.totalTicks;
  }
  hedgeCostPerShare(regime: RegimeId = this.regime, feeWaived = false): number {
    return this.cfg.hedgeBaseCost + REGIME_PARAMS[regime].hedgeExtra - (feeWaived ? this.cfg.hedgeFee : 0);
  }
  comboMultiplier(combo = this.combo): number {
    return Math.min(3, 1 + Math.floor(combo / 5) * 0.25);
  }

  /** Advance one tick. Returns everything that happened, for effects / UI / logging. */
  step(action: Action): StepEvents {
    const ev: StepEvents = {
      tick: this.tick,
      fills: [],
      misses: [],
      hedge: null,
      hedgeRejected: null,
      markouts: [],
      headline: null,
      news: [],
      comboBroken: null,
      limitHit: false,
      stoppedOut: false,
    };
    if (this.done) return ev;
    const t = this.tick;
    const m = this.tape.mid[t];
    const regime = this.regime;
    const quoting = action.quoting !== false;
    const rec: Action = { lane: action.lane, hedge: action.hedge, quoting, rebate: !!action.rebate };
    if (action.forceFlatten !== undefined) rec.forceFlatten = action.forceFlatten;
    this.actions.push(rec);
    this.lane = action.lane;
    this.laneTicks[regime][action.lane]++;

    if (t === 0 || this.tape.regime[t - 1] !== regime) {
      ev.headline = this.tape.headlines.find((h) => h.tick === t) ?? null;
    }
    while (this.newsCursor < this.tape.news.length && this.tape.news[this.newsCursor].tick <= t) ev.news.push(this.tape.news[this.newsCursor++]);

    // 1) hedge: flatten inventory at mid ± cost (crossing the market's spread + fees)
    const forced = action.forceFlatten !== undefined && this.inventory !== 0;
    if (action.hedge || forced) {
      if (this.inventory === 0) ev.hedgeRejected = 'FLAT';
      else if (t < this.hedgeReadyTick && !forced) ev.hedgeRejected = 'COOLDOWN';
      else {
        const q = -this.inventory;
        const c = this.hedgeCostPerShare(regime, !!action.rebate) + (forced ? action.forceFlatten! : 0);
        const price = q > 0 ? m + c : m - c;
        const rec: HedgeRecord = { tick: t, qty: q, price, mid: m, costPerShare: c, cost: Math.abs(q) * c, regime, inventoryBefore: this.inventory };
        if (forced) rec.forced = true;
        this.cash -= q * price;
        this.inventory += q;
        this.hedgeCost += rec.cost;
        this.hedgeReadyTick = t + this.cooldownTicks;
        this.hedges.push(rec);
        ev.hedge = rec;
      }
    }

    // 2) taker orders reaching our quotes this tick
    const arrivals = this.tape.arrivals.get(t);
    if (arrivals) {
      const lp = LANES[action.lane];
      for (const o of arrivals) {
        const delta = o.side === 'BUY' ? -o.qty : o.qty; // taker buys from us ⇒ we sell
        let reason: MissReason | null = null;
        let qty = 0;
        if (!quoting) reason = 'OFFLINE';
        else if (o.block !== undefined && o.block !== action.lane) reason = 'ROUTE';
        else if (o.willingness < lp.halfSpread) reason = 'PRICE';
        else if (o.queueDraw >= lp.queueWin) reason = 'QUEUE';
        else {
          const room = delta > 0 ? this.cfg.positionLimit - this.inventory : this.cfg.positionLimit + this.inventory;
          qty = Math.sign(delta) * Math.min(Math.abs(delta), Math.max(0, room));
          if (qty === 0) {
            reason = 'LIMIT';
            ev.limitHit = true;
          }
        }
        if (reason) {
          ev.misses.push({ order: o, reason });
          this.misses.push({ orderId: o.id, tick: t, reason, lane: action.lane, regime, tier: urgencyTier(o.willingness) });
          continue;
        }
        const h = lp.halfSpread;
        const price = qty < 0 ? m + h : m - h; // sell at ask, buy at bid
        this.cash -= qty * price;
        this.inventory += qty;
        const spread = Math.abs(qty) * h;
        this.spreadPnL += spread;
        let rebate = 0;
        if (action.rebate) {
          rebate = Math.abs(qty) * this.cfg.rebatePerShare;
          this.cash += rebate;
          this.rebatePnL += rebate;
        }
        const fill: Fill = {
          orderId: o.id, tick: t, takerSide: o.side, qty, price, mid: m, lane: action.lane, regime,
          halfSpread: h, spread, rebate, informed: o.informed, markout: null, toxic: false,
        };
        this.fills.push(fill);
        this.pendingMarkouts.push(fill);
        ev.fills.push(fill);
        this.combo++;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
        this.lastFillTick = t;
        if (Math.abs(this.inventory) >= this.cfg.positionLimit) ev.limitHit = true;
      }
    }

    // 3) time passes: inventory is marked to the new mid
    const m1 = this.tape.mid[t + 1];
    this.inventoryPnL += this.inventory * (m1 - m);
    this.inventoryPnLByRegime[regime] += this.inventory * (m1 - m);
    this.tick = t + 1;

    // 4) markouts known now (past information only)
    while (this.pendingMarkouts.length && this.pendingMarkouts[0].tick + this.horizonTicks <= this.tick) {
      const f = this.pendingMarkouts.shift()!;
      this.resolveMarkout(f);
      ev.markouts.push(f);
      if (f.toxic && this.combo > 0) {
        this.combo = 0;
        ev.comboBroken = 'TOXIC';
      }
    }
    if (this.combo > 0 && this.tick - this.lastFillTick > this.cfg.comboTimeout / this.cfg.dt) {
      this.combo = 0;
      ev.comboBroken = ev.comboBroken ?? 'TIMEOUT';
    }

    // 5) risk statistics
    const pnl = this.pnl;
    this.peakPnL = Math.max(this.peakPnL, pnl);
    this.maxDrawdown = Math.max(this.maxDrawdown, this.peakPnL - pnl);
    const ai = Math.abs(this.inventory);
    this.maxAbsInventory = Math.max(this.maxAbsInventory, ai);
    this.sumAbsInventory += ai;
    if (ai >= this.cfg.positionLimit) this.ticksAtLimit++;
    const perSec = Math.round(1 / this.cfg.dt);
    if (this.tick % perSec === 0) this.pnlBySecond.push(pnl);
    if (this.tick % 10 === 0) this.timeline.push(this.point());

    if (pnl <= this.cfg.stopLoss) {
      this.stoppedOut = true;
      ev.stoppedOut = true;
      this.end();
    } else if (this.tick >= this.tape.totalTicks) this.end();
    return ev;
  }

  private resolveMarkout(f: Fill) {
    const later = this.tape.mid[Math.min(f.tick + this.horizonTicks, this.tape.mid.length - 1)];
    f.markout = f.qty * (later - f.price);
    f.toxic = f.markout < 0;
  }

  /** Stop the session (time up / knockout / stop-loss). Resolves outstanding markouts for analysis. */
  end() {
    if (this.ended) return;
    this.ended = true;
    for (const f of this.pendingMarkouts) this.resolveMarkout(f);
    this.pendingMarkouts = [];
    const last = this.timeline[this.timeline.length - 1];
    if (!last || last.tick !== this.tick) this.timeline.push(this.point());
    const perSec = Math.round(1 / this.cfg.dt);
    if (this.tick % perSec !== 0) this.pnlBySecond.push(this.pnl);
  }

  private point(): TimelinePoint {
    return { tick: this.tick, mid: this.mid, pnl: this.pnl, inventory: this.inventory, lane: this.lane, regime: this.regime };
  }

  realizedVol(windowTicks = 40): number {
    const n = Math.min(windowTicks, this.tick);
    if (n < 2) return REGIME_PARAMS.CALM.sigma;
    let s = 0;
    let s2 = 0;
    for (let i = this.tick - n; i < this.tick; i++) {
      const d = this.tape.mid[i + 1] - this.tape.mid[i];
      s += d;
      s2 += d * d;
    }
    const varTick = Math.max(0, s2 / n - (s / n) ** 2);
    return Math.sqrt(varTick / this.cfg.dt); // per sqrt(second)
  }

  signals(): MarketSignals {
    return computeSignals(this.tape, this.tick);
  }

  /**
   * Allocation-free variant of visibleOrders() for per-frame rendering: calls `fn` for every order that is
   * already visible and has not yet arrived. Same data as visibleOrders(), nothing hidden is exposed.
   */
  forEachVisibleOrder(fn: (o: { id: number; side: Side; qty: number; block?: LaneId }, tier: 0 | 1 | 2 | 3, ticksToArrival: number) => void) {
    for (let a = this.tick; a <= this.tick + this.tape.maxLeadTicks; a++) {
      const list = this.tape.arrivals.get(a);
      if (!list) continue;
      for (const o of list) {
        if (o.spawnTick > this.tick) continue;
        fn(o, urgencyTier(o.willingness), a - this.tick);
      }
    }
  }

  visibleOrders(): VisibleOrder[] {
    const out: VisibleOrder[] = [];
    for (let a = this.tick; a <= this.tick + this.tape.maxLeadTicks; a++) {
      const list = this.tape.arrivals.get(a);
      if (!list) continue;
      for (const o of list) {
        if (o.spawnTick > this.tick) continue;
        const v: VisibleOrder = { id: o.id, side: o.side, qty: o.qty, tier: urgencyTier(o.willingness), ticksToArrival: a - this.tick, spawnTick: o.spawnTick, arriveTick: o.arriveTick };
        if (o.block !== undefined) v.block = o.block;
        out.push(v);
      }
    }
    return out;
  }

  observe(): Observation {
    const vol = this.realizedVol();
    return {
      tick: this.tick,
      time: this.time,
      mid: this.mid,
      regime: this.regime,
      inventory: this.inventory,
      cash: this.cash,
      pnl: this.pnl,
      lane: this.lane,
      hedgeReady: this.tick >= this.hedgeReadyTick,
      hedgeCooldown: Math.max(0, this.hedgeReadyTick - this.tick) * this.cfg.dt,
      hedgeCostPerShare: this.hedgeCostPerShare(),
      positionLimit: this.cfg.positionLimit,
      combo: this.combo,
      realizedVol: vol,
      var95: 1.645 * vol * Math.abs(this.inventory),
      incoming: this.visibleOrders(),
      signals: this.signals(),
    };
  }
}
