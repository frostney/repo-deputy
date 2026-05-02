import { describe, expect, test } from "bun:test";
import { reportToMarkdown } from "./report-markdown";
import type { DeputyReport } from "./types";

const baseReport: DeputyReport = {
  mergeConfidence: "needs-docs-update",
  summary: "Docs drift was detected.",
  findings: [
    {
      id: "docs-bun-dev-command",
      category: "docs-drift",
      severity: "high",
      title: "README setup command is stale",
      summary: "README documents the wrong package manager.",
      evidence: ["README says `npm run dev`.", "package.json uses Bun."],
      files: ["README.md", "package.json"],
      suggestedFix: "Update README to use Bun commands.",
      confidence: 0.9,
    },
  ],
  markdown: "",
};

describe("reportToMarkdown", () => {
  test("renders the expected Repo Deputy scan sections", () => {
    const markdown = reportToMarkdown(baseReport, { focus: "full" });

    expect(markdown).toContain("## Repo Deputy scan");
    expect(markdown).toContain("Merge confidence: Needs docs update");
    expect(markdown).toContain("#### High: README setup command is stale");
    expect(markdown).toContain("Category: docs drift");
    expect(markdown).toContain("- README.md");
    expect(markdown).toContain("### Suggested next steps");
    expect(markdown).toContain("### What Repo Deputy checked");
  });

  test("includes repo memory only when memory was used", () => {
    const withoutMemory = reportToMarkdown(baseReport, { focus: "docs" });
    expect(withoutMemory).not.toContain("### Repo memory used");

    const withMemory = reportToMarkdown(
      {
        ...baseReport,
        memoryUsed: [
          {
            id: "memory-1",
            repo: "owner/repo",
            summary: "This repo previously drifted from Bun setup docs.",
            category: "repo-convention",
            confidence: 0.8,
          },
        ],
      },
      { focus: "docs" },
    );

    expect(withMemory).toContain("### Repo memory used");
    expect(withMemory).toContain("- This repo previously drifted from Bun setup docs.");
  });
});
