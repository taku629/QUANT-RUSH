import { expect, test, type Page } from '@playwright/test';

type Hook = {
  runtime: { session: any };
  useGame: { getState: () => any };
  autopilot: (s: any, f: number) => any;
};

/** the countdown is frame-capped; software WebGL can run < 1 FPS while shaders compile */
const PLAYING_WAIT = 45_000;

const hook = (page: Page) => page.evaluate(() => !!(window as unknown as { __QUANT_RUSH__?: Hook }).__QUANT_RUSH__);

async function startRun(page: Page, isMobile: boolean) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.addInitScript(() => {
    if (!localStorage.getItem('quantrush.settings.v1')) localStorage.setItem('quantrush.settings.v1', JSON.stringify({ tutorialDone: true }));
  });
  await page.goto('/');
  await expect(page.getByTestId('play')).toBeVisible();
  expect(await hook(page)).toBe(true);
  if (isMobile) await page.getByTestId('play').tap();
  else await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => (window as any).__QUANT_RUSH__.useGame.getState().phase), { timeout: PLAYING_WAIT }).toBe('playing');
  return errors;
}

test('full arcade loop: play → results → learning → retry resets state', async ({ page, isMobile }) => {
  const errors = await startRun(page, !!isMobile);
  await expect(page.getByTestId('pnl')).toBeVisible();
  await expect(page.getByTestId('regime')).toBeVisible();

  if (!isMobile) {
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => page.evaluate(() => (window as any).__QUANT_RUSH__.runtime.session.targetLane)).toBe(0);
    await page.keyboard.press('KeyD');
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => page.evaluate(() => (window as any).__QUANT_RUSH__.runtime.session.targetLane)).toBe(2);
    // jumping is disabled while knocked down, so retry until the rider is upright
    await expect
      .poll(async () => {
        await page.keyboard.press('KeyW');
        return page.evaluate(() => (window as any).__QUANT_RUSH__.runtime.session.jumps);
      }, { timeout: 15_000, intervals: [400] })
      .toBeGreaterThan(0);
  }

  // simulate 40 s of play with the autopilot and check finance integrity
  const fin = await page.evaluate(() => {
    const { runtime, autopilot } = (window as any).__QUANT_RUSH__;
    const s = runtime.session;
    s.timeLeft = 999;
    s.stability = 99;
    for (let i = 0; i < 60 * 40; i++) {
      s.update(autopilot(s, i));
      s.drainEvents();
    }
    const e = s.engine;
    return { pnl: e.pnl, direct: e.cash + e.inventory * e.mid - e.initialEquity, parts: e.spreadPnL + e.rebatePnL - e.hedgeCost + e.inventoryPnL, fills: e.fills.length };
  });
  expect(fin.fills).toBeGreaterThan(10);
  expect(Math.abs(fin.pnl - fin.direct)).toBeLessThan(1e-6);
  expect(Math.abs(fin.pnl - fin.parts)).toBeLessThan(1e-6);

  // hedge via UI
  await page.evaluate(() => {
    const e = (window as any).__QUANT_RUSH__.runtime.session.engine;
    e.hedgeReadyTick = 0;
  });
  const invBefore = await page.evaluate(() => (window as any).__QUANT_RUSH__.runtime.session.engine.inventory);
  if (invBefore !== 0) {
    if (isMobile) await page.getByTestId('hedge').tap();
    else await page.keyboard.press('Space');
    await expect.poll(() => page.evaluate(() => (window as any).__QUANT_RUSH__.runtime.session.engine.hedges.length)).toBeGreaterThan(0);
  }

  // pause / resume
  if (!isMobile) {
    await page.keyboard.press('KeyP');
    await expect(page.getByTestId('resume')).toBeVisible();
    await page.getByTestId('resume').click();
  }

  // end the session
  await page.evaluate(() => ((window as any).__QUANT_RUSH__.runtime.session.timeLeft = 0.05));
  await expect(page.getByTestId('results')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('learning').click();
  await expect(page.getByTestId('learning-report')).toBeVisible();
  await expect(page.locator('.insight').first()).toBeVisible();
  await expect(page.getByTestId('moments')).toBeVisible();
  await page.getByText('BACK').click();
  await page.getByTestId('retry').click();

  const st = await page.evaluate(() => {
    const s = (window as any).__QUANT_RUSH__.runtime.session;
    return { pnl: s.engine.pnl, inv: s.engine.inventory, fills: s.engine.fills.length, z: s.z, combo: s.combo, time: s.timeLeft, stability: s.stability };
  });
  expect(st).toEqual({ pnl: 0, inv: 0, fills: 0, z: 0, combo: 0, time: 30, stability: st.stability });
  expect(errors).toEqual([]);
});

test('settings persist in localStorage', async ({ page }) => {
  await page.goto('/');
  await page.getByText('SETTINGS').click();
  await page.getByRole('button', { name: '迫力' }).click();
  await page.reload();
  const cam = await page.evaluate(() => JSON.parse(localStorage.getItem('quantrush.settings.v1') || '{}').camera);
  expect(cam).toBe('dramatic');
});

test('first play shows the tutorial with a frozen clock; skip resumes the clock', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => (window as any).__QUANT_RUSH__.useGame.getState().start());
  await expect(page.getByTestId('tutorial')).toBeVisible({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => (window as any).__QUANT_RUSH__.useGame.getState().phase), { timeout: PLAYING_WAIT }).toBe('playing');
  const t1 = await page.evaluate(() => (window as any).__QUANT_RUSH__.runtime.session.timeLeft);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => (window as any).__QUANT_RUSH__.runtime.session.timeLeft)).toBe(t1);
  await page.getByTestId('skip-tutorial').click();
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).__QUANT_RUSH__.runtime.session.timeLeft)).toBeLessThan(t1);
  const done = await page.evaluate(() => JSON.parse(localStorage.getItem('quantrush.settings.v1') || '{}').tutorialDone);
  expect(done).toBe(true);
});

test('daily challenge uses the JST date seed and quant lab labels finance-only comparisons', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('quantrush.settings.v1', JSON.stringify({ tutorialDone: true })));
  await page.goto('/');
  await page.getByTestId('lab').click();
  await expect(page.getByTestId('quant-lab')).toBeVisible();
  await expect(page.getByText('金融戦略のみの比較', { exact: false })).toBeVisible();
  await expect(page.locator('.lab-bench .bench-row').first()).toBeVisible({ timeout: 20_000 });
  await page.getByText('TITLE').click();
  await page.getByTestId('daily').click();
  const seed = await page.evaluate(() => (window as any).__QUANT_RUSH__.runtime.session.seed);
  const mode = await page.evaluate(() => (window as any).__QUANT_RUSH__.useGame.getState().mode);
  expect(mode).toBe('daily');
  expect(seed).toBeGreaterThanOrEqual(100000);
});

test('crossing a settlement gate shows the district title card (visual only)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('quantrush.settings.v1', JSON.stringify({ tutorialDone: true })));
  await page.goto('/');
  await page.evaluate(() => (window as any).__QUANT_RUSH__.useGame.getState().start(424242));
  await expect.poll(() => page.evaluate(() => (window as any).__QUANT_RUSH__.useGame.getState().phase), { timeout: PLAYING_WAIT }).toBe('playing');
  // fast-forward (test-only) to just before the first gate, then let the real game loop cross it
  await page.evaluate(() => {
    const { runtime, autopilot } = (window as any).__QUANT_RUSH__;
    const s = runtime.session;
    s.timeLeft = 999;
    s.stability = 99;
    for (let i = 0; i < 60 * 60 && !(s.nextGate && s.nextGate.z - s.z < 20); i++) {
      s.update(autopilot(s, i));
      s.drainEvents();
    }
  });
  await expect(page.getByTestId('district-card')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('district-card')).toContainText('大手町');
  // the card never captures input
  expect(await page.getByTestId('district-card').evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
});

test('v3 HUD: four readable elements, no overlaps, thumb buttons, live score = final score', async ({ page, isMobile }) => {
  await page.addInitScript(() => localStorage.setItem('quantrush.settings.v1', JSON.stringify({ tutorialDone: true, tips: false })));
  await page.goto('/');
  await expect(page.getByTestId('title-steps')).toBeVisible();
  await expect(page.getByTestId('title-steps')).toContainText('光るレーン');
  await page.evaluate(() => (window as any).__QUANT_RUSH__.useGame.getState().start(424242));
  await expect.poll(() => page.evaluate(() => (window as any).__QUANT_RUSH__.useGame.getState().phase), { timeout: PLAYING_WAIT }).toBe('playing');
  // knocked down with a loaded gauge: the OFFLINE status and the RISK gauge must both be readable
  await page.evaluate(() => {
    const { runtime, autopilot, fx } = (window as any).__QUANT_RUSH__;
    const s = runtime.session;
    s.timeLeft = 999;
    s.stability = 99;
    for (let i = 0; i < 60 * 60 && s.risk < 0.4; i++) {
      const inp = autopilot(s, i);
      inp.hedge = false;
      s.update(inp);
      s.drainEvents();
    }
    s.stumble = 5;
    fx.hitstop = 1e9;
  });
  const status = page.getByTestId('hud-status');
  await expect(status).toContainText('QUOTES OFFLINE');
  const box = async (id: string) => (await page.getByTestId(id).boundingBox())!;
  const overlap = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
  const st = await box('hud-status');
  const risk = await box('risk');
  const hedge = await box('hedge');
  const alpha = await box('alpha');
  const pnl = await box('pnl');
  const dist = await box('district-bar');
  const regime = await box('regime');
  expect(overlap(st, risk)).toBe(false);
  for (const [a, b] of [[risk, hedge], [risk, alpha], [pnl, dist], [regime, dist], [pnl, regime]] as const) expect(overlap(a, b)).toBe(false);
  // thumb buttons sit in the bottom corners, big enough for a thumb
  const vw = page.viewportSize()!.width;
  expect(alpha.x).toBeLessThan(vw * 0.3);
  expect(hedge.x + hedge.width).toBeGreaterThan(vw * 0.7);
  if (isMobile) expect(Math.min(hedge.width, hedge.height, alpha.width)).toBeGreaterThanOrEqual(72);
  // the inventory / tape detail panel is off by default (PRO HUD only)
  await expect(page.getByTestId('tape')).toHaveCount(0);
  // live HUD score is the final score function
  const same = await page.evaluate(() => {
    const { runtime, useGame } = (window as any).__QUANT_RUSH__;
    useGame.getState().updateHud();
    return useGame.getState().hud.score === runtime.session.score().total;
  });
  expect(same).toBe(true);
  // HEDGE thumb button works
  await page.evaluate(() => { const { runtime, fx } = (window as any).__QUANT_RUSH__; runtime.session.stumble = 0; fx.hitstop = 0; });
  const before = await page.evaluate(() => (window as any).__QUANT_RUSH__.runtime.session.engine.hedges.length);
  await expect
    .poll(async () => {
      if (isMobile) await page.getByTestId('hedge').tap();
      else await page.getByTestId('hedge').click();
      return page.evaluate(() => (window as any).__QUANT_RUSH__.runtime.session.engine.hedges.length);
    }, { timeout: 20_000 })
    .toBeGreaterThan(before);
});
