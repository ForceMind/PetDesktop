#!/usr/bin/env python3
"""Build a Cloudflare Pages ZIP with portable POSIX entry names."""

import argparse
import tempfile
import zipfile
from pathlib import Path

from assemble_web import ROOT, assemble


def package(output: Path) -> None:
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise FileExistsError(f"output already exists: {output}")

    temp_root = ROOT / "tmp"
    temp_root.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="coco-cloudflare-", dir=temp_root) as temporary:
        staging = Path(temporary) / "site"
        assemble(staging)
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for path in sorted(item for item in staging.rglob("*") if item.is_file()):
                archive.write(path, path.relative_to(staging).as_posix())

    with zipfile.ZipFile(output) as archive:
        names = archive.namelist()
        if any("\\" in name for name in names):
            raise RuntimeError("Cloudflare package contains non-portable backslash paths")
        if "frames/frame_neutral.png" not in names:
            raise RuntimeError("Cloudflare package is missing frames/frame_neutral.png")
        if sum(name.startswith("frames/") and name.endswith(".png") for name in names) != 222:
            raise RuntimeError("Cloudflare package does not contain exactly 222 runtime frames")

    print(f"Cloudflare Pages package created: {output} ({len(names)} files)")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("output", type=Path)
    arguments = parser.parse_args()
    package(arguments.output)


if __name__ == "__main__":
    main()
