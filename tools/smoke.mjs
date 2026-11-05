// Смоук-тест интерактива страницы. Запуск: node tools/smoke.mjs [url | local]
// local: public/ без сервера (tools/local-route.mjs), иначе адрес сайта.
import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
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
  ok('в sitemap главная, 7 услуг, блог и 6 постов', locs.length === 15 && locs[0] === CANON && locs.filter(l => l.includes('/blog/')).length === 7, String(locs.length));
  const robots = (await fetchText(new URL('robots.txt', url).href)).text;
  ok('robots.txt указывает на sitemap', robots.includes('Sitemap: https://lerk.tech/sitemap.xml') && robots.includes('Disallow: /pokupki'));

  const more = await p.$$eval('.service__more', as => as.map(a => a.getAttribute('href')));
  ok('карточки услуг ведут на страницы из sitemap', more.length === 7 && more.every(h => locs.includes(CANON + h.slice(1))), more.join(' '));
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

// Блог: главная, индекс, пост, приватность
{
  const chk = spawnSync('python3', ['-B', new URL('./check_blog.py', import.meta.url).pathname], { encoding: 'utf8' });
  ok('check_blog: в постах нет ссылок, доменов, имён и прочего из стоп-списка', chk.status === 0, (chk.stdout + chk.stderr).trim().split('\n').slice(0, 6).join(' | '));
  const CANON = 'https://lerk.tech/';
  const ctx = await newCtx({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(url, { waitUntil: 'networkidle' });
  ok('в меню главной есть «Блог»', await p.evaluate(() => [...document.querySelectorAll('#nav a')].some(a => a.textContent.trim() === 'Блог' && a.getAttribute('href') === '/blog/')));
  ok('в подвале есть «Блог»', await p.evaluate(() => !!document.querySelector('.foot a[href="/blog/"]')));
  const home = await p.evaluate(() => ({
    cards: document.querySelectorAll('#blog .blog-card').length,
    hrefs: [...document.querySelectorAll('#blog .blog-card__title a')].map(a => a.getAttribute('href')),
    all: !!document.querySelector('#blog a[href="/blog/"]'),
    sized: [...document.querySelectorAll('#blog img')].every(i => i.width && i.height && i.loading === 'lazy'),
  }));
  ok('на главной блок «Блог»: 4 карточки и ссылка «Весь блог»', home.cards === 4 && home.all && home.sized, JSON.stringify(home));
  await p.evaluate(() => document.querySelectorAll('#blog img').forEach(i => { i.loading = 'eager'; }));
  await p.waitForTimeout(600);
  ok('обложки в блоке «Блог» загрузились', await p.evaluate(() => [...document.querySelectorAll('#blog img')].every(i => i.complete && i.naturalWidth > 0)));

  const idx = new URL('blog/', url).href;
  await p.goto(idx, { waitUntil: 'networkidle' });
  const list = await p.evaluate(() => ({
    cards: document.querySelectorAll('.blog-card').length,
    current: document.querySelector('#nav a[aria-current="page"]')?.textContent.trim(),
    ld: [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(s => JSON.parse(s.textContent)['@graph']).map(x => x['@type']).join(','),
  }));
  ok('индекс блога: 6 карточек, «Блог» отмечен в меню, Blog и BreadcrumbList', list.cards === 6 && list.current === 'Блог' && list.ld === 'Blog,BreadcrumbList', JSON.stringify(list));
  const sitemapText = await p.evaluate(async (u) => (await fetch(u)).text(), new URL('sitemap.xml', url).href);
  ok('карточки главной ведут на посты из sitemap', home.hrefs.length === 4 && home.hrefs.every(h => sitemapText.includes(CANON + h.slice(1))), home.hrefs.join(' '));

  for (const href of home.hrefs) {
    await p.goto(new URL(href.slice(1), url).href, { waitUntil: 'networkidle' });
    const post = await p.evaluate(() => {
      const cover = document.querySelector('.blog-cover img');
      const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].flatMap(s => JSON.parse(s.textContent)['@graph']);
      const bp = ld.find(x => x['@type'] === 'BlogPosting');
      const heads = [...document.querySelectorAll('.blog-prose h2')];
      return {
        og: document.querySelector('meta[property="og:type"]')?.content,
        ogimg: document.querySelector('meta[property="og:image"]')?.content || '',
        canon: document.querySelector('link[rel="canonical"]')?.href,
        cover: cover && { w: cover.getAttribute('width'), h: cover.getAttribute('height'), prio: cover.getAttribute('fetchpriority'), ok: cover.complete && cover.naturalWidth > 0 },
        bp: bp && { author: bp.author?.name, id: bp.author?.['@id'], date: bp.datePublished, image: bp.image, words: bp.wordCount },
        crumbs: ld.some(x => x['@type'] === 'BreadcrumbList'),
        h2: heads.length, anchors: heads.every(h => h.id && h.querySelector('a.blog-anchor')),
        facts: !!document.querySelector('.blog-facts'),
        ext: [...document.querySelectorAll('.blog-prose a, .blog-head a')].filter(a => !a.getAttribute('href').startsWith('#') && !a.getAttribute('href').startsWith('/')).length,
        service: !!document.querySelector('.svc-links a[href^="/"]'),
        lazy: [...document.querySelectorAll('img')].filter(i => !i.closest('.blog-cover') && !i.closest('.mascot') && !i.closest('.top') && !i.getAttribute('width')).length,
      };
    });
    const good = post.og === 'article' && post.ogimg.startsWith(CANON + 'assets/img/note-') && post.cover && post.cover.w === '1200' && post.cover.h === '630' && post.cover.prio === 'high' && post.cover.ok
      && post.bp && post.bp.author === 'Дмитрий' && post.bp.id === 'https://lerk.tech/#person' && /^2026-/.test(post.bp.date) && post.crumbs
      && post.h2 >= 3 && post.h2 <= 5 && post.anchors && post.facts && post.ext === 0 && post.service && post.lazy === 0 && post.bp.words >= 400 && post.bp.words <= 700;
    ok(`пост ${href}: article, обложка, BlogPosting, 3-5 разделов, якоря, «Коротко», 400-700 слов, без внешних ссылок`, good, JSON.stringify(post));
  }
  ok('ошибок JS в блоге нет', errs.length === 0, errs.join('; '));
  await ctx.close();

  // телефон: индекс и пост без горизонтальной прокрутки, меню помечает «Блог»
  const m = await newCtx({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mp = await m.newPage();
  for (const href of ['blog/', home.hrefs[0].slice(1)]) {
    await mp.goto(new URL(href, url).href, { waitUntil: 'networkidle' });
    const w = await mp.evaluate(() => document.documentElement.scrollWidth);
    ok(`/${href} на телефоне без горизонтальной прокрутки`, w <= 390, String(w));
  }
  await mp.click('.nav-toggle');
  ok('меню поста на телефоне: «Блог» ведёт на /blog/', await mp.evaluate(() => document.querySelector('#nav a[aria-current="page"]')?.getAttribute('href') === '/blog/'));
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
