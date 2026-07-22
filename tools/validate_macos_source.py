#!/usr/bin/env python3
"""Static checks that can run on Windows before the AppKit build runs on macOS."""

from __future__ import annotations

import plistlib
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "macos" / "main.swift"


def extract_string_array(source: str, name: str) -> list[str]:
    match = re.search(
        rf"private let {re.escape(name)} = \[(.*?)\n    \]",
        source,
        flags=re.DOTALL,
    )
    if not match:
        raise AssertionError(f"Missing string array: {name}")
    return re.findall(r'"((?:\\.|[^"\\])*)"', match.group(1))


def check_delimiters(source: str) -> None:
    pairs = {"(": ")", "[": "]", "{": "}"}
    stack: list[tuple[str, int]] = []
    index = 0
    in_string = False
    in_line_comment = False
    in_block_comment = False

    while index < len(source):
        char = source[index]
        following = source[index + 1] if index + 1 < len(source) else ""
        if in_line_comment:
            if char == "\n":
                in_line_comment = False
        elif in_block_comment:
            if char == "*" and following == "/":
                in_block_comment = False
                index += 1
        elif in_string:
            if char == "\\":
                index += 1
            elif char == '"':
                in_string = False
        elif char == "/" and following == "/":
            in_line_comment = True
            index += 1
        elif char == "/" and following == "*":
            in_block_comment = True
            index += 1
        elif char == '"':
            in_string = True
        elif char in pairs:
            stack.append((char, index))
        elif char in pairs.values():
            if not stack or pairs[stack[-1][0]] != char:
                raise AssertionError(f"Unbalanced delimiter {char!r} at offset {index}")
            stack.pop()
        index += 1

    if in_string or in_block_comment or stack:
        raise AssertionError("Swift source ends with an unterminated construct")


def main() -> None:
    source = SOURCE.read_text(encoding="utf-8")
    check_delimiters(source)

    chinese = extract_string_array(source, "chineseLines")
    english = extract_string_array(source, "englishLines")
    english_extras = extract_string_array(source, "englishExtras")
    assert len(chinese) == 32, f"Expected 32 Chinese action lines, found {len(chinese)}"
    assert len(english) == 32, f"Expected 32 English action lines, found {len(english)}"
    assert all(line.isascii() for line in english + english_extras), (
        "English dialogue mode contains non-ASCII text"
    )

    assert "updateContinuousGaze()" in source, "Missing continuous cursor tracking"
    draw_block = source[source.index("override func draw"):source.index("private func drawIdleLayers")]
    assert "currentWholeCharacterFrame()" in draw_block, "Live renderer does not select whole frames"
    assert "currentActionOffset(canvasSize: petRect.height)" in draw_block
    assert "image.draw(in: motionRect" in draw_block, "Whole frame is not drawn directly"
    assert "drawRigCharacter" not in draw_block, "Live renderer still assembles rig parts"
    assert "transform.scale" not in draw_block, "Live renderer still stretches authored frames"
    assert "let petWidth = petHeight" in source, "Square authored canvas is not preserved"
    assert "frameIdleOutfits" in source, "Missing fully regenerated outfit idle sequences"
    assert "frameActions" in source, "Missing authored action sequences"
    for action_case in (8, 9, 15, 22, 25, 26):
        assert f"case {action_case}:" in source, f"Missing explicit motion path {action_case}"

    windows_source = (ROOT / "DesktopPetForm.cs").read_text(encoding="utf-8")
    for action_name in ("HopLeft", "HopRight", "FigureEight", "Moonwalk", "Sneak", "Charge"):
        assert f"case InteractionKind.{action_name}:" in windows_source, (
            f"Windows is missing the {action_name} motion path"
        )
    mac_build = (ROOT / "build_macos.command").read_text(encoding="utf-8")
    assert "cp -R \"$SCRIPT_DIR/assets/frame_animation_v2/idle\"" not in mac_build
    assert "for number in $(seq 2 7)" in mac_build

    frame_root = ROOT / "assets" / "frame_animation_v2"
    assert (frame_root / "neutral_512.png").is_file(), "Missing neutral standing frame"
    idle_names = ["default", "red_scarf", "blue_cape", "round_glasses", "sailor_cap"]
    for name in idle_names:
        frames = sorted((frame_root / "idle" / name).glob("frame_[0-9][0-9].png"))
        assert len(frames) == 7, f"Expected seven {name} idle frames, found {len(frames)}"
    action_dirs = sorted((frame_root / "actions").glob("[0-9][0-9]_*"))
    assert len(action_dirs) == 32, f"Expected 32 action directories, found {len(action_dirs)}"
    assert all(len(list(path.glob("frame_[0-9][0-9].png"))) == 8 for path in action_dirs), (
        "A macOS action does not contain eight complete frames"
    )

    with (ROOT / "macos" / "Info.plist").open("rb") as plist_file:
        plist = plistlib.load(plist_file)
    assert plist["CFBundleExecutable"] == "CocoDesktopPet"
    assert plist["CFBundleIconFile"] == "CocoApp"
    assert plist["CFBundleDisplayName"] == "Coco桌宠"
    assert plist["CFBundleName"] == "Coco桌宠"
    assert plist["LSUIElement"] is True

    print("macOS static validation passed")
    print("Actions: 32 x 8 whole-character frames")
    print("Renderer: direct square-frame drawing without rig or stretch")
    print("Outfits: five regenerated idle frame sequences, no overlays")
    print("Dialogue: 32 Chinese + 32 pure-English action lines")
    print("Timeline: stable Coco -> continuous motion -> stable Coco")


if __name__ == "__main__":
    main()
