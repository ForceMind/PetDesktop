import { randomUUID, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { z } from "zod";
import { adminConfigView, adminUpdateSchema, applyAdminUpdate, writeEnvUpdates } from "./admin";
import { SlotAgent } from "./agent";
import { config, type AppConfig } from "./config";
import { publicError } from "./errors";
import { OperationsMonitor } from "./operations";

const chatSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().trim().min(1).max(1000),
  language: z.enum(["zh", "en"]).optional()
});

const executeSchema = z.object({
  sessionId: z.string().uuid(),
  language: z.enum(["zh", "en"]).optional()
});

const bootstrapSchema = z.object({
  language: z.enum(["zh", "en"]).default("en"),
  launchParams: z.record(z.string().max(64), z.string().max(512)).default({})
});

const chatStateSchema = z.object({ enabled: z.boolean() }).strict();

export function createApp(
  appConfig: AppConfig = config,
  options: { envFile?: string; operationsFile?: string | false } = {}
) {
  const app = express();
  let activeConfig = appConfig;
  let agent = new SlotAgent(activeConfig);
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(currentDir, "../..");
  const webRoot = path.join(repoRoot, "web");
  const envFile = options.envFile ?? path.join(repoRoot, "ai-game-server", ".env");
  const operationsFile = options.operationsFile === false
    ? undefined
    : options.operationsFile ?? (process.env.NODE_ENV === "test"
      ? undefined
      : path.join(repoRoot, "ai-game-server", ".data", "operations.jsonl"));
  const operations = new OperationsMonitor(operationsFile);

  app.disable("x-powered-by");
  app.use((request, response, next) => {
    response.setHeader("x-content-type-options", "nosniff");
    response.setHeader("x-frame-options", "DENY");
    response.setHeader("referrer-policy", "no-referrer");
    response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
    response.setHeader(
      "content-security-policy",
      "default-src 'self'; img-src 'self' data: https://games-web.coconut.tv; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    );
    if (request.path.startsWith("/api/")) response.setHeader("cache-control", "no-store");
    next();
  });
  app.use(express.json({ limit: "256kb" }));
  app.use((request, response, next) => {
    const browserId = ensureBrowserId(request, response);
    response.locals.browserId = browserId;
    if (isDocumentVisit(request)) {
      operations.observeBrowser({
        id: browserId,
        userAgent: request.get("user-agent"),
        remoteAddress: clientAddress(request),
        path: request.path
      });
    } else {
      operations.touchBrowser(browserId, request.path);
    }
    next();
  });

  app.get("/api/slot/health", (_request, response) => {
    response.json({
      ok: true,
      service: "coco-ai-game",
      demoMode: activeConfig.demoMode,
      chatEnabled: activeConfig.chatEnabled,
      aiMode: activeConfig.ai.apiKey ? "live" : "mock",
      gameMode: activeConfig.game.provider === "mock" ? "mock" : "live",
      gameProvider: activeConfig.game.provider
    });
  });

  app.use("/api/slot", (request, response, next) => {
    if (activeConfig.chatEnabled) {
      next();
      return;
    }
    operations.record("chat_blocked", "blocked", {
      browserId: response.locals.browserId,
      details: { path: request.path }
    });
    response.status(503).json({
      error: {
        message: "Coco chat is currently turned off.",
        code: "CHAT_DISABLED",
        status: 503
      }
    });
  });

  app.get("/api/slot/bootstrap", async (request, response, next) => {
    try {
      const result = await agent.bootstrap({
        language: request.get("accept-language")?.toLowerCase().includes("zh") ? "zh" : "en",
        launchParams: filterLaunchParams(request.query, activeConfig.game.launchParamKeys)
      });
      operations.record("chat_bootstrap", "ok", { browserId: response.locals.browserId });
      response.json(result);
    } catch (error) {
      operations.record("chat_bootstrap", "failed", {
        browserId: response.locals.browserId,
        details: { code: publicError(error).code }
      });
      next(error);
    }
  });

  app.post("/api/slot/bootstrap", async (request, response, next) => {
    try {
      const input = bootstrapSchema.parse(request.body);
      const result = await agent.bootstrap({
        language: input.language,
        launchParams: filterLaunchParams(input.launchParams, activeConfig.game.launchParamKeys)
      });
      operations.record("chat_bootstrap", "ok", { browserId: response.locals.browserId });
      response.json(result);
    } catch (error) {
      operations.record("chat_bootstrap", "failed", {
        browserId: response.locals.browserId,
        details: { code: publicError(error).code }
      });
      next(error);
    }
  });

  app.post("/api/slot/chat", async (request, response, next) => {
    try {
      const input = chatSchema.parse(request.body);
      const reply = await agent.chat(input.sessionId, input.message, input.language);
      operations.record("chat_request", "ok", {
        browserId: response.locals.browserId,
        details: { session: input.sessionId.slice(0, 8) }
      });
      response.json(reply);
    } catch (error) {
      operations.record("chat_request", "failed", {
        browserId: response.locals.browserId,
        details: { code: publicError(error).code }
      });
      next(error);
    }
  });

  app.post("/api/slot/actions/:actionId/execute", async (request, response) => {
    response.status(200);
    response.setHeader("content-type", "application/x-ndjson; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    response.setHeader("x-content-type-options", "nosniff");
    response.flushHeaders();
    const write = (value: unknown) => response.write(`${JSON.stringify(value)}\n`);
    try {
      const input = executeSchema.parse(request.body);
      const reply = await agent.execute(request.params.actionId, input.sessionId, (step) => {
        write({ type: "step", step });
      }, input.language, (progress) => {
        write({ type: "progress", progress });
      });
      operations.record("game_execute", "ok", {
        browserId: response.locals.browserId,
        details: {
          game: reply.result?.gameName ?? "unknown",
          rounds: reply.result?.spins.length ?? 0,
          net: reply.result?.net ?? 0
        }
      });
      write({ type: "final", reply });
    } catch (error) {
      operations.record("game_execute", "failed", {
        browserId: response.locals.browserId,
        details: { code: publicError(error).code }
      });
      write({ type: "error", error: publicError(error) });
    } finally {
      response.end();
    }
  });

  app.use("/api/admin", (request, response, next) => {
    response.setHeader("cache-control", "no-store");
    if (isAdminAuthorized(request, activeConfig)) {
      next();
      return;
    }
    response.status(401).json({
      error: {
        message: "Settings authorization is required.",
        code: "ADMIN_UNAUTHORIZED",
        status: 401
      }
    });
    operations.record("admin_auth", "blocked", {
      browserId: response.locals.browserId,
      details: { path: request.path }
    });
  });

  app.get("/api/admin/config", (_request, response) => {
    response.json({ config: adminConfigView(activeConfig) });
  });

  app.get("/api/admin/operations", (_request, response) => {
    response.json({ operations: operations.snapshot(activeConfig.chatEnabled) });
  });

  app.post("/api/admin/chat-state", async (request, response, next) => {
    try {
      const input = chatStateSchema.parse(request.body);
      await writeEnvUpdates(envFile, { CHAT_ENABLED: String(input.enabled) });
      activeConfig = { ...activeConfig, chatEnabled: input.enabled } as AppConfig;
      agent = new SlotAgent(activeConfig);
      operations.record("chat_state_changed", "ok", {
        browserId: response.locals.browserId,
        details: { enabled: input.enabled }
      });
      response.json({
        ok: true,
        chatEnabled: activeConfig.chatEnabled,
        sessionsReset: true
      });
    } catch (error) {
      operations.record("chat_state_changed", "failed", {
        browserId: response.locals.browserId,
        details: { code: publicError(error).code }
      });
      next(error);
    }
  });

  app.put("/api/admin/config", async (request, response, next) => {
    try {
      const input = adminUpdateSchema.parse(request.body);
      const update = applyAdminUpdate(activeConfig, input);
      await writeEnvUpdates(envFile, update.envUpdates);
      activeConfig = update.config;
      agent = new SlotAgent(activeConfig);
      operations.record("settings_saved", "ok", { browserId: response.locals.browserId });
      response.json({
        ok: true,
        applied: true,
        sessionsReset: true,
        config: adminConfigView(activeConfig)
      });
    } catch (error) {
      operations.record("settings_saved", "failed", {
        browserId: response.locals.browserId,
        details: { code: publicError(error).code }
      });
      next(error);
    }
  });

  app.use("/api/admin", (_request, response) => {
    response.status(404).json({
      error: { message: "Settings API path not found.", code: "ADMIN_API_NOT_FOUND", status: 404 }
    });
  });

  app.use("/api/slot", (_request, response) => {
    response.status(404).json({
      error: { message: "API 路径不存在。", code: "API_NOT_FOUND", status: 404 }
    });
  });

  app.use("/assets", express.static(path.join(repoRoot, "assets"), {
    immutable: true,
    maxAge: "7d",
    fallthrough: false
  }));
  app.get(/^\/settings$/, (_request, response) => {
    response.sendFile(path.join(webRoot, "admin.html"));
  });
  app.get(/^\/settings\/$/, (_request, response) => {
    response.redirect(308, "/settings");
  });
  app.get("/admin.html", (_request, response) => {
    response.redirect(308, "/settings");
  });
  app.use(express.static(webRoot, { etag: true, maxAge: 0 }));
  app.use((request, response, next) => {
    if (request.method === "GET" && !request.path.startsWith("/api/") && request.accepts("html")) {
      response.sendFile(path.join(webRoot, "index.html"));
      return;
    }
    next();
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    const payload = publicError(error);
    response.status(payload.status).json({ error: payload });
  });
  return app;
}

function filterLaunchParams(source: Record<string, unknown>, allowedKeys: readonly string[]) {
  const allowed = new Set(allowedKeys);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (allowed.has(key) && typeof value === "string" && value.length <= 512) result[key] = value;
  }
  return result;
}

function isDocumentVisit(request: express.Request) {
  return request.method === "GET"
    && !request.path.startsWith("/api/")
    && (request.get("sec-fetch-dest") === "document" || request.accepts("html") === "html");
}

function clientAddress(request: express.Request) {
  const forwarded = request.get("x-real-ip") || request.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.socket.remoteAddress;
}

function ensureBrowserId(request: express.Request, response: express.Response) {
  const cookies = request.get("cookie") ?? "";
  const existing = cookies
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("coco_browser_id="))
    ?.slice("coco_browser_id=".length);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const generated = randomUUID();
  const secure = request.secure || request.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
  response.append(
    "set-cookie",
    `coco_browser_id=${generated}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`
  );
  return generated;
}

function isAdminAuthorized(request: express.Request, appConfig: AppConfig) {
  const remoteAddress = request.socket.remoteAddress ?? "";
  const loopback = remoteAddress === "::1"
    || remoteAddress === "127.0.0.1"
    || remoteAddress.startsWith("127.")
    || remoteAddress.startsWith("::ffff:127.");
  const expected = appConfig.admin.token;
  const localBinding = ["127.0.0.1", "::1", "localhost"].includes(appConfig.host.toLowerCase());
  if (!expected) return localBinding && loopback;
  const authorization = request.get("authorization") ?? "";
  const supplied = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7)
    : request.get("x-admin-token") ?? "";
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);
  return expectedBuffer.length === suppliedBuffer.length
    && expectedBuffer.length > 0
    && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const app = createApp();
  app.listen(config.port, config.host, () => {
    console.log(`Coco Chat is ready at http://${config.host}:${config.port}`);
  });
}
