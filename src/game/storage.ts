import type { VehicleId } from './content';

export type CameraMode = 'standard' | 'dramatic' | 'first';
export type Quality = 'high' | 'low';

export type Settings = {
  sfx: boolean;
  music: boolean;
  quality: Quality;
  camera: CameraMode;
  roll: boolean;
  vehicle: VehicleId;
  fixedSeed: number | null;
};

export type Records = { bestScore: number; bestPnL: number; maxSpeed: number; maxCombo: number; bestDistance: number; plays: number };

const SKEY = 'quantrush.settings.v1';
const RKEY = 'quantrush.records.v1';

const isMobile = () => typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);

export const defaultSettings = (): Settings => ({
  sfx: true,
  music: true,
  quality: isMobile() ? 'low' : 'high',
  camera: 'standard',
  roll: true,
  vehicle: 'board',
  fixedSeed: null,
});

export const defaultRecords = (): Records => ({ bestScore: 0, bestPnL: 0, maxSpeed: 0, maxCombo: 0, bestDistance: 0, plays: 0 });

function load<T extends object>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage unavailable (private mode) — ignore */
  }
}

export const loadSettings = () => load(SKEY, defaultSettings());
export const saveSettings = (s: Settings) => save(SKEY, s);
export const loadRecords = () => load(RKEY, defaultRecords());
export const saveRecords = (r: Records) => save(RKEY, r);
