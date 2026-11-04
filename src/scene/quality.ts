import { create } from 'zustand';
import { isMobile, type Quality } from '../game/storage';

export type Tier = 'high' | 'medium' | 'low';

export type TierSpec = { dpr: number; post: 'full' | 'bloom' | 'none'; city: number; particles: number; speedLines: number; antialias: boolean };

export const TIERS: Record<Tier, TierSpec> = {
  high: { dpr: 1.75, post: 'full', city: 1, particles: 900, speedLines: 90, antialias: true },
  medium: { dpr: 1.25, post: 'bloom', city: 0.75, particles: 600, speedLines: 60, antialias: false },
  low: { dpr: 0.85, post: 'none', city: 0.55, particles: 360, speedLines: 36, antialias: false },
};

/** effective tier (AUTO moves it with measured frame rate) */
export const useTier = create<{ tier: Tier; fps: number; calls: number; tris: number; set: (t: Tier) => void }>((set) => ({
  tier: isMobile() ? 'medium' : 'high',
  fps: 0,
  calls: 0,
  tris: 0,
  set: (tier) => set({ tier }),
}));

export function resolveTier(q: Quality): Tier | null {
  return q === 'auto' ? null : q;
}

export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
