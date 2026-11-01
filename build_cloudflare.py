"""Assemble Daybook's browser-local demo for Cloudflare Workers assets."""

from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
STATIC = ROOT / "daybook" / "static"

if PUBLIC.exists():
    shutil.rmtree(PUBLIC)
PUBLIC.mkdir(parents=True)
for name in ("index.html", "app.js", "styles.css", "browser-store.js"):
    shutil.copy2(STATIC / name, PUBLIC / name)

index = PUBLIC / "index.html"
html = index.read_text(encoding="utf-8")
html = html.replace('<script src="/app.js" defer></script>', '<script src="/browser-store.js" defer></script><script src="/app.js" defer></script>')
html = html.replace("Daybook keeps its database on this device.", "Your Daybook entries stay in this browser.")
index.write_text(html, encoding="utf-8")
print(f"Cloudflare demo assets prepared in {PUBLIC}")
