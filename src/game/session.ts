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

export type ObstacleKind = 'car' | 'barrier' | 'spike' | 'debris';

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
  | { type: 'toxic'; fill: Fill }
  | { type: 'miss'; reason: string; orderId: number }
  | { type: 'hedge'; qty: number; cost: number }
  | { type: 'hedgeRejected'; reason: string }
  | { type: 'nearmiss'; points: number; air: boolean; x: number; z: number }
  | { type: 'hit'; kind: ObstacleKind; x: number; z: number }
  | { type: 'smash'; kind: ObstacleKind; x: number; z: number; points: number }
  | { type: 'jump' }
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

export const GAME_RULES = {
  startTime: 28,
  gatePassBonus: 18,
  gateFailBonus: 8,
  overtimePassBonus: 14,
  overtimeFailBonus: 5,
  /** inventory check at settlement gates: |inventory| ≤ this passes */
  gateInventoryLimit: 500,
  offlineTime: 1.4,
  invulnTime: 2.2,
  alphaDuration: 6.5,
  alphaSpeedMul: 1.55,
  comboTimeout: 3.5,
  laneWidth: 4,
  playerWidth: 1.1,
  playerLen: 1.8,
  nearMissGap: 0.75,
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
  collisions = 0;
  offlineTime = 0;
  tradingPoints = 0;
  actionPoints = 0;
  jumps = 0;

  obstacles: Obstacle[] = [];
  private nextObstacleZ = 70;
  private obstacleId = 0;
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
    this.timeLeft -= dt;

    // --- input ---
    const prevLane = this.targetLane;
    if (input.left) this.targetLane = Math.max(0, this.targetLane - input.left) as LaneId;
    if (input.right) this.targetLane = Math.min(2, this.targetLane + input.right) as LaneId;
    if (this.targetLane !== prevLane) this.emit({ type: 'lane', lane: this.targetLane });
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
      this.alphaCount++;
      this.emit({ type: 'alpha', on: true });
    }

    // --- physics ---
    const tx = LANE_X[this.targetLane];
    const lat = this.vehicle.lateral * (this.stumble > 0 ? 0.4 : 1);
    const dx = tx - this.x;
    const step = Math.sign(dx) * Math.min(Math.abs(dx), lat * dt * (0.35 + Math.min(1, Math.abs(dx) / 2)));
    this.x += step;
    this.tilt += ((-dx * 0.18) - this.tilt) * Math.min(1, dt * 10);
    if (!this.grounded) {
      this.vy -= 30 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
        this.grounded = true;
        this.emit({ type: 'land' });
      }
    }
    const nearest = Math.round((this.x + GAME_RULES.laneWidth) / GAME_RULES.laneWidth);
    this.quoteLane = Math.max(0, Math.min(2, nearest)) as LaneId;

    const lapBoost = this.lap * 4;
    let target = this.vehicle.baseSpeed + Math.min(this.district, 4) * 2.2 + lapBoost + Math.min(this.combo, 40) * 0.22;
    if (this.alpha > 0) target *= GAME_RULES.alphaSpeedMul;
    if (this.stumble > 0) target *= 0.45;
    const accel = this.speed < target ? 14 : 30;
    this.speed += Math.sign(target - this.speed) * Math.min(Math.abs(target - this.speed), accel * dt);
    this.z += this.speed * dt;
    this.maxSpeed = Math.max(this.maxSpeed, this.speed);

    // --- timers ---
    if (this.stumble > 0) {
      this.stumble -= dt;
      this.offlineTime += dt;
    }
    if (this.invuln > 0) this.invuln -= dt;
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
    const ev: StepEvents = this.engine.step({ lane: this.quoteLane, hedge, quoting: this.stumble <= 0, rebate: this.alpha > 0 });
    if (ev.headline || this.lastRegime !== this.engine.regime) {
      this.lastRegime = this.engine.regime;
      this.emit({ type: 'regime', regime: this.engine.regime, text: ev.headline?.text ?? this.engine.regime });
    }
    for (const f of ev.fills) {
      this.addCombo(1);
      const pts = f.spread * 10 * this.comboMultiplier * (this.alpha > 0 ? 2 : 1);
      this.tradingPoints += pts;
      this.addGauge(1.5 + f.halfSpread * 20);
      this.emit({ type: 'fill', fill: f, points: Math.round(pts) });
    }
    for (const m of ev.misses) this.emit({ type: 'miss', reason: m.reason, orderId: m.order.id });
    for (const f of ev.markouts) {
      if (f.toxic) {
        this.emit({ type: 'toxic', fill: f });
        this.breakCombo('TOXIC FLOW');
      }
    }
    if (ev.hedge) {
      this.emit({ type: 'hedge', qty: ev.hedge.qty, cost: ev.hedge.cost });
      const risky = ev.hedge.regime === 'VOLATILE' || ev.hedge.regime === 'CRASH';
      if (risky && Math.abs(ev.hedge.qty) >= 400) this.addGauge(10);
    } else if (hedge && ev.hedgeRejected) this.emit({ type: 'hedgeRejected', reason: ev.hedgeRejected });
    if (ev.limitHit) this.emit({ type: 'limit' });
    if (ev.stoppedOut) this.finish('STOPPED_OUT');
  }

  // ---------------- obstacles ----------------
  private spawnRow(z: number) {
    const regime = this.engine.regime;
    const r = this.rng;
    const lanes: LaneId[] = [0, 1, 2];
    const pick = () => lanes.splice(r.int(0, lanes.length - 1), 1)[0];
    const roll = r.next();
    const hard = Math.min(1, this.district * 0.12 + this.lap * 0.25);
    const add = (kind: ObstacleKind, lane: LaneId, opts: Partial<Obstacle> = {}) => {
      const base: Obstacle = {
        id: this.obstacleId++, kind, lane, span: 1, x: LANE_X[lane], z, y: 0, w: 1.8, h: 1.6, len: 3.6, speed: 0,
        targetLane: lane, changeAt: -1, alive: true, passed: false, minGap: Infinity, hit: false, color: 0xffffff,
      };
      if (kind === 'car') Object.assign(base, { w: 2.0, h: 1.5, len: 4.2, speed: r.range(12, 20) });
      if (kind === 'barrier') Object.assign(base, { w: 3.4, h: 0.95, len: 0.6 });
      if (kind === 'spike') Object.assign(base, { w: 1.3, h: 3.2, len: 1.3 });
      if (kind === 'debris') Object.assign(base, { w: 2.4, h: 2.0, len: 2.4, y: 26 });
      Object.assign(base, opts);
      this.obstacles.push(base);
      return base;
    };
    const fast = regime === 'VOLATILE' || regime === 'CRASH';
    if (regime === 'CRASH' && roll < 0.45) {
      add('debris', pick());
      if (r.next() < 0.5 + hard * 0.3) add('debris', pick(), { z: z + 6 });
    } else if (fast && roll < 0.6) {
      add('spike', pick());
      if (r.next() < 0.35 + hard * 0.4) add('spike', pick());
    } else if (roll < 0.78) {
      const c = add('car', pick());
      if (r.next() < 0.3 + hard * 0.4) add('car', pick(), { z: z + r.range(0, 8) });
      if (fast && r.next() < 0.5) {
        const free = lanes[0];
        if (free !== undefined && Math.abs(free - c.lane) === 1) {
          c.targetLane = free;
          c.changeAt = r.range(32, 50);
        }
      }
    } else {
      // low barrier: jump it or go around (spans 1–3 lanes, a 3-lane wall must be jumped)
      const span = r.next() < 0.25 + hard * 0.3 ? 3 : r.next() < 0.5 ? 2 : 1;
      if (span === 3) add('barrier', 1, { w: 11.6, span: 3, x: 0 });
      else if (span === 2) {
        const left = r.next() < 0.5;
        add('barrier', left ? 0 : 1, { w: 7.6, span: 2, x: left ? -2 : 2 });
      } else add('barrier', pick());
    }
  }

  private updateObstacles(dt: number) {
    const regime = this.engine.regime;
    const baseGap = { CALM: 46, TRENDING: 38, VOLATILE: 31, CRASH: 27 }[regime];
    const gap = Math.max(18, baseGap * (1 - Math.min(this.district, 4) * 0.05 - this.lap * 0.1));
    while (this.nextObstacleZ < this.z + 230) {
      const g = this.nextGate;
      const nearGate = g && this.nextObstacleZ > g.z - 45 && this.nextObstacleZ < g.z + 30;
      if (!nearGate && this.t > 1.5) this.spawnRow(this.nextObstacleZ);
      this.nextObstacleZ += gap * this.rng.range(0.8, 1.25);
    }
    const P = GAME_RULES;
    for (const o of this.obstacles) {
      if (!o.alive) continue;
      o.z += o.speed * dt;
      const ahead = o.z - this.z;
      if (o.kind === 'car' && o.changeAt > 0 && ahead < o.changeAt && o.targetLane !== o.lane) {
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
            const pts = 250 * this.comboMultiplier;
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
        if (!o.hit && o.minGap < P.nearMissGap && this.invuln <= 0) {
          this.nearMisses++;
          const pts = 150 * this.comboMultiplier;
          this.actionPoints += pts;
          this.addCombo(1);
          this.addGauge(12);
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
    this.speed *= 0.5;
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
    const ok = Math.abs(inv) <= GAME_RULES.gateInventoryLimit;
    const overtime = this.lap > 0;
    const bonus = ok ? (overtime ? GAME_RULES.overtimePassBonus : GAME_RULES.gatePassBonus) : overtime ? GAME_RULES.overtimeFailBonus : GAME_RULES.gateFailBonus;
    this.timeLeft += bonus;
    if (ok) {
      this.gatesPassed++;
      this.actionPoints += 1000 * (1 + this.lap * 0.5);
      this.addCombo(3);
      this.addGauge(20);
    } else this.gatesFailed++;
    this.emit({ type: 'gate', passed: ok, bonus, district: g.district, final: g.final, inventory: inv });
    if (g.final) {
      if (!this.goalReached) this.actionPoints += 5000;
      this.goalReached = true;
      this.lap++;
    }
    this.district++;
    this.districtStartZ = g.z;
    this.layoutGate(this.district);
    this.emit({ type: 'district', district: this.district, lap: this.lap });
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
