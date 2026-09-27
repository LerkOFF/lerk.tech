// Рендерит tools/og.html в public/og.jpg (1200x630), картинку для превью ссылок.
// Запуск: node tools/og.mjs
import { chromium } from 'playwright-core';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = fileURLToPath(new URL('../public/og.jpg', import.meta.url));

const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce' });
await p.goto(pathToFileURL(here + 'og.html').href, { waitUntil: 'networkidle' });
await p.evaluate(() => document.fonts.ready);
await p.screenshot({ path: out, type: 'jpeg', quality: 88 });
await b.close();
console.log('готово:', out);
