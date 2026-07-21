# 故障排查

## Windows 双击后没有出现

1. 确认下载的是 Release 中的 EXE，而不是源码文件。
2. 查看 Windows 安全中心是否隔离了未签名程序。
3. 在 PowerShell 中运行 EXE，观察是否有系统错误提示。
4. 若是本地构建，重新执行 `.\build.ps1 -Clean`。

## Windows 提示找不到编译器

`build.ps1` 需要 .NET Framework 4.x 自带的 `csc.exe`。检查以下目录是否存在：

```text
%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
```

这只影响从源码构建；Release 中的 EXE 可以直接运行。

## macOS 提示应用无法打开

当前 Release 使用本地临时签名，没有 Apple Developer ID 公证。请尝试：

1. 解压 ZIP，不要直接在压缩包预览中运行。
2. 在 Finder 中右键 `Coco桌宠.app`。
3. 选择“打开”，并在系统提示中再次确认。

如果系统报告文件损坏，请重新下载 Release，避免使用会破坏扩展属性的传输方式。

## macOS 构建提示找不到 Swift

安装 Xcode，然后执行：

```bash
xcode-select --install
xcrun --find swiftc
```

只有第二条命令能够返回编译器路径后，`build_macos.command` 才能继续。

## Coco 被拉伸

当前角色使用 `745 × 1205` 原图骨骼画布，并对 X/Y 应用同一个缩放值。若仍出现拉伸：

- 确认使用的是 `v1.4.0` 或更高版本。
- 不要混用旧版本 EXE 与新版本资源。
- 从源码构建时确认 `build.ps1` 嵌入的是 `assets/rig/original_*`。
- 运行 `tools/test_animation_continuity.ps1`，检查 `OriginalAspectRatio` 是否为 `True`。

## 四肢出现多余贴图或绿色碎线

1. 查看 `assets/rig/original_rig_preview.png` 和 `dist/coherent-rig-preview.png`。
2. 运行 `python tools/test_original_rig.py`。
3. 用 `tools/prepare_rig_assets.py` 重新生成手脚遮罩和关节覆盖区。
4. 检查关节角度限制；超过原图重叠区会暴露手臂或腰部的直切边缘。

深色背景最容易暴露透明边缘问题，建议视觉验收时同时使用浅色和深色桌面。

## 角色闪烁

- 确认生产渲染器使用 `DrawRigCharacter`，且没有重新调用 `DrawFrameTimeline`。
- 确认构建包不含 `frame_animation`；独立生成的姿势图轮廓不一致，硬切或淡化都会闪烁。
- 运行连续性测试，检查 `SameRigAtEveryFrame` 和 `NeutralStartAndEnd`。
- Windows 渲染计时器应保持约 30 FPS，且只在边界变化时调整窗口尺寸。
- 关闭可能持续捕获或重绘透明窗口的第三方桌面美化工具后再测试。
- 更新显卡驱动，并检查远程桌面环境是否禁用了分层窗口加速。

## 鼠标跟随方向反了

运行：

```powershell
.\tools\test_animation_continuity.ps1
```

把鼠标移到角色左右两边直接观察方向。Windows 与 macOS 的屏幕 Y 轴方向不同，
修改坐标换算时不要直接复制符号；跟随权重应在动作中平滑减弱并在动作末尾恢复。

## 换装漂浮或没有穿在角色上

- 附件必须在 `DrawRigCharacter` / `drawRigCharacter` 内绘制，不能使用窗口方形画布的固定百分比。
- 披风应先于手脚和身体绘制，围巾、眼镜、帽子应在身体之后绘制。
- 用诊断环境变量分别抓取 `RedScarf`、`BlueCape`、`RoundGlasses` 和 `SailorCap` 动作图。

## 对话显示不完整

- 确认气泡使用文本测量结果，而不是固定宽高。
- 检查新对白是否包含异常的不可见字符或手工换行。
- 英文模式的动作句和通用句必须为纯英文；可运行 macOS 静态检查验证英文数组。

## GitHub Release 缺少一个平台

打开 Actions 中对应标签的运行记录，确认 `Windows EXE` 和 `macOS App` 都成功。
`Publish tagged release` 依赖前两个任务；任一平台失败时不会发布完整双平台 Release。

修复后可以重新运行失败任务，或删除错误标签并在新的修复提交上创建下一个版本标签。
