"""Проверка правила приватности постов блога. Запуск: python3 tools/check_blog.py

В постах (tools/blog.py и собранные public/blog/**/index.html, плюс блок «Блог» на главной) не должно быть:
ссылок и доменов, IP-адресов, @-ников, t.me, почты, длинного тире, стоп-слов (имена, заказчики, компании, города).
Шапка, подвал и кнопка «Написать в Telegram» - общий каркас сайта, их проверка не касается:
смотрим только контент поста и карточек (заголовок, герой, статья, сетка карточек), мета-теги и JSON-LD.
Код возврата 1, если что-то найдено. Стоп-слова легко дополнять: списки ниже.
"""
import json
import re
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from blog import POSTS  # noqa: E402
from pages import SERVICES  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

# Стоп-слова без учёта регистра, ищутся как подстрока (основы слов). Дополняйте.
STOP_STEMS = [
    # люди и заказчики
    "валентин", "савельев", "чхан", "дмитрий павлович", "гайдаш",
    # города, районы, организации
    "донецк", "донецки", "киевск", "макеевк", "ростов", "вятск", "донну", "донецкий",
    # аккаунты, домены и названия проектов, которые одновременно адрес или ссылка
    "joulerk", "lerk.tech", "lerkoff", "likvp", "karat", "карат", "aeza", "agecms", "invoice keeper", "invoice-keeper",
    "lodki", "metrika", "sanlux", "tabson", "slapi", "aqcentr", "energoproms", "rocketeda", "kosmos", "anonimku",
    "zaryanka", "gold777", "parkhotel", "парк-отель",
    # внутренняя кухня
    "obsidian", "vault", "claude", "codex", "cursor",
]
# Слова, которые нельзя ловить подстрокой, только целиком и с учётом регистра (иначе заденем обычные слова)
STOP_WORDS_CS = ["Тут", "Катя", "Кате", "Валя"]

URL_RE = re.compile(r"https?://|www\.", re.I)
DOMAIN_RE = re.compile(r"\b[\w-]+\.(ru|рф|com|tech|site|pw|su|net|org|io|dev|ai|shop|app|me|info|xyz)\b", re.I)
IPV4_RE = re.compile(r"\b\d{1,3}(?:\.\d{1,3}){3}\b")
AT_RE = re.compile(r"@\w")
TME_RE = re.compile(r"\bt\.me\b", re.I)
MAIL_RE = re.compile(r"mailto:|[\w.+-]+@[\w-]+\.[\w.-]+", re.I)
DASH = chr(0x2014)  # длинное тире

RULES = [("ссылка", URL_RE), ("домен", DOMAIN_RE), ("IP-адрес", IPV4_RE), ("@-ник", AT_RE),
         ("t.me", TME_RE), ("почта", MAIL_RE)]

# JSON-LD: эти ключи служебные (адреса сайта, типы, даты), остальное - текст
LD_SKIP = {"@id", "@type", "@context", "url", "item", "image", "mainEntityOfPage", "datePublished", "dateModified",
           "inLanguage", "alternateName", "sameAs", "email", "isPartOf", "publisher"}
# Поля данных поста, которые не являются текстом
DATA_SKIP = {"date", "cover", "related_service", "minutes"}

problems = []


ASSET_RE = re.compile(r"/assets/img/[\w.-]+")  # имена файлов картинок заданы договорённостью, в тексте их нет


def scan(where, text):
    text = ASSET_RE.sub("/assets/img/-", text)
    for name, rx in RULES:
        for m in rx.finditer(text):
            problems.append(f"{where}: {name}: «{m.group(0)}»")
    low = text.lower()
    for w in STOP_STEMS:
        if w in low:
            problems.append(f"{where}: стоп-слово: «{w}»")
    for w in STOP_WORDS_CS:
        if re.search(rf"\b{w}\b", text):
            problems.append(f"{where}: стоп-слово: «{w}»")
    if DASH in text:
        problems.append(f"{where}: длинное тире")


def walk(where, node):
    if isinstance(node, str):
        scan(where, node)
    elif isinstance(node, (list, tuple)):
        for i, x in enumerate(node):
            walk(f"{where}[{i}]", x)
    elif isinstance(node, dict):
        for k, v in node.items():
            if k not in DATA_SKIP:
                walk(f"{where}.{k}", v)


def walk_ld(where, node, key=""):
    if isinstance(node, str):
        if key not in LD_SKIP:
            scan(f"{where} JSON-LD {key}", node)
    elif isinstance(node, list):
        for x in node:
            walk_ld(where, x, key)
    elif isinstance(node, dict):
        for k, v in node.items():
            if k == "author":  # подпись автора на сайте одна: «Дмитрий»
                if not (isinstance(v, dict) and v.get("name") == "Дмитрий"):
                    problems.append(f"{where}: автор должен быть «Дмитрий»")
                continue
            walk_ld(where, v, k)


def check_data():
    services = {f"/{s['slug']}/" for s in SERVICES}
    slugs = set()
    for p in POSTS:
        where = f"blog.py[{p['slug']}]"
        walk(where, p)
        if p["slug"] in slugs:
            problems.append(f"{where}: повторяется slug")
        slugs.add(p["slug"])
        if not re.fullmatch(r"[a-z0-9-]+", p["slug"]):
            problems.append(f"{where}: slug только из латиницы, цифр и дефиса")
        if p["related_service"] and f"/{p['related_service']}/" not in services:
            problems.append(f"{where}: related_service не страница услуги")
        for _label, href in p.get("text_links", []):
            if href not in services:
                problems.append(f"{where}: text_links ведёт не на страницу услуги: {href}")
        if not 140 <= len(p["description"]) <= 170:
            problems.append(f"{where}: description {len(p['description'])} знаков, нужно около 150-160")


def regions(html):
    """Контент поста и карточек: всё, кроме шапки, подвала, спрайта и блока CTA."""
    out = []
    for pat in (r'<header class="blog-head.*?</header>', r'<figure class="blog-cover.*?</figure>',
                r'<article class="blog-prose.*?</article>', r'<ul class="blog-grid.*?</ul>',
                r'<ul class="svc-links">.*?</ul>', r'<nav class="blog-toc.*?</nav>'):
        out += re.findall(pat, html, flags=re.S)
    return out


def check_html(path):
    where = str(path.relative_to(PUBLIC))
    html = path.read_text()
    meta = [re.search(r"<title>(.*?)</title>", html, re.S).group(1)]
    for key in ('name="description"', 'property="og:title"', 'property="og:description"'):
        m = re.search(rf'<meta {key} content="([^"]*)"', html)
        meta.append(m.group(1) if m else "")
    for i, t in enumerate(meta):
        scan(f"{where} meta#{i}", t)
    parts = regions(html)
    if not parts:
        problems.append(f"{where}: не найден контент поста")
    for part in parts:
        scan(where, part)
        for href in re.findall(r'href="([^"]*)"', part):
            if not (href.startswith("/") or href.startswith("#")):
                problems.append(f"{where}: внешняя ссылка в контенте: «{href}»")
    for raw in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html, re.S):
        walk_ld(where, json.loads(raw.replace("<\\/", "</")))
    return 1


def check_home():
    html = (PUBLIC / "index.html").read_text()
    m = re.search(r"<!-- blog:start -->(.*?)<!-- blog:end -->", html, re.S)
    if not m:
        problems.append("index.html: нет маркеров blog:start/blog:end")
        return 0
    scan("index.html [блок Блог]", m.group(1))
    for href in re.findall(r'href="([^"]*)"', m.group(1)):
        if not href.startswith(("/", "#")):
            problems.append(f"index.html [блок Блог]: внешняя ссылка: «{href}»")
    return 1


check_data()
files = 1 + check_home()
for path in sorted((PUBLIC / "blog").glob("**/index.html")):
    files += check_html(path)

if problems:
    print(f"check_blog: НАЙДЕНО нарушений: {len(problems)}")
    for line in dict.fromkeys(problems):
        print("  - " + line)
    sys.exit(1)
print(f"check_blog: ok, постов {len(POSTS)}, проверено файлов {files}, нарушений нет")
