import { promises as fs } from "node:fs";
import { z } from "zod";
import type { AppConfig } from "./config";
import type { Game } from "./contracts";

const optionalUrl = z.union([z.literal(""), z.string().url()]);
const apiPath = z.string().min(1).max(200).refine((value) => value.startsWith("/"), "API path must start with /");
const secretAction = z.enum(["keep", "set", "clear"]).default("keep");

const gameSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  provider: z.string().default("Configured provider"),
  enabled: z.boolean().default(true),
  playable: z.boolean().optional(),
  minBet: z.number().nonnegative(),
  maxBet: z.number().positive(),
  betOptions: z.array(z.number().positive()).min(1).optional(),
  maxSpinsPerRequest: z.number().int().positive().optional(),
  wagerMultiplier: z.number().positive().optional(),
  iconUrl: z.string().url().optional(),
  type: z.number().int().optional(),
  category: z.number().int().optional(),
  players: z.number().int().nonnegative().optional(),
  version: z.number().int().nonnegative().optional(),
  theme: z.enum(["fortune", "candy", "space", "jungle"]).default("fortune")
}).refine((game) => game.maxBet >= game.minBet, "maxBet must be greater than or equal to minBet");

export const adminUpdateSchema = z.object({
  demoMode: z.boolean(),
  ai: z.object({
    apiStyle: z.enum(["chat-completions", "responses"]),
    baseUrl: z.string().url(),
    model: z.string().min(1).max(200),
    chatPath: apiPath,
    responsesPath: apiPath,
    jsonMode: z.boolean(),
    timeoutMs: z.number().int().min(1000).max(120_000),
    reasoningEffort: z.enum(["none", "low", "medium", "high"]),
    apiKeyAction: secretAction,
    apiKey: z.string().max(4096).optional()
  }).strict(),
  game: z.object({
    provider: z.enum(["mock", "generic", "coconut"]),
    baseUrl: optionalUrl,
    apiKeyAction: secretAction,
    apiKey: z.string().max(4096).optional(),
    listPath: apiPath,
    initPath: apiPath,
    playPath: apiPath,
    lobbyBaseUrl: z.string().url(),
    lobbyLoginPath: apiPath,
    lobbyIg: z.string().max(512),
    slotIg: z.string().max(512),
    bingoIg: z.string().max(512),
    bingoInitPath: apiPath,
    bingoPlayPath: apiPath,
    charmedIg: z.string().max(512),
    charmedInitPath: apiPath,
    charmedPlayPath: apiPath,
    fruitIg: z.string().max(512),
    fruitInitPath: apiPath,
    fruitPlayPath: apiPath,
    jetsetIg: z.string().max(512),
    jetsetInitPath: apiPath,
    jetsetPlayPath: apiPath,
    playableIds: z.array(z.string().min(1).max(64)).max(200),
    origin: z.string().url(),
    wagerMultiplier: z.number().int().positive().max(10_000),
    accountId: z.string().max(512),
    accountTokenAction: secretAction,
    accountToken: z.string().max(4096).optional(),
    currency: z.string().min(1).max(20),
    timeoutMs: z.number().int().min(1000).max(60_000),
    launchParamKeys: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/)).min(1).max(30),
    accountParam: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),
    catalog: z.array(gameSchema).max(200)
  }).strict(),
  limits: z.object({
    maxSpins: z.number().int().min(1).max(100),
    maxTotalBet: z.number().positive(),
    ratePerMinute: z.number().int().min(1).max(1000),
    actionTtlSeconds: z.number().int().min(30).max(900)
  }).strict()
}).strict().superRefine((value, context) => {
  if (value.ai.apiKeyAction === "set" && !value.ai.apiKey?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["ai", "apiKey"], message: "AI API key is required" });
  }
  if (value.game.apiKeyAction === "set" && !value.game.apiKey?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["game", "apiKey"], message: "Game API key is required" });
  }
  if (value.game.accountTokenAction === "set" && !value.game.accountToken?.trim()) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["game", "accountToken"], message: "Account token is required" });
  }
  if (!value.game.launchParamKeys.includes(value.game.accountParam)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["game", "accountParam"],
      message: "Account parameter must be included in the URL parameter allowlist"
    });
  }
  if (value.game.provider !== "mock" && !value.game.baseUrl) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["game", "baseUrl"],
      message: "A Game API Base URL is required for a live provider"
    });
  }
  if (value.game.provider === "coconut") {
    if (!value.game.lobbyIg.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["game", "lobbyIg"],
        message: "Lobby IG is required for the Coconut adapter"
      });
    }
    if (!value.game.slotIg.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["game", "slotIg"],
        message: "Slot IG is required for the Coconut adapter"
      });
    }
    if (value.game.playableIds.includes("6036") && !value.game.bingoIg.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["game", "bingoIg"],
        message: "Bingo IG is required when Bingo (6036) is playable"
      });
    }
    if (value.game.playableIds.includes("6037") && !value.game.charmedIg.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["game", "charmedIg"],
        message: "Charmed IG is required when Charmed (6037) is playable"
      });
    }
    if (value.game.playableIds.includes("6007") && !value.game.fruitIg.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["game", "fruitIg"],
        message: "FruitSpin IG is required when FruitSpin (6007) is playable"
      });
    }
    if (value.game.playableIds.includes("6014") && !value.game.jetsetIg.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["game", "jetsetIg"],
        message: "JetSet IG is required when JetSet (6014) is playable"
      });
    }
    if (!value.game.playableIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["game", "playableIds"],
        message: "At least one playable game ID is required for the Coconut adapter"
      });
    }
  }
});

export type AdminUpdate = z.infer<typeof adminUpdateSchema>;

export function adminConfigView(config: AppConfig) {
  return {
    demoMode: config.demoMode,
    ai: {
      apiStyle: config.ai.apiStyle,
      baseUrl: config.ai.baseUrl,
      model: config.ai.model,
      chatPath: config.ai.chatPath,
      responsesPath: config.ai.responsesPath,
      jsonMode: config.ai.jsonMode,
      timeoutMs: config.ai.timeoutMs,
      reasoningEffort: config.ai.reasoningEffort,
      apiKeyConfigured: Boolean(config.ai.apiKey)
    },
    game: {
      provider: config.game.provider,
      baseUrl: config.game.baseUrl,
      apiKeyConfigured: Boolean(config.game.apiKey),
      listPath: config.game.listPath,
      initPath: config.game.initPath,
      playPath: config.game.playPath,
      lobbyBaseUrl: config.game.lobbyBaseUrl,
      lobbyLoginPath: config.game.lobbyLoginPath,
      lobbyIg: config.game.lobbyIg,
      slotIg: config.game.slotIg,
      bingoIg: config.game.bingoIg,
      bingoInitPath: config.game.bingoInitPath,
      bingoPlayPath: config.game.bingoPlayPath,
      charmedIg: config.game.charmedIg,
      charmedInitPath: config.game.charmedInitPath,
      charmedPlayPath: config.game.charmedPlayPath,
      fruitIg: config.game.fruitIg,
      fruitInitPath: config.game.fruitInitPath,
      fruitPlayPath: config.game.fruitPlayPath,
      jetsetIg: config.game.jetsetIg,
      jetsetInitPath: config.game.jetsetInitPath,
      jetsetPlayPath: config.game.jetsetPlayPath,
      playableIds: [...config.game.playableIds],
      origin: config.game.origin,
      wagerMultiplier: config.game.wagerMultiplier,
      accountId: config.game.accountId,
      accountTokenConfigured: Boolean(config.game.accountToken),
      currency: config.game.currency,
      timeoutMs: config.game.timeoutMs,
      launchParamKeys: [...config.game.launchParamKeys],
      accountParam: config.game.accountParam,
      catalog: config.game.catalog ? [...config.game.catalog] : []
    },
    limits: { ...config.limits },
    adminAuthRequired: Boolean(config.admin.token)
  };
}

export function applyAdminUpdate(current: AppConfig, input: AdminUpdate): {
  config: AppConfig;
  envUpdates: Record<string, string>;
} {
  const aiApiKey = nextSecret(current.ai.apiKey, input.ai.apiKeyAction, input.ai.apiKey);
  const gameApiKey = nextSecret(current.game.apiKey, input.game.apiKeyAction, input.game.apiKey);
  const accountToken = nextSecret(current.game.accountToken, input.game.accountTokenAction, input.game.accountToken);
  const catalog = input.game.catalog as Game[];

  const nextConfig = {
    ...current,
    demoMode: input.demoMode,
    ai: {
      apiKey: aiApiKey,
      apiStyle: input.ai.apiStyle,
      baseUrl: input.ai.baseUrl.replace(/\/$/, ""),
      model: input.ai.model,
      chatPath: input.ai.chatPath,
      responsesPath: input.ai.responsesPath,
      jsonMode: input.ai.jsonMode,
      timeoutMs: input.ai.timeoutMs,
      reasoningEffort: input.ai.reasoningEffort
    },
    game: {
      provider: input.game.provider,
      baseUrl: input.game.baseUrl.replace(/\/$/, ""),
      apiKey: gameApiKey,
      listPath: input.game.listPath,
      initPath: input.game.initPath,
      playPath: input.game.playPath,
      lobbyBaseUrl: input.game.lobbyBaseUrl.replace(/\/$/, ""),
      lobbyLoginPath: input.game.lobbyLoginPath,
      lobbyIg: input.game.lobbyIg,
      slotIg: input.game.slotIg,
      bingoIg: input.game.bingoIg,
      bingoInitPath: input.game.bingoInitPath,
      bingoPlayPath: input.game.bingoPlayPath,
      charmedIg: input.game.charmedIg,
      charmedInitPath: input.game.charmedInitPath,
      charmedPlayPath: input.game.charmedPlayPath,
      fruitIg: input.game.fruitIg,
      fruitInitPath: input.game.fruitInitPath,
      fruitPlayPath: input.game.fruitPlayPath,
      jetsetIg: input.game.jetsetIg,
      jetsetInitPath: input.game.jetsetInitPath,
      jetsetPlayPath: input.game.jetsetPlayPath,
      playableIds: [...input.game.playableIds],
      origin: input.game.origin.replace(/\/$/, ""),
      wagerMultiplier: input.game.wagerMultiplier,
      accountId: input.game.accountId,
      accountToken,
      currency: input.game.currency,
      timeoutMs: input.game.timeoutMs,
      launchParamKeys: [...input.game.launchParamKeys],
      accountParam: input.game.accountParam,
      catalog: catalog.length ? catalog : undefined
    },
    limits: { ...input.limits }
  } as AppConfig;

  const envUpdates: Record<string, string> = {
    DEMO_MODE: String(input.demoMode),
    AI_API_STYLE: input.ai.apiStyle,
    AI_BASE_URL: input.ai.baseUrl,
    AI_MODEL: input.ai.model,
    AI_CHAT_COMPLETIONS_PATH: input.ai.chatPath,
    AI_RESPONSES_PATH: input.ai.responsesPath,
    AI_JSON_MODE: String(input.ai.jsonMode),
    AI_REQUEST_TIMEOUT_MS: String(input.ai.timeoutMs),
    AI_REASONING_EFFORT: input.ai.reasoningEffort,
    GAME_PROVIDER: input.game.provider,
    GAME_API_BASE_URL: input.game.baseUrl,
    GAME_LIST_PATH: input.game.listPath,
    GAME_INIT_PATH: input.game.initPath,
    GAME_PLAY_PATH: input.game.playPath,
    GAME_LOBBY_BASE_URL: input.game.lobbyBaseUrl,
    GAME_LOBBY_LOGIN_PATH: input.game.lobbyLoginPath,
    GAME_LOBBY_IG: input.game.lobbyIg,
    GAME_SLOT_IG: input.game.slotIg,
    GAME_BINGO_IG: input.game.bingoIg,
    GAME_BINGO_INIT_PATH: input.game.bingoInitPath,
    GAME_BINGO_PLAY_PATH: input.game.bingoPlayPath,
    GAME_CHARMED_IG: input.game.charmedIg,
    GAME_CHARMED_INIT_PATH: input.game.charmedInitPath,
    GAME_CHARMED_PLAY_PATH: input.game.charmedPlayPath,
    GAME_FRUIT_IG: input.game.fruitIg,
    GAME_FRUIT_INIT_PATH: input.game.fruitInitPath,
    GAME_FRUIT_PLAY_PATH: input.game.fruitPlayPath,
    GAME_JETSET_IG: input.game.jetsetIg,
    GAME_JETSET_INIT_PATH: input.game.jetsetInitPath,
    GAME_JETSET_PLAY_PATH: input.game.jetsetPlayPath,
    GAME_PLAYABLE_IDS: input.game.playableIds.join(","),
    GAME_ORIGIN: input.game.origin,
    GAME_WAGER_MULTIPLIER: String(input.game.wagerMultiplier),
    GAME_TEST_ACCOUNT_ID: input.game.accountId,
    GAME_CURRENCY: input.game.currency,
    GAME_REQUEST_TIMEOUT_MS: String(input.game.timeoutMs),
    GAME_LAUNCH_PARAM_KEYS: input.game.launchParamKeys.join(","),
    GAME_ACCOUNT_PARAM: input.game.accountParam,
    GAME_CATALOG_JSON: catalog.length ? JSON.stringify(catalog) : "",
    SLOT_MAX_SPINS_PER_REQUEST: String(input.limits.maxSpins),
    SLOT_MAX_TOTAL_BET: String(input.limits.maxTotalBet),
    SLOT_RATE_LIMIT_PER_MINUTE: String(input.limits.ratePerMinute),
    PENDING_ACTION_TTL_SECONDS: String(input.limits.actionTtlSeconds)
  };
  if (input.ai.apiKeyAction !== "keep") envUpdates.AI_API_KEY = aiApiKey;
  if (input.game.apiKeyAction !== "keep") envUpdates.GAME_API_KEY = gameApiKey;
  if (input.game.accountTokenAction !== "keep") envUpdates.GAME_TEST_ACCOUNT_TOKEN = accountToken;
  return { config: nextConfig, envUpdates };
}

export async function writeEnvUpdates(filePath: string, updates: Record<string, string>) {
  let existing = "";
  try {
    existing = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const newline = existing.includes("\r\n") ? "\r\n" : "\n";
  const found = new Set<string>();
  const lines = existing ? existing.split(/\r?\n/) : [];
  const output = lines.map((line) => {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/);
    if (!match || !(match[1] in updates)) return line;
    found.add(match[1]);
    return `${match[1]}=${dotenvValue(updates[match[1]])}`;
  });
  for (const [key, value] of Object.entries(updates)) {
    if (!found.has(key)) output.push(`${key}=${dotenvValue(value)}`);
  }
  await fs.writeFile(filePath, `${output.join(newline).replace(/(?:\r?\n)*$/, "")}${newline}`, {
    encoding: "utf8",
    mode: 0o600
  });
}

function nextSecret(current: string, action: "keep" | "set" | "clear", value?: string) {
  if (action === "keep") return current;
  if (action === "clear") return "";
  return value?.trim() ?? "";
}

function dotenvValue(value: string) {
  if (!value) return "";
  if (/^[A-Za-z0-9_./:@,+-]+$/.test(value)) return value;
  return JSON.stringify(value);
}
