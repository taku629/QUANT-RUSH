import { useEffect, useState } from 'react';
import { audio } from '../game/audio';
import { DISTRICTS, LANE_COLORS, LANE_NAMES, REGIME_STYLE } from '../game/content';
import { input } from '../game/input';
import { GAME_RULES } from '../game/session';
import { laneSpreadLabel, useGame } from '../game/store';
import type { LaneId } from '../sim/config';

const fmtMoney = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Hud() {
  const hud = useGame((s) => s.hud);
  const popups = useGame((s) => s.popups);
  const phase = useGame((s) => s.phase);
  const pause = useGame((s) => s.pause);
  const cycleCamera = useGame((s) => s.cycleCamera);
  const camera = useGame((s) => s.settings.camera);
  if (!hud) return null;
  const rs = REGIME_STYLE[hud.regime];
  const invFrac = hud.inventory / hud.limit;
  const risk = Math.min(1, Math.abs(invFrac) * (hud.regime === 'CRASH' ? 1.6 : hud.regime === 'VOLATILE' ? 1.3 : 1));
  const gateLimitFrac = GAME_RULES.gateInventoryLimit / hud.limit;
  const d = DISTRICTS[hud.district % DISTRICTS.length];
  const lowTime = hud.time < 10;

  return (
    <div className={`hud ${hud.alpha > 0 ? 'alpha-on' : ''} regime-${hud.regime.toLowerCase()}`}>
      {/* top-left: PnL */}
      <div className="hud-pnl">
        <div className="lbl">PnL</div>
        <div className={`pnl-val ${hud.pnl >= 0 ? 'up' : 'down'}`} data-testid="pnl">{fmtMoney(hud.pnl)}</div>
        <div className="score-line">SCORE <b>{hud.score.toLocaleString()}</b></div>
        <div className="stability">
          {Array.from({ length: hud.maxStability }, (_, i) => (
            <i key={i} className={i < hud.stability ? 'on' : ''} />
          ))}
        </div>
      </div>

      {/* top-center: time & route */}
      <div className="hud-center">
        <div className={`time ${lowTime ? 'low' : ''}`} data-testid="time">{hud.time.toFixed(1)}</div>
        <div className="route">
          {DISTRICTS.map((dd, i) => {
            const idx = hud.district % DISTRICTS.length;
            const state = hud.lap > 0 ? (i < idx ? 'done' : i === idx ? 'cur' : '') : i < hud.district ? 'done' : i === hud.district ? 'cur' : '';
            return (
              <div key={dd.id} className={`stop ${state}`} style={{ ['--dc' as string]: dd.primary }}>
                <i />
                <span>{dd.jp}</span>
                {state === 'cur' && <div className="prog" style={{ width: `${hud.progress * 100}%` }} />}
              </div>
            );
          })}
        </div>
        <div className="district-name" style={{ color: d.primary }}>
          {hud.lap > 0 ? `OVERTIME ${hud.lap} · ` : ''}
          {d.name} <small>GATE {Math.round(hud.gateDist)}m</small>
        </div>
      </div>

      {/* top-right: regime, speed */}
      <div className="hud-right">
        <div className="regime" style={{ ['--rc' as string]: rs.color }} data-testid="regime">
          <span className="dot" />
          <b>{rs.label}</b>
          <small>{rs.jp}</small>
        </div>
        <div className="regime-hint">{rs.hint}</div>
        <div className="speed">
          <b>{hud.speed.toFixed(0)}</b>
          <small>km/h</small>
        </div>
        <div className="hud-tools">
          <button onClick={() => cycleCamera()} title="Camera (C)">{camera === 'first' ? '1P' : camera === 'dramatic' ? 'DRM' : 'STD'}</button>
          <button onClick={() => pause()} title="Pause (P)" data-testid="pause">II</button>
        </div>
      </div>

      {/* combo */}
      {hud.combo > 1 && (
        <div className="combo" key={hud.combo}>
          <b>{hud.combo}</b>
          <span>COMBO</span>
          <small>×{hud.mult.toFixed(2)}</small>
        </div>
      )}

      {/* bottom-left: inventory & risk */}
      <div className="hud-inv">
        <div className="lbl">
          INVENTORY <b className={hud.inventory > 0 ? 'up' : hud.inventory < 0 ? 'down' : ''} data-testid="inventory">{hud.inventory > 0 ? '+' : ''}{hud.inventory}</b>
          <small>/ ±{hud.limit}</small>
        </div>
        <div className="inv-bar">
          <div className="gate-zone" style={{ left: `${50 - gateLimitFrac * 50}%`, width: `${gateLimitFrac * 100}%` }} />
          <div className="mid-line" />
          <div className={`inv-fill ${invFrac >= 0 ? 'long' : 'short'}`} style={invFrac >= 0 ? { left: '50%', width: `${invFrac * 50}%` } : { right: '50%', width: `${-invFrac * 50}%` }} />
        </div>
        <div className="lbl small">
          RISK <span className="var">VaR95 ${hud.var95.toFixed(0)}</span>
        </div>
        <div className="risk-bar">
          <div style={{ width: `${risk * 100}%`, background: risk > 0.75 ? '#ff2a4d' : risk > 0.45 ? '#ffb03d' : '#3dff8b' }} />
        </div>
        {Math.abs(hud.inventory) >= hud.limit && <div className="warn-tag">POSITION LIMIT</div>}
        {Math.abs(hud.inventory) > GAME_RULES.gateInventoryLimit && <div className="warn-tag amber">GATE CHECK ✕ — HEDGE!</div>}
      </div>

      {/* bottom-center: lanes */}
      <div className="hud-lanes">
        {([0, 1, 2] as LaneId[]).map((l) => (
          <div key={l} className={`lane-chip ${hud.lane === l ? 'on' : ''}`} style={{ ['--lc' as string]: LANE_COLORS[l] }}>
            <b>{laneSpreadLabel(l)}</b>
            <span>{LANE_NAMES[l]}</span>
          </div>
        ))}
        {hud.offline && <div className="offline">QUOTES OFFLINE</div>}
      </div>

      {/* bottom-right: actions */}
      <div className="hud-actions">
        <button
          className={`alpha-btn ${hud.alphaReady ? 'ready' : ''} ${hud.alpha > 0 ? 'active' : ''}`}
          onPointerDown={(e) => {
            e.preventDefault();
            input.alpha = true;
          }}
          data-testid="alpha"
        >
          <div className="gauge" style={{ height: `${hud.alpha > 0 ? (hud.alpha / GAME_RULES.alphaDuration) * 100 : hud.gauge}%` }} />
          <b>ALPHA</b>
          <small>{hud.alpha > 0 ? `${hud.alpha.toFixed(1)}s` : hud.alphaReady ? 'READY' : `${Math.floor(hud.gauge)}%`}</small>
        </button>
        <button
          className={`hedge-btn ${hud.hedgeReady && hud.inventory !== 0 ? 'ready' : ''}`}
          onPointerDown={(e) => {
            e.preventDefault();
            audio.unlock();
            input.hedge = true;
          }}
          data-testid="hedge"
        >
          <svg viewBox="0 0 100 100" className="cd-ring">
            <circle cx="50" cy="50" r="44" className="bg" />
            <circle cx="50" cy="50" r="44" className="fg" style={{ strokeDashoffset: `${(hud.hedgeCooldown / 3) * 276}` }} />
          </svg>
          <b>HEDGE</b>
          <small>{hud.hedgeCooldown > 0 ? `${hud.hedgeCooldown.toFixed(1)}s` : `$${hud.hedgeCost.toFixed(2)}/sh`}</small>
          <em className="key">SPACE</em>
        </button>
      </div>

      <NewsBanner />

      <div className="popups">
        {popups.map((p) => (
          <div key={p.id} className={`popup ${p.size}`} style={{ left: `${p.x}%`, top: `${p.y}%`, color: p.color }}>
            <b>{p.text}</b>
            {p.sub && <small>{p.sub}</small>}
          </div>
        ))}
      </div>
      {phase === 'ending' && <EndBanner />}
      {hud.alpha > 0 && <div className="alpha-frame" />}
      {hud.regime === 'CRASH' && <div className="crash-frame" />}
    </div>
  );
}

function NewsBanner() {
  const news = useGame((s) => s.news);
  const [shown, setShown] = useState<typeof news>(null);
  useEffect(() => {
    if (!news) return;
    setShown(news);
    const t = window.setTimeout(() => setShown(null), 3800);
    return () => window.clearTimeout(t);
  }, [news]);
  if (!shown) return null;
  const rs = REGIME_STYLE[shown.regime];
  return (
    <div className="news" key={shown.id} style={{ ['--rc' as string]: rs.color }}>
      <span className="tag">{shown.regime === 'CRASH' ? '⚠ MARKET SHOCK' : 'BREAKING'}</span>
      <span className="txt">{shown.text}</span>
      <span className="reg">
        {rs.label} · {rs.hint}
      </span>
    </div>
  );
}

function EndBanner() {
  return <div className="end-banner">SESSION CLOSED</div>;
}

export function Countdown() {
  const n = useGame((s) => s.countdown);
  if (n > 3 || n < 0) return null;
  return (
    <div className="countdown" key={n}>
      {n === 0 ? 'GO!' : n}
      <small>{n === 3 ? 'OPEN THE BOOK' : n === 2 ? 'QUOTE THE SPREAD' : n === 1 ? 'MANAGE THE RISK' : ''}</small>
    </div>
  );
}

export function PauseMenu() {
  const resume = useGame((s) => s.resume);
  const toTitle = useGame((s) => s.toTitle);
  const start = useGame((s) => s.start);
  const settings = useGame((s) => s.settings);
  const setSettings = useGame((s) => s.setSettings);
  return (
    <div className="modal">
      <div className="modal-box pause">
        <h2>PAUSED</h2>
        <button className="play-btn small" onClick={resume} data-testid="resume">RESUME</button>
        <button className="ghost-btn" onClick={() => start()}>RESTART</button>
        <div className="seg">
          <button className={settings.sfx ? 'on' : ''} onClick={() => setSettings({ sfx: !settings.sfx })}>SFX {settings.sfx ? 'ON' : 'OFF'}</button>
          <button className={settings.music ? 'on' : ''} onClick={() => setSettings({ music: !settings.music })}>BGM {settings.music ? 'ON' : 'OFF'}</button>
          <button className={settings.roll ? 'on' : ''} onClick={() => setSettings({ roll: !settings.roll })}>ROLL {settings.roll ? 'ON' : 'OFF'}</button>
        </div>
        <button className="ghost-btn" onClick={toTitle}>QUIT TO TITLE</button>
      </div>
    </div>
  );
}
