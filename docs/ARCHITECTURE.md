# 架构与动画状态机

## 运行结构

Windows 入口为 `Program.cs` 与 `DesktopPetForm.cs`，使用 WinForms 分层窗口。macOS 入口为 `macos/main.swift`，使用 AppKit 无边框透明窗口。两端共享 `assets/frame_animation_v2` 中的整帧动画语义。

窗口由角色画布和不透明对白气泡组成。角色画布固定为正方形，缩放只改变一个统一比例，避免横向或纵向拉伸。

## 动画时间线

状态只有两类：

- 待机：根据当前外观循环播放对应的 7 张完整帧。
- 互动：播放默认外观对应动作的 8 张完整帧，随后立刻回到当前外观待机的第 1 帧。

互动帧 1 与帧 8均为 `neutral_512.png` 的精确副本，所以默认互动的首尾没有插值、淡入或交叉叠加。换装待机也不参与互动动作合成。

## 渲染约束

- 不调用旧版肢体骨骼绘制路径。
- 不在运行时叠加围巾、披风、眼镜或帽子。
- 不把相邻图片做透明交叉混合。
- 不单独缩放身体、头或四肢。
- 每次只绘制一张完整 RGBA 帧。

Windows 将 `runtime_frames.zip` 嵌入单文件 EXE，启动后从内存读取。macOS 构建脚本把同一套完整帧复制到 App Resources。

## 输入与状态

- 左键按下后移动：拖动窗口。
- 左键点击：按命中区域选择动作，并显示对话气泡。
- 滚轮：等比调整宠物尺寸。
- 鼠标位置：驱动很小的整体注视偏移，不修改帧内肢体结构。
- 右键：大小、语言、换装、置顶和退出。

点击区域映射在 Windows 的 `ChooseInteraction` 与 macOS 的对应选择逻辑中维护。动作资源编号 01–32 与 `InteractionKind` 顺序一一对应。

## 旧资源

`assets/rig`、`assets/frame_animation` 等目录保留为历史研究资料。生产绘制路径只使用 `assets/frame_animation_v2/runtime_frames.zip` 中的完整帧。
