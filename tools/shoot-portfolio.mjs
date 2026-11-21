// Дополнительные скриншоты для страниц портфолио: новый сайт лейбла (главная).
// Запуск: node tools/shoot-portfolio.mjs [имя ...]. Результат в tools/raw/pf.
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'raw', 'pf');
await mkdir(out, { recursive: true });

const D = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'ru-RU' };
const M = {
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ru-RU',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mobile/15E148 Safari/604.1)',
};
// mode: d - десктоп, m - телефон; theme: тема для prefers-color-scheme; sel: прокрутить к селектору; y: прокрутить на y
const shots = [
  { name: 'arx-home', url: 'https://arxprod.ru/', mode: D, theme: 'dark' },
];
const only = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
for (const s of shots) {
  if (only.length && !only.includes(s.name)) continue;
  const ctx = await browser.newContext({ ...s.mode, colorScheme: s.theme });
  const page = await ctx.newPage();
  try {
    await page.goto(s.url, { waitUntil: 'load', timeout: 45000 });
    await page.waitForTimeout(2500);
    if (s.sel) {
      const ok = await page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; e.scrollIntoView(); return true; }, s.sel);
      if (!ok) console.log('no selector', s.sel);
      await page.waitForTimeout(1800);
    }
    await page.screenshot({ path: path.join(out, s.name + '.png') });
    console.log('ok  ', s.name);
  } catch (e) { console.log('FAIL', s.name, String(e).split('\n')[0]); }
  await ctx.close();
}
await browser.close();
