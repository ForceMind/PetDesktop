import type { AddressInfo } from "node:net";
import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CompatibleAi, deterministicSummary } from "./ai";
import { config } from "./config";

const requests: Array<Record<string, unknown>> = [];
const server = createServer((request, response) => {
  let body = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => { body += chunk; });
  request.on("end", () => {
    const payload = JSON.parse(body) as Record<string, unknown>;
    requests.push(payload);
    if (requests.length === 1 && payload.response_format) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "response_format unsupported" } }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({
      choices: [{
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            coco_slot_intent: {
              intent: "play_slot",
              gameQuery: "coco-fortune",
              spins: 3,
              betPerSpin: 1,
              response: "我先生成确认卡。"
            }
          })
        }
      }]
    }));
  });
});

let baseUrl: string;

beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe("OpenAI-compatible Chat Completions client", () => {
  it("uses JSON mode and retries gateways that reject response_format", async () => {
    const client = new CompatibleAi({
      ...config.ai,
      apiKey: "test-key",
      apiStyle: "chat-completions",
      baseUrl,
      model: "compatible-test-model",
      chatPath: "/chat/completions",
      jsonMode: true
    });
    const result = await client.understand(
      "玩 Coco Fortune 3 局，每局下注 1",
      [{ id: "coco-fortune", name: "Coco Fortune", provider: "test", enabled: true, minBet: 1, maxBet: 10, theme: "fortune" }],
      [],
      "test-session",
      "en"
    );

    expect(result).toMatchObject({ intent: "play_slot", spins: 3, betPerSpin: 1 });
    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      model: "compatible-test-model",
      response_format: { type: "json_object" }
    });
    expect(requests[1]).not.toHaveProperty("response_format");
  });
});

describe("grounded result copy", () => {
  it("uses multiple deterministic celebration styles when the model is unavailable", () => {
    const messages = ["a", "b", "c", "d"].map((transactionId) => deterministicSummary({
      transactionId,
      gameId: "demo",
      gameName: "Demo",
      spins: [{ index: 1, symbols: ["A", "A", "A"], bet: 10, win: 20 }],
      totalBet: 10,
      totalWin: 20,
      net: 10,
      balanceBefore: 100,
      balanceAfter: 110,
      currency: "TOKEN"
    }, "zh").message);
    expect(new Set(messages).size).toBe(4);
    expect(messages.every((message) => /Coco|星群|漂亮|数字河/.test(message))).toBe(true);
  });
});
