import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import WebSocket from "ws";

const appUrl = process.env.COCO_TEST_URL || "http://127.0.0.1:8787/";
const edgePath = process.env.EDGE_PATH
  || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const profile = await mkdtemp(join(tmpdir(), "coco-bubble-layout-"));
const port = await freePort();
const browser = spawn(edgePath, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "about:blank"
], { stdio: "ignore", windowsHide: true });

let socket;
try {
  await waitForBrowser(port);
  const target = await (await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(appUrl)}`,
    { method: "PUT" }
  )).json();
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.once("open", resolveOpen);
    socket.once("error", rejectOpen);
  });
  const send = createCdpSender(socket);
  const results = [];
  for (const viewport of [[1440, 900], [900, 760], [700, 720]]) {
    results.push(await measureLayout(send, ...viewport));
  }
  for (const result of results) {
    if (result.bubbleOverlap !== 0 || result.petOverlap !== 0) {
      throw new Error(`Chat overlap remains: ${JSON.stringify(result)}`);
    }
    if (result.stageStatusDisplay !== "none") {
      throw new Error(`Animation debug status is visible: ${JSON.stringify(result)}`);
    }
  }
  const gameProgress = process.env.COCO_TEST_GAME_PROGRESS === "1"
    ? await measureGameProgress(send)
    : undefined;
  console.log(JSON.stringify({ layouts: results, gameProgress }, null, 2));
  await send("Browser.close").catch(() => {});
} finally {
  socket?.close();
  await waitForExit(browser, 3000);
  if (browser.exitCode === null) browser.kill();
  const resolvedProfile = resolve(profile);
  const resolvedTemp = `${resolve(tmpdir())}\\`;
  if (resolvedProfile.startsWith(resolvedTemp) && resolvedProfile.includes("coco-bubble-layout-")) {
    await rm(resolvedProfile, { recursive: true, force: true }).catch(() => {});
  }
}

async function measureLayout(send, width, height) {
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false
  });
  await send("Page.navigate", { url: `${appUrl}?bubble-layout=v18` });
  await send("Runtime.evaluate", {
    expression: `new Promise((resolve, reject) => {
      const started = performance.now();
      const wait = () => {
        if (window.CocoPet?.ready && document.querySelector("#pet")?.style.left) return resolve(true);
        if (performance.now() - started > 10000) return reject(new Error("Coco did not become ready"));
        setTimeout(wait, 50);
      };
      wait();
    })`,
    awaitPromise: true
  });
  const result = await send("Runtime.evaluate", {
    expression: `new Promise(resolve => {
      const panel = document.querySelector("#aiSlotPanel");
      window.dispatchEvent(new CustomEvent("coco:chatpanelchange", { detail: { open: true } }));
      panel.hidden = false;
      window.CocoPet.say(
        "这是一条用于检查聊天窗口旁边气泡位置的较长消息，确保它完整显示并且不会被聊天框遮挡。",
        10000
      );
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const bubble = document.querySelector("#speechBubble").getBoundingClientRect();
        const chat = panel.getBoundingClientRect();
        const pet = document.querySelector("#pet").getBoundingClientRect();
        resolve({
          viewport: [innerWidth, innerHeight],
          side: document.querySelector("#speechBubble").dataset.side,
          bubble: { left: bubble.left, right: bubble.right },
          pet: { left: pet.left, right: pet.right },
          chat: { left: chat.left, right: chat.right },
          stageStatusDisplay: getComputedStyle(document.querySelector(".stage-status")).display,
          bubbleOverlap: Math.max(0, Math.min(bubble.right, chat.right) - Math.max(bubble.left, chat.left)),
          petOverlap: Math.max(0, Math.min(pet.right, chat.right) - Math.max(pet.left, chat.left))
        });
      }));
    })`,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

async function measureGameProgress(send) {
  await send("Page.navigate", { url: `${appUrl}?game-progress=v22` });
  await evaluatePromise(send, `new Promise((resolve, reject) => {
    const started = performance.now();
    const wait = () => {
      if (window.CocoPet?.ready && document.querySelector("#aiSlotButton")) return resolve(true);
      if (performance.now() - started > 10000) return reject(new Error("Coco did not become ready"));
      setTimeout(wait, 50);
    };
    wait();
  })`);
  await evaluatePromise(send, `new Promise((resolve, reject) => {
    document.querySelector("#aiSlotButton").click();
    const started = performance.now();
    const wait = () => {
      if (document.querySelector("#aiSlotMessages article")) return resolve(true);
      if (performance.now() - started > 10000) return reject(new Error("Chat did not bootstrap"));
      setTimeout(wait, 50);
    };
    wait();
  })`);
  await evaluatePromise(send, `new Promise((resolve, reject) => {
    const input = document.querySelector("#aiSlotInput");
    input.value = "Play Coco Fortune for 1 round, bet 1";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#aiSlotForm").requestSubmit();
    const started = performance.now();
    const wait = () => {
      const confirm = document.querySelector(".ai-slot-proposal button[data-action-id]");
      if (confirm) {
        confirm.click();
        return resolve(true);
      }
      if (performance.now() - started > 10000) return reject(new Error("Confirmation card did not appear"));
      setTimeout(wait, 50);
    };
    wait();
  })`);
  const result = await send("Runtime.evaluate", {
    expression: `new Promise((resolve, reject) => {
      const started = performance.now();
      const wait = () => {
        const trace = document.querySelector("#aiSlotTrace");
        const progress = document.querySelector("#aiSlotTraceProgress")?.textContent?.trim();
        if (!trace.hidden && progress === "8 / 8") {
          return resolve({
            traceVisible: true,
            progress,
            rows: [...trace.querySelectorAll("li")].map((row) => ({
              label: row.querySelector("strong")?.textContent,
              status: row.dataset.status
            })),
            stageStatusDisplay: getComputedStyle(document.querySelector(".stage-status")).display
          });
        }
        if (performance.now() - started > 10000) return reject(new Error("Game progress did not finish"));
        setTimeout(wait, 50);
      };
      wait();
    })`,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  const value = result.result.value;
  if (!value.traceVisible || value.rows.length !== 8 || value.rows.some((row) => row.status !== "passed")) {
    throw new Error(`Game progress is incomplete: ${JSON.stringify(value)}`);
  }
  if (value.stageStatusDisplay !== "none") {
    throw new Error(`Animation debug status is visible during game progress: ${JSON.stringify(value)}`);
  }
  return value;
}

async function evaluatePromise(send, expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}

function createCdpSender(webSocket) {
  let nextId = 0;
  const pending = new Map();
  webSocket.on("message", (raw) => {
    const message = JSON.parse(String(raw));
    if (!message.id || !pending.has(message.id)) return;
    const { resolve: resolveCall, reject: rejectCall } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) rejectCall(new Error(JSON.stringify(message.error)));
    else resolveCall(message.result);
  });
  return (method, params = {}) => new Promise((resolveCall, rejectCall) => {
    const id = ++nextId;
    pending.set(id, { resolve: resolveCall, reject: rejectCall });
    webSocket.send(JSON.stringify({ id, method, params }));
  });
}

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolveClose) => server.close(resolveClose));
  return port;
}

async function waitForBrowser(port) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Browser is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Edge DevTools did not start.");
}

async function waitForExit(process, milliseconds) {
  if (process.exitCode !== null) return;
  await Promise.race([
    new Promise((resolveExit) => process.once("exit", resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))
  ]);
}
