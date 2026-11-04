/**
 * Render-cost probe (QA only). Usage: node scripts/dev/perf.cjs <url> <quality|auto> [mobile]
 * Same seed (424242), same deterministic inputs, game clock frozen while rendering, 5 districts.
 * Reports draw calls / triangles (whole frame incl. post passes) and FPS. Headless Chromium uses
 * software WebGL (SwiftShader): FPS here is NOT a GPU number — use it only to compare builds.
 */
const { chromium, devices } = require('playwright');
const [url, quality = 'auto', mobile] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = mobile ? await browser.newContext({ ...devices['iPhone 13'] }) : await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.addInitScript((q) => localStorage.setItem('quantrush.settings.v1', JSON.stringify({ tutorialDone: true, quality: q, tips: false })), quality);
  await page.goto(url);
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__QUANT_RUSH__.useGame.getState().start(424242));
  await page.waitForFunction(() => window.__QUANT_RUSH__.useGame.getState().phase === 'playing', null, { timeout: 60000 });
  const rows = [];
  for (let d = 0; d < 5; d++) {
    await page.evaluate((d) => {
      const { runtime, autopilot, fx } = window.__QUANT_RUSH__;
      const s = runtime.session; s.timeLeft = 999; s.stability = 99;
      let i = 0;
      while (!(s.district >= d && s.districtProgress >= 0.38) && i < 60 * 300) { s.update(autopilot(s, i++)); s.drainEvents(); }
      fx.hitstop = 1e9;
    }, d);
    await page.waitForTimeout(3000);
    rows.push(await page.evaluate(() => { const t = window.__QUANT_RUSH__.tier.getState(); return { calls: t.calls, tris: t.tris, fps: t.fps, tier: t.tier }; }));
    await page.evaluate(() => { window.__QUANT_RUSH__.fx.hitstop = 0; });
  }
  const mean = (k) => (rows.reduce((a, r) => a + r[k], 0) / rows.length).toFixed(1);
  console.log(JSON.stringify({ quality, mobile: !!mobile, tier: rows[0].tier, calls: rows.map((r) => r.calls), trisK: rows.map((r) => Math.round(r.tris / 1000)), fps: rows.map((r) => r.fps), meanCalls: mean('calls'), meanFps: mean('fps') }));
  await browser.close();
})();
