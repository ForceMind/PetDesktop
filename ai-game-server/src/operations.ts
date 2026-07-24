import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { appendFile, mkdir, rename, rm, stat } from "node:fs/promises";
import path from "node:path";

const MAX_MEMORY_EVENTS = 500;
const MAX_LOG_BYTES = 5 * 1024 * 1024;

type DetailValue = string | number | boolean;

export type OperationEvent = {
  id: string;
  at: string;
  type: string;
  outcome: "ok" | "blocked" | "failed";
  browserId?: string;
  details: Record<string, DetailValue>;
};

export type BrowserActivity = {
  id: string;
  browser: string;
  platform: string;
  ip: string;
  firstSeen: string;
  lastSeen: string;
  visits: number;
  requests: number;
  lastPath: string;
};

type BrowserObservation = {
  id: string;
  userAgent?: string;
  remoteAddress?: string;
  path: string;
};

export class OperationsMonitor {
  private readonly browsers = new Map<string, BrowserActivity>();
  private readonly events: OperationEvent[] = [];
  private writeQueue = Promise.resolve();

  constructor(private readonly filePath?: string) {
    this.loadExistingEvents();
  }

  observeBrowser(input: BrowserObservation) {
    const now = new Date().toISOString();
    const parsed = describeUserAgent(input.userAgent ?? "");
    const id = anonymousBrowserId(input.id);
    const existing = this.browsers.get(id);
    const activity: BrowserActivity = existing
      ? {
          ...existing,
          browser: parsed.browser,
          platform: parsed.platform,
          ip: maskIp(input.remoteAddress ?? ""),
          lastSeen: now,
          visits: existing.visits + 1,
          requests: existing.requests + 1,
          lastPath: safePath(input.path)
        }
      : {
          id,
          browser: parsed.browser,
          platform: parsed.platform,
          ip: maskIp(input.remoteAddress ?? ""),
          firstSeen: now,
          lastSeen: now,
          visits: 1,
          requests: 1,
          lastPath: safePath(input.path)
        };
    this.browsers.set(id, activity);
    this.record("page_open", "ok", {
      browserId: input.id,
      details: {
        browser: activity.browser,
        platform: activity.platform,
        ip: activity.ip,
        path: activity.lastPath
      }
    });
  }

  touchBrowser(id: string | undefined, pathValue: string) {
    if (!id) return;
    const safeId = anonymousBrowserId(id);
    const existing = this.browsers.get(safeId);
    if (!existing) return;
    this.browsers.set(safeId, {
      ...existing,
      lastSeen: new Date().toISOString(),
      requests: existing.requests + 1,
      lastPath: safePath(pathValue)
    });
  }

  record(
    type: string,
    outcome: OperationEvent["outcome"],
    input: { browserId?: string; details?: Record<string, unknown> } = {}
  ) {
    const event: OperationEvent = {
      id: randomUUID(),
      at: new Date().toISOString(),
      type: safeToken(type),
      outcome,
      browserId: input.browserId ? anonymousBrowserId(input.browserId) : undefined,
      details: sanitizeDetails(input.details ?? {})
    };
    this.events.push(event);
    if (this.events.length > MAX_MEMORY_EVENTS) this.events.splice(0, this.events.length - MAX_MEMORY_EVENTS);
    this.persist(event);
    return event;
  }

  snapshot(chatEnabled: boolean) {
    const now = Date.now();
    return {
      chatEnabled,
      generatedAt: new Date(now).toISOString(),
      browsers: [...this.browsers.values()]
        .sort((left, right) => right.lastSeen.localeCompare(left.lastSeen))
        .slice(0, 100)
        .map((browser) => ({
          ...browser,
          active: now - Date.parse(browser.lastSeen) < 5 * 60_000
        })),
      events: [...this.events].reverse().slice(0, 200)
    };
  }

  private loadExistingEvents() {
    if (!this.filePath || !existsSync(this.filePath)) return;
    try {
      const lines = readFileSync(this.filePath, "utf8").trim().split(/\r?\n/).slice(-MAX_MEMORY_EVENTS);
      for (const line of lines) {
        const parsed = JSON.parse(line) as OperationEvent;
        if (!parsed?.id || !parsed?.at || !parsed?.type || !parsed?.details) continue;
        this.events.push(parsed);
        if (parsed.type === "page_open") this.restoreBrowser(parsed);
      }
    } catch {
      // A damaged audit file must never prevent Coco from starting.
    }
  }

  private restoreBrowser(event: OperationEvent) {
    const id = typeof event.details.browserId === "string"
      ? event.details.browserId
      : event.browserId;
    if (!id) return;
    const existing = this.browsers.get(id);
    this.browsers.set(id, {
      id,
      browser: String(event.details.browser ?? existing?.browser ?? "Unknown browser"),
      platform: String(event.details.platform ?? existing?.platform ?? "Unknown platform"),
      ip: String(event.details.ip ?? existing?.ip ?? "unknown"),
      firstSeen: existing?.firstSeen ?? event.at,
      lastSeen: event.at,
      visits: (existing?.visits ?? 0) + 1,
      requests: (existing?.requests ?? 0) + 1,
      lastPath: String(event.details.path ?? existing?.lastPath ?? "/")
    });
  }

  private persist(event: OperationEvent) {
    if (!this.filePath) return;
    this.writeQueue = this.writeQueue
      .then(async () => {
        const directory = path.dirname(this.filePath!);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        try {
          const info = await stat(this.filePath!);
          if (info.size >= MAX_LOG_BYTES) {
            const rotated = `${this.filePath}.1`;
            await rm(rotated, { force: true });
            await rename(this.filePath!, rotated);
          }
        } catch {
          // The first event creates the file.
        }
        await appendFile(this.filePath!, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
      })
      .catch(() => {
        // Audit persistence failures must never break chat or game result delivery.
      });
  }
}

function sanitizeDetails(source: Record<string, unknown>) {
  const output: Record<string, DetailValue> = {};
  for (const [key, value] of Object.entries(source).slice(0, 20)) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(key)) continue;
    if (typeof value === "boolean" || typeof value === "number") {
      output[key] = value;
    } else if (typeof value === "string") {
      output[key] = value.slice(0, 160);
    }
  }
  return output;
}

function safePath(value: string) {
  const pathOnly = value.split("?")[0] || "/";
  return pathOnly.startsWith("/") ? pathOnly.slice(0, 160) : "/";
}

function safeToken(value: string) {
  return /^[a-z][a-z0-9_]{0,39}$/.test(value) ? value : "unknown";
}

export function anonymousBrowserId(value: string) {
  if (/^[a-f0-9]{12}$/i.test(value)) return value.toLowerCase();
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function maskIp(value: string) {
  const normalized = value.replace(/^::ffff:/, "");
  const ipv4 = normalized.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) return `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}.*`;
  if (normalized.includes(":")) return `${normalized.split(":").slice(0, 4).join(":")}:*`;
  return normalized ? "masked" : "unknown";
}

function describeUserAgent(userAgent: string) {
  const browser = matchVersion(userAgent, /Edg\/([\d.]+)/, "Edge")
    ?? matchVersion(userAgent, /Firefox\/([\d.]+)/, "Firefox")
    ?? matchVersion(userAgent, /(?:Chrome|CriOS)\/([\d.]+)/, "Chrome")
    ?? matchVersion(userAgent, /Version\/([\d.]+).*Safari\//, "Safari")
    ?? "Unknown browser";
  const platform = /iPhone|iPad|iPod/.test(userAgent)
    ? "iOS"
    : /Android/.test(userAgent)
      ? "Android"
      : /Windows/.test(userAgent)
        ? "Windows"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "Unknown platform";
  return { browser, platform };
}

function matchVersion(userAgent: string, pattern: RegExp, name: string) {
  const match = userAgent.match(pattern);
  return match ? `${name} ${match[1].split(".")[0]}` : undefined;
}
