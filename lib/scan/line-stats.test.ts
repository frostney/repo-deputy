import { describe, expect, test } from "bun:test";
import { buildSourceExcerpt, calculateRepoLineStats } from "./line-stats";

describe("calculateRepoLineStats", () => {
  test("counts LOC and SLOC by prominent language", () => {
    const stats = calculateRepoLineStats([
      {
        path: "app/page.tsx",
        content: [
          "import { Widget } from './widget';",
          "",
          "// generated note",
          "export function Page() {",
          "  return <Widget />;",
          "}",
        ].join("\n"),
      },
      {
        path: "README.md",
        content: "# Readme\n\nRun `bun test`.\n",
      },
      {
        path: ".env.example",
        content: "# comment\nAI_GATEWAY_API_KEY=\n",
      },
    ]);

    expect(stats).toMatchObject({
      files: 3,
      loc: 11,
      sloc: 7,
      prominentLanguage: "TypeScript TSX",
    });
    expect(stats.languages.map((entry) => entry.language)).toEqual([
      "TypeScript TSX",
      "Markdown",
      "Environment",
    ]);
  });
});

describe("buildSourceExcerpt", () => {
  test("anchors the excerpt near finding evidence", () => {
    const excerpt = buildSourceExcerpt(
      {
        path: "README.md",
        content: "# Setup\n\nRun npm run dev.\nThen ship.\n",
      },
      {
        id: "docs-bun-dev-command",
        category: "docs-drift",
        severity: "high",
        title: "README setup command is stale",
        summary: "The docs still show npm dev commands.",
        evidence: ["Docs mention `npm run dev`."],
        files: ["README.md"],
        suggestedFix: "Update README to use `bun run dev`.",
        confidence: 0.9,
      },
      1,
    );

    expect(excerpt).toMatchObject({
      path: "README.md",
      line: 3,
      startLine: 2,
      endLine: 4,
    });
  });
});
