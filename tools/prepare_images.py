"""Rebuilds the web images from the game's source art.

The site never ships the originals: the key art alone is a 3.8 MB PNG, and a
landing page that costs four megabytes before the first word is read is a
landing page nobody reads. Run this after the art changes, then commit what it
writes into assets/img/.
"""

import os
from pathlib import Path

from PIL import Image

SITE = Path(__file__).resolve().parents[1]

# The game project is expected next to this one; CONJUNCTION_REPO overrides that.
GAME = Path(os.environ.get("CONJUNCTION_REPO") or SITE.parent / "conjunction-b")
OUT = SITE / "assets" / "img"

WEBP_QUALITY = 84


def save_webp(image: Image.Image, name: str) -> None:
    image.save(OUT / name, "WEBP", quality=WEBP_QUALITY, method=6)


def save_png(image: Image.Image, name: str) -> None:
    image.save(OUT / name, "PNG", optimize=True)


def fit_width(image: Image.Image, width: int) -> Image.Image:
    height = round(image.height * width / image.width)
    return image.resize((width, height), Image.LANCZOS)


def crop_to_ratio(image: Image.Image, ratio: float) -> Image.Image:
    """Centre-crops to the given width/height ratio, keeping the upper third.

    The key art is a portrait gate; a centred crop would behead it, so the
    window sits high enough to keep the arch inside the frame.
    """
    target_height = round(image.width / ratio)
    if target_height >= image.height:
        return image
    top = round((image.height - target_height) * 0.28)
    return image.crop((0, top, image.width, top + target_height))


def build_og_image() -> None:
    """The 1200x630 card that Discord, WhatsApp and Twitter show for a shared link.

    Deliberately a JPEG and not a WebP: several link scrapers still refuse WebP and
    would fall back to no image at all.
    """
    gates = Image.open(GAME / "Assets/Art/UI/Intro/01_barred_gates.png").convert("RGB")
    card = fit_width(crop_to_ratio(gates, 1200 / 630), 1200)

    veil = Image.new("RGBA", card.size, (8, 7, 6, 0))
    for y in range(card.height):
        alpha = int(150 * (y / card.height) ** 1.5)
        veil.paste((8, 7, 6, alpha), (0, y, card.width, y + 1))
    card = Image.alpha_composite(card.convert("RGBA"), veil)

    wordmark = Image.open(GAME / "Assets/Art/UI/Icons/conjunction_logo_v1.png").convert("RGBA")
    wordmark = fit_width(wordmark, 620)
    card.alpha_composite(wordmark, ((card.width - wordmark.width) // 2, int(card.height * 0.30)))

    card.convert("RGB").save(OUT / "og-image.jpg", "JPEG", quality=86, optimize=True)


def build() -> None:
    OUT.mkdir(parents=True, exist_ok=True)

    wordmark = Image.open(GAME / "Assets/Art/UI/Icons/conjunction_logo_v1.png")
    save_webp(fit_width(wordmark, 900), "wordmark.webp")

    gates = Image.open(GAME / "Assets/Art/UI/Intro/01_barred_gates.png")
    save_webp(fit_width(gates, 1100), "hero-portrait.webp")
    save_webp(fit_width(crop_to_ratio(gates, 16 / 9), 1800), "hero-wide.webp")

    icon = Image.open(GAME / "Assets/Art/UI/Branding/app_icon_round.png")
    save_png(fit_width(icon, 192), "icon-192.png")
    save_png(fit_width(icon, 180), "apple-touch-icon.png")
    save_png(fit_width(icon, 32), "favicon-32.png")

    # Real device captures, not editor renders. The untouched originals live in the
    # game repo; the site takes them at their own aspect ratio, since only the store
    # insists on 9:16.
    shots = GAME / "docs/engineering/play-store/source"
    for name in ("01_map", "02_combat", "03_victory", "04_wheel", "06_prep", "08_whispers"):
        save_webp(fit_width(Image.open(shots / f"{name}.jpg"), 720), f"shot-{name[3:]}.webp")

    build_og_image()

    for path in sorted(OUT.iterdir()):
        print(f"{path.stat().st_size / 1024:8.1f} KB  {path.name}")


if __name__ == "__main__":
    build()
