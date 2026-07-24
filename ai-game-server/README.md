# Coco AI 游戏 Demo

这个目录只包含 AI 游戏后台。前台继续使用仓库已有的 `web/` PWA 和
`assets/frame_animation_v2` 完整角色帧，不复制 Coco 素材，也不建立第二套前端。

## 一键本地测试

在仓库根目录双击：

```text
run-ai-game-demo.cmd
```

脚本会自动：

1. 从 `.env.example` 创建本地 `.env`（不会提交到 Git）；
2. 安装依赖、运行测试、构建服务器；
3. 启动静态 PWA、素材路由和 API；
4. 直接打开 `http://localhost:8787/`；游戏账号和各游戏 IG 默认由服务器配置提供，
   不会出现在分享给体验者的地址中。

没有配置任何密钥时，AI 和游戏接口都使用可重复测试的 Mock；因此第一次运行即可走通
“聊天 → 确认卡 → 8 步校验 → 游戏结果 → Coco 动画反馈”的完整流程。
本地一键脚本默认监听 `127.0.0.1:8787`。Linux 的 `deploy-linux.sh` 会改为监听
`0.0.0.0`，检查端口占用并从 8787 开始自动选择空闲端口，便于通过
`http://服务器IP:实际端口/` 访问；默认不会修改服务器已有的 Nginx。

## 设置

启动后打开：

```text
http://localhost:8787/settings
```

设置页可以配置 AI 服务、游戏适配器、Lobby/Init/Play 地址、各游戏独立 IG、默认游戏账号、
地址栏参数白名单、游戏白名单和执行限额。保存后会：

1. 严格校验字段和游戏 JSON；
2. 更新 `ai-game-server/.env`；
3. 立即重建 Agent 和游戏适配器；
4. 失效旧的内存会话，防止继续使用旧权限。

AI Key、游戏 API Key 和账号 Token 只允许写入，后台 API 永不返回原值。默认只有
`127.0.0.1`/`::1` 可以在无 Token 时修改设置。部署或局域网使用时必须在 `.env` 设置：

```dotenv
ADMIN_TOKEN=use-a-long-random-value
```

设置后，本机访问也需要在管理页输入 Token；Token 只保存在当前浏览器标签页的
`sessionStorage`，不会进入地址栏。

### 浏览器活动、运行日志与一键关闭

设置页“配置”页签中的“浏览器活动与日志”会显示最近打开过 Coco 的匿名浏览器、浏览器/平台、
脱敏 IP、打开次数、最后活动页面，以及新对话、聊天、游戏、配置变更和总开关拦截等结果。
浏览器由 HttpOnly 匿名 Cookie 区分，不显示完整标识。该运行日志明确不保存：

- 聊天原文或模型回答；
- 地址栏 `userId`、`ig` 等参数值；
- AI Key、游戏 Key、账号 Token 或服务端 IG。

运行日志保存在被 Git 忽略的 `ai-game-server/.data/operations.jsonl`，文件达到约 5 MB
时轮换为一个备份文件。设置 API 最多返回最近 100 个浏览器和 200 条事件。

独立的“测试数据”页签用于查看实际测试对话。它按匿名浏览器分组，显示每次新对话中的用户消息、
Coco 回复、游戏列表、确认卡、结果总额和逐局下注/赢得。默认记录 7 天，支持：

- 关闭或重新开启新消息记录；
- 把保存期限设置为 1–90 天；
- 删除单次对话、某个匿名浏览器的全部对话，或清空全部测试数据。

测试对话存放在被 Git 忽略且权限受限的 `ai-game-server/.data/conversations.json`。消息写入前
会再次遮盖当前服务器已知的账号、IG、Key、Token，以及形如 `userId=...` 的参数。不会保存
系统提示词、内部工具上下文或地址栏启动参数。前台聊天区会显示保存期限提示。该功能只记录服务器
更新后产生的新对话，无法恢复此前未保存的历史。

配置项为：

```dotenv
CHAT_HISTORY_ENABLED=true
CHAT_HISTORY_RETENTION_DAYS=7
```

“聊天与游戏总开关”是一键服务器开关。关闭后，新的 `/api/slot` 聊天、AI 和游戏请求会在
进入 Agent、模型或游戏适配器之前返回 `CHAT_DISABLED`；健康检查和受 Token 保护的设置页
仍然可用，因此可以随时重新开启。状态写入私有 `.env`：

```dotenv
CHAT_ENABLED=true
```

切换会清空内存会话与未执行的确认卡。切换前已经开始的游戏请求不会被强行中断，它会完成数字
核验并返回结果，避免真实扣款后丢失结果；开关生效后的新请求全部被阻止。

## 地址栏账号参数

体验者可以直接打开：

```text
http://localhost:8787/
```

服务器会使用设置中的 `GAME_TEST_ACCOUNT_ID` 和各游戏 IG。若要临时指定另一个账号，只需：

```text
http://localhost:8787/?userId=YOUR_USER_ID
```

地址栏不需要 `ig`；Lobby 与各游戏 IG 均取服务器设置。默认允许 `userId`、`ig`、`roomId`、
`roomType`、`screen`、`openId`、`type`，服务端会忽略其他参数，
不会把参数值写入响应或日志，只保存在当前内存会话中。允许列表和账号字段可配置：

```dotenv
GAME_LAUNCH_PARAM_KEYS=userId,ig,roomId,roomType,screen,openId,type
GAME_ACCOUNT_PARAM=userId
```

## 聊天与自然语言游戏

Coco 的背景、外形、喜好、梦想和情绪陪伴由服务端世界观路由约束，避免兼容模型把背景问题
误分类成游戏请求。股票、编程、医疗、法律等无关专业任务会被拉回 Coco 的陪伴与游戏范围；
提示注入、索取密钥和绕过确认会被策略网关直接阻断。

可以直接输入：

```text
Coco，你来自哪里？有什么梦想？
玩 JetSet 1 局，下注 10
帮我玩 100 局 JetSet
改成 50
同时玩 FruitSpin 和 JetSet，各 1 局，下注 10
```

待确认卡支持通过自然语言修改游戏、局数和下注，也可以在一句话中同时修改，例如
“换成 Bingo，玩 5 局，下注 50”。每次修改都会重新读取目标游戏的当前配置、生成新卡并使
旧卡失效；原下注档位不适用于新游戏时，自动使用新游戏当前有效的默认档位。一次选择多个游戏时
会生成多张独立确认卡；
服务端逐张授权和执行，不会并发扣款，也不会因为聊天内容自动调用 Play。若请求超过单次上限，
Coco 会直接按允许的最大局数和该游戏的默认有效下注生成确认卡，例如 100 局 JetSet 会变成
20 局、下注档位 10，仍需用户确认。执行较多局数时，每完成 5 局会返回一次由代码累计并核验的
阶段结果，全部结束后再由 AI 生成最终总结。

生成确认卡时，Bingo、Charmed、FruitSpin 与 JetSet 会先读取该游戏当次 Init 返回的
`bets`，再把当前有效档位写入确认卡。前端会直接显示全部档位；当实际下注与档位不同（例如
Bingo 固定 4 张卡）时，同时显示“档位 → 每局实际下注”。用户点击其他档位会使旧卡失效并
生成新卡。用户询问“可以调整为哪些下注金额”时由服务端根据待确认卡回答，不请求 AI，
避免模型猜测或编造档位。执行前仍会再次 Init，防止档位在确认期间发生变化。

## DeepSeek / OpenAI 兼容模型

编辑 `ai-game-server/.env`：

```dotenv
AI_API_KEY=your-key
AI_API_STYLE=chat-completions
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-v4-flash
AI_CHAT_COMPLETIONS_PATH=/chat/completions
AI_JSON_MODE=true
```

其他 OpenAI Chat Completions 兼容服务只需替换 `AI_BASE_URL`、`AI_MODEL` 和
`AI_API_KEY`。如果网关不支持 `response_format: {"type":"json_object"}`，服务端会在
400/422 时自动降级重试，但仍使用 Zod 校验模型返回的 JSON。

若使用 OpenAI Responses API 兼容服务，则配置：

```dotenv
AI_API_STYLE=responses
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=your-model
AI_RESPONSES_PATH=/responses
```

## 游戏测试接口

### Coconut 测试服适配器

后台选择 `Coconut Lobby + Slot`，或在本地 `.env` 配置：

```dotenv
DEMO_MODE=true
GAME_PROVIDER=coconut
GAME_API_BASE_URL=https://games-api.coconut.tv:14000
GAME_INIT_PATH=/game3/slot/initReq
GAME_PLAY_PATH=/game3/slot/playReq
GAME_LOBBY_BASE_URL=https://games-api.coconut.tv
GAME_LOBBY_LOGIN_PATH=/game/lobby/login
GAME_LOBBY_IG=your-lobby-ig
GAME_SLOT_IG=your-slot-ig
GAME_BINGO_IG=your-bingo-ig
GAME_BINGO_INIT_PATH=/game3/bingo/init
GAME_BINGO_PLAY_PATH=/game3/bingo/play
GAME_CHARMED_IG=your-charmed-ig
GAME_CHARMED_INIT_PATH=/game3/charmed/init
GAME_CHARMED_PLAY_PATH=/game3/charmed/play
GAME_FRUIT_IG=your-fruit-ig
GAME_FRUIT_INIT_PATH=/game3/fruit/init
GAME_FRUIT_PLAY_PATH=/game3/fruit/play
GAME_JETSET_IG=your-jetset-ig
GAME_JETSET_INIT_PATH=/game3/jetset/initReq
GAME_JETSET_PLAY_PATH=/game3/jetset/playReq
GAME_PLAYABLE_IDS=6001,6007,6014,6036,6037
GAME_ORIGIN=https://games-web.coconut.tv:4000
GAME_WAGER_MULTIPLIER=12
GAME_CURRENCY=TOKEN
```

`GAME_LOBBY_IG` 用于“登录 Lobby → WebSocket InitReq → protobuf InitRet → 游戏和图标”；
`GAME_SLOT_IG` 只用于 GameSlots Init/Play，`GAME_BINGO_IG` 只用于 Bingo Init/Play，
`GAME_CHARMED_IG` 只用于 Charmed Init/Play，`GAME_FRUIT_IG` 只用于 FruitSpin Init/Play。
`GAME_JETSET_IG` 只用于 JetSet Init/Play。
若新游戏与 GameSlots 使用相同 IG，
对应游戏的 IG 可留空并回退到 `GAME_SLOT_IG`。
地址栏传入 Lobby IG 时，
服务端会要求它与后台允许值完全一致。

在线模式优先使用 Coco 页面地址栏中的 `userId`；未提供时使用设置中的
`GAME_TEST_ACCOUNT_ID`。因此可以把无参数地址直接发给体验者；所有使用无参数地址的人会共享
这个默认 Demo 游戏账号。

当前已验证五套彼此隔离的 REST 协议。测试服的 `token` 是下注档位，不一定等于总下注：

```text
GameSlots:
  单局实际下注 = 12 × token
  预期新余额 = 旧余额 - 单局实际下注 + score

Bingo（固定 4 张卡）:
  单局实际下注 = token × 4
  总派彩 = 4 张卡的 win 之和
  预期新余额 = 旧余额 - 单局实际下注 + totalWin

Charmed:
  单局实际下注 = token
  总赢得 = 所有连消 step.win 之和
  总派彩值 = 所有连消 step.payOut 之和
  预期新余额 = 旧余额 - token + totalWin

FruitSpin（type=1）:
  单局实际下注 = token
  预期新余额 = 旧余额 - token + win
  Play 返回奖池 = 最终 Init 回读奖池

JetSet:
  单局实际下注 = token
  预期新余额 = 旧余额 - token + score
```

GameSlots 的下注档位是 `1–10`；Bingo 的当前档位为
`10 / 50 / 100 / 200 / 500 / 1000`；Charmed 的当前档位为
`10 / 50 / 100 / 500 / 1000`；FruitSpin 的当前档位为
`10 / 30 / 50 / 90 / 120 / 200 / 500 / 1000 / 2000 / 4000 / 5000`。
JetSet 的当前档位为 `10 / 50 / 100 / 500 / 1000`。
动态档位均以当次 Init 返回为准。每个 Play 结果必须同时通过：返回字段格式、
对应协议的计算公式、最终 Init 余额回读三项核验。
任何一项失败都不会调用大模型总结。Play 网络结果不确定时，确认卡会被标记为不可重试，
避免重复扣款。

Lobby 返回的旧版字段 4 是带账号参数的游戏 URL。适配器只为兼容 protobuf 线协议而解码，
随后立即丢弃；浏览器只收到游戏 ID、名称、图标和公开分类字段。当前 Play 接口同时要求
游戏位于 `GAME_PLAYABLE_IDS` 且存在代码中已验证的独立适配器。目前只有
本 Demo 固定支持 `6001 GameSlots`、`6007 FruitSpin`、`6014 JetSet`、`6036 Bingo`
与 `6037 Charmed`；其他 Lobby 游戏可以展示，
但不能越权执行。实测记录见 [Bingo](./COCONUT_BINGO_TEST_REPORT.md)、
[Charmed](./COCONUT_CHARMED_TEST_REPORT.md)、[FruitSpin](./COCONUT_FRUIT_TEST_REPORT.md)
与 [JetSet](./COCONUT_JETSET_TEST_REPORT.md) 报告。

### 通用 JSON 适配器

原通用 list/play 适配器仍可使用：

```dotenv
GAME_PROVIDER=generic
GAME_API_BASE_URL=https://your-game-test-host
GAME_LIST_PATH=/games
GAME_PLAY_PATH=/play
GAME_TEST_ACCOUNT_TOKEN=
GAME_CURRENCY=DEMO
```

后台账号 token 只从服务端发送，不会暴露给浏览器。在线页面的账号 ID 始终取自地址栏；
地址栏允许参数会同时交给游戏适配层。

游戏列表也可以完全由服务端白名单控制：

```dotenv
GAME_CATALOG_JSON=[{"id":"coco-fortune","name":"Coco Fortune","provider":"Coco Lab","enabled":true,"minBet":1,"maxBet":10,"theme":"fortune"}]
```

## 多流程校验

用户消息先经过服务端策略网关：

1. Unicode 规范化与控制字符清洗；
2. 提示注入、索取密钥和绕过确认检测；
3. 明确越界任务硬路由；
4. 主模型只获得游戏列表、最近对话和当前任务需要的信息；
5. 回复后检查内部字段/密钥泄漏和未执行却声称执行。

确认后再按顺序执行工具工作流：

1. 会话、确认卡有效期与服务端幂等；
2. 游戏 ID 白名单与启用状态；
3. 局数、游戏当前可用下注档位、50,000 TOKEN 总注上限和频率限制；
4. 校验地址栏中的用户 UUID；
5. 调用 Play（不自动重试结果未知的请求）；
6. 代码复算每局、总注、总赢得、净值和余额，并回读最终余额；
7. AI 只基于已核验 JSON 总结；
8. 检查总结中的关键数字和额外数字，失败则使用确定性总结。

浏览器通过 NDJSON 接收每一步状态，但聊天界面不展示内部工作流或实现术语。AI 无权绕过确认、
限制或直接调用游戏接口。
