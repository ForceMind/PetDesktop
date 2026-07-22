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

## Web / GitHub Pages

本地预览不复制动画资源，而是在 `web/assets` 创建指向仓库 `assets` 的临时目录联接：

```powershell
.\tools\prepare_web_preview.ps1
python -m http.server 8080
# 浏览 http://localhost:8080/web/
.\tools\prepare_web_preview.ps1 -Remove
```

不要直接双击 `web/index.html`，因为 `file://` 无法正常读取 JSON 或注册 Service Worker。`.github/workflows/pages.yml` 会校验 Web 版，调用 `tools/assemble_web.py` 把 `web/`、无损去重后的 222 张唯一帧和图标组装成临时工件，再由 GitHub Pages 发布。仓库需在 **Settings → Pages → Source** 选择一次 **GitHub Actions**。

## 发布前检查

```powershell
py tools\prepare_frame_animation_v2.py
.\build.ps1 -Clean
.\tools\test_animation_continuity.ps1
py tools\test_authored_frames.py
py tools\validate_macos_source.py
.\tools\test_click_regions.ps1
.\tools\test_system_language.ps1
.\tools\test_autonomous_idle.ps1
.\tools\test_interaction_queue.ps1
.\tools\test_windows_layered_resize.ps1
py tools\test_web.py
.\smoke_test.ps1 -Headless
```

还应人工检查 `assets/frame_animation_v2/continuity_baseline_preview.png`，确认自然站立、肢体连接、服装贴合和动作差异。

## GitHub Actions

`.github/workflows/build.yml` 在推送和标签发布时分别构建 Windows 与 macOS，并运行整帧资源、连续性、点击区域、动作队列、Windows 缩放及源码检查。推送 `v*` 标签后，工作流会创建 GitHub Release 并上传两个桌面平台产物。`.github/workflows/pages.yml` 独立部署 Web 版；它不把网页塞进桌面 Release 包。

发布示例：

```powershell
git add --all
git commit -m "Describe the release change"
git push origin main
git tag -a v1.8.0 -m "Coco Desktop Pet v1.8.0"
git push origin v1.8.0
```

不要在同一版本标签上覆盖产物；需要修复时创建新的补丁版本。
