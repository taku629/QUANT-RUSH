import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { audio } from '../game/audio';
import { autopilot } from '../game/autopilot';
import { fx } from '../game/fx';
import { input, NO_INPUT } from '../game/input';
import { FIXED_DT, GameSession } from '../game/session';
import { dispatchEvents, runtime, useGame } from '../game/store';
import { updateEnv } from './env';
import { active } from './active';

/** Runs the fixed-timestep simulation inside the render loop. */
export function Driver() {
  const acc = useRef(0);
  const hudTimer = useRef(0);
  const countdown = useRef(3.6);
  const lastCount = useRef(4);
  const demoFrame = useRef(0);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.1);
    const st = useGame.getState();
    const phase = st.phase;

    if (phase === 'title' || (!runtime.session && phase !== 'countdown')) {
      if (!runtime.demo || runtime.demo.ended || runtime.demo.t > 100) {
        runtime.demo = new GameSession(Math.floor(Math.random() * 1e6), (['board', 'bike', 'pod'] as const)[Math.floor(Math.random() * 3)]);
        runtime.demo.timeLeft = 9999;
        runtime.demo.stability = 999;
      }
      const d = runtime.demo;
      acc.current += delta;
      while (acc.current >= FIXED_DT) {
        d.update(autopilot(d, demoFrame.current++));
        d.drainEvents();
        acc.current -= FIXED_DT;
      }
    }

    if (phase === 'countdown') {
      countdown.current -= Math.min(rawDelta, 0.25);
      const n = Math.ceil(countdown.current - 0.6);
      if (n !== lastCount.current) {
        lastCount.current = n;
        if (n >= 0) audio.countdown(n === 0);
        useGame.setState({ countdown: n });
      }
      if (countdown.current <= 0) {
        countdown.current = 3.6;
        lastCount.current = 4;
        acc.current = 0;
        input.clear();
        st.beginPlay();
      }
    } else {
      countdown.current = 3.6;
      lastCount.current = 4;
    }

    const s = runtime.session;
    if (s && phase === 'playing') {
      // hit-stop: freeze the simulation for a few frames on impacts / near misses
      if (fx.hitstop > 0) fx.hitstop -= rawDelta;
      else acc.current += delta;
      let first = true;
      while (acc.current >= FIXED_DT) {
        s.update(first ? input.consume() : NO_INPUT);
        first = false;
        acc.current -= FIXED_DT;
        runtime.ghostRec?.record(s);
        const ev = s.drainEvents();
        if (ev.length) dispatchEvents(ev);
        if (s.ended) break;
      }
      hudTimer.current += delta;
      if (hudTimer.current > 1 / 15) {
        hudTimer.current = 0;
        st.updateHud();
      }
    } else if (s && phase === 'ending') {
      const ev = s.drainEvents();
      if (ev.length) dispatchEvents(ev);
    }

    const a = active();
    if (a) updateEnv(a.district, a.engine.regime, delta);
    // decay global effects
    fx.shake = Math.max(0, fx.shake - delta * 1.8);
    fx.flash = Math.max(0, fx.flash - delta * 1.6);
    fx.fovKick = Math.max(0, fx.fovKick - delta * 9);
    fx.lightning = Math.max(0, fx.lightning - delta * 2.5);
    fx.landDip = Math.max(0, fx.landDip - delta * 4);
    const flashEl = document.getElementById('flash');
    if (flashEl) {
      flashEl.style.opacity = String(Math.min(0.75, fx.flash) * (st.settings.reduceMotion ? 0.3 : 1));
      flashEl.style.background = `radial-gradient(circle, transparent 30%, ${fx.flashColor})`;
    }
  });
  return null;
}
