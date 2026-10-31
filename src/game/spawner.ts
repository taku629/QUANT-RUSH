/**
 * Pattern spawner with a pacing director and a reachability guarantee.
 *
 * Every placed obstacle set is converted into "rows" (z where the player meets it, mask of blocked lanes).
 * A row is only accepted if at least one free lane can be reached from a free lane of the previous row
 * in the time available (lane-change time at the current speed). Jumpable barriers never block, but
 * require a clear landing zone. Result: no unavoidable collisions by construction (tested).
 */
import type { LaneId, RegimeId } from '../sim/config';
import type { Rng } from '../sim/rng';

export type ObstacleKind = 'car' | 'barrier' | 'spike' | 'debris' | 'oncoming' | 'wall';
export type PickupKind = 'ramp' | 'boost';

export type Placement = {
  kind: ObstacleKind;
  lane: LaneId;
  /** world z where it is spawned */
  z: number;
  span?: 1 | 2 | 3;
  speed?: number;
  len?: number;
  changeTo?: LaneId;
  changeAt?: number;
};
export type PickupPlacement = { kind: PickupKind; lane: LaneId; z: number };

export type Phase = 'INTRO' | 'BUILD' | 'BREATHER' | 'PEAK' | 'RUNWAY';

export type SpawnContext = {
  /** player world z and current target speed (m/s) */
  playerZ: number;
  speed: number;
  regime: RegimeId;
  /** progress through the current district 0..1 */
  progress: number;
  district: number;
  lap: number;
  /** seconds since start (first-run hook) */
  t: number;
  /** z of the next settlement gate */
  gateZ: number;
};

type Row = { z: number; mask: number; jump?: boolean };

export const LANE_CHANGE_TIME = 0.42; // conservative seconds per lane change (slowest vehicle)
const FULL = 0b111;

export function phaseAt(progress: number): Phase {
  if (progress < 0.14) return 'INTRO';
  if (progress < 0.45) return 'BUILD';
  if (progress < 0.56) return 'BREATHER';
  if (progress < 0.86) return 'PEAK';
  return 'RUNWAY';
}

/** z where a moving obstacle (speed v, + = same direction) spawned at Z meets a player at pz moving at s */
export function meetZ(Z: number, v: number, pz: number, s: number): number {
  if (s - v <= 1) return Infinity;
  return pz + (s * (Z - pz)) / (s - v);
}

function reach(mask: number, steps: number): number {
  let m = mask;
  for (let i = 0; i < steps; i++) m = (m | (m << 1) | (m >> 1)) & FULL;
  return m;
}

export class Spawner {
  rows: Row[] = [{ z: 0, mask: 0 }];
  nextZ = 60;
  /** z ranges covered by forks (median wall) — nothing else may spawn there */
  forks: { from: number; to: number }[] = [];
  private scripted = true;
  private scriptStep = 0;

  constructor(private rng: Rng) {}

  /** free mask at the last accepted row */
  private lastRow(): Row {
    return this.rows[this.rows.length - 1];
  }

  /** Can a row (meeting point z, blocked mask) be accepted? */
  canPlace(z: number, blocked: number, speed: number): boolean {
    const free = FULL & ~blocked;
    if (!free) return false;
    const prev = this.lastRow();
    if (z < prev.z) return false;
    if (prev.jump && blocked && z - prev.z < 16) return false; // keep the landing zone clear
    const steps = Math.floor((z - prev.z) / Math.max(10, speed) / LANE_CHANGE_TIME);
    const reachable = reach(FULL & ~prev.mask, steps);
    return (reachable & free) !== 0;
  }

  private commit(z: number, blocked: number, jump = false) {
    this.rows.push({ z, mask: blocked, jump });
    if (this.rows.length > 64) this.rows.splice(0, this.rows.length - 64);
  }

  /**
   * Produce the next pattern. Returns null when nothing should spawn (breather / runway / gate zone).
   */
  next(ctx: SpawnContext): { obstacles: Placement[]; pickups: PickupPlacement[]; gap: number } {
    const r = this.rng;
    const z = this.nextZ;
    const phase = phaseAt(ctx.progress);
    const fast = ctx.regime === 'VOLATILE' || ctx.regime === 'CRASH';
    const hard = Math.min(1, ctx.district * 0.12 + ctx.lap * 0.25 + (ctx.regime === 'CRASH' ? 0.25 : ctx.regime === 'VOLATILE' ? 0.12 : 0));
    const out = { obstacles: [] as Placement[], pickups: [] as PickupPlacement[], gap: 40 };
    const pickLane = () => r.int(0, 2) as LaneId;
    const nearGate = z > ctx.gateZ - 55 && z < ctx.gateZ + 30;

    // --- scripted first 15 seconds: show off the core verbs quickly ---
    if (this.scripted && ctx.district === 0 && ctx.lap === 0) {
      const script: (() => void)[] = [
        () => { out.pickups.push({ kind: 'boost', lane: 1, z }); out.gap = 45; },
        () => { out.obstacles.push({ kind: 'car', lane: 0, z, speed: 16 }); out.gap = 50; },
        () => { out.pickups.push({ kind: 'ramp', lane: 1, z }); out.obstacles.push({ kind: 'car', lane: 1, z: z + 20, speed: 12 }); out.gap = 70; },
        () => { out.obstacles.push({ kind: 'barrier', lane: 1, z, span: 3 }); out.gap = 55; },
        () => { out.obstacles.push({ kind: 'car', lane: 2, z, speed: 14 }, { kind: 'car', lane: 0, z, speed: 14 }); out.gap = 60; },
      ];
      const i = this.scriptStep++;
      script[Math.min(i, script.length - 1)]();
      if (i >= script.length - 1) this.scripted = false;
      return this.accept(out, ctx) ?? { obstacles: [], pickups: out.pickups, gap: out.gap };
    }

    if (nearGate || phase === 'RUNWAY') {
      out.gap = 30;
      if (r.next() < 0.5) out.pickups.push({ kind: 'boost', lane: pickLane(), z });
      return out;
    }
    if (phase === 'BREATHER') {
      out.gap = 28;
      out.pickups.push({ kind: 'boost', lane: pickLane(), z });
      return out;
    }

    const density = phase === 'INTRO' ? 0.55 : phase === 'BUILD' ? 0.75 + hard * 0.15 : 0.95 + hard * 0.2;
    const baseGap = { CALM: 50, TRENDING: 43, VOLATILE: 37, CRASH: 32 }[ctx.regime];
    out.gap = Math.max(20, (baseGap / density) * r.range(0.85, 1.2) - ctx.lap * 4);

    const roll = r.next();
    const two = () => {
      const a = pickLane();
      let b = pickLane();
      while (b === a) b = pickLane();
      return [a, b] as const;
    };
    if (phase === 'PEAK' && roll < 0.12 && z + 120 < ctx.gateZ - 60) {
      // FORK: a median wall splits the road — choose a route (= choose your spread) and commit to it
      const len = r.range(70, 100);
      out.obstacles.push({ kind: 'wall', lane: 1, z: z + len / 2, len });
      const side = r.next() < 0.5 ? 0 : 2;
      for (let k = 0; k < 3; k++) out.pickups.push({ kind: 'boost', lane: side as LaneId, z: z + 15 + k * 22 });
      out.obstacles.push({ kind: 'barrier', lane: (2 - side) as LaneId, z: z + len * 0.55 });
      out.gap = len + 30;
      const ok = this.accept(out, ctx);
      if (ok) this.forks.push({ from: z - 20, to: z + len + 5 });
      return ok ?? this.fallback(ctx);
    } else if (roll < 0.22 && phase !== 'INTRO') {
      // slalom: alternating cars
      const startLeft = r.next() < 0.5;
      const n = phase === 'PEAK' ? 3 : 2;
      for (let k = 0; k < n; k++) out.obstacles.push({ kind: 'car', lane: ((k % 2 === 0) === startLeft ? 0 : 2) as LaneId, z: z + k * 26, speed: 15 });
      out.obstacles.push({ kind: 'car', lane: 1, z: z + 13, speed: 15 });
      out.gap = 26 * n + 22;
    } else if (roll < 0.36) {
      // ramp over traffic: take the ramp and fly over the car
      const l = pickLane();
      out.pickups.push({ kind: 'ramp', lane: l, z });
      out.obstacles.push({ kind: 'car', lane: l, z: z + 20, speed: 12 });
      out.gap = 60;
    } else if (fast && roll < 0.5) {
      if (ctx.regime === 'CRASH' && r.next() < 0.5) {
        const [a, b] = two();
        out.obstacles.push({ kind: 'debris', lane: a, z });
        if (r.next() < 0.4 + hard * 0.3) out.obstacles.push({ kind: 'debris', lane: b, z: z + 6 });
      } else {
        const [a, b] = two();
        out.obstacles.push({ kind: 'spike', lane: a, z });
        if (r.next() < 0.35 + hard * 0.35) out.obstacles.push({ kind: 'spike', lane: b, z });
      }
    } else if ((fast || phase === 'PEAK') && roll < 0.62) {
      // oncoming "short seller" — telegraphed by headlights and warning chevrons
      out.obstacles.push({ kind: 'oncoming', lane: pickLane(), z: z + 60, speed: -16 });
      out.gap = 55;
    } else if (roll < 0.82) {
      const [a, b] = two();
      const car: Placement = { kind: 'car', lane: a, z, speed: r.range(12, 20) };
      out.obstacles.push(car);
      if (r.next() < 0.25 + hard * 0.4) out.obstacles.push({ kind: 'car', lane: b, z: z + r.range(0, 6), speed: car.speed });
      else if (fast && Math.abs(a - b) === 1 && r.next() < 0.5) {
        car.changeTo = b;
        car.changeAt = r.range(32, 48);
      }
    } else {
      const span = (r.next() < 0.25 + hard * 0.3 ? 3 : r.next() < 0.5 ? 2 : 1) as 1 | 2 | 3;
      out.obstacles.push({ kind: 'barrier', lane: span === 3 ? 1 : span === 2 ? (r.next() < 0.5 ? 0 : 1) : pickLane(), z, span });
      out.gap = Math.max(out.gap, 34);
    }
    if (phase !== 'INTRO' && r.next() < 0.18) out.pickups.push({ kind: 'boost', lane: pickLane(), z: z - out.gap * 0.5 });

    return this.accept(out, ctx) ?? this.fallback(ctx);
  }

  /** a simple safe pattern when the chosen one would be unfair */
  private fallback(ctx: SpawnContext) {
    const z = this.nextZ;
    for (const lane of [0, 1, 2] as LaneId[]) {
      const p = { obstacles: [{ kind: 'car' as const, lane, z, speed: 15 }], pickups: [] as PickupPlacement[], gap: 40 };
      const ok = this.accept(p, ctx);
      if (ok) return ok;
    }
    return { obstacles: [], pickups: [], gap: 30 };
  }

  /** validate all rows of a pattern; commit them if fair */
  private accept(p: { obstacles: Placement[]; pickups: PickupPlacement[]; gap: number }, ctx: SpawnContext) {
    const s = ctx.speed;
    type R = { z: number; mask: number; jump: boolean };
    const rows: R[] = [];
    for (const o of p.obstacles) {
      if (o.kind === 'wall') {
        const len = o.len ?? 80;
        for (let k = -len / 2; k <= len / 2; k += 10) rows.push({ z: o.z + k, mask: 0b010, jump: false });
        continue;
      }
      const zEff = o.speed ? meetZ(o.z, o.speed, ctx.playerZ, s) : o.z;
      if (o.kind === 'barrier') {
        rows.push({ z: zEff, mask: 0, jump: true });
        continue;
      }
      let mask = 1 << o.lane;
      if (o.changeTo !== undefined) mask |= 1 << o.changeTo;
      rows.push({ z: zEff, mask, jump: false });
    }
    // merge rows that the player meets almost simultaneously
    rows.sort((a, b) => a.z - b.z);
    const merged: R[] = [];
    for (const row of rows) {
      const last = merged[merged.length - 1];
      if (last && row.z - last.z < 8) {
        last.mask |= row.mask;
        last.jump = last.jump || row.jump;
      } else merged.push({ ...row });
    }
    // dry-run validation against the committed history
    const saved = this.rows.slice();
    for (const row of merged) {
      if (row.jump && row.mask === 0) {
        // landing zone: nothing blocking within 16 m after a barrier
        const prev = this.lastRow();
        if (row.z < prev.z) return this.restore(saved);
        this.commit(row.z, 0, true);
        continue;
      }
      if (!this.canPlace(row.z, row.mask, s)) return this.restore(saved);
      this.commit(row.z, row.mask);
    }
    return p;
  }

  private restore(saved: Row[]) {
    this.rows = saved;
    return null;
  }

  insideFork(z: number) {
    return this.forks.some((f) => z >= f.from && z <= f.to);
  }
}
