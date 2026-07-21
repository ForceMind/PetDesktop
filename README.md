# Coco 桌宠（Windows / macOS）

Coco 是一个透明、无边框、可拖动的桌面宠物。32 种互动各自使用两张独立关键帧，完整动画按“待机 → A 帧 → B 帧 → A 帧 → 待机”播放，并叠加专属位移、旋转或弹性轨迹；每次互动结束后都会准确回到有呼吸和表情的动态待机状态。

## 功能

- Coco 会根据全局鼠标位置抬头、低头、左右注视或歪头，并定时眨眼。
- 待机时持续轻微呼吸，并随机播放挥手、踏脚、羽冠摆动和伸懒腰动画。
- 左键拖动 Coco；点击头部、左右脸、左右手、身体或脚部会从各自的动作组中触发不同效果。
- 鼠标滚轮连续调整大小；右键菜单也可选择预设大小。
- 透明无边框窗口，默认始终置顶，可在右键菜单中关闭置顶。
- 随机中文或英文对白；中文模式可偶尔混入简单 English，英文模式只显示纯英文。
- 对话白气泡根据文字自动调整宽高，长句完整换行，且位于角色旁边、不遮挡角色。
- Windows 版透明区域支持点击穿透。
- Windows 和 macOS 版都包含大小、对白语言、置顶开关和退出菜单。

## 32 种动作

跳跃、压扁回弹、左右抖动、连续弹跳、点头、摇摆、原地转身、反向旋转、向左跃、向右跃、踮脚、拉伸、缩小、左探头、右探头、八字移动、快速颤动、神气挺胸、鞠躬、惊喜探头、后空翻、前空翻、跳舞、太空步、心跳、眩晕、潜行、蓄力冲锋、漂浮、跺脚、大笑、困倦摇摆。

## Windows 版

直接双击：

```text
dist\Coco桌宠.exe
```

重新构建（Windows PowerShell）：

```powershell
.\build.ps1 -Clean
```

自动冒烟测试：

```powershell
.\smoke_test.ps1
```

Windows 构建使用系统自带的 .NET Framework 编译器，不需要 Visual Studio 或 .NET SDK。发布时只需分发单个 `Coco桌宠.exe`。

## macOS 版

macOS 版使用原生 AppKit。把整个 `CocoDesktopPet` 文件夹复制到 Mac 后，在终端运行：

```bash
cd /你的路径/CocoDesktopPet
chmod +x build_macos.command
./build_macos.command
```

Mac 需要先安装 Xcode。脚本会构建并临时签名以下文件：

```text
dist-macos/Coco桌宠.app
dist-macos/Coco桌宠-macOS.zip
```

之后可直接双击 `Coco桌宠.app`。因为它使用本地临时签名而非 Apple Developer ID，首次打开时若被 Gatekeeper 提示，请在 Finder 中右键 App 并选择“打开”。

## 素材结构

- `assets/coco.png`：透明待机图。
- `assets/sprite_sheets`：8 张 4×2 动作关键帧原始表（A、B 两组）。
- `assets/poses`：去除背景后的 64 张透明动作关键帧。
- `assets/idle`：8 张视线跟随帧和 8 张动态待机关键帧。
- `assets/coco.ico`：Windows 程序图标。
- `macos/main.swift`：原生 macOS 桌宠实现。
