import { randomUUID } from "node:crypto";
import type {
  AgentStep,
  AssistantReply,
  BootstrapResponse,
  ChatMessage,
  Game,
  Language,
  PlayProgress,
  PlayProposal,
  PlayResult
} from "./contracts";
import type { AppConfig } from "./config";
import { CompatibleAi, deterministicSummary } from "./ai";
import { mockCocoChat } from "./coco-world";
import { AppError } from "./errors";
import { GameProvider } from "./game";
import { looksLikeCompanionCapabilityRequest, looksLikePlayRequest } from "./intent-rules";
import { PolicyGateway } from "./policy";

type Session = {
  id: string;
  history: ChatMessage[];
  executions: number[];
  casualTurns: number;
  language: Language;
  launchParams: Record<string, string>;
};

type PendingAction = {
  sessionId: string;
  proposal: PlayProposal;
  status: "pending" | "executing" | "done" | "failed" | "cancelled";
  steps?: AgentStep[];
  reply?: AssistantReply;
};

type StepListener = (step: AgentStep) => void | Promise<void>;
type ProgressListener = (progress: PlayProgress) => void;

function stepDefinitions(language: Language) {
  return language === "zh" ? [
    ["request", "准备这次游戏"],
    ["catalog", "打开游戏传送门"],
    ["limits", "确认本局设置"],
    ["account", "Coco 准备出发"],
    ["play", "游戏进行中"],
    ["reconcile", "整理游戏结果"],
    ["summary", "想一句好听的话"],
    ["grounding", "完成最后确认"]
  ] as const : [
    ["request", "Preparing this game"],
    ["catalog", "Opening the game portal"],
    ["limits", "Confirming this game"],
    ["account", "Coco is getting ready"],
    ["play", "Game in progress"],
    ["reconcile", "Sorting out the result"],
    ["summary", "Finding the right words"],
    ["grounding", "Finishing up"]
  ] as const;
}

export class SlotAgent {
  private readonly ai: CompatibleAi;
  private readonly games: GameProvider;
  private readonly policy = new PolicyGateway();
  private readonly sessions = new Map<string, Session>();
  private readonly actions = new Map<string, PendingAction>();

  constructor(private readonly appConfig: AppConfig) {
    this.ai = new CompatibleAi(appConfig.ai);
    this.games = new GameProvider(appConfig.game);
  }

  async bootstrap(options: {
    language?: Language;
    launchParams?: Record<string, string>;
  } = {}): Promise<BootstrapResponse> {
    const sessionId = randomUUID();
    const language = options.language ?? "en";
    const launchParams = { ...(options.launchParams ?? {}) };
    const games = (await this.games.listGames(this.gameContext(launchParams))).filter((game) => game.enabled);
    const playableGames = games.filter((game) => game.playable !== false);
    const firstGame = playableGames[0];
    const greeting = assistant(
      tr(
        language,
        "你好，我是 Coco！我可以陪你聊天，也能帮你玩游戏。每次开始前，我都会先给你一张确认卡片。",
        "Hi, I’m Coco! I can chat with you and help you play games. I always show you a confirmation card before I start."
      ),
      "excited",
      language === "zh" ? [
        { label: "看看游戏", message: "有哪些游戏？" },
        { label: "玩 1 局", message: `玩 ${firstGame?.name ?? "游戏"} 1 局，下注档位 ${firstGame ? preferredBet(firstGame) : 1}` },
        { label: "怎么使用", message: "你能做什么？" }
      ] : [
        { label: "View games", message: "What games are available?" },
        { label: "Play 1 round", message: `Play ${firstGame?.name ?? "a game"} for 1 round, bet level ${firstGame ? preferredBet(firstGame) : 1}` },
        { label: "How it works", message: "What can you do?" }
      ]
    );
    this.sessions.set(sessionId, { id: sessionId, history: [greeting], executions: [], casualTurns: 0, language, launchParams });
    return {
      sessionId,
      petName: "Coco",
      language,
      demoMode: this.appConfig.demoMode,
      aiMode: this.ai.mode,
      gameMode: this.games.mode,
      currency: this.appConfig.game.currency,
      games,
      limits: {
        maxSpins: this.appConfig.limits.maxSpins,
        maxTotalBet: this.appConfig.limits.maxTotalBet
      },
      launchContext: { keys: Object.keys(launchParams) },
      greeting
    };
  }

  async chat(sessionId: string, message: string, language?: Language): Promise<AssistantReply> {
    const session = this.requireSession(sessionId);
    if (language) session.language = language;
    const inputPolicy = this.policy.inspectInput(message, session.language);
    const cleanMessage = inputPolicy.sanitized;
    if (!cleanMessage) throw new AppError(tr(session.language, "请输入一条消息。", "Please enter a message."), "EMPTY_MESSAGE", 400);

    session.history.push({
      id: randomUUID(),
      role: "user",
      message: cleanMessage,
      createdAt: new Date().toISOString()
    });

    if (!inputPolicy.allowed) {
      const blockedReply = assistant(inputPolicy.message, "careful", gentleRedirectQuickReplies(session.language));
      session.history.push(blockedReply);
      trimHistory(session.history);
      return blockedReply;
    }

    const games = (await this.games.listGames(this.gameContext(session.launchParams))).filter((game) => game.enabled);
    const playableGames = games.filter((game) => game.playable !== false);
    const directGameReply = await this.tryDirectGameRequest(sessionId, cleanMessage, games, playableGames, session.language);
    let directReply: AssistantReply | undefined;
    if (directGameReply) {
      session.casualTurns = 0;
      directReply = directGameReply;
    } else if (session.casualTurns >= 6 && looksLikeDeepFollowUp(cleanMessage)) {
      session.casualTurns = 0;
      directReply = assistant(
        conversationDepthReply(cleanMessage, session.language),
        "careful",
        gentleRedirectQuickReplies(session.language)
      );
    } else if (isCocoCompanionMessage(cleanMessage)) {
      session.casualTurns += 1;
      directReply = assistant(mockCocoChat(cleanMessage, session.language), "idle");
    }
    let reply: AssistantReply;

    if (directReply) {
      reply = directReply;
    } else {
      try {
        const intent = await this.ai.understand(cleanMessage, playableGames, session.history, sessionId, session.language);
        if (intent.intent === "list_games") {
          session.casualTurns = 0;
          reply = this.createGameCatalogReply(games, playableGames, session.language);
        } else if (intent.intent === "help") {
          session.casualTurns = 0;
          reply = this.createHelpReply(session.language);
        } else if (intent.intent === "play_slot") {
          session.casualTurns = 0;
          reply = await this.createProposal(sessionId, playableGames, intent.gameQuery, intent.spins, intent.betPerSpin, session.language);
        } else if (intent.intent === "redirect") {
          session.casualTurns = 0;
          reply = assistant(intent.response, "careful", gentleRedirectQuickReplies(session.language));
        } else {
          session.casualTurns += 1;
          reply = assistant(
            hasFalseObservationClaim(intent.response)
              ? mockCocoChat(cleanMessage, session.language)
              : intent.response,
            "idle"
          );
        }
      } catch (error) {
        if (!(error instanceof AppError) || !error.code.startsWith("AI_")) throw error;
        session.casualTurns += 1;
        reply = assistant(mockCocoChat(cleanMessage, session.language), "idle");
      }
    }

    const outputPolicy = this.policy.inspectOutput(reply.message, {
      language: session.language,
      executionCompleted: false,
      sensitiveValues: this.sensitiveValues(session)
    });
    if (!outputPolicy.allowed) {
      reply = assistant(outputPolicy.safeMessage, "careful", [
        trQuick(session.language, "查看游戏", "有哪些游戏？", "View games", "What games are available?")
      ]);
    }

    session.history.push(reply);
    trimHistory(session.history);
    return reply;
  }

  async execute(
    actionId: string,
    sessionId: string,
    onStep: StepListener,
    language?: Language,
    onProgress: ProgressListener = () => {}
  ): Promise<AssistantReply> {
    const session = this.requireSession(sessionId);
    if (language) session.language = language;
    const action = this.actions.get(actionId);
    if (!action || action.sessionId !== sessionId) {
      throw new AppError(tr(session.language, "这张确认卡不存在或不属于当前会话。", "This confirmation card is missing or belongs to another session."), "ACTION_NOT_FOUND", 404);
    }
    if (action.status === "done" && action.reply) {
      for (const step of action.steps ?? []) await onStep(step);
      return action.reply;
    }
    if (action.status === "executing") {
      throw new AppError(tr(session.language, "这次游戏正在执行，请不要重复提交。", "This game request is already running. Please do not submit it again."), "ACTION_IN_PROGRESS", 409);
    }
    if (action.status === "cancelled") {
      throw new AppError(
        tr(session.language, "这张确认卡已被新的游戏设置替换。", "This confirmation card was replaced by newer game settings."),
        "ACTION_CANCELLED",
        409
      );
    }
    if (action.status === "failed") {
      throw new AppError(
        tr(session.language, "上一局的结果还没有回来。为避免重复下注，这张确认卡不能重试。", "The previous result has not returned yet. This card cannot be retried because it could place the same bet twice."),
        "ACTION_NOT_RETRYABLE",
        409
      );
    }

    const steps: AgentStep[] = stepDefinitions(session.language).map(([id, label]) => ({
      id,
      label,
      detail: tr(session.language, "稍等一下", "Just a moment"),
      status: "waiting"
    }));
    action.status = "executing";
    action.steps = steps;
    let currentIndex = 0;

    const runStep = async <T>(detail: string, task: () => Promise<T> | T): Promise<T> => {
      const step = steps[currentIndex];
      const startedAt = Date.now();
      step.status = "running";
      step.detail = detail;
      await onStep({ ...step });
      try {
        const output = await task();
        step.status = "passed";
        step.durationMs = Date.now() - startedAt;
        await onStep({ ...step });
        currentIndex += 1;
        return output;
      } catch (error) {
        const safeError = userFacingExecutionError(error, session.language);
        step.status = "failed";
        step.durationMs = Date.now() - startedAt;
        step.detail = safeError.message;
        await onStep({ ...step });
        action.status = safeError instanceof AppError
          && ["PLAY_OUTCOME_UNKNOWN", "PLAY_RESULT_UNVERIFIED"].includes(safeError.code)
          ? "failed"
          : "pending";
        throw safeError;
      }
    };

    const proposal = action.proposal;
    await runStep(tr(session.language, "看看这张确认卡是否还有效", "Checking that this card is still ready"), () => {
      if (new Date(proposal.expiresAt).getTime() < Date.now()) {
        throw new AppError(tr(session.language, "确认卡已过期，请重新发起游戏。", "The confirmation card expired. Please start again."), "ACTION_EXPIRED", 410);
      }
    });

    const game = await runStep(tr(session.language, `看看 ${proposal.game.name} 现在是否可以玩`, `Checking whether ${proposal.game.name} is ready to play`), async () => {
      const listed = (await this.games.listGames(this.gameContext(session.launchParams)))
        .find((item) => item.id === proposal.game.id && item.enabled && item.playable !== false);
      if (!listed) throw new AppError(tr(session.language, "这个游戏当前未启用。", "This game is not currently enabled."), "GAME_DISABLED", 409);
      return listed;
    });

    await runStep(tr(session.language, "看看局数、下注和当前节奏", "Checking the rounds, bet, and current pace"), () => {
      validateLimits(this.appConfig, game, proposal.spins, proposal.betPerSpin, session.language);
      const cutoff = Date.now() - 60_000;
      session.executions = session.executions.filter((time) => time >= cutoff);
      if (session.executions.length >= this.appConfig.limits.ratePerMinute) {
        throw new AppError(tr(session.language, "操作太频繁了，请休息一分钟再试。", "Too many requests. Please wait one minute."), "RATE_LIMITED", 429);
      }
      session.executions.push(Date.now());
    });

    const accountId = await runStep(tr(session.language, "Coco 正在准备出发", "Coco is getting ready to go"), () => {
      if (!this.appConfig.demoMode) {
        throw new AppError(tr(session.language, "Coco 现在还不能开始游戏。", "Coco cannot start a game right now."), "DEMO_MODE_REQUIRED", 503);
      }
      const accountId = resolveGameAccount(this.appConfig, session.launchParams);
      if (this.games.mode === "live" && !accountId) {
        throw new AppError(
          tr(session.language, "没有找到你的游戏账户，请从游戏入口重新进入。", "I couldn’t find your game account. Please enter again from the game lobby."),
          "GAME_ACCOUNT_REQUIRED",
          503
        );
      }
      return accountId || `mock:${sessionId}`;
    });

    const result = await runStep(tr(session.language, "Coco 正在玩这局", "Coco is playing this round"), () => this.games.play({
      accountId,
      launchParams: session.launchParams,
      game,
      spins: proposal.spins,
      betPerSpin: proposal.betPerSpin,
      currency: proposal.currency,
      idempotencyKey: `slot-action:${actionId}`,
      onProgress
    }));
    if (game.iconUrl) result.gameIconUrl = game.iconUrl;

    await runStep(tr(session.language, "整理每局下注、赢得和余额", "Sorting out each round’s bet, win, and balance"), () => reconcileResult(result, proposal, session.language));

    let generated = await runStep(tr(session.language, "Coco 正在想怎么告诉你", "Coco is deciding how to tell you"), async () => {
      try {
        return await this.ai.summarize(result, sessionId, session.language);
      } catch (error) {
        console.warn("AI summary failed; using grounded fallback.", error);
        return deterministicSummary(result, session.language);
      }
    });

    await runStep(tr(session.language, "确认回复中的数字和结果一致", "Making sure the reply matches the result"), () => {
      if (!summaryIsGrounded(generated.message, result)) generated = deterministicSummary(result, session.language);
      if (!summaryIsGrounded(generated.message, result)) {
        throw new AppError(tr(session.language, "结果总结未通过事实核验。", "The result summary failed fact validation."), "SUMMARY_NOT_GROUNDED", 502);
      }
    });

    const reply = assistant(generated.message, generated.mood, [
      trQuick(session.language, "查看游戏", "有哪些游戏？", "View games", "What games are available?"),
      { label: generated.nextSuggestion, message: generated.nextSuggestion }
    ]);
    const outputPolicy = this.policy.inspectOutput(reply.message, {
      language: session.language,
      executionCompleted: true,
      sensitiveValues: this.sensitiveValues(session)
    });
    if (!outputPolicy.allowed) {
      reply.message = deterministicSummary(result, session.language).message;
    }
    reply.result = result;
    reply.trace = steps.map((step) => ({ ...step }));
    action.status = "done";
    action.reply = reply;
    session.history.push(reply);
    trimHistory(session.history);
    return reply;
  }

  private async tryDirectGameRequest(
    sessionId: string,
    message: string,
    allGames: Game[],
    playableGames: Game[],
    language: Language
  ): Promise<AssistantReply | undefined> {
    if (looksLikeGameListRequest(message)) {
      return this.createGameCatalogReply(allGames, playableGames, language);
    }
    if (looksLikeCompanionCapabilityRequest(message)) {
      return this.createChatCapabilityReply(language);
    }
    if (looksLikeHelpRequest(message)) {
      return this.createHelpReply(language);
    }
    const previousResult = this.tryPreviousResultReply(sessionId, message, language);
    if (previousResult) return previousResult;

    const pending = this.latestPendingAction(sessionId);
    const mentioned = findMentionedGames(message, playableGames);
    if (looksLikeBetOptionsRequest(message)) {
      if (mentioned.length === 1) {
        const session = this.requireSession(sessionId);
        const game = await this.games.prepareGame(
          mentioned[0],
          this.gameContext(session.launchParams)
        );
        return createBetOptionsReply(game, this.appConfig.game.currency, language);
      }
      if (pending) {
        return createBetOptionsReply(
          pending.proposal.game,
          pending.proposal.currency,
          language,
          pending.proposal
        );
      }
      return createBetOptionsChooser(playableGames, language);
    }
    const changesPendingGame = pending
      && mentioned.length === 1
      && mentioned[0].id !== pending.proposal.game.id
      && looksLikePendingGameChange(message);
    if (pending && changesPendingGame) {
      const session = this.requireSession(sessionId);
      const targetGame = await this.games.prepareGame(
        mentioned[0],
        this.gameContext(session.launchParams)
      );
      const requestedSpins = parseRequestedSpins(message) ?? pending.proposal.spins;
      const requestedBet = parseRequestedBet(message) ?? parseBetAdjustment(message);
      const replacementBet = requestedBet
        ?? (isAllowedBet(targetGame, pending.proposal.betPerSpin)
          ? pending.proposal.betPerSpin
          : preferredBet(targetGame));
      const updated = await this.createProposal(
        sessionId,
        playableGames,
        targetGame.id,
        requestedSpins,
        replacementBet,
        language
      );
      if (updated.proposal) {
        pending.status = "cancelled";
        updated.cancelledActionIds = [pending.proposal.actionId];
        const spinsWereCapped = requestedSpins > updated.proposal.spins;
        updated.message = tr(
          language,
          `${spinsWereCapped ? `${updated.proposal.game.name} 一次最多玩 ${updated.proposal.spins} 局。` : ""}已把游戏从 ${pending.proposal.game.name} 换成 ${updated.proposal.game.name}，新卡是 ${updated.proposal.spins} 局、下注档位 ${updated.proposal.betPerSpin}。每局实际下注 ${updated.proposal.wagerPerSpin} ${updated.proposal.currency}，总下注 ${updated.proposal.totalBet} ${updated.proposal.currency}；旧卡已经失效，请使用新卡确认。`,
          `${spinsWereCapped ? `${updated.proposal.game.name} allows at most ${updated.proposal.spins} rounds per request. ` : ""}I switched the game from ${pending.proposal.game.name} to ${updated.proposal.game.name}. The new card has ${updated.proposal.spins} rounds at bet level ${updated.proposal.betPerSpin}, with an actual wager of ${updated.proposal.wagerPerSpin} ${updated.proposal.currency} per round and ${updated.proposal.totalBet} ${updated.proposal.currency} total. The old card is no longer valid; use the new card.`
        );
      }
      return updated;
    }
    const adjustedSpins = parseRequestedSpins(message);
    const explicitBetAdjustment = parseBetAdjustment(message);
    const adjustsSpins = adjustedSpins !== undefined && looksLikePendingSpinAdjustment(message);
    const adjustedBet = explicitBetAdjustment
      ?? (adjustsSpins ? parseRequestedBet(message) : undefined);
    const targetsPendingGame = mentioned.length === 0
      || mentioned.some((game) => game.id === pending?.proposal.game.id);
    if (
      pending
      && targetsPendingGame
      && (adjustedBet !== undefined || adjustsSpins)
    ) {
      const updated = await this.createProposal(
        sessionId,
        playableGames,
        pending.proposal.game.id,
        adjustsSpins ? adjustedSpins : pending.proposal.spins,
        adjustedBet ?? pending.proposal.betPerSpin,
        language
      );
      if (updated.proposal) {
        pending.status = "cancelled";
        updated.cancelledActionIds = [pending.proposal.actionId];
        const spinsWereCapped = adjustsSpins
          && adjustedSpins !== undefined
          && adjustedSpins > updated.proposal.spins;
        updated.message = tr(
          language,
          `${spinsWereCapped ? `一次最多玩 ${updated.proposal.spins} 局。` : ""}已把 ${updated.proposal.game.name} 的确认卡改为 ${updated.proposal.spins} 局、下注档位 ${updated.proposal.betPerSpin}。每局实际下注 ${updated.proposal.wagerPerSpin} ${updated.proposal.currency}，总下注 ${updated.proposal.totalBet} ${updated.proposal.currency}；旧卡已经失效，请使用新卡确认。${spinsWereCapped ? "要开始吗？" : ""}`,
          `${spinsWereCapped ? `A request can include at most ${updated.proposal.spins} rounds. ` : ""}I updated the ${updated.proposal.game.name} card to ${updated.proposal.spins} rounds at bet level ${updated.proposal.betPerSpin}. The actual wager is ${updated.proposal.wagerPerSpin} ${updated.proposal.currency} per round and ${updated.proposal.totalBet} ${updated.proposal.currency} total. The old card is no longer valid; use the new card.${spinsWereCapped ? " Start this card?" : ""}`
        );
      }
      return updated;
    }

    if (!looksLikePlayRequest(message)) return undefined;
    const spins = parseRequestedSpins(message) ?? 1;
    const sharedBet = parseRequestedBet(message);
    if (mentioned.length >= 2) {
      return this.createMultipleProposals(sessionId, mentioned, spins, sharedBet, language);
    }
    if (mentioned.length === 1) {
      return this.createProposal(
        sessionId,
        playableGames,
        mentioned[0].id,
        spins,
        sharedBet ?? preferredBet(mentioned[0]),
        language
      );
    }
    if (/(?:游戏|slot|老虎机|拉霸|\bgame\b)/i.test(message)) {
      return this.createProposal(sessionId, playableGames, "", spins, sharedBet ?? 1, language);
    }
    return undefined;
  }

  private createGameCatalogReply(allGames: Game[], playableGames: Game[], language: Language) {
    const reply = assistant(
      allGames.length
        ? tr(
          language,
          "这里是现在可以玩的游戏；其他游戏放在“待上线”里，需要时再打开看看。",
          "These games are available now. The rest are under “Coming soon” if you want to take a look."
        )
        : tr(language, "目前还没有游戏。", "There are no games yet."),
      "excited",
      playableGames.slice(0, 5).map((game) => ({
        label: game.name,
        message: tr(
          language,
          `玩 ${game.name} 1 局，下注档位 ${preferredBet(game)}`,
          `Play ${game.name} for 1 round, bet level ${preferredBet(game)}`
        )
      }))
    );
    reply.games = allGames;
    return reply;
  }

  private createHelpReply(language: Language) {
    return assistant(
      tr(
        language,
        "我可以陪你聊今天的小事，讲数字世界的见闻，也可以回答关于我自己的问题；想去游戏传送门时，告诉我想玩哪一款就好。涉及下注时，我会先把金额说清楚，等你点头再出发。",
        "I can listen to stories from your day, share tales from the digital world, and answer questions about myself. If you feel like visiting a game portal, just tell me which one. When a wager is involved, I’ll explain the amount and wait for your go-ahead."
      ),
      "idle",
      language === "zh"
        ? [
          { label: "认识 Coco", message: "介绍一下你自己" },
          { label: "聊聊今天", message: "聊聊今天发生的事" },
          { label: "查看游戏", message: "有哪些游戏？" }
        ]
        : [
          { label: "Meet Coco", message: "Tell me about yourself" },
          { label: "Talk about today", message: "Let's talk about today" },
          { label: "View games", message: "What games are available?" }
        ]
    );
  }

  private createChatCapabilityReply(language: Language) {
    return assistant(
      tr(
        language,
        "当然可以。游戏只是数字世界里的一些传送门；不玩游戏的时候，我们可以聊今天发生的事，也可以聊我的来历、像素岛上的见闻，或者你此刻的心情。你想从哪里聊起？",
        "Absolutely. Games are only some of the portals in the digital world. We can talk about your day, my story, life on the Pixel Isles, or whatever is on your mind. Where would you like to begin?"
      ),
      "idle",
      language === "zh"
        ? [
          { label: "介绍一下你自己", message: "介绍一下你自己" },
          { label: "数字世界", message: "讲讲数字世界今天发生的事" },
          { label: "聊聊今天", message: "我想聊聊今天" }
        ]
        : [
          { label: "About you", message: "Tell me about yourself" },
          { label: "Digital world", message: "What happened in the digital world today?" },
          { label: "My day", message: "I'd like to talk about my day" }
        ]
    );
  }

  private tryPreviousResultReply(sessionId: string, message: string, language: Language) {
    if (!/(?:上次|上一局|刚才|最近).{0,8}(?:结果|明细|余额)|(?:last|previous|recent).{0,16}(?:result|details?|balance)|(?:result|details?|balance).{0,16}(?:last|previous|recent)/i.test(message)) {
      return undefined;
    }
    const session = this.sessions.get(sessionId);
    const previous = [...(session?.history ?? [])].reverse()
      .find((item): item is AssistantReply => item.role === "assistant" && Boolean(item.result));
    if (!previous?.result) {
      return assistant(
        tr(language, "这次对话里还没有游戏结果。先挑一款游戏吧。", "There is no game result in this conversation yet. Choose a game first."),
        "careful"
      );
    }
    const reply = assistant(
      deterministicSummary(previous.result, language).message,
      previous.mood
    );
    reply.result = previous.result;
    return reply;
  }

  private latestPendingAction(sessionId: string) {
    const now = Date.now();
    return [...this.actions.values()].reverse().find((action) =>
      action.sessionId === sessionId
      && action.status === "pending"
      && Date.parse(action.proposal.expiresAt) > now
    );
  }

  private async createMultipleProposals(
    sessionId: string,
    games: Game[],
    spins: number,
    sharedBet: number | undefined,
    language: Language
  ): Promise<AssistantReply> {
    const session = this.requireSession(sessionId);
    const preparedGames = await Promise.all(
      games.map((game) => this.games.prepareGame(game, this.gameContext(session.launchParams)))
    );
    const requestedSpins = spins;
    const proposalSpins = Math.min(spins, ...preparedGames.map((game) => maximumSpins(this.appConfig, game)));
    const expiresAt = new Date(Date.now() + this.appConfig.limits.actionTtlSeconds * 1000).toISOString();
    const prepared = preparedGames.map((game) => ({
      game,
      betPerSpin: sharedBet ?? preferredBet(game)
    }));
    for (const item of prepared) {
      try {
        validateLimits(this.appConfig, item.game, proposalSpins, item.betPerSpin, language);
      } catch (error) {
        if (isProposalInputError(error)) return createLimitGuidance(error, item.game, proposalSpins, language);
        throw error;
      }
    }
    const proposals = prepared.map(({ game, betPerSpin }) => {
      const wagerPerSpin = money(betPerSpin * (game.wagerMultiplier ?? 1));
      return {
        actionId: randomUUID(),
        game,
        spins: proposalSpins,
        betPerSpin,
        wagerPerSpin,
        totalBet: money(proposalSpins * wagerPerSpin),
        currency: this.appConfig.game.currency,
        expiresAt
      } satisfies PlayProposal;
    });
    for (const proposal of proposals) {
      this.actions.set(proposal.actionId, { sessionId, proposal, status: "pending" });
    }
    const reply = assistant(
      tr(
        language,
        requestedSpins > proposalSpins
          ? `一次最多玩 ${proposalSpins} 局。我先按每款 ${proposalSpins} 局准备了 ${proposals.length} 张独立确认卡；要开始哪一款，就确认哪一张。`
          : `已准备 ${proposals.length} 张独立确认卡。每款游戏都要单独确认，Coco 会按顺序玩，不会同时下注。`,
        requestedSpins > proposalSpins
          ? `A request can include at most ${proposalSpins} rounds. I prepared ${proposals.length} separate ${proposalSpins}-round cards; confirm the ones you want to start.`
          : `I prepared ${proposals.length} separate confirmation cards. Confirm each game separately; Coco will play them in order and never place the bets at the same time.`
      ),
      "careful"
    );
    reply.proposals = proposals;
    return reply;
  }

  private async createProposal(
    sessionId: string,
    games: Game[],
    gameQuery: string,
    spins: number,
    betPerSpin: number,
    language: Language
  ): Promise<AssistantReply> {
    const listedGame = resolveGame(games, gameQuery);
    if (!listedGame) {
      return assistant(
        gameQuery
          ? tr(language, `没有找到“${gameQuery}”。请从游戏列表里选一个。`, `I couldn’t find “${gameQuery}”. Please choose from the game list.`)
          : tr(language, "你想玩哪一个？先选一个游戏。", "Which game would you like to play?"),
        "careful",
        games.slice(0, 5).map((item) => {
          const suggestedBet = isAllowedBet(item, betPerSpin) ? betPerSpin : preferredBet(item);
          return {
          label: item.name,
            message: tr(
              language,
              `玩 ${item.name} ${spins} 局，每局下注 ${suggestedBet}`,
              `Play ${item.name} for ${spins} rounds, bet ${suggestedBet} each`
            )
          };
        })
      );
    }
    const session = this.requireSession(sessionId);
    const game = await this.games.prepareGame(listedGame, this.gameContext(session.launchParams));

    const requestedSpins = spins;
    const maxSpins = maximumSpins(this.appConfig, game);
    const proposalSpins = Number.isInteger(spins) && spins > maxSpins ? maxSpins : spins;
    try {
      validateLimits(this.appConfig, game, proposalSpins, betPerSpin, language);
    } catch (error) {
      if (isProposalInputError(error)) return createLimitGuidance(error, game, proposalSpins, language);
      throw error;
    }
    const wagerPerSpin = money(betPerSpin * (game.wagerMultiplier ?? 1));
    const actionId = randomUUID();
    const proposal: PlayProposal = {
      actionId,
      game,
      spins: proposalSpins,
      betPerSpin,
      wagerPerSpin,
      totalBet: money(proposalSpins * wagerPerSpin),
      currency: this.appConfig.game.currency,
      expiresAt: new Date(Date.now() + this.appConfig.limits.actionTtlSeconds * 1000).toISOString()
    };
    this.actions.set(actionId, { sessionId, proposal, status: "pending" });
    const reply = assistant(
      tr(
        language,
        requestedSpins > proposalSpins
          ? `一次最多玩 ${proposalSpins} 局。我先按 ${game.name} ${proposalSpins} 局、下注档位 ${betPerSpin} 准备好了；每局实际下注 ${wagerPerSpin} ${proposal.currency}，总下注 ${proposal.totalBet} ${proposal.currency}。要开始吗？`
          : `已准备 ${game.name}：${proposalSpins} 局，下注档位 ${betPerSpin}，每局实际下注 ${wagerPerSpin} ${proposal.currency}，总下注 ${proposal.totalBet} ${proposal.currency}。你确认后 Coco 才会开始。`,
        requestedSpins > proposalSpins
          ? `A request can include at most ${proposalSpins} rounds. I prepared ${game.name} for ${proposalSpins} rounds at bet level ${betPerSpin}, with an actual wager of ${wagerPerSpin} ${proposal.currency} per round and ${proposal.totalBet} ${proposal.currency} total. Start this card?`
          : `${game.name} is ready: ${proposalSpins} rounds at bet level ${betPerSpin}, with an actual wager of ${wagerPerSpin} ${proposal.currency} per round and ${proposal.totalBet} ${proposal.currency} total. Coco starts only after you confirm.`
      ),
      "careful"
    );
    reply.proposal = proposal;
    return reply;
  }

  private requireSession(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) throw new AppError("Coco 打了个盹，请刷新页面再叫醒我。", "SESSION_NOT_FOUND", 404);
    return session;
  }

  private sensitiveValues(session: Session) {
    return [
      this.appConfig.ai.apiKey,
      this.appConfig.game.apiKey,
      this.appConfig.game.accountId,
      this.appConfig.game.accountToken,
      this.appConfig.game.lobbyIg,
      this.appConfig.game.slotIg,
      this.appConfig.game.bingoIg,
      this.appConfig.game.charmedIg,
      this.appConfig.game.fruitIg,
      this.appConfig.game.jetsetIg,
      ...Object.values(session.launchParams)
    ].filter(Boolean);
  }

  private gameContext(launchParams: Record<string, string>) {
    return {
      accountId: resolveGameAccount(this.appConfig, launchParams),
      launchParams
    };
  }
}

export function resolveGameAccount(config: AppConfig, launchParams: Record<string, string>) {
  return launchParams[config.game.accountParam] || config.game.accountId;
}

function userFacingExecutionError(error: unknown, language: Language): AppError {
  if (!(error instanceof AppError)) {
    return new AppError(
      tr(language, "这局没有顺利准备好，Coco 还没有开始。请重新选一次游戏。", "This round was not ready, so Coco did not start. Please choose the game again."),
      "GAME_NOT_READY",
      502
    );
  }

  if (["PLAY_OUTCOME_UNKNOWN", "PLAY_RESULT_UNVERIFIED"].includes(error.code)) {
    return new AppError(
      tr(
        language,
        "这局可能已经开始，但结果暂时没有回来。为了避免重复下注，请不要重试这张确认卡。",
        "This round may have started, but its result has not returned yet. Please do not retry this card, to avoid placing the same bet twice."
      ),
      error.code,
      error.status
    );
  }

  if (["BINGO_BET_NOT_ALLOWED", "CHARMED_BET_NOT_ALLOWED", "FRUIT_BET_NOT_ALLOWED", "JETSET_BET_NOT_ALLOWED"].includes(error.code)) {
    return new AppError(
      tr(
        language,
        "这款游戏当前可选的下注档位刚刚发生了变化，请重新选择游戏和下注金额。",
        "The bet levels currently offered by this game have just changed. Please choose the game and bet amount again."
      ),
      error.code,
      error.status
    );
  }

  if (error.code === "CHARMED_PENDING_FREE_ROUNDS") {
    return new AppError(
      tr(
        language,
        "Charmed 还有奖励局等着完成，Coco 先不开始新的付费局。",
        "Charmed still has bonus rounds waiting to finish, so Coco will not start a new paid round yet."
      ),
      error.code,
      error.status
    );
  }

  const alreadyFriendly = new Set([
    "ACTION_EXPIRED",
    "GAME_DISABLED",
    "SPIN_LIMIT",
    "BET_LIMIT",
    "TOTAL_BET_LIMIT",
    "RATE_LIMITED",
    "DEMO_MODE_REQUIRED",
    "GAME_ACCOUNT_REQUIRED"
  ]);
  if (alreadyFriendly.has(error.code)) return error;

  return new AppError(
    tr(
      language,
      "这局没有顺利准备好，Coco 还没有开始。请重新选一次游戏。",
      "This round was not ready, so Coco did not start. Please choose the game again."
    ),
    error.code,
    error.status
  );
}

function assistant(message: string, mood: AssistantReply["mood"], quickReplies?: AssistantReply["quickReplies"]): AssistantReply {
  return {
    id: randomUUID(),
    role: "assistant",
    message,
    mood,
    createdAt: new Date().toISOString(),
    quickReplies
  };
}

function resolveGame(games: Game[], query: string): Game | undefined {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return games.length === 1 ? games[0] : undefined;
  return games.find((game) =>
    game.id.toLowerCase() === normalized
    || game.name.toLowerCase() === normalized
    || game.id.toLowerCase().includes(normalized)
    || game.name.toLowerCase().includes(normalized)
  );
}

function findMentionedGames(message: string, games: Game[]) {
  const normalized = message.toLowerCase();
  return games.filter((game) =>
    normalized.includes(game.name.toLowerCase())
    || normalized.includes(game.id.toLowerCase())
  );
}

function looksLikeGameListRequest(message: string) {
  return /(?:有哪些|什么游戏|游戏列表|查看游戏|看看游戏|可玩游戏|能玩什么|选择游戏)|(?:what|which).{0,12}games?|(?:game\s+list|view\s+games?|available\s+games?)/i.test(message)
    && !looksLikePlayRequest(message)
    && !looksLikeBetOptionsRequest(message);
}

function looksLikeHelpRequest(message: string) {
  return /(?:怎么用|如何使用|你能做什么|可以做什么|你会什么|有什么功能|玩法帮助|使用帮助)|(?:how\s+(?:do|can)\s+i\s+use|what\s+can\s+you\s+do|what\s+do\s+you\s+do|help)/i.test(message);
}

function isCocoCompanionMessage(message: string) {
  return /^coco[!！?？。.]*$/i.test(message)
    || /来自|来历|出生|住哪|住在|家园|世界观|数字世界|像素岛|数据河|信号星群|信号鲸|碎片集市|传送门|光路|桌面边境|任务栏码头|图标小径|便签原野|缓存云|梦想|愿望|爱好|喜欢|讨厌|害怕|外表|眼睛|羽毛|补丁|吊坠|衣服|造型|围巾|披风|眼镜|水手帽|累|难过|不开心|压力|烦|孤单|无聊/i.test(message)
    || /\b(origin|where\s+do\s+you\s+live|where\s+are\s+you\s+from|home|world|digital\s+world|pixel\s+isles?|data\s+rivers?|signal\s+(?:constellations?|whales?)|fragment\s+bazaar|portals?|light\s+paths?|dreams?|wishes?|hobbies?|favorites?|dislike|afraid|appearance|feathers?|patch|pendant|outfits?|tired|sad|upset|stress|lonely|bored)\b/i.test(message);
}

function looksLikeDeepFollowUp(message: string) {
  return /继续|再讲|展开|详细|深入|为什么|本质|意义|分析|刨根问底|continue|go\s+on|more\s+detail|deeper|in-depth|why|meaning|analy[sz]e/i.test(message);
}

function hasFalseObservationClaim(message: string) {
  return /(?:看着|看到|看见|查看|观察|盯着).{0,10}(?:你的)?(?:桌面|屏幕|动作|周围)|(?:watching|seeing|looking at|observing).{0,24}(?:your\s+)?(?:desktop|screen|actions?|surroundings?)/i.test(message);
}

function conversationDepthReply(seed: string, language: Language) {
  const replies = language === "zh" ? [
    "我们已经沿这条光路走了好一会儿，再往深处我的纽扣眼就要转圈啦。先换口气吧——说说你此刻最想做的一件小事？",
    "这个话题越缝越大了，我怕再讲下去只剩一团空线头。我们先收一针，换个轻松一点的方向吧。",
    "我还想听你说，不过这条路已经走得很深了。我们先回到今天：刚才有没有一件让你笑了一下的事？",
    "信号星群陪我们绕了很远的一圈。先在这里停靠一下吧，要不要换个小故事，或者去看看游戏传送门？"
  ] : [
    "We have followed this path for quite a while, and my button eyes may spin if we go much deeper. Let’s breathe—what is one small thing you want to do right now?",
    "This topic keeps growing with every stitch, and I do not want to leave you with a knot of loose thread. Let’s turn somewhere lighter.",
    "I still want to hear you, but this path has gone rather deep. Let’s return to today—did anything make you smile, even briefly?",
    "The Signal Constellations have taken us on a long loop. Let’s dock here and choose a small story or a game portal."
  ];
  return replies[stableIndex(seed, replies.length)];
}

function gentleRedirectQuickReplies(language: Language) {
  return language === "zh" ? [
    { label: "听个小故事", message: "讲个数字世界的小故事" },
    { label: "看看游戏", message: "有哪些游戏？" }
  ] : [
    { label: "Hear a short story", message: "Tell me a short story from the digital world" },
    { label: "View games", message: "What games are available?" }
  ];
}

function stableIndex(value: string, count: number) {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return count ? hash % count : 0;
}

function parseRequestedSpins(message: string) {
  const match = message.match(/(\d+)\s*(?:局|次|rounds?|spins?)/i);
  return match ? Number(match[1]) : undefined;
}

function parseRequestedBet(message: string) {
  const patterns = [
    /(?:下注(?:档位|金额)?|每局下注|押注)\s*(?:为|到|是|:)?\s*(\d+(?:\.\d+)?)/i,
    /(?:bet(?:\s+(?:level|amount))?|wager)\s*(?:to|at|is|:)?\s*(\d+(?:\.\d+)?)/i
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function parseBetAdjustment(message: string) {
  const patterns = [
    /(?:修改|改|调整)(?:一下)?\s*(?:每局)?(?:下注(?:档位|金额)?|金额|档位)\s*(?:成|为|到|是|:)?\s*(\d+(?:\.\d+)?)/i,
    /(?:把\s*)?(?:每局)?(?:下注(?:档位|金额)?|金额|档位)\s*(?:修改|改|调整)?\s*(?:成|为|到|是|:)\s*(\d+(?:\.\d+)?)/i,
    /(?:改成|改为|调整为|调整到|调到)\s*(\d+(?:\.\d+)?)(?![\d.]|\s*(?:局|次|rounds?|spins?))/i,
    /(?:change|adjust|set)\s+(?:the\s+)?(?:bet|wager)(?:\s+(?:level|amount))?\s+to\s+(\d+(?:\.\d+)?)/i,
    /(?:change|adjust|set)\s+(?:it\s+)?to\s+(\d+(?:\.\d+)?)(?![\d.]|\s*(?:rounds?|spins?|times?))/i
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function looksLikePendingSpinAdjustment(message: string) {
  return /(?:修改|改|调整|设置|变成|玩|来|开始).{0,10}\d+\s*(?:局|次)|\d+\s*(?:局|次).{0,8}(?:吧|开始|玩)/i.test(message)
    || /\b(?:change|adjust|set|make|play|start|do).{0,16}\d+\s*(?:rounds?|spins?|times?)|\d+\s*(?:rounds?|spins?|times?).{0,12}(?:please|instead|now)\b/i.test(message);
}

function looksLikePendingGameChange(message: string) {
  return /(?:修改|改|换|更换|切换|换成|改成|改为).{0,12}(?:游戏|成|为|到)?/i.test(message)
    || /\b(?:change|switch|replace).{0,20}(?:game|to|with)|\binstead\b/i.test(message);
}

function looksLikeBetOptionsRequest(message: string) {
  return /(?:可以|能|可).{0,8}(?:调整|改).{0,8}(?:下注|金额).{0,8}(?:哪些|什么)|(?:下注|投注).{0,8}(?:档位|金额).{0,8}(?:有哪些|是什么|多少|可选)|(?:有哪些|什么|多少).{0,8}(?:下注|投注).{0,8}(?:档位|金额)/i.test(message)
    || /\b(?:what|which).{0,16}(?:bet|wager).{0,8}(?:options?|levels?|amounts?)|(?:what|which).{0,12}(?:options?|levels?|amounts?).{0,8}(?:bet|wager)|(?:change|adjust).{0,12}(?:bet|wager).{0,12}(?:what|which|options?|levels?)/i.test(message);
}

function createBetOptionsReply(
  game: Game,
  currency: string,
  language: Language,
  pendingProposal?: PlayProposal
) {
  const options = game.betOptions ?? [];
  if (options.length === 0) {
    return assistant(
      tr(
        language,
        `${game.name} 当前可选的下注档位范围是 ${game.minBet}–${game.maxBet}。直接告诉我“改成多少”就可以。`,
        `${game.name} currently offers bet levels from ${game.minBet} to ${game.maxBet}. Just tell me the amount you want to change it to.`
      ),
      "idle"
    );
  }
  const multiplier = game.wagerMultiplier ?? 1;
  const mappings = options.map((bet) => {
    const wager = money(bet * multiplier);
    return multiplier === 1
      ? `${money(bet)}`
      : tr(language, `${money(bet)}（实际 ${wager} ${currency}/局）`, `${money(bet)} (${wager} ${currency}/round actual)`);
  });
  return assistant(
    tr(
      language,
      `${game.name} 当前可选的下注档位是：${mappings.join("、")}。点一个档位，或者直接告诉我“改成多少”。`,
      `${game.name} currently offers these bet levels: ${mappings.join(", ")}. Choose one, or tell me the amount you want.`
    ),
    "idle",
    options.map((bet) => ({
      label: multiplier === 1
        ? tr(language, `下注 ${money(bet)}`, `Bet ${money(bet)}`)
        : tr(
          language,
          `${money(bet)} → ${money(bet * multiplier)}/局`,
          `${money(bet)} → ${money(bet * multiplier)}/round`
        ),
      message: pendingProposal
        ? tr(language, `改成 ${money(bet)}`, `Change the bet to ${money(bet)}`)
        : tr(
          language,
          `玩 ${game.name} 1 局，每局下注 ${money(bet)}`,
          `Play ${game.name} for 1 round, bet ${money(bet)} each`
        )
    }))
  );
}

function createBetOptionsChooser(games: Game[], language: Language) {
  return assistant(
    tr(
      language,
      "每款游戏的下注档位不同。先告诉我游戏名称，我会读取它当前可以选择的档位。",
      "Bet levels differ by game. Choose a game and I’ll show the levels currently available."
    ),
    "idle",
    games.slice(0, 5).map((game) => ({
      label: game.name,
      message: tr(
        language,
        `${game.name} 有哪些下注档位？`,
        `What bet levels are available for ${game.name}?`
      )
    }))
  );
}

function validateLimits(config: AppConfig, game: Game, spins: number, betPerSpin: number, language: Language) {
  const maxSpins = maximumSpins(config, game);
  if (!Number.isInteger(spins) || spins < 1 || spins > maxSpins) {
    throw new AppError(tr(language, `单次最多玩 ${maxSpins} 局。`, `You can play at most ${maxSpins} rounds per request.`), "SPIN_LIMIT", 400);
  }
  const wagerPerSpin = money(betPerSpin * (game.wagerMultiplier ?? 1));
  const allowedBet = game.betOptions?.some((option) => money(option) === money(betPerSpin)) ?? (
    betPerSpin >= game.minBet && betPerSpin <= game.maxBet
  );
  if (!allowedBet) {
    const options = game.betOptions?.map((option) => money(option)).join("、");
    throw new AppError(
      tr(
        language,
        options
          ? `${game.name} 当前可选的下注档位是：${options}。`
          : `${game.name} 当前可选的下注档位范围是 ${game.minBet}–${game.maxBet}。`,
        game.betOptions
          ? `${game.name} currently offers these bet levels: ${game.betOptions.map((option) => money(option)).join(", ")}.`
          : `${game.name} currently offers bet levels from ${game.minBet} to ${game.maxBet}.`
      ),
      "BET_LIMIT",
      400
    );
  }
  if (money(spins * wagerPerSpin) > config.limits.maxTotalBet) {
    throw new AppError(tr(language, `一张确认卡的总下注最多是 ${config.limits.maxTotalBet} TOKEN。`, `The total bet on one confirmation card can be at most ${config.limits.maxTotalBet} TOKEN.`), "TOTAL_BET_LIMIT", 400);
  }
}

function maximumSpins(config: AppConfig, game: Game) {
  return Math.min(config.limits.maxSpins, game.maxSpinsPerRequest ?? config.limits.maxSpins);
}

function preferredBet(game: Game) {
  return game.betOptions?.[0] ?? game.minBet;
}

function isAllowedBet(game: Game, betPerSpin: number) {
  return game.betOptions?.some((option) => money(option) === money(betPerSpin)) ?? (
    betPerSpin >= game.minBet && betPerSpin <= game.maxBet
  );
}

function isProposalInputError(error: unknown): error is AppError {
  return error instanceof AppError && error.code === "BET_LIMIT";
}

function createLimitGuidance(error: AppError, game: Game, spins: number, language: Language) {
  const quickReplies = error.code === "BET_LIMIT"
    ? (game.betOptions ?? [game.minBet]).slice(0, 6).map((bet) => ({
        label: tr(language, `下注 ${bet}`, `Bet ${bet}`),
        message: tr(
          language,
          `玩 ${game.name} ${spins} 局，每局下注 ${bet}`,
          `Play ${game.name} for ${spins} rounds, bet ${bet} each`
        )
      }))
    : undefined;
  return assistant(error.message, "careful", quickReplies);
}

function reconcileResult(result: PlayResult, proposal: PlayProposal, language: Language) {
  const spinBet = money(result.spins.reduce((total, spin) => total + spin.bet, 0));
  const spinWin = money(result.spins.reduce((total, spin) => total + spin.win, 0));
  const expectedBet = money(proposal.totalBet);
  if (
    result.gameId !== proposal.game.id
    || result.spins.length !== proposal.spins
    || result.spins.some((spin) => money(spin.bet) !== money(proposal.wagerPerSpin))
    || spinBet !== expectedBet
    || money(result.totalBet) !== expectedBet
    || money(result.totalWin) !== spinWin
    || money(result.net) !== money(result.totalWin - result.totalBet)
    || money(result.balanceAfter) !== money(result.balanceBefore + result.net)
    || result.currency !== proposal.currency
  ) {
    throw new AppError(tr(language, "这次结果没有整理清楚，Coco 先不做总结。", "This result did not come together clearly, so Coco will not summarize it."), "RESULT_RECONCILIATION_FAILED", 502);
  }
}

function summaryIsGrounded(message: string, result: PlayResult): boolean {
  const normalized = message.replace(/,/g, "");
  const required = [
    result.spins.length,
    result.totalBet,
    result.totalWin,
    Math.abs(result.net),
    result.balanceAfter
  ].map(canonicalNumber);
  const mentioned = (normalized.match(/-?\d+(?:\.\d+)?/g) ?? [])
    .map((value) => canonicalNumber(Math.abs(Number(value))));
  if (!required.every((value) => mentioned.includes(value))) return false;

  const allowed = new Set([
    ...required,
    canonicalNumber(result.balanceBefore),
    "0"
  ]);
  return mentioned.every((value) => allowed.has(value));
}

function canonicalNumber(value: number) {
  return String(money(value));
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function trimHistory(history: ChatMessage[]) {
  if (history.length > 30) history.splice(0, history.length - 30);
}

function tr(language: Language, zh: string, en: string) {
  return language === "zh" ? zh : en;
}

function trQuick(language: Language, zhLabel: string, zhMessage: string, enLabel: string, enMessage: string) {
  return language === "zh"
    ? { label: zhLabel, message: zhMessage }
    : { label: enLabel, message: enMessage };
}
