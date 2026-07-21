# 素材与原图约束

## 唯一角色母版

`assets/coco.png` 是当前角色外观的唯一可信来源。以下内容属于项目硬性约束：

- 不重新生成、重新绘制或风格化角色本体。
- 不把头部从身体上切开。
- 不对单个角色部件做非等比缩放。
- 四肢活动层中的可见 RGB 像素必须与 `coco.png` 对应位置一致。
- 换装只能作为附加图层，不能替换 Coco 的脸、身体、手或脚。

`tools/test_original_rig.py` 会验证这些原图像素约束。

## 当前运行时素材

| 路径 | 用途 |
| --- | --- |
| `assets/coco.png` | 唯一原始角色图片 |
| `assets/rig/original_core.png` | 完整头部、面部和身体核心层 |
| `assets/rig/original_arm_left.png` | 原图左手臂活动层 |
| `assets/rig/original_arm_right.png` | 原图右手臂活动层 |
| `assets/rig/original_leg_left.png` | 原图左脚部活动层 |
| `assets/rig/original_leg_right.png` | 原图右脚部活动层 |
| `assets/rig/original_neutral.png` | 关节层静止重组结果 |
| `assets/rig/original_rig_preview.png` | 原图、静止、手臂和踏步对照预览 |
| `assets/rig/outfit_*.png` | 围巾、披风、眼镜和帽子附件 |
| `assets/rig/app_icon.png` | macOS ICNS 和跨平台图标源 |
| `assets/coco.ico` | Windows 多尺寸程序图标 |

五个 `original_*` 角色层使用同一个 `745 × 1205` 透明画布和同一裁切原点。
不要单独裁切、缩放或移动其中一张图片。

## 关节坐标

坐标相对于公共画布：

| 关节 | X | Y |
| --- | ---: | ---: |
| 左手臂 | 136 | 742 |
| 右手臂 | 484 | 748 |
| 左脚部 | 199 | 1044 |
| 右脚部 | 433 | 1044 |

这些坐标同时存在于资源生成脚本、Windows 渲染器和 macOS 渲染器中。
调整遮罩或公共裁切时，必须同步更新三个位置并重新运行测试。

## 重新生成关节层和图标

需要 Python 3 和 Pillow：

```powershell
python -m pip install Pillow
python .\tools\prepare_rig_assets.py
python .\tools\test_original_rig.py
```

生成脚本会：

1. 验证母版尺寸为 `1254 × 1254`。
2. 在原图坐标中建立手臂和脚部遮罩。
3. 清除穿过遮罩的细绳和头发碎片。
4. 生成同画布核心层与四肢层。
5. 重组静止姿势并检查与原图的差异比例。
6. 生成关节预览、Windows ICO 和 macOS 图标源。

生成后必须人工查看 `assets/rig/original_rig_preview.png`，重点检查肩部、脚部、
头发边缘和透明背景是否有残留线条。

## 换装素材

换装附件允许使用独立图片，但必须满足：

- 背景透明。
- 不永久覆盖或修改角色母版。
- 披风绘制在身体后方；围巾、眼镜和帽子绘制在核心层前方。
- Windows 与 macOS 使用相同的逻辑坐标和显示宽度。

`assets/rig/outfits_sheet*.png` 是附件的组合源图；运行时使用拆分后的 `outfit_*.png`。

## 历史研究素材

以下目录保留为早期美术与动作研究，不参与当前运行时构建：

- `assets/poses`
- `assets/idle`
- `assets/sprite_sheets`
- `assets/coco_chromakey.png`

不要在实时渲染器中重新加载这些图片，否则会重新引入帧间换图、角色身份变化和闪烁。
