import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Language } from "./contracts";
import { anonymousBrowserId } from "./operations";

const MAX_CONVERSATIONS = 500;
const MAX_MESSAGES_PER_CONVERSATION = 250;
const MAX_TOTAL_MESSAGES = 5_000;

export type ConversationArchiveSettings = {
  enabled: boolean;
  retentionDays: number;
};

export type ArchiveMessageKind =
  | "greeting"
  | "chat"
  | "game_list"
  | "proposal"
  | "game_result"
  | "error";

export type ArchiveMetadata = {
  games?: string[];
  game?: string;
  rounds?: number;
  betLevel?: number;
  wagerPerRound?: number;
  totalBet?: number;
  totalWin?: number;
  net?: number;
  balanceAfter?: number;
  currency?: string;
  errorCode?: string;
  roundResults?: Array<{ round: number; bet: number; win: number }>;
};

export type ArchivedMessage = {
  id: string;
  at: string;
  role: "user" | "coco" | "system";
  kind: ArchiveMessageKind;
  message: string;
  metadata?: ArchiveMetadata;
};

export type ArchivedConversation = {
  id: string;
  browserId: string;
  language: Language;
  startedAt: string;
  lastActivity: string;
  messages: ArchivedMessage[];
};

type BrowserProfile = {
  id: string;
  browser: string;
  platform: string;
  ip: string;
  lastSeen: string;
  active?: boolean;
};

type ArchiveFile = {
  version: 1;
  conversations: ArchivedConversation[];
};

export class ConversationArchive {
  private readonly conversations = new Map<string, ArchivedConversation>();
  private readonly deletedSessions = new Set<string>();
  private writeQueue = Promise.resolve();
  private persistenceHealthy = true;
  private settings: ConversationArchiveSettings;
  private sensitiveValues: string[];

  constructor(
    private readonly filePath: string | undefined,
    settings: ConversationArchiveSettings,
    sensitiveValues: string[] = []
  ) {
    this.settings = normalizeSettings(settings);
    this.sensitiveValues = normalizeSensitiveValues(sensitiveValues);
    this.load();
    if (this.prune()) void this.persist();
  }

  getSettings() {
    return { ...this.settings };
  }

  async configure(settings: ConversationArchiveSettings, sensitiveValues = this.sensitiveValues) {
    this.settings = normalizeSettings(settings);
    this.sensitiveValues = normalizeSensitiveValues(sensitiveValues);
    for (const conversation of this.conversations.values()) {
      for (const message of conversation.messages) {
        message.message = this.redact(message.message);
        if (message.metadata) {
          message.metadata = sanitizeMetadata(message.metadata, (value) => this.redact(value));
        }
      }
    }
    this.prune();
    await this.persist();
    return this.getSettings();
  }

  start(
    sessionId: string,
    browserId: string,
    language: Language,
    greeting: string
  ) {
    if (!this.settings.enabled) return;
    const id = conversationId(sessionId);
    this.deletedSessions.delete(id);
    if (this.conversations.has(id)) return;
    const now = new Date().toISOString();
    const conversation: ArchivedConversation = {
      id,
      browserId: anonymousBrowserId(browserId),
      language,
      startedAt: now,
      lastActivity: now,
      messages: []
    };
    this.conversations.set(id, conversation);
    this.append(conversation, "coco", "greeting", greeting);
  }

  recordUser(sessionId: string, browserId: string, language: Language, message: string) {
    this.record(sessionId, browserId, language, "user", "chat", message);
  }

  recordCoco(
    sessionId: string,
    browserId: string,
    language: Language,
    kind: ArchiveMessageKind,
    message: string,
    metadata?: ArchiveMetadata
  ) {
    this.record(sessionId, browserId, language, "coco", kind, message, metadata);
  }

  recordError(
    sessionId: string,
    browserId: string,
    language: Language,
    errorCode: string
  ) {
    if (!this.conversations.has(conversationId(sessionId))) return;
    const message = language === "zh" ? `请求失败：${errorCode}` : `Request failed: ${errorCode}`;
    this.record(sessionId, browserId, language, "system", "error", message, { errorCode });
  }

  overview(browserProfiles: BrowserProfile[] = []) {
    if (this.prune()) void this.persist();
    const profiles = new Map(browserProfiles.map((profile) => [profile.id, profile]));
    const conversations = this.sortedConversations().map((conversation) => ({
      id: conversation.id,
      browserId: conversation.browserId,
      language: conversation.language,
      startedAt: conversation.startedAt,
      lastActivity: conversation.lastActivity,
      messageCount: conversation.messages.length,
      preview: conversation.messages.at(-1)?.message.slice(0, 120) ?? ""
    }));
    const users = new Map<string, {
      browserId: string;
      browser: string;
      platform: string;
      ip: string;
      lastSeen: string;
      active: boolean;
      conversationCount: number;
      messageCount: number;
    }>();
    for (const conversation of conversations) {
      const profile = profiles.get(conversation.browserId);
      const current = users.get(conversation.browserId);
      users.set(conversation.browserId, {
        browserId: conversation.browserId,
        browser: profile?.browser ?? current?.browser ?? "Unknown browser",
        platform: profile?.platform ?? current?.platform ?? "Unknown platform",
        ip: profile?.ip ?? current?.ip ?? "unknown",
        lastSeen: later(profile?.lastSeen, conversation.lastActivity, current?.lastSeen),
        active: profile?.active ?? current?.active ?? false,
        conversationCount: (current?.conversationCount ?? 0) + 1,
        messageCount: (current?.messageCount ?? 0) + conversation.messageCount
      });
    }
    return {
      settings: this.getSettings(),
      persistenceHealthy: this.persistenceHealthy,
      totals: {
        users: users.size,
        conversations: conversations.length,
        messages: conversations.reduce((total, item) => total + item.messageCount, 0)
      },
      users: [...users.values()].sort((left, right) => right.lastSeen.localeCompare(left.lastSeen)),
      conversations
    };
  }

  getConversation(id: string) {
    if (this.prune()) void this.persist();
    const conversation = this.conversations.get(id);
    return conversation ? cloneConversation(conversation) : undefined;
  }

  async deleteConversation(id: string) {
    this.deletedSessions.add(id);
    const deleted = this.conversations.delete(id);
    if (deleted) await this.persist();
    return deleted;
  }

  async deleteBrowser(browserId: string) {
    let deleted = 0;
    for (const [id, conversation] of this.conversations) {
      if (conversation.browserId !== browserId) continue;
      this.deletedSessions.add(id);
      this.conversations.delete(id);
      deleted += 1;
    }
    if (deleted) await this.persist();
    return deleted;
  }

  async clear() {
    for (const id of this.conversations.keys()) this.deletedSessions.add(id);
    const deleted = this.conversations.size;
    this.conversations.clear();
    await this.persist();
    return deleted;
  }

  async flush() {
    await this.writeQueue;
  }

  private record(
    sessionId: string,
    browserId: string,
    language: Language,
    role: ArchivedMessage["role"],
    kind: ArchiveMessageKind,
    message: string,
    metadata?: ArchiveMetadata
  ) {
    if (!this.settings.enabled) return;
    const id = conversationId(sessionId);
    if (this.deletedSessions.has(id)) return;
    let conversation = this.conversations.get(id);
    if (!conversation) {
      const now = new Date().toISOString();
      conversation = {
        id,
        browserId: anonymousBrowserId(browserId),
        language,
        startedAt: now,
        lastActivity: now,
        messages: []
      };
      this.conversations.set(id, conversation);
    }
    conversation.language = language;
    this.append(conversation, role, kind, message, metadata);
  }

  private append(
    conversation: ArchivedConversation,
    role: ArchivedMessage["role"],
    kind: ArchiveMessageKind,
    message: string,
    metadata?: ArchiveMetadata
  ) {
    const at = new Date().toISOString();
    conversation.messages.push({
      id: randomUUID(),
      at,
      role,
      kind,
      message: this.redact(message).slice(0, 2_000),
      ...(metadata ? { metadata: sanitizeMetadata(metadata, (value) => this.redact(value)) } : {})
    });
    if (conversation.messages.length > MAX_MESSAGES_PER_CONVERSATION) {
      conversation.messages.splice(1, conversation.messages.length - MAX_MESSAGES_PER_CONVERSATION);
    }
    conversation.lastActivity = at;
    this.prune();
    void this.persist();
  }

  private redact(value: string) {
    let output = value;
    for (const secret of this.sensitiveValues) output = output.split(secret).join("[hidden]");
    return output
      .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[hidden]")
      .replace(/(bearer\s+)[^\s,;]+/gi, "$1[hidden]")
      .replace(
        /((?:userId|openId|roomId|accountId|accountToken|accessToken|authorization|password|passwd|secret|api[_-]?key|ig)\s*[=:]\s*)[^\s,&;]+/gi,
        "$1[hidden]"
      );
  }

  private sortedConversations() {
    return [...this.conversations.values()]
      .sort((left, right) => right.lastActivity.localeCompare(left.lastActivity));
  }

  private prune() {
    let changed = false;
    const cutoff = Date.now() - this.settings.retentionDays * 24 * 60 * 60 * 1_000;
    for (const [id, conversation] of this.conversations) {
      if (Date.parse(conversation.lastActivity) < cutoff) {
        this.conversations.delete(id);
        changed = true;
      }
    }
    const overflow = this.sortedConversations().slice(MAX_CONVERSATIONS);
    for (const conversation of overflow) {
      this.conversations.delete(conversation.id);
      changed = true;
    }
    let messageCount = this.sortedConversations()
      .reduce((total, conversation) => total + conversation.messages.length, 0);
    for (const conversation of this.sortedConversations().reverse()) {
      if (messageCount <= MAX_TOTAL_MESSAGES) break;
      this.conversations.delete(conversation.id);
      messageCount -= conversation.messages.length;
      changed = true;
    }
    return changed;
  }

  private load() {
    if (!this.filePath || !existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as ArchiveFile;
      if (parsed.version !== 1 || !Array.isArray(parsed.conversations)) return;
      for (const conversation of parsed.conversations) {
        if (!isConversation(conversation)) continue;
        this.conversations.set(conversation.id, conversation);
      }
    } catch {
      this.persistenceHealthy = false;
    }
  }

  private persist() {
    if (!this.filePath) return Promise.resolve();
    const payload: ArchiveFile = {
      version: 1,
      conversations: this.sortedConversations().map(cloneConversation)
    };
    const serialized = JSON.stringify(payload);
    this.writeQueue = this.writeQueue
      .then(async () => {
        const directory = path.dirname(this.filePath!);
        const temporary = `${this.filePath}.${process.pid}.tmp`;
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await writeFile(temporary, serialized, { encoding: "utf8", mode: 0o600 });
        try {
          await rename(temporary, this.filePath!);
        } catch {
          await copyFile(temporary, this.filePath!);
          await rm(temporary, { force: true });
        }
        this.persistenceHealthy = true;
      })
      .catch(() => {
        this.persistenceHealthy = false;
      });
    return this.writeQueue;
  }
}

function conversationId(sessionId: string) {
  return createHash("sha256").update(sessionId).digest("hex").slice(0, 16);
}

function normalizeSettings(settings: ConversationArchiveSettings) {
  return {
    enabled: settings.enabled !== false,
    retentionDays: Math.min(90, Math.max(1, Math.trunc(settings.retentionDays || 7)))
  };
}

function normalizeSensitiveValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length >= 4))]
    .sort((left, right) => right.length - left.length);
}

function sanitizeMetadata(metadata: ArchiveMetadata, redact: (value: string) => string): ArchiveMetadata {
  return {
    ...(metadata.games ? { games: metadata.games.slice(0, 20).map((game) => redact(game).slice(0, 120)) } : {}),
    ...(metadata.game ? { game: redact(metadata.game).slice(0, 120) } : {}),
    ...finite("rounds", metadata.rounds),
    ...finite("betLevel", metadata.betLevel),
    ...finite("wagerPerRound", metadata.wagerPerRound),
    ...finite("totalBet", metadata.totalBet),
    ...finite("totalWin", metadata.totalWin),
    ...finite("net", metadata.net),
    ...finite("balanceAfter", metadata.balanceAfter),
    ...(metadata.currency ? { currency: redact(metadata.currency).slice(0, 20) } : {}),
    ...(metadata.errorCode ? { errorCode: redact(metadata.errorCode).slice(0, 80) } : {}),
    ...(metadata.roundResults ? {
      roundResults: metadata.roundResults.slice(0, 100).flatMap((item) =>
        Number.isFinite(item.round) && Number.isFinite(item.bet) && Number.isFinite(item.win)
          ? [{ round: item.round, bet: item.bet, win: item.win }]
          : []
      )
    } : {})
  };
}

function finite<Key extends keyof ArchiveMetadata>(key: Key, value: number | undefined) {
  return Number.isFinite(value) ? { [key]: value } as Pick<ArchiveMetadata, Key> : {};
}

function cloneConversation(conversation: ArchivedConversation): ArchivedConversation {
  return structuredClone(conversation);
}

function isConversation(value: ArchivedConversation) {
  return typeof value?.id === "string"
    && /^[a-f0-9]{16}$/i.test(value.id)
    && typeof value.browserId === "string"
    && /^[a-f0-9]{12}$/i.test(value.browserId)
    && (value.language === "zh" || value.language === "en")
    && typeof value.startedAt === "string"
    && typeof value.lastActivity === "string"
    && Array.isArray(value.messages);
}

function later(...values: Array<string | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) ?? "";
}
