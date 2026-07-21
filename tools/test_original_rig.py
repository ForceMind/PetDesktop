#!/usr/bin/env python3
"""Verify that the live rig uses pixels from the supplied original artwork."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
RIG = ROOT / "assets" / "rig"
CROP = (306, 4, 1051, 1209)
NAMES = [
    "original_core", "original_arm_left", "original_arm_right",
    "original_leg_left", "original_leg_right",
]


def main() -> None:
    source = Image.open(ROOT / "assets" / "coco.png").convert("RGBA").crop(CROP)
    layers = [Image.open(RIG / f"{name}.png").convert("RGBA") for name in NAMES]
    assert all(layer.size == source.size for layer in layers), "Rig layers use mismatched canvases"

    source_pixels = source.load()
    for name, layer in zip(NAMES, layers):
        pixels = layer.load()
        for y in range(layer.height):
            for x in range(layer.width):
                if pixels[x, y][3] and pixels[x, y][:3] != source_pixels[x, y][:3]:
                    raise AssertionError(f"{name} contains repainted pixels at {(x, y)}")

    neutral = Image.open(RIG / "original_neutral.png").convert("RGBA")
    difference = ImageChops.difference(source, neutral)
    changed = sum(1 for pixel in difference.getdata() if any(pixel))
    visible = sum(1 for alpha in source.getchannel("A").getdata() if alpha)
    ratio = changed / max(1, visible)
    assert ratio < 0.005, f"Neutral rig differs from original by {ratio:.3%}"
    print(f"Original identity test passed: {len(layers)} source-pixel layers, "
          f"neutral difference {ratio:.3%}")


if __name__ == "__main__":
    main()
