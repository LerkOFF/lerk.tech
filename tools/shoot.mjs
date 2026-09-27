// Снимает скриншоты живых сайтов для портфолио.
// Запуск: node tools/shoot.mjs [имя ...]   (без аргументов - все)
// Cookie-баннеры не принимаем, а прячем стилем, чтобы не давать согласие.
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'raw');

const sites = [
  { name: 'metrika', url: 'https://xn----7sbbdrcbtsfnu5aey.xn--p1ai/' },
  { name: 'metrika-shablony', url: 'https://xn----7sbbdrcbtsfnu5aey.xn--p1ai/shablony' },
  { name: 'gerbs', url: 'https://xn--90adgbpxzj5h.xn--p1ai/' },
  { name: 'gerbs-examples', url: 'https://xn--90adgbpxzj5h.xn--p1ai/', section: 'Примеры гербов' },
  { name: 'donnu', url: 'https://xn--d1asac1a.xn--p1ai/?g=fiz-2-ivt-4' },
  { name: 'ss14', url: 'https://xn--14-nmca.xn--p1ai/' },
  { name: 'parkhotel', url: 'https://parkhotelvp.ru/' },
  { name: 'lodki', url: 'https://lodki.site/' },
  { name: 'aqcentr', url: 'https://aqcentr.ru/' },
  { name: 'slapi', url: 'https://sl-api.ru/' },
  { name: 'budtebogaty', url: 'https://budtebogaty.com/' },
  { name: 'tabson', url: 'https://tabson.sendler.ru/' },
  { name: 'kosmos', url: 'https://kosmos.pw/' },
  { name: 'anonimku', url: 'https://anonimku.ru/' },
  { name: 'energoproms', url: 'https://energoproms.ru/' },
  { name: 'zaryanka', url: 'https://zaryanka.coffee/' },
  { name: 'rocketeda', url: 'https://rocketeda.ru/' },
  { name: 'gold777', url: 'https://gold777.ru/' },
  { name: 'crestmaker', url: 'https://crestmaker.site/' },
];

const hideOverlays = () => {
  const words = /cookie|куки|cookies|согласие на обработку/i;
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    const r = el.getBoundingClientRect();
    const text = (el.innerText || '').slice(0, 400);
    const isBanner = words.test(text);
    const isWidget = r.width < 120 && r.height < 120 && r.bottom > innerHeight - 160; // кнопки чатов в углу
    const isVeil = r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9 && text.trim().length < 5; // пелена под баннером
    if (isBanner || isWidget || isVeil) el.style.setProperty('display', 'none', 'important');
  }
};

const only = process.argv.slice(2);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

for (const mode of ['desk', 'mob']) {
  const ctx = await browser.newContext(
    mode === 'desk'
      ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'ru-RU' }
      : {
          viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ru-RU',
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
        },
  );
  for (const s of sites) {
    if (only.length && !only.includes(s.name)) continue;
    if (mode === 'mob' && s.section) continue;
    const page = await ctx.newPage();
    const file = path.join(out, `${s.name}-${mode}.png`);
    try {
      await page.goto(s.url, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(2500);
      await page.evaluate(hideOverlays);
      if (s.section) {
        const h = page.getByText(s.section, { exact: false }).first();
        await h.scrollIntoViewIfNeeded();
        await page.evaluate(() => window.scrollBy(0, -40));
        await page.waitForTimeout(1500);
        await page.evaluate(hideOverlays);
      }
      await page.screenshot({ path: file });
      console.log('ok  ', mode, s.name, page.url());
    } catch (e) {
      console.log('FAIL', mode, s.name, String(e).split('\n')[0]);
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
