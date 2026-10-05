// Смоук-тест интерактива страницы. Запуск: node tools/smoke.mjs [url | local]
// local: public/ без сервера (tools/local-route.mjs), иначе адрес сайта.
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import { serveLocal, LOCAL_URL } from './local-route.mjs';
const local = process.argv[2] === 'local';
const url = local ? LOCAL_URL : (process.argv[2] || 'http://127.0.0.1:8765/');
const jsqrPath = createRequire(import.meta.url).resolve('jsqr/dist/jsQR.js');
// RESOLVE_IP=157.22.231.158 заставляет Chrome идти на этот IP, минуя DNS (полезно, пока кэш отдаёт старую запись)
const resolveIp = process.env.RESOLVE_IP;
const host = new URL(url).hostname;
const args = resolveIp ? [`--host-resolver-rules=MAP ${host} ${resolveIp},MAP www.${host} ${resolveIp}`] : [];
const b = await chromium.launch({ channel: 'chrome', args });
const results = [];
const ok = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
// Яндекс.Метрику глушим, чтобы прогоны не попадали в статистику и Вебвизор
const METRIKA = /^https:\/\/mc\.(yandex|webvisor)\./;
const newCtx = async (opts) => {
  const ctx = await b.newContext(opts);
  await ctx.route(METRIKA, r => r.abort());
  if (local) await serveLocal(ctx);
  return ctx;
};

// Десктоп
{
  const ctx = await newCtx({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return {}; }; });
  await p.goto(url, { waitUntil: 'networkidle' });

  // счётчик Метрики
  ok('счётчик Метрики подключён', await p.evaluate(() => typeof window.ym === 'function' && !!document.querySelector('script[src="https://mc.yandex.ru/metrika/tag.js?id=113438654"]')));
  ok('Вебвизор не пишет текст задачи', await p.evaluate(() => document.querySelector('#brief-text').classList.contains('ym-disable-keys')));

  // тема
  await p.click('[data-theme-toggle]');
  ok('тема переключается в тёмную', await p.evaluate(() => document.documentElement.dataset.theme === 'dark' && localStorage.getItem('theme') === 'dark'));
  ok('подпись кнопки темы', (await p.getAttribute('[data-theme-toggle]', 'aria-label')) === 'Светлая тема');
  await p.reload({ waitUntil: 'networkidle' });
  ok('тема помнится после перезагрузки', await p.evaluate(() => document.documentElement.dataset.theme === 'dark'));
  await p.click('[data-theme-toggle]');

  // вкладки
  const vis = () => p.evaluate(() => [...document.querySelectorAll('.ai__panel')].map(x => !x.hidden));
  ok('видна только первая вкладка', JSON.stringify(await vis()) === '[true,false,false,false]');
  await p.click('#tab-chat');
  ok('клик по вкладке «Помощник»', JSON.stringify(await vis()) === '[false,false,true,false]');
  await p.focus('#tab-chat'); await p.keyboard.press('ArrowRight');
  ok('стрелка вправо', JSON.stringify(await vis()) === '[false,false,false,true]' && await p.evaluate(() => document.activeElement.id === 'tab-agents'));
  await p.keyboard.press('Home');
  ok('Home к первой', JSON.stringify(await vis()) === '[true,false,false,false]');

  // копирование почты
  await p.click('[data-copy]');
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  ok('почта копируется', clip === 'lerk@joulerk.ru', clip);

  // форма: пусто
  await p.click('button[value="tg"]');
  ok('пустая форма показывает ошибку', await p.evaluate(() => !document.querySelector('.field__error').hidden && document.querySelector('#brief-text').getAttribute('aria-invalid') === 'true'));
  ok('пустая форма ничего не открывает', (await p.evaluate(() => window.__opened.length)) === 0);

  // форма: заполнена
  await p.check('input[name="kind"][value="Сайт"]');
  await p.check('input[name="kind"][value="ИИ-функция"]');
  await p.check('input[name="when"][value="В течение месяца"]');
  await p.fill('#brief-text', 'Лендинг для кофейни с оплатой');
  ok('ошибка уходит при вводе', await p.evaluate(() => document.querySelector('.field__error').hidden));
  await p.click('button[value="tg"]');
  const opened = await p.evaluate(() => window.__opened[0] || '');
  const text = decodeURIComponent((opened.split('?text=')[1] || ''));
  ok('Telegram открывается с текстом', opened.startsWith('https://t.me/joulerkOFF?text='), JSON.stringify(text));
  ok('в тексте виды работ и срок', text.includes('Нужно: Сайт, ИИ-функция.') && text.includes('Срок: в течение месяца.') && text.includes('Задача: Лендинг для кофейни с оплатой'));

  // вариант «Другое» для задач не из списка
  await p.evaluate(() => { window.__opened = []; });
  await p.uncheck('input[name="kind"][value="Сайт"]');
  await p.uncheck('input[name="kind"][value="ИИ-функция"]');
  await p.check('input[name="kind"][value="Другое"]');
  await p.click('button[value="tg"]');
  const other = decodeURIComponent(((await p.evaluate(() => window.__opened[0] || '')).split('?text=')[1] || ''));
  ok('вариант «Другое» попадает в текст', other.includes('Нужно: Другое.'), JSON.stringify(other.split('\n')[1] || ''));
  ok('статус под формой', (await p.textContent('.brief__status')).startsWith('Открываю Telegram'));
  ok('ошибок JS нет', errs.length === 0, errs.join('; '));
  await ctx.close();
}

// Реквизиты и печать: QR на печати читается и ведёт на почту в обеих темах
for (const scheme of ['light', 'dark']) {
  const ctx = await newCtx({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: scheme, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'networkidle' });
  if (scheme === 'light') {
    const rows = await p.$$eval('.rekv__list dt', els => els.map(e => e.textContent.trim()));
    ok('реквизиты без региона и СНИЛС', rows.join('|') === 'Имя|ИНН|Статус|Виды деятельности|Электронная почта', rows.join(', '));
  }
  const stamp = p.locator('.rekv__stamp svg');
  await stamp.scrollIntoViewIfNeeded();
  await p.evaluate(() => document.fonts.ready);
  const png = (await stamp.screenshot()).toString('base64');
  await p.addScriptTag({ path: jsqrPath });
  const qr = await p.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const r = window.jsQR(g.getImageData(0, 0, c.width, c.height).data, c.width, c.height, { inversionAttempts: 'attemptBoth' });
    return r ? r.data : null;
  }, png);
  ok(`QR печати читается (${scheme === 'light' ? 'светлая' : 'тёмная'} тема)`, qr === 'mailto:lerk@joulerk.ru', String(qr));
  await ctx.close();
}

// Телефон
{
  const ctx = await newCtx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'networkidle' });
  ok('меню скрыто на телефоне', !(await p.isVisible('#nav')));
  await p.click('.nav-toggle');
  ok('меню открывается', await p.isVisible('#nav') && (await p.getAttribute('.nav-toggle', 'aria-expanded')) === 'true');
  await p.keyboard.press('Escape');
  ok('Escape закрывает меню', !(await p.isVisible('#nav')));
  await p.click('.nav-toggle');
  await p.click('#nav a[href="#services"]');
  ok('клик по пункту закрывает меню', !(await p.isVisible('#nav')));
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  ok('нет горизонтальной прокрутки', sw <= 390, String(sw));
  const small = await p.evaluate(() => [...document.querySelectorAll('a, button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && (r.height < 24) && getComputedStyle(e).display !== 'inline'; }).map(e => e.textContent.trim().slice(0, 30)));
  ok('кнопки не мельче 24px', small.length === 0, small.join(' | '));
  await ctx.close();
}

// Поиск: sitemap, страницы услуг, микроразметка, внутренние ссылки
{
  const CANON = 'https://lerk.tech/';
  const ctx = await newCtx({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'networkidle' });
  const fetchText = (u) => p.evaluate(async (u) => { const r = await fetch(u); return { status: r.status, text: await r.text() }; }, u);
  const sitemap = (await fetchText(new URL('sitemap.xml', url).href)).text;
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const pages = locs.map(l => new URL(l.replace(CANON, ''), url).href);
  ok('в sitemap главная и 6 услуг', locs.length === 7 && locs[0] === CANON, String(locs.length));
  const robots = (await fetchText(new URL('robots.txt', url).href)).text;
  ok('robots.txt указывает на sitemap', robots.includes('Sitemap: https://lerk.tech/sitemap.xml') && robots.includes('Disallow: /pokupki'));

  const more = await p.$$eval('.service__more', as => as.map(a => a.getAttribute('href')));
  ok('карточки услуг ведут на страницы из sitemap', more.length === 6 && more.every(h => locs.includes(CANON + h.slice(1))), more.join(' '));
  const mainLd = await p.$$eval('script[type="application/ld+json"]', s => s.map(x => JSON.parse(x.textContent)));
  const mainFaq = mainLd.flatMap(x => x['@graph'] || [x]).find(x => x['@type'] === 'FAQPage');
  ok('вопросы главной совпадают с микроразметкой', mainFaq && mainFaq.mainEntity.length === await p.$$eval('#faq .faq__item', d => d.length));

  const titles = new Set(), links = new Set(), bad = [];
  for (const [i, page] of pages.entries()) {
    const res = await p.goto(page, { waitUntil: 'networkidle' });
    const info = await p.evaluate(() => ({
      title: document.title,
      desc: document.querySelector('meta[name="description"]')?.content || '',
      canonical: document.querySelector('link[rel="canonical"]')?.href,
      h1: document.querySelectorAll('h1').length,
      ld: [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => { try { JSON.parse(s.textContent); return true; } catch { return false; } }),
      ym: typeof window.ym === 'function',
      links: [...document.querySelectorAll('a[href]')].map(a => a.href).filter(h => h.startsWith(location.origin)),
    }));
    titles.add(info.title);
    info.links.forEach(l => links.add(l.split('#')[0]));
    if (res.status() !== 200 || info.canonical !== locs[i] || info.h1 !== 1 || !info.desc || !info.ld.length || !info.ld.every(Boolean) || !info.ym) {
      bad.push(`${locs[i]}: ${res.status()} canonical=${info.canonical} h1=${info.h1} ld=${info.ld} ym=${info.ym}`);
    }
  }
  ok('страницы из sitemap: 200, canonical, один h1, JSON-LD, Метрика', bad.length === 0, bad.join('; '));
  ok('у каждой страницы свой title', titles.size === pages.length);
  const broken = [];
  for (const l of links) { const r = await fetchText(l); if (r.status !== 200) broken.push(`${r.status} ${l}`); }
  ok('внутренние ссылки открываются', broken.length === 0, broken.join(', '));
  ok('ошибок JS на страницах нет', errs.length === 0, errs.join('; '));
  await ctx.close();

  // страница услуги на телефоне: меню, ширина, вопросы
  const m = await newCtx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  await mp.goto(pages[1], { waitUntil: 'networkidle' });
  await mp.click('.nav-toggle');
  ok('меню на странице услуги открывается', await mp.isVisible('#nav'));
  ok('пункты меню ведут на главную', (await mp.getAttribute('#nav a', 'href')) === '/#work');
  await mp.keyboard.press('Escape');
  const msw = await mp.evaluate(() => document.documentElement.scrollWidth);
  ok('страница услуги без горизонтальной прокрутки', msw <= 390, String(msw));
  await mp.click('#faq summary');
  ok('вопрос раскрывается', await mp.evaluate(() => document.querySelector('#faq details').open));
  await m.close();
}

// Без JS
{
  const ctx = await newCtx({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'networkidle' });
  ok('без JS видны все блоки', await p.evaluate(() => getComputedStyle(document.querySelector('.case')).opacity === '1'));
  ok('без JS видны все панели ИИ', await p.evaluate(() => [...document.querySelectorAll('.ai__panel')].every(x => getComputedStyle(x).display !== 'none')));
  await ctx.close();
}
await b.close();
console.log(results.join('\n'));
