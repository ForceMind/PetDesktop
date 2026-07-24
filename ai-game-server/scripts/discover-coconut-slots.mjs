import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import protobuf from "protobufjs";
import WebSocket from "ws";

const TEST_ORIGIN = "https://games-web.coconut.tv:4000";
const origin = required("GAME_ORIGIN").replace(/\/$/, "");
if (origin !== TEST_ORIGIN) {
  throw new Error(`Refusing discovery outside the approved test origin: ${TEST_ORIGIN}`);
}

const accountId = required("GAME_TEST_ACCOUNT_ID");
const lobbyIg = required("GAME_LOBBY_IG");
const lobbyBaseUrl = required("GAME_LOBBY_BASE_URL").replace(/\/$/, "");
const loginPath = required("GAME_LOBBY_LOGIN_PATH");
const timeoutMs = Number(process.env.GAME_REQUEST_TIMEOUT_MS || 10_000);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const protocolPath = path.resolve(scriptDirectory, "../protocol/lobby.proto");
const root = await protobuf.load(protocolPath);

const loginUrl = new URL(`${lobbyBaseUrl}${loginPath.startsWith("/") ? loginPath : `/${loginPath}`}`);
loginUrl.search = new URLSearchParams({
  uid: accountId,
  room: "",
  type: "",
  ig: lobbyIg
}).toString();

const loginResponse = await fetchWithTimeout(loginUrl, {
  headers: { accept: "*/*", origin, referer: `${origin}/` }
}, timeoutMs);
const socketUrl = (await loginResponse.text()).trim();
if (!loginResponse.ok || !/^wss?:\/\//i.test(socketUrl)) {
  throw new Error(`Lobby login failed with HTTP ${loginResponse.status}.`);
}

const socket = new WebSocket(socketUrl, { origin, handshakeTimeout: timeoutMs });
await onceOpen(socket, timeoutMs);

try {
  const init = await request(socket, root, "InitReq", {}, "InitRet", timeoutMs);
  process.stderr.write(`Lobby games: ${init.gameList.map((game) => `${game.id}:${game.name}`).join(" | ")}\n`);
  const details = [];
  for (const game of init.gameList) {
    const legacyLaunchPath = sanitizeLaunchPath(game.legacyUrl);
    let detail;
    try {
      detail = await request(
        socket,
        root,
        "GameDetailReq",
        { id: game.id, v: game.v },
        "GameDetailRet",
        Math.min(timeoutMs, 3_000),
        (payload) => Number(payload.id) === Number(game.id)
      );
    } catch (error) {
      details.push({
        id: Number(game.id),
        name: String(game.name),
        category: Number(game.category),
        type: Number(game.type),
        version: Number(game.v),
        isSlot: Number(game.category) === 1 || /slot/i.test(legacyLaunchPath),
        slotEvidence: [
          Number(game.category) === 1 ? "category=1" : "",
          /slot/i.test(legacyLaunchPath) ? "legacy launch path" : ""
        ].filter(Boolean),
        launchPath: legacyLaunchPath,
        detailError: error instanceof Error ? error.message : "Unknown detail error"
      });
      continue;
    }
    const launchPath = sanitizeLaunchPath(detail.url) || legacyLaunchPath;
    const tags = String(detail.tags || "");
    const rules = String(detail.rules || "");
    const features = String(detail.features || "");
    const slotEvidence = [
      Number(game.category) === 1 ? "category=1" : "",
      /slot/i.test(`${launchPath} ${tags} ${rules} ${features}`) ? "detail metadata" : ""
    ].filter(Boolean);
    details.push({
      id: Number(game.id),
      name: String(game.name),
      category: Number(game.category),
      type: Number(game.type),
      version: Number(game.v),
      isSlot: slotEvidence.length > 0,
      slotEvidence,
      launchPath,
      minBet: Number(detail.minBet),
      maxBet: Number(detail.maxBet),
      rtp: Number(detail.rtp),
      volatility: Number(detail.volatility)
    });
  }
  process.stdout.write(`${JSON.stringify({
    environment: TEST_ORIGIN,
    totalLobbyGames: init.gameList.length,
    games: details,
    slotGames: details.filter((game) => game.isSlot)
  }, null, 2)}\n`);
} finally {
  socket.close();
}

function request(socket, protobufRoot, requestName, payload, responseName, requestTimeout, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const observedFrames = new Set();
    const timeout = setTimeout(() => {
      cleanup();
      const observed = observedFrames.size ? ` Observed: ${[...observedFrames].join(", ")}.` : "";
      reject(new Error(`${responseName} timed out.${observed}`));
    }, requestTimeout);
    const onMessage = (raw) => {
      try {
        const frame = decodeFrame(toBuffer(raw));
        if (frame.name !== responseName) {
          observedFrames.add(`${frame.name}:${frame.status}`);
          return;
        }
        if (frame.status !== 0) {
          cleanup();
          reject(new Error(`${responseName} returned status ${frame.status}.`));
          return;
        }
        const type = protobufRoot.lookupType(responseName);
        const decoded = type.toObject(type.decode(frame.payload), {
          defaults: true,
          longs: Number
        });
        if (!predicate(decoded)) return;
        cleanup();
        resolve(decoded);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    const onError = () => {
      cleanup();
      reject(new Error("Lobby WebSocket failed."));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("error", onError);
    };
    socket.on("message", onMessage);
    socket.once("error", onError);
    socket.send(encodeRequest(protobufRoot, requestName, payload));
  });
}

function encodeRequest(protobufRoot, name, payload) {
  const type = protobufRoot.lookupType(name);
  const body = Buffer.from(type.encode(type.create(payload)).finish());
  const encodedName = Buffer.from(name, "utf8");
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
    body
  ]);
}

function decodeFrame(frame) {
  if (frame.length < 9) throw new Error("Lobby frame is too short.");
  const nameLength = frame[8];
  const payloadStart = 9 + nameLength;
  if (payloadStart > frame.length) throw new Error("Lobby frame is invalid.");
  return {
    status: frame[1],
    name: frame.subarray(9, payloadStart).toString("utf8"),
    payload: frame.subarray(payloadStart)
  };
}

function onceOpen(socket, requestTimeout) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error("Lobby WebSocket connection timed out."));
    }, requestTimeout);
    socket.once("open", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once("error", () => {
      clearTimeout(timeout);
      reject(new Error("Lobby WebSocket connection failed."));
    });
  });
}

async function fetchWithTimeout(url, init, requestTimeout) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeout);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function sanitizeLaunchPath(rawUrl) {
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl, `${origin}/`);
    return `${url.origin}${url.pathname}`;
  } catch {
    return String(rawUrl).split(/[?#]/, 1)[0];
  }
}

function toBuffer(raw) {
  if (Buffer.isBuffer(raw)) return raw;
  if (Array.isArray(raw)) return Buffer.concat(raw);
  return Buffer.from(raw);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
