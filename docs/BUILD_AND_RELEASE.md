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

## Web / Static Pages

本地预览不复制动画资源，而是在 `web/assets` 创建指向仓库 `assets` 的临时目录联接：

```powershell
.\tools\prepare_web_preview.ps1
python -m http.server 8080
# 浏览 http://localhost:8080/web/
.\tools\prepare_web_preview.ps1 -Remove
```

不要直接双击 `web/index.html`，因为 `file://` 无法正常读取 JSON 或注册 Service Worker。`tools/assemble_web.py` 会把 `web/`、无损去重后的 222 张唯一帧和 PWA 图标组装成可部署目录；动画位于工件根目录的 `frames/`，脚本会强制校验 `frames/frame_neutral.png`。Cloudflare Pages Direct Upload 可直接上传该目录或根层级正确的 ZIP；部署后应先访问 `/frames/frame_neutral.png`，确认返回 200。GitHub Pages 则由 `.github/workflows/pages.yml` 调用同一脚本发布。

Cloudflare ZIP 必须使用专用脚本生成，不能使用 Windows PowerShell 的 `Compress-Archive`，后者会在 ZIP 内写入反斜杠路径，Cloudflare 解压后可能导致资源 404：

```powershell
py tools\package_cloudflare.py dist\CocoWebPet-Cloudflare-Pages.zip
```

PWA 安装要求 HTTPS（`localhost` 仅用于开发）、有效 manifest、Service Worker，以及 192×192 和 512×512 图标。Chromium 会在满足条件后启用网页内安装按钮；iPhone/iPad 不提供该事件，需要在 Safari 的分享菜单选择“添加到主屏幕”。

## AI 游戏服务器

本地 Windows 验证使用根目录 `run-ai-game-demo.cmd`；Linux 服务器在拉取分支后运行：

```bash
chmod +x deploy-linux.sh
sudo ./deploy-linux.sh
```

脚本会保留被 Git 忽略的 `ai-game-server/.env`，安装锁定依赖、运行 Mock 测试、构建服务器、安装系统服务并执行本机健康检查。需要 Nginx 时使用 `--domain coco.example.com` 或 `--nginx`。发行版支持、首次配置、HTTPS、日志、更新与回滚见 [`AI_GAME_SERVER_DEPLOYMENT.md`](AI_GAME_SERVER_DEPLOYMENT.md)。

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
