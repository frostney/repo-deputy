import { describe, expect, test } from "bun:test";
import type { ScanResult } from "./data";
import {
  buildFixOptions,
  buildPullRequestDraft,
  defaultPrBranch,
  defaultSelectedFixIds,
} from "./pr-data";

const scanResult: ScanResult = {
  repo: "local/widget",
  scannedFiles: 42,
  mergeConfidence: "needs-human-review",
  summary: "Repo Deputy found current docs and code drift.",
  markdown: "## Repo Deputy scan",
  toolResults: [],
  findings: [
    {
      id: "fallow-duplicate-helpers",
      severity: "medium",
      category: "code-drift",
      title: "Duplicate helpers detected",
      summary: "Two helpers repeat the same branch handling.",
      evidence: ["lib/a.ts:12", "lib/b.ts:18"],
      files: ["lib/a.ts", "lib/b.ts", "lib/a.ts"],
      suggestedFix: "Consolidate `parseBranch` into one helper.",
      confidence: 0.87,
    },
    {
      id: "docs-bun-dev-command",
      severity: "high",
      category: "docs-drift",
      title: "README setup command is stale",
      summary: "README documents the wrong package manager.",
      evidence: ["README says `npm run dev`."],
      files: ["README.md", "package.json"],
      suggestedFix: "Update README to use Bun commands.",
      confidence: 0.91,
    },
  ],
};

describe("buildFixOptions", () => {
  test("maps live scan findings into PR request options", () => {
    const options = buildFixOptions(scanResult);

    expect(options).toHaveLength(2);
    expect(options[0]).toMatchObject({
      id: "fallow-duplicate-helpers",
      title: "Consolidate `parseBranch` into one helper.",
      category: "Duplication",
      severity: "medium",
      fileCount: 2,
      evidenceCount: 2,
      confidence: 0.87,
    });
    expect(options[0].files).toEqual(["lib/a.ts", "lib/b.ts"]);
    expect(options[1].category).toBe("Docs");
  });

  test("defaults selection to high-severity scan findings", () => {
    const options = buildFixOptions(scanResult);

    expect(defaultSelectedFixIds(options)).toEqual(["docs-bun-dev-command"]);
  });
});

describe("buildPullRequestDraft", () => {
  test("deduplicates selected files and keeps scan metadata", () => {
    const options = buildFixOptions(scanResult);

    const draft = buildPullRequestDraft({
      options,
      selectedIds: [
        "fallow-duplicate-helpers",
        "unknown-finding",
        "docs-bun-dev-command",
      ],
      branch: " repo-deputy/widget-current-scan ",
      title: " chore: address live scan findings ",
      scanResult,
    });

    expect(draft).toMatchObject({
      count: 2,
      files: 4,
      evidence: 3,
      branch: "repo-deputy/widget-current-scan",
      title: "chore: address live scan findings",
      findingIds: ["fallow-duplicate-helpers", "docs-bun-dev-command"],
      highestSeverity: "high",
      scanSummary: scanResult.summary,
      mergeConfidence: "needs-human-review",
    });
    expect(draft.filePaths).toEqual([
      "lib/a.ts",
      "lib/b.ts",
      "README.md",
      "package.json",
    ]);
  });

  test("generates a branch from repo and finding ids instead of a canned audit id", () => {
    const branch = defaultPrBranch("acme/widget", scanResult);

    expect(branch).toStartWith("repo-deputy/acme-widget-");
    expect(branch).not.toContain("audit-00482");
  });
});
