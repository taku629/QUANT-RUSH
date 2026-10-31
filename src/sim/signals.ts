/**
 * Public market signals — computed ONLY from information a real market maker could see right now:
 *  - the public trade tape (orders that already arrived, whoever traded them)
 *  - visible incoming orders (side, size, urgency rings — no hidden attributes)
 *  - past mid prices
 *  - published news (from its publication tick on)
 * Nothing here reads future prices, informed flags, exact willingness or queue draws.
 */
import { LANES, urgencyTier, type LaneId } from './config';
import type { MarketTape, NewsItem } from './tape';

export type FlowRead = 'BALANCED' | 'RUSH' | 'ONE_SIDED' | 'ANNOUNCED';

export type MarketSignals = {
  /** qty-weighted net side of visible incoming orders, −1 (all sells) … +1 (all buys) */
  incomingImbalance: number;
  /** qty-weighted net side of the last 2 s of public prints */
  recentImbalance: number;
  /** mid change over the last 1 s and 3 s ($) */
  momentum1s: number;
  momentum3s: number;
  /** public prints per second (last 2 s) */
  orderRate: number;
  /** average urgency rings of the last 3 s of prints */
  avgTier: number;
  /** naive per-lane spread income estimate from the last 3 s of prints ($/s), ignoring adverse selection */
  laneIncome: [number, number, number];
  /** active public news (published within the last 5 s) */
  news: NewsItem | null;
  /** heuristic classification of the current flow (a read, not the truth) */
  read: FlowRead;
};

const sgn = (side: 'BUY' | 'SELL') => (side === 'BUY' ? 1 : -1);

export function computeSignals(tape: MarketTape, tick: number): MarketSignals {
  const dt = tape.config.dt;
  const w2 = Math.round(2 / dt);
  const w3 = Math.round(3 / dt);
  // public prints in the last 3 s
  let net2 = 0, tot2 = 0, n2 = 0, tierSum = 0, n3 = 0;
  const income: [number, number, number] = [0, 0, 0];
  for (let a = Math.max(0, tick - w3); a < tick; a++) {
    const list = tape.arrivals.get(a);
    if (!list) continue;
    for (const o of list) {
      const tier = urgencyTier(o.willingness); // the urgency rings were visible before the print
      n3++;
      tierSum += tier;
      for (const l of LANES) if (tier >= l.id + 1 && o.block === undefined) income[l.id] += o.qty * l.halfSpread * l.queueWin;
      if (a >= tick - w2) {
        net2 += sgn(o.side) * o.qty;
        tot2 += o.qty;
        n2++;
      }
    }
  }
  // visible incoming
  let netIn = 0, totIn = 0;
  for (let a = tick; a <= tick + tape.maxLeadTicks; a++) {
    const list = tape.arrivals.get(a);
    if (!list) continue;
    for (const o of list) {
      if (o.spawnTick > tick) continue;
      netIn += sgn(o.side) * o.qty;
      totIn += o.qty;
    }
  }
  const m = tape.mid;
  const momentum1s = m[tick] - m[Math.max(0, tick - Math.round(1 / dt))];
  const momentum3s = m[tick] - m[Math.max(0, tick - w3)];
  let news: NewsItem | null = null;
  for (const nw of tape.news) {
    if (nw.tick > tick) break;
    if (tick - nw.tick <= Math.round(5 / dt)) news = nw;
  }
  const incomingImbalance = totIn > 0 ? netIn / totIn : 0;
  const recentImbalance = tot2 > 0 ? net2 / tot2 : 0;
  const orderRate = n2 / 2;
  const avgTier = n3 > 0 ? tierSum / n3 : 0;
  const flowBias = 0.5 * incomingImbalance + 0.5 * recentImbalance;
  let read: FlowRead = 'BALANCED';
  if (news && news.kind === 'SWEEP' && Math.sign(flowBias) === news.side) read = 'ANNOUNCED';
  else if (Math.abs(flowBias) > 0.38 && Math.sign(momentum1s) === Math.sign(flowBias)) read = 'ONE_SIDED';
  else if (orderRate >= 6 && avgTier < 1.4) read = 'RUSH';
  return {
    incomingImbalance,
    recentImbalance,
    momentum1s,
    momentum3s,
    orderRate,
    avgTier,
    laneIncome: income.map((v) => v / 3) as [number, number, number],
    news,
    read,
  };
}

export const FLOW_READ_INFO: Record<FlowRead, { jp: string; advice: string }> = {
  BALANCED: { jp: '両方向の注文', advice: '注文の緊急度(リング)に合わせてスプレッドを選ぶ' },
  RUSH: { jp: '小口注文が殺到', advice: '狭いスプレッドで回転を稼ぐチャンス' },
  ONE_SIDED: { jp: '一方向に偏った注文', advice: '情報を持つ相手かも。スプレッドを広げ、在庫をヘッジ' },
  ANNOUNCED: { jp: '公表済みの大口フロー', advice: '一時的な価格の歪み。流動性を供給すると報われやすい' },
};

export function bestIncomeLane(s: MarketSignals): LaneId {
  const v = s.laneIncome;
  return (v[0] >= v[1] && v[0] >= v[2] ? 0 : v[1] >= v[2] ? 1 : 2) as LaneId;
}
