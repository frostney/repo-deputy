import { describe, expect, test } from "bun:test";
import { buildFallowToolResult, fallowJsonToToolIssues } from "./fallow";

describe("fallowJsonToToolIssues", () => {
  test("converts combined Fallow JSON into Repo Deputy tool issues", () => {
    const issues = fallowJsonToToolIssues({
      check: {
        total_issues: 3,
        summary: {
          total_issues: 3,
          unused_files: 1,
          unused_exports: 1,
          unresolved_imports: 1,
          circular_dependencies: 0,
          boundary_violations: 0,
        },
        unused_files: [{ path: "src/old.ts" }],
        unused_exports: [{ path: "src/public.ts", export_name: "oldExport" }],
        unresolved_imports: [{ path: "src/app.ts", specifier: "./missing" }],
      },
      dupes: {
        clone_groups: [
          {
            line_count: 12,
            instances: [
              { file: "src/a.ts", start_line: 1, end_line: 12 },
              { file: "src/b.ts", start_line: 2, end_line: 13 },
            ],
          },
        ],
      },
      health: {
        summary: {
          functions_above_threshold: 2,
          severity_critical_count: 1,
          severity_high_count: 0,
        },
        findings: [
          {
            path: "src/parser.ts",
            name: "parse",
            line: 42,
            cyclomatic: 31,
            cognitive: 27,
          },
        ],
      },
    });

    expect(issues.map((issue) => issue.id)).toEqual([
      "fallow-dead-code",
      "fallow-duplication",
      "fallow-complexity",
    ]);
    expect(issues[0].severity).toBe("high");
    expect(issues[1].evidence.join("\n")).toContain("src/a.ts:1-12");
    expect(issues[2].evidence.join("\n")).toContain("src/parser.ts:42");
  });
});

describe("buildFallowToolResult", () => {
  test("returns an error result for unparseable failed output", () => {
    const result = buildFallowToolResult({
      command: "bunx fallow --format json",
      exitCode: 2,
      stdout: "",
      stderr: "not a git repository",
    });

    expect(result.status).toBe("error");
    expect(result.issues[0].id).toBe("fallow-unparseable-output");
  });

  test("returns an error result for Fallow JSON error envelopes", () => {
    const result = buildFallowToolResult({
      command: "bunx fallow --format json",
      exitCode: 2,
      stdout: JSON.stringify({ error: true, message: "not a git repository" }),
      stderr: "",
    });

    expect(result.status).toBe("error");
    expect(result.summary).toBe("not a git repository");
    expect(result.issues[0].id).toBe("fallow-runtime-error");
  });
});
