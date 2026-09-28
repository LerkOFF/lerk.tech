// Собирает SVG-печать самозанятого и вставляет её в public/index.html между
// <!-- stamp:start --> и <!-- stamp:end -->. Запуск: node tools/build_stamp.mjs
//
// По кругу: ФИО сверху, ИНН снизу, во внутреннем кольце «Российская Федерация, плательщик НПД».
// В центре QR с письмом на рабочую почту, как у печатей самозанятых в реестре.
// Регион и СНИЛС не пишем: регион не нужен (услуги по всему миру), СНИЛС не публикуем.
// Цвета берутся из CSS-переменных --stamp-ink, --qr-ink, --qr-bg (светлая и тёмная тема в style.css).
import QRCode from 'qrcode';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const QR_TEXT = 'mailto:lerk@joulerk.ru';
const NAME = 'Гайдаш Дмитрий Павлович';
const BOTTOM = 'ИНН 614328597388';
const RING = 'РОССИЙСКАЯ ФЕДЕРАЦИЯ • ПЛАТЕЛЬЩИК НПД • САМОЗАНЯТЫЙ • ';

const html = fileURLToPath(new URL('../public/index.html', import.meta.url));
const C = 120;                 // центр, viewBox 240x240
const f = (n) => Number(n.toFixed(2));

// QR: строки модулей склеиваем в прямоугольники, чтобы путь был короче
const qr = QRCode.create(QR_TEXT, { errorCorrectionLevel: 'M' });
const n = qr.modules.size;
const cells = qr.modules.data;
const size = 80;
const cell = size / n;
const x0 = C - size / 2;
const y0 = C - size / 2;
let d = '';
for (let r = 0; r < n; r++) {
  for (let c = 0; c < n;) {
    if (!cells[r * n + c]) { c++; continue; }
    const s = c;
    while (c < n && cells[r * n + c]) c++;
    d += `M${f(x0 + s * cell)} ${f(y0 + r * cell)}h${f((c - s) * cell)}v${f(cell)}h${f(-(c - s) * cell)}z`;
  }
}

// Дуги для текста: сверху по часовой (буквы наружу), снизу против часовой (буквы внутрь, но не вверх ногами)
const top = `M${C - 90} ${C}A90 90 0 0 1 ${C + 90} ${C}`;
const bottom = `M${C - 101} ${C}A101 101 0 0 0 ${C + 101} ${C}`;
const ringR = 71;
const ring = `M${C - ringR} ${C}A${ringR} ${ringR} 0 1 1 ${C + ringR} ${C}A${ringR} ${ringR} 0 1 1 ${C - ringR} ${C}`;
const ringLen = f(2 * Math.PI * ringR - 10);

const svg = `<svg class="stamp" viewBox="0 0 240 240" role="img" aria-labelledby="stamp-title">
            <title id="stamp-title">Печать самозанятого: ${NAME}, ${BOTTOM}, плательщик НПД. QR-код открывает письмо на lerk@joulerk.ru</title>
            <defs>
              <path id="stamp-top" d="${top}"/>
              <path id="stamp-bottom" d="${bottom}"/>
              <path id="stamp-ring" d="${ring}"/>
              <filter id="stamp-ink" x="-5%" y="-5%" width="110%" height="110%">
                <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="2" seed="11" result="noise"/>
                <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -4 3.25" result="speckle"/>
                <feComposite in="SourceGraphic" in2="speckle" operator="in"/>
              </filter>
            </defs>
            <g class="stamp__ink" filter="url(#stamp-ink)">
              <circle cx="${C}" cy="${C}" r="114" fill="none" stroke-width="4"/>
              <circle cx="${C}" cy="${C}" r="107" fill="none" stroke-width="1.4"/>
              <circle cx="${C}" cy="${C}" r="84" fill="none" stroke-width="1.4"/>
              <circle cx="${C}" cy="${C}" r="64" fill="none" stroke-width="1.4"/>
              <circle cx="${C - 95}" cy="${C}" r="2.6"/>
              <circle cx="${C + 95}" cy="${C}" r="2.6"/>
              <text class="stamp__big"><textPath href="#stamp-top" startOffset="50%" text-anchor="middle">${NAME}</textPath></text>
              <text class="stamp__big"><textPath href="#stamp-bottom" startOffset="50%" text-anchor="middle">${BOTTOM}</textPath></text>
              <text class="stamp__small"><textPath href="#stamp-ring" textLength="${ringLen}" lengthAdjust="spacing">${RING}</textPath></text>
            </g>
            <rect class="stamp__qr-bg" x="${x0 - 3}" y="${y0 - 3}" width="${size + 6}" height="${size + 6}" rx="3"/>
            <path class="stamp__qr" d="${d}" shape-rendering="crispEdges"/>
          </svg>`;

const page = readFileSync(html, 'utf8');
const out = page.replace(/<!-- stamp:start -->[\s\S]*?<!-- stamp:end -->/, `<!-- stamp:start -->\n          ${svg}\n          <!-- stamp:end -->`);
if (out === page && !page.includes('<!-- stamp:start -->')) throw new Error('нет маркеров stamp:start / stamp:end в index.html');
writeFileSync(html, out);
console.log(`печать собрана: QR версии ${qr.version}, ${n}x${n} модулей, путь ${d.length} символов`);
