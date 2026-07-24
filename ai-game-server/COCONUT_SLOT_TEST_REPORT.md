# Coconut `:4000` Slot 测试记录

测试范围：只从 `https://games-web.coconut.tv:4000/game-lobby-client/` 进入，只检查名称可明确
识别为 Slot 的游戏。所有账号、IG、SDK token 和 Lobby 会话路径均从输出中移除。本轮没有发送
任何 Spin/Play 请求。

## 结果

| Lobby ID | 游戏 | 入口/协议 | Init 结果 | Play 状态 |
| --- | --- | --- | --- | --- |
| 6001 | GameSlots | `games-api.coconut.tv:14000/game3/slot` REST | 已知 `initReq` 正常；本轮只回读余额 | 现有适配器可用 |
| 1009 | FreeSlot | 跳转到 `https://games-web.coconut.tv/game-free-slot-client/` | 入口脱离 `:4000`，停止 | 未测试 |
| 5119 | YummySlot | HotGame Pinus WebSocket；`game.YummySlot.enterGame` | 返回空对象后断线 | 未测试 |
| 5145 | OlympusSlot | HotGame Pinus WebSocket；`game.OlympusSlot.enterGame` | 返回空对象并重连 | 未测试 |
| 5152 | LavaSlot | HotGame Pinus WebSocket；`game.LavaSlot.enterGame` | 返回空对象后断线 | 未测试 |
| 5153 | FortuneSlot | HotGame Pinus WebSocket；`game.FortuneSlot.enterGame` | 返回空对象并重连 | 未测试 |

HotGame 公共 SDK 配置给出的公开游戏参数：

| 游戏 | SDK gameId | 下注档位 |
| --- | --- | --- |
| YummySlot | 119 | 100, 500, 2,000, 10,000, 50,000, 100,000 |
| OlympusSlot | 145 | 100, 1,000, 10,000, 100,000 |
| LavaSlot | 152 | 100, 1,000, 10,000, 100,000 |
| FortuneSlot | 153 | 100, 500, 2,000, 5,000, 10,000, 50,000, 100,000 |

## 环境问题

`:4000` Lobby 为四款 HotGame Slot 生成入口后，客户端的公共配置默认选择
`virginia.hotgame.win/api/cocolive`（`pro`），而不是同一配置内的
`hg.hotgame.win/api/cocolive_test`（`dev`）。

为避免在 `pro` 连接上执行游戏，本轮没有发送 Play。随后在本地无头浏览器中只覆盖 SDK
连接目标为配置自带的 `cocolive_test`，测试端持续拒绝 WebSocket 建连，未能发送 Pinus
握手或 `enterGame`。

本报告生成时只有 GameSlots 进入 Demo 的 Play 白名单；后续单独验证通过的 Bingo 记录见
[`COCONUT_BINGO_TEST_REPORT.md`](./COCONUT_BINGO_TEST_REPORT.md)。其余游戏继续完整展示，但必须保持
“仅展示”，不能因为名称包含 Slot 就复用 `/game3/slot/initReq` 和
`/game3/slot/playReq`。

## 接通 HotGame Slot 仍需要

1. 确认可供 `:4000` 使用的 HotGame 测试 WebSocket 地址；
2. 提供能在该地址使用的测试 SDK token/入口生成规则；
3. 提供或确认 `enterGame`、Spin/Play 路由及请求字段；
4. 提供成功、输局、赢局、断线和余额不足的响应示例；
5. 明确下注档位的单位、余额字段、派彩字段和前后余额公式。

拿到这些信息后，应为 HotGame 单独实现 Pinus 适配器，不能与 GameSlots REST 适配器混用。
