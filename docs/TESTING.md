# 测试与验收

## Windows 完整本地测试

```powershell
.\build.ps1 -Clean
.\smoke_test.ps1
.\tools\test_animation_continuity.ps1
python .\tools\test_original_rig.py
python .\tools\validate_macos_source.py
.\tools\test_click_regions.ps1
```

图像测试依赖 Pillow 和 NumPy：

```powershell
python -m pip install Pillow numpy
```

## 自动测试覆盖

| 测试 | 验证内容 |
| --- | --- |
| `smoke_test.ps1` | 启动、32 次连续交互、返回待机、滚轮、菜单和正常退出 |
| `test_animation_continuity.ps1` | 32 条不同连续轨迹；至少 30 个关节动作；全部动作中立首尾；同一骨骼；换装资源绑定；原图比例 |
| `test_original_rig.py` | 五层均来自原图像素、四个关节衬层存在、中立合成差异、固定画布与透明边缘 |
| `validate_macos_source.py` | macOS 使用骨骼渲染、统一缩放、32 条曲线、纯英文语料和 App 配置 |
| `test_click_regions.ps1` | 头、左右脸、左右手、身体和脚部七个区域 |

GitHub Actions 还会在真实 macOS 运行器上编译 App，并检查通用二进制架构。

## 当前硬性验收值

一次合格构建应输出：

- `ActionsChecked = 32`
- `DistinctTrajectories = 32`
- `ActionsWithJointMotion >= 30`
- `SameRigAtEveryFrame = True`
- `NeutralStartAndEnd = True`
- `OutfitResourcesBoundToRig = True`
- `OriginalAspectRatio = True`

## 视觉验收

- 默认角色身份与 `assets/coco.png` 一致。
- 待机时可见呼吸、手脚或表情变化，不是固定图。
- 点击不同部位能进入不同动作组。
- 动作中确实出现不同手脚、身体轨迹和朝向，不是同一个动作改名字。
- 连续观察完整动作时轮廓不闪烁，肩部/腰部没有矩形或三角残片。
- 四套换装都贴在 Coco 对应位置，并随跳跃、旋转和摇摆移动。
- 白底放大观察抬手、跳舞和跺脚时，肩部/髋部没有白色月牙缝或外露圆形补丁。
- Coco 始终等比，不发生横向/纵向拉伸。
- 每个动作最后回到中立骨骼，再进入连续待机循环。
- 中文、英文和混合模式符合语言规则；长对白完整换行且不遮挡角色。

## 生成诊断帧

```powershell
.\smoke_test.ps1 -DiagnosticFrame .\dist\diagnostic.png
```

可设置 `COCO_PET_DIAGNOSTIC_OUTFIT` 和 `COCO_PET_DIAGNOSTIC_ACTION` 抓取指定服装和动作。
建议至少检查旋转、空翻、抬手、抬脚和四套换装，并在浅色、深色背景上观察透明轮廓。
诊断图位于已忽略的 `dist` 目录，不应提交。

## 修改骨骼素材后的顺序

1. 运行 `python tools/prepare_rig_assets.py`。
2. 查看 `assets/rig/original_rig_preview.png` 和动态预览。
3. 运行 `python tools/test_original_rig.py`。
4. 重新构建 Windows EXE。
5. 运行连续性、点击区域和冒烟测试。
6. 在 Windows 实机观察完整动作；macOS 构建由 Actions 再验证一次。
