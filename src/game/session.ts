/**
 * GameSession — the action layer (running, steering, jumping, obstacles, gates, ALPHA DRIVE)
 * coupled to the MarketMakerEngine. Framework-free and deterministic for a given seed + input log.
 *
 * Coupling rules (finance stays consistent):
 *  - the lane you physically ride in sets your quoted spread
 *  - collisions knock you down → quotes offline (no fills) for a moment; no money is created/destroyed
 *  - ALPHA DRIVE: invincibility + speed + venue maker-rebate (booked as its own PnL line)
 *  - SETTLEMENT GATES run a risk check on inventory: pass ⇒ big time extension
 */
import { DEFAULT_CONFIG, type LaneId, type RegimeId } from '../sim/config';
import { MarketMakerEngine, type Fill, type StepEvents } from '../sim/engine';
import { createRng, hashSeed, type Rng } from '../sim/rng';
import { generateTape } from '../sim/tape';
import { DISTRICTS, LANE_X, VEHICLES, type VehicleId } from './content';

export const FIXED_DT = 1 / 60;
const FIN_EVERY = Math.round(DEFAULT_CONFIG.dt / FIXED_DT); // 3 action ticks per market tick

import { Spawner, type ObstacleKind, type PickupKind, type Placement } from './spawner';
import { makeTrack, type TrackShape } from './track';
import { BALANCE } from './gameBalanceConfig';
import { LaneAdvisor } from './recommend';
import { computeScore, riskStats, type ScoreBreakdown } from '../sim/scoring';
export type { ObstacleKind } from './spawner';

export type Pickup = { id: number; kind: PickupKind; lane: LaneId; x: number; z: number; used: boolean };

export type Obstacle = {
  id: number;
  kind: ObstacleKind;
  lane: LaneId;
  /** for barriers spanning several lanes */
  span: number;
  x: number;
  z: number;
  y: number;
  w: number;
  h: number;
  len: number;
  speed: number;
  /** lane-changing cars */
  targetLane: LaneId;
  changeAt: number;
  alive: boolean;
  passed: boolean;
  minGap: number;
  hit: boolean;
  color: number;
};

export type Gate = { index: number; z: number; district: number; final: boolean; passed: boolean };

export type FxEvent =
  | { type: 'fill'; fill: Fill; points: number }
  | { type: 'toxic'; fill: Fill; points: number }
  | { type: 'miss'; reason: string; orderId: number }
  | { type: 'hedge'; qty: number; cost: number }
  | { type: 'hedgeRejected'; reason: string }
  | { type: 'nearmiss'; points: number; air: boolean; x: number; z: number }
  | { type: 'hit'; kind: ObstacleKind; x: number; z: number }
  | { type: 'smash'; kind: ObstacleKind; x: number; z: number; points: number }
  | { type: 'jump' }
  | { type: 'ramp' }
  | { type: 'boost' }
  | { type: 'bump' }
  | { type: 'block'; side: 'BUY' | 'SELL'; qty: number; filled: boolean }
  | { type: 'recLane'; lane: LaneId; danger: number }
  | { type: 'coin'; x: number; z: number; points: number }
  | { type: 'settle'; risk: number; points: number; sweet: boolean; qty: number; cost: number }
  | { type: 'riskBurst'; qty: number; cost: number; points: number; seconds: number }
  | { type: 'clear'; x: number; z: number }
  | { type: 'land' }
  | { type: 'lane'; lane: LaneId }
  | { type: 'gate'; passed: boolean; bonus: number; district: number; final: boolean; inventory: number }
  | { type: 'district'; district: number; lap: number }
  | { type: 'regime'; regime: RegimeId; text: string }
  | { type: 'alpha'; on: boolean }
  | { type: 'alphaReady' }
  | { type: 'limit' }
  | { type: 'combo'; combo: number }
  | { type: 'comboBreak'; reason: string }
  | { type: 'warning'; text: string }
  | { type: 'end'; reason: EndReason };

export type EndReason = 'TIME' | 'KNOCKOUT' | 'STOPPED_OUT' | 'MARKET_CLOSE';

export type Input = { left: number; right: number; jump: boolean; hedge: boolean; alpha: boolean };

/** Game rules — tunable values come from gameBalanceConfig.ts (geometry constants stay here). */
export const GAME_RULES = {
  startTime: BALANCE.time.start,
  gatePassBonus: BALANCE.time.gatePass,
  gateDecay: BALANCE.time.gateDecay,
  gateMinBonus: BALANCE.time.gateMin,
  gateFailBonus: BALANCE.time.gateFail,
  overtimePassBonus: BALANCE.time.overtimePass,
  overtimeFailBonus: BALANCE.time.overtimeFail,
  /** gate risk check: RISK gauge must be below this (0–1) */
  gateRiskMax: BALANCE.risk.gateMax,
  offlineTime: BALANCE.action.offlineTime,
  invulnTime: BALANCE.action.invulnTime,
  alphaDuration: BALANCE.action.alphaDuration,
  alphaSpeedMul: BALANCE.action.alphaSpeedMul,
  comboTimeout: BALANCE.action.comboTimeout,
  laneWidth: 4,
  playerWidth: 1.1,
  playerLen: 1.8,
  nearMissGap: BALANCE.action.nearMissGap,
} as const;

export class GameSession {
  readonly seed: number;
  readonly engine: MarketMakerEngine;
  readonly vehicle;
  private rng: Rng;

  // time
  frame = 0;
  t = 0;
  timeLeft: number = GAME_RULES.startTime;
  ended = false;
  endReason: EndReason | null = null;

  // player physics
  x = 0;
  y = 0;
  vy = 0;
  z = 0;
  speed = 0;
  maxSpeed = 0;
  targetLane: LaneId = 1;
  quoteLane: LaneId = 1;
  grounded = true;
  tilt = 0;
  stumble = 0;
  invuln = 0;
  stability: number;

  // progression
  district = 0;
  lap = 0;
  districtStartZ = 0;
  gates: Gate[] = [];
  gatesPassed = 0;
  gatesFailed = 0;
  goalReached = false;

  // combo / gauge / score
  combo = 0;
  maxCombo = 0;
  comboTimer = 0;
  gauge = 0;
  alpha = 0;
  alphaCount = 0;
  nearMisses = 0;
  smashes = 0;
  smashesThisAlpha = 0;
  collisions = 0;
  offlineTime = 0;
  tradingPoints = 0;
  actionPoints = 0;
  jumps = 0;
  laneChanges = 0;
  /** tutorial freezes the clock */
  timerFrozen = false;

  // v3: recommended lane + RISK gauge
  readonly advisor = new LaneAdvisor();
  /** RISK gauge 0..1: climbs toward `exposure` at a capped rate (see marketTick) */
  risk = 0;
  /** instantaneous exposure = |inventory| / fullInventory × regime volatility multiplier (may exceed 1) */
  exposure = 0;
  /** score multiplier (combo × ALPHA) each fill was made with — its markout correction uses the same one */
  private fillMul = new Map<number, number>();
  maxRisk = 0;
  settlements = 0;
  settlePoints = 0;
  riskBursts = 0;
  coins = 0;
  /** seconds spent in the recommended lane */
  recLaneTime = 0;
  private burstQueued = false;
  /** seconds the gauge has been at 100 % (forced liquidation after BALANCE.risk.burstGrace) */
  overload = 0;

  obstacles: Obstacle[] = [];
  private obstacleId = 0;
  readonly spawner: Spawner;
  pickups: Pickup[] = [];
  boost = 0;
  airTime = 0;
  boosts = 0;
  ramps = 0;
  vx = 0;
  /** visual track shape (curves/hills) */
  readonly track: (z: number, district: number) => TrackShape;
  private hedgeQueued = false;
  private lastRegime: RegimeId | null = null;

  /** events produced since the last drain (for audio / particles / UI) */
  events: FxEvent[] = [];
  /** recorded inputs per frame for deterministic replay */
  inputLog: Input[] = [];

  constructor(seed: number, vehicleId: VehicleId = 'board') {
    this.seed = seed;
    this.engine = new MarketMakerEngine(generateTape(seed));
    this.vehicle = VEHICLES[vehicleId];
    this.stability = this.vehicle.stability;
    this.speed = this.vehicle.baseSpeed * 0.6;
    this.rng = createRng(hashSeed(seed, 'world'));
    this.spawner = new Spawner(this.rng);
    this.track = makeTrack(seed);
    this.gauge = BALANCE.action.gaugeStart; // first ALPHA DRIVE comes within the first ~15 s of good play
    this.layoutGate(0);
  }

  get comboMultiplier() {
    return Math.min(3, 1 + Math.floor(this.combo / 5) * 0.25);
  }
  get districtInfo() {
    return DISTRICTS[this.district % DISTRICTS.length];
  }
  get nextGate(): Gate | undefined {
    return this.gates.find((g) => !g.passed);
  }
  get districtProgress() {
    const g = this.nextGate;
    if (!g) return 1;
    const len = g.z - this.districtStartZ;
    return Math.max(0, Math.min(1, (this.z - this.districtStartZ) / len));
  }
  get alphaReady() {
    return this.gauge >= 100 && this.alpha <= 0;
  }

  private layoutGate(district: number) {
    const d = DISTRICTS[district % DISTRICTS.length];
    const z = this.districtStartZ + d.length * (this.lap > 0 ? 0.9 : 1);
    this.gates.push({ index: this.gates.length, z, district, final: district % DISTRICTS.length === DISTRICTS.length - 1, passed: false });
  }

  private emit(e: FxEvent) {
    this.events.push(e);
  }

  drainEvents(): FxEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  private addCombo(n: number) {
    this.combo += n;
    this.comboTimer = GAME_RULES.comboTimeout;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    if (this.combo > 0 && this.combo % 10 === 0) this.emit({ type: 'combo', combo: this.combo });
  }

  private breakCombo(reason: string) {
    if (this.combo >= 3) this.emit({ type: 'comboBreak', reason });
    this.combo = 0;
  }

  private addGauge(v: number) {
    if (this.alpha > 0) return;
    const was = this.gauge;
    this.gauge = Math.min(100, this.gauge + v);
    if (was < 100 && this.gauge >= 100) this.emit({ type: 'alphaReady' });
  }

  /** advance one fixed step */
  update(input: Input) {
    if (this.ended) return;
    this.inputLog.push(input);
    const dt = FIXED_DT;
    this.frame++;
    this.t += dt;
    if (!this.timerFrozen) this.timeLeft -= dt;

    // --- input ---
    const prevLane = this.targetLane;
    if (input.left) this.targetLane = Math.max(0, this.targetLane - input.left) as LaneId;
    if (input.right) this.targetLane = Math.min(2, this.targetLane + input.right) as LaneId;
    // inside a fork the median wall cannot be crossed: the route (and the spread) is committed
    if (this.targetLane !== prevLane && prevLane !== 1 && this.besideWall()) {
      this.targetLane = prevLane;
      this.emit({ type: 'bump' });
    }
    if (this.targetLane !== prevLane) {
      this.laneChanges++;
      this.emit({ type: 'lane', lane: this.targetLane });
    }
    if (input.jump && this.grounded && this.stumble <= 0) {
      this.vy = this.vehicle.jumpVelocity;
      this.grounded = false;
      this.jumps++;
      this.emit({ type: 'jump' });
    }
    if (input.hedge) this.hedgeQueued = true;
    if (input.alpha && this.alphaReady) {
      this.alpha = GAME_RULES.alphaDuration;
      this.gauge = 0;
      this.smashesThisAlpha = 0;
      this.alphaCount++;
      this.emit({ type: 'alpha', on: true });
    }

    // --- physics ---
    // lateral spring-damper: each vehicle has its own steering feel
    const tx = LANE_X[this.targetLane];
    const v = this.vehicle;
    const k = v.spring * (this.stumble > 0 ? 0.35 : 1) * (this.grounded ? 1 : 0.7);
    this.vx += (k * (tx - this.x) - v.damping * this.vx) * dt;
    const vmax = v.lateral * 1.25;
    this.vx = Math.max(-vmax, Math.min(vmax, this.vx));
    this.x += this.vx * dt;
    if (Math.abs(tx - this.x) < 0.02 && Math.abs(this.vx) < 0.2) {
      this.x = tx;
      this.vx = 0;
    }
    this.x = Math.max(-5.2, Math.min(5.2, this.x));
    this.tilt += (-this.vx * 0.045 - this.tilt) * Math.min(1, dt * 12);
    if (!this.grounded) {
      this.airTime += dt;
      this.vy -= 30 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
        if (this.airTime > 0.9) {
          const pts = 100 * this.comboMultiplier;
          this.actionPoints += pts;
          this.addGauge(6);
        }
        this.airTime = 0;
        this.emit({ type: 'land' });
      }
    }
    const nearest = Math.round((this.x + GAME_RULES.laneWidth) / GAME_RULES.laneWidth);
    this.quoteLane = Math.max(0, Math.min(2, nearest)) as LaneId;

    const S = BALANCE.speed;
    let target = this.vehicle.baseSpeed * S.baseMul + Math.min(this.district, 4) * S.perDistrict + this.lap * S.perLap + Math.min(this.combo, 40) * S.perCombo;
    if (this.boost > 0) target += S.boost;
    if (this.alpha > 0) target *= GAME_RULES.alphaSpeedMul;
    if (this.stumble > 0) target *= 0.45;
    const accel = this.speed < target ? (this.boost > 0 ? 40 : this.vehicle.accel) : 30;
    this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), accel * dt);
    this.z += this.speed * dt;
    this.maxSpeed = Math.max(this.maxSpeed, this.speed);

    // --- timers ---
    if (this.stumble > 0) {
      this.stumble -= dt;
      this.offlineTime += dt;
    }
    if (this.invuln > 0) this.invuln -= dt;
    if (this.boost > 0) this.boost -= dt;
    if (this.alpha > 0) {
      this.alpha -= dt;
      if (this.alpha <= 0) this.emit({ type: 'alpha', on: false });
    }
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.breakCombo('TIMEOUT');
    }

    this.updateObstacles(dt);
    this.updateGates();

    // --- market tick ---
    if (this.frame % FIN_EVERY === 0) this.marketTick();

    if (!this.ended) {
      if (this.timeLeft <= 0) this.finish('TIME');
      else if (this.engine.done) this.finish(this.engine.stoppedOut ? 'STOPPED_OUT' : 'MARKET_CLOSE');
    }
  }

  private marketTick() {
    const hedge = this.hedgeQueued;
    this.hedgeQueued = false;
    const burst = this.burstQueued;
    this.burstQueued = false;
    const riskBefore = this.risk;
    const ev: StepEvents = this.engine.step({
      lane: this.quoteLane, hedge, quoting: this.stumble <= 0, rebate: this.alpha > 0,
      ...(burst ? { forceFlatten: BALANCE.risk.burstPenaltyPerShare } : {}),
    });
    // recommended lane (public signals only) — when it moves, clear blocking obstacles from the new lane
    const moved = this.advisor.update(this.engine, this.t);
    if (moved !== null) {
      this.clearLane(moved);
      this.emit({ type: 'recLane', lane: moved, danger: this.advisor.danger });
    }
    if (this.quoteLane === this.advisor.lane) this.recLaneTime += this.engine.cfg.dt;
    if (ev.headline || this.lastRegime !== this.engine.regime) {
      this.lastRegime = this.engine.regime;
      this.emit({ type: 'regime', regime: this.engine.regime, text: ev.headline?.text ?? this.engine.regime });
    }
    for (const f of ev.fills) {
      this.addCombo(1);
      const SC = BALANCE.score;
      const mul = this.comboMultiplier * (this.alpha > 0 ? 2 : 1);
      const pts = f.spread * SC.perSpreadDollar * mul;
      this.fillMul.set(f.orderId, mul);
      this.tradingPoints += pts;
      this.addGauge(1.5 + f.halfSpread * 20);
      this.emit({ type: 'fill', fill: f, points: Math.round(pts) });
    }
    for (const m of ev.misses) {
      this.emit({ type: 'miss', reason: m.reason, orderId: m.order.id });
      if (m.order.block !== undefined) this.emit({ type: 'block', side: m.order.side, qty: m.order.qty, filled: false });
    }
    for (const f of ev.fills) {
      const o = this.engine.tape.orders[f.orderId];
      if (o.block !== undefined) this.emit({ type: 'block', side: o.side, qty: Math.abs(f.qty), filled: true });
    }
    for (const f of ev.markouts) {
      // v3.1: a fill is scored on what it was really worth 2 s later (spread ± the price move), not on the
      // spread alone — fills against informed flow lose points (SCORE only; money is the engine's business)
      // same multiplier as the fill itself, so a fill's total = markout × perSpreadDollar × mul:
      // a fill that lost money in the end (toxic) is always worth negative points
      const mul = this.fillMul.get(f.orderId) ?? 1;
      this.fillMul.delete(f.orderId);
      const adj = ((f.markout ?? f.spread) - f.spread) * BALANCE.score.perSpreadDollar * BALANCE.score.markoutWeight * mul;
      this.tradingPoints += adj;
      if (f.toxic) {
        this.emit({ type: 'toxic', fill: f, points: Math.round(adj) });
        this.breakCombo('TOXIC FLOW');
      }
    }
    if (ev.hedge?.forced) {
      // RISK BURST: forced liquidation at a penalty (booked as hedge cost), no bonus, combo lost
      // a clear failure: money (penalty fill), score, clock and combo
      const R = BALANCE.risk;
      this.riskBursts++;
      this.breakCombo('RISK BURST');
      this.actionPoints -= R.burstScore;
      if (!this.timerFrozen) this.timeLeft -= R.burstTime;
      this.emit({ type: 'riskBurst', qty: ev.hedge.qty, cost: ev.hedge.cost, points: R.burstScore, seconds: R.burstTime });
    } else if (ev.hedge) {
      // settlement bonus (SCORE only — money is untouched): bigger the closer you dared to 100 %
      const R = BALANCE.risk;
      const sweet = riskBefore >= R.warnAt;
      const pts = riskBefore >= R.settleMin ? Math.round(riskBefore * 100 * R.settlePointsPerPct * (sweet ? R.sweetSpotMul : 1)) : 0;
      this.settlements++;
      this.settlePoints += pts;
      this.actionPoints += pts;
      if (sweet) this.addGauge(10);
      this.emit({ type: 'hedge', qty: ev.hedge.qty, cost: ev.hedge.cost });
      this.emit({ type: 'settle', risk: riskBefore, points: pts, sweet, qty: ev.hedge.qty, cost: ev.hedge.cost });
    } else if (hedge && ev.hedgeRejected) this.emit({ type: 'hedgeRejected', reason: ev.hedgeRejected });
    // RISK gauge after this tick. It climbs toward the exposure at a capped rate (one big fill is visible
    // before it bites), drops quickly, and is empty right after a settlement.
    const R = BALANCE.risk;
    const mdt = this.engine.cfg.dt;
    this.exposure = (Math.abs(this.engine.inventory) / R.fullInventory) * (R.regimeMul[this.engine.regime] ?? 1);
    if (ev.hedge) this.risk = 0;
    else if (this.exposure > this.risk) this.risk = Math.min(this.exposure, this.risk + R.riseRate * mdt);
    else this.risk = Math.max(this.exposure, this.risk - R.fallRate * mdt);
    this.risk = Math.min(1, this.risk);
    this.maxRisk = Math.max(this.maxRisk, this.risk);
    if (this.risk >= 1) {
      // OVERLOAD: a visible countdown that only runs while HEDGE is usable — a burst is always avoidable
      if (this.engine.tick >= this.engine.hedgeReadyTick) this.overload += mdt;
      if (this.overload >= R.burstGrace && !hedge) this.burstQueued = true;
    } else this.overload = 0;
    if (ev.limitHit) this.emit({ type: 'limit' });
    if (ev.stoppedOut) this.finish('STOPPED_OUT');
  }

  // ---------------- obstacles ----------------
  /** true while the player is alongside a fork's median wall */
  besideWall(): boolean {
    return this.obstacles.some((o) => o.alive && o.kind === 'wall' && Math.abs(o.z - this.z) < o.len / 2 + 6);
  }

  private place(p: Placement) {
    const base: Obstacle = {
      id: this.obstacleId++, kind: p.kind, lane: p.lane, span: p.span ?? 1, x: LANE_X[p.lane], z: p.z, y: 0, w: 1.8, h: 1.6, len: 3.6, speed: p.speed ?? 0,
      targetLane: p.changeTo ?? p.lane, changeAt: p.changeAt ?? -1, alive: true, passed: false, minGap: Infinity, hit: false, color: 0xffffff,
    };
    if (p.kind === 'car') Object.assign(base, { w: 2.0, h: 1.5, len: 4.2 });
    if (p.kind === 'oncoming') Object.assign(base, { w: 2.1, h: 1.7, len: 4.6 });
    if (p.kind === 'barrier') {
      Object.assign(base, { w: 3.4, h: 0.95, len: 0.6 });
      if (p.span === 3) Object.assign(base, { w: 11.6, x: 0 });
      if (p.span === 2) Object.assign(base, { w: 7.6, x: p.lane === 0 ? -2 : 2 });
    }
    if (p.kind === 'spike') Object.assign(base, { w: 1.3, h: 3.2, len: 1.3 });
    if (p.kind === 'debris') Object.assign(base, { w: 2.4, h: 2.0, len: 2.4, y: 26 });
    if (p.kind === 'wall') Object.assign(base, { w: 1.0, h: 2.4, len: p.len ?? 80, x: 0 });
    if (p.kind === 'warning') Object.assign(base, { w: 3.4, h: 2.6, len: 0.8 });
    this.obstacles.push(base);
  }

  /** target speed estimate used by the spawner for fairness checks */
  private cruiseSpeed() {
    const S = BALANCE.speed;
    return this.vehicle.baseSpeed * S.baseMul + Math.min(this.district, 4) * S.perDistrict + this.lap * S.perLap + 10;
  }

  /** the recommended lane moved: remove non-jumpable obstacles from it (and from the lane in between, near term) */
  private clearLane(lane: LaneId) {
    const from = this.quoteLane;
    for (const o of this.obstacles) {
      if (!o.alive || o.kind === 'barrier') continue;
      const ahead = o.z - this.z;
      if (ahead < 15) continue;
      const inNew = o.lane === lane || o.targetLane === lane;
      const between = Math.abs(lane - from) === 2 && o.lane === 1 && ahead < 60;
      if (inNew || between) {
        o.alive = false;
        this.emit({ type: 'clear', x: o.x, z: o.z });
      }
    }
  }

  private updateObstacles(dt: number) {
    const sp = this.spawner;
    while (sp.nextZ < this.z + 240) {
      const g = this.nextGate!;
      const gateLen = g.z - this.districtStartZ;
      const res = sp.next({
        playerZ: this.z, speed: this.cruiseSpeed(), regime: this.engine.regime,
        progress: Math.max(0, Math.min(1, (sp.nextZ - this.districtStartZ) / gateLen)),
        district: this.district, lap: this.lap, t: this.t, gateZ: g.z,
        rec: this.advisor.lane, danger: this.advisor.danger,
      });
      for (const p of res.obstacles) this.place(p);
      for (const pk of res.pickups) this.pickups.push({ id: this.obstacleId++, kind: pk.kind, lane: pk.lane, x: LANE_X[pk.lane], z: pk.z, used: false });
      sp.nextZ += res.gap;
    }
    // pickups: ramps launch you, boost pads accelerate you, coins pay score
    for (const pk of this.pickups) {
      if (pk.used || Math.abs(pk.z - this.z) > 2.2 || Math.abs(pk.x - this.x) > 1.7) continue;
      if (pk.kind === 'coin') {
        if (this.y > 3) continue;
        pk.used = true;
        this.coins++;
        const pts = Math.round(BALANCE.score.coinPoints * this.comboMultiplier);
        this.actionPoints += pts;
        this.addGauge(BALANCE.score.coinGauge);
        this.emit({ type: 'coin', x: pk.x, z: pk.z, points: pts });
      } else if (pk.kind === 'ramp' && this.grounded) {
        pk.used = true;
        this.vy = 13 + this.vehicle.rampBonus;
        this.grounded = false;
        this.ramps++;
        this.emit({ type: 'ramp' });
      } else if (pk.kind === 'boost' && this.y < 0.5) {
        pk.used = true;
        this.boost = BALANCE.speed.boostTime;
        this.boosts++;
        this.addGauge(4);
        this.emit({ type: 'boost' });
      }
    }
    if (this.pickups.length > 60) this.pickups = this.pickups.filter((p) => p.z > this.z - 30);
    const P = GAME_RULES;
    for (const o of this.obstacles) {
      if (!o.alive) continue;
      o.z += o.speed * dt;
      const ahead = o.z - this.z;
      if ((o.kind === 'car' || o.kind === 'oncoming') && o.changeAt > 0 && ahead < o.changeAt && o.targetLane !== o.lane) {
        const tx = LANE_X[o.targetLane];
        o.x += Math.sign(tx - o.x) * Math.min(Math.abs(tx - o.x), 5 * dt);
        if (Math.abs(o.x - tx) < 0.01) o.lane = o.targetLane;
      }
      if (o.kind === 'debris') {
        if (ahead < 55) o.y = Math.max(0, o.y - 40 * dt);
      }
      // collision / near miss window
      const dz = Math.abs(ahead);
      if (!o.passed && dz < o.len / 2 + P.playerLen / 2) {
        const gapX = Math.abs(o.x - this.x) - (o.w / 2 + P.playerWidth / 2);
        const overlapY = this.y < o.y + o.h - 0.05 && this.y + 1.6 > o.y;
        if (gapX < 0 && overlapY && !o.hit) {
          if (this.alpha > 0) {
            o.alive = false;
            this.smashes++;
            this.smashesThisAlpha++;
            // anti-farming: only the first few smashes of each ALPHA DRIVE score
            const pts = this.smashesThisAlpha <= BALANCE.score.smashCapPerAlpha ? BALANCE.score.smashPoints * this.comboMultiplier : 0;
            this.actionPoints += pts;
            this.addCombo(1);
            this.emit({ type: 'smash', kind: o.kind, x: o.x, z: o.z, points: Math.round(pts) });
            continue;
          }
          if (this.invuln <= 0) this.collide(o);
          o.hit = true;
        } else if (overlapY) o.minGap = Math.min(o.minGap, Math.max(0, gapX));
        else if (gapX < 0 && o.kind === 'barrier') o.minGap = Math.min(o.minGap, Math.max(0, this.y - o.h) * 0.6);
      }
      if (!o.passed && ahead < -(o.len / 2 + P.playerLen / 2)) {
        o.passed = true;
        if (!o.hit && o.kind !== 'wall' && o.minGap < P.nearMissGap && this.invuln <= 0) {
          this.nearMisses++;
          const pts = BALANCE.score.nearMissPoints * this.comboMultiplier;
          this.actionPoints += pts;
          this.addCombo(1);
          this.addGauge(BALANCE.action.gaugeNearMiss);
          this.emit({ type: 'nearmiss', points: Math.round(pts), air: o.kind === 'barrier', x: o.x, z: o.z });
        }
      }
      if (ahead < -30) o.alive = false;
    }
    if (this.obstacles.length > 80) this.obstacles = this.obstacles.filter((o) => o.alive);
  }

  private collide(o: Obstacle) {
    this.collisions++;
    this.stability--;
    this.stumble = GAME_RULES.offlineTime;
    this.invuln = GAME_RULES.invulnTime;
    this.speed *= this.vehicle.hitKeep;
    this.vx *= -0.5;
    this.gauge = Math.max(0, this.gauge - 25);
    this.breakCombo('CRASHED');
    this.emit({ type: 'hit', kind: o.kind, x: o.x, z: o.z });
    if (this.stability <= 0) this.finish('KNOCKOUT');
  }

  // ---------------- gates / districts ----------------
  private updateGates() {
    const g = this.nextGate;
    if (!g || this.z < g.z) return;
    g.passed = true;
    const inv = this.engine.inventory;
    // the gate checks the TRUE exposure right now, not the lagged gauge (the HUD shows both)
    const ok = this.currentExposure() < GAME_RULES.gateRiskMax;
    const overtime = this.lap > 0;
    const bonus = ok
      ? overtime ? GAME_RULES.overtimePassBonus : Math.max(GAME_RULES.gateMinBonus, GAME_RULES.gatePassBonus - this.district * GAME_RULES.gateDecay)
      : overtime ? GAME_RULES.overtimeFailBonus : GAME_RULES.gateFailBonus;
    this.timeLeft += bonus;
    if (ok) {
      this.gatesPassed++;
      this.actionPoints += BALANCE.score.gatePoints * (1 + this.lap * 0.5);
      this.addCombo(3);
      this.addGauge(BALANCE.action.gaugeGate);
      this.stability = Math.min(this.vehicle.stability, this.stability + 1); // repair on a clean settlement
    } else this.gatesFailed++;
    this.emit({ type: 'gate', passed: ok, bonus, district: g.district, final: g.final, inventory: inv });
    if (g.final) {
      if (!this.goalReached) this.actionPoints += BALANCE.score.goalPoints;
      this.goalReached = true;
      this.lap++;
    }
    this.district++;
    this.districtStartZ = g.z;
    this.layoutGate(this.district);
    this.emit({ type: 'district', district: this.district, lap: this.lap });
  }

  /** exposure from the inventory right now (the gauge fill lags behind it by design) */
  currentExposure(): number {
    const R = BALANCE.risk;
    return (Math.abs(this.engine.inventory) / R.fullInventory) * (R.regimeMul[this.engine.regime] ?? 1);
  }

  /** v3 score: PnL points use the v3 weight (gameBalanceConfig), everything else as before */
  score(): ScoreBreakdown {
    return computeScore(riskStats(this.engine), this.tradingPoints, this.actionPoints + this.distancePoints, BALANCE.score.pnlPerDollar);
  }

  finish(reason: EndReason) {
    if (this.ended) return;
    this.ended = true;
    this.endReason = reason;
    this.engine.end();
    this.emit({ type: 'end', reason });
  }

  /** points for distance travelled */
  get distancePoints() {
    return Math.round(this.z * 0.5);
  }
}
