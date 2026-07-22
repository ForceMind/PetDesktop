#!/usr/bin/env python3
"""Assemble a deduplicated static Pages artifact."""

import argparse
import shutil
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
ARCHIVE = ROOT / "assets" / "frame_animation_v2" / "runtime_frames.zip"
SHELL_FILES = ("index.html", "styles.css", "app.js", "data.json", "manifest.webmanifest", "sw.js", "_headers")


def assemble(destination: Path) -> None:
    destination = destination.resolve()
    if destination.exists():
        raise FileExistsError(f"destination already exists: {destination}")
    destination.mkdir(parents=True)

    for name in SHELL_FILES:
        shutil.copy2(WEB / name, destination / name)

    index_path = destination / "index.html"
    index = index_path.read_text(encoding="utf-8")
    marker = '<meta name="coco-frame-layout" content="source">'
    if marker not in index:
        raise RuntimeError("web frame-layout marker is missing")
    index_path.write_text(index.replace(marker, marker.replace("source", "runtime")), encoding="utf-8")

    runtime = destination / "frames"
    runtime.mkdir(parents=True)
    with zipfile.ZipFile(ARCHIVE) as archive:
        for member in archive.infolist():
            name = Path(member.filename)
            if name.name != member.filename or member.is_dir():
                raise RuntimeError(f"unsafe runtime archive entry: {member.filename}")
            archive.extract(member, runtime)

    shutil.copytree(WEB / "icons", destination / "icons")
    (destination / ".nojekyll").touch()

    frame_count = len(list(runtime.glob("*.png")))
    if frame_count != 222:
        raise RuntimeError(f"expected 222 unique runtime frames, found {frame_count}")
    neutral = runtime / "frame_neutral.png"
    if not neutral.is_file() or neutral.stat().st_size == 0:
        raise RuntimeError("runtime neutral frame is missing or empty")
    print(f"Web artifact assembled: {destination} ({frame_count} unique frames)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    assemble(args.destination)


if __name__ == "__main__":
    main()
