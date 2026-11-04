import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { runtime, useGame } from './game/store';
import { autopilot } from './game/autopilot';
import { fx } from './game/fx';
import { useTier } from './scene/quality';

// test / debugging hook (used by the Playwright smoke test)
(window as unknown as { __QUANT_RUSH__: unknown }).__QUANT_RUSH__ = { runtime, useGame, autopilot, fx, tier: useTier };

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
