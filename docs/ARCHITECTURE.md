# 架构与动画状态机

## 运行结构

Windows 入口为 `Program.cs` 与 `DesktopPetForm.cs`，使用 WinForms 分层窗口。macOS 入口为 `macos/main.swift`，使用 AppKit 无边框透明窗口。Web 入口为 `web/index.html` 与 `web/app.js`，使用 Canvas、Pointer Events 和静态 PWA。三端共享 `assets/frame_animation_v2` 中的整帧动画语义。

窗口由角色画布和不透明对白气泡组成。角色画布固定为正方形，缩放只改变一个统一比例，避免横向或纵向拉伸。

## 动画时间线

状态只有两类：

- 待机：保持当前外观的第 1 张自然站立帧；到达随机时间点后，完整播放一次对应的 7 帧待机序列。
- 互动：播放默认外观对应动作的 8 张完整帧，随后回到当前外观待机的第 1 帧。快速点击只允许预排一个动作；当前动作播完后保持约 100ms 站立交接帧，再启动队列动作。

互动帧 1 与帧 8均为 `neutral_512.png` 的精确副本，所以默认互动的首尾没有插值、淡入或交叉叠加。换装待机也不参与互动动作合成。

## 帧位置契约

`tools/prepare_frame_animation_v2.py` 在切割生成表后，会把每个中间帧按脚部锚点水平对齐到 `neutral_512.png`，待机帧同时对齐底边，以删除生成误差造成的随机晃动。需要整体位移的动作由 Windows/macOS 共享语义的显式平滑轨迹移动整张画布；轨迹首尾严格归零，不改变动作端点。绕过该脚本直接修改帧文件会重新引入晃动。对齐细节见 `docs/ASSETS.md`。

## 渲染约束

- 不调用旧版肢体骨骼绘制路径。
- 不在运行时叠加围巾、披风、眼镜或帽子。
- 不把相邻图片做透明交叉混合。
- 不单独缩放身体、头或四肢。
- 每次只绘制一张完整 RGBA 帧。

Windows 将 `runtime_frames.zip` 嵌入单文件 EXE，启动后从内存读取。macOS 构建脚本把同一套完整帧复制到 App Resources。Web 的 Pages 工件把同一归档解压为 222 张唯一 PNG，通过运行时路径映射还原 292 个逻辑帧，并按动作惰性加载；Service Worker 只缓存实际访问过的图片。三个版本都不降低分辨率或 PNG 质量。

Windows 的分层窗口渲染将目标坐标、目标尺寸和新位图一次性交给 `UpdateLayeredWindow`。不能在该调用前执行 `SetBounds`，否则 Windows 会短暂把旧的透明表面拉伸到新尺寸，造成滚轮缩放闪烁。

## 输入与状态

- 左键按下后移动：拖动窗口。
- 左键点击：按命中区域选择动作，并显示对话气泡；播放中点击进入单槽队列，不覆盖当前状态。
- 滚轮：等比调整宠物尺寸。
- 鼠标位置：驱动很小的整体注视偏移，不修改帧内肢体结构。
- 右键：大小、换装、置顶和退出；只有系统 UI 语言为中文时才加入中文/English 子菜单。

## 系统语言策略

- Windows 使用 `CultureInfo.CurrentUICulture`，macOS 使用 `Locale.preferredLanguages.first` 判断系统 UI 语言。
- `zh`、`zh-Hans`、`zh-Hant` 及其地区变体默认进入中文模式，并允许用户在中文与 English 之间切换。
- 其他系统语言固定进入纯英文模式：不创建可见的语言菜单，窗口标题、菜单、提示、错误和对白都不显示中文。
- 中文模式可以混合少量简单英文；English 模式的运行时对白保持纯英文。

## 自主待机时间线

- 待机默认保持各服装序列的第 1 张自然站立帧，不连续循环全部待机帧。
- 每隔约 3–8 秒播放一次 0.95 秒的完整待机序列，然后准确回到第 1 张站立帧。
- 约 18–36 秒没有直接操作时，从点头、伸展、探头、鞠躬、跳舞等较自然的动作中随机表演一次；对白以 50% 概率出现。
- 鼠标按下、拖动、滚轮和右键菜单都会推迟下一次自动表演；拖动过程中禁止触发。

点击区域映射在 Windows 的 `ChooseInteraction` 与 macOS 的对应选择逻辑中维护。动作资源编号 01–32 与 `InteractionKind` 顺序一一对应。

## Web 状态与部署

- `web/data.json` 是动作名称、时长、对白、点击区域和自动动作集合的声明式数据源。
- `web/app.js` 维护 `active → neutral handoff → queued/idle` 状态机；动作帧按需加载，待机只预载当前服装的 7 帧。
- 拖动、缩放、语言、服装、背景和行为开关保存在 `localStorage`；PWA 缓存与用户设置互不混用。
- `tools/assemble_web.py` 与 `.github/workflows/pages.yml` 将网页外壳和 222 张唯一帧组装到临时 Pages 工件，不在 Git 中提交第二份动画文件，也不上传 70MB 的重复逻辑帧。

## 旧资源

`assets/rig`、`assets/frame_animation` 等目录保留为历史研究资料。生产绘制路径只使用 `assets/frame_animation_v2/runtime_frames.zip` 中的完整帧。
