# Coco 桌宠

[![Build Coco Desktop Pet](https://github.com/ForceMind/PetDesktop/actions/workflows/build.yml/badge.svg)](https://github.com/ForceMind/PetDesktop/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/ForceMind/PetDesktop)](https://github.com/ForceMind/PetDesktop/releases/latest)

Coco 是一款支持 Windows 与 macOS 的透明桌面宠物。v1.5.0 使用完整角色逐帧动画：每一帧都是已经画好的完整 Coco，不再把头、手臂、腿或服装作为运行时图层拼接，因此不会出现肩膀断开、肢体重影或非等比拉伸。

## 下载

从 [GitHub Releases](https://github.com/ForceMind/PetDesktop/releases/latest) 获取最新版本：

- Windows：下载 `Coco桌宠-Windows-x64.zip`，解压后双击 EXE。
- macOS：下载 `Coco桌宠-macOS.zip`，解压后运行 `Coco桌宠.app`。

macOS 包使用临时本地签名。首次启动若被 Gatekeeper 阻止，请在 Finder 中右键应用并选择“打开”。

## 动画原则

- `assets/coco.png` 是最初角色的身份与材质参考，不直接作为待机姿势，因为原图本身正在招手。
- 默认待机是正面自然站立：双臂放下、双脚着地，并持续呼吸、眨眼和轻微活动。
- 32 个互动动作分别设计、分别生成，每个动作都有 8 张完整角色帧。
- 每个互动的第 1 帧和第 8 帧都与默认待机第 1 帧完全一致，动作结束后无缝回到待机。
- 5 种待机外观各有独立的 7 帧完整动画；换装不是把图片贴到角色身上。
- 换装只影响待机。触发互动时使用默认 Coco 动作，结束后回到当前服装的待机循环。
- 所有生产帧均为 512×512 RGBA 方形画布，运行时只做等比缩放。

## 功能

- 透明、无边框、始终置顶，可关闭置顶。
- 左键拖动；滚轮连续缩放；右键菜单调整大小、语言、换装、置顶与退出。
- 点击头部、左右脸、左右手、身体和脚部，会从相应动作组中触发不同互动。
- 32 种动作：跳跃、压扁回弹、左右抖动、连续弹跳、点头、摇摆、正反旋转、左右跳、踮脚、伸展、缩小、左右探头、八字移动、颤动、神气、鞠躬、前后空翻、跳舞、太空步、心跳、眩晕、潜行、蓄力、漂浮、跺脚、大笑、惊喜和困倦。
- Coco 会根据鼠标方向转动视线/头部；待机不是静态图片。
- 中文模式可混入简单英文；英文模式使用英文对白。气泡会自动换行和调整大小，并放在角色旁边。
- Windows 与 macOS 均包含 Coco 应用图标。

## 本地构建

Windows PowerShell：

```powershell
.\build.ps1 -Clean
.\smoke_test.ps1
```

输出：`dist\Coco桌宠.exe`。

macOS 11 或更高版本并安装 Xcode：

```bash
chmod +x build_macos.command
./build_macos.command
```

输出：`dist-macos/Coco桌宠.app` 与 `dist-macos/Coco桌宠-macOS.zip`。

## 文档

- [动画 v2 设计](docs/ANIMATION_V2_PLAN.md)
- [架构](docs/ARCHITECTURE.md)
- [素材说明](docs/ASSETS.md)
- [构建与发布](docs/BUILD_AND_RELEASE.md)
- [测试](docs/TESTING.md)
- [故障排查](docs/TROUBLESHOOTING.md)
- [变更记录](CHANGELOG.md)

## 许可证

项目代码使用 [Apache License 2.0](LICENSE)。角色图片及第三方素材仍应遵守各自的权利要求。
