import { Client } from "@mubit-ai/sdk";
import type {
  RepoMemoryCategory,
  RepoMemoryContext,
  RepoMemoryEvent,
  RepoMemoryInsight,
} from "@/lib/memory/types";

type UnknownRecord = Record<string, unknown>;

const VALID_CATEGORIES = new Set<RepoMemoryCategory>([
  "docs-drift",
  "code-drift",
  "dependency-drift",
  "architecture-drift",
  "repo-convention",
]);

export function isMubitEnabled() {
  return process.env.MUBIT_ENABLED === "true" && Boolean(process.env.MUBIT_API_KEY);
}

export function createMubitMemory() {
  const client = new Client({
    api_key: process.env.MUBIT_API_KEY,
    transport: "http",
    run_id: "repo-deputy",
  });

  return {
    async getRepoMemory(context: RepoMemoryContext): Promise<RepoMemoryInsight[]> {
      if (!isMubitEnabled()) {
        return [];
      }

      try {
        const result = await client.recall({
          session_id: sessionId(context.repo),
          agent_id: "repo-deputy",
          query: `Repo memory for ${context.repo}: repeated docs drift, code drift, package-manager conventions, env-var conventions, previous AI-generated mistakes, and prior merge confidence.`,
          entry_types: ["lesson", "rule"],
          limit: 5,
        });

        return normalizeRecallResult(result, context.repo);
      } catch (error) {
        console.warn("Mubit recall failed; continuing without repo memory.", error);
        return [];
      }
    },

    async writeScanMemory(event: RepoMemoryEvent): Promise<void> {
      if (!isMubitEnabled()) {
        return;
      }

      try {
        const safeEvent = sanitizeMemoryEvent(event);
        await client.remember({
          session_id: sessionId(event.repo),
          agent_id: "repo-deputy",
          content: JSON.stringify(safeEvent),
          intent: "lesson",
          lesson_type: event.mergeConfidence === "safe" ? "success" : "failure",
          lesson_scope: "session",
          metadata: safeEvent,
          upsert_key: `${event.repo}:${event.scanId ?? event.timestamp}:${event.command}`,
        });
      } catch (error) {
        console.warn("Mubit memory write failed; scan already completed.", error);
      }
    },
  };
}

export async function getRepoMemory(context: RepoMemoryContext) {
  return createMubitMemory().getRepoMemory(context);
}

export async function writeScanMemory(event: RepoMemoryEvent) {
  return createMubitMemory().writeScanMemory(event);
}

function normalizeRecallResult(result: unknown, repo: string): RepoMemoryInsight[] {
  const records = extractRecords(result);

  if (records.length === 0) {
    const summary = readString((result as UnknownRecord | null)?.final_answer);
    return summary
      ? [
          {
            id: `mubit-summary-${repo}`,
            repo,
            summary: sanitizeText(summary),
            category: "repo-convention",
            confidence: 0.55,
          },
        ]
      : [];
  }

  return records
    .map((record, index) => normalizeRecord(record, repo, index))
    .filter((insight): insight is RepoMemoryInsight => Boolean(insight))
    .slice(0, 5);
}

function extractRecords(result: unknown): UnknownRecord[] {
  if (!result || typeof result !== "object") {
    return [];
  }

  const record = result as UnknownRecord;
  const candidates = [
    record.results,
    record.memories,
    record.lessons,
    record.items,
    record.entries,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.filter(
        (item): item is UnknownRecord =>
          Boolean(item) && typeof item === "object" && !Array.isArray(item),
      );
    }
  }

  return [];
}

function normalizeRecord(
  record: UnknownRecord,
  repo: string,
  index: number,
): RepoMemoryInsight | null {
  const summary = sanitizeText(
    readString(record.summary) ||
      readString(record.content) ||
      readString(record.text) ||
      readString(record.final_answer),
  );

  if (!summary) {
    return null;
  }

  const category = readCategory(record.category) ?? "repo-convention";
  const confidence = readNumber(record.confidence) ?? readNumber(record.score) ?? 0.55;

  return {
    id: readString(record.id) || readString(record.lesson_id) || `mubit-${repo}-${index}`,
    repo,
    summary,
    category,
    evidence: sanitizeEvidence(record.evidence),
    confidence: Math.max(0, Math.min(1, confidence)),
    lastSeenAt: readString(record.lastSeenAt) || readString(record.last_seen_at),
  };
}

function sanitizeMemoryEvent(event: RepoMemoryEvent): RepoMemoryEvent {
  return {
    repo: event.repo,
    scanId: event.scanId,
    command: event.command,
    mergeConfidence: event.mergeConfidence,
    findingCounts: event.findingCounts,
    lessons: event.lessons.map(sanitizeText).filter(Boolean).slice(0, 8),
    timestamp: event.timestamp,
  };
}

function sanitizeEvidence(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value
    .map((item) => sanitizeText(String(item)))
    .filter(Boolean)
    .slice(0, 4);
}

function sanitizeText(value: string) {
  return value
    .replace(/gh[pousr]_[A-Za-z0-9_]+/g, "[redacted-token]")
    .replace(
      /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]+?-----END [A-Z ]+PRIVATE KEY-----/g,
      "[redacted-private-key]",
    )
    .replace(/=.{24,}/g, "=[redacted]")
    .slice(0, 500);
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readCategory(value: unknown): RepoMemoryCategory | null {
  if (typeof value !== "string") {
    return null;
  }
  return VALID_CATEGORIES.has(value as RepoMemoryCategory)
    ? (value as RepoMemoryCategory)
    : null;
}

function sessionId(repo: string) {
  const prefix = process.env.MUBIT_PROJECT_PREFIX ?? "repo-deputy";
  return `${prefix}:${repo}`;
}
