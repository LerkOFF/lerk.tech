"""Собирает SVG-спрайт иконок и вставляет его в public/index.html.

Иконки: Phosphor (bold) из npm-пакета @phosphor-icons/core, логотип VK из Simple Icons.
Запуск: python3 tools/build_icons.py  (перед этим: cd tools && npm i)
В HTML иконка вызывается так: <svg class="icon"><use href="#i-telegram"></use></svg>
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PH = ROOT / "tools" / "node_modules" / "@phosphor-icons" / "core" / "assets" / "bold"
HTML = ROOT / "public" / "index.html"

ICONS = {
    "telegram": "telegram-logo",
    "mail": "envelope-simple",
    "github": "github-logo",
    "arrow": "arrow-up-right",
    "sun": "sun",
    "moon": "moon",
    "menu": "list",
    "close": "x",
    "copy": "copy",
    "check": "check",
    "browser": "browser",
    "robot": "robot",
    "sparkle": "sparkle",
    "card": "credit-card",
    "server": "hard-drives",
    "wrench": "wrench",
    "image": "image-square",
    "article": "article",
    "chat": "chat-dots",
    "chart": "chart-line-up",
    "swap": "arrows-left-right",
    "store": "storefront",
    "notebook": "notebook",
}
EXTRA = {"vk": ROOT / "tools" / "icons" / "vk.svg"}  # Simple Icons, viewBox 0 0 24 24


def symbol(sid, svg):
    view = re.search(r'viewBox="([^"]+)"', svg).group(1)
    inner = re.sub(r"^.*?<svg[^>]*>|</svg>\s*$", "", svg.strip(), flags=re.S)
    inner = re.sub(r"<title>.*?</title>", "", inner)
    return f'<symbol id="i-{sid}" viewBox="{view}" fill="currentColor">{inner}</symbol>'


parts = [symbol(k, (PH / f"{v}-bold.svg").read_text()) for k, v in ICONS.items()]
parts += [symbol(k, p.read_text()) for k, p in EXTRA.items()]
sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">' + "".join(parts) + "</svg>"

html = HTML.read_text()
html, n = re.subn(r"<!-- icons:start -->.*?<!-- icons:end -->",
                  f"<!-- icons:start -->\n{sprite}\n<!-- icons:end -->", html, flags=re.S)
assert n == 1, "нет маркеров icons:start / icons:end"
HTML.write_text(html)

used = set(re.findall(r'href="#i-([a-z0-9-]+)"', html))
missing = used - set(ICONS) - set(EXTRA)
print(f"иконок в спрайте: {len(parts)}, используется: {len(used)}, нет в спрайте: {sorted(missing) or 'нет'}")
