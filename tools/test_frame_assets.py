#!/usr/bin/env python3
"""Validate that production frames are real, distinct RGBA artwork."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageChops, ImageStat


ROOT = Path(__file__).resolve().parents[1]
FRAME_ROOT = ROOT / "assets" / "frame_animation"


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def pixels(path: Path) -> Image.Image:
    with Image.open(path) as image:
        if image.size != (512, 512) or image.mode != "RGBA":
            raise AssertionError(f"{path.name}: expected 512x512 RGBA, got {image.size} {image.mode}")
        return image.copy()


def mean_delta(left: Image.Image, right: Image.Image) -> float:
    return sum(ImageStat.Stat(ImageChops.difference(left, right)).mean) / 4.0


def main() -> None:
    manifest = json.loads((FRAME_ROOT / "manifest.json").read_text(encoding="utf-8"))
    contract = manifest["contract"]
    endpoints = {
        contract["idleFirstFrame"], contract["idleLastFrame"],
        contract["actionFirstFrame"], contract["actionLastFrame"],
    }
    if endpoints != {"base.png"}:
        raise AssertionError(f"Animation endpoints are not the same base file: {endpoints}")

    base = pixels(FRAME_ROOT / "base.png")
    all_sequences: set[tuple[str, ...]] = set()
    minimum_motion = float("inf")
    for action in manifest["actions"]:
        paths = [FRAME_ROOT / relative for relative in action["frames"]]
        hashes = tuple(digest(path) for path in paths)
        if len(set(hashes)) < 8:
            raise AssertionError(f"Action {action['index']:02d} contains duplicate authored frames")
        if hashes in all_sequences:
            raise AssertionError(f"Action {action['index']:02d} duplicates another timeline")
        all_sequences.add(hashes)

        sequence = [base] + [pixels(path) for path in paths] + [base]
        motion = [mean_delta(left, right)
                  for left, right in zip(sequence, sequence[1:])]
        minimum_motion = min(minimum_motion, max(motion))

    if len(manifest["idle"]) != 8 or len(manifest["actions"]) != 32:
        raise AssertionError("Expected 8 idle timelines and 32 actions")
    if minimum_motion < 2.0:
        raise AssertionError(f"An action has almost no visual motion: {minimum_motion:.3f}")

    print(json.dumps({
        "canvas": "512x512 RGBA",
        "idleFrames": len(manifest["idle"]),
        "actions": len(manifest["actions"]),
        "actionKeyframes": sum(len(action["frames"]) for action in manifest["actions"]),
        "uniqueActionTimelines": len(all_sequences),
        "sharedEndpoint": "base.png",
        "minimumStrongestPixelDelta": round(minimum_motion, 3),
        "passed": True,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
