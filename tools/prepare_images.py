"""Rebuilds the web images from the game's source art.

The site never ships the originals: the key art alone is a 3.8 MB PNG, and a
landing page that costs four megabytes before the first word is read is a
landing page nobody reads. Run this after the art changes, then commit what it
writes into assets/img/.
"""

import os
import re
from pathlib import Path

from PIL import Image

SITE = Path(__file__).resolve().parents[1]

# The game project is expected next to this one; CONJUNCTION_REPO overrides that.
GAME = Path(os.environ.get("CONJUNCTION_REPO") or SITE.parent / "conjunction-b")
OUT = SITE / "assets" / "img"
ARENA_OUT = OUT / "arena"
ARENA_ART = GAME / "Assets/Art/UI/Arena"
PLATES_CSS = SITE / "assets" / "css" / "arena-plates.css"

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


# The arena's painted parts for the results pages (TASK-1502): the game's own art, scaled for the web. A plate
# scales by its nine-slice borders, read from the sprite's .meta, so the web plate and the game plate cannot drift.
ARENA_PLATE_SCALE = 0.5      # the web file against the game's source
ARENA_PLATE_SHOWN = 0.5      # the drawn border against the web file's slice: crisp on a 2x phone screen
ARENA_PLATES = {             # web name: (game sprite, how its edges and middle fill the box)
    "row-gold": ("arena_row_gold", "stretch"), "row-silver": ("arena_row_silver", "stretch"),
    "row-bronze": ("arena_row_bronze", "stretch"), "row-stone": ("arena_row_stone", "stretch"),
    "plaque": ("arena_plaque", "stretch"), "section-band": ("arena_section_band", "stretch"),
    # A panel grows far past its painting's height; tiled, its stone keeps its grain instead of drawing streaks.
    "panel-iron": ("arena_panel_iron", "round"), "panel-gold": ("arena_panel_gold", "round"),
}
ARENA_PICTURES = {           # web name: (game sprite, web width)
    "hall": ("arena_balcony_background", 1080), "champion-plate": ("arena_champion_plate", 1000),
    "laurel-gold": ("arena_laurel_gold", 240), "laurel-silver": ("arena_laurel_silver", 240),
    "laurel-bronze": ("arena_laurel_bronze", 240),
}
SPRITE_BORDER = re.compile(r"spriteBorder: \{x: (\d+), y: (\d+), z: (\d+), w: (\d+)\}")


def sprite_border(sprite: str) -> tuple[int, int, int, int]:
    """The sprite's nine-slice border as CSS orders it - top, right, bottom, left - from Unity's x left, y bottom,
    z right, w top."""
    meta = (ARENA_ART / f"{sprite}.png.meta").read_text(encoding="utf-8")
    match = SPRITE_BORDER.search(meta)
    if not match or not any(int(value) for value in match.groups()):
        raise SystemExit(f"{sprite}.png.meta has no nine-slice border")
    left, bottom, right, top = (int(value) for value in match.groups())
    return top, right, bottom, left


def plate_rule(name: str, border: tuple[int, int, int, int], repeat: str) -> str:
    sliced = " ".join(str(round(side * ARENA_PLATE_SCALE)) for side in border)
    shown = " ".join(f"{round(side * ARENA_PLATE_SCALE * ARENA_PLATE_SHOWN)}px" for side in border)
    return (f".plate-{name} {{ border-style: solid; border-width: {shown}; "
            f"border-image: url(/assets/img/arena/{name}.webp) {sliced} fill / {shown} / 0 {repeat}; }}")


def build_arena() -> None:
    ARENA_OUT.mkdir(parents=True, exist_ok=True)
    rules = ["/* Written by tools/prepare_images.py from the game's arena sprites and their .meta borders - do not edit. */"]
    for name, (sprite, repeat) in ARENA_PLATES.items():
        art = Image.open(ARENA_ART / f"{sprite}.png")
        save_webp(fit_width(art, round(art.width * ARENA_PLATE_SCALE)), f"arena/{name}.webp")
        rules.append(plate_rule(name, sprite_border(sprite), repeat))
    for name, (sprite, width) in ARENA_PICTURES.items():
        save_webp(fit_width(Image.open(ARENA_ART / f"{sprite}.png"), width), f"arena/{name}.webp")
    PLATES_CSS.write_text("\n".join(rules) + "\n", encoding="utf-8")


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

    build_og_image()
    build_arena()

    for path in sorted(OUT.rglob("*.*")):
        print(f"{path.stat().st_size / 1024:8.1f} KB  {path.relative_to(OUT)}")


if __name__ == "__main__":
    build()
