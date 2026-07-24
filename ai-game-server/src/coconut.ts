import { randomUUID } from "node:crypto";
import protobuf from "protobufjs";
import WebSocket, { type RawData } from "ws";
import { z } from "zod";
import type { AppConfig } from "./config";
import type { Game, PlayProgress, PlayResult, SpinOutcome } from "./contracts";
import { AppError } from "./errors";

export type CoconutContext = {
  accountId: string;
  launchParams: Record<string, string>;
};

export type CoconutPlayCommand = CoconutContext & {
  game: Game;
  spins: number;
  betPerSpin: number;
  currency: string;
  idempotencyKey: string;
  onProgress?: (progress: PlayProgress) => void;
};

const lobbyRoot = protobuf.Root.fromJSON({
  nested: {
    User: {
      fields: {
        uid: { type: "string", id: 1 },
        nickname: { type: "string", id: 2 },
        avatar: { type: "string", id: 3 },
        token: { type: "int32", id: 4 }
      }
    },
    Game: {
      fields: {
        id: { type: "int32", id: 1 },
        name: { type: "string", id: 2 },
        icon: { type: "string", id: 3 },
        legacyUrl: { type: "string", id: 4 },
        type: { type: "int32", id: 5 },
        category: { type: "int32", id: 6 },
        players: { type: "int32", id: 7 },
        v: { type: "int32", id: 8 }
      }
    },
    InitReq: { fields: {} },
    InitRet: {
      fields: {
        user: { type: "User", id: 1 },
        gameList: { rule: "repeated", type: "Game", id: 2 }
      }
    }
  }
});

const lobbyGameSchema = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  icon: z.string().url(),
  legacyUrl: z.string().default(""),
  type: z.number().int().default(0),
  category: z.number().int().default(0),
  players: z.number().int().nonnegative().default(0),
  v: z.number().int().nonnegative().default(0)
});

const initDataSchema = z.object({
  token: z.number().finite().nonnegative(),
  lastSelect: z.number().finite().positive().optional(),
  itemScore: z.array(z.object({
    id: z.string(),
    score: z.array(z.number().finite().nonnegative())
  })).optional(),
  tableConfig: z.array(z.object({
    slotType: z.number().int(),
    slotStr: z.string(),
    slotCol: z.number().int().positive()
  })).optional()
}).passthrough();

const playDataSchema = z.object({
  token: z.number().finite().nonnegative(),
  location: z.array(z.number().int()).length(5),
  score: z.number().finite().nonnegative(),
  item: z.union([z.number(), z.string(), z.null()]).optional(),
  itemScore: z.number().finite().nonnegative().optional(),
  itemUUID: z.union([z.string(), z.null()]).optional(),
  winStateList: z.array(z.unknown()),
  responseId: z.string().min(1),
  slotType: z.number().int(),
  table: z.array(z.string()).length(3)
}).passthrough();

type PlayData = z.infer<typeof playDataSchema>;

const bingoCardSchema = z.object({
  cards: z.array(z.number().int().min(1).max(75)).length(15)
    .refine((values) => new Set(values).size === values.length, "Bingo card numbers must be unique"),
  win: z.number().finite().nonnegative()
}).passthrough();

const bingoInitDataSchema = z.object({
  token: z.number().finite().nonnegative(),
  bets: z.array(z.number().finite().positive()).min(1)
}).passthrough();

const bingoPlayDataSchema = z.object({
  token: z.number().finite().nonnegative(),
  totalWin: z.number().finite().nonnegative(),
  balls: z.array(z.number().int().min(1).max(75)).min(1).max(75)
    .refine((values) => new Set(values).size === values.length, "Bingo balls must be unique"),
  cards: z.array(bingoCardSchema).length(4),
  slotType: z.number().int(),
  uuid: z.string().min(1)
}).passthrough();

type BingoPlayData = z.infer<typeof bingoPlayDataSchema>;

const charmedInitDataSchema = z.object({
  token: z.number().finite().nonnegative(),
  freeCount: z.number().int().nonnegative(),
  totalFree: z.number().int().nonnegative(),
  lastSelect: z.number().finite().positive(),
  bets: z.array(z.number().finite().positive()).min(1),
  buyBetTimes: z.number().int().positive(),
  payoutConfig: z.record(z.record(z.number().finite().nonnegative()))
}).passthrough();

const charmedStepSchema = z.object({
  grid: z.array(
    z.array(z.number().int().min(1).max(100)).length(6)
  ).length(6),
  payOut: z.number().finite().nonnegative(),
  clear: z.object({ gp: z.array(z.unknown()) }).passthrough(),
  win: z.number().finite().nonnegative()
}).passthrough();

const charmedPlayDataSchema = z.object({
  token: z.number().finite().nonnegative(),
  freeCount: z.number().int().nonnegative(),
  totalFree: z.number().int().nonnegative(),
  totalWin: z.number().finite().nonnegative(),
  step: z.array(charmedStepSchema).min(1),
  slotType: z.number().int(),
  uuid: z.string().min(1),
  totalPayOut: z.number().finite().nonnegative()
}).passthrough();

type CharmedPlayData = z.infer<typeof charmedPlayDataSchema>;

const fruitInitDataSchema = z.object({
  token: z.number().finite().nonnegative(),
  lastSelect: z.number().finite().positive(),
  pool: z.number().finite().nonnegative(),
  x: z.array(z.number().finite().positive()).min(1),
  bets: z.array(z.number().finite().positive()).min(1),
  tableConfig: z.array(z.object({
    slotType: z.number().int().positive(),
    slotStr: z.string().min(1),
    slotCol: z.number().int().positive()
  }).passthrough()).min(1)
}).passthrough();

const fruitPlayDataSchema = z.object({
  win: z.number().finite().nonnegative(),
  sel: z.array(z.number().int().nonnegative()).length(3),
  token: z.number().finite().nonnegative(),
  pool: z.number().finite().nonnegative(),
  responseId: z.string().min(1),
  slotType: z.number().int().positive(),
  table: z.array(z.array(z.number().int()).length(3)),
  isBig: z.boolean()
}).passthrough();

type FruitPlayData = z.infer<typeof fruitPlayDataSchema>;

const jetsetInitDataSchema = z.object({
  token: z.number().finite().nonnegative(),
  itemScore: z.array(z.object({
    id: z.string().min(1),
    score: z.array(z.number().finite().nonnegative()).length(3)
  }).passthrough()).min(1),
  lastSelect: z.number().finite().positive(),
  bets: z.array(z.number().finite().positive()).min(1),
  tableConfig: z.array(z.object({
    slotType: z.number().int().positive(),
    slotStr: z.string().min(1),
    slotCol: z.literal(5)
  }).passthrough()).min(1)
}).passthrough();

const jetsetPlayDataSchema = z.object({
  token: z.number().finite().nonnegative(),
  location: z.array(z.number().int().nonnegative()).length(5),
  score: z.number().finite().nonnegative(),
  winStateList: z.array(z.object({
    index: z.number().int().nonnegative(),
    line: z.number().int().nonnegative(),
    id: z.number().int().nonnegative()
  }).passthrough()),
  responseId: z.string().min(1),
  slotType: z.number().int().positive(),
  table: z.array(z.string()).length(3)
}).passthrough();

type JetSetPlayData = z.infer<typeof jetsetPlayDataSchema>;

const GAME_SLOTS_ID = "6001";
const BINGO_ID = "6036";
const CHARMED_ID = "6037";
const FRUIT_ID = "6007";
const JETSET_ID = "6014";
const SUPPORTED_PLAY_IDS = new Set([GAME_SLOTS_ID, BINGO_ID, CHARMED_ID, FRUIT_ID, JETSET_ID]);

export class CoconutGameAdapter {
  private readonly cache = new Map<string, { expiresAt: number; games: Game[] }>();

  constructor(private readonly gameConfig: AppConfig["game"]) {}

  async listGames(context: CoconutContext): Promise<Game[]> {
    this.requireAccount(context.accountId);
    const lobbyIg = this.resolveLobbyIg(context.launchParams.ig);
    const cacheKey = `${context.accountId}\u0000${lobbyIg}\u0000${context.launchParams.roomId ?? ""}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.games.map((game) => ({ ...game }));

    const loginUrl = new URL(joinUrl(this.gameConfig.lobbyBaseUrl, this.gameConfig.lobbyLoginPath));
    loginUrl.search = new URLSearchParams({
      uid: context.accountId,
      room: context.launchParams.roomId ?? "",
      type: context.launchParams.type ?? context.launchParams.roomType ?? "",
      ig: lobbyIg
    }).toString();
    const socketUrl = await this.fetchLobbySocket(loginUrl);
    const decoded = await this.requestLobbyInit(socketUrl);
    const games = mapLobbyGames(decoded, this.gameConfig.playableIds, this.gameConfig.wagerMultiplier);
    this.cache.set(cacheKey, { expiresAt: Date.now() + 60_000, games });
    return games.map((game) => ({ ...game }));
  }

  async prepareGame(game: Game, context: CoconutContext): Promise<Game> {
    this.requireAccount(context.accountId);
    let betOptions = game.betOptions;
    if (game.id === BINGO_ID) {
      if (!this.gameConfig.bingoIg) throw new AppError("Bingo 这扇传送门还没准备好。", "BINGO_IG_REQUIRED", 503);
      const initial = bingoInitDataSchema.parse(
        await this.postSlot(this.gameConfig.bingoInitPath, this.bingoRequestBody(context), false)
      );
      betOptions = initial.bets;
    } else if (game.id === CHARMED_ID) {
      if (!this.gameConfig.charmedIg) throw new AppError("Charmed 这扇传送门还没准备好。", "CHARMED_IG_REQUIRED", 503);
      const initial = charmedInitDataSchema.parse(
        await this.postSlot(this.gameConfig.charmedInitPath, this.charmedRequestBody(context), false)
      );
      betOptions = initial.bets;
    } else if (game.id === FRUIT_ID) {
      if (!this.gameConfig.fruitIg) throw new AppError("FruitSpin 这扇传送门还没准备好。", "FRUIT_IG_REQUIRED", 503);
      const initial = fruitInitDataSchema.parse(
        await this.postSlot(this.gameConfig.fruitInitPath, this.fruitRequestBody(context), false)
      );
      betOptions = initial.bets;
    } else if (game.id === JETSET_ID) {
      if (!this.gameConfig.jetsetIg) throw new AppError("JetSet 这扇传送门还没准备好。", "JETSET_IG_REQUIRED", 503);
      const initial = jetsetInitDataSchema.parse(
        await this.postSlot(this.gameConfig.jetsetInitPath, this.jetsetRequestBody(context), false)
      );
      betOptions = initial.bets;
    }
    const normalizedOptions = [...new Set((betOptions ?? []).map(money))].filter((bet) => bet > 0);
    if (normalizedOptions.length === 0) return { ...game };
    return {
      ...game,
      minBet: Math.min(...normalizedOptions),
      maxBet: Math.max(...normalizedOptions),
      betOptions: normalizedOptions
    };
  }

  async play(command: CoconutPlayCommand): Promise<PlayResult> {
    this.requireAccount(command.accountId);
    if (!this.gameConfig.playableIds.includes(command.game.id) || command.game.playable === false) {
      throw new AppError("这扇游戏传送门还没准备好。", "GAME_NOT_PLAYABLE", 409);
    }
    if (!SUPPORTED_PLAY_IDS.has(command.game.id)) {
      throw new AppError("这款游戏目前还不能从这里进入。", "GAME_ADAPTER_NOT_VERIFIED", 409);
    }
    if (command.game.id === BINGO_ID) return this.playBingo(command);
    if (command.game.id === CHARMED_ID) return this.playCharmed(command);
    if (command.game.id === FRUIT_ID) return this.playFruit(command);
    if (command.game.id === JETSET_ID) return this.playJetSet(command);
    if (!this.gameConfig.slotIg) {
      throw new AppError("GameSlots 这扇传送门还没准备好。", "SLOT_IG_REQUIRED", 503);
    }

    const requestBody = this.slotRequestBody(command);
    const initial = await this.postSlot(this.gameConfig.initPath, requestBody, false);
    const balanceBefore = initDataSchema.parse(initial).token;
    let playAttempted = false;
    try {
      let currentBalance = balanceBefore;
      const spins: SpinOutcome[] = [];
      const responseIds: string[] = [];

      for (let index = 1; index <= command.spins; index += 1) {
        playAttempted = true;
        const raw = await this.postSlot(
          this.gameConfig.playPath,
          { token: command.betPerSpin, ...requestBody },
          true
        );
        const round = reconcileCoconutRound({
          balanceBefore: currentBalance,
          apiToken: command.betPerSpin,
          wagerMultiplier: this.gameConfig.wagerMultiplier,
          data: playDataSchema.parse(raw),
          index
        });
        spins.push(round.spin);
        responseIds.push(round.responseId);
        currentBalance = round.balanceAfter;
        emitProgress(command, spins, currentBalance);
      }

      const finalInit = await this.postSlot(this.gameConfig.initPath, requestBody, false);
      const confirmedBalance = initDataSchema.parse(finalInit).token;
      if (money(confirmedBalance) !== money(currentBalance)) {
        throw new AppError("最后的余额没有对上，我先不描述这局，免得把数字说错。", "COCONUT_FINAL_BALANCE_MISMATCH", 502);
      }

      const totalBet = money(spins.reduce((sum, spin) => sum + spin.bet, 0));
      const totalWin = money(spins.reduce((sum, spin) => sum + spin.win, 0));
      return {
        transactionId: responseIds.length ? `coconut:${responseIds.join(".")}` : `coconut:${randomUUID()}`,
        gameId: command.game.id,
        gameName: command.game.name,
        spins,
        totalBet,
        totalWin,
        net: money(totalWin - totalBet),
        balanceBefore,
        balanceAfter: confirmedBalance,
        currency: command.currency
      };
    } catch (error) {
      if (!playAttempted) throw error;
      if (error instanceof AppError && error.code === "PLAY_OUTCOME_UNKNOWN") throw error;
      throw new AppError(
        "这一局已经开始，但结果没有完整回来。为了避免重复下注，这张确认卡不能再试；请先重新查看余额。",
        "PLAY_RESULT_UNVERIFIED",
        502
      );
    }
  }

  private async playBingo(command: CoconutPlayCommand): Promise<PlayResult> {
    if (!this.gameConfig.bingoIg) {
      throw new AppError("Bingo 这扇传送门还没准备好。", "BINGO_IG_REQUIRED", 503);
    }
    const requestBody = this.bingoRequestBody(command);
    const initial = bingoInitDataSchema.parse(
      await this.postSlot(this.gameConfig.bingoInitPath, requestBody, false)
    );
    if (!initial.bets.some((bet) => money(bet) === money(command.betPerSpin))) {
      throw new AppError(
        `Bingo 目前可以选择这些下注金额：${initial.bets.join("、")}。`,
        "BINGO_BET_NOT_ALLOWED",
        409
      );
    }

    const balanceBefore = initial.token;
    let playAttempted = false;
    try {
      let currentBalance = balanceBefore;
      const spins: SpinOutcome[] = [];
      const responseIds: string[] = [];

      for (let index = 1; index <= command.spins; index += 1) {
        playAttempted = true;
        const raw = await this.postSlot(
          this.gameConfig.bingoPlayPath,
          {
            token: command.betPerSpin,
            type: "",
            auto: 0,
            card: 4,
            ...requestBody
          },
          true
        );
        const round = reconcileBingoRound({
          balanceBefore: currentBalance,
          apiToken: command.betPerSpin,
          cardCount: 4,
          data: bingoPlayDataSchema.parse(raw),
          index
        });
        spins.push(round.spin);
        responseIds.push(round.responseId);
        currentBalance = round.balanceAfter;
        emitProgress(command, spins, currentBalance);
      }

      const finalInit = bingoInitDataSchema.parse(
        await this.postSlot(this.gameConfig.bingoInitPath, requestBody, false)
      );
      if (money(finalInit.token) !== money(currentBalance)) {
        throw new AppError(
          "Bingo 最后的余额没有对上，我先不描述这局，免得把数字说错。",
          "COCONUT_FINAL_BALANCE_MISMATCH",
          502
        );
      }

      const totalBet = money(spins.reduce((sum, spin) => sum + spin.bet, 0));
      const totalWin = money(spins.reduce((sum, spin) => sum + spin.win, 0));
      return {
        transactionId: responseIds.length ? `coconut:bingo:${responseIds.join(".")}` : `coconut:bingo:${randomUUID()}`,
        gameId: command.game.id,
        gameName: command.game.name,
        spins,
        totalBet,
        totalWin,
        net: money(totalWin - totalBet),
        balanceBefore,
        balanceAfter: finalInit.token,
        currency: command.currency
      };
    } catch (error) {
      if (!playAttempted) throw error;
      if (error instanceof AppError && error.code === "PLAY_OUTCOME_UNKNOWN") throw error;
      throw new AppError(
        "Bingo 这一局已经开始，但结果没有完整回来。为了避免重复下注，这张确认卡不能再试；请先重新查看余额。",
        "PLAY_RESULT_UNVERIFIED",
        502
      );
    }
  }

  private async playCharmed(command: CoconutPlayCommand): Promise<PlayResult> {
    if (!this.gameConfig.charmedIg) {
      throw new AppError("Charmed 这扇传送门还没准备好。", "CHARMED_IG_REQUIRED", 503);
    }
    if (command.spins !== 1) {
      throw new AppError(
        "Charmed 目前每次只能玩 1 局。",
        "CHARMED_SINGLE_ROUND_ONLY",
        409
      );
    }
    const requestBody = this.charmedRequestBody(command);
    const initial = charmedInitDataSchema.parse(
      await this.postSlot(this.gameConfig.charmedInitPath, requestBody, false)
    );
    if (initial.freeCount !== 0 || initial.totalFree !== 0) {
      throw new AppError(
        "Charmed 还有尚未结束的免费局，我先停在这里，避免把它误算成付费局。",
        "CHARMED_PENDING_FREE_ROUNDS",
        409
      );
    }
    if (!initial.bets.some((bet) => money(bet) === money(command.betPerSpin))) {
      throw new AppError(
        `Charmed 目前可以选择这些下注金额：${initial.bets.join("、")}。`,
        "CHARMED_BET_NOT_ALLOWED",
        409
      );
    }

    let playAttempted = false;
    try {
      playAttempted = true;
      const raw = await this.postSlot(
        this.gameConfig.charmedPlayPath,
        {
          token: command.betPerSpin,
          type: "",
          auto: 0,
          ...requestBody
        },
        true
      );
      const round = reconcileCharmedRound({
        balanceBefore: initial.token,
        apiToken: command.betPerSpin,
        data: charmedPlayDataSchema.parse(raw),
        index: 1
      });
      const finalInit = charmedInitDataSchema.parse(
        await this.postSlot(this.gameConfig.charmedInitPath, requestBody, false)
      );
      if (
        money(finalInit.token) !== money(round.balanceAfter)
        || finalInit.freeCount !== round.freeCount
        || finalInit.totalFree !== round.totalFree
      ) {
        throw new AppError(
          "Charmed 最后的余额或免费局状态没有对上，我先不描述这局，免得把数字说错。",
          "COCONUT_FINAL_STATE_MISMATCH",
          502
        );
      }

      return {
        transactionId: `coconut:charmed:${round.responseId}`,
        gameId: command.game.id,
        gameName: command.game.name,
        spins: [round.spin],
        totalBet: round.spin.bet,
        totalWin: round.spin.win,
        net: money(round.spin.win - round.spin.bet),
        balanceBefore: initial.token,
        balanceAfter: finalInit.token,
        currency: command.currency
      };
    } catch (error) {
      if (!playAttempted) throw error;
      if (error instanceof AppError && error.code === "PLAY_OUTCOME_UNKNOWN") throw error;
      throw new AppError(
        "Charmed 这一局已经开始，但结果没有完整回来。为了避免重复下注，这张确认卡不能再试；请先重新查看余额。",
        "PLAY_RESULT_UNVERIFIED",
        502
      );
    }
  }

  private async playFruit(command: CoconutPlayCommand): Promise<PlayResult> {
    if (!this.gameConfig.fruitIg) {
      throw new AppError("FruitSpin 这扇传送门还没准备好。", "FRUIT_IG_REQUIRED", 503);
    }
    const requestBody = this.fruitRequestBody(command);
    const initial = fruitInitDataSchema.parse(
      await this.postSlot(this.gameConfig.fruitInitPath, requestBody, false)
    );
    if (!initial.bets.some((bet) => money(bet) === money(command.betPerSpin))) {
      throw new AppError(
        `FruitSpin 目前可以选择这些下注金额：${initial.bets.join("、")}。`,
        "FRUIT_BET_NOT_ALLOWED",
        409
      );
    }

    let playAttempted = false;
    try {
      let currentBalance = initial.token;
      let currentPool = initial.pool;
      const spins: SpinOutcome[] = [];
      const responseIds: string[] = [];
      for (let index = 1; index <= command.spins; index += 1) {
        playAttempted = true;
        const raw = await this.postSlot(
          this.gameConfig.fruitPlayPath,
          { token: command.betPerSpin, type: 1, ...requestBody },
          true
        );
        const round = reconcileFruitRound({
          balanceBefore: currentBalance,
          apiToken: command.betPerSpin,
          requestedType: 1,
          data: fruitPlayDataSchema.parse(raw),
          index
        });
        currentBalance = round.balanceAfter;
        currentPool = round.poolAfter;
        spins.push(round.spin);
        responseIds.push(round.responseId);
        emitProgress(command, spins, currentBalance);
      }

      const finalInit = fruitInitDataSchema.parse(
        await this.postSlot(this.gameConfig.fruitInitPath, requestBody, false)
      );
      if (
        money(finalInit.token) !== money(currentBalance)
        || money(finalInit.pool) !== money(currentPool)
      ) {
        throw new AppError(
          "FruitSpin 最后的余额或奖池没有对上，我先不描述这局，免得把数字说错。",
          "COCONUT_FINAL_STATE_MISMATCH",
          502
        );
      }
      const totalBet = money(spins.reduce((sum, spin) => sum + spin.bet, 0));
      const totalWin = money(spins.reduce((sum, spin) => sum + spin.win, 0));
      return {
        transactionId: `coconut:fruit:${responseIds.join(".")}`,
        gameId: command.game.id,
        gameName: command.game.name,
        spins,
        totalBet,
        totalWin,
        net: money(totalWin - totalBet),
        balanceBefore: initial.token,
        balanceAfter: finalInit.token,
        currency: command.currency
      };
    } catch (error) {
      if (!playAttempted) throw error;
      if (error instanceof AppError && error.code === "PLAY_OUTCOME_UNKNOWN") throw error;
      throw new AppError(
        "FruitSpin 这一局已经开始，但结果没有完整回来。为了避免重复下注，这张确认卡不能再试；请先重新查看余额。",
        "PLAY_RESULT_UNVERIFIED",
        502
      );
    }
  }

  private async playJetSet(command: CoconutPlayCommand): Promise<PlayResult> {
    if (!this.gameConfig.jetsetIg) {
      throw new AppError("JetSet 这扇传送门还没准备好。", "JETSET_IG_REQUIRED", 503);
    }
    const requestBody = this.jetsetRequestBody(command);
    const initial = jetsetInitDataSchema.parse(
      await this.postSlot(this.gameConfig.jetsetInitPath, requestBody, false)
    );
    if (!initial.bets.some((bet) => money(bet) === money(command.betPerSpin))) {
      throw new AppError(
        `JetSet 目前可以选择这些下注金额：${initial.bets.join("、")}。`,
        "JETSET_BET_NOT_ALLOWED",
        409
      );
    }

    let playAttempted = false;
    try {
      let currentBalance = initial.token;
      const spins: SpinOutcome[] = [];
      const responseIds: string[] = [];
      for (let index = 1; index <= command.spins; index += 1) {
        playAttempted = true;
        const raw = await this.postSlot(
          this.gameConfig.jetsetPlayPath,
          { token: command.betPerSpin, ...requestBody },
          true
        );
        const round = reconcileJetSetRound({
          balanceBefore: currentBalance,
          apiToken: command.betPerSpin,
          requestedType: 1,
          data: jetsetPlayDataSchema.parse(raw),
          index
        });
        currentBalance = round.balanceAfter;
        spins.push(round.spin);
        responseIds.push(round.responseId);
        emitProgress(command, spins, currentBalance);
      }

      const finalInit = jetsetInitDataSchema.parse(
        await this.postSlot(this.gameConfig.jetsetInitPath, requestBody, false)
      );
      if (money(finalInit.token) !== money(currentBalance)) {
        throw new AppError(
          "JetSet 最后的余额没有对上，我先不描述这局，免得把数字说错。",
          "COCONUT_FINAL_BALANCE_MISMATCH",
          502
        );
      }
      const totalBet = money(spins.reduce((sum, spin) => sum + spin.bet, 0));
      const totalWin = money(spins.reduce((sum, spin) => sum + spin.win, 0));
      return {
        transactionId: `coconut:jetset:${responseIds.join(".")}`,
        gameId: command.game.id,
        gameName: command.game.name,
        spins,
        totalBet,
        totalWin,
        net: money(totalWin - totalBet),
        balanceBefore: initial.token,
        balanceAfter: finalInit.token,
        currency: command.currency
      };
    } catch (error) {
      if (!playAttempted) throw error;
      if (error instanceof AppError && error.code === "PLAY_OUTCOME_UNKNOWN") throw error;
      throw new AppError(
        "JetSet 这一局已经开始，但结果没有完整回来。为了避免重复下注，这张确认卡不能再试；请先重新查看余额。",
        "PLAY_RESULT_UNVERIFIED",
        502
      );
    }
  }

  private resolveLobbyIg(addressIg?: string) {
    const configured = this.gameConfig.lobbyIg.trim();
    const supplied = addressIg?.trim() ?? "";
    if (configured && supplied && configured !== supplied) {
      throw new AppError("这个入口带来的游戏凭证不匹配，暂时不能进入游戏。", "LOBBY_IG_MISMATCH", 403);
    }
    const lobbyIg = configured || supplied;
    if (!lobbyIg) throw new AppError("这个入口缺少游戏凭证，请从正确的游戏入口重新打开。", "LOBBY_IG_REQUIRED", 503);
    return lobbyIg;
  }

  private requireAccount(accountId: string) {
    if (!accountId) throw new AppError("这个入口缺少游戏身份，请从正确的游戏入口重新打开。", "GAME_ACCOUNT_REQUIRED", 503);
  }

  private slotRequestBody(command: CoconutContext) {
    return {
      userId: command.accountId,
      roomId: command.launchParams.roomId ?? "",
      roomType: parseRoomType(command.launchParams.roomType ?? command.launchParams.type),
      ig: this.gameConfig.slotIg
    };
  }

  private bingoRequestBody(command: CoconutContext) {
    return {
      uid: command.accountId,
      roomId: command.launchParams.roomId ?? "",
      roomType: parseRoomType(command.launchParams.roomType ?? command.launchParams.type),
      ig: this.gameConfig.bingoIg
    };
  }

  private charmedRequestBody(command: CoconutContext) {
    return {
      uid: command.accountId,
      roomId: command.launchParams.roomId ?? "",
      roomType: parseRoomType(command.launchParams.roomType ?? command.launchParams.type),
      ig: this.gameConfig.charmedIg
    };
  }

  private fruitRequestBody(command: CoconutContext) {
    return {
      uid: command.accountId,
      roomId: command.launchParams.roomId ?? "",
      roomType: parseRoomType(command.launchParams.roomType ?? command.launchParams.type),
      ig: this.gameConfig.fruitIg
    };
  }

  private jetsetRequestBody(command: CoconutContext) {
    return {
      uid: command.accountId,
      roomId: command.launchParams.roomId ?? "",
      roomType: parseRoomType(command.launchParams.roomType ?? command.launchParams.type),
      ig: this.gameConfig.jetsetIg
    };
  }

  private async fetchLobbySocket(url: URL) {
    const response = await fetchWithTimeout(url, {
      headers: {
        accept: "*/*",
        origin: this.gameConfig.origin,
        referer: `${this.gameConfig.origin}/`
      }
    }, this.gameConfig.timeoutMs);
    const text = (await response.text()).trim();
    if (!response.ok || !/^wss?:\/\//i.test(text)) {
      throw new AppError("暂时没能打开游戏列表，请确认从正确的游戏入口进入。", "LOBBY_LOGIN_FAILED", 502);
    }
    return text;
  }

  private requestLobbyInit(socketUrl: string): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(socketUrl, {
        origin: this.gameConfig.origin,
        handshakeTimeout: this.gameConfig.timeoutMs
      });
      const timeout = setTimeout(() => {
        socket.terminate();
        reject(new AppError("游戏列表醒得有点慢，请稍后再试。", "LOBBY_TIMEOUT", 504));
      }, this.gameConfig.timeoutMs);
      const finish = (task: () => void) => {
        clearTimeout(timeout);
        try { socket.close(); } catch {}
        task();
      };

      socket.once("open", () => socket.send(encodeLobbyRequest("InitReq")));
      socket.on("message", (data) => {
        try {
          const frame = decodeLobbyFrame(webSocketBuffer(data));
          if (frame.name !== "InitRet") return;
          if (frame.status !== 0) {
            finish(() => reject(new AppError("暂时没能打开游戏列表，请稍后再试。", "LOBBY_INIT_FAILED", 502)));
            return;
          }
          const type = lobbyRoot.lookupType("InitRet");
          const decoded = type.toObject(type.decode(frame.payload), { defaults: true });
          finish(() => resolve(decoded));
        } catch (error) {
          finish(() => reject(error));
        }
      });
      socket.once("error", () => finish(() => reject(new AppError("游戏列表暂时迷路了，请稍后再试。", "LOBBY_UNAVAILABLE", 502))));
    });
  }

  private async postSlot(path: string, body: Record<string, unknown>, outcomeCanBeUnknown: boolean) {
    try {
      const response = await fetchWithTimeout(joinUrl(this.gameConfig.baseUrl, path), {
        method: "POST",
        headers: {
          accept: "*/*",
          "content-type": "application/json",
          origin: this.gameConfig.origin,
          referer: `${this.gameConfig.origin}/`,
          ...(this.gameConfig.apiKey ? { authorization: `Bearer ${this.gameConfig.apiKey}` } : {})
        },
        body: JSON.stringify(body)
      }, this.gameConfig.timeoutMs);
      const payload = await response.json() as unknown;
      if (!response.ok) throw new AppError("游戏传送门暂时没有回应。", "COCONUT_HTTP_ERROR", 502);
      const envelope = z.object({ code: z.number().int(), data: z.unknown() }).parse(payload);
      if (envelope.code !== 0) throw new AppError("这次没有成功进入游戏，请稍后再试。", "COCONUT_API_REJECTED", 409);
      return envelope.data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (outcomeCanBeUnknown) {
        throw new AppError(
          "这一局的结果没有完整回来。为了避免重复下注，这张确认卡不能再试；请先重新查看余额。",
          "PLAY_OUTCOME_UNKNOWN",
          502
        );
      }
      throw new AppError("游戏传送门暂时连不上，请稍后再试。", "COCONUT_UNAVAILABLE", 502);
    }
  }
}

function emitProgress(command: CoconutPlayCommand, spins: SpinOutcome[], balanceAfter: number) {
  if (!command.onProgress || spins.length % 5 !== 0) return;
  const totalBet = money(spins.reduce((sum, spin) => sum + spin.bet, 0));
  const totalWin = money(spins.reduce((sum, spin) => sum + spin.win, 0));
  command.onProgress({
    gameId: command.game.id,
    gameName: command.game.name,
    completedSpins: spins.length,
    totalSpins: command.spins,
    totalBet,
    totalWin,
    net: money(totalWin - totalBet),
    balanceAfter: money(balanceAfter),
    currency: command.currency
  });
}

export function mapLobbyGames(
  decoded: unknown,
  playableIds: readonly string[],
  wagerMultiplier: number
): Game[] {
  const payload = z.object({ gameList: z.array(lobbyGameSchema) }).parse(decoded);
  const playable = new Set(playableIds);
  return payload.gameList.map((item) => {
    const id = String(item.id);
    const canPlay = playable.has(id) && SUPPORTED_PLAY_IDS.has(id);
    const protocol = id === BINGO_ID
      ? { minBet: 10, maxBet: 1_000, betOptions: [10, 50, 100, 200, 500, 1_000], wagerMultiplier: 4 }
      : id === CHARMED_ID
        ? { minBet: 10, maxBet: 1_000, betOptions: [10, 50, 100, 500, 1_000], wagerMultiplier: 1 }
        : id === FRUIT_ID
          ? { minBet: 10, maxBet: 5_000, betOptions: [10, 30, 50, 90, 120, 200, 500, 1_000, 2_000, 4_000, 5_000], wagerMultiplier: 1 }
          : id === JETSET_ID
            ? { minBet: 10, maxBet: 1_000, betOptions: [10, 50, 100, 500, 1_000], wagerMultiplier: 1 }
      : { minBet: 1, maxBet: 10, betOptions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], wagerMultiplier };
    return {
      id,
      name: item.name,
      provider: "Coconut",
      enabled: true,
      playable: canPlay,
      minBet: protocol.minBet,
      maxBet: protocol.maxBet,
      betOptions: canPlay ? protocol.betOptions : undefined,
      maxSpinsPerRequest: id === CHARMED_ID ? 1 : undefined,
      wagerMultiplier: canPlay ? protocol.wagerMultiplier : 1,
      iconUrl: item.icon,
      type: item.type,
      category: item.category,
      players: item.players,
      version: item.v,
      theme: inferTheme(item.name)
    };
  });
}

export function reconcileCoconutRound(input: {
  balanceBefore: number;
  apiToken: number;
  wagerMultiplier: number;
  data: PlayData;
  index: number;
}) {
  const wager = money(input.apiToken * input.wagerMultiplier);
  const win = money(input.data.score);
  const expectedBalance = money(input.balanceBefore - wager + win);
  const balanceAfter = money(input.data.token);
  if (balanceAfter !== expectedBalance) {
    throw new AppError("这局的下注、赢得和余额没有对上，我先不描述结果。", "COCONUT_BALANCE_MISMATCH", 502);
  }
  const rows = input.data.table.map((row) => row.split(",").map((value) => value.trim()).filter(Boolean));
  if (rows.some((row) => row.length !== 5 || row.some((symbol) => !/^\d+$/.test(symbol)))) {
    throw new AppError("这局的图案结果不完整，我先不描述结果。", "COCONUT_TABLE_INVALID", 502);
  }
  return {
    responseId: input.data.responseId,
    balanceAfter,
    spin: {
      index: input.index,
      symbols: rows.map((row) => row.join("·")),
      bet: wager,
      win
    } satisfies SpinOutcome
  };
}

export function reconcileBingoRound(input: {
  balanceBefore: number;
  apiToken: number;
  cardCount: number;
  data: BingoPlayData;
  index: number;
}) {
  if (input.data.cards.length !== input.cardCount) {
    throw new AppError("Bingo 这局的卡片数量没有对上，我先不描述结果。", "BINGO_CARD_COUNT_MISMATCH", 502);
  }
  const wager = money(input.apiToken * input.cardCount);
  const cardWin = money(input.data.cards.reduce((sum, card) => sum + card.win, 0));
  const totalWin = money(input.data.totalWin);
  if (cardWin !== totalWin) {
    throw new AppError("Bingo 这局各张卡片的赢得与总赢得没有对上，我先不描述结果。", "BINGO_WIN_MISMATCH", 502);
  }
  const expectedBalance = money(input.balanceBefore - wager + totalWin);
  const balanceAfter = money(input.data.token);
  if (balanceAfter !== expectedBalance) {
    throw new AppError("Bingo 这局的下注、赢得和余额没有对上，我先不描述结果。", "BINGO_BALANCE_MISMATCH", 502);
  }
  return {
    responseId: input.data.uuid,
    balanceAfter,
    spin: {
      index: input.index,
      symbols: input.data.cards.map((card, cardIndex) => `Card ${cardIndex + 1}: ${money(card.win)}`),
      bet: wager,
      win: totalWin
    } satisfies SpinOutcome
  };
}

export function reconcileCharmedRound(input: {
  balanceBefore: number;
  apiToken: number;
  data: CharmedPlayData;
  index: number;
}) {
  const wager = money(input.apiToken);
  const stepWin = money(input.data.step.reduce((sum, step) => sum + step.win, 0));
  const totalWin = money(input.data.totalWin);
  if (stepWin !== totalWin) {
    throw new AppError("Charmed 这局各次连消的赢得与总赢得没有对上，我先不描述结果。", "CHARMED_WIN_MISMATCH", 502);
  }
  const stepPayOut = money(input.data.step.reduce((sum, step) => sum + step.payOut, 0));
  if (stepPayOut !== money(input.data.totalPayOut)) {
    throw new AppError("Charmed 这局各次连消的数字没有对上，我先不描述结果。", "CHARMED_PAYOUT_MISMATCH", 502);
  }
  const expectedBalance = money(input.balanceBefore - wager + totalWin);
  const balanceAfter = money(input.data.token);
  if (balanceAfter !== expectedBalance) {
    throw new AppError("Charmed 这局的下注、赢得和余额没有对上，我先不描述结果。", "CHARMED_BALANCE_MISMATCH", 502);
  }
  const lastGrid = input.data.step.at(-1)?.grid;
  if (!lastGrid) {
    throw new AppError("Charmed 这局最后的图案不完整，我先不描述结果。", "CHARMED_GRID_MISSING", 502);
  }
  return {
    responseId: input.data.uuid,
    balanceAfter,
    freeCount: input.data.freeCount,
    totalFree: input.data.totalFree,
    spin: {
      index: input.index,
      symbols: lastGrid.map((row) => row.join("·")),
      bet: wager,
      win: totalWin
    } satisfies SpinOutcome
  };
}

export function reconcileFruitRound(input: {
  balanceBefore: number;
  apiToken: number;
  requestedType: number;
  data: FruitPlayData;
  index: number;
}) {
  if (input.data.slotType !== input.requestedType) {
    throw new AppError("FruitSpin 这局的玩法与选择没有对上，我先不描述结果。", "FRUIT_TYPE_MISMATCH", 502);
  }
  const wager = money(input.apiToken);
  const win = money(input.data.win);
  const expectedBalance = money(input.balanceBefore - wager + win);
  const balanceAfter = money(input.data.token);
  if (balanceAfter !== expectedBalance) {
    throw new AppError("FruitSpin 这局的下注、赢得和余额没有对上，我先不描述结果。", "FRUIT_BALANCE_MISMATCH", 502);
  }
  return {
    responseId: input.data.responseId,
    balanceAfter,
    poolAfter: money(input.data.pool),
    spin: {
      index: input.index,
      symbols: input.data.sel.map((position) => `Stop ${position}`),
      bet: wager,
      win
    } satisfies SpinOutcome
  };
}

export function reconcileJetSetRound(input: {
  balanceBefore: number;
  apiToken: number;
  requestedType: number;
  data: JetSetPlayData;
  index: number;
}) {
  if (input.data.slotType !== input.requestedType) {
    throw new AppError("JetSet 这局的玩法与选择没有对上，我先不描述结果。", "JETSET_TYPE_MISMATCH", 502);
  }
  const wager = money(input.apiToken);
  const win = money(input.data.score);
  const expectedBalance = money(input.balanceBefore - wager + win);
  const balanceAfter = money(input.data.token);
  if (balanceAfter !== expectedBalance) {
    throw new AppError("JetSet 这局的下注、赢得和余额没有对上，我先不描述结果。", "JETSET_BALANCE_MISMATCH", 502);
  }
  const rows = input.data.table.map((row) =>
    row.split(",").map((value) => value.trim()).filter(Boolean)
  );
  if (rows.some((row) => row.length !== 5 || row.some((symbol) => !/^\d+$/.test(symbol)))) {
    throw new AppError("JetSet 这局的图案结果不完整，我先不描述结果。", "JETSET_TABLE_INVALID", 502);
  }
  return {
    responseId: input.data.responseId,
    balanceAfter,
    spin: {
      index: input.index,
      symbols: rows.map((row) => row.join("·")),
      bet: wager,
      win
    } satisfies SpinOutcome
  };
}

export function encodeLobbyRequest(name: string) {
  const type = lobbyRoot.lookupType(name);
  const payload = Buffer.from(type.encode(type.create({})).finish());
  const encodedName = Buffer.from(name, "utf8");
  if (encodedName.length > 255) throw new AppError("Lobby 消息名过长。", "LOBBY_PROTOCOL_ERROR", 500);
  let timestamp = Date.now();
  const timestampBytes = Buffer.alloc(6);
  for (let index = 5; index >= 0; index -= 1) {
    timestampBytes[index] = timestamp % 256;
    timestamp = Math.floor(timestamp / 256);
  }
  return Buffer.concat([
    Buffer.from([name.includes("Req") ? 1 : 0, 0]),
    timestampBytes,
    Buffer.from([encodedName.length]),
    encodedName,
    payload
  ]);
}

export function decodeLobbyFrame(frame: Buffer) {
  if (frame.length < 9) throw new AppError("Lobby 返回帧过短。", "LOBBY_PROTOCOL_ERROR", 502);
  const nameLength = frame[8];
  const payloadStart = 9 + nameLength;
  if (payloadStart > frame.length) throw new AppError("Lobby 返回帧格式无效。", "LOBBY_PROTOCOL_ERROR", 502);
  return {
    status: frame[1],
    name: frame.subarray(9, payloadStart).toString("utf8"),
    payload: frame.subarray(payloadStart)
  };
}

async function fetchWithTimeout(url: string | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function parseRoomType(value?: string) {
  if (value === undefined || value === "" || value === "null") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function inferTheme(name: string): Game["theme"] {
  const normalized = name.toLowerCase();
  if (/space|moon|star|zeus|olympus/.test(normalized)) return "space";
  if (/candy|yummy|fruit/.test(normalized)) return "candy";
  if (/mole|wood|buffalo|fish|dragon/.test(normalized)) return "jungle";
  return "fortune";
}

function joinUrl(base: string, path: string) {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function webSocketBuffer(data: RawData) {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}
