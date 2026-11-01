import { expect, test, type Page } from '@playwright/test';

type Hook = {
  runtime: { session: any };
  useGame: { getState: () => any };
  autopilot: (s: any, f: number) => any;
};

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
  await expect.poll(() => page.evaluate(() => (window as any).__QUANT_RUSH__.useGame.getState().phase), { timeout: 15_000 }).toBe('playing');
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
  await expect.poll(() => page.evaluate(() => (window as any).__QUANT_RUSH__.useGame.getState().phase), { timeout: 15_000 }).toBe('playing');
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
