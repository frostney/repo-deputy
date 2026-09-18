import { describe, expect, test } from "bun:test";
import type { Finding } from "./data";
import {
  evidenceFileRefsForText,
  evidenceMetricsForFinding,
  weightedFindingPenalty,
} from "./evidence";

describe("finding evidence helpers", () => {
  test("extracts file and line references from evidence text", () => {
    const refs = evidenceFileRefsForText("src/a.ts:12-18 has repeated logic.", {
      ...baseFinding,
      files: ["src/a.ts"],
    });

    expect(refs).toEqual([
      {
        path: "src/a.ts",
        line: 12,
        endLine: 18,
        label: "src/a.ts:12-18",
      },
    ]);
  });

  test("weights concrete sourced evidence above vague evidence", () => {
    const sourced: Finding = {
      ...baseFinding,
      severity: "high",
      confidence: 0.9,
      evidence: ["src/a.ts:12-18 has repeated logic.", "src/b.ts:40 matches it."],
      files: ["src/a.ts", "src/b.ts"],
      sources: [
        {
          path: "src/a.ts",
          line: 12,
          startLine: 12,
          endLine: 18,
          lines: [{ number: 12, text: "function repeated() {" }],
          url: "https://github.com/acme/repo/blob/abc/src/a.ts#L12-L18",
        },
      ],
    };
    const vague: Finding = {
      ...baseFinding,
      severity: "high",
      confidence: 0.55,
      evidence: ["Repeated logic appears in the repo."],
      files: ["src/a.ts", "src/b.ts"],
    };

    expect(evidenceMetricsForFinding(sourced).score).toBeGreaterThan(
      evidenceMetricsForFinding(vague).score,
    );
    expect(weightedFindingPenalty(sourced)).toBeGreaterThan(
      weightedFindingPenalty(vague),
    );
  });
});

const baseFinding: Finding = {
  id: "f-test",
  severity: "medium",
  category: "Duplication",
  title: "Duplicated flow",
  path: "src/a.ts",
  description: "The same flow appears twice.",
  evidence: [],
  files: [],
  impact: "medium",
  effort: "medium",
};
