import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ConversationArchive } from "./conversation-archive";
import { anonymousBrowserId } from "./operations";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.rm(directory, { recursive: true, force: true })
  ));
});

describe("ConversationArchive", () => {
  it("persists per-browser conversations while redacting configured and patterned secrets", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "coco-conversations-"));
    temporaryDirectories.push(directory);
    const file = path.join(directory, "conversations.json");
    const browserCookie = "dfb9651d-18c0-42c2-9e64-8a45e175cf09";
    const archive = new ConversationArchive(
      file,
      { enabled: true, retentionDays: 7 },
      ["private-account", "private-ig", "private-api-key"]
    );

    archive.start("session-one", browserCookie, "zh", "你好，我是 Coco！");
    archive.recordUser(
      "session-one",
      browserCookie,
      "zh",
      "账号 private-account，userId=another-user，ig=another-ig，key private-api-key，sk-private123456"
    );
    archive.recordCoco("session-one", browserCookie, "zh", "proposal", "已经准备好确认卡。", {
      game: "JetSet",
      rounds: 2,
      betLevel: 10,
      totalBet: 20,
      currency: "TOKEN"
    });
    archive.recordCoco("session-one", browserCookie, "zh", "game_result", "两局完成。", {
      game: "JetSet",
      rounds: 2,
      totalBet: 20,
      totalWin: 35,
      net: 15,
      balanceAfter: 1_000,
      currency: "TOKEN",
      roundResults: [
        { round: 1, bet: 10, win: 0 },
        { round: 2, bet: 10, win: 35 }
      ]
    });
    await archive.flush();

    const overview = archive.overview([{
      id: anonymousBrowserId(browserCookie),
      browser: "Chrome 150",
      platform: "Windows",
      ip: "203.0.113.*",
      lastSeen: new Date().toISOString(),
      active: true
    }]);
    expect(overview.totals).toEqual({ users: 1, conversations: 1, messages: 4 });
    expect(overview.users[0]).toMatchObject({
      browserId: anonymousBrowserId(browserCookie),
      browser: "Chrome 150",
      platform: "Windows",
      ip: "203.0.113.*"
    });

    const reloaded = new ConversationArchive(file, { enabled: true, retentionDays: 7 });
    const conversation = reloaded.getConversation(overview.conversations[0].id);
    const serialized = JSON.stringify(conversation);
    expect(conversation?.messages.at(-1)?.metadata?.roundResults).toHaveLength(2);
    expect(serialized).not.toContain("private-account");
    expect(serialized).not.toContain("another-user");
    expect(serialized).not.toContain("another-ig");
    expect(serialized).not.toContain("private-api-key");
    expect(serialized).not.toContain("sk-private123456");
    expect(serialized).toContain("[hidden]");

    await reloaded.configure({ enabled: false, retentionDays: 7 });
    reloaded.recordUser("session-one", browserCookie, "zh", "关闭后不应保存");
    expect(JSON.stringify(reloaded.getConversation(overview.conversations[0].id))).not.toContain("关闭后不应保存");

    expect(await reloaded.deleteBrowser(anonymousBrowserId(browserCookie))).toBe(1);
    expect(reloaded.overview().totals.conversations).toBe(0);
  });
});
