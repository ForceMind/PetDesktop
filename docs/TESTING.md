# 测试与验收

## 自动测试

### 帧资源

```powershell
py tools\test_authored_frames.py
```

检查：

- 5 套待机 × 7 帧、32 个动作 × 8 帧。
- 每帧为 512×512 RGBA 且画布角落透明。
- 动作首尾与默认站立逐像素一致。
- 每套待机首尾逐像素一致。
- 32 个动作的中间关键帧不重复。
- 运行时 ZIP 包含 222 张互不重复的 PNG，并在内存中还原为 292 个逻辑帧引用。

### Windows 连续性与运行

```powershell
.\tools\test_animation_continuity.ps1
.\tools\test_click_regions.ps1
.\build.ps1 -Clean
.\smoke_test.ps1 -Headless
```

连续性测试还会确认生产代码未加载旧肢体/服装叠层，且角色画布只做等比缩放。点击测试覆盖头、左右脸、左右手、身体和脚部。

### macOS 静态检查

```powershell
py tools\validate_macos_source.py
```

此检查在 Windows 上验证 macOS 源码使用完整帧、方形画布、5 套待机和 32 套动作。真正的 Swift 编译与 App 打包由 GitHub 的 macOS Runner 完成。

## 人工验收

1. 启动时 Coco 双臂自然放下，不是招手姿势。
2. 静置观察至少 20 秒，确认呼吸、眨眼和小动作持续循环且无闪烁。
3. 连续点击不同部位，确认动作明显不同，手脚真的改变姿势。
4. 逐一观察 32 个动作，结尾必须自然回到站立，不跳帧或淡入重影。
5. 检查抬手、伸展、舞蹈等动作的肩膀，不能出现白缝、断层或额外肢体。
6. 切换四种服装后只观察待机，确认服装随每帧完整贴合；触发互动时应临时回到默认 Coco。
7. 滚轮缩放到最小和最大，确认角色只等比变化，不拉长或压扁。
8. 将鼠标移到角色四周，确认注视方向正确且变化平滑。
9. 中英文长对白均应完整显示，气泡不遮挡角色。
10. 非中文系统应为纯英文，右键菜单没有语言切换且没有任何可见中文。
11. 中文系统应默认中文并显示中文/English 切换；切到 English 后菜单和对白应为英文。

Windows 可运行 `tools/test_system_language.ps1`，它分别模拟 `en-US` 与 `zh-CN` UI Culture，并验证默认语言、语言菜单可见性和英文菜单中不存在中文字符。macOS 的对应源代码与本地化包约束由 `tools/validate_macos_source.py` 检查。
10. Windows 双击 EXE、macOS 双击 App 均可直接运行，应用图标正常。

## 诊断帧

Windows 支持通过环境变量输出指定动作的诊断帧。现有基准文件包括 `dist/diagnostic_idle.png`、`dist/diagnostic_jump_v2.png` 和 `dist/diagnostic_stretch_v2.png`；`dist` 不提交 Git。
