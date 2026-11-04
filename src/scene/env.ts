/** Shared, frame-updated environment colors (district palette × market regime). */
import * as THREE from 'three';
import type { RegimeId } from '../sim/config';
import { DISTRICTS } from '../game/content';
import { sceneryFor } from './scenery';

export const env = {
  primary: new THREE.Color('#00f0ff'),
  secondary: new THREE.Color('#ff2fd6'),
  fog: new THREE.Color('#0a0620'),
  skyTop: new THREE.Color('#02010a'),
  skyHorizon: new THREE.Color('#3a0d5c'),
  regimeColor: new THREE.Color('#3dd6ff'),
  /** district key-light tint and fog distances (visual only) */
  key: new THREE.Color('#ffffff'),
  fogNear: 60,
  fogFar: 420,
  danger: 0,
  time: 0,
};

const tmp = {
  p: new THREE.Color(),
  s: new THREE.Color(),
  f: new THREE.Color(),
  h: new THREE.Color(),
  r: new THREE.Color(),
  t: new THREE.Color(),
  k: new THREE.Color(),
  rh: new THREE.Color(),
};

const REGIME_TINT: Record<RegimeId, { horizon: string; color: string; danger: number }> = {
  CALM: { horizon: '#3a0d5c', color: '#3dd6ff', danger: 0 },
  TRENDING: { horizon: '#5c3a0d', color: '#ffc23d', danger: 0.15 },
  VOLATILE: { horizon: '#3d0d6c', color: '#c34dff', danger: 0.45 },
  CRASH: { horizon: '#7a0418', color: '#ff2a4d', danger: 1 },
};

export function updateEnv(district: number, regime: RegimeId, dt: number) {
  const d = DISTRICTS[district % DISTRICTS.length];
  const r = REGIME_TINT[regime];
  const k = 1 - Math.exp(-dt * 1.6);
  tmp.p.set(regime === 'CRASH' ? '#ff2a4d' : d.primary);
  tmp.s.set(regime === 'CRASH' ? '#ff6a00' : d.secondary);
  const sc = sceneryFor(district);
  const regimeMix = regime === 'CALM' ? 0.12 : regime === 'CRASH' ? 0.6 : 0.35;
  tmp.rh.set(r.horizon);
  tmp.f.set(sc.fog).lerp(tmp.rh, regimeMix);
  tmp.h.set(sc.skyHorizon).lerp(tmp.rh, regimeMix);
  tmp.t.set(sc.skyTop);
  tmp.k.set(regime === 'CRASH' ? '#ff6a6a' : sc.key);
  env.skyTop.lerp(tmp.t, k);
  env.key.lerp(tmp.k, k);
  env.fogNear += (sc.fogNear - env.fogNear) * k;
  env.fogFar += (sc.fogFar - env.fogFar) * k;
  tmp.r.set(r.color);
  env.primary.lerp(tmp.p, k);
  env.secondary.lerp(tmp.s, k);
  env.fog.lerp(tmp.f, k);
  env.skyHorizon.lerp(tmp.h, k);
  env.regimeColor.lerp(tmp.r, k);
  env.danger += (r.danger - env.danger) * k;
  env.time += dt;
}
