# Выкладка lerk.tech

Сайт статичный: на сервер едет только папка `public/`. PHP, база и cron не нужны.
Живёт на VPS метрики-ребенка рядом с метрикой и донну.рф. Общие у них только Xray и nginx.

| | |
| --- | --- |
| локально | `/Users/lerk/work/lerk.tech` |
| SSH | `metrika-rebenka` (`157.22.231.158`, AdminVPS), root |
| docroot | `/var/www/lerk.tech/public`, владелец `root:root`, каталоги 755, файлы 644 |
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
AAAA не нужна: у сервера нет IPv6. Проверка: `dig +short @8.8.8.8 lerk.tech A` отдаёт `157.22.231.158`.

## Выкладка файлов

```bash
rsync -rltz --delete public/ metrika-rebenka:/var/www/lerk.tech/public/
ssh metrika-rebenka 'chown -R root:root /var/www/lerk.tech && find /var/www/lerk.tech -type d -exec chmod 755 {} + && find /var/www/lerk.tech -type f -exec chmod 644 {} +'
```

После правки CSS или JS поменять `?v=` у `style.css` и `main.js` в `public/index.html` (и у `style.css` в `404.html`).

## Правка vhost

```bash
scp deploy/nginx-site-lerk.tech.conf metrika-rebenka:/etc/nginx/sites-available/site-lerk.tech
ssh metrika-rebenka 'nginx -t && systemctl reload nginx'
```

## Сертификат

Только после того, как A-записи смотрят на `157.22.231.158`, иначе Let's Encrypt постучится на парковку REG.RU.

```bash
ssh metrika-rebenka 'certbot certonly --webroot -w /var/www/acme -d lerk.tech -d www.lerk.tech'
```

Подключить к Xray один раз: скопировать пару в `/usr/local/etc/xray/certs/lerk.tech.*` (`install -o nobody -g nogroup`, ключ 640),
дописать её третьей в `certificates` у inbound `vless-tcp` (метрика остаётся первой, в `hy2-in` не добавлять),
проверить `xray run -test -config /usr/local/etc/xray/config.json`, затем `systemctl restart xray`.
Перед правкой сохранить копию `config.json` в `/root/`, не рядом с хуками.

Продление: хук `xray-certs.sh` копирует пару lerk.tech, если есть `/etc/letsencrypt/live/lerk.tech`, и перезапускает Xray.

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
```

Ждём: lerk.tech 200 по HTTP/2 и HTTP/1.1, http и www дают 301 на `https://lerk.tech/`, метрика и донну.рф 200.
Если метрика после правки молчит, выкладку не считать готовой и вернуть копию `config.json`.

После запуска: Яндекс.Вебмастер и Google Search Console, `https://lerk.tech/sitemap.xml`.
Превью ссылки в Telegram при смене `og.jpg` сбрасывает @WebpageBot.
