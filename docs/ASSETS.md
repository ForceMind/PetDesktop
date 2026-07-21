# 素材与逐帧资源

## 角色参考

`assets/coco.png` 是 Coco 的初始角色参考图。所有新帧必须保留其麻布质感、纽扣眼睛、蓝色羽冠、
牙齿、腹部补丁、颜色与整体比例。逐帧姿势允许手脚、身体、表情和朝向真正变化。

## 生产资源

| 路径 | 数量 | 用途 |
| --- | ---: | --- |
| `assets/frame_animation/base.png` | 1 | 待机首帧，以及所有动作共同的第一/最后帧 |
| `assets/frame_animation/idle/idle_*.png` | 8 | 呼吸、眨眼、手脚和表情变化的动态待机 |
| `assets/frame_animation/actions/action_NN_FF.png` | 256 | 32 个动作，每个动作 8 张按时间排序的画面 |
| `assets/frame_animation/manifest.json` | 1 | 画布、播放规则、动作名称和资源清单 |
| `assets/frame_animation/frame_animation_preview.png` | 1 | 待机与 32 个动作的视觉总览 |
| `assets/rig/outfit_*.png` | 4 | 围巾、披风、眼镜和帽子附件 |
| `assets/coco.ico` | 1 | Windows 程序图标 |
| `assets/rig/app_icon.png` | 1 | macOS 图标源 |

所有生产角色帧必须为 `512 × 512 RGBA`。角色在透明方形画布中移动、旋转或跳起，运行时只等比缩放
整个画布，因此不同姿势不会改变窗口中的宽高比例。

## 源表

`assets/frame_animation/source` 保存可复现素材：

- `idle_v2_green.png`：4 × 2 待机源表。
- `actions_XX_YY_4f_green.png`：每组四个动作、每个动作四张主关键帧。
- `inbetweens_XX_YY_green.png`：对应四个动作的四张中间帧。

动作最终交错为：

```text
中间帧1, 主帧1, 中间帧2, 主帧2, 中间帧3, 主帧3, 中间帧4, 主帧4
```

这些源表使用纯绿色背景，不能被应用直接加载。

## 重新生成透明帧

需要 Python、Pillow、NumPy、SciPy，以及 imagegen 技能附带的抠图脚本：

```powershell
python .\tools\prepare_frame_animation.py
python .\tools\test_frame_assets.py
```

处理脚本会切分单元格、柔化绿幕边缘、去除绿色溢色、只保留与角色相连的最大主体、统一为
512 × 512，并重新生成 `manifest.json` 和预览图。抖动线、星星等未连接小元素会被清除，
以免透明桌面窗口出现漂浮碎片。

## 素材验收

- 每个动作必须有 8 个互不重复的文件哈希。
- 32 条完整动作时间线必须互不重复。
- 共同首尾帧必须是同一个 `base.png` 路径，而不是外观相近的再生成图片。
- 每张图只能有一个完整 Coco，不得出现多余手脚、裁断身体或绿色边缘。
- 必须查看 `frame_animation_preview.png`，并至少实机检查正反旋转、前后翻和大幅抬手动作。

## 历史素材

`assets/poses`、`assets/idle`、`assets/sprite_sheets` 和 `assets/rig/original_*` 是早期整帧或关节方案的
研究资料，不参与当前角色本体渲染。不要把它们重新接入运行时。
