#!/usr/bin/env python3
"""Remove tiny disconnected alpha islands left by chroma-key extraction."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage


def clean_image(path: Path, min_pixels: int, relative_threshold: float) -> int:
    with Image.open(path) as source:
        image = np.array(source.convert("RGBA"))

    alpha_mask = image[:, :, 3] > 8
    labels, component_count = ndimage.label(
        alpha_mask, structure=np.ones((3, 3), dtype=np.uint8)
    )
    if component_count <= 1:
        return 0

    sizes = np.bincount(labels.ravel())
    largest = int(sizes[1:].max(initial=0))
    threshold = max(min_pixels, int(largest * relative_threshold))
    tiny_labels = np.flatnonzero((sizes < threshold) & (np.arange(sizes.size) != 0))
    if tiny_labels.size == 0:
        return 0

    remove_mask = np.isin(labels, tiny_labels)
    removed_pixels = int(remove_mask.sum())
    image[remove_mask] = 0
    Image.fromarray(image).save(path, optimize=True)
    return removed_pixels


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dir", type=Path, required=True)
    parser.add_argument("--pattern", default="action_*.png")
    parser.add_argument("--min-pixels", type=int, default=36)
    parser.add_argument("--relative-threshold", type=float, default=0.0006)
    args = parser.parse_args()

    total = 0
    touched = 0
    for path in sorted(args.dir.glob(args.pattern)):
        removed = clean_image(path, args.min_pixels, args.relative_threshold)
        if removed:
            touched += 1
            total += removed
            print(f"Cleaned {removed:4d} pixels: {path.name}")

    print(f"Alpha cleanup complete: {touched} files, {total} pixels removed.")


if __name__ == "__main__":
    main()
