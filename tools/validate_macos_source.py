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

    numeric_cases = {int(value) for value in re.findall(r"case (\d+):", source)}
    assert numeric_cases == set(range(32)), "The macOS motion switch must cover actions 0...31"
    for marker in ("0.36", "0.48", "0.70", "0.82", "0.90"):
        assert marker in source, f"Missing animation timeline marker {marker}"

    pose_dir = ROOT / "assets" / "poses"
    frames_a = sorted(pose_dir.glob("action_[0-9][0-9].png"))
    frames_b = sorted(pose_dir.glob("action_[0-9][0-9]_b.png"))
    assert len(frames_a) == 32, f"Expected 32 A frames, found {len(frames_a)}"
    assert len(frames_b) == 32, f"Expected 32 B frames, found {len(frames_b)}"
    idle_dir = ROOT / "assets" / "idle"
    follow_frames = sorted(idle_dir.glob("idle_follow_[0-9][0-9].png"))
    life_frames = sorted(idle_dir.glob("idle_life_[0-9][0-9].png"))
    assert len(follow_frames) == 8, f"Expected 8 follow frames, found {len(follow_frames)}"
    assert len(life_frames) == 8, f"Expected 8 lively idle frames, found {len(life_frames)}"

    with (ROOT / "macos" / "Info.plist").open("rb") as plist_file:
        plist = plistlib.load(plist_file)
    assert plist["CFBundleExecutable"] == "CocoDesktopPet"
    assert plist["LSUIElement"] is True

    print("macOS static validation passed")
    print(f"Actions: {len(frames_a)} | Action keyframes: {len(frames_a) + len(frames_b)}")
    print(f"Idle keyframes: {len(follow_frames) + len(life_frames)}")
    print("Dialogue: 32 Chinese + 32 pure-English action lines")
    print("Timeline: idle -> A -> B -> A -> idle")


if __name__ == "__main__":
    main()
