// Точечные кадры для страницы: экран ИИ-помощника lodki.site, блог с ИИ-обложками,
// примеры гербов, статьи aqcentr.ru. Запуск: node tools/shoot-extra.mjs
// Cookie-баннеры и их пелену прячем стилем, согласие не даём. В чат помощника ничего не пишем:
// это живой сайт заказчика, сообщение создаст заявку в CRM.
import { chromium } from 'playwright-core';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('./raw/', import.meta.url));
const hide = () => {
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest('[class*="lodki-assistant"]')) continue;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    const r = el.getBoundingClientRect();
    const text = (el.innerText || '').trim();
    const veil = r.width >= innerWidth * 0.9 && r.height >= innerHeight * 0.9 && text.length < 5;
    if (veil || /cookie|куки/i.test(text.slice(0, 400))) el.style.setProperty('display', 'none', 'important');
  }
};

const b = await chromium.launch({ channel: 'chrome' });
const desk = await b.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'ru-RU' });
const mob = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'ru-RU' });

async function shot(ctx, name, url, prepare) {
  const p = await ctx.newPage();
  try {
    await p.goto(url, { waitUntil: 'load', timeout: 60000 });
    await p.waitForTimeout(2500);
    await p.evaluate(hide);
    if (prepare) await prepare(p);
    await p.screenshot({ path: out + name });
    console.log('ok  ', name);
  } catch (e) {
    console.log('FAIL', name, String(e).split('\n')[0]);
  }
  await p.close();
}

await shot(mob, 'lodki-assistant-mob.png', 'https://lodki.site/assistant');
await shot(desk, 'lodki-blog-desk.png', 'https://lodki.site/blog');
await shot(desk, 'aqcentr-articles-desk.png', 'https://aqcentr.ru/articles');
await shot(desk, 'gerbs-examples-desk.png', 'https://xn--90adgbpxzj5h.xn--p1ai/', async (p) => {
  await p.evaluate(() => {
    const h = [...document.querySelectorAll('h1,h2,h3,h4')].find(e => /Примеры гербов/i.test(e.textContent));
    if (h) window.scrollTo(0, h.getBoundingClientRect().top + scrollY - 60);
  });
  await p.waitForTimeout(1500);
});

await b.close();
