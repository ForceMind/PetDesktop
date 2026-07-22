#!/usr/bin/env python3
"""Create exact PWA icon sizes from Coco's canonical app icon."""

from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "rig" / "app_icon.png"
OUTPUT = ROOT / "web" / "icons"


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    with Image.open(SOURCE) as source:
        image = source.convert("RGBA")
        for size in (192, 512):
            target = OUTPUT / f"icon-{size}.png"
            image.resize((size, size), Image.Resampling.LANCZOS).save(target, optimize=True)
            print(f"Created {target} ({size}x{size})")


if __name__ == "__main__":
    main()
