import { randomUUID } from "node:crypto";
import { Client } from "@mubit-ai/sdk";
import { isMubitEnabled } from "@/lib/memory/mubit";

export type RepoRunStats = {
  repo: string;
  repoUrl?: string;
  runs: number;
  filesScanned: number;
  lastRunAt: string;
};

export type ScanStats = {
  available: boolean;
  storage: "mubit" | "unconfigured";
  totalRuns: number;
  totalFilesScanned: number;
  repositoryCount: number;
  lastRunAt: string | null;
  repositories: RepoRunStats[];
};

export type ScanRunEvent = {
  repo: string;
  repoUrl?: string;
  scannedFiles: number;
  timestamp?: string;
};

type StoredScanRunEvent = {
  kind: "repo-deputy-scan-run";
  version: 1;
  repo: string;
  repoUrl?: string;
  scannedFiles: number;
  timestamp: string;
};

type MubitStatsClient = {
  remember(options: {
    session_id: string;
    agent_id: string;
    content: string;
    intent: string;
    lesson_type: string;
    lesson_scope: string;
    metadata: StoredScanRunEvent;
    upsert_key: string;
  }): Promise<unknown>;
  control: {
    lessons(payload: { run_id: string; scope: string; limit: number }): Promise<unknown>;
  };
};

const EMPTY_CONFIGURED_STATS: ScanStats = {
  available: true,
  storage: "mubit",
  totalRuns: 0,
  totalFilesScanned: 0,
  repositoryCount: 0,
  lastRunAt: null,
  repositories: [],
};

const UNCONFIGURED_STATS: ScanStats = {
  available: false,
  storage: "unconfigured",
  totalRuns: 0,
  totalFilesScanned: 0,
  repositoryCount: 0,
  lastRunAt: null,
  repositories: [],
};

const MUBIT_UNAVAILABLE_STATS: ScanStats = {
  ...UNCONFIGURED_STATS,
  storage: "mubit",
};

const STATS_AGENT_ID = "repo-deputy";
const STATS_LIMIT = 10_000;

export async function readScanStats(): Promise<ScanStats> {
  if (!isMubitEnabled()) {
    return UNCONFIGURED_STATS;
  }

  try {
    return await createMubitStatsStore().readScanStats();
  } catch (error) {
    console.warn("Repo Deputy Mubit stats read failed.", error);
    return MUBIT_UNAVAILABLE_STATS;
  }
}

export async function recordScanRun(event: ScanRunEvent): Promise<ScanStats> {
  if (!isMubitEnabled()) {
    return UNCONFIGURED_STATS;
  }

  try {
    return await createMubitStatsStore().recordScanRun(event);
  } catch (error) {
    console.warn("Repo Deputy Mubit stats write failed.", error);
    return MUBIT_UNAVAILABLE_STATS;
  }
}

export function createMubitStatsStore(client: MubitStatsClient = createMubitClient()) {
  return {
    async readScanStats(): Promise<ScanStats> {
      const result = await client.control.lessons({
        run_id: statsSessionId(),
        scope: "session",
        limit: STATS_LIMIT,
      });

      return aggregateScanRunEvents(extractStoredEvents(result));
    },

    async recordScanRun(event: ScanRunEvent): Promise<ScanStats> {
      const stored = normalizeScanRunEvent(event);
      if (!stored) {
        return this.readScanStats();
      }

      await client.remember({
        session_id: statsSessionId(),
        agent_id: STATS_AGENT_ID,
        content: JSON.stringify(stored),
        intent: "lesson",
        lesson_type: "success",
        lesson_scope: "session",
        metadata: stored,
        upsert_key: `stats:${stored.timestamp}:${randomUUID()}`,
      });

      return this.readScanStats();
    },
  };
}

export function aggregateScanRunEvents(events: StoredScanRunEvent[]): ScanStats {
  if (!events.length) {
    return EMPTY_CONFIGURED_STATS;
  }

  const repositories = new Map<string, RepoRunStats>();

  for (const event of events) {
    const existing = repositories.get(event.repo);
    if (existing) {
      existing.runs += 1;
      existing.filesScanned += event.scannedFiles;
      existing.lastRunAt =
        event.timestamp.localeCompare(existing.lastRunAt) > 0
          ? event.timestamp
          : existing.lastRunAt;
      if (event.repoUrl) {
        existing.repoUrl = event.repoUrl;
      }
      continue;
    }

    const next: RepoRunStats = {
      repo: event.repo,
      runs: 1,
      filesScanned: event.scannedFiles,
      lastRunAt: event.timestamp,
    };
    if (event.repoUrl) {
      next.repoUrl = event.repoUrl;
    }
    repositories.set(event.repo, next);
  }

  const rows = [...repositories.values()].sort((a, b) =>
    b.lastRunAt.localeCompare(a.lastRunAt),
  );

  return {
    available: true,
    storage: "mubit",
    totalRuns: rows.reduce((sum, entry) => sum + entry.runs, 0),
    totalFilesScanned: rows.reduce((sum, entry) => sum + entry.filesScanned, 0),
    repositoryCount: rows.length,
    lastRunAt: rows[0]?.lastRunAt ?? null,
    repositories: rows,
  };
}

function normalizeScanRunEvent(event: ScanRunEvent): StoredScanRunEvent | null {
  const repo = event.repo.trim();
  if (!repo) {
    return null;
  }

  const scannedFiles = Number.isFinite(event.scannedFiles)
    ? Math.max(0, Math.floor(event.scannedFiles))
    : 0;
  const stored: StoredScanRunEvent = {
    kind: "repo-deputy-scan-run",
    version: 1,
    repo,
    scannedFiles,
    timestamp: event.timestamp ?? new Date().toISOString(),
  };

  if (event.repoUrl) {
    stored.repoUrl = event.repoUrl;
  }

  return stored;
}

function extractStoredEvents(result: unknown) {
  return extractLessonContents(result)
    .map(parseStoredEvent)
    .filter((event): event is StoredScanRunEvent => event !== null);
}

function extractLessonContents(result: unknown) {
  if (!result || typeof result !== "object") {
    return [];
  }

  const lessons = (result as { lessons?: unknown }).lessons;
  if (!Array.isArray(lessons)) {
    return [];
  }

  return lessons
    .map((lesson) =>
      lesson && typeof lesson === "object"
        ? (lesson as { content?: unknown }).content
        : null,
    )
    .filter((content): content is string => typeof content === "string");
}

function parseStoredEvent(content: string): StoredScanRunEvent | null {
  try {
    return normalizeStoredEvent(JSON.parse(content));
  } catch {
    return null;
  }
}

function normalizeStoredEvent(value: unknown): StoredScanRunEvent | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.kind !== "repo-deputy-scan-run" || record.version !== 1) {
    return null;
  }

  const repo = typeof record.repo === "string" ? record.repo.trim() : "";
  const timestamp = typeof record.timestamp === "string" ? record.timestamp.trim() : "";
  if (!repo || !timestamp) {
    return null;
  }

  const event: StoredScanRunEvent = {
    kind: "repo-deputy-scan-run",
    version: 1,
    repo,
    scannedFiles: safePositiveInteger(record.scannedFiles),
    timestamp,
  };
  if (typeof record.repoUrl === "string" && record.repoUrl.trim()) {
    event.repoUrl = record.repoUrl;
  }

  return event;
}

function safePositiveInteger(value: unknown) {
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function createMubitClient(): MubitStatsClient {
  return new Client({
    api_key: process.env.MUBIT_API_KEY,
    transport: "http",
    run_id: "repo-deputy",
  });
}

function statsSessionId() {
  const prefix = process.env.MUBIT_PROJECT_PREFIX ?? "repo-deputy";
  return `${prefix}:public-stats`;
}
