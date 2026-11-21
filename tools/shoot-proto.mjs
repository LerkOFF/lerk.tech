// Скриншот локального прототипа: node tools/shoot-proto.mjs <url> <имя> [прокрутка по y]. Результат tools/raw/pf/<имя>.png
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [,, url, name, y = '0'] = process.argv;
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'raw', 'pf', name + '.png');
const b = await chromium.launch({ channel: 'chrome', headless: true });
const p = await (await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'ru-RU' })).newPage();
await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForTimeout(2500);
if (+y) { await p.evaluate((v) => window.scrollTo(0, v), +y); await p.waitForTimeout(1200); }
await p.screenshot({ path: out });
await b.close();
console.log('ok', out);
