"""Собирает страницы услуг, «Частые вопросы» и микроразметку главной, sitemap.xml.

Тексты лежат в tools/pages.py. Запуск: python3 tools/build_pages.py
- public/<slug>/index.html для каждой услуги: шапка, подвал, иконки и счётчик Метрики берутся из public/index.html;
- в public/index.html блок вопросов между <!-- faq:start --> и <!-- faq:end -->, JSON-LD между <!-- ld:start --> и <!-- ld:end -->;
- блог: public/blog/index.html и public/blog/<slug>/index.html из tools/blog.py (POSTS), блок «Блог» на главной между
  <!-- blog:start --> и <!-- blog:end -->; в конце запускается tools/check_blog.py (правило приватности постов);
- public/sitemap.xml: главная, услуги, блог и посты, <lastmod> из MAIN_UPDATED, updated и даты поста.
После правки иконок (build_icons.py) или шапки главной скрипт нужно запустить ещё раз.
"""
import html
import json
import os
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

sys.dont_write_bytecode = True
from pages import SITE, MAIN_UPDATED, MAIN_FAQ, SERVICES  # noqa: E402
from blog import POSTS  # noqa: E402

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
        rows = []
        for item in s["support"]:
            u, n, d = item[:3]
            if len(item) > 3:
                assert (PUBLIC / "assets" / "img" / item[3]).exists(), f"{s['slug']}: нет картинки public/assets/img/{item[3]}"
                rows.append(f'          <li class="support__item"><img class="support__thumb" src="/assets/img/{item[3]}" alt="" '
                            f'width="96" height="60" loading="lazy"><span class="support__text">'
                            f'<a href="{u}" rel="noopener">{esc(n)}</a> <span>{esc(d)}</span></span></li>')
            else:
                rows.append(f'          <li><a href="{u}" rel="noopener">{esc(n)}</a> <span>{esc(d)}</span></li>')
        rows = "\n".join(rows)
        has_thumbs = any(len(i) > 3 for i in s["support"])
        support = f"""
      <div class="support reveal">
        <h3 class="support__title">Поддерживаю и дорабатываю</h3>
        <ul class="support__list{" support__list--thumbs" if has_thumbs else ""}">
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
  <meta name="theme-color" content="#faf8f5" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#121215" media="(prefers-color-scheme: dark)">
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

  <link rel="preload" href="/assets/fonts/unbounded-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
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


# ---------- Блог ----------
MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
POSTS_SORTED = sorted(POSTS, key=lambda p: p["date"], reverse=True)  # сортировка устойчивая: при равных датах порядок списка
BLOG_URL = f"{SITE}/blog/"
BLOG_UPDATED = max(p["date"] for p in POSTS)
ALLOW_MISSING_IMG = os.environ.get("ALLOW_MISSING_IMG") == "1"  # только для вёрстки, пока картинок нет
BLOG_DESC = ("Пишу о проектах, которые сделал сам: карта света, сервис напоминаний, зеркало мессенджеров и открытая CMS. "
             "Что получилось и что пока нет.")


def need_img(name):
    """Картинка обязана лежать в public/assets/img, иначе сборка падает с понятным сообщением."""
    if not (PUBLIC / "assets" / "img" / name).exists() and not ALLOW_MISSING_IMG:
        raise SystemExit(f"нет картинки public/assets/img/{name}: положите файл или дождитесь build_images.py")
    return name


def ru_date(iso):
    d = date.fromisoformat(iso)
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def post_url(p):
    return f"{SITE}/blog/{p['slug']}/"


TRANSLIT = dict(zip("абвгдеёжзийклмнопрстуфхцчшщъыьэюя", ["a", "b", "v", "g", "d", "e", "e", "zh", "z", "i", "y", "k", "l", "m", "n", "o", "p", "r", "s", "t", "u", "f", "h", "c", "ch", "sh", "sch", "", "y", "", "e", "yu", "ya"]))


def anchor_id(text, taken):
    base = re.sub(r"[^a-z0-9]+", "-", "".join(TRANSLIT.get(c, c) for c in text.lower())).strip("-") or "section"
    out, n = base, 2
    while out in taken:
        out, n = f"{base}-{n}", n + 1
    taken.add(out)
    return out


def blog_meta(p, cls="blog-meta"):
    return (f'<p class="{cls}"><span class="role role--sm role--own">{esc(p["tag"])}</span>'
            f'<time datetime="{p["date"]}">{ru_date(p["date"])}</time>'
            f'<span>{p["minutes"]} мин чтения</span></p>')


def blog_card(p, i=0):
    cover = need_img(p["cover"] + "-sm.webp")
    return f"""        <li class="blog-card reveal" style="--i:{i}">
          <div class="blog-card__media"><img class="blog-card__cover" src="/assets/img/{cover}" alt="" width="640" height="336" loading="lazy"></div>
          <div class="blog-card__body">
            {blog_meta(p)}
            <h3 class="blog-card__title"><a href="/blog/{p["slug"]}/">{esc(p["title"])}</a></h3>
            <p class="blog-card__text">{esc(p["description"])}</p>
            <p class="blog-card__more">Читать пост{icon("arrow")}</p>
          </div>
        </li>"""


def blog_grid(posts, cls):
    return f'      <ul class="blog-grid {cls}">\n' + "\n".join(blog_card(p, i) for i, p in enumerate(posts)) + "\n      </ul>"


def cta_block():
    return f"""      <div class="cta reveal">
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
      </div>"""


def blog_header():
    return header.replace('<a href="/blog/">Блог</a>', '<a href="/blog/" aria-current="page">Блог</a>')


def blog_page(*, title, desc, url, og_title, og_type, og_image, extra_meta, ld, body):
    """Оболочка страницы блога: head как у страниц услуг, спрайт только с нужными иконками."""
    used = sorted(set(re.findall(r'href="#i-([\w-]+)"', header + body + footer)))
    missing = [u for u in used if u not in symbol_src]
    assert not missing, f"{url}: нет иконок в спрайте {missing}"
    page_sprite = ('<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">'
                   + "".join(symbol_src[u] for u in used) + "</svg>")
    return f"""<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(desc)}">
  <link rel="canonical" href="{url}">
  <meta name="theme-color" content="#faf8f5" media="(prefers-color-scheme: light)">
  <meta name="theme-color" content="#121215" media="(prefers-color-scheme: dark)">
  <meta name="color-scheme" content="light dark">

  <meta property="og:type" content="{og_type}">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:url" content="{url}">
  <meta property="og:site_name" content="lerk.tech">
  <meta property="og:title" content="{esc(og_title)}">
  <meta property="og:description" content="{esc(desc)}">
  <meta property="og:image" content="{og_image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
{extra_meta}  <meta name="twitter:card" content="summary_large_image">

  <link rel="icon" href="/favicon-120.png" type="image/png" sizes="120x120">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/site.webmanifest">

  <link rel="preload" href="/assets/fonts/unbounded-cyrillic.woff2" as="font" type="font/woff2" crossorigin>
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
<!-- Собрано tools/build_pages.py из tools/blog.py, руками не править -->
{page_sprite}

{blog_header()}

{body}

{footer}

<script src="/assets/js/main.js?v={js_v}" defer></script>
</body>
</html>
"""


def crumbs(*items):
    lis = "\n".join(f'      <li><a href="{u}">{esc(n)}</a></li>' if u else f'      <li><span aria-current="page">{esc(n)}</span></li>'
                    for n, u in items)
    return f"""  <nav class="crumbs wrap" aria-label="Навигационная цепочка">
    <ol>
{lis}
    </ol>
  </nav>"""


def blog_post_page(p):
    url = post_url(p)
    cover = need_img(p["cover"] + ".webp")
    cover_sm = need_img(p["cover"] + "-sm.webp")
    svc = {x["slug"]: x for x in SERVICES}[p["related_service"]]
    taken, toc, parts = set(), [], []
    words = len(plain(" ".join([p["lead"]] + p["short"])).split())
    for sec in p["sections"]:
        sid = anchor_id(sec["h2"], taken)
        toc.append(f'          <li><a href="#{sid}">{esc(sec["h2"])}</a></li>')
        out = [f'<h2 id="{sid}">{esc(sec["h2"])}<a class="blog-anchor" href="#{sid}" aria-label="Ссылка на раздел «{esc(sec["h2"])}»">#</a></h2>']
        words += len(sec["h2"].split())
        for kind, val in sec["blocks"]:
            if kind == "p":
                out.append(f"<p>{val}</p>"); words += len(plain(val).split())
            elif kind in ("ul", "ol"):
                out.append(f"<{kind}>\n" + "\n".join(f"  <li>{x}</li>" for x in val) + f"\n</{kind}>")
                words += sum(len(plain(x).split()) for x in val)
            elif kind == "quote":
                out.append(f"<blockquote><p>{val}</p></blockquote>"); words += len(plain(val).split())
            else:
                raise ValueError(f"{p['slug']}: неизвестный блок {kind}")
        parts.append("\n".join(out))
    prose = "\n\n".join(parts)
    facts = "\n".join(f"          <li>{x}</li>" for x in p["short"])

    more = [x for x in POSTS_SORTED if x is not p]
    related = [(svc["crumb"], f"/{svc['slug']}/", svc["icon"])]
    by_href = {f"/{x['slug']}/": x for x in SERVICES}
    for label, href in p.get("text_links", []):
        related.append((label, href, by_href[href]["icon"] if href in by_href else "arrow"))
    related_html = "\n".join(
        f'        <li><a class="svc-link" href="{h}">{icon(ic)}<span>{esc(n)}</span>{icon("arrow", "icon svc-link__arrow")}</a></li>'
        for n, h, ic in related)

    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BlogPosting",
                "@id": url + "#post",
                "headline": p["h1"],
                "description": p["description"],
                "url": url,
                "mainEntityOfPage": url,
                "inLanguage": "ru",
                "datePublished": p["date"],
                "dateModified": p["date"],
                "articleSection": p["tag"],
                "wordCount": words,
                "image": f"{SITE}/assets/img/{cover}",
                "author": PERSON_REF,
                "publisher": {"@id": PERSON_ID},
                "isPartOf": {"@id": BLOG_URL + "#blog"},
            },
            {
                "@type": "BreadcrumbList",
                "@id": url + "#breadcrumb",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Главная", "item": f"{SITE}/"},
                    {"@type": "ListItem", "position": 2, "name": "Блог", "item": BLOG_URL},
                    {"@type": "ListItem", "position": 3, "name": p["crumb"], "item": url},
                ],
            },
        ],
    }
    body = f"""<main id="main">
{crumbs(("Главная", "/"), ("Блог", "/blog/"), (p["crumb"], None))}

  <header class="blog-head blog-narrow">
    {blog_meta(p)}
    <h1 class="blog-head__title" id="page-title">{esc(p["h1"])}</h1>
    <p class="blog-head__lead">{esc(p["lead"])}</p>
    <p class="blog-by"><img class="blog-by__face" src="/assets/img/avatar-sm.webp" alt="" width="36" height="36"><span>Дмитрий</span></p>
  </header>

  <figure class="blog-cover blog-narrow">
    <img src="/assets/img/{cover_sm}" srcset="/assets/img/{cover_sm} 640w, /assets/img/{cover} 1200w" sizes="(max-width: 1020px) 100vw, 980px" alt="{esc(p["cover_alt"])}" width="1200" height="630" fetchpriority="high">
  </figure>

  <div class="blog-layout blog-narrow">
    <nav class="blog-toc" aria-label="Содержание">
      <p class="blog-toc__title">Содержание</p>
      <ol>
{chr(10).join(toc)}
      </ol>
    </nav>
    <article class="blog-prose" aria-labelledby="page-title">
      <aside class="blog-facts" aria-label="Коротко">
        <p class="blog-facts__title">Коротко</p>
        <ul class="checks">
{facts}
        </ul>
      </aside>

{prose}
    </article>
  </div>

  <section class="section section--sub section--last" aria-labelledby="cta-title">
    <div class="wrap">
{cta_block()}

      <h2 class="subhead">Заказать похожее</h2>
      <ul class="svc-links">
{related_html}
      </ul>

      <h2 class="subhead">Ещё посты</h2>
{blog_grid(more, "blog-grid--more")}
    </div>
  </section>
</main>"""
    return blog_page(title=f'{p["title"]} | Блог Дмитрия', desc=p["description"], url=url, og_title=p["h1"], og_type="article",
                     og_image=f"{SITE}/assets/img/{cover}",
                     extra_meta=(f'  <meta property="article:published_time" content="{p["date"]}">\n'
                                 f'  <meta property="article:author" content="Дмитрий">\n'
                                 f'  <meta property="article:section" content="{esc(p["tag"])}">\n'),
                     ld=ld, body=body)


def blog_index_page():
    cover = need_img(POSTS_SORTED[0]["cover"] + ".webp")
    ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Blog",
                "@id": BLOG_URL + "#blog",
                "name": "Блог Дмитрия",
                "description": BLOG_DESC,
                "url": BLOG_URL,
                "inLanguage": "ru",
                "author": PERSON_REF,
                "publisher": {"@id": PERSON_ID},
                "blogPost": [{"@type": "BlogPosting", "@id": post_url(p) + "#post", "headline": p["h1"], "url": post_url(p),
                              "datePublished": p["date"]} for p in POSTS_SORTED],
            },
            {
                "@type": "BreadcrumbList",
                "@id": BLOG_URL + "#breadcrumb",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "Главная", "item": f"{SITE}/"},
                    {"@type": "ListItem", "position": 2, "name": "Блог", "item": BLOG_URL},
                ],
            },
        ],
    }
    body = f"""<main id="main">
{crumbs(("Главная", "/"), ("Блог", None))}

  <section class="page-hero" aria-labelledby="page-title">
    <div class="wrap page-hero__grid">
      <div class="page-hero__copy">
        <h1 class="page-hero__title" id="page-title">Блог</h1>
        <p class="hero__lead">Пишу о том, что сделал сам: как устроено, на чём построено и что пока не получилось.</p>
      </div>
      <div class="mascot">
        <img src="/assets/img/avatar-sm.webp" srcset="/assets/img/avatar-sm.webp 440w, /assets/img/avatar.webp 880w" sizes="320px" alt="" width="440" height="440" fetchpriority="high">
        <p class="bubble">Без воды, с цифрами и честными минусами</p>
      </div>
    </div>
  </section>

  <section class="section section--sub" aria-label="Посты">
    <div class="wrap">
{blog_grid(POSTS_SORTED, "blog-grid--index")}
    </div>
  </section>

  <section class="section section--sub section--last" aria-labelledby="cta-title">
    <div class="wrap">
{cta_block()}
    </div>
  </section>
</main>"""
    return blog_page(title="Блог Дмитрия: как я делаю сайты, ботов и ИИ-сервисы", desc=BLOG_DESC, url=BLOG_URL, og_title="Блог Дмитрия",
                     og_type="website", og_image=f"{SITE}/assets/img/{cover}", extra_meta="", ld=ld, body=body)


HOME_POSTS = POSTS_SORTED[:4]
home_blog = f"""<!-- blog:start -->
  <!-- Блог: собирает tools/build_pages.py из tools/blog.py -->
  <section class="section section--band" id="blog" aria-labelledby="blog-title">
    <div class="wrap">
      <header class="section__head">
        <h2 class="section__title" id="blog-title">Блог</h2>
        <p class="section__lead">Пишу о том, что сделал сам: как устроено и что пока не получилось.</p>
      </header>
{blog_grid(HOME_POSTS, "blog-grid--home")}
      <p class="blog-all"><a class="btn btn--ghost" href="/blog/">Весь блог</a></p>
    </div>
  </section>
  <!-- blog:end -->"""


# ---------- Главная: вопросы и JSON-LD ----------
def main_ld():
    person = {
        "@type": "Person",
        "@id": PERSON_ID,
        "name": "Дмитрий",
        "alternateName": "lerk",
        "url": f"{SITE}/",
        "image": f"{SITE}/assets/img/avatar.webp",
        "jobTitle": "Разработчик ИИ-автоматизации, ботов и сайтов",
        "email": "mailto:lerk@joulerk.ru",
        "sameAs": ["https://t.me/joulerkOFF", "https://vk.com/ca7ana", "https://github.com/LerkOFF"],
        "knowsAbout": ["ИИ-автоматизация бизнеса", "ИИ-агенты", "PHP", "Laravel", "Python", "JavaScript", "Telegram-боты", "ИИ-генерация изображений",
                       "ЮKassa", "Яндекс.Метрика", "nginx", "Docker", "C++", "C#", "SQL", "FastAPI", "Redis",
                       "PostgreSQL"],
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
index, n3 = re.subn(r"<!-- blog:start -->.*?<!-- blog:end -->", lambda m: home_blog, index, flags=re.S)
assert n1 == 1 and n2 == 1 and n3 == 1, "нет маркеров faq:start/faq:end, ld:start/ld:end или blog:start/blog:end"
INDEX.write_text(index)

# ---------- Страницы и sitemap ----------
for s in SERVICES:
    out = PUBLIC / s["slug"] / "index.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(service_page(s))

(PUBLIC / "blog").mkdir(exist_ok=True)
(PUBLIC / "blog" / "index.html").write_text(blog_index_page())
for p in POSTS:
    out = PUBLIC / "blog" / p["slug"] / "index.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(blog_post_page(p))

urls = ([(f"{SITE}/", MAIN_UPDATED)] + [(page_url(s), s["updated"]) for s in SERVICES]
        + [(BLOG_URL, BLOG_UPDATED)] + [(post_url(p), p["date"]) for p in POSTS_SORTED])
sitemap = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for loc, mod in urls:
    sitemap += ["  <url>", f"    <loc>{loc}</loc>", f"    <lastmod>{mod}</lastmod>", "  </url>"]
sitemap.append("</urlset>")
(PUBLIC / "sitemap.xml").write_text("\n".join(sitemap) + "\n")

print(f"страниц услуг: {len(SERVICES)}, постов блога: {len(POSTS)}, вопросов на главной: {len(MAIN_FAQ)}, адресов в sitemap: {len(urls)}")

# Правило приватности постов: сборка считается неудачной, если проверка не прошла
check = subprocess.run([sys.executable, "-B", str(ROOT / "tools" / "check_blog.py")], capture_output=True, text=True)
sys.stdout.write(check.stdout)
if check.returncode != 0:
    sys.stderr.write(check.stderr)
    raise SystemExit("check_blog.py: в постах блога найдено то, чего там быть не должно (см. список выше). Поправьте tools/blog.py и соберите снова.")
