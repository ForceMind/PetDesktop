"""Build whole-character Coco animation clips from approved sprite sheets.

The generated sheets contain only the six in-between frames. This builder inserts
the byte-identical neutral standing frame at both ends, so every clip has a hard
continuity contract and the runtime never needs to assemble body parts.
"""

from __future__ import annotations

import hashlib
import json
import zipfile
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
ASSET_ROOT = ROOT / "assets" / "frame_animation_v2"
SOURCE_ROOT = ASSET_ROOT / "source"
CANVAS = (512, 512)
CELL_COLUMNS = 3
CELL_ROWS = 2
ACTION_SOURCES = [
    ("01_jump", "action_01_jump_inbetweens_rgba.png"),
    ("02_squash", "action_02_squash_inbetweens_rgba.png"),
    ("03_shake", "action_03_shake_inbetweens_rgba.png"),
    ("04_bounce", "action_04_bounce_inbetweens_rgba.png"),
    ("05_nod", "action_05_nod_inbetweens_rgba.png"),
    ("06_sway", "action_06_sway_inbetweens_rgba.png"),
    ("07_spin", "action_07_spin_inbetweens_rgba.png"),
    ("08_reverse_spin", "action_08_reverse_spin_inbetweens_rgba.png"),
    ("09_hop_left", "action_09_hop_left_inbetweens_rgba.png"),
    ("10_hop_right", "action_10_hop_right_inbetweens_rgba.png"),
    ("11_tiptoe", "action_11_tiptoe_inbetweens_rgba.png"),
    ("12_stretch", "action_12_stretch_inbetweens_rgba.png"),
    ("13_shrink", "action_13_shrink_inbetweens_rgba.png"),
    ("14_peek_left", "action_14_peek_left_inbetweens_rgba.png"),
    ("15_peek_right", "action_15_peek_right_inbetweens_rgba.png"),
    ("16_figure_eight", "action_16_figure_eight_inbetweens_rgba.png"),
    ("17_tremble", "action_17_tremble_inbetweens_rgba.png"),
    ("18_proud", "action_18_proud_inbetweens_rgba.png"),
    ("19_bow", "action_19_bow_inbetweens_rgba.png"),
    ("20_backflip", "action_20_backflip_inbetweens_rgba.png"),
    ("21_frontflip", "action_21_frontflip_inbetweens_rgba.png"),
    ("22_dance", "action_22_dance_inbetweens_rgba.png"),
    ("23_moonwalk", "action_23_moonwalk_inbetweens_rgba.png"),
    ("24_heartbeat", "action_24_heartbeat_inbetweens_rgba.png"),
    ("25_dizzy", "action_25_dizzy_inbetweens_rgba.png"),
    ("26_sneak", "action_26_sneak_inbetweens_rgba.png"),
    ("27_charge", "action_27_charge_inbetweens_rgba.png"),
    ("28_float", "action_28_float_inbetweens_rgba.png"),
    ("29_stomp", "action_29_stomp_inbetweens_rgba.png"),
    ("30_laugh", "action_30_laugh_inbetweens_rgba.png"),
    ("31_surprise", "action_31_surprise_inbetweens_rgba.png"),
    ("32_sleepy", "action_32_sleepy_inbetweens_rgba.png"),
]

IDLE_SOURCES = [
    ("default", "idle_default_inbetweens_rgba.png"),
    ("red_scarf", "idle_red_scarf_rgba.png"),
    ("blue_cape", "idle_blue_cape_rgba.png"),
    ("round_glasses", "idle_round_glasses_rgba.png"),
    ("sailor_cap", "idle_sailor_cap_rgba.png"),
]


def alpha_bbox(image: Image.Image) -> tuple[int, int, int, int]:
    bbox = image.getchannel("A").getbbox()
    if bbox is None:
        raise ValueError("frame contains no visible pixels")
    return bbox


def split_sheet(path: Path) -> list[Image.Image]:
    sheet = Image.open(path).convert("RGBA")
    expected = (CANVAS[0] * CELL_COLUMNS, CANVAS[1] * CELL_ROWS)
    if sheet.size != expected:
        raise ValueError(f"{path.name}: expected {expected}, got {sheet.size}")
    frames: list[Image.Image] = []
    for index in range(CELL_COLUMNS * CELL_ROWS):
        x = index % CELL_COLUMNS * CANVAS[0]
        y = index // CELL_COLUMNS * CANVAS[1]
        frames.append(sheet.crop((x, y, x + CANVAS[0], y + CANVAS[1])))
    return frames


def save_action_clip(name: str, inbetweens: list[Image.Image], neutral: Image.Image) -> list[str]:
    if len(inbetweens) != 6:
        raise ValueError(f"{name}: exactly six in-between frames are required")
    output = ASSET_ROOT / name
    output.mkdir(parents=True, exist_ok=True)
    for stale in output.glob("frame_*.png"):
        stale.unlink()
    frames = [neutral, *inbetweens, neutral]
    paths: list[str] = []
    for index, frame in enumerate(frames, 1):
        path = output / f"frame_{index:02d}.png"
        frame.save(path, optimize=True)
        paths.append(path.relative_to(ASSET_ROOT).as_posix())
    return paths


def save_idle_clip(name: str, authored_frames: list[Image.Image]) -> list[str]:
    if len(authored_frames) != 6:
        raise ValueError(f"{name}: exactly six authored idle frames are required")
    output = ASSET_ROOT / "idle" / name
    output.mkdir(parents=True, exist_ok=True)
    for stale in output.glob("frame_*.png"):
        stale.unlink()
    # Each outfit has its own fully regenerated standing first frame. The exact
    # same bitmap closes the loop; no clothing layer is composited at runtime.
    frames = [*authored_frames, authored_frames[0]]
    paths: list[str] = []
    for index, frame in enumerate(frames, 1):
        path = output / f"frame_{index:02d}.png"
        frame.save(path, optimize=True)
        paths.append(path.relative_to(ASSET_ROOT).as_posix())
    return paths


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def make_preview(clips: dict[str, list[str]]) -> None:
    tile = 112
    label_height = 24
    rows = len(clips)
    columns = max(len(paths) for paths in clips.values())
    preview = Image.new("RGB", (tile * columns, rows * (tile + label_height)), "#17212b")
    draw = ImageDraw.Draw(preview)
    for row, (name, paths) in enumerate(clips.items()):
        top = row * (tile + label_height)
        draw.text((6, top + 5), name, fill="white")
        for column, relative in enumerate(paths):
            frame = Image.open(ASSET_ROOT / relative).convert("RGBA")
            thumb = frame.resize((tile, tile), Image.Resampling.LANCZOS)
            preview.paste(thumb, (column * tile, top + label_height), thumb)
    preview.save(ASSET_ROOT / "continuity_baseline_preview.png", optimize=True)


def make_runtime_archive(
    neutral_path: Path,
    idle_clips: dict[str, list[str]],
    action_clips: dict[str, list[str]],
) -> None:
    archive_path = ASSET_ROOT / "runtime_frames.zip"
    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        archive.write(neutral_path, "frame_neutral.png")
        for outfit_index, (name, paths) in enumerate(idle_clips.items()):
            for frame_index, relative in enumerate(paths, 1):
                archive.write(
                    ASSET_ROOT / relative,
                    f"frame_idle_{outfit_index:02d}_{frame_index:02d}.png",
                )
        for action_index, (_, paths) in enumerate(action_clips.items(), 1):
            for frame_index, relative in enumerate(paths, 1):
                archive.write(
                    ASSET_ROOT / relative,
                    f"frame_action_{action_index:02d}_{frame_index:02d}.png",
                )


def main() -> None:
    idle_sheet_frames = split_sheet(SOURCE_ROOT / "idle_default_inbetweens_rgba.png")
    # The first frame from the same authored idle sheet is the canonical neutral.
    # Never substitute a separately rendered look-alike: even small identity or
    # proportion changes create a visible flash at the loop boundary.
    neutral = idle_sheet_frames[0]
    neutral_path = ASSET_ROOT / "neutral_512.png"
    neutral.save(neutral_path, optimize=True)

    idle_clips = {
        name: save_idle_clip(name, split_sheet(SOURCE_ROOT / source))
        for name, source in IDLE_SOURCES
    }
    action_clips = {
        name: save_action_clip(
            f"actions/{name}", split_sheet(SOURCE_ROOT / source), neutral
        )
        for name, source in ACTION_SOURCES
    }
    clips = {
        **{f"idle/{name}": paths for name, paths in idle_clips.items()},
        **{f"actions/{name}": paths for name, paths in action_clips.items()},
    }

    manifest = {
        "format": 2,
        "rendering": "whole-character-frames-only",
        "canvas": {"width": CANVAS[0], "height": CANVAS[1]},
        "fps": 12,
        "neutral": "neutral_512.png",
        "outfitPolicy": "idle-only-whole-frame-regeneration",
        "idle": idle_clips,
        "actions": action_clips,
    }
    (ASSET_ROOT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    make_runtime_archive(neutral_path, idle_clips, action_clips)
    make_preview(clips)

    for name, paths in clips.items():
        first = ASSET_ROOT / paths[0]
        last = ASSET_ROOT / paths[-1]
        if sha256(first) != sha256(last):
            raise RuntimeError(f"{name}: endpoint continuity validation failed")
        if name.startswith("actions/") and sha256(first) != sha256(neutral_path):
            raise RuntimeError(f"{name}: action does not use canonical neutral endpoints")
        for relative in paths:
            frame = Image.open(ASSET_ROOT / relative)
            if frame.mode != "RGBA" or frame.size != CANVAS:
                raise RuntimeError(f"{relative}: invalid mode or canvas")
            if frame.getchannel("A").getbbox() is None:
                raise RuntimeError(f"{relative}: empty frame")
        print(f"validated {name}: {len(paths)} whole-character frames, identical endpoints")


if __name__ == "__main__":
    main()
