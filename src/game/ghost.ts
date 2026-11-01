/**
 * GHOST REPLAY + SAME SEED history (local only — stored in this browser's localStorage).
 * A ghost is the position trace (10 samples/s) of your best run on a seed.
 */
import type { GameSession } from './session';

export type GhostTrack = { seed: number; score: number; pnl: number; vehicle: string; dt: number; x: number[]; y: number[]; z: number[]; date: string };
export type Attempt = { score: number; pnl: number; rar: number; distance: number; date: string };

const GKEY = (seed: number) => `quantrush.ghost.${seed}`;
const HKEY = (seed: number) => `quantrush.seedhist.${seed}`;
const SAMPLE = 0.1;

function read<T>(k: string): T | null {
  try {
    const r = localStorage.getItem(k);
    return r ? (JSON.parse(r) as T) : null;
  } catch {
    return null;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* quota or private mode — ghosts are optional */
  }
}

export const ghostState = {
  track: null as GhostTrack | null,
  enabled: true,
  session: null as GameSession | null,
  sample(t: number) {
    const g = this.track;
    if (!g) return null;
    const f = t / g.dt;
    const i = Math.floor(f);
    if (i < 0 || i + 1 >= g.z.length) return null;
    const a = f - i;
    return { x: g.x[i] + (g.x[i + 1] - g.x[i]) * a, y: g.y[i] + (g.y[i + 1] - g.y[i]) * a, z: g.z[i] + (g.z[i + 1] - g.z[i]) * a };
  },
};

export class GhostRecorder {
  x: number[] = [];
  y: number[] = [];
  z: number[] = [];
  private next = 0;
  record(s: GameSession) {
    while (s.t >= this.next) {
      this.x.push(Math.round(s.x * 100) / 100);
      this.y.push(Math.round(s.y * 100) / 100);
      this.z.push(Math.round(s.z * 10) / 10);
      this.next += SAMPLE;
    }
  }
}

export function loadGhost(seed: number): GhostTrack | null {
  return read<GhostTrack>(GKEY(seed));
}

/** keep the best-scoring run per seed as the ghost; returns true if it replaced the previous ghost */
export function saveGhostIfBest(seed: number, score: number, pnl: number, vehicle: string, rec: GhostRecorder): boolean {
  const prev = loadGhost(seed);
  if (prev && prev.score >= score) return false;
  write(GKEY(seed), { seed, score, pnl, vehicle, dt: SAMPLE, x: rec.x, y: rec.y, z: rec.z, date: new Date().toISOString() } satisfies GhostTrack);
  return true;
}

export function seedHistory(seed: number): Attempt[] {
  return read<Attempt[]>(HKEY(seed)) ?? [];
}

export function pushAttempt(seed: number, a: Attempt): Attempt[] {
  const h = [...seedHistory(seed), a].slice(-10);
  write(HKEY(seed), h);
  return h;
}

/** DAILY CHALLENGE: one shared seed per calendar day in Japan Standard Time (UTC+9). */
export function dailyInfo(now = new Date()) {
  const jst = new Date(now.getTime() + 9 * 3600 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth() + 1;
  const d = jst.getUTCDate();
  const key = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  // FNV-1a of the date string → 6-digit seed
  let h = 2166136261;
  for (const ch of `QUANT-RUSH-DAILY-${key}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return { key, seed: 100000 + (h % 900000), label: `DAILY ${key} (JST)` };
}
