// Скриншоты отдельных блоков: node tools/parts.mjs <outdir> <width> <light|dark> <selector>...
import { chromium } from 'playwright-core';
const [,, out, w, scheme, ...sels] = process.argv;
const b = await chromium.launch({ channel: 'chrome' });
const mobile = +w < 768;
const ctx = await b.newContext({ viewport: { width: +w, height: 900 }, deviceScaleFactor: 1, colorScheme: scheme, reducedMotion: 'reduce', isMobile: mobile, hasTouch: mobile });
const p = await ctx.newPage();
await p.goto('http://127.0.0.1:8765/', { waitUntil: 'networkidle' });
await p.evaluate(async () => {
  document.querySelectorAll('img[loading="lazy"]').forEach(i => { i.loading = 'eager'; });
  await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
  await document.fonts.ready;
});
for (const [i, sel] of sels.entries()) {
  const el = p.locator(sel).first();
  await el.scrollIntoViewIfNeeded();
  await p.waitForTimeout(200);
  await el.screenshot({ path: `${out}/${w}-${scheme}-${i}.png` });
  console.log('ok', sel);
}
await b.close();
