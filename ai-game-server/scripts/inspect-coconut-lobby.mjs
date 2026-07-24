import "dotenv/config";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import protobuf from "protobufjs";
import WebSocket from "ws";

const TEST_ORIGIN = "https://games-web.coconut.tv:4000";
const edgePath = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const accountId = required("GAME_TEST_ACCOUNT_ID");
const lobbyIg = required("GAME_LOBBY_IG");
const clickX = optionalNumber("LOBBY_CLICK_X");
const clickY = optionalNumber("LOBBY_CLICK_Y");
const swipeCount = optionalNumber("LOBBY_SWIPE_COUNT") ?? 0;
const targetGame = process.env.LOBBY_TARGET_GAME?.trim() || "";
const clickTarget = process.env.LOBBY_CLICK_TARGET === "1";
const forceNavigateTarget = process.env.LOBBY_FORCE_NAVIGATE_TARGET === "1";
const compactOutput = process.env.LOBBY_COMPACT === "1";
const runtimeWaitMs = optionalNumber("LOBBY_RUNTIME_WAIT_MS") ?? 20_000;
const forceDevSdk = process.env.LOBBY_FORCE_DEV_SDK === "1";
const approvedTestGames = new Map([
  ["GameSlots", { id: 6001, mode: 0, version: 0 }],
  ["FruitSpin", { id: 6007, mode: 0, version: 0 }],
  ["JetSet", { id: 6014, mode: 0, version: 0 }],
  ["Bingo", { id: 6036, mode: 0, version: 0 }],
  ["Charmed", { id: 6037, mode: 0, version: 0 }]
]);
if (targetGame && !approvedTestGames.has(targetGame)) {
  throw new Error(
    `LOBBY_TARGET_GAME must be explicitly approved in this diagnostic (${[...approvedTestGames.keys()].join(", ")}).`
  );
}
const protocolLaunchUrl = targetGame ? await resolveLobbyLaunchUrl(targetGame) : "";
const profileDirectory = await mkdtemp(path.join(os.tmpdir(), "coco-lobby-cdp-"));
const outputDirectory = path.resolve(".local-run");
const screenshotPath = path.join(outputDirectory, "lobby-inspection.png");
await mkdir(outputDirectory, { recursive: true });

const browser = spawn(edgePath, [
  "--headless=new",
  "--disable-gpu",
  "--disable-extensions",
  "--no-first-run",
  "--no-default-browser-check",
  "--ignore-certificate-errors",
  "--remote-debugging-port=0",
  `--user-data-dir=${profileDirectory}`,
  "--window-size=1280,720",
  "about:blank"
], { windowsHide: true, stdio: "ignore" });

try {
  const port = await readDevToolsPort(profileDirectory, 10_000);
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((item) => item.type === "page");
  if (!target?.webSocketDebuggerUrl) throw new Error("No browser page target was found.");
  const cdp = await createCdp(target.webSocketDebuggerUrl);
  const relevantRequests = [];
  const responseBodies = [];
  const apiResponses = [];
  const requestUrls = new Map();
  const requestTypes = new Map();
  const socketUrls = new Map();
  const webSocketFrames = [];
  const loadFailures = [];
  let observedGameUrl = "";
  let devSdkOverrides = 0;

  if (forceDevSdk) {
    cdp.on("Fetch.requestPaused", (event) => {
      void overrideSdkConfig(event);
    });
    await cdp.send("Fetch.enable", {
      patterns: [{ urlPattern: "*cocolive.json*", requestStage: "Request" }]
    });
  }

  cdp.on("Network.requestWillBeSent", ({ requestId, request, type }) => {
    requestUrls.set(requestId, request.url);
    requestTypes.set(requestId, type);
    if (/\/game\/lobby\/gameUrl/i.test(request.url)) observedGameUrl = request.url;
    if (!isRelevant(request.url, type)) return;
    relevantRequests.push({
      type,
      method: request.method,
      url: sanitizeUrl(request.url),
      body: summarizeBody(request.postData)
    });
  });
  cdp.on("Network.webSocketCreated", ({ requestId, url }) => {
    socketUrls.set(requestId, url);
    if (!isRelevant(url, "WebSocket")) return;
    relevantRequests.push({ method: "WEBSOCKET", url: sanitizeUrl(url) });
  });
  cdp.on("Network.webSocketFrameSent", ({ requestId, response }) => {
    recordWebSocketFrame("sent", requestId, response);
  });
  cdp.on("Network.webSocketFrameReceived", ({ requestId, response }) => {
    recordWebSocketFrame("received", requestId, response);
  });
  cdp.on("Network.responseReceived", ({ requestId, response }) => {
    const resourceType = requestTypes.get(requestId) ?? "";
    const responseHost = safeHostname(response.url);
    const isGameApiResponse = responseHost === "games-api.coconut.tv"
      && /\/game3\//i.test(new URL(response.url).pathname);
    if (
      (resourceType === "XHR" || resourceType === "Fetch")
      && (responseHost.endsWith("hotgame.win") || isGameApiResponse)
      && isRelevant(response.url, resourceType)
    ) {
      const apiEntry = {
        status: response.status,
        url: sanitizeUrl(response.url),
        mimeType: response.mimeType
      };
      apiResponses.push(apiEntry);
      setTimeout(async () => {
        try {
          const body = await cdp.send("Network.getResponseBody", { requestId });
          apiEntry.bodyShape = summarizeResponseBody(body.body, response.url);
        } catch {}
      }, 200);
    }
    if (!/\/game\/(?:lobby\/gameUrl|hg\/getGameUrl)/i.test(response.url)) return;
    const location = response.headers?.location ?? response.headers?.Location;
    const entry = {
      status: response.status,
      url: sanitizeUrl(response.url),
      location: location ? sanitizeUrl(location) : undefined,
      mimeType: response.mimeType
    };
    responseBodies.push(entry);
    setTimeout(async () => {
      try {
        const body = await cdp.send("Network.getResponseBody", { requestId });
        entry.body = sanitizeText(body.body).slice(0, 4_000);
      } catch {}
    }, 200);
  });
  cdp.on("Network.loadingFailed", ({ requestId, errorText, canceled, blockedReason }) => {
    const url = requestUrls.get(requestId);
    if (!url || !isRelevant(url)) return;
    loadFailures.push({ url: sanitizeUrl(url), errorText, canceled, blockedReason });
  });

  await cdp.send("Network.enable");
  await cdp.send("Page.enable");
  const lobbyUrl = new URL("/game-lobby-client/", TEST_ORIGIN);
  lobbyUrl.search = new URLSearchParams({ userId: accountId, ig: lobbyIg }).toString();
  await cdp.send("Page.navigate", { url: lobbyUrl.toString() });
  await delay(10_000);

  for (let index = 0; index < swipeCount; index += 1) {
    await drag(cdp, { fromX: 300, toX: 300, fromY: 520, toY: 180 });
    await delay(900);
  }

  let selectedTarget;
  if (targetGame) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const selection = await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const wanted = ${JSON.stringify(targetGame)};
          const seen = new Set();
          function find(node) {
            if (!node || seen.has(node)) return null;
            seen.add(node);
            if (node.name === "gameList" && Array.isArray(node.array)) return node;
            for (const child of node._children || node.$children || []) {
              const found = find(child);
              if (found) return found;
            }
            return null;
          }
          const list = find(window.Laya?.stage);
          const index = list?.array?.findIndex(item => item?.name === wanted) ?? -1;
          if (!list || index < 0) return {found:false, index};
          list.scrollTo(index);
          return {found:true, index, url:list.array[index]?.url || ""};
        })()`,
        returnByValue: true
      });
      selectedTarget = selection.result.value;
      if (selectedTarget?.found) break;
      await delay(500);
    }
    await delay(1_200);
    if (forceNavigateTarget && !clickTarget && !selectedTarget?.found) {
      selectedTarget = {
        found: true,
        source: "authenticated Lobby InitRet",
        url: protocolLaunchUrl
      };
    }
    if (forceNavigateTarget && !clickTarget && selectedTarget?.found && selectedTarget.url) {
      const directUrl = new URL(selectedTarget.url);
      directUrl.searchParams.set("child", "1");
      directUrl.searchParams.set("screen", "wide");
      observedGameUrl = directUrl.toString();
      await cdp.send("Page.navigate", { url: observedGameUrl });
      await delay(runtimeWaitMs);
    }
    if (clickTarget && selectedTarget?.found) {
      const position = await cdp.send("Runtime.evaluate", {
        expression: `(() => {
          const wanted = ${JSON.stringify(targetGame)};
          const seen = new Set();
          function find(node) {
            if (!node || seen.has(node)) return null;
            seen.add(node);
            if (node.name === "gameList" && Array.isArray(node.array)) return node;
            for (const child of node._children || node.$children || []) {
              const found = find(child);
              if (found) return found;
            }
            return null;
          }
          const list = find(window.Laya?.stage);
          const index = list?.array?.findIndex(item => item?.name === wanted) ?? -1;
          const cell = index >= 0 ? list.getCell(index) : null;
          const canvas = document.querySelector("canvas");
          if (!cell || !canvas) return {found:false};
          const point = cell.localToGlobal(new Laya.Point(cell.width / 2, cell.height / 2));
          const rect = canvas.getBoundingClientRect();
          return {
            found:true,
            x:rect.left + point.x * rect.width / canvas.width,
            y:rect.top + point.y * rect.height / canvas.height
          };
        })()`,
        returnByValue: true
      });
      const point = position.result.value;
      if (!point?.found) throw new Error(`Unable to locate the visible ${targetGame} card.`);
      await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
      await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
      await delay(1_500);
      if (forceNavigateTarget && observedGameUrl) {
        await cdp.send("Page.navigate", { url: observedGameUrl });
      }
      await delay(forceNavigateTarget ? runtimeWaitMs : 4_500);
    }
  }

  if (clickX !== undefined && clickY !== undefined) {
    await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: clickX, y: clickY, button: "left", clickCount: 1 });
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: clickX, y: clickY, button: "left", clickCount: 1 });
    await delay(6_000);
  }

  const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(screenshotPath, Buffer.from(screenshot.data, "base64"));
  const pageState = await cdp.send("Runtime.evaluate", {
    expression: `(() => {
      const stage = window.Laya?.stage || window.egret?.MainContext?.instance?.stage;
      const seen = new Set();
      function findList(node) {
        if (!node || seen.has(node)) return null;
        seen.add(node);
        if (node.name === "gameList" && Array.isArray(node.array)) return node;
        for (const child of node._children || node.$children || []) {
          const found = findList(child);
          if (found) return found;
        }
        return null;
      }
      const list = findList(stage);
      return {
        title: document.title,
        location: location.href,
        text: document.body.innerText.slice(0, 2000),
        canvases: [...document.querySelectorAll("canvas")].map(c => ({width:c.width,height:c.height,rect:c.getBoundingClientRect().toJSON()})),
        gameList: list ? {
          startIndex:list.startIndex,
          selectedIndex:list.selectedIndex,
          scrollValue:list.scrollBar?.value,
          scrollMax:list.scrollBar?.max,
          items:list.array.map(item => ({id:item?.id,name:item?.name,url:item?.url,type:item?.type}))
        } : null
      };
    })()`,
    returnByValue: true
  });

  const output = {
    environment: TEST_ORIGIN,
    screenshotPath,
    target: targetGame ? sanitizeValue({
      name: targetGame,
      click: clickTarget,
      forceNavigate: forceNavigateTarget,
      forceDevSdk,
      devSdkOverrides,
      selection: selectedTarget
    }) : undefined,
    page: sanitizeValue(pageState.result.value),
    requests: relevantRequests,
    gameUrlResponses: responseBodies,
    apiResponses,
    webSocketFrames,
    loadFailures
  };
  if (compactOutput) {
    output.page = { title: output.page.title, location: output.page.location };
    output.requests = relevantRequests.filter((request) =>
      request.method === "WEBSOCKET"
      || (request.type === "Document" && !/game-lobby-client/i.test(request.url))
      || /\/game3\//i.test(request.url)
    );
    output.apiResponses = apiResponses.filter((response) =>
      /\/config\/sdk\/cocolive\//i.test(response.url)
      || /\/game3\//i.test(response.url)
    );
    output.webSocketFrames = webSocketFrames.filter((frame) => /hotgame\.win/i.test(frame.url));
  }
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  cdp.close();

  function recordWebSocketFrame(direction, requestId, response) {
    const url = socketUrls.get(requestId);
    if (!url || !isRelevant(url, "WebSocket") || webSocketFrames.length >= 80) return;
    webSocketFrames.push({
      direction,
      url: sanitizeUrl(url),
      opcode: response.opcode,
      payload: summarizeWirePayload(response.payloadData, response.opcode)
    });
  }

  async function overrideSdkConfig(event) {
    try {
      if (!/\/config\/sdk\/cocolive\/cocolive\.json/i.test(event.request.url)) {
        await cdp.send("Fetch.continueRequest", { requestId: event.requestId });
        return;
      }
      const sourceResponse = await fetch(event.request.url);
      if (!sourceResponse.ok) throw new Error(`SDK config returned HTTP ${sourceResponse.status}.`);
      const config = await sourceResponse.json();
      const servers = config?.apps?.default?.servers;
      if (!servers?.dev) throw new Error("SDK dev server is missing.");
      servers.pro = { ...servers.dev };
      const body = Buffer.from(JSON.stringify(config)).toString("base64");
      await cdp.send("Fetch.fulfillRequest", {
        requestId: event.requestId,
        responseCode: 200,
        responseHeaders: [
          { name: "content-type", value: "application/json" },
          { name: "access-control-allow-origin", value: "*" },
          { name: "cache-control", value: "no-store" }
        ],
        body
      });
      devSdkOverrides += 1;
    } catch {
      try {
        await cdp.send("Fetch.continueRequest", { requestId: event.requestId });
      } catch {}
    }
  }
} finally {
  browser.kill();
  await Promise.race([
    new Promise((resolve) => browser.once("exit", resolve)),
    delay(2_000)
  ]);
  await removeDirectoryWithRetry(profileDirectory);
}

async function createCdp(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  let nextId = 1;
  const pending = new Map();
  const listeners = new Map();
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.id) {
      const task = pending.get(message.id);
      if (!task) return;
      pending.delete(message.id);
      if (message.error) task.reject(new Error(message.error.message));
      else task.resolve(message.result);
      return;
    }
    for (const listener of listeners.get(message.method) ?? []) listener(message.params ?? {});
  });
  return {
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    on(method, listener) {
      const entries = listeners.get(method) ?? [];
      entries.push(listener);
      listeners.set(method, entries);
    },
    close() {
      socket.close();
    }
  };
}

async function readDevToolsPort(directory, timeoutMs) {
  const startedAt = Date.now();
  const file = path.join(directory, "DevToolsActivePort");
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const [port] = (await readFile(file, "utf8")).split(/\r?\n/);
      if (port) return Number(port);
    } catch {}
    await delay(100);
  }
  throw new Error("Timed out waiting for the browser debugging port.");
}

function isRelevant(rawUrl, resourceType = "") {
  try {
    const url = new URL(rawUrl);
    const approvedHost = url.hostname.endsWith("coconut.tv") || url.hostname.endsWith("hotgame.win");
    const isCdnHost = url.hostname === "cdn-web.hotgame.win";
    const isSdkConfig = url.hostname === "cdn-web.hotgame.win"
      && (
        /\/config\/sdk\//i.test(url.pathname)
        || /\/game\/branch\/configurator\//i.test(url.pathname)
      );
    return approvedHost
      && (
        url.hostname.startsWith("games-api")
        || /\/game\/lobby\//.test(url.pathname)
        || resourceType === "Document"
        || ((resourceType === "XHR" || resourceType === "Fetch") && (!isCdnHost || isSdkConfig))
        || resourceType === "WebSocket"
      );
  } catch {
    return false;
  }
}

function sanitizeUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol === "ws:" || url.protocol === "wss:") {
      return `${url.protocol}//${url.host}/<session-redacted>`;
    }
    const keys = [...new Set(url.searchParams.keys())];
    url.search = keys.length
      ? new URLSearchParams(keys.map((key) => [key, "<redacted>"])).toString()
      : "";
    url.hash = "";
    return url.toString();
  } catch {
    return sanitizeText(rawUrl);
  }
}

async function removeDirectoryWithRetry(directory) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) return;
      await delay(250 * (attempt + 1));
    }
  }
}

function summarizeBody(body) {
  if (!body) return undefined;
  try {
    const parsed = JSON.parse(body);
    return { format: "json", keys: Object.keys(parsed) };
  } catch {}
  try {
    const values = new URLSearchParams(body);
    return { format: "form", keys: [...new Set(values.keys())] };
  } catch {
    return { format: "unknown", length: body.length };
  }
}

function summarizeResponseBody(body, rawUrl = "") {
  try {
    const parsed = JSON.parse(body);
    if (/\/config\/sdk\/cocolive\/cocolive\.json/i.test(rawUrl)) {
      const app = parsed?.apps?.default ?? {};
      const selectedGames = {};
      for (const name of ["YummySlot", "OlympusSlot", "LavaSlot", "FortuneSlot"]) {
        if (app.games?.[name]) selectedGames[name] = app.games[name];
      }
      return {
        sdkId: parsed?.sdkId,
        appId: app.appId,
        servers: app.servers,
        games: selectedGames
      };
    }
    return summarizeJson(parsed, 0);
  } catch {
    return { format: "non-json", length: body.length };
  }
}

function summarizeWirePayload(payload, opcode) {
  if (opcode === 2) {
    try {
      const bytes = Buffer.from(payload, "base64");
      if (bytes.length < 4) return { format: "pinus", bytes: bytes.length, invalid: "short package" };
      const packageType = bytes[0];
      const declaredLength = (bytes[1] << 16) | (bytes[2] << 8) | bytes[3];
      const body = bytes.subarray(4, 4 + declaredLength);
      const packageNames = { 1: "handshake", 2: "handshakeAck", 3: "heartbeat", 4: "data", 5: "kick" };
      const summary = {
        format: "pinus",
        bytes: bytes.length,
        packageType: packageNames[packageType] ?? packageType,
        declaredLength
      };
      if (packageType === 1 || packageType === 5) {
        try {
          summary.bodyShape = summarizeJson(JSON.parse(body.toString("utf8")), 0);
        } catch {
          summary.body = { format: "text", length: body.length };
        }
      } else if (packageType === 4) {
        summary.message = decodePinusMessage(body);
      }
      return summary;
    } catch {
      return { format: "binary", encodedLength: payload.length };
    }
  }
  try {
    return { format: "json", shape: summarizeJson(JSON.parse(payload), 0) };
  } catch {
    return { format: "text", length: payload.length };
  }
}

function decodePinusMessage(body) {
  if (!body.length) return { invalid: "empty message" };
  let offset = 0;
  const flag = body[offset++];
  const compressRoute = (flag & 1) === 1;
  const type = (flag >> 1) & 7;
  const typeNames = { 0: "request", 1: "notify", 2: "response", 3: "push" };
  let id = 0;
  if (type === 0 || type === 2) {
    let byte;
    do {
      byte = body[offset++];
      id = (id << 7) | (byte & 0x7f);
    } while (byte >= 128 && offset < body.length);
  }
  let route;
  if (type === 0 || type === 1 || type === 3) {
    if (compressRoute) {
      route = (body[offset++] << 8) | body[offset++];
    } else {
      const routeLength = body[offset++];
      const rawRoute = body.subarray(offset, offset + routeLength).toString("utf8");
      route = /^[a-zA-Z0-9_.:-]+$/.test(rawRoute) ? rawRoute : `<route:${routeLength}>`;
      offset += routeLength;
    }
  }
  const rawBody = body.subarray(offset);
  let bodyShape;
  try {
    bodyShape = summarizeJson(JSON.parse(rawBody.toString("utf8")), 0);
  } catch {}
  return {
    type: typeNames[type] ?? type,
    id: id || undefined,
    compressRoute,
    route,
    bodyBytes: rawBody.length,
    bodyShape
  };
}

function safeHostname(rawUrl) {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return "";
  }
}

function summarizeJson(value, depth) {
  if (depth >= 5) return Array.isArray(value) ? `<array:${value.length}>` : `<${typeof value}>`;
  if (typeof value === "string") return `<string:${value.length}>`;
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 3).map((entry) => summarizeJson(entry, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).slice(0, 100).map(([key, entry]) => [key, summarizeJson(entry, depth + 1)])
    );
  }
  return `<${typeof value}>`;
}

function sanitizeText(value) {
  const sensitiveValues = [
    [accountId, "<account>"],
    [lobbyIg, "<lobby-ig>"],
    [process.env.GAME_SLOT_IG?.trim(), "<game-ig>"],
    [process.env.GAME_BINGO_IG?.trim(), "<bingo-ig>"],
    [process.env.GAME_CHARMED_IG?.trim(), "<charmed-ig>"],
    [process.env.GAME_FRUIT_IG?.trim(), "<fruit-ig>"],
    [process.env.GAME_JETSET_IG?.trim(), "<jetset-ig>"],
    [process.env.GAME_TEST_ACCOUNT_TOKEN?.trim(), "<account-token>"]
  ];
  let sanitized = String(value);
  for (const [secret, replacement] of sensitiveValues) {
    if (secret) sanitized = sanitized.replaceAll(secret, replacement);
  }
  return sanitized.replace(/([?&][^=&]+)=([^&#"]+)/g, "$1=<redacted>");
}

function sanitizeValue(value) {
  if (typeof value === "string") {
    if (/^(?:https?|wss?):\/\//i.test(value)) return sanitizeUrl(value);
    return sanitizeText(value);
  }
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeValue(entry)]));
  }
  return value;
}

function optionalNumber(name) {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${name} must be a number.`);
  return number;
}

async function resolveLobbyLaunchUrl(gameName) {
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const root = await protobuf.load(path.resolve(scriptDirectory, "../protocol/lobby.proto"));
  const loginUrl = new URL("/game/lobby/login", "https://games-api.coconut.tv");
  loginUrl.search = new URLSearchParams({
    uid: accountId,
    room: "",
    type: "",
    ig: lobbyIg
  }).toString();
  const loginResponse = await fetch(loginUrl, {
    headers: { accept: "*/*", origin: TEST_ORIGIN, referer: `${TEST_ORIGIN}/` }
  });
  const socketUrl = (await loginResponse.text()).trim();
  if (!loginResponse.ok || !/^wss?:\/\//i.test(socketUrl)) {
    throw new Error(`Lobby login failed with HTTP ${loginResponse.status}.`);
  }
  const socket = new WebSocket(socketUrl, { origin: TEST_ORIGIN, handshakeTimeout: 10_000 });
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Lobby WebSocket connection timed out.")), 10_000);
      socket.once("open", () => {
        clearTimeout(timeout);
        resolve();
      });
      socket.once("error", () => {
        clearTimeout(timeout);
        reject(new Error("Lobby WebSocket connection failed."));
      });
    });
    const init = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Lobby InitRet timed out.")), 10_000);
      const finish = (task) => {
        clearTimeout(timeout);
        socket.off("message", onMessage);
        socket.off("error", onError);
        task();
      };
      const onError = () => finish(() => reject(new Error("Lobby WebSocket failed during InitReq.")));
      const onMessage = (raw) => {
        try {
          const frame = decodeLobbyFrame(toBuffer(raw));
          if (frame.name !== "InitRet") return;
          if (frame.status !== 0) {
            finish(() => reject(new Error(`InitRet returned status ${frame.status}.`)));
            return;
          }
          const type = root.lookupType("InitRet");
          finish(() => resolve(type.toObject(type.decode(frame.payload), { defaults: true })));
        } catch (error) {
          finish(() => reject(error));
        }
      };
      socket.on("message", onMessage);
      socket.once("error", onError);
      socket.send(encodeLobbyRequest(root, "InitReq", {}));
    });
    const expectedId = approvedTestGames.get(gameName)?.id;
    const game = init.gameList?.find((item) =>
      String(item.name) === gameName && Number(item.id) === expectedId
    );
    if (!game?.legacyUrl) throw new Error(`Lobby did not return an approved launch URL for ${gameName}.`);
    const launchResponse = await fetch(String(game.legacyUrl), {
      headers: {
        accept: "*/*",
        origin: TEST_ORIGIN,
        referer: `${TEST_ORIGIN}/`
      },
      redirect: "manual"
    });
    const redirectLocation = launchResponse.headers.get("location");
    if (redirectLocation && launchResponse.status >= 300 && launchResponse.status < 400) {
      return new URL(redirectLocation, String(game.legacyUrl)).toString();
    }
    const launchBody = (await launchResponse.text()).trim();
    if (!launchResponse.ok) {
      throw new Error(`Lobby gameUrl returned HTTP ${launchResponse.status}.`);
    }
    if (/^https?:\/\//i.test(launchBody)) return launchBody;
    try {
      const payload = JSON.parse(launchBody);
      const candidate = payload?.data?.url ?? payload?.data ?? payload?.url;
      if (typeof candidate === "string" && /^https?:\/\//i.test(candidate)) return candidate;
    } catch {}
    throw new Error("Lobby gameUrl did not return a client URL.");
  } finally {
    socket.close();
  }
}

function encodeLobbyRequest(root, name, payload) {
  const type = root.lookupType(name);
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

function decodeLobbyFrame(frame) {
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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function drag(cdp, { fromX, toX, fromY, toY }) {
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", x: fromX, y: fromY, button: "left", clickCount: 1 });
  for (let step = 1; step <= 10; step += 1) {
    const x = fromX + ((toX - fromX) * step) / 10;
    const y = fromY + ((toY - fromY) * step) / 10;
    await cdp.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "left", buttons: 1 });
  }
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: toX, y: toY, button: "left", clickCount: 1 });
}
