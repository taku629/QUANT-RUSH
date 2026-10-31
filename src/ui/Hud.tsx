import { memo, useEffect, useState } from 'react';
import { audio } from '../game/audio';
import { DISTRICTS, LANE_COLORS, LANE_NAMES, REGIME_STYLE } from '../game/content';
import { input } from '../game/input';
import { GAME_RULES } from '../game/session';
import { laneSpreadLabel, useGame, type Hud as HudT } from '../game/store';
import { FLOW_READ_INFO } from '../sim/signals';
import type { LaneId } from '../sim/config';
import { useTier } from '../scene/quality';

const fmtMoney = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Hud() {
  const hud = useGame((s) => s.hud);
  const phase = useGame((s) => s.phase);
  if (!hud) return null;
  return (
    <div className={`hud ${hud.alpha > 0 ? 'alpha-on' : ''} regime-${hud.regime.toLowerCase()}`}>
      <TopLeft hud={hud} />
      <TopCenter hud={hud} />
      <TopRight hud={hud} />
      <Tape hud={hud} />
      {hud.combo > 1 && (
        <div className="combo" key={hud.combo}>
          <b>{hud.combo}</b>
          <span>COMBO</span>
          <small>×{hud.mult.toFixed(2)}</small>
        </div>
      )}
      <Inventory hud={hud} />
      <Lanes lane={hud.lane} offline={hud.offline} fork={hud.fork} />
      <Actions hud={hud} />
      <NewsBanner />
      <Popups />
      <TutorialCard />
      <TipToast />
      <FpsCounter />
      {phase === 'ending' && <div className="end-banner">SESSION CLOSED</div>}
      {hud.alpha > 0 && <div className="alpha-frame" />}
      {hud.regime === 'CRASH' && <div className="crash-frame" />}
    </div>
  );
}

const TopLeft = memo(function TopLeft({ hud }: { hud: HudT }) {
  return (
    <div className="hud-pnl">
      <div className="lbl">PnL</div>
      <div className={`pnl-val ${hud.pnl >= 0 ? 'up' : 'down'}`} data-testid="pnl">{fmtMoney(hud.pnl)}</div>
      <div className="score-line">SCORE <b>{hud.score.toLocaleString()}</b></div>
      <div className="stability" title="耐久（0で転倒＝KNOCKOUT）">
        {Array.from({ length: hud.maxStability }, (_, i) => (
          <i key={i} className={i < hud.stability ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
});

function TopCenter({ hud }: { hud: HudT }) {
  const d = DISTRICTS[hud.district % DISTRICTS.length];
  const tut = useGame((s) => s.tutorial);
  return (
    <div className="hud-center">
      <div className={`time ${hud.time < 10 ? 'low' : ''} ${tut ? 'frozen' : ''}`} data-testid="time">{hud.time.toFixed(1)}</div>
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
        {hud.ghostAhead !== null && <small className="ghost-tag">GHOST {hud.ghostAhead >= 0 ? '+' : ''}{Math.round(hud.ghostAhead)}m</small>}
      </div>
    </div>
  );
}

function TopRight({ hud }: { hud: HudT }) {
  const pause = useGame((s) => s.pause);
  const cycleCamera = useGame((s) => s.cycleCamera);
  const camera = useGame((s) => s.settings.camera);
  const rs = REGIME_STYLE[hud.regime];
  return (
    <div className="hud-right">
      <div className="regime" style={{ ['--rc' as string]: rs.color }} data-testid="regime">
        <span className="dot" />
        <b>{rs.label}</b>
        <small>{rs.jp}</small>
      </div>
      <div className={`speed ${hud.boost ? 'boost' : ''}`}>
        <b>{hud.speed.toFixed(0)}</b>
        <small>km/h</small>
      </div>
      <div className="hud-tools">
        <button onClick={() => cycleCamera()} title="Camera (C)">{camera === 'first' ? '1P' : camera === 'dramatic' ? 'DRM' : 'STD'}</button>
        <button onClick={() => pause()} title="Pause (P)" data-testid="pause">II</button>
      </div>
    </div>
  );
}

/** Public tape read: what a market maker can actually observe right now. */
function Tape({ hud }: { hud: HudT }) {
  const info = FLOW_READ_INFO[hud.read];
  const f = Math.max(-1, Math.min(1, hud.flow));
  const mom = hud.momentum;
  const volK = Math.min(1, hud.vol / 0.12);
  return (
    <div className={`tape read-${hud.read.toLowerCase()}`} data-testid="tape">
      <div className="tape-row">
        <span className="k">FLOW</span>
        <div className="flow-bar" title="見えている注文と直近2秒の約定の売り/買いの偏り">
          <i className="sell">SELL</i>
          <div className="mid" />
          <div className="fill" style={f >= 0 ? { left: '50%', width: `${f * 50}%`, background: '#3dff8b' } : { right: '50%', width: `${-f * 50}%`, background: '#ff3d6e' }} />
          <i className="buy">BUY</i>
        </div>
      </div>
      <div className="tape-row">
        <span className="k">MOM</span>
        <b className={mom > 0.004 ? 'up' : mom < -0.004 ? 'down' : ''}>{mom > 0.004 ? '▲' : mom < -0.004 ? '▼' : '■'} {(mom * 100).toFixed(1)}¢/s</b>
        <span className="k">VOL</span>
        <div className="vol-bar" title="直近2秒の実現ボラティリティ">
          <div style={{ width: `${volK * 100}%` }} />
        </div>
      </div>
      <div className="tape-read">
        <b>{info.jp}</b>
        <small>{info.advice}</small>
      </div>
      {hud.news && <div className="tape-news">NEWS: {hud.news}</div>}
    </div>
  );
}

function Inventory({ hud }: { hud: HudT }) {
  const invFrac = hud.inventory / hud.limit;
  const risk = Math.min(1, hud.var95 / 160);
  const gateLimitFrac = GAME_RULES.gateInventoryLimit / hud.limit;
  return (
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
      <div className="lbl small" title="1秒VaR95：現在の在庫と直近の実現ボラから見た、1秒間の損失の95%上限の目安">
        RISK <span className="var">1s VaR95 ${hud.var95.toFixed(0)}</span>
      </div>
      <div className="risk-bar">
        <div style={{ width: `${risk * 100}%`, background: risk > 0.7 ? '#ff2a4d' : risk > 0.4 ? '#ffb03d' : '#3dff8b' }} />
      </div>
      {Math.abs(hud.inventory) >= hud.limit && <div className="warn-tag">POSITION LIMIT</div>}
      {Math.abs(hud.inventory) > GAME_RULES.gateInventoryLimit && <div className="warn-tag amber">GATE ✕ — HEDGE</div>}
    </div>
  );
}

const Lanes = memo(function Lanes({ lane, offline, fork }: { lane: LaneId; offline: boolean; fork: boolean }) {
  return (
    <div className="hud-lanes">
      {([0, 1, 2] as LaneId[]).map((l) => (
        <div key={l} className={`lane-chip ${lane === l ? 'on' : ''}`} style={{ ['--lc' as string]: LANE_COLORS[l] }}>
          <b>{laneSpreadLabel(l)}</b>
          <span>{LANE_NAMES[l]}</span>
        </div>
      ))}
      {offline && <div className="offline">QUOTES OFFLINE</div>}
      {fork && !offline && <div className="offline fork">ROUTE LOCKED</div>}
    </div>
  );
});

function Actions({ hud }: { hud: HudT }) {
  return (
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
        <small>{hud.hedgeCooldown > 0 ? `${hud.hedgeCooldown.toFixed(1)}s` : `${(hud.hedgeCost * 100).toFixed(0)}¢/株`}</small>
        <em className="key">SPACE</em>
      </button>
    </div>
  );
}

function Popups() {
  const popups = useGame((s) => s.popups);
  return (
    <div className="popups">
      {popups.map((p) => (
        <div key={p.id} className={`popup ${p.size}`} style={{ left: `${p.x}%`, top: `${p.y}%`, color: p.color }}>
          <b>{p.text}</b>
          {p.sub && <small>{p.sub}</small>}
        </div>
      ))}
    </div>
  );
}

function TutorialCard() {
  const tut = useGame((s) => s.tutorial);
  const skip = useGame((s) => s.skipTutorial);
  if (!tut) return null;
  return (
    <div className="tutorial" key={tut.step} data-testid="tutorial">
      <div className="tut-step">TUTORIAL {tut.step + 1}/{tut.total} · 時間は止まっています</div>
      <b>{tut.title}</b>
      <p>{tut.body}</p>
      <button onClick={skip} data-testid="skip-tutorial">SKIP</button>
    </div>
  );
}

function TipToast() {
  const tip = useGame((s) => s.tip);
  const [shown, setShown] = useState(tip);
  useEffect(() => {
    if (!tip) return;
    setShown(tip);
    const t = window.setTimeout(() => setShown(null), 5200);
    return () => window.clearTimeout(t);
  }, [tip]);
  if (!shown) return null;
  return (
    <div className={`tip ${shown.tone}`} key={shown.key}>
      <b>{shown.title}</b>
      <span>{shown.body}</span>
    </div>
  );
}

function FpsCounter() {
  const show = useGame((s) => s.settings.showFps);
  const fps = useTier((s) => s.fps);
  const tier = useTier((s) => s.tier);
  const q = useGame((s) => s.settings.quality);
  if (!show) return null;
  return <div className="fps">{fps} FPS · {q === 'auto' ? `AUTO:${tier}` : q}</div>;
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

export function Countdown() {
  const n = useGame((s) => s.countdown);
  if (n > 3 || n < 0) return null;
  return (
    <div className="countdown" key={n}>
      {n === 0 ? 'GO!' : n}
      <small>{n === 3 ? 'OPEN THE BOOK' : n === 2 ? 'READ THE TAPE' : n === 1 ? 'MANAGE THE RISK' : ''}</small>
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
          <button className={settings.reduceMotion ? 'on' : ''} onClick={() => setSettings({ reduceMotion: !settings.reduceMotion })}>揺れ・点滅を抑える {settings.reduceMotion ? 'ON' : 'OFF'}</button>
          <button className={settings.tips ? 'on' : ''} onClick={() => setSettings({ tips: !settings.tips })}>TIPS {settings.tips ? 'ON' : 'OFF'}</button>
        </div>
        <button className="ghost-btn" onClick={toTitle}>QUIT TO TITLE</button>
      </div>
    </div>
  );
}
