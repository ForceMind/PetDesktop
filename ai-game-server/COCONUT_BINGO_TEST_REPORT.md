# Coconut Bingo 测试与接入记录

测试日期：2026-07-23

## 范围与环境

- Lobby 来源固定为 `https://games-web.coconut.tv:4000/game-lobby-client/`。
- 游戏 API 固定为 `https://games-api.coconut.tv:14000`。
- Lobby 游戏：`6036 Bingo`。
- 用户 UUID 来自 Coco 页面地址栏的 `userId`。
- 账号、IG、Lobby 会话地址与响应 UUID 均不写入本报告。
- 本次只执行了一局最低档 Play，没有自动重试。

从 `:4000` Lobby 进入旧 Bingo 客户端时，客户端默认请求的是不带 `:14000` 的 API，
其余额与下注档位属于另一套环境。本次只把它用于只读协议发现；实际 Init 与 Play
严格使用用户提供的 `:14000` 测试接口。

## Init

实际请求：

```http
POST /game3/bingo/init
Origin: https://games-web.coconut.tv:4000
Content-Type: application/json
```

请求字段：

```text
uid, roomId, roomType, ig
```

说明：用户提供的 `OPTIONS` 是浏览器 CORS 预检，不是游戏初始化本身。

测试结果：

- HTTP 与业务 `code` 均成功；
- 返回字段为 `token` 与 `bets`；
- 下注档位为 `10 / 50 / 100 / 200 / 500 / 1000`。

## 唯一一局最低档 Play

请求：

```text
token = 10
type = ""
auto = 0
card = 4
uid / roomId / roomType / ig = 当前测试会话参数
```

响应检查：

- 返回 4 张卡，每张卡 15 个数字；
- 返回 32 个不重复的开奖号码；
- 四张卡派彩分别为 `10 / 10 / 0 / 20`；
- `totalWin = 40`；
- Play 返回余额与最终 Init 回读余额一致。

代码复算：

```text
总下注 = token × card = 10 × 4 = 40
逐卡派彩和 = 10 + 10 + 0 + 20 = 40
净结果 = 40 - 40 = 0
预期局后余额 = 局前余额 - 40 + 40 = 局前余额
```

以上四项与接口返回及最终 Init 回读一致。

## 已落地的服务端约束

1. `6036` 使用独立 Bingo 适配器，不复用 `6001 GameSlots` 的请求体或余额公式。
2. 每局固定请求 4 张卡，实际总下注按 `token × 4` 进入确认卡和限额校验。
3. 下注意图必须命中 Init 实时返回的 `bets` 档位。
4. 校验 4 张卡、每卡 15 个不重复且位于 `1–75` 的数字。
5. 校验开奖号码不重复且位于 `1–75`。
6. 校验逐卡 `win` 之和等于 `totalWin`。
7. 校验 `局后余额 = 局前余额 - 总下注 + totalWin`。
8. Play 后再次 Init，校验最终余额回读。
9. 任一字段或数字校验失败时不调用大模型总结；Play 结果不确定时不自动重试。
10. `GAME_PLAYABLE_IDS` 与代码适配器白名单必须同时允许，才能执行 Play。
11. 生成确认卡前读取当次 Init 的 `bets`，把全部有效档位及“档位 → 每局实际下注”映射交给前端。
12. “可以调整下注金额为哪些”由服务端使用待确认卡中的 Init 档位直接回答，不交给 AI 猜测。
13. 用户选择新档位后重新读取 Init、生成新确认卡并使旧卡失效；不会因为切换档位执行 Play。

## 当前接入状态

| Lobby ID | 游戏 | Init | Play | 实际下注公式 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 6001 | GameSlots | `/game3/slot/initReq` | `/game3/slot/playReq` | `token × 12` | 已验证 |
| 6007 | FruitSpin | `/game3/fruit/init` | `/game3/fruit/play` | `token × 1` | 已验证；见 [独立报告](./COCONUT_FRUIT_TEST_REPORT.md) |
| 6014 | JetSet | `/game3/jetset/initReq` | `/game3/jetset/playReq` | `token × 1` | 已验证；见 [独立报告](./COCONUT_JETSET_TEST_REPORT.md) |
| 6036 | Bingo | `/game3/bingo/init` | `/game3/bingo/play` | `token × 4` | 已验证 |
| 6037 | Charmed | `/game3/charmed/init` | `/game3/charmed/play` | `token × 1` | 已验证；见 [独立报告](./COCONUT_CHARMED_TEST_REPORT.md) |

其余 Lobby 游戏仍完整展示，但保持“仅展示”，直到逐个提供并验证各自的 Init/Play 协议。
