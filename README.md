# lerk.tech

Лендинг Дмитрия Гайдаша (lerk): продажа услуг разработчика. Сайты, боты, ИИ-функции, интеграции, серверы.
Одна статичная страница без сборки и без бэкенда. Форма «Соберите задачу» не отправляет данные на сервер:
она собирает текст и открывает Telegram (`t.me/joulerkOFF?text=...`) или почтовую программу.

Документация: [docs/README.md](docs/README.md). Канон фактов о человеке и проектах: Obsidian, карточка `lerk.tech` в `Lerk/продукты`.
Локальная копия проекта: `/Users/lerk/work/lerk.tech`.

## Структура

| Путь | Что |
| --- | --- |
| `public/` | корень сайта, это и выкладывается на сервер |
| `public/index.html` | вся страница |
| `public/assets/css/style.css` | стили, токены светлой и тёмной темы в начале файла |
| `public/assets/js/main.js` | тема, меню, вкладки ИИ, появление блоков, копирование почты, сборка задачи |
| `public/assets/img/` | картинки, собирает `tools/build_images.py` |
| `public/assets/fonts/` | Dela Gothic One и Onest, только кириллица и латиница |
| `public/og.jpg` | превью ссылки 1200x630, собирает `tools/og.mjs` |
| `tools/` | скрипты скриншотов, картинок, иконок и проверок |
| `deploy/` | vhost nginx для сервера |
| `docs/` | документация страницы и выкладки |

## Запустить локально

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory public
```

Открыть http://127.0.0.1:8765. В Claude Code то же самое запускается из `.claude/launch.json` (имя `lerk-tech`).

## Инструменты

Один раз поставить зависимости (playwright-core берёт установленный Google Chrome, иконки Phosphor):

```bash
cd tools && npm install
```

| Команда | Зачем |
| --- | --- |
| `node tools/shoot.mjs` | заново снять скриншоты живых сайтов в `tools/raw` (cookie-баннеры прячутся, согласие не даётся) |
| `node tools/shoot-extra.mjs` | экран ИИ-помощника lodki.site, блог с ИИ-обложками, примеры гербов, статьи aqcentr.ru |
| `python3 tools/build_images.py` | собрать картинки сайта из `tools/raw` и аватара в Obsidian |
| `python3 tools/build_icons.py` | собрать спрайт иконок и вставить его в `index.html` |
| `node tools/og.mjs` | пересобрать `public/og.jpg` из `tools/og.html` |
| `node tools/smoke.mjs` | проверить интерактив: тема, вкладки, меню, копирование, форма, режим без JS |
| `node tools/review.mjs <url> <файл> <ширина> <высота> <light или dark>` | скриншот всей страницы для просмотра |
| `node tools/parts.mjs <папка> <ширина> <light или dark> <селектор>...` | скриншоты отдельных блоков |

Проверки гоняются на запущенном локальном сервере.

## Выложить на lerk.tech

Сайт живёт на VPS метрики-ребенка (SSH `metrika-rebenka`), docroot `/var/www/lerk.tech/public`, vhost `site-lerk.tech`.
Обновить файлы:

```bash
rsync -rltz --delete public/ metrika-rebenka:/var/www/lerk.tech/public/
```

Схема с Xray на 443, DNS на REG.RU, сертификат и проверки: [docs/deploy.md](docs/deploy.md).
