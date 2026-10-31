import { useGame } from '../game/store';
import { LANE_COLORS, REGIME_STYLE } from '../game/content';
import { DEFAULT_CONFIG } from '../sim/config';
import { SessionChart } from './Charts';
import { useState } from 'react';
import { FLOW_READ_INFO } from '../sim/signals';
import type { KeyMoment } from '../sim/moments';

const KIND_COLOR: Record<KeyMoment['kind'], string> = { DRAWDOWN: '#ff3d6e', BEST: '#3dff8b', CRASH: '#ff2a4d', TOXIC_BURST: '#ffb03d' };
const LANE_N = ['AGG', 'BAL', 'DEF'];

function Moments({ moments, r }: { moments: KeyMoment[]; r: NonNullable<ReturnType<typeof useGame.getState>['result']> }) {
  const [sel, setSel] = useState(0);
  if (!moments.length) return <p className="note">大きな損益の変化はありませんでした。</p>;
  const m = moments[Math.min(sel, moments.length - 1)];
  const maxAbs = Math.max(1, ...m.alternatives.map((a) => Math.abs(a.delta)));
  return (
    <div className="moments" data-testid="moments">
      <SessionChart timeline={r.timeline} segments={r.segments} dt={DEFAULT_CONFIG.dt} height={130} markers={moments.map((x, i) => ({ t: x.time, label: String(i + 1), color: KIND_COLOR[x.kind] }))} onMarker={setSel} selected={sel} />
      <div className="moment-tabs">
        {moments.map((x, i) => (
          <button key={i} className={i === sel ? 'on' : ''} style={{ borderColor: KIND_COLOR[x.kind] }} onClick={() => setSel(i)}>
            {i + 1}. {x.time.toFixed(0)}s
          </button>
        ))}
      </div>
      <div className="moment-card">
        <div className="mc-head" style={{ color: KIND_COLOR[m.kind] }}>
          {m.time.toFixed(1)}s — {m.title} <span className={m.pnlChange >= 0 ? 'up' : 'down'}>{m.pnlChange >= 0 ? '+' : '−'}${Math.abs(m.pnlChange).toFixed(0)}（{m.windowSec.toFixed(0)}秒間）</span>
        </div>
        <div className="mc-context">
          <span>その時に見えていた情報:</span>
          <i>{m.context.regime}</i>
          <i>FLOW {FLOW_READ_INFO[m.context.read].jp}（偏り {(m.context.imbalance * 100).toFixed(0)}%）</i>
          <i>値動き {m.context.momentum1s >= 0 ? '▲' : '▼'}{Math.abs(m.context.momentum1s * 100).toFixed(1)}¢/s</i>
          <i>在庫 {m.context.inventory > 0 ? '+' : ''}{m.context.inventory}</i>
          <i>レーン {LANE_N[m.context.lane]}</i>
          {m.context.news && <i>NEWS: {m.context.news}</i>}
        </div>
        <div className="mc-alts">
          <span>同じ市場で、この判断だけ変えて再シミュレーションすると:</span>
          {m.alternatives.map((a) => (
            <div key={a.label} className="bench-row">
              <span className="n">{a.label}</span>
              <div className="bar">
                <div className="zero" />
                <div className="fill" style={{ width: `${(Math.abs(a.delta) / maxAbs) * 50}%`, [a.delta >= 0 ? 'left' : 'right']: '50%', background: a.delta >= 0 ? '#3dff8b' : '#ff3d6e' }} />
              </div>
              <span className={`v ${a.delta >= 0 ? 'up' : 'down'}`}>{a.delta >= 0 ? '+' : '−'}${Math.abs(a.delta).toFixed(0)}</span>
            </div>
          ))}
        </div>
        <b className="mc-lesson">{m.lesson}</b>
        <p className="note">市場はあなたの行動に左右されないため、同じシードで判断だけを差し替えた正確な比較です（走行・衝突は考慮しない金融上の比較）。</p>
      </div>
    </div>
  );
}

const TONE = { good: '✓', warn: '!', bad: '✕', info: 'i' } as const;

export function Learning() {
  const r = useGame((s) => s.result);
  const close = useGame((s) => s.closeLearning);
  const start = useGame((s) => s.start);
  if (!r || !r.review) return null;
  const rv = r.review;
  const me = r.risk.pnl;
  const all = [...rv.benchmarks.map((b) => ({ name: b.name, pnl: b.pnl, rar: b.rar, me: false })), { name: 'YOU', pnl: me, rar: r.risk.rar, me: true }].sort((a, b) => b.pnl - a.pnl);
  const maxAbs = Math.max(1, ...all.map((a) => Math.abs(a.pnl)));
  return (
    <div className="learning" data-testid="learning-report">
      <div className="learn-head">
        <h2>LEARNING REPORT</h2>
        <span>SEED {r.seed} · 実際のシミュレーション記録に基づく振り返り</span>
      </div>
      <div className="learn-grid">
        <div className="learn-col">
          <h3>あなたの判断を振り返る</h3>
          {rv.insights.map((ins, i) => (
            <div key={i} className={`insight ${ins.tone}`}>
              <div className="ins-icon">{TONE[ins.tone]}</div>
              <div>
                <div className="ins-concept">{ins.concept}</div>
                <b>{ins.title}</b>
                <p>{ins.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="learn-col">
          <h3>タイムライン — この瞬間、どうすべきだったか</h3>
          <Moments moments={rv.moments} r={r} />
          <h3>レジーム別の成績</h3>
          <table className="regime-table">
            <thead>
              <tr><th>REGIME</th><th>時間</th><th>レーン配分</th><th>約定</th><th>スプレッド</th><th>マークアウト</th><th>在庫損益</th></tr>
            </thead>
            <tbody>
              {rv.regimes.map((g) => (
                <tr key={g.regime}>
                  <td style={{ color: REGIME_STYLE[g.regime].color }}>{g.regime}</td>
                  <td>{g.seconds.toFixed(0)}s</td>
                  <td>
                    <div className="lane-mix">
                      {g.laneSeconds.map((s, i) => (
                        <i key={i} style={{ width: `${(s / g.seconds) * 100}%`, background: LANE_COLORS[i] }} />
                      ))}
                    </div>
                  </td>
                  <td>{g.fills}</td>
                  <td className="up">+${g.spread.toFixed(0)}</td>
                  <td className={g.markout >= 0 ? 'up' : 'down'}>{g.markout >= 0 ? '+' : '−'}${Math.abs(g.markout).toFixed(0)}</td>
                  <td className={g.inventoryPnL >= 0 ? 'up' : 'down'}>{g.inventoryPnL >= 0 ? '+' : '−'}${Math.abs(g.inventoryPnL).toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="note">マークアウト = 約定2秒後の仲値で評価した取引の価値（スプレッド込み）。マイナスは逆選択を受けたことを意味します。レーン配分: <span style={{ color: LANE_COLORS[0] }}>■AGG</span> <span style={{ color: LANE_COLORS[1] }}>■BAL</span> <span style={{ color: LANE_COLORS[2] }}>■DEF</span></p>

          <h3>在庫の推移</h3>
          <SessionChart timeline={r.timeline} segments={r.segments} dt={DEFAULT_CONFIG.dt} mode="inventory" height={120} />

          <h3>QUANT LAB — 同じ市場でボットと比較（金融戦略のみ）</h3>
          <div className="bench">
            {all.map((b) => (
              <div key={b.name} className={`bench-row ${b.me ? 'me' : ''}`}>
                <span className="n">{b.name}</span>
                <div className="bar">
                  <div className="zero" />
                  <div className="fill" style={{ width: `${(Math.abs(b.pnl) / maxAbs) * 50}%`, [b.pnl >= 0 ? 'left' : 'right']: '50%', background: b.me ? '#ffd23d' : b.pnl >= 0 ? '#3dff8b' : '#ff3d6e' }} />
                </div>
                <span className={`v ${b.pnl >= 0 ? 'up' : 'down'}`}>{b.pnl >= 0 ? '+' : '−'}${Math.abs(b.pnl).toFixed(0)}</span>
                <span className="s">RAR {b.rar.toFixed(2)}</span>
              </div>
            ))}
          </div>
          <p className="note">ボットはアクション（衝突・ALPHA DRIVE）なしで、同じシード・同じ時間だけ取引した結果です。</p>
        </div>
      </div>
      <div className="res-actions">
        <button className="ghost-btn" onClick={close}>BACK</button>
        <button className="play-btn small" onClick={() => start(r.seed, r.mode === 'daily' ? 'daily' : 'seed')}>RETRY SAME MARKET</button>
        <button className="ghost-btn" onClick={() => start()}>NEW MARKET</button>
      </div>
    </div>
  );
}
