import type { TimelinePoint } from '../sim/engine';
import type { RegimeId } from '../sim/config';
import { LANE_COLORS, REGIME_STYLE } from '../game/content';

type Seg = { regime: RegimeId; start: number; end: number };

/** PnL / price / inventory over time with regime bands (SVG, no chart library). */
export function SessionChart({ timeline, segments, dt, height = 170, mode = 'pnl' }: { timeline: TimelinePoint[]; segments: Seg[]; dt: number; height?: number; mode?: 'pnl' | 'inventory' }) {
  const W = 600;
  const H = height;
  if (timeline.length < 2) return null;
  const T = timeline[timeline.length - 1].tick * dt || 1;
  const vals = timeline.map((p) => (mode === 'pnl' ? p.pnl : p.inventory));
  let lo = Math.min(0, ...vals);
  let hi = Math.max(0, ...vals);
  if (hi - lo < 1) {
    hi += 1;
    lo -= 1;
  }
  const pad = (hi - lo) * 0.1;
  lo -= pad;
  hi += pad;
  const x = (t: number) => (t / T) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const path = timeline.map((p, i) => `${i ? 'L' : 'M'}${x(p.tick * dt).toFixed(1)},${y(mode === 'pnl' ? p.pnl : p.inventory).toFixed(1)}`).join('');
  const area = `${path}L${x(timeline[timeline.length - 1].tick * dt)},${y(0)}L0,${y(0)}Z`;
  const last = vals[vals.length - 1];
  const col = mode === 'pnl' ? (last >= 0 ? '#3dff8b' : '#ff3d6e') : '#00f0ff';
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} className="chart" preserveAspectRatio="none">
      {segments.map((s, i) => (
        <g key={i}>
          <rect x={x(s.start)} y={0} width={Math.max(0, x(s.end) - x(s.start))} height={H} fill={REGIME_STYLE[s.regime].color} opacity={s.regime === 'CRASH' ? 0.2 : 0.08} />
          {x(s.end) - x(s.start) > 40 && (
            <text x={x(s.start) + 4} y={H + 13} fill={REGIME_STYLE[s.regime].color} fontSize="10" fontFamily="Rajdhani, sans-serif">
              {s.regime}
            </text>
          )}
        </g>
      ))}
      {/* lane used along time */}
      {timeline.slice(1).map((p, i) => (
        <rect key={i} x={x(timeline[i].tick * dt)} y={H - 3} width={Math.max(0.5, x(p.tick * dt) - x(timeline[i].tick * dt))} height={3} fill={LANE_COLORS[timeline[i].lane]} />
      ))}
      <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />
      <path d={area} fill={col} opacity={0.12} />
      <path d={path} fill="none" stroke={col} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Horizontal waterfall-ish bars for PnL attribution. */
export function Attribution({ spread, rebate, hedgeCost, inventory, total }: { spread: number; rebate: number; hedgeCost: number; inventory: number; total: number }) {
  const rows = [
    { k: 'スプレッド収益', v: spread, c: '#3dff8b', help: 'Spread captured' },
    { k: 'メイカーリベート', v: rebate, c: '#ffd23d', help: 'Maker rebate' },
    { k: 'ヘッジコスト', v: -hedgeCost, c: '#00f0ff', help: 'Hedging cost' },
    { k: '在庫損益', v: inventory, c: inventory >= 0 ? '#3dff8b' : '#ff3d6e', help: 'Inventory PnL (mark-to-market)' },
  ];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.v)), Math.abs(total));
  return (
    <div className="attrib">
      {rows.map((r) => (
        <div className="attrib-row" key={r.k} title={r.help}>
          <span className="k">{r.k}</span>
          <div className="bar">
            <div className="zero" />
            <div className="fill" style={{ background: r.c, width: `${(Math.abs(r.v) / max) * 50}%`, [r.v >= 0 ? 'left' : 'right']: '50%' }} />
          </div>
          <span className={`v ${r.v >= 0 ? 'up' : 'down'}`}>{r.v >= 0 ? '+' : '−'}${Math.abs(r.v).toFixed(0)}</span>
        </div>
      ))}
      <div className="attrib-row total">
        <span className="k">合計 PnL</span>
        <div className="bar">
          <div className="zero" />
          <div className="fill" style={{ background: total >= 0 ? '#3dff8b' : '#ff3d6e', width: `${(Math.abs(total) / max) * 50}%`, [total >= 0 ? 'left' : 'right']: '50%' }} />
        </div>
        <span className={`v ${total >= 0 ? 'up' : 'down'}`}>{total >= 0 ? '+' : '−'}${Math.abs(total).toFixed(0)}</span>
      </div>
      <p className="attrib-note">PnL = 現金 + 在庫 × 仲値 − 初期資産。内訳は説明用で、二重計上はありません。</p>
    </div>
  );
}
