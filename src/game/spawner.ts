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
import { BALANCE } from './gameBalanceConfig';

export type ObstacleKind = 'car' | 'barrier' | 'spike' | 'debris' | 'oncoming' | 'wall' | 'warning';
export type PickupKind = 'ramp' | 'boost' | 'coin';

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
  /** v3: recommended lane (never gets a non-jumpable obstacle) and bit mask of dangerous lanes */
  rec: LaneId;
  danger: number;
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
   * v3 patterns — the course agrees with the market:
   *  - recommended lane: profit coins + only JUMPABLE gimmicks (low barrier, ramp) → right decision = safe, rich run
   *  - dangerous lanes (fast/one-sided markets): warning barricades and regime hazards
   *  - other lanes: light slow traffic in calm markets, tempting boost pads
   * Non-jumpable obstacles are never placed in the recommended lane (tested).
   */
  next(ctx: SpawnContext): { obstacles: Placement[]; pickups: PickupPlacement[]; gap: number } {
    const r = this.rng;
    const z = this.nextZ;
    const C = BALANCE.course;
    const rec = ctx.rec;
    const phase = phaseAt(ctx.progress);
    const out = { obstacles: [] as Placement[], pickups: [] as PickupPlacement[], gap: 40 };
    const others = ([0, 1, 2] as LaneId[]).filter((l) => l !== rec);
    const dangers = others.filter((l) => (ctx.danger >> l) & 1);
    const coins = (n: number, z0: number) => {
      for (let k = 0; k < n; k++) out.pickups.push({ kind: 'coin', lane: rec, z: z0 + k * 6 });
    };
    const nearGate = z > ctx.gateZ - 55 && z < ctx.gateZ + 30;

    // --- scripted first ~15 s: teach "follow the glowing lane" ---
    if (this.scripted && ctx.district === 0 && ctx.lap === 0) {
      const other = others[0];
      const script: (() => void)[] = [
        () => { out.pickups.push({ kind: 'boost', lane: rec, z }); coins(4, z + 12); out.gap = 50; },
        () => { out.obstacles.push({ kind: 'barrier', lane: rec, z, span: 1 }); coins(3, z + 14); out.gap = 50; },
        () => { out.pickups.push({ kind: 'ramp', lane: rec, z }); coins(3, z + 26); out.gap = 60; },
        () => { out.obstacles.push({ kind: 'car', lane: other, z, speed: 14 }); coins(3, z); out.gap = 50; },
        () => { out.obstacles.push({ kind: 'warning', lane: others[1] ?? other, z }); coins(3, z); out.gap = 55; },
      ];
      const i = this.scriptStep++;
      script[Math.min(i, script.length - 1)]();
      if (i >= script.length - 1) this.scripted = false;
      return this.accept(out, ctx) ?? { obstacles: [], pickups: out.pickups, gap: out.gap };
    }

    if (nearGate || phase === 'RUNWAY' || phase === 'BREATHER') {
      out.gap = 32;
      coins(C.coinsPerRow, z);
      if (r.next() < 0.4) out.pickups.push({ kind: 'boost', lane: rec, z: z + 20 });
      return out;
    }

    const density = phase === 'INTRO' ? 0.6 : phase === 'BUILD' ? 0.85 : 1.05;
    out.gap = Math.max(22, (C.gap[ctx.regime] / density) * r.range(0.85, 1.2) - ctx.lap * 3);

    // recommended lane: coins + (sometimes) a jumpable gimmick
    coins(C.coinsPerRow, z);
    if (r.next() < C.gimmickChance) {
      if (r.next() < 0.6) out.obstacles.push({ kind: 'barrier', lane: rec, z: z + out.gap * 0.55, span: 1 });
      else out.pickups.push({ kind: 'ramp', lane: rec, z: z + out.gap * 0.45 });
    }
    // dangerous lanes: make the wrong decision visibly costly
    for (const l of dangers) {
      const u = r.next();
      if (ctx.regime === 'CRASH' && u < 0.35) out.obstacles.push({ kind: 'debris', lane: l, z });
      else if (ctx.regime === 'VOLATILE' && u < 0.3) out.obstacles.push({ kind: 'spike', lane: l, z });
      else if (phase === 'PEAK' && u < 0.45) out.obstacles.push({ kind: 'oncoming', lane: l, z: z + 60, speed: -16 });
      else out.obstacles.push({ kind: 'warning', lane: l, z });
    }
    // remaining (neutral) lanes: light slow traffic in calmer markets, and tempting boosts
    for (const l of others) {
      if (dangers.includes(l)) continue;
      const calm = ctx.regime === 'CALM' || ctx.regime === 'TRENDING';
      if (calm && r.next() < C.calmTraffic) out.obstacles.push({ kind: 'car', lane: l, z: z + r.range(0, 10), speed: r.range(12, 18) });
      else if (r.next() < 0.15) out.pickups.push({ kind: 'boost', lane: l, z: z + r.range(0, 10) });
    }
    return this.accept(out, ctx) ?? { obstacles: [], pickups: out.pickups.filter((p) => p.kind !== 'ramp'), gap: out.gap };
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
