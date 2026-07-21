#!/usr/bin/env python3
"""Validate Coco v2 whole-character animation assets before packaging."""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

from PIL import Image, ImageChops


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets" / "frame_animation_v2"


def pixel_digest(path: Path) -> str:
    image = Image.open(path).convert("RGBA")
    return hashlib.sha256(image.tobytes()).hexdigest()


def validate_frame(path: Path) -> None:
    image = Image.open(path)
    assert image.mode == "RGBA", f"{path}: expected RGBA, got {image.mode}"
    assert image.size == (512, 512), f"{path}: expected 512 square canvas"
    alpha = image.getchannel("A")
    assert alpha.getbbox(), f"{path}: frame is empty"
    corners = [alpha.getpixel(point) for point in ((0, 0), (511, 0), (0, 511), (511, 511))]
    assert max(corners) == 0, f"{path}: canvas corners are not transparent"


def main() -> None:
    manifest = json.loads((ASSETS / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["format"] == 2
    assert manifest["rendering"] == "whole-character-frames-only"
    assert manifest["outfitPolicy"] == "idle-only-whole-frame-regeneration"

    idles: dict[str, list[str]] = manifest["idle"]
    actions: dict[str, list[str]] = manifest["actions"]
    assert len(idles) == 5, f"expected five idle appearances, found {len(idles)}"
    assert len(actions) == 32, f"expected 32 actions, found {len(actions)}"

    neutral = ASSETS / manifest["neutral"]
    validate_frame(neutral)
    neutral_hash = pixel_digest(neutral)

    outfit_hashes: set[str] = set()
    for name, relative_paths in idles.items():
        assert len(relative_paths) == 7, f"{name}: expected seven idle frames"
        paths = [ASSETS / relative for relative in relative_paths]
        for path in paths:
            validate_frame(path)
        assert pixel_digest(paths[0]) == pixel_digest(paths[-1]), (
            f"{name}: idle loop endpoints are not identical"
        )
        outfit_hashes.add(pixel_digest(paths[0]))
    assert len(outfit_hashes) == 5, "outfit idle starts are not five regenerated renders"

    action_middle_hashes: set[str] = set()
    for name, relative_paths in actions.items():
        assert len(relative_paths) == 8, f"{name}: expected eight action frames"
        paths = [ASSETS / relative for relative in relative_paths]
        for path in paths:
            validate_frame(path)
        assert pixel_digest(paths[0]) == neutral_hash, f"{name}: wrong first frame"
        assert pixel_digest(paths[-1]) == neutral_hash, f"{name}: wrong final frame"
        assert ImageChops.difference(
            Image.open(paths[0]).convert("RGBA"), Image.open(paths[4]).convert("RGBA")
        ).getbbox(), f"{name}: middle pose repeats neutral"
        action_middle_hashes.add(pixel_digest(paths[4]))
    assert len(action_middle_hashes) >= 30, "action set does not contain 30 distinct poses"

    archive = ASSETS / "runtime_frames.zip"
    assert archive.is_file(), "runtime frame archive is missing"
    with zipfile.ZipFile(archive) as runtime:
        names = runtime.namelist()
        assert len(names) == 292, f"expected 292 packaged images, found {len(names)}"
        assert len(set(names)) == len(names), "runtime archive has duplicate entries"

    print("Authored frame validation passed")
    print("Idle: 5 regenerated appearances x 7 complete frames")
    print("Actions: 32 x 8 complete frames with exact neutral endpoints")
    print(f"Distinct action middle poses: {len(action_middle_hashes)}")
    print("Runtime: no rig parts, accessory overlays, cross-fades, or non-square frames")


if __name__ == "__main__":
    main()
