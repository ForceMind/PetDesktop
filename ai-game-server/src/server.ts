import { timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import express from "express";
import { z } from "zod";
import { adminConfigView, adminUpdateSchema, applyAdminUpdate, writeEnvUpdates } from "./admin";
import { SlotAgent } from "./agent";
import { config, type AppConfig } from "./config";
import { publicError } from "./errors";

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

export function createApp(appConfig: AppConfig = config, options: { envFile?: string } = {}) {
  const app = express();
  let activeConfig = appConfig;
  let agent = new SlotAgent(activeConfig);
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(currentDir, "../..");
  const webRoot = path.join(repoRoot, "web");
  const envFile = options.envFile ?? path.join(repoRoot, "ai-game-server", ".env");

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

  app.get("/api/slot/health", (_request, response) => {
    response.json({
      ok: true,
      service: "coco-ai-game",
      demoMode: activeConfig.demoMode,
      aiMode: activeConfig.ai.apiKey ? "live" : "mock",
      gameMode: activeConfig.game.provider === "mock" ? "mock" : "live",
      gameProvider: activeConfig.game.provider
    });
  });

  app.get("/api/slot/bootstrap", async (request, response, next) => {
    try {
      response.json(await agent.bootstrap({
        language: request.get("accept-language")?.toLowerCase().includes("zh") ? "zh" : "en",
        launchParams: filterLaunchParams(request.query, activeConfig.game.launchParamKeys)
      }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/slot/bootstrap", async (request, response, next) => {
    try {
      const input = bootstrapSchema.parse(request.body);
      response.json(await agent.bootstrap({
        language: input.language,
        launchParams: filterLaunchParams(input.launchParams, activeConfig.game.launchParamKeys)
      }));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/slot/chat", async (request, response, next) => {
    try {
      const input = chatSchema.parse(request.body);
      response.json(await agent.chat(input.sessionId, input.message, input.language));
    } catch (error) {
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
      write({ type: "final", reply });
    } catch (error) {
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
  });

  app.get("/api/admin/config", (_request, response) => {
    response.json({ config: adminConfigView(activeConfig) });
  });

  app.put("/api/admin/config", async (request, response, next) => {
    try {
      const input = adminUpdateSchema.parse(request.body);
      const update = applyAdminUpdate(activeConfig, input);
      await writeEnvUpdates(envFile, update.envUpdates);
      activeConfig = update.config;
      agent = new SlotAgent(activeConfig);
      response.json({
        ok: true,
        applied: true,
        sessionsReset: true,
        config: adminConfigView(activeConfig)
      });
    } catch (error) {
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
