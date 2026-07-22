# 故障排查

## Windows 滚轮缩放抖动或闪烁

v1.8.0 起，Windows 必须直接调用 `ApplyLayeredBitmap(frame, frameX, frameY)`，由 `UpdateLayeredWindow` 同时提交像素、位置与尺寸。若在 `RenderFrame` 中重新加入 `SetBounds`，旧透明位图会先被窗口系统拉伸，问题会复现。运行 `tools/test_windows_layered_resize.ps1` 检查这一约束。滚轮分支也不应每格创建新气泡；菜单缩放提示不受影响。

## 快速点击会切断当前动作

点击入口必须进入 `RequestInteraction`（macOS/Web 为对应队列入口），而不是直接调用播放函数。队列容量固定为 1：当前动作完成后显示约 100ms 站立帧再继续。运行 `tools/test_interaction_queue.ps1` 检查 Windows/macOS 约束，`tools/test_web.py` 检查 Web 状态机。

## GitHub Pages 没有发布或显示 404

先到仓库 **Settings → Pages**，把 Source 设为 **GitHub Actions**，再手动运行 `Deploy Coco Web Pet` 工作流。站点必须使用相对路径，项目地址是 `https://forcemind.github.io/PetDesktop/`，不能把资源写成站点根路径 `/assets/...`。Pages 工件由工作流临时组装，不应把 `web/assets` 提交到 Git。

## Web 本地打开后没有角色

不要使用 `file://`。从仓库根目录运行 `tools/prepare_web_preview.ps1` 与 `python -m http.server 8080`，再访问 `http://localhost:8080/web/`。预览结束可运行脚本的 `-Remove` 参数，仅删除临时目录联接。

## 角色闪烁或出现重影

确认运行的是 v1.7.0 或更新版本，并重新执行 `build.ps1 -Clean`。新版一次只绘制一张完整帧，不应出现交叉淡入。若仍闪烁，运行 `py tools/test_authored_frames.py` 检查帧数量和精确端点。

## 手臂、腿或肩膀分层

生产路径不再拼接肢体。如果看到断层，通常是运行了旧 EXE，或构建时仍使用旧资源。删除 `dist` 后重新构建，并检查 `DesktopPetForm.cs` 的实时绘制路径只调用 `DrawFrameTimeline`。

## 角色被拉伸

角色画布必须保持正方形，绘制时宽高使用同一个缩放值。运行 `tools/test_animation_continuity.ps1`；其中的 `SquareCanvas` 应为 `True`。

## 动作结束时跳一下

互动第 1 和第 8 帧必须与 `neutral_512.png` 完全一致。不要重新生成或压缩动作端点；重新运行 `tools/prepare_frame_animation_v2.py` 让脚本复制精确端点，然后运行帧测试。

## 换装漂浮或没有贴在角色上

不要增加运行时附件图层。每种服装必须从创作阶段生成整套完整待机帧，并放入相应的 `idle/<outfit>` 序列。换装不会改变互动动作，这是设计约束。

## 换装后互动时服装消失

这是 v1.5.0 的预期行为：服装只影响待机，互动使用默认 Coco；动作完成后会回到所选服装的待机。

## 对话显示不完整

气泡会按测量后的文字宽度自动换行和调整高度。若系统缩放导致裁剪，请记录 Windows/macOS 版本、显示缩放比例、语言模式和完整对白，再提交 Issue。

## macOS 无法打开

发布包使用临时本地签名。首次运行可在 Finder 中右键 `Coco Desktop Pet.app` 并选择“打开”。若提示文件损坏，请确认 ZIP 已完整下载，并从 GitHub Release 重新获取。

## 为什么没有语言切换

这是预期行为：语言切换只对系统 UI 语言为中文的用户显示。其他系统固定使用纯英文，不显示中文或语言菜单。修改系统首选语言后需要完全退出并重新启动 Coco，程序才会重新检测。

## 为什么 Coco 有时站着不动

这是 v1.7.0 的预期待机节奏。Coco 会保持自然站立，约每 3–8 秒播放一次短待机动画；首次自动表演通常在启动后约 12–28 秒出现，此后约每 18–36 秒出现一次。鼠标操作会重新延后计时。如果始终没有自动动作，请运行 `tools/test_autonomous_idle.ps1`。

## GitHub 构建失败

先在本地运行文档中的全部测试，再在 Actions 日志中区分：资源验证失败、Windows 编译失败、Swift 编译失败或 Release 上传失败。不要复用已有标签；修复后发布新补丁版本。
