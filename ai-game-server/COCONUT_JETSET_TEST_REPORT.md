# Coconut JetSet 测试与接入记录

测试日期：2026-07-23

## 范围与环境

- 游戏 API 固定为 `https://games-api.coconut.tv:14000`。
- 请求 Origin 固定为 `https://games-web.coconut.tv:4000`。
- Lobby 游戏：`6014 JetSet`。
- 用户 UUID 来自 Coco 页面地址栏的 `userId`。
- 账号、IG 与响应 ID 均不写入本报告。
- 本次只执行了一局最低档 Play，没有自动重试。

## Init

```http
POST /game3/jetset/initReq
Origin: https://games-web.coconut.tv:4000
Content-Type: application/json
```

请求字段：

```text
uid, roomId, roomType, ig
```

测试结果：

- HTTP 与业务 `code` 均成功；
- 返回余额、上次下注、9 类符号赔付表和一套 5 列转轴配置；
- 下注档位为 `10 / 50 / 100 / 500 / 1000`。

## 唯一一局最低档 Play

请求：

```text
token = 10
uid / roomId / roomType / ig = 当前测试会话参数
```

响应检查：

- 返回 5 个停止位置；
- 返回 3×5 转轴表；
- 返回中奖线列表、响应 ID 与模式；
- 本局 `score = 15`；
- Play 返回余额与最终 Init 回读余额一致。

代码复算：

```text
总下注 = token = 10
总赢得 = score = 15
净结果 = 15 - 10 = +5
预期局后余额 = 局前余额 - 10 + 15
```

以上各项与 Play 返回和最终 Init 回读一致。

## 已落地的服务端约束

1. `6014` 使用独立 JetSet 适配器。
2. 下注意图必须命中当次 Init 返回的 `bets` 档位。
3. 返回模式必须为已验证模式 `1`。
4. 停止位置必须恰好为 5 个非负整数。
5. 转轴表必须为 3 行，每行恰好 5 个数字符号。
6. 中奖线字段必须符合 `index / line / id` 整数结构。
7. 校验 `局后余额 = 局前余额 - token + score`。
8. 多局请求逐局复算，最后再次 Init 回读余额。
9. Play 网络结果不确定时不自动重试。
10. 任一数字或结构校验失败时，不调用大模型生成总结。
11. `GAME_PLAYABLE_IDS` 与代码适配器白名单必须同时允许，才能执行 Play。

## Demo 固定游戏

| Lobby ID | 游戏 | 实际下注公式 | 状态 |
| --- | --- | --- | --- |
| 6001 | GameSlots | `token × 12` | 已验证 |
| 6007 | FruitSpin | `token × 1` | 已验证 |
| 6014 | JetSet | `token × 1` | 已验证 |
| 6036 | Bingo | `token × 4` | 已验证 |
| 6037 | Charmed | `token × 1` | 已验证；免费局连续执行待补充 |

本 Demo 不再扩展其他游戏。其余 Lobby 游戏继续显示为“仅展示”。
