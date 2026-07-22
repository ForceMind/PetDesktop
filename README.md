# Coco 桌宠

[![Build Coco Desktop Pet](https://github.com/ForceMind/PetDesktop/actions/workflows/build.yml/badge.svg)](https://github.com/ForceMind/PetDesktop/actions/workflows/build.yml)
[![Deploy Coco Web Pet](https://github.com/ForceMind/PetDesktop/actions/workflows/pages.yml/badge.svg)](https://github.com/ForceMind/PetDesktop/actions/workflows/pages.yml)
[![Release](https://img.shields.io/github/v/release/ForceMind/PetDesktop)](https://github.com/ForceMind/PetDesktop/releases/latest)

Coco 是一款支持 Windows、macOS 与 Web 的互动宠物。当前 `v1.8.0` 使用完整角色逐帧动画：每一帧都是已经画好的完整 Coco，不再把头、手臂、腿或服装作为运行时图层拼接；同时支持安静站立、偶尔待机小动作、无操作自动表演与不可打断的动作队列。

## 下载

从 [GitHub Releases](https://github.com/ForceMind/PetDesktop/releases/latest) 获取最新版本：

- Windows：下载 `CocoDesktopPet-Windows.exe`，双击即可运行。
- macOS：下载 `CocoDesktopPet-macOS-universal.zip`，解压后运行 `Coco Desktop Pet.app`。
- Web：打开 [Coco Web Pet](https://forcemind.github.io/PetDesktop/)，无需下载；也可在支持的浏览器中安装为 PWA。

macOS 包使用临时本地签名。首次启动若被 Gatekeeper 阻止，请在 Finder 中右键应用并选择“打开”。

## 动画原则

- `assets/coco.png` 是最初角色的身份与材质参考，不直接作为待机姿势，因为原图本身正在招手。
- 默认待机是正面自然站立：双臂放下、双脚着地；短暂待机动画之间会保持站立，不会不停点脚。
- 32 个互动动作分别设计、分别生成，每个动作都有 8 张完整角色帧。
- 每个互动的第 1 帧和第 8 帧都与默认待机第 1 帧完全一致，动作结束后无缝回到待机。
- 5 种待机外观各有独立的 7 帧完整动画；换装不是把图片贴到角色身上。
- 换装只影响待机。触发互动时使用默认 Coco 动作，结束后回到当前服装的自然站立状态。
- 所有生产帧均为 512×512 RGBA 方形画布，运行时只做等比缩放。

## 功能

- 透明、无边框、始终置顶，可关闭置顶。
- 左键拖动；滚轮连续缩放；右键菜单可调整大小、换装、置顶与退出；中文系统额外显示中文/English 切换。
- 点击头部、左右脸、左右手、身体和脚部，会从相应动作组中触发不同互动。
- 快速连续点击不会打断当前动画：最多预排一个动作，Coco 完整演完、短暂回到站立帧后再继续，并用气泡提示队列状态。
- 32 种动作：跳跃、压扁回弹、左右抖动、连续弹跳、点头、摇摆、正反旋转、左右跳、踮脚、伸展、缩小、左右探头、八字移动、颤动、神气、鞠躬、前后空翻、跳舞、太空步、心跳、眩晕、潜行、蓄力、漂浮、跺脚、大笑、惊喜和困倦。
- Coco 会根据鼠标方向转动视线/头部；待机不是静态图片。
- 待机以自然站立为主，不再不停循环点脚：约每 3–8 秒才播放一次完整待机小动作；长时间不操作时，约每 18–36 秒会偶尔自动表演一个完整互动动作。
- 非中文系统默认且固定为纯英文，界面不显示语言切换或中文；只有检测到中文系统时才默认中文并显示中文/English 切换。中文模式可混入简单英文，英文模式保持纯英文。气泡会自动换行和调整大小，并放在角色旁边。
- Windows 与 macOS 均包含 Coco 应用图标。
- Windows 滚轮缩放通过一次原子分层窗口更新提交新画面、位置和尺寸，不再先拉伸旧画面；滚轮本身不会反复改变气泡宽度。
- Web 版额外提供 32 动作点播、自动表演/待机/对白开关、场景背景、全屏、暂停、快捷键、设置记忆与按需离线缓存；手机端支持底部控制抽屉、触摸拖动、点击部位和双指缩放。

## 本地构建

Windows PowerShell：

```powershell
.\build.ps1 -Clean
.\smoke_test.ps1
```

输出：`dist\CocoDesktopPet.exe`。

macOS 11 或更高版本并安装 Xcode：

```bash
chmod +x build_macos.command
./build_macos.command
```

输出：`dist-macos/Coco Desktop Pet.app` 与 `dist-macos/CocoDesktopPet-macOS.zip`。macOS 在中文系统中会把应用显示名称本地化为“Coco桌宠”。

Web 本地预览：

```powershell
.\tools\prepare_web_preview.ps1
python -m http.server 8080
```

打开 `http://localhost:8080/web/`。GitHub Pages 由 `.github/workflows/pages.yml` 独立部署。

## 文档

- [动画 v2 设计](docs/ANIMATION_V2_PLAN.md)
- [架构](docs/ARCHITECTURE.md)
- [素材说明](docs/ASSETS.md)
- [构建与发布](docs/BUILD_AND_RELEASE.md)
- [测试](docs/TESTING.md)
- [故障排查](docs/TROUBLESHOOTING.md)
- [v1.7.0 开发总结](docs/V1.7.0_DEVELOPMENT_SUMMARY.md)
- [v1.8.0 开发总结](docs/V1.8.0_DEVELOPMENT_SUMMARY.md)
- [群聊发布说明](docs/GROUP_ANNOUNCEMENT.md)
- [变更记录](CHANGELOG.md)

## 许可证

项目代码使用 [Apache License 2.0](LICENSE)。角色图片及第三方素材仍应遵守各自的权利要求。
