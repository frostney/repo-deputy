import type { DeputyReport, Finding, ReviewFocus } from "@/lib/review/types";

export function reportToMarkdown(
  report: DeputyReport,
  options: { focus?: ReviewFocus } = {},
) {
  const lines: string[] = [
    "## Repo Deputy scan",
    "",
    `Merge confidence: ${formatMergeConfidence(report.mergeConfidence)}`,
    "",
    "Summary:",
    report.summary,
    "",
    "### Findings",
    "",
  ];

  if (report.findings.length === 0) {
    lines.push("No drift findings found for this repository.", "");
  } else {
    for (const finding of report.findings) {
      lines.push(...formatFinding(finding), "");
    }
  }

  if (report.memoryUsed?.length) {
    lines.push("### Repo memory used", "", "Repo Deputy remembered:");
    for (const memory of report.memoryUsed) {
      lines.push(`- ${memory.summary}`);
    }
    lines.push("");
  }

  lines.push("### Suggested next steps", "");
  if (report.findings.length === 0) {
    lines.push("- No docs or code drift action needed from Repo Deputy.");
  } else {
    for (const step of unique(report.findings.map((finding) => finding.suggestedFix))) {
      lines.push(`- ${step}`);
    }
  }

  lines.push(
    "",
    "### What Repo Deputy checked",
    "",
    ...checksForFocus(options.focus).map((check) => `- ${check}`),
  );

  return lines.join("\n").trimEnd();
}

function formatFinding(finding: Finding) {
  const lines = [
    `#### ${capitalize(finding.severity)}: ${finding.title}`,
    `Category: ${finding.category.replace("-", " ")}`,
    "Files:",
    ...listOrDash(finding.files),
    "",
    "Evidence:",
    ...listOrDash(finding.evidence),
    "",
    "Suggested fix:",
    finding.suggestedFix,
  ];

  return lines;
}

function checksForFocus(focus: ReviewFocus | undefined) {
  if (focus === "docs") {
    return ["docs drift", "env docs", "route/API naming drift", "relevant repo memory"];
  }

  if (focus === "code") {
    return [
      "code drift",
      "duplicated generated code",
      "dependency drift",
      "architecture boundaries",
      "relevant repo memory",
    ];
  }

  return [
    "docs drift",
    "code drift",
    "env docs",
    "duplicated generated code",
    "route/API naming drift",
    "relevant repo memory",
  ];
}

function formatMergeConfidence(value: DeputyReport["mergeConfidence"]) {
  if (value === "safe") {
    return "Safe";
  }
  if (value === "needs-docs-update") {
    return "Needs docs update";
  }
  return "Needs human review";
}

function listOrDash(items: string[]) {
  return items.length ? unique(items).map((item) => `- ${item}`) : ["- None"];
}

function unique<T>(items: T[]) {
  return [...new Set(items.filter(Boolean))];
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
