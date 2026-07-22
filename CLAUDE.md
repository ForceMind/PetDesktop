# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概览

Coco 桌宠：Windows（C# WinForms）与 macOS（Swift AppKit）双平台透明桌面宠物。两端各自独立实现，共享 `assets/frame_animation_v2` 中的整帧动画资源与语义。仓库文档（docs/、README）均为中文。

## 构建与测试

Windows 构建不用 MSBuild/.csproj，而是由 `build.ps1` 直接调用系统自带的 .NET Framework 4 `csc.exe` 把 4 个 .cs 文件编译成单文件 EXE，并通过 `/resource:` 把 `assets/coco.png` 与 `assets/frame_animation_v2/runtime_frames.zip` 嵌入其中。新增源文件必须同时加入 `build.ps1` 的 `$sourceFiles` 列表。

```powershell
.\build.ps1 -Clean            # 产物：dist\Coco桌宠.exe（dist 不提交 Git）
.\smoke_test.ps1              # 启动 EXE 做冒烟验证
.\smoke_test.ps1 -Headless    # 无头模式（用 COCO_PET_DIAGNOSTIC_* 环境变量导出诊断帧后自动退出）
```

单项测试：

```powershell
py tools\test_authored_frames.py         # 帧资源完整性（5 待机×7 帧、32 动作×8 帧、512×512 RGBA、首尾帧逐像素一致、ZIP 恰含 292 张图）
.\tools\test_animation_continuity.ps1    # 确认生产代码未使用旧肢体/服装叠层，画布只做等比缩放
.\tools\test_click_regions.ps1           # 点击区域映射（头/左右脸/左右手/身体/脚）
py tools\validate_macos_source.py        # 在 Windows 上静态检查 macos/main.swift（真正的 Swift 编译只在 CI 的 macOS Runner 上进行）
```

重新生成帧资源（修改动画素材后必须运行，否则 build.ps1 会因缺少 runtime_frames.zip 报错）：

```powershell
py tools\prepare_frame_animation_v2.py
```

macOS 本地构建（需 macOS 11+ 与 Xcode）：`./build_macos.command`，产物在 `dist-macos/`。

发布：推送 `v*` 标签后 `.github/workflows/build.yml` 构建双平台并创建 GitHub Release。不要在已有版本标签上覆盖产物，修复要发新补丁版本。发布前完整检查清单见 `docs/BUILD_AND_RELEASE.md`。

## 架构

- **Windows 端**：`Program.cs`（单实例 Mutex + 入口）、`DesktopPetForm.cs`（约 3000 行，包含全部状态机、渲染、交互、菜单、对白）、`NativeMethods.cs`（分层窗口/DPI 的 Win32 P/Invoke）。运行时从嵌入的 ZIP 内存流读取动画帧。
- **macOS 端**：`macos/main.swift` 单文件实现，动画帧由构建脚本复制到 App Resources。改动交互逻辑时两端需保持一致：Windows 的 `ChooseInteraction` 与 macOS 的对应选择逻辑必须同步维护。
- **动作编号约定**：资源文件 `action_01`–`action_32` 与 `DesktopPetForm.cs` 中 `InteractionOrder`（`InteractionKind` 顺序）一一对应，改动任一侧都要保持对齐。

## 动画不变式（v1.5.0 核心设计，违反会引入历史 bug 回归）

- 每帧都是完整角色图（512×512 RGBA），运行时**每次只绘制一张整帧**，只做等比缩放。
- 禁止运行时拼接肢体骨骼、叠加服装配饰、对相邻帧做透明交叉混合、单独缩放身体部位。`DesktopPetForm.cs` 中的 rig 相关代码（`DrawRigCharacter` 等）是历史遗留路径，生产渲染不走它；`assets/rig`、`assets/frame_animation`（无 v2）同为历史资料，勿用于新功能。
- 每个动作的第 1、8 帧与默认待机第 1 帧（`neutral_512.png`）逐像素一致，保证动作结束无缝回到待机——这是 `test_authored_frames.py` 强制校验的。
- 换装只影响待机循环；互动动作始终使用默认外观。
- 运行时不做任何逐帧位移补偿，角色稳定性完全依赖帧内位置一致。`prepare_frame_animation_v2.py` 切帧时会先清除越过 sheet 网格线渗入相邻格子的碎块（`remove_grid_bleed`），再做脚部锚点对齐（水平全部对齐 neutral；垂直仅待机钉底边，动作保留跳跃弧线）。修改帧素材后必须重跑该脚本，不要手工往 `idle/`、`actions/` 放帧文件绕过这条管线。

## 调试

无头诊断：设置环境变量 `COCO_PET_DIAGNOSTIC_FRAME`（输出 PNG 路径）、`COCO_PET_DIAGNOSTIC_ACTION`、`COCO_PET_DIAGNOSTIC_OUTFIT`、`COCO_PET_DIAGNOSTIC_EXIT=1` 后启动 EXE，可在无 GUI 交互的情况下导出指定动作/服装的渲染帧（`smoke_test.ps1 -Headless` 即基于此）。
