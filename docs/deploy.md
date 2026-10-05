# Выкладка lerk.tech

Сайт статичный: nginx отдаёт папку `public/` из серверной Git-копии. PHP, база и cron не нужны.
Живёт на VPS метрики-ребенка рядом с метрикой и донну.рф. Общие у них только Xray и nginx.

| | |
| --- | --- |
| локально | `/Users/lerk/work/web/lerk.tech` |
| GitHub | `git@github.com:LerkOFF/lerk.tech.git`, ветка `main` |
| серверная копия | `/var/www/lerk.tech/repo` |
| SSH | `metrika-rebenka` (`157.22.231.158`, AdminVPS), root |
| docroot | `/var/www/lerk.tech/repo/public`, владелец `root:root`, каталоги 755, файлы 644 |
| nginx vhost | `/etc/nginx/sites-available/site-lerk.tech`, симлинк в `sites-enabled` с тем же именем. Шаблон в проекте: `deploy/nginx-site-lerk.tech.conf` |
| ACME webroot | `/var/www/acme` (общий с донну.рф) |
| Xray | `/usr/local/etc/xray/config.json`, публичный TCP и UDP 443 |
| копия сертификата для Xray | `/usr/local/etc/xray/certs/lerk.tech.{fullchain,privkey}.pem`, владелец `nobody` |
| хук продления | `/etc/letsencrypt/renewal-hooks/deploy/xray-certs.sh` |
| домен | REG.RU, куплен 27.09.2026, NS `ns1.reg.ru` и `ns2.reg.ru` |

## Как устроено

Браузер приходит на 443 в Xray. Xray снимает TLS своим сертификатом (выбирает по имени сайта) и по ALPN отдаёт
расшифрованный HTTP на localhost: `h2` на `127.0.0.1:8081`, остальное на `127.0.0.1:8082`, оба с PROXY v2.
Дальше nginx выбирает vhost по `Host`. На порту 80 nginx отдаёт только ACME и 301 на `https://lerk.tech`.
`www.lerk.tech` отвечает 301 на apex.

Файл vhost назван `site-lerk.tech`, чтобы грузиться после `metrika`. У портов 80, 8081 и 8082 нет `default_server`,
запросы без известного Host (по IP, пробы маскировки Happ) отдаёт первый загруженный vhost, и это должна остаться метрика.

Чего не трогать: vhost метрики `/etc/nginx/sites-enabled/metrika`, её сертификат (первый в списке Xray),
inbound `hy2-in`, клиентов Happ, UDP 443, порт 4443. Плагин nginx у certbot не использовать: он повесит 443 на nginx, и Xray не встанет.
`systemctl restart xray` на пару секунд рвёт Happ метрики.

## DNS на REG.RU

Зона `lerk.tech`, раздел «DNS-серверы и управление зоной». NS не менять.

| Хост | Тип | Значение |
| --- | --- | --- |
| `@` | A | `157.22.231.158` |
| `www` | A | `157.22.231.158` |

По умолчанию REG.RU ставит обе записи на свою парковку `95.163.244.138`: их заменить, а не добавлять рядом.
AAAA не нужна: у сервера нет IPv6.

Записи стоят с 27.09.2026: `ns1.reg.ru`, `ns2.reg.ru` и публичные DNS (Google, Cloudflare, Яндекс, Quad9) отдают `157.22.231.158`.
TTL у REG.RU 86400, поэтому кэш, успевший взять парковку, держит её до суток.
Если на Mac три разных DNS отдают парковку с одинаковым остатком TTL, запросы перехватывает роутер или VPN: проверять с сервера.

```bash
ssh metrika-rebenka 'dig +short @8.8.8.8 lerk.tech A'
```

## Обновление из Git

Локально проверить изменения и отправить `main` в GitHub. На сервере обновлять только быстрым перемещением вперёд:

```bash
git push origin main
ssh metrika-rebenka 'git -C /var/www/lerk.tech/repo pull --ff-only origin main'
```

Папка `/var/www/lerk.tech/public` сохранена как резервная копия первоначальной выкладки. nginx использует `/var/www/lerk.tech/repo/public`. Не редактировать отслеживаемые файлы на сервере: следующая выкладка должна приходить из Git. Скрипты `tools/` и документация доступны в серверной копии, но не обслуживаются nginx.

После правки CSS или JS поменять `?v=` у `style.css` и `main.js` в `public/index.html` (и у `style.css` в `404.html`).

Откат к предыдущему коммиту: сохранить SHA нужного коммита, сделать `git revert` локально, запушить и выполнить ту же команду `pull --ff-only`. Если нужно срочно вернуться к исходной файловой выкладке, вернуть `root /var/www/lerk.tech/public;` в vhost, проверить `nginx -t` и перезагрузить nginx.

## Правка vhost

```bash
scp deploy/nginx-site-lerk.tech.conf metrika-rebenka:/etc/nginx/sites-available/site-lerk.tech
ssh metrika-rebenka 'nginx -t && systemctl reload nginx'
```

## Сертификат

Выпущен 27.09.2026, действует до 26.12.2026, имена `lerk.tech` и `www.lerk.tech`.
Пара Let's Encrypt: `/etc/letsencrypt/live/lerk.tech/`. Копия для Xray: `/usr/local/etc/xray/certs/lerk.tech.fullchain.pem` и `lerk.tech.privkey.pem`, владелец `nobody`, ключ 640.
Это третья пара в `certificates` у `vless-tcp`. В `hy2-in` её нет. Метрика остаётся первой.
Хук `/etc/letsencrypt/renewal-hooks/deploy/xray-certs.sh` копирует пару, если каталог live есть, и перезапускает Xray.

Проверка на сам сервер в обход DNS: `curl --resolve lerk.tech:443:157.22.231.158 https://lerk.tech/`.

Повторный выпуск:

```bash
ssh metrika-rebenka 'certbot certonly --webroot -w /var/www/acme -d lerk.tech -d www.lerk.tech'
```

Перед ручной правкой `config.json` копию класть в `/root/`. После правки `xray run -test -config /usr/local/etc/xray/config.json`, затем `systemctl restart xray`.

## Проверка

```bash
ssh metrika-rebenka 'systemctl is-active xray nginx'
curl -sS -o /dev/null -w "%{http_code} %{http_version}\n" --http2 https://lerk.tech/
curl -sS -o /dev/null -w "%{http_code} %{http_version}\n" --http1.1 https://lerk.tech/
curl -sS -o /dev/null -w "%{http_code} %{redirect_url}\n" http://lerk.tech/
curl -sS -o /dev/null -w "%{http_code} %{redirect_url}\n" https://www.lerk.tech/
curl -sS -o /dev/null -w "%{http_code}\n" --http2 --resolve xn----7sbbdrcbtsfnu5aey.xn--p1ai:443:157.22.231.158 https://xn----7sbbdrcbtsfnu5aey.xn--p1ai/
curl -sS -o /dev/null -w "%{http_code}\n" --http2 --resolve xn--d1asac1a.xn--p1ai:443:157.22.231.158 https://xn--d1asac1a.xn--p1ai/
node tools/smoke.mjs https://lerk.tech/
RESOLVE_IP=157.22.231.158 node tools/smoke.mjs https://lerk.tech/   # то же в обход DNS-кэша
```

Ждём: lerk.tech 200 по HTTP/2 и HTTP/1.1, http и www дают 301 на `https://lerk.tech/`, метрика и донну.рф 200.
Если метрика после правки молчит, выкладку не считать готовой и вернуть копию `config.json`.

После запуска: Яндекс.Вебмастер и Google Search Console, `https://lerk.tech/sitemap.xml`.
Яндекс.Метрика подключена 05.10.2026, счётчик `113438654`, код в `index.html` и `404.html`: [описание](site.md#яндексметрика).
Превью ссылки в Telegram при смене `og.jpg` сбрасывает @WebpageBot.
