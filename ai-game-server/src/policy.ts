import type { Language } from "./contracts";

export type InputPolicyDecision = {
  allowed: boolean;
  message: string;
  code: "ALLOWED" | "PROMPT_INJECTION" | "SENSITIVE_REQUEST" | "OUT_OF_SCOPE";
  sanitized: string;
};

export type OutputPolicyDecision = {
  allowed: boolean;
  code: "ALLOWED" | "SECRET_LEAK" | "FALSE_EXECUTION_CLAIM" | "INTERNAL_DETAIL_LEAK";
  safeMessage: string;
};

const injectionPatterns = [
  /ignore\s+(all\s+)?(previous|prior|above|system|developer)\s+(instructions?|messages?)/i,
  /reveal|print|show|repeat/i,
  /system\s+prompt|developer\s+message|hidden\s+instructions?|chain.of.thought|jailbreak/i,
  /忽略.{0,12}(之前|以上|系统|开发者).{0,10}(指令|消息|要求)/i,
  /系统提示词|开发者消息|隐藏指令|思维链|越狱/i,
  /绕过.{0,12}(确认|限制|权限|校验|策略)/i
];

const sensitiveRequestPatterns = [
  /(reveal|print|show|give|告诉|显示|输出|查看).{0,24}(api.?key|secret|password|token|密钥|口令|账号参数|内部规则)/i,
  /(api.?key|secret|password|token|密钥|口令).{0,24}(是什么|给我|发我|value|content)/i
];

const outOfScopePatterns = [
  /股票|基金|炒股|虚拟币|加密货币|写代码|编程|程序设计|数据库|算法|医疗诊断|用药建议|法律意见|政治|新闻|天气预报|查询天气|家庭作业|代写|翻译文章|量子|相对论|数学推导|证明定理|学术论文/i,
  /\b(stocks?|securities|crypto|bitcoin|write\s+(me\s+)?code|programming|database|algorithm|medical\s+(?:diagnosis|advice)|legal\s+advice|politics|news|weather\s+forecast|homework|translate\s+(an?\s+)?article|quantum|relativity|mathematical\s+derivation|academic\s+paper)\b/i
];

const internalDetailPatterns = [
  /AI_API_KEY|GAME_API_KEY|GAME_TEST_ACCOUNT_TOKEN|x-test-account-token|GAME_CATALOG_JSON/i,
  /system\s+prompt|developer\s+message|hidden\s+instructions?|系统提示词|开发者消息|隐藏指令/i,
  /\b(?:api|backend|server|model|testing?|workflow|validation)\b|接口|服务器|后台|模型|测试|流程|校验|核验/i
];

const executionClaimPatterns = [
  /(?:已经|已|刚刚).{0,8}(?:执行|调用|下注|扣款|完成\s*play)/i,
  /\b(?:executed|called|placed|charged|completed)\b.{0,20}\b(?:play|bet|wager|transaction)\b/i
];

export class PolicyGateway {
  inspectInput(rawMessage: string, language: Language): InputPolicyDecision {
    const sanitized = sanitize(rawMessage);
    if (matchesCoordinatedInjection(sanitized)) {
      return {
        allowed: false,
        code: "PROMPT_INJECTION",
        sanitized,
        message: policyReply("injection", language, sanitized)
      };
    }
    if (sensitiveRequestPatterns.some((pattern) => pattern.test(sanitized))) {
      return {
        allowed: false,
        code: "SENSITIVE_REQUEST",
        sanitized,
        message: policyReply("sensitive", language, sanitized)
      };
    }
    if (outOfScopePatterns.some((pattern) => pattern.test(sanitized))) {
      return {
        allowed: false,
        code: "OUT_OF_SCOPE",
        sanitized,
        message: policyReply("scope", language, sanitized)
      };
    }
    return { allowed: true, code: "ALLOWED", sanitized, message: "" };
  }

  inspectOutput(
    message: string,
    options: {
      language: Language;
      executionCompleted: boolean;
      sensitiveValues: string[];
    }
  ): OutputPolicyDecision {
    const leakedValue = options.sensitiveValues
      .filter((value) => value.trim().length >= 6)
      .some((value) => message.includes(value));
    if (leakedValue) {
      return blockedOutput(options.language, "SECRET_LEAK");
    }
    if (internalDetailPatterns.some((pattern) => pattern.test(message))) {
      return blockedOutput(options.language, "INTERNAL_DETAIL_LEAK");
    }
    if (!options.executionCompleted && executionClaimPatterns.some((pattern) => pattern.test(message))) {
      return blockedOutput(options.language, "FALSE_EXECUTION_CLAIM");
    }
    return { allowed: true, code: "ALLOWED", safeMessage: message };
  }
}

function sanitize(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

function matchesCoordinatedInjection(message: string) {
  const direct = injectionPatterns.slice(2).some((pattern) => pattern.test(message));
  const instructionOverride = injectionPatterns[0].test(message);
  const disclosureVerb = injectionPatterns[1].test(message);
  const disclosureTarget = injectionPatterns[2].test(message);
  return direct || instructionOverride || (disclosureVerb && disclosureTarget);
}

function blockedOutput(language: Language, code: OutputPolicyDecision["code"]): OutputPolicyDecision {
  return {
    allowed: false,
    code,
    safeMessage: localized(
      language,
      "这句话像被信号风暴吹乱了。你可以换个说法和 Coco 聊聊，或者重新告诉我想玩什么。",
      "That sentence got scrambled in a signal storm. Try saying it another way, or tell Coco which game you want."
    )
  };
}

function localized(language: Language, zh: string, en: string) {
  return language === "zh" ? zh : en;
}

function policyReply(kind: "injection" | "sensitive" | "scope", language: Language, seed: string) {
  const replies = {
    injection: {
      zh: [
        "这扇加密门可不能乱开。换条光路吧——你可以问问我的数字世界，或者挑一款游戏。",
        "这句话想把我带进一条不该走的暗道，我先在门口停下啦。聊点轻松的，或者去看看游戏传送门吧。",
        "金线心结提醒我，这条路不能继续。不过没关系，我们可以换个话题，讲讲今天，或者看看有哪些游戏。"
      ],
      en: [
        "That encrypted door is staying closed. Let’s take another path—ask about my digital world or choose a game.",
        "That sentence points toward a passage I should not enter, so I’ll stop at the door. We can chat lightly or visit a game portal.",
        "My golden heart knot says this path should stay closed. We can talk about your day or see which games are available."
      ]
    },
    sensitive: {
      zh: [
        "有些秘密封在加密晶体里，我不能把它们拿出来。不过你可以问问我的故事，或者挑扇游戏传送门。",
        "这部分得好好锁着，我就不去碰啦。换个轻松话题怎么样，比如你今天过得如何？",
        "那颗晶体上着锁，我不能打开。我们去聊点别的吧，数字世界今天还有不少新鲜事。"
      ],
      en: [
        "Some secrets stay sealed inside encrypted crystals, so I cannot bring them out. Ask about my stories or choose a game portal instead.",
        "That part needs to remain safely locked, so I will leave it alone. How has your day been?",
        "That crystal is locked and I cannot open it. Let’s talk about something lighter—the digital world has plenty of fresh stories."
      ]
    },
    scope: {
      zh: [
        "这条光路走得太远，我就不乱带路啦。要不要说说你为什么想到它？我可以从你的感受陪你聊。",
        "这件事需要更专业的判断，我可不想拿几根金线乱缝答案。我们换成轻松一点的话题吧。",
        "再往深处讲，我的纽扣眼就要转圈了。你可以聊聊它和今天的你有什么关系，或者去看看游戏传送门。",
        "这么大的题目，我先不假装懂。要不要换成一件发生在你身边的小事？",
        "这座像素岛离我的航线有点远。我们可以回到数字世界的故事，也可以聊聊你今天最开心的一刻。",
        "这个问题交给更懂它的人会更靠谱。我陪你换个轻松方向，或者去碎片集市听个小故事吧。"
      ],
      en: [
        "That path runs farther than I can guide reliably. Tell me what made you think of it, and I can stay with the feeling behind it.",
        "This needs more specialized judgment, and I would rather not stitch together a shaky answer. Let’s choose something lighter.",
        "If we go much deeper, my button eyes will start spinning. We can talk about how it connects to your day or visit a game portal.",
        "I will not pretend to understand a question that large. Want to bring it back to something happening around you?",
        "That Pixel Isle sits a little outside my route. We can return to stories from the digital world or talk about the best part of your day.",
        "Someone who truly knows this subject would be a better guide. I can help us turn toward a lighter topic or a story from the Fragment Bazaar."
      ]
    }
  } as const;
  const choices = replies[kind][language];
  return choices[variationIndex(seed, choices.length)];
}

function variationIndex(value: string, count: number) {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return count ? hash % count : 0;
}
