import { describe, expect, it } from "vitest";
import { deterministicSummary } from "./ai";

describe("grounded celebration copy", () => {
  it("uses eight grounded celebration styles in both languages", () => {
    const resultFor = (transactionId: string) => ({
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
    });
    const transactionIds = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const zhMessages = transactionIds.map((id) => deterministicSummary(resultFor(id), "zh").message);
    const enMessages = transactionIds.map((id) => deterministicSummary(resultFor(id), "en").message);

    expect(new Set(zhMessages).size).toBe(8);
    expect(new Set(enMessages).size).toBe(8);
    expect(zhMessages.every((message) => /[\u4e00-\u9fff]/.test(message))).toBe(true);
    expect(enMessages.every((message) => /portal|Coco|signal stars|Data River|feathers|sparkling|bright|current|wing-flap/i.test(message))).toBe(true);
    expect(zhMessages.every((message) => !/^\u606d\u559c/.test(message))).toBe(true);
    expect(enMessages.every((message) => !/^Congratulations\b/i.test(message))).toBe(true);
    for (const message of [...zhMessages, ...enMessages]) {
      expect(message).toContain("10 TOKEN");
      expect(message).toContain("20 TOKEN");
      expect(message).toContain("+10 TOKEN");
      expect(message).toContain("110 TOKEN");
    }
  });
});
