#!/usr/bin/env python3
"""Render a short coherent-rig proof before replacing production playback."""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
RIG = ROOT / "assets" / "rig"
OUT = ROOT / "dist" / "coherent-rig-preview.png"
GIF = ROOT / "dist" / "coherent-rig-preview.gif"
PIVOTS = {
    "arm_left": (136, 742), "arm_right": (484, 748),
    "leg_left": (199, 1044), "leg_right": (433, 1044),
}


def load(name: str) -> Image.Image:
    return Image.open(RIG / name).convert("RGBA")


CORE = load("original_core.png")
PARTS = {name: load(f"original_{name}.png") for name in PIVOTS}
SOCKETS = {name: load(f"original_socket_{name}.png") for name in PIVOTS}
SCARF = load("outfit_scarf.png")


def rotate(layer: Image.Image, pivot: tuple[int, int], angle: float,
           dx: float = 0, dy: float = 0) -> Image.Image:
    moved = layer.rotate(angle, resample=Image.Resampling.BICUBIC, center=pivot)
    shifted = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    shifted.alpha_composite(moved, (round(dx), round(dy)))
    return shifted


def accessory(canvas: Image.Image, image: Image.Image, x: int, y: int, width: int) -> None:
    height = round(width * image.height / image.width)
    canvas.alpha_composite(image.resize((width, height), Image.Resampling.LANCZOS), (x, y))


def with_opacity(image: Image.Image, opacity: float) -> Image.Image:
    shown = image.copy()
    shown.putalpha(shown.getchannel("A").point(
        lambda alpha: round(alpha * max(0.0, min(1.0, opacity)))))
    return shown


def frame(index: int, count: int = 12) -> Image.Image:
    t = index / (count - 1)
    envelope = math.sin(math.pi * t)
    beat = math.sin(math.pi * 4 * t) * envelope
    angles = {
        "arm_left": 30 * envelope + 8 * beat,
        "arm_right": -30 * envelope - 8 * beat,
        "leg_left": 12 * beat,
        "leg_right": -12 * beat,
    }
    canvas = Image.new("RGBA", CORE.size, (0, 0, 0, 0))
    for name, angle in angles.items():
        socket_y = -11 * abs(beat) if name.startswith("leg") else 0
        canvas.alpha_composite(with_opacity(
            rotate(SOCKETS[name], PIVOTS[name], angle * 0.5, dy=socket_y),
            abs(angle) / 12))
    canvas.alpha_composite(rotate(PARTS["leg_left"], PIVOTS["leg_left"],
                                  angles["leg_left"], dy=-22 * abs(beat)))
    canvas.alpha_composite(rotate(PARTS["leg_right"], PIVOTS["leg_right"],
                                  angles["leg_right"], dy=-22 * abs(beat)))
    canvas.alpha_composite(rotate(PARTS["arm_left"], PIVOTS["arm_left"],
                                  angles["arm_left"]))
    canvas.alpha_composite(rotate(PARTS["arm_right"], PIVOTS["arm_right"],
                                  angles["arm_right"]))
    canvas.alpha_composite(CORE)
    accessory(canvas, SCARF, 185, 650, 375)

    # Whole-character travel is applied after the attached outfit is composed.
    if index not in (0, count - 1):
        canvas = canvas.rotate(5 * beat, Image.Resampling.BICUBIC,
                               center=(CORE.width // 2, CORE.height - 90))
    return canvas


def main() -> None:
    frames = [frame(index) for index in range(12)]
    cells: list[Image.Image] = []
    for source in frames:
        shown = source.copy()
        shown.thumbnail((190, 300), Image.Resampling.LANCZOS)
        cell = Image.new("RGBA", (210, 330), "white")
        cell.alpha_composite(shown, ((210 - shown.width) // 2, 12))
        cells.append(cell)
    preview = Image.new("RGBA", (210 * 6, 330 * 2), "white")
    for index, cell in enumerate(cells):
        preview.alpha_composite(cell, ((index % 6) * 210, (index // 6) * 330))
    ImageDraw.Draw(preview).text((12, 8), "same master + moving limbs + attached scarf",
                                 fill=(24, 31, 38, 255))
    preview.save(OUT, optimize=True)

    gif_frames = []
    for source in frames:
        shown = source.copy()
        shown.thumbnail((260, 420), Image.Resampling.LANCZOS)
        stage = Image.new("RGBA", (360, 460), "white")
        stage.alpha_composite(shown, ((stage.width - shown.width) // 2, 12))
        gif_frames.append(stage.convert("P", palette=Image.Palette.ADAPTIVE))
    gif_frames[0].save(GIF, save_all=True, append_images=gif_frames[1:],
                       duration=70, loop=0, disposal=2)
    print(OUT)
    print(GIF)


if __name__ == "__main__":
    main()
