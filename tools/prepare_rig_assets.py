#!/usr/bin/env python3
"""Build a lossless articulated rig directly from the original Coco artwork.

The original image is the character master.  We never repaint the body.  Every
rig layer uses pixels copied from coco.png and shares one canvas, so the neutral
pose reconstructs the source without rescaling individual parts.  Limb masks
extend underneath the torso; that overlap hides shoulder/hip joints in motion.
"""

from __future__ import annotations

from pathlib import Path

from collections import deque

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSET_DIR = ROOT / "assets"
RIG_DIR = ASSET_DIR / "rig"
SOURCE_PATH = ASSET_DIR / "coco.png"

# A single common crop is used by every layer.  It preserves the source aspect
# ratio and prevents the renderer from stretching one part independently.
CROP = (306, 4, 1051, 1209)  # width 745, height 1205

# Polygons are in the source image's 1254x1254 coordinate space.  Part masks
# include generous material below the body.  Cut masks are smaller so the core
# overlaps each joint and no transparent crack can appear while it rotates.
PART_POLYGONS = {
    "arm_left": [
        (428, 742), (454, 742), (469, 775), (449, 852), (432, 955),
        (421, 1011), (359, 1014), (325, 976), (326, 906), (354, 810),
        (402, 760),
    ],
    "arm_right": [
        (786, 735), (810, 709), (846, 671), (881, 620), (927, 582),
        (976, 560), (1019, 579), (1041, 608), (1021, 668), (956, 701),
        (902, 716), (854, 771), (801, 815), (786, 782),
    ],
    "leg_left": [
        (458, 1040), (556, 1040), (611, 1060), (614, 1124), (584, 1198),
        (433, 1202), (399, 1142), (403, 1062),
    ],
    "leg_right": [
        (690, 1040), (786, 1040), (844, 1062), (861, 1125), (826, 1201),
        (668, 1201), (630, 1127), (636, 1060),
    ],
}

# Only these small joint caps remain in the core.  Everywhere else the limb is
# removed from the core completely, preventing translucent outline pixels from
# being drawn twice (the cause of the visible loop/flicker in the old build).
JOINT_OVERLAP_POLYGONS = {
    "arm_left": [(416, 730), (462, 728), (467, 782), (408, 818), (392, 765)],
    "arm_right": [(772, 716), (821, 703), (830, 774), (795, 818), (764, 790)],
    "leg_left": [(397, 1022), (616, 1022), (616, 1080), (398, 1080)],
    "leg_right": [(628, 1022), (850, 1022), (850, 1080), (630, 1080)],
}

# Rotation pivots, converted to the common cropped canvas below.
SOURCE_PIVOTS = {
    "arm_left": (442, 746),
    "arm_right": (790, 752),
    "leg_left": (505, 1048),
    "leg_right": (739, 1048),
}

JOINT_CAP_RADII = {
    "arm_left": 42,
    "arm_right": 42,
    "leg_left": 34,
    "leg_right": 34,
}

# A rotating cut-out inevitably sweeps through pixels that were transparent in
# the neutral source.  These small fabric sockets are faded in behind a moving
# limb so the desktop can never show through the shoulder/hip joint.
JOINT_SOCKET_RADII = {
    "arm_left": (150, 34),
    "arm_right": (150, 34),
    "leg_left": (90, 28),
    "leg_right": (90, 28),
}

PART_SEEDS = {
    "arm_left": (380, 930),
    "arm_right": (992, 620),
    "leg_left": (500, 1150),
    "leg_right": (744, 1150),
}


def polygon_mask(size: tuple[int, int], points: list[tuple[int, int]]) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return mask


def joint_cap_mask(size: tuple[int, int], pivot: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).ellipse((pivot[0] - radius, pivot[1] - radius,
                                  pivot[0] + radius, pivot[1] + radius), fill=255)
    return mask


def connected_part_mask(source: Image.Image, polygon: Image.Image,
                        seed: tuple[int, int], pivot: tuple[int, int]) -> Image.Image:
    """Discard tassels and cords that merely cross a limb's polygon."""
    alpha = source.getchannel("A")
    alpha_pixels = alpha.load()
    polygon_pixels = polygon.load()
    width, height = source.size
    seed_x, seed_y = seed
    if alpha_pixels[seed_x, seed_y] <= 8 or polygon_pixels[seed_x, seed_y] == 0:
        raise RuntimeError(f"Part seed {seed} is not on visible source artwork")
    visited = bytearray(width * height)
    queue = deque([seed])
    visited[seed_y * width + seed_x] = 1
    while queue:
        x, y = queue.popleft()
        for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if not (0 <= next_x < width and 0 <= next_y < height):
                continue
            index = next_y * width + next_x
            if visited[index] or polygon_pixels[next_x, next_y] == 0:
                continue
            if alpha_pixels[next_x, next_y] <= 8:
                continue
            visited[index] = 1
            queue.append((next_x, next_y))
    connected = Image.new("L", source.size, 0)
    connected_pixels = connected.load()
    for index, value in enumerate(visited):
        if value:
            connected_pixels[index % width, index // width] = 255
    # Remove very thin crossing cords/tassels that are connected to the body but
    # are not part of the limb, then restore the antialiased outer fringe.
    connected = connected.filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(7))
    connected = connected.filter(ImageFilter.MaxFilter(3))
    connected = ImageChops.multiply(connected, polygon)

    # A limb may contain original pixels on the torso side of its pivot. Those
    # pixels are invisible in neutral pose but swing out as triangular scraps
    # after rotation. Keep only the distal half-plane (toward the hand/foot);
    # the intact core supplies the proximal shoulder/hip overlap.
    direction_x = seed[0] - pivot[0]
    direction_y = seed[1] - pivot[1]
    length = (direction_x * direction_x + direction_y * direction_y) ** 0.5
    direction_x /= length
    direction_y /= length
    pixels = connected.load()
    box = connected.getbbox()
    if box:
        for y in range(box[1], box[3]):
            for x in range(box[0], box[2]):
                if ((x - pivot[0]) * direction_x +
                        (y - pivot[1]) * direction_y) < -5:
                    pixels[x, y] = 0
    cap = joint_cap_mask(source.size, pivot, 42 if abs(direction_x) > 0.2 else 34)
    cap = ImageChops.multiply(cap, source.getchannel("A").point(lambda value: 255 if value > 8 else 0))
    cap_pixels = cap.load()
    cap_box = cap.getbbox()
    if cap_box:
        for y in range(cap_box[1], cap_box[3]):
            for x in range(cap_box[0], cap_box[2]):
                if ((x - pivot[0]) * direction_x +
                        (y - pivot[1]) * direction_y) < -5:
                    cap_pixels[x, y] = 0
    return ImageChops.lighter(connected, cap)


def layer_from_mask(source: Image.Image, mask: Image.Image) -> Image.Image:
    layer = source.copy()
    layer.putalpha(ImageChops.multiply(source.getchannel("A"), mask))
    # Clear hidden RGB data as well; otherwise transparent layers compress very
    # poorly and make the executable unnecessarily large.
    clean = Image.new("RGBA", source.size, (0, 0, 0, 0))
    clean.alpha_composite(layer)
    return clean


def build_joint_socket(part: Image.Image, pivot: tuple[int, int],
                       radii: tuple[int, int], seed: tuple[int, int]) -> Image.Image:
    """Fill a rounded joint socket with nearest real burlap pixels.

    The socket is not visible in neutral pose.  Runtime fades it in only while
    its limb moves, behind both the limb and the intact torso core.
    """
    socket_length, half_width = radii
    direction_x = seed[0] - pivot[0]
    direction_y = seed[1] - pivot[1]
    direction_length = (direction_x * direction_x + direction_y * direction_y) ** 0.5
    donor_x = pivot[0] + direction_x / direction_length * 54
    donor_y = pivot[1] + direction_y / direction_length * 54
    margin = socket_length + half_width + 18
    left = max(0, pivot[0] - margin)
    top = max(0, pivot[1] - margin)
    right = min(part.width, pivot[0] + margin + 1)
    bottom = min(part.height, pivot[1] + margin + 1)
    width, height = right - left, bottom - top
    pixels = part.load()
    nearest: list[int] = [-1] * (width * height)
    queue: deque[tuple[int, int]] = deque()
    for y in range(height):
        for x in range(width):
            source_x, source_y = left + x, top + y
            if pixels[source_x, source_y][3] > 32:
                nearest[y * width + x] = y * width + x
                queue.append((x, y))
    if not queue:
        raise RuntimeError(f"No source fabric around joint pivot {pivot}")
    while queue:
        x, y = queue.popleft()
        owner = nearest[y * width + x]
        for next_x, next_y in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if not (0 <= next_x < width and 0 <= next_y < height):
                continue
            index = next_y * width + next_x
            if nearest[index] >= 0:
                continue
            nearest[index] = owner
            queue.append((next_x, next_y))

    # Build a narrow capsule along the neutral upper limb. Runtime rotates this
    # capsule by half the limb angle, placing it between torso and moving limb
    # without exposing a large circular patch behind the character.
    unit_x = direction_x / direction_length
    unit_y = direction_y / direction_length
    start = (round(pivot[0] - unit_x * 20), round(pivot[1] - unit_y * 20))
    end = (round(pivot[0] + unit_x * socket_length),
           round(pivot[1] + unit_y * socket_length))
    mask = Image.new("L", part.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.line((start, end), fill=255, width=half_width * 2)
    for center_x, center_y in (start, end):
        mask_draw.ellipse((center_x - half_width, center_y - half_width,
                           center_x + half_width, center_y + half_width), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.2))
    mask_pixels = mask.load()
    socket = Image.new("RGBA", part.size, (0, 0, 0, 0))
    socket_pixels = socket.load()
    mask_box = mask.getbbox()
    if mask_box:
        for y in range(mask_box[1], mask_box[3]):
            for x in range(mask_box[0], mask_box[2]):
                alpha = mask_pixels[x, y]
                if not alpha:
                    continue
                sample_x = round(donor_x + (x - pivot[0]) * 0.58)
                sample_y = round(donor_y + (y - pivot[1]) * 0.58)
                sample_x = min(part.width - 1, max(0, sample_x))
                sample_y = min(part.height - 1, max(0, sample_y))
                red, green, blue, sample_alpha = pixels[sample_x, sample_y]
                if sample_alpha <= 32:
                    local_x = min(width - 1, max(0, sample_x - left))
                    local_y = min(height - 1, max(0, sample_y - top))
                    owner = nearest[local_y * width + local_x]
                    owner_x, owner_y = owner % width, owner // width
                    red, green, blue, _ = pixels[left + owner_x, top + owner_y]
                socket_pixels[x, y] = (red, green, blue, alpha)
    return socket


def build_icon(source: Image.Image) -> Image.Image:
    # Crop the complete original face and feather crown.  The limb-free core is
    # passed here so the source's raised hand cannot intrude into the icon.
    portrait = source.crop((320, 16, 934, 760))
    portrait_mask = Image.new("L", portrait.size, 0)
    mask_draw = ImageDraw.Draw(portrait_mask)
    mask_draw.rectangle((0, 0, portrait.width, 390), fill=255)
    mask_draw.ellipse((4, 245, portrait.width - 4, 735), fill=255)
    portrait.putalpha(ImageChops.multiply(portrait.getchannel("A"), portrait_mask))
    icon = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    draw = ImageDraw.Draw(icon)
    draw.ellipse((28, 28, 996, 996), fill=(15, 57, 89, 255),
                 outline=(243, 170, 31, 255), width=28)
    scale = min(890 / portrait.width, 890 / portrait.height)
    resized = portrait.resize((round(portrait.width * scale),
                               round(portrait.height * scale)),
                              Image.Resampling.LANCZOS)
    icon.alpha_composite(resized, ((1024 - resized.width) // 2,
                                   (1024 - resized.height) // 2 + 26))
    return icon


def rotate_layer(layer: Image.Image, pivot: tuple[int, int], angle: float,
                 dx: float = 0, dy: float = 0) -> Image.Image:
    transformed = layer.rotate(angle, resample=Image.Resampling.BICUBIC,
                               center=pivot)
    if dx or dy:
        shifted = Image.new("RGBA", layer.size, (0, 0, 0, 0))
        shifted.alpha_composite(transformed, (round(dx), round(dy)))
        return shifted
    return transformed


def compose(core: Image.Image, parts: dict[str, Image.Image],
            angles: dict[str, float] | None = None,
            offsets: dict[str, tuple[float, float]] | None = None) -> Image.Image:
    angles = angles or {}
    offsets = offsets or {}
    canvas = Image.new("RGBA", core.size, (0, 0, 0, 0))
    # Legs and arms live behind the intact head/torso core.
    for name in ("leg_left", "leg_right", "arm_left", "arm_right"):
        dx, dy = offsets.get(name, (0, 0))
        canvas.alpha_composite(rotate_layer(parts[name], SOURCE_PIVOTS[name],
                                            angles.get(name, 0), dx, dy))
    canvas.alpha_composite(core)
    return canvas


def make_preview(original_crop: Image.Image, neutral: Image.Image,
                 parts: dict[str, Image.Image], core: Image.Image) -> Image.Image:
    poses = [
        original_crop,
        neutral,
        compose(core, parts, {"arm_left": 14, "arm_right": -12,
                              "leg_left": -3, "leg_right": 4}),
        compose(core, parts, {"arm_left": -10, "arm_right": 10,
                              "leg_left": 5, "leg_right": -4},
                {"leg_left": (-4, -9), "leg_right": (4, 2)}),
    ]
    labels = ["ORIGINAL", "NEUTRAL", "ARM MOTION", "STEP MOTION"]
    panel_width, panel_height = 420, 700
    preview = Image.new("RGBA", (panel_width * 4, panel_height), (24, 31, 38, 255))
    draw = ImageDraw.Draw(preview)
    for index, (pose, label) in enumerate(zip(poses, labels)):
        shown = pose.copy()
        shown.thumbnail((390, 640), Image.Resampling.LANCZOS)
        x = index * panel_width + (panel_width - shown.width) // 2
        y = 45 + (640 - shown.height) // 2
        preview.alpha_composite(shown, (x, y))
        draw.text((index * panel_width + 16, 14), label, fill=(255, 255, 255, 255))
    return preview


def main() -> None:
    RIG_DIR.mkdir(parents=True, exist_ok=True)
    source = Image.open(SOURCE_PATH).convert("RGBA")
    if source.size != (1254, 1254):
        raise RuntimeError(f"Unexpected source size {source.size}; masks target 1254x1254")

    parts_full: dict[str, Image.Image] = {}
    core = source.copy()
    core_alpha = source.getchannel("A").copy()
    for name, points in PART_POLYGONS.items():
        part_region = polygon_mask(source.size, points)
        part_mask = connected_part_mask(source, part_region, PART_SEEDS[name],
                                        SOURCE_PIVOTS[name])
        parts_full[name] = layer_from_mask(source, part_mask)
        joint_overlap = ImageChops.lighter(
            polygon_mask(source.size, JOINT_OVERLAP_POLYGONS[name]),
            joint_cap_mask(source.size, SOURCE_PIVOTS[name], JOINT_CAP_RADII[name]))
        cut_mask = ImageChops.subtract(part_mask, joint_overlap)
        core_alpha = ImageChops.subtract(core_alpha, cut_mask)
    core.putalpha(core_alpha)
    sockets_full = {
        name: build_joint_socket(image, SOURCE_PIVOTS[name], JOINT_SOCKET_RADII[name],
                                 PART_SEEDS[name])
        for name, image in parts_full.items()
    }

    # Convert pivots and every layer to the same fixed crop.
    crop_left, crop_top, _, _ = CROP
    for name, pivot in list(SOURCE_PIVOTS.items()):
        SOURCE_PIVOTS[name] = (pivot[0] - crop_left, pivot[1] - crop_top)

    core_crop = core.crop(CROP)
    original_crop = source.crop(CROP)
    parts = {name: image.crop(CROP) for name, image in parts_full.items()}
    core_crop.save(RIG_DIR / "original_core.png", optimize=True)
    for name, image in parts.items():
        image.save(RIG_DIR / f"original_{name}.png", optimize=True)
    for name, socket in sockets_full.items():
        socket.crop(CROP).save(RIG_DIR / f"original_socket_{name}.png", optimize=True)

    neutral = compose(core_crop, parts)
    neutral.save(RIG_DIR / "original_neutral.png", optimize=True)
    make_preview(original_crop, neutral, parts, core_crop).save(
        RIG_DIR / "original_rig_preview.png", optimize=True)

    # The neutral render must retain the original silhouette and be nearly
    # pixel-identical.  Exact RGB is expected except at transparent boundaries.
    diff = ImageChops.difference(original_crop, neutral)
    bbox = diff.getbbox()
    changed = 0 if bbox is None else sum(1 for pixel in diff.getdata() if any(pixel))
    total_visible = sum(1 for alpha in original_crop.getchannel("A").getdata() if alpha)
    changed_ratio = changed / max(1, total_visible)
    if changed_ratio > 0.005:
        raise RuntimeError(f"Neutral reconstruction changed {changed_ratio:.3%} of visible pixels")

    icon = build_icon(core)
    icon.save(RIG_DIR / "app_icon.png", optimize=True)
    icon.save(ASSET_DIR / "coco.ico", format="ICO",
              sizes=[(16, 16), (24, 24), (32, 32), (48, 48),
                     (64, 64), (128, 128), (256, 256)])

    print(f"rig canvas: {core_crop.width}x{core_crop.height}")
    print("pivots:", SOURCE_PIVOTS)
    print(f"neutral changed pixels: {changed} ({changed_ratio:.5%})")
    print("wrote original-pixel rig, preview, and app icons")


if __name__ == "__main__":
    main()
