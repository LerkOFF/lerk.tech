// Снимает обзор админки AgeCMS с локального демо-сайта в tools/raw/agecms-desk.png.
// Запуск: node tools/shoot-agecms.mjs /путь/к/agecms
// Копия репозитория ставится во временную папку, на живом сайте и в рабочей копии ничего не меняется.
import { chromium } from 'playwright-core';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const src = process.argv[2];
if (!src) throw new Error('укажите путь к репозиторию AgeCMS');
const tmp = mkdtempSync(path.join(tmpdir(), 'agecms-'));
const port = 8091;
execFileSync('rsync', ['-a', '--exclude', '.git', '--exclude', 'node_modules', src + '/', tmp + '/']);
const out = execFileSync('php', ['bin/install.php', `--url=http://127.0.0.1:${port}`, '--name=Демо-сайт'], { cwd: tmp }).toString();
const password = /Password:\s+(\S+)/.exec(out)[1];
const server = spawn('php', ['-S', `127.0.0.1:${port}`, 'tests/support/router.php'], { cwd: tmp, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1500));

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'ru-RU' });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${port}/admin/`);
await page.fill('input[name=username]', 'admin');
await page.fill('input[type=password]', password);
await page.click('button[type=submit]');
await page.waitForTimeout(2500);
await page.screenshot({ path: fileURLToPath(new URL('./raw/agecms-desk.png', import.meta.url)) });
await browser.close();
server.kill();
console.log('ok agecms-desk.png');
