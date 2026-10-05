"""Готовит картинки сайта из tools/raw в public/assets/img.

Запуск: python3 tools/build_images.py
Исходники: скриншоты (tools/shoot*.mjs), картинки гербов, шаблонов метрики,
ИИ-обложек lodki.site, экран приложения из App Store и аватар из Obsidian
(Lerk/Аватар/discord.png). В public/assets/img остаются только файлы,
собранные этим скриптом: остальные .webp удаляются, чтобы на сервер не ехал лишний вес.
Новую картинку для страницы добавлять в списки ниже, а не класть руками.
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "tools" / "raw"
IMG = ROOT / "public" / "assets" / "img"
PUB = ROOT / "public"
AVATAR = Path("/Users/lerk/Obsidian/value/Lerk/Аватар/discord.png")

# Скриншоты сайтов 16:10: имя -> (исходник, нужен крупный 1200px, нужен мелкий 640px)
SITES = {
    "metrika": ("metrika-desk.png", True, True),
    "lodki": ("lodki-desk.png", True, True),
    "parkhotel": ("parkhotel-desk.png", True, False),
    "tabson": ("tabson-desk.png", False, True),
    "slapi": ("slapi-desk.png", False, True),
    "sanlux": ("aqcentr-desk.png", False, True),
    "ss14": ("ss14-desk.png", False, True),
}
# Экраны телефонов
PHONES = {
    "assistant": "lodki-assistant-mob.png",
    "donnu": "donnu-mob.png",
    "app": "app/app2.jpg",
}
# Гербы без лиц людей: Салдушкины, Рудак, Салдушкин
GERBS = ["42034", "42046", "42033"]
# Шаблоны метрики с тестовыми данными «Артём» / «София»
TEMPLATES = ["ezhik-malchik", "kit-malchik", "belchonok-devochka", "podvodnaya-lodka"]
# ИИ-обложки статей lodki.site
COVERS = [
    "kilevatye-6-metrov-20260926083422",
    "motornaia-lodka-2-metra-20260927163326",
    "iaxta-more-20260925203421",
]

IMG.mkdir(parents=True, exist_ok=True)
made = []


def save(im, name, width, height=None, q=80):
    im = im.convert("RGB")
    if height is None:
        height = round(im.height * width / im.width)
    im.resize((width, height), Image.LANCZOS).save(IMG / name, "WEBP", quality=q, method=6)
    made.append(name)


def crop_ratio(im, ratio, top=0.0):
    """Обрезает до соотношения ratio (ширина/высота), по вертикали сдвиг top (0..1)."""
    w, h = im.size
    if w / h > ratio:
        nw = round(h * ratio)
        x = (w - nw) // 2
        return im.crop((x, 0, x + nw, h))
    nh = round(w / ratio)
    y = round((h - nh) * top)
    return im.crop((0, y, w, y + nh))


for name, (src, big, small) in SITES.items():
    im = crop_ratio(Image.open(RAW / src), 16 / 10)
    if big:
        save(im, f"site-{name}.webp", 1200, 750, q=78)
    if small:
        save(im, f"site-{name}-sm.webp", 640, 400, q=76)

for name, src in PHONES.items():
    save(crop_ratio(Image.open(RAW / src), 390 / 844), f"phone-{name}.webp", 520, 1125)

for i, gid in enumerate(GERBS, 1):
    save(Image.open(RAW / "gerbs" / f"{gid}.webp"), f"gerb-{i}.webp", 560, 560)

for i, t in enumerate(TEMPLATES, 1):
    save(Image.open(RAW / "metrika" / f"{t}.webp"), f"tpl-{i}.webp", 420, 560)

for i, c in enumerate(COVERS, 1):
    save(Image.open(RAW / "lodki-ai" / f"{c}.jpg"), f"cover-{i}.webp", 560, 560)

# Аватар и иконки сайта
av = Image.open(AVATAR).convert("RGB")
save(av, "avatar.webp", 880, 880, q=82)
save(av, "avatar-sm.webp", 440, 440)

face = av.crop((150, 110, 870, 830))  # лицо и волосы, квадрат


def round_icon(size):
    ic = face.resize((size, size), Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
    ic.putalpha(mask.resize((size, size), Image.LANCZOS))
    return ic


round_icon(32).save(PUB / "favicon-32.png")
round_icon(120).save(PUB / "favicon-120.png", optimize=True)  # Яндекс берёт в выдачу 120 × 120
round_icon(192).save(PUB / "icon-192.png")
round_icon(512).save(PUB / "icon-512.png")
round_icon(48).save(PUB / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
face.resize((180, 180), Image.LANCZOS).save(PUB / "apple-touch-icon.png")

# Убираем то, что скрипт больше не собирает
removed = [p.name for p in IMG.glob("*.webp") if p.name not in made]
for name in removed:
    (IMG / name).unlink()

total = sum((IMG / n).stat().st_size for n in made) // 1024
print(f"собрано {len(made)} картинок, {total} КБ; удалено лишних: {len(removed)}")
