// Скриншоты своей страницы для проверки: node tools/review.mjs <url> <prefix> <width> <height> <light|dark> [full]
import { chromium } from 'playwright-core';
const [,, url, prefix, w = '1440', h = '900', scheme = 'light', full = 'full'] = process.argv;
const b = await chromium.launch({ channel: 'chrome' });
const mobile = +w < 768;
const ctx = await b.newContext({
  viewport: { width: +w, height: +h }, deviceScaleFactor: 1, colorScheme: scheme, reducedMotion: 'reduce',
  isMobile: mobile, hasTouch: mobile, locale: 'ru-RU',
});
const p = await ctx.newPage();
const errors = [];
p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
p.on('pageerror', e => errors.push('pageerror: ' + e.message));
p.on('requestfailed', r => errors.push('failed: ' + r.url()));
await p.goto(url, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.evaluate(async () => {
  document.querySelectorAll('img[loading="lazy"]').forEach(i => { i.loading = 'eager'; });
  await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; })));
});
await p.waitForTimeout(400);
const info = await p.evaluate(() => ({
  docW: document.documentElement.scrollWidth, winW: innerWidth, docH: document.documentElement.scrollHeight,
  fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => f.family + ' ' + f.weight).join(', '),
  h1lines: (() => { const h = document.querySelector('h1'); const lh = parseFloat(getComputedStyle(h).lineHeight); return Math.round(h.getBoundingClientRect().height / lh); })(),
}));
console.log(JSON.stringify(info));
if (errors.length) console.log(errors.join('\n'));
await p.screenshot({ path: `${prefix}.png`, fullPage: full === 'full' });
await b.close();
