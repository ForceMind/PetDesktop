#!/usr/bin/env python3
"""Create a macOS-friendly source/build package with POSIX zip metadata."""

from __future__ import annotations

import stat
import time
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "dist-macos" / "Coco桌宠-macOS构建包.zip"


def add_file(archive: zipfile.ZipFile, path: Path, executable: bool = False) -> None:
    relative = path.relative_to(ROOT).as_posix()
    timestamp = time.localtime(path.stat().st_mtime)[:6]
    info = zipfile.ZipInfo(relative, timestamp)
    info.create_system = 3
    mode = 0o755 if executable else 0o644
    info.external_attr = (stat.S_IFREG | mode) << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    archive.writestr(info, path.read_bytes())


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    files = [
        ROOT / "build_macos.command",
        ROOT / "README.md",
        ROOT / "macos" / "main.swift",
        ROOT / "macos" / "Info.plist",
        ROOT / "assets" / "coco.png",
        *sorted((ROOT / "assets" / "poses").glob("action_*.png")),
        *sorted((ROOT / "assets" / "idle").glob("idle_*.png")),
    ]

    with zipfile.ZipFile(OUTPUT, "w", allowZip64=True) as archive:
        for path in files:
            if not path.is_file():
                raise FileNotFoundError(path)
            add_file(archive, path, executable=path.name == "build_macos.command")

    print(f"macOS build package: {OUTPUT}")
    print(f"Files: {len(files)} | Size: {OUTPUT.stat().st_size / 1024 / 1024:.1f} MB")


if __name__ == "__main__":
    main()
