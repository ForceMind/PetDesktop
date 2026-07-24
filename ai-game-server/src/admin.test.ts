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
});
