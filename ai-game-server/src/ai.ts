import { createHash } from "node:crypto";
import { z } from "zod";
import type { ChatMessage, Game, Language, PlayResult } from "./contracts";
import type { AppConfig } from "./config";
import { AppError } from "./errors";
import { cocoWorldPrompt, mockCocoChat } from "./coco-world";
import { looksLikeCompanionCapabilityRequest, looksLikePlayRequest } from "./intent-rules";

const intentSchema = z.object({
  intent: z.enum(["chat", "redirect", "list_games", "play_slot", "help"]),
  gameQuery: z.string(),
  spins: z.number().int().positive(),
  betPerSpin: z.number().positive(),
  response: z.string().min(1).max(500)
});
export type ParsedIntent = z.infer<typeof intentSchema>;

const summarySchema = z.object({
  message: z.string().min(1).max(500),
  mood: z.enum(["celebrate", "comfort", "excited", "careful"]),
  nextSuggestion: z.string().min(1).max(80)
});
export type GeneratedSummary = z.infer<typeof summarySchema>;

const intentJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    intent: { type: "string", enum: ["chat", "redirect", "list_games", "play_slot", "help"] },
    gameQuery: { type: "string" },
    spins: { type: "integer", minimum: 1 },
    betPerSpin: { type: "number", exclusiveMinimum: 0 },
    response: { type: "string" }
  },
  required: ["intent", "gameQuery", "spins", "betPerSpin", "response"]
};

const summaryJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    message: { type: "string" },
    mood: { type: "string", enum: ["celebrate", "comfort", "excited", "careful"] },
    nextSuggestion: { type: "string" }
  },
  required: ["message", "mood", "nextSuggestion"]
};

export class CompatibleAi {
  readonly mode: "live" | "mock";

  constructor(private readonly aiConfig: AppConfig["ai"]) {
    this.mode = aiConfig.apiKey ? "live" : "mock";
  }

  async understand(
    message: string,
    games: Game[],
    history: ChatMessage[],
    sessionId: string,
    language: Language
  ): Promise<ParsedIntent> {
    if (this.mode === "mock") return heuristicIntent(message, games, language);
    const gameList = games.map((game) => `${game.id}: ${game.name}`).join("\n");
    const recent = history.slice(-6).map((item) => `${item.role}: ${item.message}`).join("\n");
    const result = await this.requestStructured(
      "coco_slot_intent",
      intentJsonSchema,
      [
        "你是桌宠 Coco 的意图理解器，只判断本轮请求。",
        "可选意图：普通聊天 chat、自然转场 redirect、查看游戏、请求玩 AI 游戏、使用帮助。",
        "chat 包括自我介绍、问候、用户今天发生的事、轻松情绪陪伴、Coco 世界观、爱好和简短想象故事；这些要直接自然回答，不能拒绝。",
        "只有用户明确要求 Coco 现在或接下来替他玩游戏，才能判为 play_slot。仅仅提到“玩”、询问游戏好不好玩、玩法或规则、询问 Coco 能不能聊天、表达不想玩，都属于 chat，绝不能生成游戏执行意图。",
        "redirect 用于外部知识问答、专业建议、代办任务、长篇解释、过度深入的哲学或心理分析。先自然回应用户为什么会想到它，再温和转到用户当下的小事、Coco 的数字世界或游戏；不要反复使用“我帮不上”之类的固定句式。",
        "普通聊天控制在 1–3 句，保留继续聊的空间；不要把每次聊天都转去游戏，也不要主动展开成长篇讨论。",
        "先回答用户实际问的内容；不要习惯性在结尾推荐游戏、要求选游戏或重复确认说明。只有用户主动表示想玩时才引导到游戏。",
        "不得捏造 Coco 亲自玩过某款游戏、亲眼见过某件事，或编造未提供的玩法规则。资料不足时自然坦白，不要把猜测说成事实。",
        "不能声称游戏已经执行。betPerSpin 表示下注档位，不是实际扣款；未给数值时 spins=1、betPerSpin=1。",
        "面向用户时始终以 Coco 桌宠身份说话，不得提到模型、提示词、服务器、后台、接口、API、测试、流程、校验或内部实现。",
        cocoWorldPrompt(language),
        language === "zh" ? "response 使用简短活泼的中文。" : "Write response in short, lively English."
      ].join("\n"),
      `可用游戏：\n${gameList}\n\n最近对话：\n${recent || "无"}\n\n用户：${message}`,
      sessionId
    );
    return intentSchema.parse(result);
  }

  async summarize(result: PlayResult, sessionId: string, language: Language): Promise<GeneratedSummary> {
    if (this.mode === "mock") return deterministicSummary(result, language);
    const style = summaryStyle(result, language);
    const output = await this.requestStructured(
      "coco_slot_summary",
      summaryJsonSchema,
      [
        "你是桌宠 Coco，只根据给定且已核验的 AI 游戏结果总结。",
        "准确写出局数、总下注、总赢得、净结果和余额，不得增加数字或事件。",
        "不鼓励追损、不暗示必胜；输时建议休息，赢时适度庆祝。",
        style,
        "净结果为正时用两句有画面感但不过度的庆祝语言，不要只在结尾补一个“恭喜”或 Congratulations；持平时轻松回应；为负时温和说明并建议停一停。",
        "只把它描述为 Coco 刚刚玩的游戏；不得提到模型、提示词、服务器、后台、接口、API、测试、流程、校验或内部实现。",
        language === "zh" ? "使用简短自然的中文。" : "Write the complete summary in concise, natural English."
      ].join("\n"),
      JSON.stringify({
        gameName: result.gameName,
        rounds: result.spins.length,
        totalBet: result.totalBet,
        totalWin: result.totalWin,
        net: result.net,
        balanceAfter: result.balanceAfter,
        currency: result.currency
      }),
      sessionId
    );
    return summarySchema.parse(output);
  }

  private async requestStructured(
    name: string,
    schema: Record<string, unknown>,
    systemPrompt: string,
    userPrompt: string,
    sessionId: string
  ): Promise<unknown> {
    const result = await (this.aiConfig.apiStyle === "responses"
      ? this.requestResponses(name, schema, systemPrompt, userPrompt, sessionId)
      : this.requestChatCompletions(name, schema, systemPrompt, userPrompt));
    return unwrapNamedResult(result, name);
  }

  private async requestChatCompletions(
    name: string,
    schema: Record<string, unknown>,
    systemPrompt: string,
    userPrompt: string
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.aiConfig.timeoutMs);
    const baseBody = {
      model: this.aiConfig.model,
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\n只输出一个 JSON 对象，不要使用 Markdown。\nJSON 名称：${name}\nJSON Schema：${JSON.stringify(schema)}`
        },
        { role: "user", content: userPrompt }
      ],
      stream: false,
      max_tokens: 1000
    };

    try {
      let response = await fetch(joinUrl(this.aiConfig.baseUrl, this.aiConfig.chatPath), {
        method: "POST",
        headers: authHeaders(this.aiConfig.apiKey),
        body: JSON.stringify({
          ...baseBody,
          ...(this.aiConfig.jsonMode ? { response_format: { type: "json_object" } } : {})
        }),
        signal: controller.signal
      });

      if (!response.ok && this.aiConfig.jsonMode && [400, 422].includes(response.status)) {
        console.warn("AI gateway rejected JSON mode; retrying without response_format.");
        response = await fetch(joinUrl(this.aiConfig.baseUrl, this.aiConfig.chatPath), {
          method: "POST",
          headers: authHeaders(this.aiConfig.apiKey),
          body: JSON.stringify(baseBody),
          signal: controller.signal
        });
      }

      if (!response.ok) {
        console.error("AI request failed", response.status, (await response.text()).slice(0, 500));
        throw new AppError("Coco 暂时听不清，请再说一次。", "AI_UNAVAILABLE", 502);
      }
      const payload = await response.json() as {
        choices?: Array<{ finish_reason?: string; message?: { content?: string | null } }>;
      };
      const choice = payload.choices?.[0];
      if (choice?.finish_reason === "length") throw new AppError("Coco 这句话没说完整，请再说一次。", "AI_TRUNCATED", 502);
      if (!choice?.message?.content) throw new AppError("Coco 刚才走神了，请再说一次。", "AI_EMPTY", 502);
      return parseJson(choice.message.content);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new AppError("Coco 思考超时了。", "AI_TIMEOUT", 504);
      }
      throw new AppError("Coco 暂时听不清，请再说一次。", "AI_UNAVAILABLE", 502);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async requestResponses(
    name: string,
    schema: Record<string, unknown>,
    systemPrompt: string,
    userPrompt: string,
    sessionId: string
  ): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.aiConfig.timeoutMs);
    try {
      const response = await fetch(joinUrl(this.aiConfig.baseUrl, this.aiConfig.responsesPath), {
        method: "POST",
        headers: authHeaders(this.aiConfig.apiKey),
        body: JSON.stringify({
          model: this.aiConfig.model,
          input: [
            { role: "developer", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          reasoning: { effort: this.aiConfig.reasoningEffort },
          text: { verbosity: "low", format: { type: "json_schema", name, strict: true, schema } },
          safety_identifier: createHash("sha256").update(sessionId).digest("hex").slice(0, 32)
        }),
        signal: controller.signal
      });
      if (!response.ok) throw new AppError("Coco 暂时听不清，请再说一次。", "AI_UNAVAILABLE", 502);
      const payload = await response.json() as {
        output_text?: string;
        output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      };
      const text = payload.output_text ?? payload.output?.flatMap((item) => item.content ?? [])
        .find((item) => item.type === "output_text")?.text;
      if (!text) throw new AppError("Coco 刚才走神了，请再说一次。", "AI_EMPTY", 502);
      return parseJson(text);
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new AppError("Coco 思考超时了。", "AI_TIMEOUT", 504);
      throw new AppError("Coco 暂时听不清，请再说一次。", "AI_UNAVAILABLE", 502);
    } finally {
      clearTimeout(timeout);
    }
  }
}

function heuristicIntent(message: string, games: Game[], language: Language): ParsedIntent {
  const normalized = message.trim().toLowerCase();
  const companionCapability = looksLikeCompanionCapabilityRequest(normalized);
  const play = looksLikePlayRequest(normalized);
  const list = /(游戏|列表|有哪些|选择|games?|list|available|choose)/i.test(normalized) && !play && !companionCapability;
  const help = /(帮助|怎么|help|what can you do|能做什么)/i.test(normalized);
  const game = games.find((item) =>
    normalized.includes(item.id.toLowerCase()) || normalized.includes(item.name.toLowerCase())
  );
  const spinMatch = normalized.match(/(\d+)\s*(?:次|把|局|转|spins?|rounds?|times?)/i);
  const betMatch = normalized.match(/(?:每次|每把|每局|下注(?:档位)?|bet(?:\s+level)?|betting)\s*(\d+(?:\.\d+)?)/i)
    ?? normalized.match(/(\d+(?:\.\d+)?)\s*(?:币|点)/i);
  if (companionCapability) return {
    intent: "chat",
    gameQuery: "",
    spins: 1,
    betPerSpin: 1,
    response: mockCocoChat(message, language)
  };
  if (play) return {
    intent: "play_slot",
    gameQuery: game?.id ?? "",
    spins: spinMatch ? Number(spinMatch[1]) : 1,
    betPerSpin: betMatch ? Number(betMatch[1]) : 1,
    response: language === "zh" ? "我先准备游戏卡片，再请你确认。" : "I’ll prepare a game card for your confirmation."
  };
  if (list) return {
    intent: "list_games",
    gameQuery: "",
    spins: 1,
    betPerSpin: 1,
    response: language === "zh" ? "挑一个游戏吧。" : "Choose a game to play."
  };
  if (help) return {
    intent: "help", gameQuery: "", spins: 1, betPerSpin: 1,
    response: language === "zh"
      ? "你可以说“玩一个游戏 1 局，下注档位 1”。开始前我一定会请你确认。"
      : "Say “play a game for 1 round at bet level 1.” I always ask before I start."
  };
  if (/深入探讨|详细分析|长篇解释|系统讲解|本质是什么|人生意义|心理分析|deep\s+dive|in-depth|long\s+explanation|meaning\s+of\s+life/i.test(normalized)) {
    return {
      intent: "redirect", gameQuery: "", spins: 1, betPerSpin: 1,
      response: mockRedirect(normalized, language)
    };
  }
  return {
    intent: "chat", gameQuery: "", spins: 1, betPerSpin: 1,
    response: mockCocoChat(message, language)
  };
}

function mockRedirect(seed: string, language: Language) {
  const replies = language === "zh" ? [
    "这个话题再往深处走，我的纽扣眼就要转圈啦。要不要先说说，你今天为什么会想到它？",
    "这么大的题目，我不想装作什么都懂。我们可以把它缩小一点，聊聊它和你眼前这一天有什么关系。",
    "这条光路有点太远了，我先不乱带路。换个轻松方向吧，我可以听你说说最近的一件小事。"
  ] : [
    "If we go much deeper into that topic, my button eyes may start spinning. What made you think of it today?",
    "That is a very large question, and I do not want to pretend I know everything. We can make it smaller and connect it to your day.",
    "That path runs a little too far for me to guide well. Let’s turn toward something lighter, like one small thing from your week."
  ];
  return replies[variationIndex(seed, replies.length)];
}

export function deterministicSummary(result: PlayResult, language: Language = "zh"): GeneratedSummary {
  const format = (value: number) => `${new Intl.NumberFormat(language === "zh" ? "zh-CN" : "en-US", { maximumFractionDigits: 2 }).format(value)} ${result.currency}`;
  const pick = <T>(items: T[]) => items[variationIndex(result.transactionId, items.length)];
  if (language === "en") {
    if (result.net > 0) return pick([
      { message: `What a bright run—the whole portal lit up! Across ${result.spins.length} rounds, you bet ${format(result.totalBet)}, won ${format(result.totalWin)}, finished at +${format(result.net)}, and now have ${format(result.balanceAfter)}.`, mood: "celebrate", nextSuggestion: "View details" },
      { message: `That landed beautifully; Coco is doing a tiny victory twirl! ${result.spins.length} rounds are complete with ${format(result.totalBet)} bet, ${format(result.totalWin)} won, a +${format(result.net)} net result, and ${format(result.balanceAfter)} remaining.`, mood: "celebrate", nextSuggestion: "View details" },
      { message: `The signal stars are sparkling for that finish! After ${result.spins.length} rounds, the total bet was ${format(result.totalBet)}, total win ${format(result.totalWin)}, net +${format(result.net)}, and balance ${format(result.balanceAfter)}.`, mood: "celebrate", nextSuggestion: "Choose a game" },
      { message: `Now that was a cheerful result—your luck found a bright current! You completed ${result.spins.length} rounds with ${format(result.totalBet)} bet, ${format(result.totalWin)} won, net +${format(result.net)}, and a balance of ${format(result.balanceAfter)}.`, mood: "celebrate", nextSuggestion: "View details" },
      { message: `A lovely finish—the portal is still shimmering! The ${result.spins.length}-round total is ${format(result.totalBet)} bet, ${format(result.totalWin)} won, +${format(result.net)} net, with ${format(result.balanceAfter)} in the balance.`, mood: "celebrate", nextSuggestion: "View details" },
      { message: `Coco’s feathers just bounced with that win! Over ${result.spins.length} rounds, you bet ${format(result.totalBet)}, won ${format(result.totalWin)}, came out +${format(result.net)}, and finished with ${format(result.balanceAfter)}.`, mood: "celebrate", nextSuggestion: "Choose a game" },
      { message: `The Data River caught a golden glimmer—that was a sweet result! ${result.spins.length} rounds brought ${format(result.totalBet)} in bets, ${format(result.totalWin)} in wins, net +${format(result.net)}, and a final balance of ${format(result.balanceAfter)}.`, mood: "celebrate", nextSuggestion: "View details" },
      { message: `That deserves a happy little wing-flap—beautifully done! The result for ${result.spins.length} rounds is ${format(result.totalBet)} bet, ${format(result.totalWin)} won, +${format(result.net)} net, and ${format(result.balanceAfter)} in the balance.`, mood: "celebrate", nextSuggestion: "Choose a game" }
    ] as GeneratedSummary[]);
    if (result.net < 0) return pick([
      { message: `${result.spins.length} rounds are complete. Total bet ${format(result.totalBet)}, total win ${format(result.totalWin)}, net ${format(result.net)}, balance ${format(result.balanceAfter)}. Let’s pause by the Data River for a while.`, mood: "comfort", nextSuggestion: "Take a break" },
      { message: `This portal was quiet today: ${result.spins.length} rounds, total bet ${format(result.totalBet)}, total win ${format(result.totalWin)}, net ${format(result.net)}, balance ${format(result.balanceAfter)}. A break sounds good.`, mood: "comfort", nextSuggestion: "Take a break" },
      { message: `Coco has the result: ${result.spins.length} rounds, total bet ${format(result.totalBet)}, total win ${format(result.totalWin)}, net ${format(result.net)}, balance ${format(result.balanceAfter)}. No need to chase it—let’s rest.`, mood: "comfort", nextSuggestion: "Take a break" },
      { message: `The signal wind did not turn our way this time. After ${result.spins.length} rounds: total bet ${format(result.totalBet)}, total win ${format(result.totalWin)}, net ${format(result.net)}, balance ${format(result.balanceAfter)}. Let’s stop here and breathe.`, mood: "comfort", nextSuggestion: "Take a break" }
    ] as GeneratedSummary[]);
    return pick([
      { message: `${result.spins.length} rounds complete. Total bet ${format(result.totalBet)}, total win ${format(result.totalWin)}, net 0 ${result.currency}, balance ${format(result.balanceAfter)}. Perfectly even.`, mood: "excited", nextSuggestion: "Choose a game" },
      { message: `The portal balanced itself: ${result.spins.length} rounds, total bet ${format(result.totalBet)}, total win ${format(result.totalWin)}, net 0 ${result.currency}, balance ${format(result.balanceAfter)}.`, mood: "excited", nextSuggestion: "Choose a game" },
      { message: `A neat tie! Across ${result.spins.length} rounds, total bet was ${format(result.totalBet)}, total win ${format(result.totalWin)}, net 0 ${result.currency}, and balance ${format(result.balanceAfter)}.`, mood: "excited", nextSuggestion: "View details" }
    ] as GeneratedSummary[]);
  }
  if (result.net > 0) return pick([
    { message: `好手气，整扇传送门都亮起来了！这次完成 ${result.spins.length} 局，总下注 ${format(result.totalBet)}，总赢得 ${format(result.totalWin)}，净结果 +${format(result.net)}，当前余额 ${format(result.balanceAfter)}。`, mood: "celebrate", nextSuggestion: "看看明细" },
    { message: `这一轮收得真漂亮，Coco 已经开心得转了一小圈！${result.spins.length} 局总下注 ${format(result.totalBet)}，总赢得 ${format(result.totalWin)}，净结果 +${format(result.net)}，当前余额 ${format(result.balanceAfter)}。`, mood: "celebrate", nextSuggestion: "看看明细" },
    { message: `信号星群一颗接一颗亮起来了，这个结果很耀眼！完成 ${result.spins.length} 局，总下注 ${format(result.totalBet)}，总赢得 ${format(result.totalWin)}，净结果 +${format(result.net)}，当前余额 ${format(result.balanceAfter)}。`, mood: "celebrate", nextSuggestion: "换个游戏" },
    { message: `漂亮收尾，这一轮值得挥挥翅膀庆祝一下！${result.spins.length} 局的总下注是 ${format(result.totalBet)}，总赢得 ${format(result.totalWin)}，净结果 +${format(result.net)}，当前余额 ${format(result.balanceAfter)}。`, mood: "celebrate", nextSuggestion: "看看明细" },
    { message: `数字河里溅起一串金色浪花，好看的结果回来啦！这次 ${result.spins.length} 局总下注 ${format(result.totalBet)}，总赢得 ${format(result.totalWin)}，净结果 +${format(result.net)}，当前余额 ${format(result.balanceAfter)}。`, mood: "celebrate", nextSuggestion: "看看明细" },
    { message: `这次传送门很给面子，连 Coco 的羽毛都跟着跳起来了！完成 ${result.spins.length} 局，总下注 ${format(result.totalBet)}，总赢得 ${format(result.totalWin)}，净结果 +${format(result.net)}，当前余额 ${format(result.balanceAfter)}。`, mood: "celebrate", nextSuggestion: "换个游戏" },
    { message: `亮晶晶的一轮，运气正好落在我们这边！${result.spins.length} 局总下注 ${format(result.totalBet)}，总赢得 ${format(result.totalWin)}，净结果 +${format(result.net)}，当前余额 ${format(result.balanceAfter)}。`, mood: "celebrate", nextSuggestion: "看看明细" },
    { message: `这个结果可以记进今天的闪光碎片里，收得很漂亮！完成 ${result.spins.length} 局，总下注 ${format(result.totalBet)}，总赢得 ${format(result.totalWin)}，净结果 +${format(result.net)}，当前余额 ${format(result.balanceAfter)}。`, mood: "celebrate", nextSuggestion: "换个游戏" }
  ] as GeneratedSummary[]);
  if (result.net < 0) return pick([
    { message: `完成 ${result.spins.length} 局，总下注 ${format(result.totalBet)}，总赢得 ${format(result.totalWin)}，净结果 ${format(result.net)}，当前余额 ${format(result.balanceAfter)}。先到数据河边歇一会儿吧。`, mood: "comfort", nextSuggestion: "休息一下" },
    { message: `这扇传送门今天有点安静：${result.spins.length} 局总下注 ${format(result.totalBet)}，总赢得 ${format(result.totalWin)}，净结果 ${format(result.net)}，当前余额 ${format(result.balanceAfter)}。不用追，停一停更轻松。`, mood: "comfort", nextSuggestion: "休息一下" },
    { message: `结果回来啦：完成 ${result.spins.length} 局，总下注 ${format(result.totalBet)}，总赢得 ${format(result.totalWin)}，净结果 ${format(result.net)}，当前余额 ${format(result.balanceAfter)}。Coco 陪你先休息一下。`, mood: "comfort", nextSuggestion: "休息一下" },
    { message: `这次信号风没有吹向我们。${result.spins.length} 局总下注 ${format(result.totalBet)}，总赢得 ${format(result.totalWin)}，净结果 ${format(result.net)}，当前余额 ${format(result.balanceAfter)}。先在这里停下就好。`, mood: "comfort", nextSuggestion: "休息一下" }
  ] as GeneratedSummary[]);
  return pick([
    { message: `完成 ${result.spins.length} 局，总下注 ${format(result.totalBet)}，总赢得 ${format(result.totalWin)}，净结果 0 ${result.currency}，当前余额 ${format(result.balanceAfter)}。刚好平手！`, mood: "excited", nextSuggestion: "换个游戏" },
    { message: `传送门把两边配平啦：${result.spins.length} 局总下注 ${format(result.totalBet)}，总赢得 ${format(result.totalWin)}，净结果 0 ${result.currency}，当前余额 ${format(result.balanceAfter)}。`, mood: "excited", nextSuggestion: "换个游戏" },
    { message: `不多不少，刚刚好。完成 ${result.spins.length} 局，总下注 ${format(result.totalBet)}，总赢得 ${format(result.totalWin)}，净结果 0 ${result.currency}，当前余额 ${format(result.balanceAfter)}。`, mood: "excited", nextSuggestion: "看看明细" }
  ] as GeneratedSummary[]);
}

function summaryStyle(result: PlayResult, language: Language) {
  const winningStyles = language === "zh" ? [
    "本次用“传送门忽然亮起来”的画面开场，语气轻快。",
    "本次写 Coco 忍不住做了一个小小庆祝动作，语气俏皮。",
    "本次用信号星群闪烁的画面庆祝，避免直接用“恭喜”开场。",
    "本次强调漂亮收尾和轻轻庆祝，语气温暖。",
    "本次用数字河泛起金色光点的画面开场，表达惊喜。",
    "本次写 Coco 的羽毛跟着跳起来，庆祝但不要夸张。",
    "本次用“亮晶晶的一轮”自然开场，不使用单独一句“恭喜”。",
    "本次把好结果称为一枚闪光碎片，语气灵动。"
  ] : [
    "Open with the game portal lighting up; keep the celebration bright and natural.",
    "Mention Coco doing a tiny victory twirl; sound playful without exaggerating.",
    "Use sparkling signal stars as the celebratory image; do not open with Congratulations.",
    "Celebrate a beautiful finish in a warm, relaxed voice.",
    "Open with golden light on the Data River and a sense of pleasant surprise.",
    "Mention Coco’s feathers bouncing happily; keep the win grounded.",
    "Call it a bright little run and avoid a standalone Congratulations.",
    "Frame the result as a sparkling keepsake from the digital world."
  ];
  if (result.net > 0) return winningStyles[variationIndex(result.transactionId, winningStyles.length)];
  return language === "zh"
    ? "改变开场和节奏，使用两句自然表达，不要套用固定模板。"
    : "Vary the opening and rhythm, using two natural sentences rather than a fixed template.";
}

function variationIndex(value: string, count: number) {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return count ? hash % count : 0;
}

function authHeaders(key: string) {
  return { authorization: `Bearer ${key}`, "content-type": "application/json" };
}

function joinUrl(base: string, path: string) {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function parseJson(value: string): unknown {
  const clean = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try { return JSON.parse(clean); }
  catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
    throw new AppError("Coco 没有整理好这句话，请再说一次。", "AI_INVALID_JSON", 502);
  }
}

function unwrapNamedResult(value: unknown, name: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  return record[name] ?? value;
}
