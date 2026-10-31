import { useEffect, useState } from 'react';
import { audio } from '../game/audio';
import { useGame } from '../game/store';
import { DEFAULT_CONFIG } from '../sim/config';
import { Attribution, SessionChart } from './Charts';

const REASON: Record<string, { t: string; jp: string }> = {
  TIME: { t: 'TIME UP', jp: '取引時間終了' },
  KNOCKOUT: { t: 'KNOCKOUT', jp: '転倒 — 耐久ゼロ' },
  STOPPED_OUT: { t: 'STOPPED OUT', jp: '損切りライン到達' },
  MARKET_CLOSE: { t: 'MARKET CLOSE', jp: '大引け' },
};

function useCountUp(target: number, ms = 1200) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

export function Results() {
  const r = useGame((s) => s.result);
  const start = useGame((s) => s.start);
  const toTitle = useGame((s) => s.toTitle);
  const openLearning = useGame((s) => s.openLearning);
  const score = useCountUp(r?.score.total ?? 0);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key.toLowerCase() === 'r') start();
      if (e.key.toLowerCase() === 'l') openLearning();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [start, openLearning]);
  if (!r) return null;
  const reason = REASON[r.endReason];
  const rk = r.risk;
  return (
    <div className="results" data-testid="results">
      <div className="res-head">
        <div className="res-reason">
          {reason.t} <small>{reason.jp}</small>
        </div>
        <div className="res-score">
          <span>SCORE</span>
          <b>{score.toLocaleString()}</b>
          {r.newBest && <em className="new-best">NEW BEST!</em>}
        </div>
        <div className={`grade grade-${r.grade}`}>
          <b>{r.grade}</b>
          <small>RISK GRADE</small>
        </div>
      </div>

      <div className="res-grid">
        <div className="res-card">
          <h3>MARKET MAKING</h3>
          <div className={`big ${rk.pnl >= 0 ? 'up' : 'down'}`}>{rk.pnl >= 0 ? '+' : '−'}${Math.abs(rk.pnl).toFixed(2)}</div>
          <dl>
            <dt>Sharpe (リスク調整後)</dt><dd>{rk.sharpe.toFixed(2)}</dd>
            <dt>最大ドローダウン</dt><dd>−${rk.maxDrawdown.toFixed(0)}</dd>
            <dt>約定 / ヘッジ</dt><dd>{rk.fills} / {rk.hedges}</dd>
            <dt>逆選択コスト</dt><dd>−${Math.abs(rk.adverseSelection).toFixed(0)}</dd>
            <dt>平均在庫</dt><dd>{rk.avgAbsInventory.toFixed(0)} 株</dd>
          </dl>
        </div>
        <div className="res-card">
          <h3>RUN</h3>
          <div className="big">{(r.distance / 1000).toFixed(2)} km</div>
          <dl>
            <dt>到達</dt><dd>{r.goal ? `GOAL 渋谷${r.lap > 0 ? ` +${r.districtsCleared - 5}区` : ''}` : `${r.districtsCleared} / 5 地区`}</dd>
            <dt>最高速度</dt><dd>{r.maxSpeed.toFixed(0)} km/h</dd>
            <dt>最大コンボ</dt><dd>{r.maxCombo}</dd>
            <dt>ニアミス / 破壊</dt><dd>{r.nearMisses} / {r.smashes}</dd>
            <dt>衝突 / ゲート</dt><dd>{r.collisions} / {r.gatesPassed}✓ {r.gatesFailed}✕</dd>
          </dl>
        </div>
        <div className="res-card wide">
          <h3>PnL TIMELINE</h3>
          <SessionChart timeline={r.timeline} segments={r.segments} dt={DEFAULT_CONFIG.dt} />
        </div>
        <div className="res-card wide">
          <h3>PnL ATTRIBUTION</h3>
          <Attribution spread={rk.spreadPnL} rebate={rk.rebatePnL} hedgeCost={rk.hedgeCost} inventory={rk.inventoryPnL} total={rk.pnl} />
          <div className="score-break">
            PnL×10 {r.score.pnlPoints.toLocaleString()} × リスク倍率 {r.score.riskMultiplier.toFixed(2)} ＋ 取引コンボ {r.score.tradingPoints.toLocaleString()} ＋ アクション {r.score.actionPoints.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="res-actions">
        <button className="play-btn" onClick={() => { audio.click(); start(); }} data-testid="retry">RETRY <small>R</small></button>
        <button className="ghost-btn" onClick={() => start(r.seed)}>SAME MARKET (SEED {r.seed})</button>
        <button className="ghost-btn accent" onClick={openLearning} data-testid="learning">LEARNING REPORT <small>L</small></button>
        <button className="ghost-btn" onClick={toTitle}>TITLE</button>
      </div>
    </div>
  );
}
