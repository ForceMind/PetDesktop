#!/usr/bin/env python3
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
FRAMES = ROOT / "assets" / "frame_animation_v2"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    required = ["index.html", "styles.css", "app.js", "data.json", "manifest.webmanifest", "sw.js"]
    for name in required:
        require((WEB / name).is_file(), f"missing web file: {name}")

    payload = json.loads((WEB / "data.json").read_text(encoding="utf-8"))
    actions = payload["actions"]
    outfits = payload["outfits"]
    require(len(actions) >= 30, f"expected at least 30 actions, found {len(actions)}")
    require(len({item["id"] for item in actions}) == len(actions), "action ids must be unique")
    require(len(outfits) == 5, f"expected five idle outfits, found {len(outfits)}")

    action_ids = {item["id"] for item in actions}
    for action in actions:
        require(action["duration"] > 0, f"invalid duration: {action['id']}")
        require(not re.search(r"[\u3400-\u9fff]", action["lineEn"]), f"English line contains Chinese: {action['id']}")
        folder = FRAMES / "actions" / action["dir"]
        frames = [folder / f"frame_{number:02d}.png" for number in range(1, 9)]
        require(all(frame.is_file() for frame in frames), f"missing authored frames: {action['id']}")

    for outfit in outfits:
        folder = FRAMES / "idle" / outfit["id"]
        frames = [folder / f"frame_{number:02d}.png" for number in range(1, 8)]
        require(all(frame.is_file() for frame in frames), f"missing idle outfit frames: {outfit['id']}")

    for region, choices in payload["regions"].items():
        require(choices, f"empty click region: {region}")
        require(set(choices) <= action_ids, f"unknown action in click region: {region}")
    require(set(payload["automatic"]) <= action_ids, "unknown automatic action")

    source = (WEB / "app.js").read_text(encoding="utf-8")
    require("state.queued" in source and "neutralUntil" in source, "web action queue/handoff is missing")
    require("requestAnimationFrame(render)" in source, "animation loop is missing")
    require("localStorage" in source, "preference persistence is missing")
    require("serviceWorker.register" in source, "PWA registration is missing")
    require("rigArm" not in source and "drawImage" in source, "web renderer must use whole frames")
    require("FRAME_LAYOUT" in source and "frame_neutral.png" in source, "deduplicated Pages frame layout is missing")
    require("state.pinch" in source and "state.pointers" in source, "mobile pinch interaction is missing")
    styles = (WEB / "styles.css").read_text(encoding="utf-8")
    require("100dvh" in styles and "safe-area-inset-bottom" in styles, "mobile viewport/safe-area layout is missing")
    visible_sources = "\n".join((WEB / name).read_text(encoding="utf-8") for name in required)
    require("github" not in visible_sources.lower(), "deployed web sources must not show GitHub branding")

    with __import__("zipfile").ZipFile(FRAMES / "runtime_frames.zip") as archive:
        require(len(archive.namelist()) == 222, "web runtime archive must contain 222 unique PNGs")

    print(f"Web validation passed: {len(actions)} actions, {len(outfits)} idle outfits.")


if __name__ == "__main__":
    main()
