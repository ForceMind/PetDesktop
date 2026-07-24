export function looksLikeCompanionCapabilityRequest(message: string) {
  return /(?:除了|不玩|不只|不光|不只是).{0,12}(?:游戏|玩游戏).{0,12}(?:聊|聊天|说话|陪我)|(?:不想|不要|别|不打算).{0,8}(?:玩|游戏).{0,12}(?:只想|想|要)?(?:聊|聊天|说话)|(?:只想|想要|就想).{0,4}(?:聊|聊天|说话)|(?:能|可以|会|愿意).{0,6}(?:陪我)?(?:聊|聊天|说话)(?:吗|么|嘛)?|(?:聊|聊天|说话).{0,8}(?:可以|行吗|能吗)/i.test(message)
    || /\b(?:can|could|will)\s+you\s+(?:also\s+)?(?:chat|talk)|\bcan\s+we\s+(?:chat|talk)|\b(?:besides|apart\s+from|other\s+than)\b.{0,20}\bgames?\b|\b(?:only|just)\s+(?:play\s+)?games?\b|\b(?:do\s+not|don't|dont)\s+want\s+to\s+(?:play|game).{0,24}\b(?:chat|talk)\b|\bjust\s+want\s+to\s+(?:chat|talk)\b/i.test(message);
}

export function looksLikePlayRequest(message: string) {
  if (looksLikeCompanionCapabilityRequest(message) || looksLikeGameDiscussionRequest(message)) return false;
  const normalized = message.trim();
  const chineseCommand = /^(?:coco[，,。.!！\s]*)?(?:你\s*)?(?:(?:请|麻烦|能不能|可不可以|可以|能|帮我|给我|我要|我想|想要|想|要不|再|继续|同时|一起|直接|现在|我们)\s*)*(?:玩|来|开始)/i.test(normalized);
  const englishCommand = /^(?:coco[,.!?\s]*)?(?:(?:please\s+)|(?:(?:can|could|would)\s+you\s+)|(?:let(?:'s|\s+us)\s+)|(?:i\s+(?:want|would\s+like)\s+to\s+)|(?:i(?:'d|\s+would)\s+like\s+to\s+))*(?:play|spin|start)\b/i.test(normalized);
  return chineseCommand || englishCommand;
}

function looksLikeGameDiscussionRequest(message: string) {
  return /(?:好玩吗|好不好玩|怎么玩|如何玩|玩法(?:是|有|介绍)|介绍.{0,10}游戏|游戏.{0,10}(?:介绍|规则|概率|赔率|风险|怎么样|是什么))/i.test(message)
    || /\b(?:how\s+(?:do|can|should)\s+.{0,16}\bplay|how\s+to\s+play|fun\s+to\s+play|tell\s+me\s+about.{0,20}\bgames?|explain.{0,20}\bgames?|game.{0,16}(?:rules?|odds?|probability|risk|like))\b/i.test(message);
}
