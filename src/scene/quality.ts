import { create } from 'zustand';
import { isMobile, type Quality } from '../game/storage';

export type Tier = 'high' | 'medium' | 'low';

export type TierSpec = { dpr: number; post: 'full' | 'bloom' | 'none'; city: number; particles: number; speedLines: number; antialias: boolean; /** fog end cap (m): nothing is drawn far beyond it */ fogFar: number };

export const TIERS: Record<Tier, TierSpec> = {
  high: { dpr: 1.75, post: 'full', city: 1, particles: 900, speedLines: 90, antialias: true, fogFar: 600 },
  medium: { dpr: 1.25, post: 'bloom', city: 0.78, particles: 600, speedLines: 60, antialias: false, fogFar: 470 },
  low: { dpr: 0.85, post: 'none', city: 0.6, particles: 360, speedLines: 36, antialias: false, fogFar: 370 },
};

/** effective tier (AUTO moves it with measured frame rate) */
export const useTier = create<{ tier: Tier; fps: number; calls: number; tris: number; set: (t: Tier) => void }>((set) => ({
  tier: isMobile() ? 'medium' : 'high',
  fps: 0,
  calls: 0,
  tris: 0,
  set: (tier) => set({ tier }),
}));

/**
 * Phones are fill-rate bound: post-processing is OFF by default (only an explicit HIGH gets a light bloom,
 * never chromatic aberration), the canvas DPR is capped at 1.5 and facades use the cheap sampling path.
 */
export function effectiveSpec(tier: Tier, quality: Quality, mobile = isMobile()): TierSpec & { fastFacade: boolean } {
  const s = TIERS[tier];
  if (!mobile) return { ...s, fastFacade: tier === 'low' };
  return { ...s, post: quality === 'high' ? 'bloom' : 'none', dpr: Math.min(s.dpr, 1.5), antialias: false, fastFacade: true };
}

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
