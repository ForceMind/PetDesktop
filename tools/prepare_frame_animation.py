#!/usr/bin/env python3
"""Prepare the production frame-animation assets from generated green sheets.

The animation contract is deliberately simple:

* ``base.png`` is the normalized original ``assets/coco.png``.
* idle contains eight generated poses and loops base -> poses -> base.
* every action contains eight generated chronological frames and plays
  base -> in-between/keyframe pairs -> base.

The application uses the exact same base bitmap at both ends, so state changes
cannot finish on an approximate or regenerated idle pose.
"""

from __future__ import annotations

import os
import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
FRAME_ROOT = ASSETS / "frame_animation"
SOURCE_DIR = FRAME_ROOT / "source"
ACTION_DIR = FRAME_ROOT / "actions"
IDLE_DIR = FRAME_ROOT / "idle"
TEMP_DIR = ROOT / "tmp" / "frame_animation"
CANVAS_SIZE = 512

ACTION_SHEETS = [
    (1, SOURCE_DIR / "actions_01_04_4f_green.png"),
    (5, SOURCE_DIR / "actions_05_08_4f_green.png"),
    (9, SOURCE_DIR / "actions_09_12_4f_green.png"),
    (13, SOURCE_DIR / "actions_13_16_4f_green.png"),
    (17, SOURCE_DIR / "actions_17_20_4f_green.png"),
    (21, SOURCE_DIR / "actions_21_24_4f_green.png"),
    (25, SOURCE_DIR / "actions_25_28_4f_green.png"),
    (29, SOURCE_DIR / "actions_29_32_4f_green.png"),
]
INBETWEEN_SHEETS = [
    (1, SOURCE_DIR / "inbetweens_01_04_green.png"),
    (5, SOURCE_DIR / "inbetweens_05_08_green.png"),
    (9, SOURCE_DIR / "inbetweens_09_12_green.png"),
    (13, SOURCE_DIR / "inbetweens_13_16_green.png"),
    (17, SOURCE_DIR / "inbetweens_17_20_green.png"),
    (21, SOURCE_DIR / "inbetweens_21_24_green.png"),
    (25, SOURCE_DIR / "inbetweens_25_28_green.png"),
    (29, SOURCE_DIR / "inbetweens_29_32_green.png"),
]
IDLE_SHEET = SOURCE_DIR / "idle_v2_green.png"

ACTION_NAMES = [
    "jump", "squash", "shake", "bounce", "nod", "sway", "spin",
    "reverse_spin", "hop_left", "hop_right", "tiptoe", "stretch",
    "shrink", "peek_left", "peek_right", "figure_eight", "tremble",
    "proud", "bow", "backflip", "frontflip", "dance", "moonwalk",
    "heartbeat", "dizzy", "sneak", "charge", "float", "stomp",
    "laugh", "surprise", "sleepy",
]


def chroma_helper_path() -> Path:
    codex_root = Path(os.environ.get("CODEX_HOME", Path.home() / ".codex"))
    helper = codex_root / "skills" / ".system" / "imagegen" / "scripts" / "remove_chroma_key.py"
    if not helper.is_file():
        raise FileNotFoundError(f"Missing imagegen chroma-key helper: {helper}")
    return helper


def split_cell(sheet: Image.Image, columns: int, rows: int,
               column: int, row: int) -> Image.Image:
    left = round(column * sheet.width / columns)
    right = round((column + 1) * sheet.width / columns)
    top = round(row * sheet.height / rows)
    bottom = round((row + 1) * sheet.height / rows)
    return sheet.crop((left, top, right, bottom)).convert("RGBA")


def remove_chroma(cell: Image.Image, stem: str, helper: Path) -> Image.Image:
    green_path = TEMP_DIR / f"{stem}_green.png"
    alpha_path = TEMP_DIR / f"{stem}_alpha.png"
    cell.save(green_path, optimize=True)
    subprocess.run([
        sys.executable, str(helper),
        "--input", str(green_path),
        "--out", str(alpha_path),
        "--auto-key", "border",
        "--soft-matte",
        "--transparent-threshold", "12",
        "--opaque-threshold", "220",
        "--despill",
        "--edge-contract", "1",
        "--force",
    ], check=True, stdout=subprocess.DEVNULL)
    return Image.open(alpha_path).convert("RGBA")


def keep_character(image: Image.Image) -> Image.Image:
    pixels = np.array(image)
    visible = pixels[:, :, 3] > 8
    labels, count = ndimage.label(visible, structure=np.ones((3, 3), dtype=np.uint8))
    if count == 0:
        raise RuntimeError("Chroma extraction produced an empty frame")
    sizes = np.bincount(labels.ravel())
    largest_label = int(np.argmax(sizes[1:]) + 1)
    keep = labels == largest_label
    # Restore the antialiased one-pixel fringe around the connected body.
    keep = ndimage.binary_dilation(keep, iterations=1) & (pixels[:, :, 3] > 0)
    pixels[~keep] = 0
    return Image.fromarray(pixels)


def fit_cell(image: Image.Image) -> Image.Image:
    # Preserve the layout authored in the sprite sheet.  Resizing the full cell
    # retains airborne height, body lean and left/right travel.
    return image.resize((CANVAS_SIZE, CANVAS_SIZE), Image.Resampling.LANCZOS)


def normalized_original(reference_frames: list[Image.Image]) -> Image.Image:
    source = Image.open(ASSETS / "coco.png").convert("RGBA")
    source_box = source.getchannel("A").getbbox()
    if source_box is None:
        raise RuntimeError("Original Coco image is empty")
    cropped = source.crop(source_box)

    boxes = [frame.getchannel("A").getbbox() for frame in reference_frames]
    boxes = [box for box in boxes if box]
    median_height = int(np.median([box[3] - box[1] for box in boxes]))
    median_center_x = float(np.median([(box[0] + box[2]) / 2 for box in boxes]))
    median_bottom = int(np.median([box[3] for box in boxes]))

    scale = median_height / cropped.height
    width = max(1, round(cropped.width * scale))
    resized = cropped.resize((width, median_height), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS_SIZE, CANVAS_SIZE), (0, 0, 0, 0))
    x = round(median_center_x - width / 2)
    y = median_bottom - median_height
    canvas.alpha_composite(resized, (x, y))
    return canvas


def save_preview(base: Image.Image, idle_frames: list[Image.Image],
                 action_frames: list[list[Image.Image]]) -> None:
    thumb_size = 180
    margin = 12
    width = (thumb_size + margin) * 8 + margin
    height = (thumb_size + 30 + margin) * 5 + margin
    preview = Image.new("RGBA", (width, height), (24, 31, 38, 255))
    draw = ImageDraw.Draw(preview)

    top_row = [base] + idle_frames[:7]
    for column, frame in enumerate(top_row):
        shown = frame.resize((thumb_size, thumb_size), Image.Resampling.LANCZOS)
        x = margin + column * (thumb_size + margin)
        preview.alpha_composite(shown, (x, margin))
        draw.text((x + 4, margin + thumb_size + 4),
                  "BASE" if column == 0 else f"IDLE {column}", fill="white")

    for action_index, frames in enumerate(action_frames):
        row = action_index // 8 + 1
        column = action_index % 8
        # Show the strongest third phase for an at-a-glance uniqueness review.
        shown = frames[2].resize((thumb_size, thumb_size), Image.Resampling.LANCZOS)
        x = margin + column * (thumb_size + margin)
        y = margin + row * (thumb_size + 30 + margin)
        preview.alpha_composite(shown, (x, y))
        draw.text((x + 4, y + thumb_size + 4),
                  f"{action_index + 1:02d} {ACTION_NAMES[action_index]}", fill="white")
    preview.save(FRAME_ROOT / "frame_animation_preview.png", optimize=True)


def main() -> None:
    missing = [path for _, path in ACTION_SHEETS + INBETWEEN_SHEETS if not path.is_file()]
    if not IDLE_SHEET.is_file():
        missing.append(IDLE_SHEET)
    if missing:
        raise FileNotFoundError("Missing generated sheets: " + ", ".join(map(str, missing)))

    if TEMP_DIR.exists():
        shutil.rmtree(TEMP_DIR)
    TEMP_DIR.mkdir(parents=True)
    ACTION_DIR.mkdir(parents=True, exist_ok=True)
    IDLE_DIR.mkdir(parents=True, exist_ok=True)
    helper = chroma_helper_path()

    idle_sheet = Image.open(IDLE_SHEET).convert("RGBA")
    idle_frames: list[Image.Image] = []
    for index in range(8):
        cell = split_cell(idle_sheet, 4, 2, index % 4, index // 4)
        frame = fit_cell(keep_character(remove_chroma(cell, f"idle_{index + 1:02d}", helper)))
        frame.save(IDLE_DIR / f"idle_{index + 1:02d}.png", optimize=True)
        idle_frames.append(frame)

    base = normalized_original(idle_frames)
    base.save(FRAME_ROOT / "base.png", optimize=True)

    action_frames: list[list[Image.Image]] = [[] for _ in range(32)]
    for (first_action, sheet_path), (_, inbetween_path) in zip(
            ACTION_SHEETS, INBETWEEN_SHEETS, strict=True):
        sheet = Image.open(sheet_path).convert("RGBA")
        inbetween_sheet = Image.open(inbetween_path).convert("RGBA")
        for row in range(4):
            action_number = first_action + row
            for column in range(4):
                for phase, source_sheet in enumerate((inbetween_sheet, sheet)):
                    frame_number = column * 2 + phase + 1
                    stem = f"action_{action_number:02d}_{frame_number:02d}"
                    cell = split_cell(source_sheet, 4, 4, column, row)
                    frame = fit_cell(keep_character(remove_chroma(cell, stem, helper)))
                    output = ACTION_DIR / f"{stem}.png"
                    frame.save(output, optimize=True)
                    action_frames[action_number - 1].append(frame)

    save_preview(base, idle_frames, action_frames)
    manifest = {
        "format": 1,
        "canvas": {"width": CANVAS_SIZE, "height": CANVAS_SIZE},
        "playbackFps": 30,
        "contract": {
            "idleFirstFrame": "base.png",
            "idleLastFrame": "base.png",
            "actionFirstFrame": "base.png",
            "actionLastFrame": "base.png",
            "idlePlayback": "crossfade-smoothstep",
            "actionPlayback": "authored-frame-stepping",
        },
        "idle": [f"idle/idle_{index:02d}.png" for index in range(1, 9)],
        "actions": [
            {
                "index": index,
                "name": name,
                "frames": [
                    f"actions/action_{index:02d}_{frame:02d}.png"
                    for frame in range(1, 9)
                ],
            }
            for index, name in enumerate(ACTION_NAMES, start=1)
        ],
    }
    (FRAME_ROOT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    shutil.rmtree(TEMP_DIR)
    temp_parent = TEMP_DIR.parent
    if temp_parent.exists() and not any(temp_parent.iterdir()):
        temp_parent.rmdir()

    print(f"base: {FRAME_ROOT / 'base.png'}")
    print(f"idle frames: {len(idle_frames)}")
    print(f"action frames: {sum(map(len, action_frames))} (32 x 8)")
    print(f"preview: {FRAME_ROOT / 'frame_animation_preview.png'}")


if __name__ == "__main__":
    main()
