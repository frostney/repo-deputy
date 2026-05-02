import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { aggregateScanRunEvents, createMubitStatsStore, readScanStats } from "./stats";

const MUBIT_ENV_KEYS = [
  "MUBIT_ENABLED",
  "MUBIT_API_KEY",
  "MUBIT_PROJECT_PREFIX",
] as const;

let originalEnv: Partial<Record<(typeof MUBIT_ENV_KEYS)[number], string>>;

beforeEach(() => {
  originalEnv = {};
  for (const key of MUBIT_ENV_KEYS) {
    originalEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of MUBIT_ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("scan stats", () => {
  test("returns unavailable stats when durable Mubit storage is not configured", async () => {
    await expect(readScanStats()).resolves.toEqual({
      available: false,
      storage: "unconfigured",
      totalRuns: 0,
      totalFilesScanned: 0,
      repositoryCount: 0,
      lastRunAt: null,
      repositories: [],
    });
  });

  test("aggregates persisted scan events by repository", () => {
    expect(
      aggregateScanRunEvents([
        {
          kind: "repo-deputy-scan-run",
          version: 1,
          repo: "vercel/next.js",
          repoUrl: "https://github.com/vercel/next.js.git",
          scannedFiles: 120,
          timestamp: "2026-05-02T10:00:00.000Z",
        },
        {
          kind: "repo-deputy-scan-run",
          version: 1,
          repo: "facebook/react",
          scannedFiles: 80,
          timestamp: "2026-05-02T11:00:00.000Z",
        },
        {
          kind: "repo-deputy-scan-run",
          version: 1,
          repo: "vercel/next.js",
          scannedFiles: 125,
          timestamp: "2026-05-02T12:00:00.000Z",
        },
      ]),
    ).toEqual({
      available: true,
      storage: "mubit",
      totalRuns: 3,
      totalFilesScanned: 325,
      repositoryCount: 2,
      lastRunAt: "2026-05-02T12:00:00.000Z",
      repositories: [
        {
          repo: "vercel/next.js",
          repoUrl: "https://github.com/vercel/next.js.git",
          runs: 2,
          filesScanned: 245,
          lastRunAt: "2026-05-02T12:00:00.000Z",
        },
        {
          repo: "facebook/react",
          runs: 1,
          filesScanned: 80,
          lastRunAt: "2026-05-02T11:00:00.000Z",
        },
      ],
    });
  });

  test("persists scan events through the Mubit client", async () => {
    const remembered: Array<{
      session_id: string;
      agent_id: string;
      content: string;
      intent: string;
      lesson_type: string;
      lesson_scope: string;
      upsert_key: string;
    }> = [];
    const store = createMubitStatsStore({
      async remember(options) {
        remembered.push(options);
      },
      control: {
        async lessons() {
          return {
            lessons: remembered.map((entry) => ({ content: entry.content })),
          };
        },
      },
    });

    const stats = await store.recordScanRun({
      repo: "vercel/next.js",
      repoUrl: "https://github.com/vercel/next.js.git",
      scannedFiles: 120,
      timestamp: "2026-05-02T10:00:00.000Z",
    });

    expect(remembered).toHaveLength(1);
    expect(remembered[0]).toMatchObject({
      session_id: "repo-deputy:public-stats",
      agent_id: "repo-deputy",
      intent: "lesson",
      lesson_type: "success",
      lesson_scope: "session",
    });
    expect(JSON.parse(remembered[0]?.content ?? "{}")).toEqual({
      kind: "repo-deputy-scan-run",
      version: 1,
      repo: "vercel/next.js",
      repoUrl: "https://github.com/vercel/next.js.git",
      scannedFiles: 120,
      timestamp: "2026-05-02T10:00:00.000Z",
    });
    expect(remembered[0]?.upsert_key).toStartWith("stats:2026-05-02T10:00:00.000Z:");
    expect(stats.totalRuns).toBe(1);
    expect(stats.totalFilesScanned).toBe(120);
    expect(stats.repositoryCount).toBe(1);
  });
});
