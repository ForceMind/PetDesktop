# Coconut Charmed 测试与接入记录

测试日期：2026-07-23

## 范围与环境

- 游戏 API 固定为 `https://games-api.coconut.tv:14000`。
- 请求 Origin 固定为 `https://games-web.coconut.tv:4000`。
- Lobby 游戏：`6037 Charmed`。
- 用户 UUID 来自 Coco 页面地址栏的 `userId`。
- 账号、IG 与响应 UUID 均不写入本报告。
- 本次只执行了一局最低档 Play，没有自动重试。

## Init

请求：

```http
POST /game3/charmed/init
Origin: https://games-web.coconut.tv:4000
Content-Type: application/json
```

请求字段：

```text
uid, roomId, roomType, ig
```

测试结果：

- HTTP 与业务 `code` 均成功；
- 返回余额 `token`；
- 返回下注档位 `10 / 50 / 100 / 500 / 1000`；
- 返回 `freeCount / totalFree / lastSelect / buyBetTimes / payoutConfig`；
- 测试前没有待处理免费局。

## 唯一一局最低档 Play

请求：

```text
token = 10
type = ""
auto = 0
uid / roomId / roomType / ig = 当前测试会话参数
```

响应检查：

- 返回一个 6×6 最终网格；
- 本局返回 1 个连消步骤；
- `step.win = 0`，`totalWin = 0`；
- `step.payOut = 0`，`totalPayOut = 0`；
- 免费次数仍为 0；
- Play 返回余额与最终 Init 回读余额一致。

代码复算：

```text
总下注 = token = 10
步骤赢得和 = 0
总赢得 = totalWin = 0
净结果 = 0 - 10 = -10
预期局后余额 = 局前余额 - 10 + 0
```

以上各项与 Play 返回和最终 Init 回读一致。

## 已落地的服务端约束

1. `6037` 使用独立 Charmed 适配器，不复用 GameSlots 或 Bingo 的请求与公式。
2. 下注意图必须命中当次 Init 返回的 `bets` 档位。
3. 每个 `step.grid` 必须为 6×6 整数网格。
4. 所有 `step.win` 之和必须等于 `totalWin`。
5. 所有 `step.payOut` 之和必须等于 `totalPayOut`。
6. 校验 `局后余额 = 局前余额 - token + totalWin`。
7. Play 后再次 Init，校验最终余额及 `freeCount / totalFree` 状态。
8. Play 网络结果不确定时不自动重试。
9. 发现已有待处理免费局时，在发送 Play 前停止，避免把免费局误算为付费局。
10. 免费局的连续执行协议尚未实测，因此当前每张确认卡只允许 1 局 Charmed。
11. 任一数字或结构校验失败时，不调用大模型生成总结。
12. `GAME_PLAYABLE_IDS` 与代码适配器白名单必须同时允许，才能执行 Play。

## 当前接入状态

| Lobby ID | 游戏 | Init | Play | 实际下注公式 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 6001 | GameSlots | `/game3/slot/initReq` | `/game3/slot/playReq` | `token × 12` | 已验证 |
| 6007 | FruitSpin | `/game3/fruit/init` | `/game3/fruit/play` | `token × 1` | 已验证；见 [独立报告](./COCONUT_FRUIT_TEST_REPORT.md) |
| 6014 | JetSet | `/game3/jetset/initReq` | `/game3/jetset/playReq` | `token × 1` | 已验证；见 [独立报告](./COCONUT_JETSET_TEST_REPORT.md) |
| 6036 | Bingo | `/game3/bingo/init` | `/game3/bingo/play` | `token × 4` | 已验证 |
| 6037 | Charmed | `/game3/charmed/init` | `/game3/charmed/play` | `token × 1` | 已验证；免费局连续执行待补充 |

其余 Lobby 游戏仍完整展示，但保持“仅展示”，直到逐个提供并验证各自的 Init/Play 协议。
