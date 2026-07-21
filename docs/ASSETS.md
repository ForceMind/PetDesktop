# 素材与骨骼资源

## 角色母版

`assets/coco.png` 是 Coco 的唯一身份母版。麻布纹理、纽扣眼睛、蓝色羽冠、牙齿、腹部补丁、颜色和
比例都必须来自这张图，不能用每个动作单独重绘的图片替换。

## 生产资源

| 路径 | 用途 |
| --- | --- |
| `assets/rig/original_core.png` | 头部和身体核心，覆盖关节内侧接缝 |
| `assets/rig/original_arm_left.png` / `original_arm_right.png` | 两个可旋转手臂层 |
| `assets/rig/original_leg_left.png` / `original_leg_right.png` | 两个可旋转、抬起的脚部层 |
| `assets/rig/outfit_*.png` | 红围巾、蓝披风、圆眼镜和海军帽 |
| `assets/coco.ico` | Windows 程序图标 |
| `assets/rig/app_icon.png` | macOS 图标源 |

五个角色层都使用 `745 × 1205 RGBA` 同画布，关节坐标固定为：

| 关节 | 坐标 |
| --- | --- |
| 左肩 | `(136, 742)` |
| 右肩 | `(484, 748)` |
| 左腿 | `(199, 1044)` |
| 右腿 | `(433, 1044)` |

同画布设计保证任何时刻都只改变变换矩阵，不需要重新定位或缩放某个部件。身体核心最后覆盖手脚的
内侧重叠区，避免肩部和腰部出现透明缝隙。

## 重新生成骨骼层

需要 Python、Pillow 和 NumPy：

```powershell
python .\tools\prepare_rig_assets.py
python .\tools\test_original_rig.py
python .\tools\render_rig_motion_preview.py
```

依次检查 `assets/rig/original_rig_preview.png` 和 `dist/coherent-rig-preview.png`。不要仅看中立姿势；
必须检查手臂和脚部在允许的最大角度下是否仍由身体覆盖接缝。

## 验收规则

- 中立合成与原图的像素差异必须低于测试阈值。
- 每个骨骼层的画布、比例和坐标必须一致，不得单独拉伸。
- 肩部和腰部不得出现矩形残片、三角碎片或突然长出的身体纹理。
- 换装必须在骨骼绘制函数内合成，并随整体和头部变换移动。
- `frame_animation` 中的独立姿势图不得重新接入生产渲染器。

## 历史研究资源

`assets/frame_animation`、`assets/poses`、`assets/idle` 和 `assets/sprite_sheets` 保存早期实验及回归依据。
这些图片的角色轮廓、光照和注册点不完全一致，连续播放会闪烁，因此不参与发布包构建。
