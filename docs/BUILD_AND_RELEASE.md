# 构建与 GitHub 发布

## Windows

要求：Windows PowerShell 5.1 或更高版本，以及系统自带的 .NET Framework C# 编译器。

```powershell
.\build.ps1 -Clean
.\smoke_test.ps1
```

产物为 `dist\CocoDesktopPet.exe`。构建脚本会把 `assets/frame_animation_v2/runtime_frames.zip` 和图标嵌入单文件 EXE，无需安装器；仅用于创作参考的 `assets/coco.png` 不进入运行包。

## macOS

要求：macOS 11 或更高版本、Xcode Command Line Tools。

```bash
chmod +x build_macos.command
./build_macos.command
```

脚本生成 `dist-macos/Coco Desktop Pet.app` 与 `dist-macos/CocoDesktopPet-macOS.zip`，并尽可能合并 Apple Silicon 与 Intel 二进制。默认应用元数据为英文，`zh-Hans.lproj` 与 `zh-Hant.lproj` 仅在简体或繁体中文系统中提供中文显示名称。未配置开发者证书时使用临时本地签名。

## 发布前检查

```powershell
py tools\prepare_frame_animation_v2.py
.\build.ps1 -Clean
.\tools\test_animation_continuity.ps1
py tools\test_authored_frames.py
py tools\validate_macos_source.py
.\tools\test_click_regions.ps1
.\smoke_test.ps1 -Headless
```

还应人工检查 `assets/frame_animation_v2/continuity_baseline_preview.png`，确认自然站立、肢体连接、服装贴合和动作差异。

## GitHub Actions

`.github/workflows/build.yml` 在推送和标签发布时分别构建 Windows 与 macOS，并运行整帧资源、连续性、点击区域及源码检查。推送 `v*` 标签后，工作流会创建 GitHub Release 并上传两个平台的压缩包。

发布示例：

```powershell
git add --all
git commit -m "Deduplicate frames and restore authored motion paths"
git push origin main
git tag -a v1.7.0 -m "Coco Desktop Pet v1.7.0"
git push origin v1.7.0
```

不要在同一版本标签上覆盖产物；需要修复时创建新的补丁版本。
