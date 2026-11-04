/**
 * Visual-only scenery profiles for the five districts.
 * Nothing here is read by the simulation, spawner, physics or scoring — it only shapes what is drawn.
 * (Gameplay district data such as length lives in src/game/content.ts and is untouched.)
 */
export type FacadeStyle = 0 | 1 | 2 | 3 | 4; // index into the facade atlas
export type CrownStyle = 'eaves' | 'glassCrown' | 'cornice' | 'setback' | 'billboard';

export type SceneryProfile = {
  id: string;
  /** sky & fog — what the air feels like */
  skyTop: string;
  skyHorizon: string;
  fog: string;
  fogNear: number;
  fogFar: number;
  /** light tint (key light / hemisphere) */
  key: string;
  ground: string;
  /** buildings */
  facade: FacadeStyle;
  bodyTint: [string, string, string];
  hMin: number;
  hMax: number;
  wMin: number;
  wMax: number;
  depth: number;
  /** distance of the street wall from the road edge (smaller = denser, more enclosed) */
  near: number;
  /** probability that a slot is left empty (plazas, open sky) */
  gaps: number;
  crown: CrownStyle;
  crownColor: string;
  spire: number;
  /** far-skyline silhouette kind */
  skyline: 'low' | 'towers' | 'station' | 'hills' | 'dense';
  /** sidewalk paving style index (see Sidewalks) */
  paving: 0 | 1 | 2 | 3 | 4;
  /** sign look */
  signStyle: 'shop' | 'corporate' | 'brass' | 'neon' | 'pop';
};

export const SCENERY: SceneryProfile[] = [
  {
    // 兜町: calm, low stone exchange quarter, warm lanterns, deep indigo night
    id: 'kabutocho', skyTop: '#03030f', skyHorizon: '#20305a', fog: '#0b1022', fogNear: 70, fogFar: 430, key: '#ffd9a0', ground: '#1a1a2a',
    facade: 0, bodyTint: ['#d9cdb8', '#b8c4cc', '#e8d2a8'], hMin: 7, hMax: 22, wMin: 10, wMax: 18, depth: 12, near: 1.5, gaps: 0.04,
    crown: 'eaves', crownColor: '#ff5a3c', spire: 0, skyline: 'low', paving: 0, signStyle: 'shop',
  },
  {
    // 大手町: towering glass canyon, cold blue/gold, haze high up
    id: 'otemachi', skyTop: '#01030c', skyHorizon: '#0d2a5c', fog: '#071430', fogNear: 60, fogFar: 520, key: '#9fc4ff', ground: '#0c1428',
    facade: 1, bodyTint: ['#7fb4ff', '#a8d4ff', '#ffd27a'], hMin: 55, hMax: 140, wMin: 8, wMax: 13, depth: 14, near: 3.5, gaps: 0.02,
    crown: 'glassCrown', crownColor: '#ffc23d', spire: 0.25, skyline: 'towers', paving: 1, signStyle: 'corporate',
  },
  {
    // 丸の内: red-brick avenue, trees, warm amber light, orderly street wall
    id: 'marunouchi', skyTop: '#07030a', skyHorizon: '#4a2418', fog: '#1a0c08', fogNear: 70, fogFar: 450, key: '#ffb36b', ground: '#2a1610',
    facade: 2, bodyTint: ['#d06a4a', '#c45a3c', '#e08a5c'], hMin: 18, hMax: 26, wMin: 12, wMax: 16, depth: 14, near: 5, gaps: 0.12,
    crown: 'cornice', crownColor: '#fff2d8', spire: 0, skyline: 'station', paving: 2, signStyle: 'brass',
  },
  {
    // 六本木: vertical night city, setbacks and spires, purple glow, layered hills
    id: 'roppongi', skyTop: '#06010e', skyHorizon: '#3a0f5c', fog: '#14062a', fogNear: 70, fogFar: 560, key: '#d08cff', ground: '#170a24',
    facade: 3, bodyTint: ['#c88cff', '#ff7ac8', '#7ae0ff'], hMin: 40, hMax: 170, wMin: 6, wMax: 11, depth: 11, near: 2.5, gaps: 0.08,
    crown: 'setback', crownColor: '#ff4dd2', spire: 0.55, skyline: 'hills', paving: 3, signStyle: 'neon',
  },
  {
    // 渋谷: dense, loud, screens everywhere, bright fog glow
    id: 'shibuya', skyTop: '#05020c', skyHorizon: '#2a1a40', fog: '#1a1030', fogNear: 55, fogFar: 380, key: '#ffffff', ground: '#151020',
    facade: 4, bodyTint: ['#ffffff', '#a6ff00', '#ff8a00'], hMin: 16, hMax: 52, wMin: 5, wMax: 9, depth: 9, near: 0.5, gaps: 0,
    crown: 'billboard', crownColor: '#00d0ff', spire: 0.05, skyline: 'dense', paving: 4, signStyle: 'pop',
  },
];

export const sceneryFor = (district: number) => SCENERY[((district % 5) + 5) % 5];

/** landmark world z: the middle of the current district (its obstacle-free breather section) — visual only */
export function landmarkZ(s: { nextGate?: { z: number }; districtStartZ: number }): number | null {
  const g = s.nextGate;
  if (!g) return null;
  return s.districtStartZ + (g.z - s.districtStartZ) * 0.505;
}

/** half-length of the open plaza kept around each landmark so its silhouette is not hidden by the street wall */
export const LANDMARK_PLAZA = 42;

/** deterministic visual hash (independent of every gameplay RNG stream) */
export function vhash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
