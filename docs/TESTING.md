# 测试与验收

## 完整本地测试

先构建 Windows 程序：

```powershell
.\build.ps1 -Clean
```

随后运行：

```powershell
.\smoke_test.ps1
.\tools\test_animation_continuity.ps1
python .\tools\test_original_rig.py
.\tools\test_click_regions.ps1
python .\tools\validate_macos_source.py
```

`test_original_rig.py` 依赖 Pillow：

```powershell
python -m pip install Pillow
```

## 测试覆盖

| 测试 | 验证内容 |
| --- | --- |
| `smoke_test.ps1` | 程序启动、32 次交互稳定性、返回待机、滚轮、右键菜单和正常退出 |
| `test_animation_continuity.ps1` | 32 种曲线采样、帧间连续性、结束归零、关节活动、原图比例锁定和鼠标方向 |
| `test_original_rig.py` | 五个角色层尺寸一致、可见像素来自母版、静止重组接近原图 |
| `test_click_regions.ps1` | 头、左右脸、左右手、身体、脚部共七个区域分类 |
| `validate_macos_source.py` | Swift 语法结构、32 个动作分支、对白纯度、资源清单和 Info.plist |

GitHub Actions 还会在真实 macOS 运行器上编译 App，并使用 `lipo -archs` 检查二进制架构。

## 关键验收标准

- 默认角色外观与 `assets/coco.png` 一致。
- 头部下方没有矩形裁片、重复身体或突出的贴图碎片。
- 手臂与脚部动作时关节仍与身体连接。
- 任何一帧都不出现横向或纵向单独拉伸。
- 连续播放时没有角色身份切换或整张图片闪换。
- 动作开始和结束没有明显跳帧，最终回到动态待机。
- 鼠标在右侧时 Coco 朝右，在左侧时朝左。
- 中文、英文和混合模式符合各自语言规则。
- 长对白完整换行，气泡不遮挡 Coco。
- 四套服装是附件，不改变角色脸和身体。

## 生成诊断帧

Windows 冒烟测试可以保存运行时 PNG：

```powershell
.\smoke_test.ps1 -DiagnosticFrame .\dist\diagnostic.png
```

诊断图用于人工检查透明轮廓、气泡排版、接缝和图标效果。`dist` 是本地输出目录，
诊断截图不应提交到 Git。

## 修改素材后的检查顺序

1. 运行 `python tools\prepare_rig_assets.py`。
2. 查看 `assets/rig/original_rig_preview.png`。
3. 运行 `python tools\test_original_rig.py`。
4. 重新构建 Windows EXE。
5. 运行连续性和冒烟测试。
6. 检查默认、四套换装和至少一个大幅动作的运行时截图。

自动测试不能完全代替视觉检查。透明关节边缘、发丝和绳结可能通过像素测试，
但在深色桌面背景上仍然显眼。
