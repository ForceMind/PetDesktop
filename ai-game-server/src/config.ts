import "dotenv/config";
import { z } from "zod";
import type { Game } from "./contracts";

const booleanEnv = z.string().optional().transform((value) => value !== "false");
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default("127.0.0.1"),
  DEMO_MODE: booleanEnv,
  CHAT_ENABLED: booleanEnv,
  CHAT_HISTORY_ENABLED: booleanEnv,
  CHAT_HISTORY_RETENTION_DAYS: z.coerce.number().int().min(1).max(90).default(7),
  AI_API_KEY: z.string().optional().default(""),
  AI_API_STYLE: z.enum(["chat-completions", "responses"]).default("chat-completions"),
  AI_BASE_URL: z.string().url().default("https://api.deepseek.com"),
  AI_MODEL: z.string().default("deepseek-v4-flash"),
  AI_CHAT_COMPLETIONS_PATH: z.string().default("/chat/completions"),
  AI_RESPONSES_PATH: z.string().default("/responses"),
  AI_JSON_MODE: booleanEnv,
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120_000).default(30_000),
  AI_REASONING_EFFORT: z.enum(["none", "low", "medium", "high"]).default("low"),
  GAME_PROVIDER: z.enum(["mock", "generic", "coconut"]).optional(),
  GAME_API_BASE_URL: z.string().optional().default(""),
  GAME_API_KEY: z.string().optional().default(""),
  GAME_LIST_PATH: z.string().default("/games"),
  GAME_INIT_PATH: z.string().default("/game3/slot/initReq"),
  GAME_PLAY_PATH: z.string().default("/play"),
  GAME_LOBBY_BASE_URL: z.string().url().default("https://games-api.coconut.tv"),
  GAME_LOBBY_LOGIN_PATH: z.string().default("/game/lobby/login"),
  GAME_LOBBY_IG: z.string().optional().default(""),
  GAME_SLOT_IG: z.string().optional().default(""),
  GAME_BINGO_IG: z.string().optional().default(""),
  GAME_BINGO_INIT_PATH: z.string().default("/game3/bingo/init"),
  GAME_BINGO_PLAY_PATH: z.string().default("/game3/bingo/play"),
  GAME_CHARMED_IG: z.string().optional().default(""),
  GAME_CHARMED_INIT_PATH: z.string().default("/game3/charmed/init"),
  GAME_CHARMED_PLAY_PATH: z.string().default("/game3/charmed/play"),
  GAME_FRUIT_IG: z.string().optional().default(""),
  GAME_FRUIT_INIT_PATH: z.string().default("/game3/fruit/init"),
  GAME_FRUIT_PLAY_PATH: z.string().default("/game3/fruit/play"),
  GAME_JETSET_IG: z.string().optional().default(""),
  GAME_JETSET_INIT_PATH: z.string().default("/game3/jetset/initReq"),
  GAME_JETSET_PLAY_PATH: z.string().default("/game3/jetset/playReq"),
  GAME_PLAYABLE_IDS: z.string().default("6001"),
  GAME_ORIGIN: z.string().url().default("https://games-web.coconut.tv:4000"),
  GAME_WAGER_MULTIPLIER: z.coerce.number().int().positive().max(10_000).default(12),
  GAME_TEST_ACCOUNT_ID: z.string().optional().default(""),
  GAME_TEST_ACCOUNT_TOKEN: z.string().optional().default(""),
  GAME_CURRENCY: z.string().default("TOKEN"),
  GAME_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(10_000),
  GAME_CATALOG_JSON: z.string().optional().default(""),
  GAME_LAUNCH_PARAM_KEYS: z.string().default("userId,ig,roomId,roomType,screen,openId,type"),
  GAME_ACCOUNT_PARAM: z.string().default("userId"),
  SLOT_MAX_SPINS_PER_REQUEST: z.coerce.number().int().min(1).max(100).default(20),
  SLOT_MAX_TOTAL_BET: z.coerce.number().positive().default(50_000),
  SLOT_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(12),
  PENDING_ACTION_TTL_SECONDS: z.coerce.number().int().min(30).max(900).default(180),
  ADMIN_TOKEN: z.string().optional().default("")
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error("AI Games server configuration is invalid.");
}

const fallbackGames: Game[] = [
  { id: "coco-fortune", name: "Coco Fortune", provider: "Coco Lab", enabled: true, minBet: 1, maxBet: 10, theme: "fortune" },
  { id: "candy-cloud", name: "Candy Cloud", provider: "Coco Lab", enabled: true, minBet: 0.5, maxBet: 8, theme: "candy" },
  { id: "moonlight-777", name: "Moonlight 777", provider: "Coco Lab", enabled: true, minBet: 1, maxBet: 10, theme: "space" }
];

const gameSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().default("Configured provider"),
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

function parseCatalog(value: string): Game[] | undefined {
  if (!value.trim()) return undefined;
  return z.array(gameSchema).parse(JSON.parse(value));
}

const env = parsed.data;
const gameProvider = env.GAME_PROVIDER ?? (env.GAME_API_BASE_URL ? "generic" : "mock");
export const config = {
  port: env.PORT,
  host: env.HOST,
  demoMode: env.DEMO_MODE,
  chatEnabled: env.CHAT_ENABLED,
  chatHistory: {
    enabled: env.CHAT_HISTORY_ENABLED,
    retentionDays: env.CHAT_HISTORY_RETENTION_DAYS
  },
  ai: {
    apiKey: env.AI_API_KEY,
    apiStyle: env.AI_API_STYLE,
    baseUrl: env.AI_BASE_URL.replace(/\/$/, ""),
    model: env.AI_MODEL,
    chatPath: env.AI_CHAT_COMPLETIONS_PATH,
    responsesPath: env.AI_RESPONSES_PATH,
    jsonMode: env.AI_JSON_MODE,
    timeoutMs: env.AI_REQUEST_TIMEOUT_MS,
    reasoningEffort: env.AI_REASONING_EFFORT
  },
  game: {
    provider: gameProvider,
    baseUrl: env.GAME_API_BASE_URL.replace(/\/$/, ""),
    apiKey: env.GAME_API_KEY,
    listPath: env.GAME_LIST_PATH,
    initPath: env.GAME_INIT_PATH,
    playPath: env.GAME_PLAY_PATH,
    lobbyBaseUrl: env.GAME_LOBBY_BASE_URL.replace(/\/$/, ""),
    lobbyLoginPath: env.GAME_LOBBY_LOGIN_PATH,
    lobbyIg: env.GAME_LOBBY_IG,
    slotIg: env.GAME_SLOT_IG,
    bingoIg: env.GAME_BINGO_IG || env.GAME_SLOT_IG,
    bingoInitPath: env.GAME_BINGO_INIT_PATH,
    bingoPlayPath: env.GAME_BINGO_PLAY_PATH,
    charmedIg: env.GAME_CHARMED_IG || env.GAME_SLOT_IG,
    charmedInitPath: env.GAME_CHARMED_INIT_PATH,
    charmedPlayPath: env.GAME_CHARMED_PLAY_PATH,
    fruitIg: env.GAME_FRUIT_IG || env.GAME_SLOT_IG,
    fruitInitPath: env.GAME_FRUIT_INIT_PATH,
    fruitPlayPath: env.GAME_FRUIT_PLAY_PATH,
    jetsetIg: env.GAME_JETSET_IG || env.GAME_SLOT_IG,
    jetsetInitPath: env.GAME_JETSET_INIT_PATH,
    jetsetPlayPath: env.GAME_JETSET_PLAY_PATH,
    playableIds: env.GAME_PLAYABLE_IDS.split(",").map((id) => id.trim()).filter(Boolean),
    origin: env.GAME_ORIGIN.replace(/\/$/, ""),
    wagerMultiplier: env.GAME_WAGER_MULTIPLIER,
    accountId: env.GAME_TEST_ACCOUNT_ID,
    accountToken: env.GAME_TEST_ACCOUNT_TOKEN,
    currency: env.GAME_CURRENCY,
    timeoutMs: env.GAME_REQUEST_TIMEOUT_MS,
    launchParamKeys: env.GAME_LAUNCH_PARAM_KEYS.split(",").map((key) => key.trim()).filter(Boolean),
    accountParam: env.GAME_ACCOUNT_PARAM,
    catalog: parseCatalog(env.GAME_CATALOG_JSON) ?? (gameProvider === "mock" ? fallbackGames : undefined)
  },
  limits: {
    maxSpins: env.SLOT_MAX_SPINS_PER_REQUEST,
    maxTotalBet: env.SLOT_MAX_TOTAL_BET,
    ratePerMinute: env.SLOT_RATE_LIMIT_PER_MINUTE,
    actionTtlSeconds: env.PENDING_ACTION_TTL_SECONDS
  },
  admin: {
    token: env.ADMIN_TOKEN
  }
} as const;

export type AppConfig = typeof config;
