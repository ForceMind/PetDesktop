# 素材说明

## 角色参考

`assets/coco.png` 是用户提供的最初 Coco 角色图，用于保持脸、麻布材质、纽扣眼睛、牙齿、蓝色羽毛冠和身体比例。它正在招手，因此不能直接充当自然站立待机帧。

## 生产资源

`assets/frame_animation_v2` 包含新版整帧资源：

- `neutral_512.png`：默认自然站立锚点。
- `idle/default`、`idle/red_scarf`、`idle/blue_cape`、`idle/round_glasses`、`idle/sailor_cap`：5 套完整待机序列，每套 7 帧。
- `actions/01_jump` 至 `actions/32_sleepy`：32 套默认外观互动序列，每套 8 帧。
- `manifest.json`：帧尺寸、数量、编号和端点约定。
- `runtime_frames.zip`：Windows 嵌入资源与发布构建输入。
- `continuity_baseline_preview.png`：连续性人工检查预览。
- `source`：创作阶段的原始生成表与透明处理结果。

所有生产帧均为 512×512 RGBA，透明背景、统一画布、统一脚底基线。互动动作的第 1/8 帧与默认站立逐像素一致；待机序列的第 1/7 帧也逐像素一致。

## 换装约定

红围巾、蓝披风、圆眼镜和海军帽不是附件 PNG。每种外观都是从生成阶段开始绘入 Coco 的完整待机动画，所以不会漂浮、错位或与手臂分层。

换装只影响待机。32 个互动动作始终播放默认 Coco，动作结束后再回到当前外观的待机首帧。

## 图标

Windows 使用 `assets/icon/CocoDesktopPet.ico`；macOS 使用 `assets/icon/CocoApp.icns`。图标与透明窗口动画资源相互独立。

## 重新整理帧

在项目根目录运行：

```powershell
py tools/prepare_frame_animation_v2.py
```

脚本会清理旧输出、统一画布与透明度、复制精确端点、生成清单、预览和运行时 ZIP。创作分镜见 `docs/ANIMATION_V2_PLAN.md`。
