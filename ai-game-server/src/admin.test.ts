import { promises as fs } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config, type AppConfig } from "./config";
import { createApp } from "./server";

let server: Server;
let baseUrl: string;
let tempDir: string;
let envFile: string;

const protectedConfig = {
  ...config,
  host: "127.0.0.1",
  admin: { token: "" },
  ai: { ...config.ai, apiKey: "ai-private-value" },
  game: {
    ...config.game,
    provider: "mock",
    baseUrl: "",
    catalog: [
      { id: "coco-fortune", name: "Coco Fortune", provider: "Coco Lab", enabled: true, minBet: 1, maxBet: 10, theme: "fortune" }
    ],
    apiKey: "game-private-value",
    accountToken: "account-private-value"
  }
} as AppConfig;

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "coco-admin-test-"));
  envFile = path.join(tempDir, ".env");
  server = createApp(protectedConfig, { envFile }).listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await fs.rm(tempDir, { recursive: true, force: true });
});

describe("Admin control plane", () => {
  it("never returns secrets and hot-applies validated settings", async () => {
    const initialResponse = await fetch(`${baseUrl}/api/admin/config`);
    const initialText = await initialResponse.text();
    expect(initialResponse.ok).toBe(true);
    expect(initialText).not.toContain("ai-private-value");
    expect(initialText).not.toContain("game-private-value");
    expect(initialText).not.toContain("account-private-value");
    const initial = JSON.parse(initialText).config;
    expect(initial.ai.apiKeyConfigured).toBe(true);

    const bootstrap = await fetch(`${baseUrl}/api/slot/bootstrap`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language: "en", launchParams: {} })
    }).then((response) => response.json());

    const update = {
      demoMode: initial.demoMode,
      ai: {
        apiStyle: initial.ai.apiStyle,
        baseUrl: initial.ai.baseUrl,
        model: "admin-updated-model",
        chatPath: initial.ai.chatPath,
        responsesPath: initial.ai.responsesPath,
        jsonMode: initial.ai.jsonMode,
        timeoutMs: initial.ai.timeoutMs,
        reasoningEffort: initial.ai.reasoningEffort,
        apiKeyAction: "keep"
      },
      game: {
        provider: initial.game.provider,
        baseUrl: initial.game.baseUrl,
        apiKeyAction: "keep",
        listPath: initial.game.listPath,
        initPath: initial.game.initPath,
        playPath: initial.game.playPath,
        lobbyBaseUrl: initial.game.lobbyBaseUrl,
        lobbyLoginPath: initial.game.lobbyLoginPath,
        lobbyIg: initial.game.lobbyIg,
        slotIg: initial.game.slotIg,
        bingoIg: initial.game.bingoIg,
        bingoInitPath: initial.game.bingoInitPath,
        bingoPlayPath: initial.game.bingoPlayPath,
        charmedIg: initial.game.charmedIg,
        charmedInitPath: initial.game.charmedInitPath,
        charmedPlayPath: initial.game.charmedPlayPath,
        fruitIg: initial.game.fruitIg,
        fruitInitPath: initial.game.fruitInitPath,
        fruitPlayPath: initial.game.fruitPlayPath,
        jetsetIg: initial.game.jetsetIg,
        jetsetInitPath: initial.game.jetsetInitPath,
        jetsetPlayPath: initial.game.jetsetPlayPath,
        playableIds: initial.game.playableIds,
        origin: initial.game.origin,
        wagerMultiplier: initial.game.wagerMultiplier,
        accountId: initial.game.accountId,
        accountTokenAction: "keep",
        currency: initial.game.currency,
        timeoutMs: initial.game.timeoutMs,
        launchParamKeys: initial.game.launchParamKeys,
        accountParam: initial.game.accountParam,
        catalog: initial.game.catalog
      },
      limits: { ...initial.limits, maxSpins: initial.limits.maxSpins + 1 }
    };

    const saveResponse = await fetch(`${baseUrl}/api/admin/config`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(update)
    });
    const saved = await saveResponse.json();
    expect(saveResponse.ok).toBe(true);
    expect(saved.applied).toBe(true);
    expect(saved.sessionsReset).toBe(true);
    expect(saved.config.ai.model).toBe("admin-updated-model");

    const envText = await fs.readFile(envFile, "utf8");
    expect(envText).toContain("AI_MODEL=admin-updated-model");
    expect(envText).not.toContain("private-value");

    const oldSessionResponse = await fetch(`${baseUrl}/api/slot/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: bootstrap.sessionId, message: "hello", language: "en" })
    });
    expect(oldSessionResponse.status).toBe(404);
  });

  it("requires a constant-time bearer token when ADMIN_TOKEN is configured", async () => {
    const tokenConfig = {
      ...config,
      admin: { token: "admin-test-token" }
    } as AppConfig;
    const tokenServer = createApp(tokenConfig, { envFile: path.join(tempDir, "token.env") }).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => tokenServer.once("listening", resolve));
    const tokenBase = `http://127.0.0.1:${(tokenServer.address() as AddressInfo).port}`;
    try {
      expect((await fetch(`${tokenBase}/api/admin/config`)).status).toBe(401);
      expect((await fetch(`${tokenBase}/api/admin/config`, {
        headers: { authorization: "Bearer admin-test-token" }
      })).status).toBe(200);
    } finally {
      await new Promise<void>((resolve, reject) => tokenServer.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("tracks privacy-safe browser activity and hard-blocks chat, AI and games with one switch", async () => {
    const switchEnvFile = path.join(tempDir, "chat-switch.env");
    const switchConfig = {
      ...config,
      host: "127.0.0.1",
      chatEnabled: true,
      admin: { token: "switch-test-token" },
      ai: { ...config.ai, apiKey: "" },
      game: { ...config.game, provider: "mock", baseUrl: "" }
    } as AppConfig;
    const switchServer = createApp(switchConfig, {
      envFile: switchEnvFile,
      operationsFile: false
    }).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => switchServer.once("listening", resolve));
    const switchBase = `http://127.0.0.1:${(switchServer.address() as AddressInfo).port}`;
    const authHeaders = { authorization: "Bearer switch-test-token" };
    const privateUserId = "private-user-id-must-not-be-logged";
    const privateMessage = "private-chat-text-must-not-be-logged";

    try {
      const pageResponse = await fetch(`${switchBase}/settings?userId=${privateUserId}`, {
        headers: {
          accept: "text/html",
          "sec-fetch-dest": "document",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0.0.0 Safari/537.36",
          "x-real-ip": "203.0.113.42"
        }
      });
      expect(pageResponse.ok).toBe(true);
      const cookie = pageResponse.headers.get("set-cookie")?.split(";")[0];
      expect(cookie).toMatch(/^coco_browser_id=/);

      const browserHeaders = { ...authHeaders, cookie: cookie! };
      const bootstrapResponse = await fetch(`${switchBase}/api/slot/bootstrap`, {
        method: "POST",
        headers: { ...browserHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          language: "en",
          launchParams: { userId: privateUserId }
        })
      });
      expect(bootstrapResponse.ok).toBe(true);
      const bootstrap = await bootstrapResponse.json();
      const chatResponse = await fetch(`${switchBase}/api/slot/chat`, {
        method: "POST",
        headers: { ...browserHeaders, "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: bootstrap.sessionId,
          message: privateMessage,
          language: "en"
        })
      });
      expect(chatResponse.ok).toBe(true);

      const initialOperations = await fetch(`${switchBase}/api/admin/operations`, {
        headers: browserHeaders
      }).then((response) => response.json());
      const initialText = JSON.stringify(initialOperations);
      expect(initialText).not.toContain(privateUserId);
      expect(initialText).not.toContain(privateMessage);
      expect(initialOperations.operations.browsers).toHaveLength(1);
      expect(initialOperations.operations.browsers[0]).toMatchObject({
        browser: "Chrome 150",
        platform: "Windows",
        ip: "203.0.113.*",
        lastPath: "/api/admin/operations"
      });

      const disableResponse = await fetch(`${switchBase}/api/admin/chat-state`, {
        method: "POST",
        headers: { ...browserHeaders, "content-type": "application/json" },
        body: JSON.stringify({ enabled: false })
      });
      expect(disableResponse.ok).toBe(true);
      expect((await disableResponse.json()).chatEnabled).toBe(false);
      expect(await fs.readFile(switchEnvFile, "utf8")).toContain("CHAT_ENABLED=false");

      const health = await fetch(`${switchBase}/api/slot/health`).then((response) => response.json());
      expect(health.chatEnabled).toBe(false);
      const blockedResponse = await fetch(`${switchBase}/api/slot/bootstrap`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ language: "en", launchParams: {} })
      });
      expect(blockedResponse.status).toBe(503);
      expect((await blockedResponse.json()).error.code).toBe("CHAT_DISABLED");

      const enableResponse = await fetch(`${switchBase}/api/admin/chat-state`, {
        method: "POST",
        headers: { ...browserHeaders, "content-type": "application/json" },
        body: JSON.stringify({ enabled: true })
      });
      expect(enableResponse.ok).toBe(true);
      expect((await enableResponse.json()).chatEnabled).toBe(true);
      expect((await fetch(`${switchBase}/api/slot/bootstrap`)).ok).toBe(true);

      const finalOperations = await fetch(`${switchBase}/api/admin/operations`, {
        headers: browserHeaders
      }).then((response) => response.json());
      expect(finalOperations.operations.events.some(
        (event: { type: string; outcome: string }) => event.type === "chat_blocked" && event.outcome === "blocked"
      )).toBe(true);
      expect(finalOperations.operations.events.filter(
        (event: { type: string }) => event.type === "chat_state_changed"
      )).toHaveLength(2);
    } finally {
      await new Promise<void>((resolve, reject) => switchServer.close((error) => error ? reject(error) : resolve()));
    }
  });
});
