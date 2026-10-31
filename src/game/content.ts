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
};

export const DISTRICTS: District[] = [
  { id: 'kabutocho', name: 'KABUTOCHO', jp: '兜町', tagline: 'EXCHANGE DISTRICT', primary: '#00f0ff', secondary: '#ff2fd6', accent: '#7c5cff', fog: '#0a0620', signs: ['取引所', 'BID', 'ASK', '株価', 'TSE', '兜'], length: 760 },
  { id: 'otemachi', name: 'OTEMACHI', jp: '大手町', tagline: 'BANKING CORE', primary: '#3d7bff', secondary: '#ffc23d', accent: '#00ffa3', fog: '#060b22', signs: ['銀行', 'BANK', '金利', 'FX', '債券', 'YIELD'], length: 820 },
  { id: 'marunouchi', name: 'MARUNOUCHI', jp: '丸の内', tagline: 'CAPITAL AVENUE', primary: '#4dfff3', secondary: '#ff6b3d', accent: '#ffffff', fog: '#04121a', signs: ['資本', 'IPO', '丸の内', 'M&A', '証券', 'ALPHA'], length: 860 },
  { id: 'roppongi', name: 'ROPPONGI', jp: '六本木', tagline: 'HEDGE FUND HILLS', primary: '#b84dff', secondary: '#ff3d8b', accent: '#3dffcf', fog: '#12051e', signs: ['ヘッジ', 'HEDGE', 'QUANT', '裁定', 'GAMMA', 'VEGA'], length: 900 },
  { id: 'shibuya', name: 'SHIBUYA', jp: '渋谷', tagline: 'FINTECH CROSSING', primary: '#a6ff00', secondary: '#ff8a00', accent: '#00d0ff', fog: '#0c1206', signs: ['渋谷', 'CRYPTO', 'FINTECH', '暗号', 'DEFI', '109'], length: 940 },
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
};

export const VEHICLES: Record<VehicleId, Vehicle> = {
  board: { id: 'board', name: 'NEON BOARD', desc: '軽快なホバーボード。旋回性能が高い', baseSpeed: 36, lateral: 24, jumpVelocity: 9.6, stability: 3, color: '#00f0ff' },
  bike: { id: 'bike', name: 'VECTOR BIKE', desc: '最高速重視。ジャンプは低め', baseSpeed: 41, lateral: 19, jumpVelocity: 8.6, stability: 3, color: '#ff2fd6' },
  pod: { id: 'pod', name: 'ARB POD', desc: '安定性重視。耐久力+1', baseSpeed: 33, lateral: 21, jumpVelocity: 9.0, stability: 4, color: '#a6ff00' },
};

export const LANE_X = [-4, 0, 4] as const;
export const LANE_NAMES = ['AGGRESSIVE', 'BALANCED', 'DEFENSIVE'] as const;
export const LANE_COLORS = ['#ff3d6e', '#00f0ff', '#3dff8b'] as const;
