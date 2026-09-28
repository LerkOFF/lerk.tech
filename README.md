# lerk.tech

Исходники [lerk.tech](https://lerk.tech) — личного сайта Дмитрия. Лендинг рассказывает о разработке сайтов, ботов, ИИ-функций и интеграций, показывает работы и даёт возможность связаться напрямую.

Сайт статический: для просмотра и выкладки не нужны сборка, база данных или серверное приложение. Форма «Соберите задачу» составляет сообщение и открывает Telegram или почтовую программу. Данные формы не отправляются на сервер сайта и не сохраняются.

## Состав проекта

- `public/` — готовый сайт и корень веб-сервера: HTML, CSS, JavaScript, изображения, шрифты, иконки, robots.txt и sitemap.xml.
- `tools/` — скрипты подготовки изображений, иконок, превью, печати и проверки страницы. Зависимости инструментов описаны в `tools/package.json`.
- `deploy/` — образец конфигурации nginx для текущего VPS.
- `docs/` — [страница](docs/site.md) и [выкладка](docs/deploy.md); [индекс документации](docs/README.md).

## Запуск локально

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory public
```

Откройте <http://127.0.0.1:8765/>. Для изменения текста, стилей и поведения достаточно редактировать файлы в `public/`. После правки CSS или JavaScript обновите параметр `?v=` у подключений в `public/index.html` и `public/404.html`, чтобы браузеры получили новые файлы.

## Инструменты и проверка

Для скриптов из `tools/` нужны Node.js, Python 3 и установленный Google Chrome. Установите зависимости один раз:

```bash
npm ci --prefix tools
```

| Команда | Назначение |
| --- | --- |
| `node tools/smoke.mjs local` | Проверить локальную страницу без отдельного HTTP-сервера |
| `node tools/smoke.mjs https://lerk.tech/` | Проверить опубликованный сайт |
| `node tools/shoot.mjs` и `node tools/shoot-extra.mjs` | Снять скриншоты проектов в `tools/raw/` |
| `python3 tools/build_images.py` | Подготовить изображения из исходных скриншотов |
| `python3 tools/build_icons.py` | Обновить SVG-спрайт иконок |
| `node tools/build_stamp.mjs` | Обновить печать с QR-кодом в HTML |
| `node tools/og.mjs` | Пересобрать Open Graph изображение |
| `node tools/review.mjs <url> <файл> <ширина> <высота> <light или dark>` | Снять скриншот страницы |
| `node tools/parts.mjs <папка> <ширина> <light или dark> <селектор>...` | Снять отдельные блоки |

`tools/raw/` и `tools/node_modules/` не входят в Git. Готовые изображения уже лежат в `public/`; для обычной правки страницы пересобирать их не нужно. Некоторые скрипты подготовки изображений используют локальный аватар из Obsidian и потому зависят от авторского окружения.

## Обновление сайта

Исходники хранятся в `main` этого репозитория. На VPS `metrika-rebenka` рабочая копия находится в `/var/www/lerk.tech/repo`, а nginx отдаёт `/var/www/lerk.tech/repo/public`. После проверки локальных изменений:

```bash
git push origin main
ssh metrika-rebenka 'git -C /var/www/lerk.tech/repo pull --ff-only origin main'
```

Затем проверьте `https://lerk.tech/` и интерактив командой `node tools/smoke.mjs https://lerk.tech/`. Изменение конфигурации nginx требует отдельной проверки `nginx -t` и перезагрузки nginx. Подробности, особенности HTTPS через Xray и откат — в [инструкции по выкладке](docs/deploy.md).

## Связь

По задаче можно написать [в Telegram](https://t.me/joulerkOFF) или на [lerk@joulerk.ru](mailto:lerk@joulerk.ru).
