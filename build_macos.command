#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$SCRIPT_DIR/dist-macos"
APP_DIR="$DIST_DIR/Coco桌宠.app"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
RESOURCES_DIR="$CONTENTS_DIR/Resources"
BUILD_DIR="$SCRIPT_DIR/.macos-build"

if ! command -v xcrun >/dev/null 2>&1 || ! xcrun --find swiftc >/dev/null 2>&1; then
    echo "未找到 Swift 编译器。请先从 App Store 安装 Xcode，然后重试。"
    echo "Swift compiler not found. Install Xcode from the App Store, then try again."
    read -r -p "按回车键退出 / Press Return to exit..."
    exit 1
fi

rm -rf "$APP_DIR" "$BUILD_DIR"
mkdir -p "$MACOS_DIR" "$RESOURCES_DIR" "$BUILD_DIR"

cp "$SCRIPT_DIR/macos/Info.plist" "$CONTENTS_DIR/Info.plist"
cp "$SCRIPT_DIR/assets/coco.png" "$RESOURCES_DIR/coco.png"
cp "$SCRIPT_DIR/assets/frame_animation/base.png" "$RESOURCES_DIR/frame_base.png"
for idle_frame in "$SCRIPT_DIR"/assets/frame_animation/idle/idle_*.png; do
    cp "$idle_frame" "$RESOURCES_DIR/frame_$(basename "$idle_frame")"
done
for action_frame in "$SCRIPT_DIR"/assets/frame_animation/actions/action_*.png; do
    cp "$action_frame" "$RESOURCES_DIR/frame_$(basename "$action_frame")"
done
for rig_asset in original_core original_arm_left original_arm_right original_leg_left original_leg_right outfit_scarf outfit_cape outfit_glasses outfit_cap; do
    cp "$SCRIPT_DIR/assets/rig/${rig_asset}.png" "$RESOURCES_DIR/${rig_asset}.png"
done

ICONSET_DIR="$BUILD_DIR/CocoApp.iconset"
mkdir -p "$ICONSET_DIR"
for size in 16 32 128 256 512; do
    double_size=$((size * 2))
    sips -z "$size" "$size" "$SCRIPT_DIR/assets/rig/app_icon.png" \
        --out "$ICONSET_DIR/icon_${size}x${size}.png" >/dev/null
    sips -z "$double_size" "$double_size" "$SCRIPT_DIR/assets/rig/app_icon.png" \
        --out "$ICONSET_DIR/icon_${size}x${size}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET_DIR" -o "$RESOURCES_DIR/CocoApp.icns"

SDK_PATH="$(xcrun --sdk macosx --show-sdk-path)"
SOURCE_FILE="$SCRIPT_DIR/macos/main.swift"
BUILT_BINARIES=()

for architecture in arm64 x86_64; do
    architecture_binary="$BUILD_DIR/CocoDesktopPet-$architecture"
    if xcrun swiftc "$SOURCE_FILE" \
        -sdk "$SDK_PATH" \
        -target "$architecture-apple-macosx11.0" \
        -framework Cocoa \
        -O \
        -o "$architecture_binary"; then
        BUILT_BINARIES+=("$architecture_binary")
    else
        echo "跳过不受当前 Xcode 支持的架构：$architecture"
    fi
done

if [[ ${#BUILT_BINARIES[@]} -eq 2 ]]; then
    xcrun lipo -create "${BUILT_BINARIES[@]}" -output "$MACOS_DIR/CocoDesktopPet"
elif [[ ${#BUILT_BINARIES[@]} -eq 1 ]]; then
    cp "${BUILT_BINARIES[0]}" "$MACOS_DIR/CocoDesktopPet"
else
    echo "没有成功编译任何 macOS 架构。"
    exit 1
fi

chmod +x "$MACOS_DIR/CocoDesktopPet"

if command -v codesign >/dev/null 2>&1; then
    codesign --force --deep --sign - "$APP_DIR"
fi

rm -rf "$BUILD_DIR"
rm -f "$DIST_DIR/Coco桌宠-macOS.zip"
ditto -c -k --sequesterRsrc --keepParent "$APP_DIR" "$DIST_DIR/Coco桌宠-macOS.zip"

echo
echo "构建完成：$APP_DIR"
echo "压缩包：$DIST_DIR/Coco桌宠-macOS.zip"
if [[ -z "${CI:-}" ]]; then
    open -R "$APP_DIR"
    read -r -p "按回车键退出 / Press Return to exit..."
fi
