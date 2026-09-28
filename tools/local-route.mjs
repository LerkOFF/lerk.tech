// Отдаёт public/ браузеру Playwright без локального сервера: запросы на https://lerk.local/
// перехватываются и отвечаются файлами с диска. Используют smoke.mjs и parts.mjs при URL=local.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const LOCAL_URL = 'https://lerk.local/';
const root = fileURLToPath(new URL('../public/', import.meta.url));
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.xml': 'application/xml', '.txt': 'text/plain',
};

export async function serveLocal(ctx) {
  await ctx.route(LOCAL_URL + '**', async (route) => {
    let p = decodeURIComponent(new URL(route.request().url()).pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, path.normalize(p));
    if (!file.startsWith(root)) return route.fulfill({ status: 403, body: 'forbidden' });
    try {
      const body = await readFile(file);
      await route.fulfill({ body, contentType: types[path.extname(file)] || 'application/octet-stream' });
    } catch {
      await route.fulfill({ status: 404, body: await readFile(path.join(root, '404.html')), contentType: types['.html'] });
    }
  });
}
