import { create } from 'zustand';
import type { LaneId, RegimeId } from '../sim/config';
import { LANES } from '../sim/config';
import { randomSeed } from '../sim/rng';
import { computeScore, riskGrade, riskStats, type Grade, type RiskStats, type ScoreBreakdown } from '../sim/scoring';
import { buildReview, type Review } from '../sim/analysis';
import type { TimelinePoint } from '../sim/engine';
import { audio } from './audio';
import { fx } from './fx';
import { input } from './input';
import { GameSession, type EndReason, type FxEvent } from './session';
import { DISTRICTS, LANE_COLORS, REGIME_STYLE } from './content';
import { loadRecords, loadSettings, saveRecords, saveSettings, type Records, type Settings } from './storage';

export type Phase = 'title' | 'countdown' | 'playing' | 'paused' | 'ending' | 'results' | 'learning';

export type Hud = {
  pnl: number;
  score: number;
  time: number;
  regime: RegimeId;
  inventory: number;
  limit: number;
  var95: number;
  hedgeCooldown: number;
  hedgeReady: boolean;
  hedgeCost: number;
  combo: number;
  mult: number;
  gauge: number;
  alpha: number;
  alphaReady: boolean;
  stability: number;
  maxStability: number;
  speed: number;
  district: number;
  progress: number;
  lap: number;
  lane: LaneId;
  gateDist: number;
  offline: boolean;
  mid: number;
};

export type Popup = { id: number; text: string; sub?: string; color: string; size: 'sm' | 'md' | 'lg' | 'xl'; x: number; y: number };
export type News = { id: number; text: string; regime: RegimeId };

export type Result = {
  seed: number;
  vehicle: string;
  endReason: EndReason;
  score: ScoreBreakdown;
  grade: Grade;
  risk: RiskStats;
  distance: number;
  maxSpeed: number;
  maxCombo: number;
  nearMisses: number;
  smashes: number;
  collisions: number;
  gatesPassed: number;
  gatesFailed: number;
  districtsCleared: number;
  goal: boolean;
  lap: number;
  timeline: TimelinePoint[];
  segments: { regime: RegimeId; start: number; end: number }[];
  newBest: boolean;
  review: Review | null;
};

/** mutable, non-reactive runtime handles */
export const runtime: { session: GameSession | null; demo: GameSession | null } = { session: null, demo: null };

type Store = {
  phase: Phase;
  settings: Settings;
  records: Records;
  hud: Hud | null;
  popups: Popup[];
  news: News | null;
  countdown: number;
  result: Result | null;
  laneFlash: number;
  setSettings: (p: Partial<Settings>) => void;
  start: (seed?: number) => void;
  beginPlay: () => void;
  pause: () => void;
  resume: () => void;
  togglePause: () => void;
  toTitle: () => void;
  finishRun: () => void;
  openLearning: () => void;
  closeLearning: () => void;
  cycleCamera: () => void;
  updateHud: () => void;
  popup: (p: Omit<Popup, 'id' | 'x' | 'y'> & { x?: number; y?: number }) => void;
};

let popupId = 0;
let newsId = 0;

export const useGame = create<Store>((set, get) => ({
  phase: 'title',
  settings: loadSettings(),
  records: loadRecords(),
  hud: null,
  popups: [],
  news: null,
  countdown: 3,
  result: null,
  laneFlash: 0,

  setSettings(p) {
    const settings = { ...get().settings, ...p };
    saveSettings(settings);
    audio.setSfx(settings.sfx);
    audio.setMusic(settings.music);
    set({ settings });
  },

  start(seed) {
    audio.unlock();
    const s = get().settings;
    const sd = seed ?? s.fixedSeed ?? randomSeed();
    runtime.session = new GameSession(sd, s.vehicle);
    fx.reset();
    input.clear();
    set({ phase: 'countdown', countdown: 3, result: null, popups: [], news: null });
    get().updateHud();
    audio.regime = 'CALM';
    audio.intensity = 0;
    audio.startMusic();
  },

  beginPlay() {
    set({ phase: 'playing' });
  },

  pause() {
    if (get().phase === 'playing') {
      set({ phase: 'paused' });
      audio.stopMusic();
    }
  },
  resume() {
    if (get().phase === 'paused') {
      input.clear();
      set({ phase: 'playing' });
      audio.startMusic();
    }
  },
  togglePause() {
    const p = get().phase;
    if (p === 'playing') get().pause();
    else if (p === 'paused') get().resume();
  },

  toTitle() {
    runtime.session = null;
    audio.stopMusic();
    fx.reset();
    set({ phase: 'title', hud: null, result: null, popups: [], news: null });
  },

  finishRun() {
    const s = runtime.session;
    if (!s) return;
    const e = s.engine;
    const risk = riskStats(e);
    const score = computeScore(risk, s.tradingPoints, s.actionPoints + s.distancePoints);
    const rec = { ...get().records };
    const newBest = score.total > rec.bestScore;
    rec.bestScore = Math.max(rec.bestScore, score.total);
    rec.bestPnL = Math.max(rec.bestPnL, risk.pnl);
    rec.maxSpeed = Math.max(rec.maxSpeed, s.maxSpeed * 3.6);
    rec.maxCombo = Math.max(rec.maxCombo, s.maxCombo);
    rec.bestDistance = Math.max(rec.bestDistance, s.z);
    rec.plays++;
    saveRecords(rec);
    const dt = e.cfg.dt;
    const result: Result = {
      seed: s.seed,
      vehicle: s.vehicle.name,
      endReason: s.endReason ?? 'TIME',
      score,
      grade: riskGrade(risk),
      risk,
      distance: s.z,
      maxSpeed: s.maxSpeed * 3.6,
      maxCombo: s.maxCombo,
      nearMisses: s.nearMisses,
      smashes: s.smashes,
      collisions: s.collisions,
      gatesPassed: s.gatesPassed,
      gatesFailed: s.gatesFailed,
      districtsCleared: s.district,
      goal: s.goalReached,
      lap: s.lap,
      timeline: e.timeline,
      segments: e.tape.segments.filter((g) => g.startTick < e.tick).map((g) => ({ regime: g.regime, start: g.startTick * dt, end: Math.min(g.endTick, e.tick) * dt })),
      newBest,
      review: null,
    };
    audio.stopMusic();
    audio.end();
    set({ phase: 'results', result, records: rec });
  },

  openLearning() {
    const r = get().result;
    const s = runtime.session;
    if (r && s && !r.review) {
      r.review = buildReview(s.engine, { collisions: s.collisions, offlineSeconds: s.offlineTime, alphaDrives: s.alphaCount, gatesPassed: s.gatesPassed, gatesFailed: s.gatesFailed });
    }
    set({ phase: 'learning', result: r ? { ...r } : r });
  },
  closeLearning() {
    set({ phase: 'results' });
  },

  cycleCamera() {
    const order = ['standard', 'dramatic', 'first'] as const;
    const c = get().settings.camera;
    get().setSettings({ camera: order[(order.indexOf(c) + 1) % 3] });
  },

  updateHud() {
    const s = runtime.session;
    if (!s) return;
    const e = s.engine;
    const obs = e.observe();
    const g = s.nextGate;
    const prevLane = get().hud?.lane;
    set({
      laneFlash: prevLane !== undefined && prevLane !== s.quoteLane ? Date.now() : get().laneFlash,
      hud: {
        pnl: e.pnl,
        score: Math.max(0, Math.round(e.pnl * 10 + s.tradingPoints + s.actionPoints + s.distancePoints)),
        time: Math.max(0, s.timeLeft),
        regime: e.regime,
        inventory: e.inventory,
        limit: e.cfg.positionLimit,
        var95: obs.var95,
        hedgeCooldown: obs.hedgeCooldown,
        hedgeReady: obs.hedgeReady,
        hedgeCost: obs.hedgeCostPerShare,
        combo: s.combo,
        mult: s.comboMultiplier,
        gauge: s.gauge,
        alpha: Math.max(0, s.alpha),
        alphaReady: s.alphaReady,
        stability: s.stability,
        maxStability: s.vehicle.stability,
        speed: s.speed * 3.6,
        district: s.district,
        progress: s.districtProgress,
        lap: s.lap,
        lane: s.quoteLane,
        gateDist: g ? Math.max(0, g.z - s.z) : 0,
        offline: s.stumble > 0,
        mid: e.mid,
      },
    });
  },

  popup(p) {
    const id = ++popupId;
    const item: Popup = { x: 50, y: 42, ...p, id };
    set({ popups: [...get().popups.slice(-6), item] });
    window.setTimeout(() => set({ popups: get().popups.filter((q) => q.id !== id) }), 1100);
  },
}));

const money = (v: number) => `${v < 0 ? '−' : '+'}$${Math.abs(v).toFixed(2)}`;

/** Translate simulation events into sound, particles and UI popups. */
export function dispatchEvents(events: FxEvent[]) {
  const st = useGame.getState();
  const s = runtime.session;
  for (const ev of events) {
    switch (ev.type) {
      case 'fill': {
        const f = ev.fill;
        fx.orderOutcome.set(f.orderId, 'fill');
        const tier = f.halfSpread >= 0.1 ? 3 : f.halfSpread >= 0.05 ? 2 : 1;
        audio.fill(s?.combo ?? 0, tier);
        fx.burst({ color: f.qty < 0 ? '#3dff8b' : '#ff3d6e', count: 18 + tier * 8, speed: 6 + tier * 2, y: 1.3 });
        fx.fovKick = Math.min(6, fx.fovKick + 1.2);
        st.popup({ text: money(f.spread + f.rebate), sub: `${f.qty < 0 ? 'SOLD' : 'BOUGHT'} ${Math.abs(f.qty)} @ ${f.price.toFixed(2)}`, color: LANE_COLORS[f.lane], size: tier >= 3 ? 'lg' : 'md', x: 50 + (Math.random() - 0.5) * 16, y: 52 });
        break;
      }
      case 'miss':
        fx.orderOutcome.set(ev.orderId, 'miss');
        break;
      case 'toxic':
        audio.toxic();
        fx.flash = 0.35;
        fx.flashColor = '#ff2a4d';
        st.popup({ text: `TOXIC FLOW ${money(ev.fill.markout ?? 0)}`, sub: '逆選択: 約定後に価格が不利に動いた', color: '#ff2a4d', size: 'md', x: 50, y: 30 });
        break;
      case 'hedge':
        audio.hedge();
        fx.flash = 0.4;
        fx.flashColor = '#00f0ff';
        fx.burst({ color: '#00f0ff', count: 60, speed: 14, life: 0.9 });
        st.popup({ text: `HEDGED ${ev.qty > 0 ? '+' : ''}${ev.qty}`, sub: `cost −$${ev.cost.toFixed(2)}`, color: '#00f0ff', size: 'lg', y: 36 });
        break;
      case 'hedgeRejected':
        audio.denied();
        st.popup({ text: ev.reason === 'FLAT' ? 'NO INVENTORY' : 'HEDGE COOLDOWN', color: '#8892b0', size: 'sm', y: 70 });
        break;
      case 'nearmiss':
        audio.nearMiss();
        fx.fovKick = Math.min(10, fx.fovKick + 5);
        fx.burst({ x: ev.x * 0.5, color: '#ffe23d', count: 20, speed: 10, life: 0.5 });
        st.popup({ text: ev.air ? 'AIR CLEAR!' : 'NEAR MISS!', sub: `+${ev.points}`, color: '#ffe23d', size: 'lg', y: 30 });
        break;
      case 'hit':
        audio.hit();
        fx.shake = 1;
        fx.flash = 0.6;
        fx.flashColor = '#ff2a4d';
        fx.burst({ color: '#ff5a3d', count: 70, speed: 12, life: 1 });
        st.popup({ text: 'CRASH!', sub: 'クォート停止 — 約定できません', color: '#ff2a4d', size: 'xl', y: 34 });
        break;
      case 'smash':
        audio.smash();
        fx.shake = Math.max(fx.shake, 0.4);
        fx.burst({ x: ev.x * 0.3, color: '#ffd23d', count: 50, speed: 16, life: 0.8 });
        st.popup({ text: 'SMASH!', sub: `+${ev.points}`, color: '#ffd23d', size: 'md', y: 32 });
        break;
      case 'jump':
        audio.jump();
        break;
      case 'land':
        audio.land();
        break;
      case 'lane':
        audio.lane();
        break;
      case 'gate': {
        audio.gate(ev.passed);
        fx.flash = 0.5;
        fx.flashColor = ev.passed ? '#3dff8b' : '#ffb03d';
        const d = DISTRICTS[ev.district % DISTRICTS.length];
        st.popup({
          text: ev.passed ? `RISK CHECK PASSED +${ev.bonus}s` : `RISK CHECK FAILED +${ev.bonus}s`,
          sub: ev.passed ? `${d.name} SETTLED · inventory ${ev.inventory}` : `在庫 ${ev.inventory} 株 — 上限 ±500 を超過`,
          color: ev.passed ? '#3dff8b' : '#ffb03d',
          size: 'xl',
          y: 26,
        });
        if (ev.final) window.setTimeout(() => useGame.getState().popup({ text: 'GOAL — SHIBUYA!', sub: 'OVERTIME LAP START', color: '#a6ff00', size: 'xl', y: 40 }), 900);
        break;
      }
      case 'district': {
        const d = DISTRICTS[ev.district % DISTRICTS.length];
        window.setTimeout(() => useGame.getState().popup({ text: `${d.jp} ${d.name}`, sub: ev.lap > 0 ? `OVERTIME LAP ${ev.lap} · ${d.tagline}` : d.tagline, color: d.primary, size: 'lg', y: 20 }), 1300);
        break;
      }
      case 'regime':
        audio.regime = ev.regime;
        audio.intensity = ev.regime === 'CALM' ? 0.1 : ev.regime === 'TRENDING' ? 0.4 : ev.regime === 'VOLATILE' ? 0.7 : 1;
        if (s && s.t > 0.2) audio.regimeChange(ev.regime);
        if (ev.regime === 'CRASH') {
          fx.shake = 0.8;
          fx.flash = 0.7;
          fx.flashColor = '#ff0030';
        }
        if (ev.regime === 'VOLATILE') fx.lightning = 1;
        useGame.setState({ news: { id: ++newsId, text: ev.text, regime: ev.regime } });
        break;
      case 'alpha':
        audio.alpha(ev.on);
        if (ev.on) {
          fx.flash = 0.8;
          fx.flashColor = '#ffd23d';
          fx.fovKick = 14;
          fx.burst({ color: '#ffd23d', count: 120, speed: 18, life: 1.2 });
          st.popup({ text: 'ALPHA DRIVE!', sub: '無敵・超加速・メイカーリベート', color: '#ffd23d', size: 'xl', y: 30 });
        }
        break;
      case 'alphaReady':
        audio.ready();
        st.popup({ text: 'ALPHA READY', sub: 'SHIFT / ↓ / 下スワイプ', color: '#ffd23d', size: 'sm', y: 70 });
        break;
      case 'limit':
        audio.limit();
        break;
      case 'combo':
        audio.combo(ev.combo);
        st.popup({ text: `${ev.combo} COMBO!`, color: '#ff2fd6', size: 'lg', y: 24 });
        break;
      case 'comboBreak':
        audio.comboBreak();
        st.popup({ text: 'COMBO BREAK', sub: ev.reason, color: '#8892b0', size: 'sm', y: 64 });
        break;
      case 'warning':
        break;
      case 'end':
        fx.slowmo = 0.25;
        useGame.setState({ phase: 'ending' });
        window.setTimeout(() => useGame.getState().finishRun(), 1600);
        break;
    }
  }
}

export const laneSpreadLabel = (l: LaneId) => `±${Math.round(LANES[l].halfSpread * 100)}¢`;
export { REGIME_STYLE };
