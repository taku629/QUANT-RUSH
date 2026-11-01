/**
 * Visual track shape: curves and hills as smooth functions of distance (deterministic per seed).
 * Gameplay stays on three straight logical lanes (fair, readable); the world is bent in the vertex shader.
 */
import { hashSeed } from '../sim/rng';
import { DISTRICTS } from './content';

export type TrackShape = { curve: number; hill: number };

export function makeTrack(seed: number) {
  const h = (salt: string) => (hashSeed(seed, salt) % 10000) / 10000;
  const p1 = h('c1') * 6.28, p2 = h('c2') * 6.28, p3 = h('h1') * 6.28, p4 = h('h2') * 6.28;
  /** curvature & hill at world distance z, scaled per district (0..1 style intensity) */
  return (z: number, district: number): TrackShape => {
    const d = DISTRICTS[district % DISTRICTS.length];
    const c = Math.sin(z * 0.0042 + p1) * 0.65 + Math.sin(z * 0.0101 + p2) * 0.35;
    const hl = Math.sin(z * 0.0053 + p3) * 0.7 + Math.sin(z * 0.0131 + p4) * 0.3;
    // ease in from the start line
    const start = Math.min(1, z / 250);
    return { curve: c * d.curviness * start, hill: hl * d.hilliness * start };
  };
}
