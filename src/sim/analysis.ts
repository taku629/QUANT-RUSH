/**
 * LEARNING MODE — post-game review generated strictly from the simulation record.
 * Every sentence is backed by numbers computed from the engine log (no generic advice).
 * Hidden information (informed flags, later prices) is only used here, after the session ended.
 */
import { LANES, REGIMES, type LaneId, type RegimeId } from './config';
import type { MarketMakerEngine } from './engine';
import { benchmarkStrategies, runEpisode } from './strategies';
import { riskStats } from './scoring';

export type Insight = { tone: 'good' | 'warn' | 'bad' | 'info'; title: string; body: string; concept: string };

export type RegimeRow = {
  regime: RegimeId;
  seconds: number;
  laneSeconds: [number, number, number];
  fills: number;
  spread: number;
  markout: number;
  inventoryPnL: number;
};

export type Benchmark = { name: string; description: string; pnl: number; sharpe: number; maxDrawdown: number; fills: number };

export type Review = {
  attribution: { spread: number; rebate: number; hedgeCost: number; inventory: number; total: number };
  regimes: RegimeRow[];
  insights: Insight[];
  benchmarks: Benchmark[];
};

const usd = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(v).toFixed(0)}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function regimeTable(e: MarketMakerEngine): RegimeRow[] {
  const dt = e.cfg.dt;
  return REGIMES.map((regime) => {
    const lt = e.laneTicks[regime];
    const fills = e.fills.filter((f) => f.regime === regime);
    return {
      regime,
      seconds: (lt[0] + lt[1] + lt[2]) * dt,
      laneSeconds: [lt[0] * dt, lt[1] * dt, lt[2] * dt] as [number, number, number],
      fills: fills.length,
      spread: fills.reduce((a, f) => a + f.spread, 0),
      markout: fills.reduce((a, f) => a + (f.markout ?? 0), 0),
      inventoryPnL: e.inventoryPnLByRegime[regime],
    };
  }).filter((r) => r.seconds > 0);
}

/** Orders missed (price / offline) that the AGGRESSIVE or chosen lane would have filled — forgone spread. */
function forgone(e: MarketMakerEngine, filter: (m: MarketMakerEngine['misses'][number]) => boolean, lane?: LaneId) {
  let n = 0;
  let value = 0;
  for (const m of e.misses) {
    if (!filter(m)) continue;
    const o = e.tape.orders[m.orderId];
    const l = LANES[lane ?? m.lane];
    if (o.willingness >= l.halfSpread) {
      n++;
      value += o.qty * l.halfSpread;
    }
  }
  return { n, value };
}

export type ActionStats = { collisions: number; offlineSeconds: number; alphaDrives: number; gatesPassed: number; gatesFailed: number };

export function buildReview(e: MarketMakerEngine, action?: ActionStats, withBenchmarks = true): Review {
  const dt = e.cfg.dt;
  const insights: Insight[] = [];
  const rows = regimeTable(e);
  const row = (r: RegimeId) => rows.find((x) => x.regime === r);

  // 1) adverse selection in fast markets
  for (const r of ['VOLATILE', 'CRASH'] as RegimeId[]) {
    const rr = row(r);
    if (!rr || rr.seconds < 2) continue;
    const aggShare = rr.laneSeconds[0] / rr.seconds;
    const aggFills = e.fills.filter((f) => f.regime === r && f.lane === 0);
    const aggMarkout = aggFills.reduce((a, f) => a + (f.markout ?? 0), 0);
    if (aggShare >= 0.4 && aggFills.length >= 2 && aggMarkout < 0) {
      insights.push({
        tone: 'bad',
        concept: 'Adverse Selection / Volatility',
        title: `${r === 'CRASH' ? '暴落' : '高ボラティリティ'}市場で積極的に約定しすぎました`,
        body: `${r} 中の ${pct(aggShare)} を AGGRESSIVE レーンで過ごし ${aggFills.length} 回約定。2秒後の値洗い(マークアウト)合計は ${usd(aggMarkout)} で、価格が動く方向に先回りした相手に在庫を押し付けられました。値動きが大きい局面ではスプレッドを広げる(右レーン)ことで、1回あたり ${(LANES[2].halfSpread / LANES[0].halfSpread).toFixed(0)} 倍のスプレッドで変動リスクを補えます。`,
      });
    } else if (rr.laneSeconds[2] / rr.seconds >= 0.5 && rr.markout >= 0) {
      insights.push({
        tone: 'good',
        concept: 'Volatility / Spread',
        title: `${r} 市場でスプレッドを広げて防御できました`,
        body: `${r} 中の ${pct(rr.laneSeconds[2] / rr.seconds)} を DEFENSIVE レーンで過ごし、約定 ${rr.fills} 回のマークアウト合計は ${usd(rr.markout)}。広いスプレッドが値動きのリスクを吸収しました。`,
      });
    }
  }

  // 2) missed opportunity in calm markets
  const calm = row('CALM');
  if (calm && calm.seconds >= 4) {
    const defShare = (calm.laneSeconds[1] + calm.laneSeconds[2]) / calm.seconds;
    if (calm.laneSeconds[2] / calm.seconds >= 0.5) {
      const f = forgone(e, (m) => m.regime === 'CALM' && m.reason === 'PRICE', 0);
      insights.push({
        tone: 'warn',
        concept: 'Bid/Ask Spread',
        title: '平穏な市場でスプレッドが広すぎました',
        body: `CALM 中の ${pct(calm.laneSeconds[2] / calm.seconds)} を DEFENSIVE で過ごし、価格が合わずに逃した注文のうち ${f.n} 件は AGGRESSIVE なら約定していました（取り逃したスプレッド収益 約${usd(f.value)}）。値動きが小さい時は狭いスプレッドで回転数を稼ぐのが定石です。`,
      });
    } else if (defShare < 0.4 && calm.spread > 0) {
      insights.push({
        tone: 'good',
        concept: 'Market Making',
        title: '平穏な市場で回転よくスプレッドを稼げました',
        body: `CALM 中に ${calm.fills} 回約定し、スプレッド収益 ${usd(calm.spread)}。注文の流れが穏やかな局面では狭いスプレッドが有効です。`,
      });
    }
  }

  // 3) inventory concentration
  const lim = e.tick > 0 ? e.ticksAtLimit / e.tick : 0;
  if (lim >= 0.08) {
    insights.push({
      tone: 'bad',
      concept: 'Inventory Risk',
      title: '在庫が上限に張り付いていました',
      body: `プレイ時間の ${pct(lim)} で在庫が上限(±${e.cfg.positionLimit}株)に達していました。上限中は片側の注文しか受けられず、価格変動の影響を最大限に受けます。最大在庫 ${e.maxAbsInventory}株、在庫による損益 ${usd(e.inventoryPnL)}。`,
    });
  } else if (e.maxAbsInventory <= e.cfg.positionLimit * 0.6 && e.fills.length >= 10) {
    insights.push({
      tone: 'good',
      concept: 'Inventory Risk',
      title: '在庫を小さく保てました',
      body: `最大在庫は ${e.maxAbsInventory}株（上限の ${pct(e.maxAbsInventory / e.cfg.positionLimit)}）。平均在庫 ${Math.round(e.sumAbsInventory / Math.max(1, e.tick))}株で、価格変動への露出を抑えられています。`,
    });
  }

  // 4) hedging effectiveness: compare hedge cost with what the hedged inventory did over the next 3s
  if (e.hedges.length > 0) {
    const h3 = Math.round(3 / dt);
    let hold = 0; // PnL the hedged inventory would have made over the next 3 seconds
    let cost = 0;
    for (const h of e.hedges) {
      const later = e.tape.mid[Math.min(h.tick + h3, e.tape.mid.length - 1)];
      hold += h.inventoryBefore * (later - h.mid);
      cost += h.cost;
    }
    const prevented = -hold;
    insights.push({
      tone: prevented > cost ? 'good' : 'info',
      concept: 'Hedging',
      title: prevented > cost ? 'ヘッジが損失を防ぎました' : 'ヘッジはコスト先行でした',
      body: `ヘッジ ${e.hedges.length} 回、コスト合計 ${usd(-cost)}。ヘッジした在庫を3秒間持ち続けていた場合の損益は ${usd(hold)} でした${prevented > cost ? '。損失回避効果がコストを上回っています。' : '。在庫が小さい時や平穏な市場ではコストが効果を上回りがちです。'}`,
    });
  } else if (e.inventoryPnL < -150) {
    insights.push({
      tone: 'warn',
      concept: 'Hedging',
      title: 'ヘッジを使いませんでした',
      body: `在庫の価格変動による損益が ${usd(e.inventoryPnL)} ありました。在庫が偏った時に HEDGE（Space）で在庫をゼロに戻せば、コストを払う代わりに価格変動リスクを断ち切れます。`,
    });
  }

  // 5) crash handling
  const crash = e.tape.segments.find((s) => s.regime === 'CRASH' && s.startTick < e.tick);
  if (crash) {
    const inv0 = e.timeline.reduce((best, p) => (p.tick <= crash.startTick ? p : best), e.timeline[0]).inventory;
    const crashPnL = e.inventoryPnLByRegime.CRASH + e.fills.filter((f) => f.regime === 'CRASH').reduce((a, f) => a + f.spread, 0);
    const hedgedInCrash = e.hedges.filter((h) => h.regime === 'CRASH').length;
    insights.push({
      tone: crashPnL >= -300 ? 'good' : 'bad',
      concept: 'Crash / Tail Risk',
      title: crashPnL >= -300 ? '市場暴落を乗り切りました' : '市場暴落で大きな損失',
      body: `暴落開始時の在庫は ${inv0}株。暴落中の在庫損益＋スプレッドは ${usd(crashPnL)}、暴落中のヘッジ ${hedgedInCrash} 回。暴落時は売り注文が殺到して買い在庫が積み上がるため、広いスプレッドとこまめなヘッジが鍵です。`,
    });
  }

  // 6) informed flow (revealed post-game)
  const informed = e.fills.filter((f) => f.informed);
  if (informed.length >= 3) {
    const loss = informed.reduce((a, f) => a + (f.markout ?? 0), 0);
    insights.push({
      tone: 'info',
      concept: 'Adverse Selection',
      title: `約定相手の ${pct(informed.length / Math.max(1, e.fills.length))} は情報トレーダーでした`,
      body: `${informed.length} 件の約定は、この先2秒の値動きを知っている相手でした（プレイ中は非表示）。これらのマークアウト合計は ${usd(loss)}。緊急度リング(輪の数)の多い注文ほど情報トレーダーの割合が高まります。`,
    });
  }

  // 7) action layer coupling
  if (action && action.offlineSeconds > 0.5) {
    const f = forgone(e, (m) => m.reason === 'OFFLINE');
    insights.push({
      tone: 'warn',
      concept: 'Market Making',
      title: '転倒でクォートが停止しました',
      body: `衝突 ${action.collisions} 回で合計 ${action.offlineSeconds.toFixed(1)} 秒クォートがオフラインになり、${f.n} 件の約定機会（スプレッド 約${usd(f.value)}）を逃しました。`,
    });
  }
  if (e.rebatePnL > 0) {
    insights.push({
      tone: 'good',
      concept: 'Maker Rebate',
      title: 'ALPHA DRIVE でメイカーリベートを獲得',
      body: `流動性提供インセンティブとして ${usd(e.rebatePnL)} のリベートを受け取りました。リベートはスプレッドとは別の収益として計上されています。`,
    });
  }

  const benchmarks: Benchmark[] = [];
  if (withBenchmarks) {
    const seconds = Math.max(5, e.time);
    for (const s of benchmarkStrategies()) {
      const r = runEpisode(e.tape, s, seconds);
      benchmarks.push({ name: s.name, description: s.description, pnl: r.stats.pnl, sharpe: r.stats.sharpe, maxDrawdown: r.stats.maxDrawdown, fills: r.stats.fills });
    }
    const me = riskStats(e);
    const beat = benchmarks.filter((b) => me.pnl > b.pnl).length;
    insights.push({
      tone: beat >= 3 ? 'good' : beat >= 1 ? 'info' : 'warn',
      concept: 'Risk-adjusted Return',
      title: `同じ市場で ${benchmarks.length} 体のボット中 ${beat} 体に勝利`,
      body: `同じシード・同じ時間(${seconds.toFixed(0)}秒)でボット戦略を走らせた比較です。あなたのPnLは ${usd(me.pnl)}、リスク調整後リターン(Sharpe) ${me.sharpe.toFixed(2)}。`,
    });
  }

  const order = { bad: 0, warn: 1, good: 2, info: 3 };
  insights.sort((a, b) => order[a.tone] - order[b.tone]);

  return {
    attribution: { spread: e.spreadPnL, rebate: e.rebatePnL, hedgeCost: e.hedgeCost, inventory: e.inventoryPnL, total: e.pnl },
    regimes: rows,
    insights,
    benchmarks,
  };
}

