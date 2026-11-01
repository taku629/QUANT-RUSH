import { useEffect, useState } from 'react';
import { useGame } from '../game/store';
import { dailyInfo, seedHistory } from '../game/ghost';
import { runFullGameBot } from '../game/fullbot';
import { benchmarkStrategies, RandomStrategy, runEpisode } from '../sim/strategies';
import { generateTape } from '../sim/tape';

type Row = { name: string; pnl: number; rar: number; extra?: string; me?: boolean };

/** QUANT LAB: compare strategies on one market seed — finance-only or full game (same running constraints). */
export function QuantLab() {
  const toTitle = useGame((s) => s.toTitle);
  const start = useGame((s) => s.start);
  const lastSeed = useGame((s) => s.result?.seed ?? null);
  const daily = dailyInfo();
  const [seed, setSeed] = useState<number>(lastSeed ?? daily.seed);
  const [seedText, setSeedText] = useState(String(lastSeed ?? daily.seed));
  const [mode, setMode] = useState<'finance' | 'full'>('finance');
  const [secs, setSecs] = useState(90);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setBusy(true);
    setRows(null);
    const id = window.setTimeout(() => {
      const strategies = [...benchmarkStrategies(), new RandomStrategy(seed)];
      let out: Row[];
      if (mode === 'finance') {
        const tape = generateTape(seed);
        out = strategies.map((s) => {
          const r = runEpisode(tape, s, secs).stats;
          return { name: s.name, pnl: r.pnl, rar: r.rar, extra: `${r.fills} fills · ${r.hedges} hedges` };
        });
      } else {
        out = strategies.map((s) => {
          const r = runFullGameBot(seed, s);
          return { name: s.name, pnl: r.pnl, rar: r.rar, extra: `score ${r.score.toLocaleString()} · ${(r.distance / 1000).toFixed(2)}km · ${r.seconds.toFixed(0)}s · 衝突${r.collisions}` };
        });
      }
      const hist = seedHistory(seed);
      if (hist.length) {
        const best = hist.reduce((a, b) => (b.score > a.score ? b : a));
        out.push({ name: 'YOU（実プレイ・走行込み）', pnl: best.pnl, rar: best.rar, extra: `自己ベスト score ${best.score.toLocaleString()} · ${hist.length}回挑戦 · プレイ時間はボットと異なる`, me: true });
      }
      out.sort((a, b) => b.pnl - a.pnl);
      setRows(out);
      setBusy(false);
    }, 30);
    return () => window.clearTimeout(id);
  }, [seed, mode, secs]);

  const maxAbs = Math.max(1, ...(rows ?? []).map((r) => Math.abs(r.pnl)));
  return (
    <div className="learning lab" data-testid="quant-lab">
      <div className="learn-head">
        <h2>QUANT LAB</h2>
        <span>同じ市場シードで戦略を比較（すべてこの端末内で計算・ランキングは保存されません）</span>
      </div>
      <div className="lab-controls">
        <div className="seg">
          <button className={mode === 'finance' ? 'on' : ''} onClick={() => setMode('finance')}>金融戦略のみ</button>
          <button className={mode === 'full' ? 'on' : ''} onClick={() => setMode('full')}>フルゲーム（同じ走行制約）</button>
        </div>
        <label>
          SEED
          <input inputMode="numeric" value={seedText} onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, '').slice(0, 9))} onBlur={() => seedText && setSeed(Number(seedText))} />
        </label>
        <button className="ghost-btn" onClick={() => { setSeed(daily.seed); setSeedText(String(daily.seed)); }}>{daily.label}</button>
        {mode === 'finance' && (
          <div className="seg">
            {[60, 90, 120].map((v) => (
              <button key={v} className={secs === v ? 'on' : ''} onClick={() => setSecs(v)}>{v}s</button>
            ))}
          </div>
        )}
      </div>
      <p className="note lab-note">
        {mode === 'finance'
          ? '【金融戦略のみの比較】ボットは障害物・転倒・時間制限なしで、金融エンジンだけを操作します。人間のプレイとは条件が異なります。'
          : '【フルゲーム比較】ボットも同じコースを自動操縦で走り、衝突でクォート停止・ゲートの時間延長・制限時間の制約を受けます（操舵は共通の自動操縦、戦略は希望レーンとヘッジのみを決定）。'}
      </p>
      {busy && <div className="lab-busy">SIMULATING…</div>}
      {rows && (
        <div className="bench lab-bench">
          {rows.map((b) => (
            <div key={b.name} className={`bench-row ${b.me ? 'me' : ''}`}>
              <span className="n">{b.name}</span>
              <div className="bar">
                <div className="zero" />
                <div className="fill" style={{ width: `${(Math.abs(b.pnl) / maxAbs) * 50}%`, [b.pnl >= 0 ? 'left' : 'right']: '50%', background: b.me ? '#ffd23d' : b.pnl >= 0 ? '#3dff8b' : '#ff3d6e' }} />
              </div>
              <span className={`v ${b.pnl >= 0 ? 'up' : 'down'}`}>{b.pnl >= 0 ? '+' : '−'}${Math.abs(b.pnl).toFixed(0)}</span>
              <span className="s">RAR {b.rar.toFixed(2)}</span>
              <span className="x">{b.extra}</span>
            </div>
          ))}
        </div>
      )}
      <div className="lab-explain">
        <h3>ボット戦略</h3>
        <ul>
          {[...benchmarkStrategies(), new RandomStrategy(1)].map((s) => (
            <li key={s.name}><b>{s.name}</b> — {s.description}</li>
          ))}
        </ul>
        <p className="note">RAR = PnL ÷ (1秒ごとのPnL変化の標準偏差 × √秒数)。ゲーム独自のリスク調整後リターン指標で、年率Sharpe Ratioとは異なります。</p>
      </div>
      <div className="res-actions">
        <button className="play-btn small" onClick={() => start(seed, 'seed')}>このシードでプレイ</button>
        <button className="ghost-btn" onClick={toTitle}>TITLE</button>
      </div>
    </div>
  );
}
