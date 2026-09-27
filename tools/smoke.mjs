// Смоук-тест интерактива страницы. Запуск: node tools/smoke.mjs [url]
import { chromium } from 'playwright-core';
const url = process.argv[2] || 'http://127.0.0.1:8765/';
const b = await chromium.launch({ channel: 'chrome' });
const results = [];
const ok = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);

// Десктоп
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return {}; }; });
  await p.goto(url, { waitUntil: 'networkidle' });

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
  ok('статус под формой', (await p.textContent('.brief__status')).startsWith('Открываю Telegram'));
  ok('ошибок JS нет', errs.length === 0, errs.join('; '));
  await ctx.close();
}

// Телефон
{
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
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

// Без JS
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, javaScriptEnabled: false });
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'networkidle' });
  ok('без JS видны все блоки', await p.evaluate(() => getComputedStyle(document.querySelector('.case')).opacity === '1'));
  ok('без JS видны все панели ИИ', await p.evaluate(() => [...document.querySelectorAll('.ai__panel')].every(x => getComputedStyle(x).display !== 'none')));
  await ctx.close();
}
await b.close();
console.log(results.join('\n'));
