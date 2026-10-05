"""Собирает страницы услуг, «Частые вопросы» и микроразметку главной, sitemap.xml.

Тексты лежат в tools/pages.py. Запуск: python3 tools/build_pages.py
- public/<slug>/index.html для каждой услуги: шапка, подвал, иконки и счётчик Метрики берутся из public/index.html;
- в public/index.html блок вопросов между <!-- faq:start --> и <!-- faq:end -->, JSON-LD между <!-- ld:start --> и <!-- ld:end -->;
- public/sitemap.xml: главная и все услуги, <lastmod> из MAIN_UPDATED и updated.
После правки иконок (build_icons.py) или шапки главной скрипт нужно запустить ещё раз.
"""
import html
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
from pages import SITE, MAIN_UPDATED, MAIN_FAQ, SERVICES  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"
INDEX = PUBLIC / "index.html"
TG = "https://t.me/joulerkOFF"
PERSON_ID = f"{SITE}/#person"

esc = html.escape


def plain(s):
    """Текст ответа для JSON-LD: без тегов и сущностей."""
    return html.unescape(re.sub(r"<[^>]+>", "", s))


def between(text, start, end):
    i = text.index(start)
    return text[i:text.index(end, i) + len(end)]


def ld_script(data):
    body = json.dumps(data, ensure_ascii=False, indent=2).replace("</", "<\\/")
    return '<script type="application/ld+json">\n' + body + "\n  </script>"


def faq_ld(items, page_url):
    return {
        "@type": "FAQPage",
        "@id": page_url + "#faq",
        "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": plain(a)}}
            for q, a in items
        ],
    }


def faq_html(items, indent):
    pad = " " * indent
    out = []
    for q, a in items:
        out.append(f'{pad}<details class="faq__item reveal">\n'
                   f'{pad}  <summary>{esc(q)}</summary>\n'
                   f'{pad}  <div class="faq__answer"><p>{a}</p></div>\n'
                   f'{pad}</details>')
    return "\n".join(out)


def icon(name, cls="icon"):
    return f'<svg class="{cls}" aria-hidden="true"><use href="#i-{name}"></use></svg>'


# ---------- Общие куски с главной ----------
index = INDEX.read_text()
css_v = re.search(r'assets/css/style\.css\?v=([\w.-]+)', index).group(1)
js_v = re.search(r'assets/js/main\.js\?v=([\w.-]+)', index).group(1)
metrika = between(index, "<!-- Yandex.Metrika counter -->", "<!-- /Yandex.Metrika counter -->")
noscript = re.search(r"<noscript>.*?</noscript>", index[index.index("<body>"):], flags=re.S).group(0)
sprite = between(index, "<!-- icons:start -->", "<!-- icons:end -->")
symbol_src = {m.group(1): m.group(0) for m in re.finditer(r'(?s)<symbol id="i-([\w-]+)".*?</symbol>', sprite)}

# Шапка и подвал: ссылки на разделы ведут на главную, пути к файлам абсолютные
header = between(index, '<a class="skip"', "</header>")
header = header.replace('href="#top"', 'href="/"').replace('aria-label="lerk, в начало страницы"', 'aria-label="lerk, на главную"')
header = re.sub(r'href="#(?!main"|i-)', 'href="/#', header).replace('src="assets/', 'src="/assets/')
footer = re.sub(r'href="#(?!i-)', 'href="/#', between(index, '<footer class="foot">', "</footer>"))

PERSON_REF = {"@type": "Person", "@id": PERSON_ID, "name": "Дмитрий", "alternateName": "lerk", "url": f"{SITE}/"}


def page_url(s):
    return f"{SITE}/{s['slug']}/"


# ---------- Страница услуги ----------
def work_item(w):
    if "img" in w:
        cls = "project__thumb" + (" project__thumb--contain" if w.get("fit") == "contain" else "")
        thumb = (f'<img class="{cls}" src="/assets/img/{w["img"]}" alt="" '
                 f'width="{w.get("w", 640)}" height="{w.get("h", 400)}" loading="lazy">')
    else:
        thumb = f'<span class="project__thumb project__thumb--icon" aria-hidden="true">{icon(w["icon"])}</span>'
    if "title_html" in w:
        title = w["title_html"]
    elif w.get("url"):
        title = f'<a href="{w["url"]}" rel="noopener">{esc(w["title"])}</a>'
    else:
        title = esc(w["title"])
    role = '<p class="role role--sm role--own">Свой проект</p>' if w.get("own") else '<p class="role role--sm">Для заказчика</p>'
    return f"""        <li class="project reveal">
          {thumb}
          <div class="project__body">
            <h3 class="project__title">{title}</h3>
            <p>{w["text"]}</p>
            {role}
          </div>
        </li>"""


def service_page(s):
    url = page_url(s)
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Service",
                "@id": url + "#service",
                "name": s["h1"],
                "serviceType": s["crumb"],
                "description": s["description"],
                "url": url,
                "provider": PERSON_REF,
                "availableChannel": {"@type": "ServiceChannel", "serviceUrl": TG},
            },
            {
                "@type": "BreadcrumbList",
                "@id": url + "#breadcrumb",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Главная", "item": f"{SITE}/"},
                    {"@type": "ListItem", "position": 2, "name": s["crumb"], "item": url},
                ],
            },
            faq_ld(s["faq"], url),
        ],
    }
    includes = "\n".join(f"          <li>{esc(x)}</li>" for x in s["includes"])
    about = "\n".join(f"        <p>{p}</p>" for p in s["about"])
    stack = "".join(f"<li>{esc(x)}</li>" for x in s["stack"])
    works = "\n".join(work_item(w) for w in s["works"])
    support = ""
    if s.get("support"):
        rows = "\n".join(f'          <li><a href="{u}" rel="noopener">{esc(n)}</a> <span>{esc(d)}</span></li>'
                         for u, n, d in s["support"])
        support = f"""
      <div class="support reveal">
        <h3 class="support__title">Поддерживаю и дорабатываю</h3>
        <ul class="support__list">
{rows}
        </ul>
      </div>"""
    others = "\n".join(
        f'        <li><a class="svc-link" href="/{o["slug"]}/">{icon(o["icon"])}<span>{esc(o["crumb"])}</span>'
        f'{icon("arrow", "icon svc-link__arrow")}</a></li>'
        for o in SERVICES if o is not s)

    body = f"""{header}

<main id="main">
  <nav class="crumbs wrap" aria-label="Навигационная цепочка">
    <ol>
      <li><a href="/">Главная</a></li>
      <li><a href="/#services">Услуги</a></li>
      <li><span aria-current="page">{esc(s["crumb"])}</span></li>
    </ol>
  </nav>

  <section class="page-hero" aria-labelledby="page-title">
    <div class="wrap page-hero__grid">
      <div class="page-hero__copy">
        <h1 class="page-hero__title" id="page-title">{esc(s["h1"])}</h1>
        <p class="hero__lead">{esc(s["lead"])}</p>
        <div class="hero__cta">
          <a class="btn btn--primary" href="{TG}" rel="noopener">
            {icon("telegram")}
            <span>Написать в Telegram</span>
          </a>
          <a class="btn btn--ghost" href="#works">Смотреть примеры</a>
        </div>
      </div>
      <div class="mascot">
        <img src="/assets/img/avatar-sm.webp" srcset="/assets/img/avatar-sm.webp 440w, /assets/img/avatar.webp 880w" sizes="320px" alt="" width="440" height="440" fetchpriority="high">
        <p class="bubble">{esc(s["bubble"])}</p>
      </div>
    </div>
  </section>

  <section class="section section--sub" aria-labelledby="inc-title">
    <div class="wrap page-split">
      <div>
        <h2 class="section__title" id="inc-title">Что входит</h2>
        <ul class="checks checks--lg">
{includes}
        </ul>
      </div>
      <aside class="panel reveal" aria-labelledby="how-title">
        <h2 class="panel__title" id="how-title">Как делаю</h2>
{about}
        <h3 class="about__sub">Стек</h3>
        <ul class="chips">{stack}</ul>
      </aside>
    </div>
  </section>

  <section class="section section--sub section--band" id="works" aria-labelledby="works-title">
    <div class="wrap">
      <header class="section__head">
        <h2 class="section__title" id="works-title">{esc(s["works_title"])}</h2>
      </header>
      <ul class="projects">
{works}
      </ul>{support}
    </div>
  </section>

  <section class="section section--sub" id="faq" aria-labelledby="faq-title">
    <div class="wrap">
      <header class="section__head">
        <h2 class="section__title" id="faq-title">Частые вопросы</h2>
      </header>
      <div class="faq">
{faq_html(s["faq"], 8)}
      </div>
    </div>
  </section>

  <section class="section section--sub section--last" aria-labelledby="cta-title">
    <div class="wrap">
      <div class="cta reveal">
        <div>
          <h2 class="cta__title" id="cta-title">Расскажите о задаче</h2>
          <p>Пара фраз и ссылка на сайт, если он уже есть. Отвечаю сам: задам вопросы, назову срок и цену.</p>
        </div>
        <div class="cta__actions">
          <a class="btn btn--primary" href="{TG}" rel="noopener">
            {icon("telegram")}
            <span>Написать в Telegram</span>
          </a>
          <a class="btn btn--ghost" href="/#contact">Собрать задачу</a>
        </div>
      </div>

      <h2 class="subhead">Ещё могу помочь</h2>
      <ul class="svc-links">
{others}
      </ul>
    </div>
  </section>
</main>

{footer}

<script src="/assets/js/main.js?v={js_v}" defer></script>
</body>
</html>
"""
    used = sorted(set(re.findall(r'href="#i-([\w-]+)"', body)))
    missing = [u for u in used if u not in symbol_src]
    assert not missing, f"{s['slug']}: нет иконок в спрайте {missing}"
    page_sprite = ('<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">'
                   + "".join(symbol_src[u] for u in used) + "</svg>")

    title = esc(s["title"])
    desc = esc(s["description"])
    return f"""<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>{title}</title>
  <meta name="description" content="{desc}">
  <link rel="canonical" href="{url}">
  <meta name="theme-color" content="#d9c3a0" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#18130f" media="(prefers-color-scheme: dark)">
  <meta name="color-scheme" content="light dark">

  <meta property="og:type" content="website">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:url" content="{url}">
  <meta property="og:site_name" content="lerk.tech">
  <meta property="og:title" content="{esc(s["h1"])}">
  <meta property="og:description" content="{desc}">
  <meta property="og:image" content="{SITE}/og.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">

  <link rel="icon" href="/favicon-120.png" type="image/png" sizes="120x120">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">

  <link rel="preload" href="/assets/fonts/dela-gothic-one-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="preload" href="/assets/fonts/onest-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/assets/css/style.css?v={css_v}">
  <script>
    // Тема до отрисовки, чтобы не мигало: сохранённая вручную или системная.
    (function () {{
      var d = document.documentElement;
      d.classList.add('js');
      try {{
        var t = localStorage.getItem('theme');
        if (t === 'light' || t === 'dark') d.setAttribute('data-theme', t);
      }} catch (e) {{}}
    }})();
  </script>
  {ld_script(ld)}
  {metrika}
</head>
<body>
{noscript}
<!-- Собрано tools/build_pages.py из tools/pages.py, руками не править -->
{page_sprite}

{body}"""


# ---------- Главная: вопросы и JSON-LD ----------
def main_ld():
    person = {
        "@type": "Person",
        "@id": PERSON_ID,
        "name": "Дмитрий",
        "alternateName": "lerk",
        "url": f"{SITE}/",
        "image": f"{SITE}/assets/img/avatar.webp",
        "jobTitle": "Разработчик сайтов, ботов и ИИ-сервисов",
        "email": "mailto:lerk@joulerk.ru",
        "sameAs": ["https://t.me/joulerkOFF", "https://vk.com/ca7ana", "https://github.com/LerkOFF"],
        "knowsAbout": ["PHP", "Laravel", "Python", "JavaScript", "Telegram-боты", "ИИ-генерация изображений",
                       "ЮKassa", "Яндекс.Метрика", "nginx", "Docker"],
        "hasOfferCatalog": {
            "@type": "OfferCatalog",
            "name": "Услуги",
            "itemListElement": [
                {"@type": "Offer", "itemOffered": {"@type": "Service", "@id": page_url(s) + "#service",
                                                   "name": s["h1"], "url": page_url(s)}}
                for s in SERVICES
            ],
        },
    }
    website = {"@type": "WebSite", "@id": f"{SITE}/#website", "url": f"{SITE}/", "name": "lerk.tech",
               "inLanguage": "ru", "publisher": {"@id": PERSON_ID}}
    return {"@context": "https://schema.org", "@graph": [website, person, faq_ld(MAIN_FAQ, f"{SITE}/")]}


main_faq = f"""<!-- faq:start -->
  <!-- Частые вопросы: собирает tools/build_pages.py из tools/pages.py -->
  <section class="section" id="faq" aria-labelledby="faq-title">
    <div class="wrap">
      <header class="section__head">
        <h2 class="section__title" id="faq-title">Частые вопросы</h2>
      </header>
      <div class="faq">
{faq_html(MAIN_FAQ, 8)}
      </div>
    </div>
  </section>
  <!-- faq:end -->"""

index, n1 = re.subn(r"<!-- faq:start -->.*?<!-- faq:end -->", lambda m: main_faq, index, flags=re.S)
index, n2 = re.subn(r"<!-- ld:start -->.*?<!-- ld:end -->",
                    lambda m: "<!-- ld:start -->\n  " + ld_script(main_ld()) + "\n  <!-- ld:end -->", index, flags=re.S)
assert n1 == 1 and n2 == 1, "нет маркеров faq:start/faq:end или ld:start/ld:end"
INDEX.write_text(index)

# ---------- Страницы и sitemap ----------
for s in SERVICES:
    out = PUBLIC / s["slug"] / "index.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(service_page(s))

urls = [(f"{SITE}/", MAIN_UPDATED)] + [(page_url(s), s["updated"]) for s in SERVICES]
sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for loc, mod in urls:
    sitemap += ["  <url>", f"    <loc>{loc}</loc>", f"    <lastmod>{mod}</lastmod>", "  </url>"]
sitemap.append("</urlset>")
(PUBLIC / "sitemap.xml").write_text("\n".join(sitemap) + "\n")

print(f"страниц услуг: {len(SERVICES)}, вопросов на главной: {len(MAIN_FAQ)}, адресов в sitemap: {len(urls)}")
