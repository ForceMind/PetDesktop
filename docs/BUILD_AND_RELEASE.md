# 构建与 GitHub 发布

## Windows

### 环境

- Windows 10 或更高版本。
- 系统 .NET Framework 4.x C# 编译器。
- PowerShell 5.1 或更高版本。

### 构建

```powershell
.\build.ps1 -Clean
```

脚本会验证并嵌入五个原图骨骼层、四个服装附件、原图和图标。历史独立动作帧不会进入 EXE。

```text
dist\Coco桌宠.exe
```

发布 Windows 版时只需要分发这一个 EXE。

## macOS

### 环境

- macOS 11 或更高版本。
- Xcode，以及可通过 `xcrun --find swiftc` 找到的 Swift 编译器。

### 构建

```bash
chmod +x build_macos.command
./build_macos.command
```

输出：

```text
dist-macos/Coco桌宠.app
dist-macos/Coco桌宠-macOS.zip
```

脚本执行以下操作：

1. 创建标准 App Bundle。
2. 复制原图骨骼层和换装资源。
3. 从 `app_icon.png` 生成 `CocoApp.icns`。
4. 分别尝试编译 `arm64` 和 `x86_64`。
5. 在两个架构都成功时使用 `lipo` 生成通用二进制。
6. 使用本地临时签名，并生成 ZIP。

临时签名不等同于 Apple Developer ID 公证。公开分发时，用户首次运行可能需要在 Finder 中右键“打开”。

## GitHub Actions

工作流文件：`.github/workflows/build.yml`。

| 任务 | 主要工作 |
| --- | --- |
| Windows EXE | 构建单文件 EXE，验证 32 条连续轨迹、中立首尾、骨骼换装绑定和点击区域 |
| macOS App | 构建 App Bundle，检查通用二进制架构，上传 ZIP |
| Publish tagged release | 下载两个平台产物并附加到标签 Release |

以下事件会触发工作流：

- 推送到 `main` 或 `master`。
- 创建匹配 `v*` 的标签。
- Pull Request。
- 手动运行 workflow。

## 发布新版本

先确保工作区干净并完成本地测试：

```powershell
git status --short
.\build.ps1 -Clean
.\smoke_test.ps1
.\tools\test_animation_continuity.ps1
python .\tools\test_original_rig.py
python .\tools\validate_macos_source.py
.\tools\test_click_regions.ps1
```

更新 `CHANGELOG.md` 和 README 中的当前版本后提交：

```powershell
git add --all
git commit -m "Prepare vX.Y.Z release"
git push origin main
git tag -a vX.Y.Z -m "Coco Desktop Pet vX.Y.Z"
git push origin vX.Y.Z
```

标签工作流成功后检查：

1. Windows 与 macOS 任务都为绿色。
2. Release 不是 Draft 或 Prerelease。
3. Release 同时包含 EXE 和 macOS ZIP。
4. 下载后的 Windows 程序能启动、交互并正常退出。
5. macOS ZIP 能解压为完整 App Bundle。

GitHub 可能会在下载 URL 中简化非 ASCII 文件名，但 Release 页面显示的资产仍是对应平台安装包。

## 不应提交的文件

本地构建目录由 `.gitignore` 排除：

- `dist/`
- `dist-macos/`
- `.macos-build/`

不要提交临时诊断截图、编译中间文件或本机签名材料。
