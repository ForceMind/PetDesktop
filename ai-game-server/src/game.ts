import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Game, PlayProgress, PlayResult, SpinOutcome } from "./contracts";
import type { AppConfig } from "./config";
import { CoconutGameAdapter, type CoconutContext } from "./coconut";
import { AppError } from "./errors";

const gameSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().default("Game provider"),
  enabled: z.boolean().default(true),
  playable: z.boolean().optional(),
  minBet: z.number().nonnegative().default(1),
  maxBet: z.number().positive().default(10),
  betOptions: z.array(z.number().positive()).min(1).optional(),
  maxSpinsPerRequest: z.number().int().positive().optional(),
  wagerMultiplier: z.number().positive().optional(),
  iconUrl: z.string().url().optional(),
  type: z.number().int().optional(),
  category: z.number().int().optional(),
  players: z.number().int().nonnegative().optional(),
  version: z.number().int().nonnegative().optional(),
  theme: z.enum(["fortune", "candy", "space", "jungle"]).default("fortune")
});

const spinSchema = z.object({
  index: z.number().int().positive(),
  symbols: z.array(z.string()).min(3),
  bet: z.number().nonnegative(),
  win: z.number().nonnegative()
});

const resultSchema = z.object({
  transactionId: z.string().min(1),
  gameId: z.string().min(1),
  gameName: z.string().min(1),
  gameIconUrl: z.string().url().optional(),
  spins: z.array(spinSchema).min(1),
  totalBet: z.number().nonnegative(),
  totalWin: z.number().nonnegative(),
  net: z.number(),
  balanceBefore: z.number().nonnegative(),
  balanceAfter: z.number().nonnegative(),
  currency: z.string().min(1)
});

const defaultMockGames: Game[] = [
  { id: "coco-fortune", name: "Coco Fortune", provider: "Coco Lab", enabled: true, minBet: 1, maxBet: 10, theme: "fortune" },
  { id: "candy-cloud", name: "Candy Cloud", provider: "Coco Lab", enabled: true, minBet: 0.5, maxBet: 8, theme: "candy" },
  { id: "moonlight-777", name: "Moonlight 777", provider: "Coco Lab", enabled: true, minBet: 1, maxBet: 10, theme: "space" }
];

export type PlayCommand = {
  accountId: string;
  launchParams: Record<string, string>;
  game: Game;
  spins: number;
  betPerSpin: number;
  currency: string;
  idempotencyKey: string;
  onProgress?: (progress: PlayProgress) => void;
};

export class GameProvider {
  readonly mode: "live" | "mock";
  private readonly coconut?: CoconutGameAdapter;
  private readonly balances = new Map<string, number>();
  private readonly mockResults = new Map<string, PlayResult>();
  private cache?: { expiresAt: number; games: Game[] };

  constructor(private readonly gameConfig: AppConfig["game"]) {
    this.mode = gameConfig.provider === "mock" ? "mock" : "live";
    if (gameConfig.provider === "coconut") this.coconut = new CoconutGameAdapter(gameConfig);
  }

  async listGames(context: CoconutContext = { accountId: "", launchParams: {} }): Promise<Game[]> {
    if (this.gameConfig.catalog) return [...this.gameConfig.catalog];
    if (this.mode === "mock") return defaultMockGames.map((game) => ({ ...game }));
    if (this.coconut) return this.coconut.listGames(context);
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.games;
    const raw = await this.request(this.gameConfig.listPath, { method: "GET" });
    const source = unwrap(raw);
    const list = Array.isArray(source)
      ? source
      : Array.isArray((source as Record<string, unknown>).games)
        ? (source as Record<string, unknown>).games
        : (source as Record<string, unknown>).items;
    const games = z.array(gameSchema).parse(list);
    this.cache = { expiresAt: Date.now() + 60_000, games };
    return games;
  }

  async prepareGame(game: Game, context: CoconutContext): Promise<Game> {
    if (this.coconut) return this.coconut.prepareGame(game, context);
    return {
      ...game,
      betOptions: game.betOptions ? [...game.betOptions] : undefined
    };
  }

  async play(command: PlayCommand): Promise<PlayResult> {
    if (this.mode === "mock") return this.mockPlay(command);
    if (this.coconut) return this.coconut.play(command);

    /*
     * Real game API adapter boundary. Keep PlayCommand stable and adjust only
     * this payload plus normalizeResult when the concrete contract is supplied.
     */
    const raw = await this.request(this.gameConfig.playPath, {
      method: "POST",
      headers: {
        "idempotency-key": command.idempotencyKey,
        "x-test-account-token": this.gameConfig.accountToken
      },
      body: JSON.stringify({
        ...command.launchParams,
        accountId: command.accountId,
        gameId: command.game.id,
        rounds: command.spins,
        bet: command.betPerSpin,
        currency: command.currency,
        requestId: command.idempotencyKey
      })
    });
    const result = normalizeResult(raw, command);
    emitCompletedProgress(command, result.spins, result.balanceBefore);
    return result;
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.gameConfig.timeoutMs);
    try {
      const response = await fetch(joinUrl(this.gameConfig.baseUrl, path), {
        ...init,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          ...(this.gameConfig.apiKey ? { authorization: `Bearer ${this.gameConfig.apiKey}` } : {}),
          ...init.headers
        },
        signal: controller.signal
      });
      if (!response.ok) {
        console.error("Game request failed", response.status, (await response.text()).slice(0, 500));
        throw new AppError("游戏服务暂时没有响应。", "GAME_PROVIDER_ERROR", 502);
      }
      return response.json();
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.name === "AbortError") throw new AppError("游戏服务响应超时。", "GAME_TIMEOUT", 504);
      throw new AppError("无法连接游戏服务。", "GAME_UNAVAILABLE", 502);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async mockPlay(command: PlayCommand): Promise<PlayResult> {
    const cached = this.mockResults.get(command.idempotencyKey);
    if (cached) return cached;
    await new Promise((resolve) => setTimeout(resolve, 420));
    const random = seededRandom(command.idempotencyKey);
    const symbols = ["🍒", "⭐", "🔔", "7", "🍀", "💎"];
    const balanceBefore = this.balances.get(command.accountId) ?? 1000;
    const spins: SpinOutcome[] = [];
    for (let index = 1; index <= command.spins; index += 1) {
      const reels = Array.from({ length: 3 }, () => symbols[Math.floor(random() * symbols.length)]);
      const same = reels[0] === reels[1] && reels[1] === reels[2];
      const pair = reels[0] === reels[1] || reels[1] === reels[2] || reels[0] === reels[2];
      const multiplier = same ? (reels[0] === "7" ? 10 : 5) : pair ? 1.5 : random() > 0.78 ? 1 : 0;
      spins.push({ index, symbols: reels, bet: command.betPerSpin, win: money(command.betPerSpin * multiplier) });
      emitProgress(command, spins, balanceBefore);
    }
    const totalBet = money(spins.reduce((sum, spin) => sum + spin.bet, 0));
    const totalWin = money(spins.reduce((sum, spin) => sum + spin.win, 0));
    const net = money(totalWin - totalBet);
    const result: PlayResult = {
      transactionId: `mock_${randomUUID()}`,
      gameId: command.game.id,
      gameName: command.game.name,
      gameIconUrl: command.game.iconUrl,
      spins,
      totalBet,
      totalWin,
      net,
      balanceBefore,
      balanceAfter: money(balanceBefore + net),
      currency: command.currency
    };
    this.balances.set(command.accountId, result.balanceAfter);
    this.mockResults.set(command.idempotencyKey, result);
    return result;
  }
}

function emitCompletedProgress(command: PlayCommand, spins: SpinOutcome[], balanceBefore: number) {
  for (let completed = 5; completed <= spins.length; completed += 5) {
    emitProgress(command, spins.slice(0, completed), balanceBefore);
  }
}

function emitProgress(command: PlayCommand, spins: SpinOutcome[], balanceBefore: number) {
  if (!command.onProgress || spins.length % 5 !== 0) return;
  const totalBet = money(spins.reduce((sum, spin) => sum + spin.bet, 0));
  const totalWin = money(spins.reduce((sum, spin) => sum + spin.win, 0));
  const net = money(totalWin - totalBet);
  command.onProgress({
    gameId: command.game.id,
    gameName: command.game.name,
    completedSpins: spins.length,
    totalSpins: command.spins,
    totalBet,
    totalWin,
    net,
    balanceAfter: money(balanceBefore + net),
    currency: command.currency
  });
}

function normalizeResult(raw: unknown, command: PlayCommand): PlayResult {
  const payload = unwrap(raw) as Record<string, unknown>;
  const rawSpins = (payload.spins ?? payload.rounds ?? payload.outcomes ?? []) as Array<Record<string, unknown>>;
  const spins = rawSpins.map((spin, index) => ({
    index: Number(spin.index ?? spin.round ?? index + 1),
    symbols: (spin.symbols ?? spin.reels ?? []) as string[],
    bet: Number(spin.bet ?? spin.wager ?? command.betPerSpin),
    win: Number(spin.win ?? spin.payout ?? 0)
  }));
  const totalBet = Number(payload.totalBet ?? payload.total_bet ?? command.betPerSpin * command.spins);
  const totalWin = Number(payload.totalWin ?? payload.total_win ?? spins.reduce((sum, spin) => sum + spin.win, 0));
  const net = Number(payload.net ?? payload.netWin ?? totalWin - totalBet);
  const balanceBefore = Number(payload.balanceBefore ?? payload.balance_before ?? 0);
  return resultSchema.parse({
    transactionId: String(payload.transactionId ?? payload.transaction_id ?? payload.requestId ?? randomUUID()),
    gameId: String(payload.gameId ?? payload.game_id ?? command.game.id),
    gameName: String(payload.gameName ?? payload.game_name ?? command.game.name),
    gameIconUrl: String(payload.gameIconUrl ?? payload.game_icon_url ?? command.game.iconUrl ?? "") || undefined,
    spins,
    totalBet,
    totalWin,
    net,
    balanceBefore,
    balanceAfter: Number(payload.balanceAfter ?? payload.balance_after ?? balanceBefore + net),
    currency: String(payload.currency ?? command.currency)
  });
}

function unwrap(raw: unknown): unknown {
  return raw && typeof raw === "object" && "data" in raw ? (raw as { data: unknown }).data : raw;
}

function joinUrl(base: string, path: string) {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function seededRandom(seed: string): () => number {
  const digest = createHash("sha256").update(seed).digest();
  let state = digest.readUInt32LE(0) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
