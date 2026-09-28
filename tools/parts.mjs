// Скриншоты отдельных блоков: node tools/parts.mjs <outdir> <width> <light|dark> <selector>...
// URL=local снимает public/ без сервера (файлы отдаёт tools/local-route.mjs).
// URL=https://lerk.tech/ RESOLVE_IP=157.22.231.158 снимает живой сайт в обход DNS-кэша.
import { chromium } from 'playwright-core';
import { serveLocal, LOCAL_URL } from './local-route.mjs';

const [,, out, w, scheme, ...sels] = process.argv;
const local = process.env.URL === 'local';
const url = local ? LOCAL_URL : (process.env.URL || 'http://127.0.0.1:8765/');
const ip = process.env.RESOLVE_IP;
const host = new URL(url).hostname;
const b = await chromium.launch({ channel: 'chrome', args: ip ? [`--host-resolver-rules=MAP ${host} ${ip}`] : [] });
const mobile = +w < 768;
const ctx = await b.newContext({ viewport: { width: +w, height: 900 }, deviceScaleFactor: 1, colorScheme: scheme, reducedMotion: 'reduce', isMobile: mobile, hasTouch: mobile });
if (local) await serveLocal(ctx);
const p = await ctx.newPage();
await p.goto(url, { waitUntil: 'networkidle' });
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
