# 测试与验收

## Windows 完整本地测试

```powershell
.\build.ps1 -Clean
.\smoke_test.ps1
.\tools\test_animation_continuity.ps1
python .\tools\test_frame_assets.py
.\tools\test_click_regions.ps1
```

`test_frame_assets.py` 只依赖 Pillow：

```powershell
python -m pip install Pillow
```

## 自动测试覆盖

| 测试 | 验证内容 |
| --- | --- |
| `smoke_test.ps1` | 启动、32 次连续交互、返回待机、滚轮、菜单和正常退出 |
| `test_animation_continuity.ps1` | 实际加载 32 条时间线；访问 256 张动作帧；32/32 动作使用相同首尾帧；方形画布不拉伸 |
| `test_frame_assets.py` | 512 × 512 RGBA、8 张待机、256 张动作帧、无重复帧、32 条时间线唯一、共同 `base.png` 契约 |
| `test_click_regions.ps1` | 头、左右脸、左右手、身体和脚部七个区域 |

GitHub Actions 还会在真实 macOS 运行器上编译 App，并检查通用二进制架构。

## 当前硬性验收值

一次合格构建应输出：

- `ActionsChecked = 32`
- `AuthoredActionFramesVisited = 256`
- `ActionsStartingOnSharedIdleFrame = 32`
- `ActionsEndingOnSharedIdleFrame = 32`
- `IdleStartsOnSharedFrame = True`
- `SquareCanvasNoStretch = True`
- `uniqueActionTimelines = 32`
- `sharedEndpoint = base.png`

## 视觉验收

- 默认角色身份与 `assets/coco.png` 一致。
- 待机时可见呼吸、手脚或表情变化，不是固定图。
- 点击不同部位能进入不同动作组。
- 动作中确实出现不同手脚、身体、表情和朝向画面。
- 大幅动作没有两套手脚透明重叠、绿色边缘或漂浮贴图。
- Coco 始终等比，不发生横向/纵向拉伸。
- 每个动作落到共同待机首帧后再开始待机循环。
- 中文、英文和混合模式符合语言规则；长对白完整换行且不遮挡角色。

## 生成诊断帧

```powershell
.\smoke_test.ps1 -DiagnosticFrame .\dist\diagnostic.png
```

建议至少分别抓取旋转、空翻、抬手和待机画面，在浅色、深色背景上检查透明轮廓。
诊断图位于已忽略的 `dist` 目录，不应提交。

## 修改帧素材后的顺序

1. 运行 `python tools/prepare_frame_animation.py`。
2. 查看 `assets/frame_animation/frame_animation_preview.png`。
3. 运行 `python tools/test_frame_assets.py`。
4. 重新构建 Windows EXE。
5. 运行连续性、点击区域和冒烟测试。
6. 在 Windows 实机观察完整动作；macOS 构建由 Actions 再验证一次。
