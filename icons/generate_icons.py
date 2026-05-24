#!/usr/bin/env python3
"""Generate icons from index.html hero .logo-icon (3s box) styles."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parent

# .logo-icon in index.html
PRIMARY = (59, 130, 246)        # --primary #3b82f6
PRIMARY_DARK = (99, 102, 241)   # --primary-dark #6366f1
GLOW_RGBA = (59, 130, 246, 77)  # --primary-glow 0.3 on 255
WHITE = (255, 255, 255)
BG = (255, 255, 255)

# 40px box, 12px radius, 1rem (~16px) text, weight 800
TILE_RADIUS_RATIO = 12 / 40
TEXT_SIZE_RATIO = 16 / 40
SHADOW_OFFSET_Y_RATIO = 4 / 40
SHADOW_BLUR_RATIO = 12 / 40

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size=size, index=0)
            except OSError:
                try:
                    return ImageFont.truetype(path, size=size)
                except OSError:
                    continue
    return ImageFont.load_default()


def _lerp_rgb(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def hero_gradient_tile(side: int, radius: int) -> Image.Image:
    tile = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    pixels = tile.load()
    diag = side * 2
    for y in range(side):
        for x in range(side):
            t = (x + y) / diag  # 135deg
            pixels[x, y] = (*_lerp_rgb(PRIMARY, PRIMARY_DARK, t), 255)

    mask = Image.new("L", (side, side), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, side - 1, side - 1), radius=radius, fill=255)
    tile.putalpha(mask)
    return tile


def draw_shadow(canvas: Image.Image, x: int, y: int, tile_side: int) -> None:
    pad = max(8, int(tile_side * 0.35))
    layer = Image.new("RGBA", (tile_side + pad * 2, tile_side + pad * 2), (0, 0, 0, 0))
    r = max(4, int(round(tile_side * TILE_RADIUS_RATIO)))
    ImageDraw.Draw(layer).rounded_rectangle(
        (pad, pad, pad + tile_side - 1, pad + tile_side - 1),
        radius=r,
        fill=GLOW_RGBA,
    )
    blur = max(2, int(round(tile_side * SHADOW_BLUR_RATIO)))
    layer = layer.filter(ImageFilter.GaussianBlur(radius=blur))
    offset_y = max(1, int(round(tile_side * SHADOW_OFFSET_Y_RATIO)))
    canvas.alpha_composite(layer, (x - pad, y - pad + offset_y))


def draw_3s(canvas: Image.Image, box: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    tile_side = x1 - x0
    font_size = max(8, int(round(tile_side * TEXT_SIZE_RATIO)))
    font = load_font(font_size)
    text = "3s"
    draw = ImageDraw.Draw(canvas)
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = x0 + (tile_side - tw) // 2 - bbox[0]
    ty = y0 + (tile_side - th) // 2 - bbox[1]
    draw.text((tx, ty), text, fill=(*WHITE, 255), font=font)


def render_logo_icon(size: int, tile_ratio: float = 0.78) -> Image.Image:
    img = Image.new("RGBA", (size, size), (*BG, 255))
    tile_side = max(1, int(round(size * tile_ratio)))
    radius = max(4, int(round(tile_side * TILE_RADIUS_RATIO)))
    x = (size - tile_side) // 2
    y = (size - tile_side) // 2

    draw_shadow(img, x, y, tile_side)
    tile = hero_gradient_tile(tile_side, radius)
    img.alpha_composite(tile, (x, y))
    draw_3s(img, (x, y, x + tile_side, y + tile_side))
    return img


def render_maskable(size: int) -> Image.Image:
    return render_logo_icon(size, tile_ratio=0.72)


def save_png(img: Image.Image, path: Path) -> None:
    flat = Image.new("RGB", img.size, BG)
    if img.mode == "RGBA":
        flat.paste(img, mask=img.split()[3])
    else:
        flat = img.convert("RGB")
    flat.save(path, format="PNG", optimize=True)
    print(f"wrote {path}")


def main() -> None:
    outputs: list[tuple[int, str, str]] = [
        (16, "favicon-16.png", "any"),
        (32, "favicon-32.png", "any"),
        (120, "icon-120.png", "any"),
        (152, "icon-152.png", "any"),
        (167, "icon-167.png", "any"),
        (180, "apple-touch-icon.png", "any"),
        (192, "icon-192.png", "any"),
        (512, "icon-512.png", "any"),
        (512, "icon-512-maskable.png", "maskable"),
    ]
    for size, name, kind in outputs:
        img = render_maskable(size) if kind == "maskable" else render_logo_icon(size)
        save_png(img, ROOT / name)


if __name__ == "__main__":
    main()
