import "dotenv/config";

const TEST_ORIGIN = "https://games-web.coconut.tv:4000";
const TEST_API_BASE_URL = "https://games-api.coconut.tv:14000";
const origin = required("GAME_ORIGIN").replace(/\/$/, "");
const apiBaseUrl = required("GAME_API_BASE_URL").replace(/\/$/, "");
const accountId = required("GAME_TEST_ACCOUNT_ID");
const gameIg = (process.env.GAME_FRUIT_IG || process.env.GAME_SLOT_IG || "").trim();
const timeoutMs = Number(process.env.GAME_REQUEST_TIMEOUT_MS || 10_000);
const allowOnePlay = process.env.FRUIT_ALLOW_ONE_PLAY === "1";

if (origin !== TEST_ORIGIN) throw new Error(`Refusing FruitSpin diagnostics outside ${TEST_ORIGIN}.`);
if (apiBaseUrl !== TEST_API_BASE_URL) throw new Error(`Refusing FruitSpin diagnostics outside ${TEST_API_BASE_URL}.`);
if (!gameIg) throw new Error("GAME_FRUIT_IG or GAME_SLOT_IG is required.");

const context = {
  uid: accountId,
  roomId: "",
  roomType: null,
  ig: gameIg
};
const initial = await post("/game3/fruit/init", context, false);
const initialData = requireData(initial, "FruitSpin init");
const balanceBefore = finiteNonNegative(initialData.token, "FruitSpin init token");
const bets = requireNumberArray(initialData.bets, "FruitSpin init bets");
const minimumBet = Math.min(...bets);

if (!allowOnePlay) {
  process.stdout.write(`${JSON.stringify({
    environment: TEST_ORIGIN,
    apiBaseUrl: TEST_API_BASE_URL,
    operation: "init-only",
    init: { code: initial.code, balance: balanceBefore, bets, shape: summarizeJson(initial, 0) }
  }, null, 2)}\n`);
  process.exit(0);
}

if (minimumBet !== 10) {
  throw new Error(`Refusing Play because the observed minimum FruitSpin bet is ${minimumBet}, not 10.`);
}

let playSent = false;
let rawPlay;
try {
  playSent = true;
  rawPlay = await post("/game3/fruit/play", {
    token: minimumBet,
    type: 1,
    ...context
  }, true);
} catch (error) {
  const finalAfterUnknown = await safeInit(context);
  process.stdout.write(`${JSON.stringify({
    environment: TEST_ORIGIN,
    apiBaseUrl: TEST_API_BASE_URL,
    operation: "one-lowest-bet-play",
    playSent,
    retryAllowed: false,
    balanceBefore,
    minimumBet,
    balanceAfterReadback: finalAfterUnknown?.data?.token,
    error: error instanceof Error ? error.message : "Unknown Play failure"
  }, null, 2)}\n`);
  process.exitCode = 2;
  process.exit();
}

const finalInit = await post("/game3/fruit/init", context, false);
const finalData = requireData(finalInit, "FruitSpin final init");
const balanceAfter = finiteNonNegative(finalData.token, "FruitSpin final init token");
process.stdout.write(`${JSON.stringify({
  environment: TEST_ORIGIN,
  apiBaseUrl: TEST_API_BASE_URL,
  operation: "one-lowest-bet-play",
  playSent,
  retryAllowed: false,
  request: {
    token: minimumBet,
    type: 1,
    contextKeys: Object.keys(context)
  },
  balanceBefore,
  balanceAfter,
  balanceDelta: money(balanceAfter - balanceBefore),
  playResponse: summarizeJson(rawPlay, 0),
  finalInit: summarizeJson(finalInit, 0)
}, null, 2)}\n`);

async function safeInit(body) {
  try {
    return await post("/game3/fruit/init", body, false);
  } catch {
    return undefined;
  }
}

async function post(path, body, outcomeCanBeUnknown) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: "POST",
      headers: {
        accept: "*/*",
        "content-type": "application/json",
        origin,
        referer: `${origin}/`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}.`);
    if (!Number.isInteger(payload?.code)) throw new Error(`${path} returned an invalid envelope.`);
    if (payload.code !== 0) throw new Error(`${path} returned API code ${payload.code}.`);
    return payload;
  } catch (error) {
    if (outcomeCanBeUnknown) {
      throw new Error(
        `FruitSpin Play outcome is unknown (${error instanceof Error ? error.message : "request failure"}); do not retry.`
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function requireData(envelope, label) {
  if (!envelope?.data || typeof envelope.data !== "object") throw new Error(`${label} data is missing.`);
  return envelope.data;
}

function finiteNonNegative(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }
  return value;
}

function requireNumberArray(value, label) {
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.some((entry) => typeof entry !== "number" || !Number.isFinite(entry) || entry <= 0)
  ) {
    throw new Error(`${label} must be a non-empty positive number array.`);
  }
  return value;
}

function summarizeJson(value, depth) {
  if (depth >= 8) return Array.isArray(value) ? `<array:${value.length}>` : `<${typeof value}>`;
  if (typeof value === "string") return `<string:${value.length}>`;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.map((entry) => summarizeJson(entry, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, summarizeJson(entry, depth + 1)]));
  }
  return `<${typeof value}>`;
}

function money(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
