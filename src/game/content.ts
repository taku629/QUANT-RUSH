/** Static game content: districts, vehicles, palettes. */
import type { RegimeId } from '../sim/config';

export type District = {
  id: string;
  name: string;
  jp: string;
  tagline: string;
  /** neon palette */
  primary: string;
  secondary: string;
  accent: string;
  fog: string;
  signs: string[];
  /** length in meters until the settlement gate */
  length: number;
  /** visual curve / hill intensity (0..1) */
  curviness: number;
  hilliness: number;
};

export const DISTRICTS: District[] = [
  { id: 'kabutocho', curviness: 0.5, hilliness: 0.25, name: 'KABUTOCHO', jp: '兜町', tagline: 'EXCHANGE DISTRICT', primary: '#00f0ff', secondary: '#ff2fd6', accent: '#7c5cff', fog: '#0a0620', signs: ['取引所', 'BID', 'ASK', '株価', 'TSE', '兜'], length: 760 },
  { id: 'otemachi', curviness: 0.35, hilliness: 0.7, name: 'OTEMACHI', jp: '大手町', tagline: 'BANKING CORE', primary: '#3d7bff', secondary: '#ffc23d', accent: '#00ffa3', fog: '#060b22', signs: ['銀行', 'BANK', '金利', 'FX', '債券', 'YIELD'], length: 820 },
  { id: 'marunouchi', curviness: 0.6, hilliness: 0.3, name: 'MARUNOUCHI', jp: '丸の内', tagline: 'CAPITAL AVENUE', primary: '#4dfff3', secondary: '#ff6b3d', accent: '#ffffff', fog: '#04121a', signs: ['資本', 'IPO', '丸の内', 'M&A', '証券', 'ALPHA'], length: 860 },
  { id: 'roppongi', curviness: 0.9, hilliness: 0.9, name: 'ROPPONGI', jp: '六本木', tagline: 'HEDGE FUND HILLS', primary: '#b84dff', secondary: '#ff3d8b', accent: '#3dffcf', fog: '#12051e', signs: ['ヘッジ', 'HEDGE', 'QUANT', '裁定', 'GAMMA', 'VEGA'], length: 900 },
  { id: 'shibuya', curviness: 1.0, hilliness: 0.5, name: 'SHIBUYA', jp: '渋谷', tagline: 'FINTECH CROSSING', primary: '#a6ff00', secondary: '#ff8a00', accent: '#00d0ff', fog: '#0c1206', signs: ['渋谷', 'CRYPTO', 'FINTECH', '暗号', 'DEFI', '109'], length: 940 },
];

export const REGIME_STYLE: Record<RegimeId, { color: string; label: string; jp: string; hint: string }> = {
  CALM: { color: '#3dd6ff', label: 'CALM', jp: '平穏', hint: '狭いスプレッドで回転を稼げ' },
  TRENDING: { color: '#ffc23d', label: 'TRENDING', jp: 'トレンド', hint: '一方向の注文に在庫が偏る' },
  VOLATILE: { color: '#c34dff', label: 'VOLATILE', jp: '高ボラ', hint: 'スプレッドを広げて身を守れ' },
  CRASH: { color: '#ff2a4d', label: 'CRASH', jp: '暴落', hint: '買い在庫に注意・ヘッジせよ' },
};

export type VehicleId = 'board' | 'bike' | 'pod';

export type Vehicle = {
  id: VehicleId;
  name: string;
  desc: string;
  baseSpeed: number;
  lateral: number;
  jumpVelocity: number;
  stability: number;
  color: string;
  /** lateral spring stiffness / damping: snappy vs. floaty steering */
  spring: number;
  damping: number;
  /** forward acceleration (m/s²) and share of speed kept after a crash */
  accel: number;
  hitKeep: number;
  /** extra launch from ramps */
  rampBonus: number;
};

export const VEHICLES: Record<VehicleId, Vehicle> = {
  board: { id: 'board', name: 'NEON BOARD', desc: 'キビキビ曲がる。ジャンプが高い', baseSpeed: 36, lateral: 24, jumpVelocity: 9.6, stability: 3, color: '#00f0ff', spring: 300, damping: 32, accel: 15, hitKeep: 0.5, rampBonus: 1.5 },
  bike: { id: 'bike', name: 'VECTOR BIKE', desc: '最高速重視。慣性で流れる操作感', baseSpeed: 41, lateral: 19, jumpVelocity: 8.6, stability: 3, color: '#ff2fd6', spring: 150, damping: 19, accel: 11, hitKeep: 0.4, rampBonus: 0 },
  pod: { id: 'pod', name: 'ARB POD', desc: '重く安定。耐久+1、衝突しても失速しにくい', baseSpeed: 33, lateral: 21, jumpVelocity: 9.0, stability: 4, color: '#a6ff00', spring: 200, damping: 30, accel: 13, hitKeep: 0.7, rampBonus: 0.5 },
};

export const LANE_X = [-4, 0, 4] as const;
export const LANE_NAMES = ['AGGRESSIVE', 'BALANCED', 'DEFENSIVE'] as const;
export const LANE_COLORS = ['#ff3d6e', '#00f0ff', '#3dff8b'] as const;
