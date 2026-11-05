import { useEffect, useRef, useState } from 'react';
import { audio } from '../game/audio';
import { DISTRICTS, REGIME_STYLE } from '../game/content';
import { input } from '../game/input';
import { GAME_RULES } from '../game/session';
import { BALANCE } from '../game/gameBalanceConfig';
import { useGame, type Hud as HudT } from '../game/store';
import { FLOW_READ_INFO } from '../sim/signals';
import { useTier } from '../scene/quality';

const fmtMoney = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * v3 HUD — four things to read, everything else is on the road:
 *  1. top-left   PnL (+ score, combo, durability) with gain / loss ticks
 *  2. top-center district + progress bar with the clock built in (and where the clock runs out)
 *  3. top-right  market badge (regime + one-line read) and pause
 *  4. bottom     RISK gauge with the glow hint / status line above it; HEDGE and ALPHA as thumb buttons
 * PRO HUD (settings) adds the full tape panel and speed for players who read the tape themselves.
 */
export function Hud() {
  const hud = useGame((s) => s.hud);
  const phase = useGame((s) => s.phase);
  const pro = useGame((s) => s.settings.proHud);
  if (!hud) return null;
  return (
    <div className={`hud ${hud.alpha > 0 ? 'alpha-on' : ''} regime-${hud.regime.toLowerCase()}`}>
      <ScoreBox hud={hud} />
      <DistrictBar hud={hud} />
      <MarketBadge hud={hud} pro={pro} />
      {pro && <Tape hud={hud} />}
      <div className="hud-bottom">
        <StatusLine hud={hud} />
        <RiskGauge hud={hud} />
      </div>
      <Actions hud={hud} />
      <NewsBanner />
      <Popups />
      <TutorialCard />
      <TipToast />
      <DistrictCard />
      {phase === 'ending' && <div className="end-banner">SESSION CLOSED</div>}
      {hud.alpha > 0 && <div className="alpha-frame" />}
      {hud.regime === 'CRASH' && <div className="crash-frame" />}
    </div>
  );
}

type Tick = { id: number; v: number };
let tickId = 0;

/** 1. PnL — the number that matters — with small rising +$ / −$ ticks so gains and losses are felt */
function ScoreBox({ hud }: { hud: HudT }) {
  const last = useRef(hud.pnl);
  const acc = useRef(0);
  const lastEmit = useRef(0);
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [flash, setFlash] = useState<'' | 'up' | 'down'>('');
  useEffect(() => {
    const d = hud.pnl - last.current;
    last.current = hud.pnl;
    if (Math.abs(d) > 50) {
      acc.current = 0; // a new run / reset — not a trade
      return;
    }
    acc.current += d;
    const now = performance.now();
    if (Math.abs(acc.current) >= 1 && now - lastEmit.current > 350) {
      const v = acc.current;
      acc.current = 0;
      lastEmit.current = now;
      const t = { id: ++tickId, v };
      setTicks((ts) => [...ts.slice(-2), t]);
      setFlash(v > 0 ? 'up' : 'down');
      window.setTimeout(() => setTicks((ts) => ts.filter((x) => x.id !== t.id)), 900);
      window.setTimeout(() => setFlash(''), 220);
    }
  }, [hud.pnl]);
  return (
    <div className="hud-pnl">
      <div className="lbl">PnL</div>
      <div className={`pnl-val ${hud.pnl >= 0 ? 'up' : 'down'} ${flash ? 'flash-' + flash : ''}`} data-testid="pnl">
        {fmtMoney(hud.pnl)}
        <span className="pnl-ticks">
          {ticks.map((t) => (
            <i key={t.id} className={t.v > 0 ? 'up' : 'down'}>
              {t.v > 0 ? '+' : '−'}${Math.abs(t.v).toFixed(2)}
            </i>
          ))}
        </span>
      </div>
      <div className="score-line">
        SCORE <b>{hud.score.toLocaleString()}</b>
        {hud.combo >= 3 && <em className="combo-chip" key={Math.floor(hud.combo / 5)}>{hud.combo} COMBO ×{hud.mult.toFixed(2)}</em>}
      </div>
      <div className="stability" title="耐久（0で転倒＝KNOCKOUT）">
        {Array.from({ length: hud.maxStability }, (_, i) => (
          <i key={i} className={i < hud.stability ? 'on' : ''} />
        ))}
      </div>
    </div>
  );
}

/** 2. where am I, how far to the gate, and does the clock reach it? */
function DistrictBar({ hud }: { hud: HudT }) {
  const d = DISTRICTS[hud.district % DISTRICTS.length];
  const tut = useGame((s) => s.tutorial);
  const n = (hud.district % DISTRICTS.length) + 1;
  const prog = Math.min(1, hud.progress) * 100;
  const reach = Math.max(prog, Math.min(100, hud.reach * 100));
  const short = !tut && hud.reach < 1;
  return (
    <div className="hud-district" data-testid="district-bar" style={{ ['--dc' as string]: d.primary }}>
      <div className="dist-head">
        <b>{d.jp}</b>
        <span>{hud.lap > 0 ? `OVERTIME ${hud.lap} · ` : ''}{d.name}</span>
        <small>{n}/{DISTRICTS.length}</small>
        {hud.ghostAhead !== null && <small className="ghost-tag">GHOST {hud.ghostAhead >= 0 ? '+' : ''}{Math.round(hud.ghostAhead)}m</small>}
      </div>
      <div className={`dist-bar ${short ? 'short' : ''} ${hud.time < 10 ? 'low' : ''}`}>
        <div className="dist-fill" style={{ width: `${prog}%` }} />
        {short && <div className="dist-out" style={{ left: `${reach}%` }} title="このままの速度だと、ここで時間切れ" />}
        <span className={`dist-time ${tut ? 'frozen' : ''}`} data-testid="time">{hud.time.toFixed(1)}</span>
        <span className="dist-gate">GATE {Math.round(hud.gateDist)}m</span>
      </div>
    </div>
  );
}

/** 3. what kind of market is this — one word, one colour, one line of reading */
function MarketBadge({ hud, pro }: { hud: HudT; pro: boolean }) {
  const pause = useGame((s) => s.pause);
  const rs = REGIME_STYLE[hud.regime];
  return (
    <div className="hud-right">
      <div className="hud-right-row">
        <div className="regime" style={{ ['--rc' as string]: rs.color }} data-testid="regime">
          <span className="dot" />
          <b>{rs.label}</b>
          <small>{rs.jp}</small>
        </div>
        <button className="pause-btn" onClick={() => pause()} title="Pause (P)" data-testid="pause">II</button>
      </div>
      {!pro && <div className={`regime-read read-${hud.read.toLowerCase()}`}>{FLOW_READ_INFO[hud.read].jp}</div>}
      {pro && (
        <div className={`speed ${hud.boost ? 'boost' : ''}`}>
          <b>{hud.speed.toFixed(0)}</b>
          <small>km/h</small>
        </div>
      )}
    </div>
  );
}

/** status above the gauge: one line, never overlapping it (offline > route lock > glow hint) */
function StatusLine({ hud }: { hud: HudT }) {
  let cls = '';
  let text = '';
  if (hud.offline) {
    cls = 'bad';
    text = 'QUOTES OFFLINE — 転倒中は約定できない';
  } else if (hud.fork) {
    cls = 'info';
    text = 'ROUTE LOCKED';
  } else if (hud.lane !== hud.recLane) {
    cls = 'glow';
    text = hud.recLane < hud.lane ? '◀ 光るレーンへ' : '光るレーンへ ▶';
  }
  return <div className={`hud-status ${cls}`} data-testid="hud-status">{text}</div>;
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

/**
 * v3 RISK gauge: one number instead of inventory / VaR panels.
 * Green → amber → red. In the amber "sweet spot" HEDGE pays the biggest settlement bonus; 100 % = forced liquidation.
 */
function RiskGauge({ hud }: { hud: HudT }) {
  const pct = Math.round(hud.risk * 100);
  const warn = hud.risk >= BALANCE.risk.warnAt;
  const gate = GAME_RULES.gateRiskMax * 100;
  const col = hud.risk >= 0.9 ? '#ff2a4d' : warn ? '#ffb03d' : '#3dff8b';
  return (
    <div className={`risk-gauge ${warn ? 'warn' : ''} ${hud.risk >= 0.9 ? 'danger' : ''}`} data-testid="risk">
      <div className="rg-top">
        <span className="rg-label">RISK</span>
        <b style={{ color: col }}>{pct}%</b>
        {hud.overloadLeft !== null ? (
          <em className="rg-call over">OVERLOAD {hud.overloadLeft.toFixed(1)}s</em>
        ) : (
          warn && <em className="rg-call">HEDGE!</em>
        )}
      </div>
      <div className="rg-bar">
        {/* ghost = true exposure right now (gates check this); the solid fill catches up at a capped rate */}
        <div className="rg-ghost" style={{ width: `${Math.max(pct, Math.round(hud.exposure * 100))}%`, background: col }} />
        <div className="rg-fill" style={{ width: `${pct}%`, background: col }} />
        <i className="rg-gate" style={{ left: `${gate}%` }} title="gate check" />
        <i className="rg-sweet" style={{ left: `${BALANCE.risk.warnAt * 100}%`, width: `${100 - BALANCE.risk.warnAt * 100}%` }} />
      </div>
    </div>
  );
}

/** thumb buttons: ALPHA under the left thumb, HEDGE under the right (keys: SHIFT / SPACE) */
function Actions({ hud }: { hud: HudT }) {
  return (
    <>
      <button
        className={`alpha-btn thumb-left ${hud.alphaReady ? 'ready' : ''} ${hud.alpha > 0 ? 'active' : ''}`}
        onPointerDown={(e) => {
          e.preventDefault();
          input.alpha = true;
        }}
        data-testid="alpha"
      >
        <div className="gauge" style={{ height: `${hud.alpha > 0 ? (hud.alpha / GAME_RULES.alphaDuration) * 100 : hud.gauge}%` }} />
        <b>ALPHA</b>
        <small>{hud.alpha > 0 ? `${hud.alpha.toFixed(1)}s` : hud.alphaReady ? 'READY' : `${Math.floor(hud.gauge)}%`}</small>
        <em className="key">SHIFT</em>
      </button>
      <button
        className={`hedge-btn thumb-right ${hud.hedgeReady && hud.inventory !== 0 ? 'ready' : ''} ${hud.risk >= BALANCE.risk.warnAt ? 'call' : ''}`}
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
    </>
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

/** District entry title (non-blocking: top of screen, fades out, no input capture). */
function DistrictCard() {
  const card = useGame((s) => s.districtCard);
  const [shown, setShown] = useState(card);
  useEffect(() => {
    if (!card) return;
    setShown(card);
    const t = window.setTimeout(() => setShown(null), 2600);
    return () => window.clearTimeout(t);
  }, [card]);
  if (!shown) return null;
  const d = DISTRICTS[shown.district % DISTRICTS.length];
  const n = (shown.district % DISTRICTS.length) + 1;
  return (
    <div className="district-card" key={shown.key} style={{ ['--dc' as string]: d.primary }} data-testid="district-card">
      <span className="dc-num">{shown.lap > 0 ? `OVERTIME ${shown.lap} · ` : ''}DISTRICT {n}/5</span>
      <b className="dc-jp">{d.jp}</b>
      <span className="dc-en">{d.name}</span>
      <span className="dc-tag">{d.tagline}</span>
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

/** Dev FPS counter — writes straight to the DOM (no React re-render). */
export function FpsCounter() {
  const show = useGame((s) => s.settings.showFps);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!show) return;
    const paint = () => {
      const t = useTier.getState();
      const q = useGame.getState().settings.quality;
      if (ref.current) {
        ref.current.textContent = `${t.fps} FPS · ${t.calls} draws · ${Math.round(t.tris / 1000)}k tris · ${q === 'auto' ? `AUTO:${t.tier}` : q}`;
        ref.current.className = `fps ${t.fps >= 55 ? 'ok' : t.fps >= 30 ? 'mid' : 'bad'}`;
      }
    };
    paint();
    return useTier.subscribe(paint);
  }, [show]);
  if (!show) return null;
  return <div ref={ref} className="fps" data-testid="fps" />;
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
    <div className="countdown">
      <span className="cd-n" key={n}>{n === 0 ? 'GO!' : n}</span>
      {/* three beats = the whole game, readable in the 3.6 s countdown */}
      <small>{n === 3 ? '① 光るレーンを走る' : n === 2 ? '② 約定とコインで稼ぐ' : n === 1 ? '③ RISK が溜まったら HEDGE' : ''}</small>
    </div>
  );
}

export function PauseMenu() {
  const resume = useGame((s) => s.resume);
  const toTitle = useGame((s) => s.toTitle);
  const start = useGame((s) => s.start);
  const settings = useGame((s) => s.settings);
  const setSettings = useGame((s) => s.setSettings);
  const cycleCamera = useGame((s) => s.cycleCamera);
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
          <button onClick={() => cycleCamera()}>CAMERA: {settings.camera === 'first' ? '1P' : settings.camera === 'dramatic' ? 'DRAMATIC' : 'STD'} (C)</button>
          <button className={settings.proHud ? 'on' : ''} onClick={() => setSettings({ proHud: !settings.proHud })}>PRO HUD {settings.proHud ? 'ON' : 'OFF'}</button>
        </div>
        <button className="ghost-btn" onClick={toTitle}>QUIT TO TITLE</button>
      </div>
    </div>
  );
}
