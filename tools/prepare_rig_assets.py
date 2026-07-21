#!/usr/bin/env python3
"""Split the generated Coco paper-doll sheet and build application icons."""

from __future__ import annotations

from pathlib import Path
from collections import deque

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
RIG_DIR = ROOT / "assets" / "rig"
SHEET = RIG_DIR / "coco_rig_sheet.png"
OUTFIT_SHEET = RIG_DIR / "outfits_sheet.png"

REGIONS = {
    "head": (0, 0, 560, 520),
    "torso": (520, 0, 1040, 520),
    "arm_right": (1040, 0, 1536, 520),
    "arm_left": (0, 512, 560, 1024),
    "leg_left": (520, 512, 1024, 1024),
    "leg_right": (1024, 512, 1536, 1024),
}

OUTFIT_REGIONS = {
    "outfit_scarf": (0, 0, 627, 627),
    "outfit_cape": (627, 0, 1254, 627),
    "outfit_glasses": (0, 627, 627, 1254),
    "outfit_cap": (627, 627, 1254, 1254),
}


def keep_largest_component(piece: Image.Image) -> Image.Image:
    alpha = piece.getchannel("A")
    width, height = piece.size
    visible = alpha.load()
    visited = bytearray(width * height)
    largest: list[int] = []

    for y in range(height):
        for x in range(width):
            start = y * width + x
            if visited[start] or visible[x, y] <= 8:
                continue
            visited[start] = 1
            queue = deque([(x, y)])
            component: list[int] = []
            while queue:
                current_x, current_y = queue.popleft()
                component.append(current_y * width + current_x)
                for next_x, next_y in ((current_x - 1, current_y),
                                       (current_x + 1, current_y),
                                       (current_x, current_y - 1),
                                       (current_x, current_y + 1)):
                    if not (0 <= next_x < width and 0 <= next_y < height):
                        continue
                    index = next_y * width + next_x
                    if visited[index] or visible[next_x, next_y] <= 8:
                        continue
                    visited[index] = 1
                    queue.append((next_x, next_y))
            if len(component) > len(largest):
                largest = component

    keep = set(largest)
    cleaned = piece.copy()
    pixels = cleaned.load()
    for y in range(height):
        for x in range(width):
            if y * width + x not in keep:
                red, green, blue, _ = pixels[x, y]
                pixels[x, y] = red, green, blue, 0
    return cleaned


def trim_region(sheet: Image.Image, region: tuple[int, int, int, int]) -> Image.Image:
    piece = sheet.crop(region)
    piece = keep_largest_component(piece)
    alpha_box = piece.getchannel("A").getbbox()
    if alpha_box is None:
        raise RuntimeError(f"No visible pixels in region {region}")
    left, top, right, bottom = alpha_box
    padding = 8
    left = max(0, left - padding)
    top = max(0, top - padding)
    right = min(piece.width, right + padding)
    bottom = min(piece.height, bottom + padding)
    return piece.crop((left, top, right, bottom))


def build_icon(head: Image.Image) -> Image.Image:
    icon = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    draw = ImageDraw.Draw(icon)
    draw.ellipse((32, 32, 992, 992), fill=(15, 57, 89, 255),
                 outline=(243, 170, 31, 255), width=30)
    scale = min(860 / head.width, 820 / head.height)
    resized = head.resize(
        (round(head.width * scale), round(head.height * scale)), Image.Resampling.LANCZOS)
    x = (1024 - resized.width) // 2
    y = (1024 - resized.height) // 2 + 25
    icon.alpha_composite(resized, (x, y))
    return icon


def paste_at_pivot(canvas: Image.Image, piece: Image.Image,
                   target: tuple[int, int], pivot: tuple[int, int], angle: float = 0) -> None:
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    origin = (target[0] - pivot[0], target[1] - pivot[1])
    layer.alpha_composite(piece, origin)
    if angle:
        layer = layer.rotate(angle, resample=Image.Resampling.BICUBIC,
                             center=target)
    canvas.alpha_composite(layer)


def fitted(piece: Image.Image, width: int) -> Image.Image:
    scale = width / piece.width
    return piece.resize((width, round(piece.height * scale)), Image.Resampling.LANCZOS)


def render_preview(pieces: dict[str, Image.Image], outfits: dict[str, Image.Image],
                   outfit: str | None = None) -> Image.Image:
    canvas = Image.new("RGBA", (800, 1200), (0, 0, 0, 0))
    if outfit == "outfit_cape":
        cape = fitted(outfits[outfit], 500)
        canvas.alpha_composite(cape, ((800 - cape.width) // 2, 500))

    paste_at_pivot(canvas, pieces["leg_left"], (320, 800), (91, 15), -2)
    paste_at_pivot(canvas, pieces["leg_right"], (480, 800), (90, 15), 2)
    paste_at_pivot(canvas, pieces["arm_left"], (215, 555), (150, 15), -2)
    paste_at_pivot(canvas, pieces["arm_right"], (585, 555), (40, 15), 2)
    canvas.alpha_composite(pieces["torso"], (193, 500))
    paste_at_pivot(canvas, pieces["head"], (400, 535), (215, 480))

    if outfit == "outfit_scarf":
        scarf = fitted(outfits[outfit], 390)
        canvas.alpha_composite(scarf, ((800 - scarf.width) // 2, 455))
    elif outfit == "outfit_glasses":
        glasses = fitted(outfits[outfit], 310)
        canvas.alpha_composite(glasses, ((800 - glasses.width) // 2, 330))
    elif outfit == "outfit_cap":
        cap = fitted(outfits[outfit], 350)
        canvas.alpha_composite(cap, ((800 - cap.width) // 2 + 35, 145))
    return canvas


def main() -> None:
    sheet = Image.open(SHEET).convert("RGBA")
    pieces: dict[str, Image.Image] = {}
    for name, region in REGIONS.items():
        piece = trim_region(sheet, region)
        piece.save(RIG_DIR / f"{name}.png", optimize=True)
        pieces[name] = piece
        print(f"{name}: {piece.width}x{piece.height}")

    outfit_sheet = Image.open(OUTFIT_SHEET).convert("RGBA")
    outfits: dict[str, Image.Image] = {}
    for name, region in OUTFIT_REGIONS.items():
        piece = trim_region(outfit_sheet, region)
        piece.save(RIG_DIR / f"{name}.png", optimize=True)
        outfits[name] = piece
        print(f"{name}: {piece.width}x{piece.height}")

    render_preview(pieces, outfits).save(RIG_DIR / "rig_preview.png", optimize=True)
    outfit_preview = Image.new("RGBA", (1600, 600), (24, 31, 38, 255))
    for index, outfit_name in enumerate(OUTFIT_REGIONS):
        preview = render_preview(pieces, outfits, outfit_name)
        preview.thumbnail((390, 580), Image.Resampling.LANCZOS)
        outfit_preview.alpha_composite(preview, (index * 400 + 5, 10))
    outfit_preview.save(RIG_DIR / "outfit_preview.png", optimize=True)

    icon = build_icon(pieces["head"])
    icon.save(RIG_DIR / "app_icon.png", optimize=True)
    icon.save(ROOT / "assets" / "coco.ico", format="ICO",
              sizes=[(16, 16), (24, 24), (32, 32), (48, 48),
                     (64, 64), (128, 128), (256, 256)])
    print("Wrote rig pieces and Windows/macOS icon source")


if __name__ == "__main__":
    main()
