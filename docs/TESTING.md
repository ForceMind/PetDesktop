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
.\tools\test_system_language.ps1
.\tools\test_autonomous_idle.ps1
.\tools\test_interaction_queue.ps1
.\tools\test_windows_layered_resize.ps1
.\build.ps1 -Clean
.\smoke_test.ps1 -Headless
```

连续性测试还会确认生产代码未加载旧肢体/服装叠层，且角色画布只做等比缩放。点击测试覆盖头、左右脸、左右手、身体和脚部。动作队列测试确认 Windows/macOS 的点击不会覆盖当前动作，并保留站立交接延迟与双语提示。Windows 缩放测试确认渲染前没有 `SetBounds`，目标位置和尺寸由同一次分层窗口更新提交。

### macOS 静态检查

```powershell
py tools\validate_macos_source.py
```

此检查在 Windows 上验证 macOS 源码使用完整帧、方形画布、5 套待机和 32 套动作。真正的 Swift 编译与 App 打包由 GitHub 的 macOS Runner 完成。

### Web

```powershell
py tools\test_web.py
node --check web\app.js
.\tools\prepare_web_preview.ps1
python -m http.server 8080
```

自动检查覆盖 32 个动作、5 套换装、所有帧路径、英文对白纯英文、动作队列、Canvas 整帧绘制、设置存储、移动端双指状态和 PWA 注册。浏览器人工检查应覆盖拖动、七区域点击、滚轮缩放、控制台、390px 移动端窄屏、触摸拖动与双指缩放、横竖屏、安全区、离线后再次打开，以及子路径下的相对 URL。

### AI 游戏 Demo

```powershell
npm --prefix ai-game-server ci
npm --prefix ai-game-server test
npm --prefix ai-game-server run build
node --check web\ai-slot.js
node --check web\admin.js
node --check ai-game-server\scripts\test-bubble-layout.mjs
node --check ai-game-server\scripts\verify-coco-chat.mjs
```

测试覆盖输入策略、聊天边界、五个游戏适配器、动态 Init 下注档位、确认卡修改、局数与总额限制、工具授权、批量进度、Play 数字复算、输出清理、地址栏 `userId` 覆盖和敏感设置脱敏。管理测试还会验证匿名浏览器记录、IP 脱敏、聊天原文与地址栏参数不进入日志，以及总开关关闭后新请求在 Agent 前返回 `CHAT_DISABLED`、重新开启后恢复。浏览器 Mock 验收还应确认首次不自动弹出聊天、聊天与设置不叠加、角色旁气泡不被聊天框遮挡、左下角不显示动作/帧调试信息，以及进度从 0/N 更新到 N/N。

真实测试服脚本会产生实际游戏请求，只有在明确配置测试账号、对应 IG 并确认允许消耗 TOKEN 时才运行；普通发布检查使用 Mock 测试，不调用真实 Play。

## 人工验收

1. 启动时 Coco 双臂自然放下，不是招手姿势。
2. 静置观察至少 45 秒，确认角色大部分时间自然站立、约每 3–8 秒播放一次待机小动作，并会偶尔自动表演且无闪烁。
3. 连续点击不同部位，确认动作明显不同，手脚真的改变姿势；快速点击不能切掉当前动作，只能预排一个动作，并显示队列对白。
4. 逐一观察 32 个动作，结尾必须自然回到站立，不跳帧或淡入重影。
5. 检查抬手、伸展、舞蹈等动作的肩膀，不能出现白缝、断层或额外肢体。
6. 切换四种服装后只观察待机，确认服装随每帧完整贴合；触发互动时应临时回到默认 Coco。
7. 滚轮缩放到最小和最大，确认角色只等比变化，不拉长或压扁；Windows 连续滚动时不能抖动、闪白或短暂拉伸旧帧。
8. 将鼠标移到角色四周，确认注视方向正确且变化平滑。
9. 中英文长对白均应完整显示，气泡不遮挡角色。
10. 非中文系统应为纯英文，右键菜单没有语言切换且没有任何可见中文。
11. 中文系统应默认中文并显示中文/English 切换；切到 English 后菜单和对白应为英文。
12. Windows 双击 EXE、macOS 双击 App 均可直接运行，应用图标正常。
13. Web 版可以从 Pages 打开，32 动作点播、控制开关、换装、背景、暂停、全屏、快捷键和刷新后的设置恢复均正常。

Windows 可运行 `tools/test_system_language.ps1`，它分别模拟 `en-US` 与 `zh-CN` UI Culture，并验证默认语言、语言菜单可见性和英文菜单中不存在中文字符。macOS 的对应源代码与本地化包约束由 `tools/validate_macos_source.py` 检查。

`tools/test_autonomous_idle.ps1` 验证安静待机保持站立首帧、待机小动作会播放中间帧、超时后会自动表演，以及鼠标拖动时不会触发自动动作。

## 诊断帧

Windows 支持通过环境变量输出指定动作的诊断帧。现有基准文件包括 `dist/diagnostic_idle.png`、`dist/diagnostic_jump_v2.png` 和 `dist/diagnostic_stretch_v2.png`；`dist` 不提交 Git。
