import { spawn } from "node:child_process";
import type {
  Finding,
  ReviewContext,
  ToolCheckIssue,
  ToolCheckOutput,
  ToolCheckResult,
} from "@/lib/review/types";
import { toolIssuesToFindings } from "@/lib/review/tool-results";

export const FALLOW_TOOL_ID = "fallow";
export const FALLOW_COMMAND =
  "bunx --silent fallow --format json --quiet --summary --no-cache";

type CommandOutput = {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs?: number;
};

type JsonRecord = Record<string, unknown>;

const MAX_OUTPUT_CHARS = 12_000;
const MAX_FILES = 12;

export async function runFallowAnalysis(context: ReviewContext): Promise<Finding[]> {
  if (!context.runExternalTools || !context.rootPath) {
    return [];
  }

  const output = await runLocalCommand(FALLOW_COMMAND, context.rootPath);
  const result = buildFallowToolResult(output);
  context.toolResults.push(result);

  return toolIssuesToFindings(result);
}

export function buildFallowToolResult(output: CommandOutput): ToolCheckResult {
  if (output.exitCode === null) {
    return {
      id: FALLOW_TOOL_ID,
      name: "Fallow",
      command: output.command,
      status: "error",
      exitCode: null,
      summary: "Fallow did not finish.",
      durationMs: output.durationMs,
      issues: [
        {
          id: "fallow-runtime-error",
          title: "Fallow did not finish",
          severity: "high",
          category: "code-drift",
          message: "Fallow did not return an exit code.",
          evidence: outputEvidence(output),
          suggestedFix: "Re-run Fallow locally and inspect the command failure.",
        },
      ],
      output: trimOutput(output),
    };
  }

  const parsed = parseJsonObject(output.stdout);
  if (!parsed) {
    const status = output.exitCode === 0 ? "passed" : "error";
    return {
      id: FALLOW_TOOL_ID,
      name: "Fallow",
      command: output.command,
      status,
      exitCode: output.exitCode,
      summary:
        status === "passed"
          ? "Fallow completed without machine-readable JSON output."
          : "Fallow failed before producing machine-readable JSON output.",
      durationMs: output.durationMs,
      issues:
        status === "passed"
          ? []
          : [
              {
                id: "fallow-unparseable-output",
                title: "Fallow output could not be parsed",
                severity: "high",
                category: "code-drift",
                message: "Repo Deputy expected `fallow --format json` output.",
                evidence: outputEvidence(output),
                suggestedFix:
                  "Run `bunx fallow --format json --quiet --summary --no-cache` in the checkout and fix the reported command error.",
              },
            ],
      output: trimOutput(output),
    };
  }

  if (parsed.error === true) {
    const message =
      stringValue(parsed.message) ?? "Fallow returned a machine-readable error.";
    return {
      id: FALLOW_TOOL_ID,
      name: "Fallow",
      command: output.command,
      status: "error",
      exitCode: output.exitCode,
      summary: message,
      durationMs: output.durationMs,
      issues: [
        {
          id: "fallow-runtime-error",
          title: "Fallow returned an error",
          severity: "high",
          category: "code-drift",
          message,
          evidence: outputEvidence(output),
          suggestedFix: "Fix the Fallow runtime error, then rerun the sandbox scan.",
        },
      ],
      output: trimOutput(output),
    };
  }

  const issues = fallowJsonToToolIssues(parsed);
  return {
    id: FALLOW_TOOL_ID,
    name: "Fallow",
    command: output.command,
    status: issues.length ? "failed" : "passed",
    exitCode: output.exitCode,
    summary: summarizeFallowJson(parsed, issues.length),
    durationMs: output.durationMs,
    issues,
    output: trimOutput(output),
  };
}

export function fallowJsonToToolIssues(raw: unknown): ToolCheckIssue[] {
  const root = asRecord(raw);
  if (!root) {
    return [];
  }

  const issues: ToolCheckIssue[] = [];
  const check = asRecord(root.check);
  const dupes = asRecord(root.dupes);
  const health = asRecord(root.health);

  if (check) {
    issues.push(...deadCodeIssues(check));
  }

  if (dupes) {
    issues.push(...duplicationIssues(dupes));
  }

  if (health) {
    issues.push(...complexityIssues(health));
  }

  return issues;
}

function deadCodeIssues(check: JsonRecord): ToolCheckIssue[] {
  const summary = asRecord(check.summary);
  const total =
    numberValue(check.total_issues) ?? numberValue(summary?.total_issues) ?? 0;
  if (total <= 0) {
    return [];
  }

  const parts = countParts(summary, [
    ["unused_files", "unused files"],
    ["unused_exports", "unused exports"],
    ["unused_dependencies", "unused dependencies"],
    ["unresolved_imports", "unresolved imports"],
    ["unlisted_dependencies", "unlisted dependencies"],
    ["duplicate_exports", "duplicate exports"],
    ["circular_dependencies", "circular dependencies"],
    ["boundary_violations", "boundary violations"],
  ]);
  const files = unique([
    ...pathsFromArray(check.unused_files),
    ...pathsFromArray(check.unused_exports),
    ...pathsFromArray(check.unused_dependencies),
    ...pathsFromArray(check.unresolved_imports),
    ...pathsFromArray(check.unlisted_dependencies),
    ...pathsFromDuplicateExports(check.duplicate_exports),
    ...pathsFromCycles(check.circular_dependencies),
    ...pathsFromArray(check.boundary_violations),
  ]).slice(0, MAX_FILES);
  const severity =
    hasPositiveCount(summary, ["unresolved_imports", "boundary_violations"]) ||
    (numberValue(summary?.circular_dependencies) ?? 0) > 1
      ? "high"
      : "medium";

  return [
    {
      id: "fallow-dead-code",
      title: `Fallow found ${total} code graph issue${total === 1 ? "" : "s"}`,
      severity,
      category: "code-drift",
      path: files[0],
      message: parts.length
        ? `Fallow reported ${parts.join(", ")}.`
        : "Fallow reported dead-code or module graph issues.",
      evidence: [
        `Total Fallow dead-code issues: ${total}`,
        ...parts.map((part) => `Issue count: ${part}`),
        ...files.map((file) => `Affected file: ${file}`),
      ].slice(0, 12),
      suggestedFix:
        "Review Fallow's dead-code output, remove genuinely unused code, and suppress intentional exports with Fallow comments or config.",
    },
  ];
}

function duplicationIssues(dupes: JsonRecord): ToolCheckIssue[] {
  const cloneGroups = arrayValue(dupes.clone_groups);
  if (cloneGroups.length === 0) {
    return [];
  }

  const firstGroups = cloneGroups
    .map(asRecord)
    .filter((group): group is JsonRecord => Boolean(group))
    .slice(0, 4);
  const files = unique(
    firstGroups.flatMap((group) =>
      arrayValue(group.instances)
        .map(asRecord)
        .filter((instance): instance is JsonRecord => Boolean(instance))
        .map((instance) => stringValue(instance.file))
        .filter((file): file is string => Boolean(file)),
    ),
  ).slice(0, MAX_FILES);

  return [
    {
      id: "fallow-duplication",
      title: `Fallow found ${cloneGroups.length} duplicate code group${
        cloneGroups.length === 1 ? "" : "s"
      }`,
      severity: cloneGroups.length > 5 ? "high" : "medium",
      category: "code-drift",
      path: files[0],
      message:
        "Fallow reported repeated logic across the codebase that may need consolidation.",
      evidence: [
        `Duplicate clone groups: ${cloneGroups.length}`,
        ...firstGroups.map(formatCloneGroup).filter(Boolean),
      ].slice(0, 12),
      suggestedFix:
        "Compare the duplicate instances and extract a shared helper or delete stale parallel implementations where behavior should be canonical.",
    },
  ];
}

function complexityIssues(health: JsonRecord): ToolCheckIssue[] {
  const summary = asRecord(health.summary);
  const count =
    numberValue(summary?.functions_above_threshold) ??
    arrayValue(health.findings).length ??
    0;
  if (count <= 0) {
    return [];
  }

  const findings = arrayValue(health.findings)
    .map(asRecord)
    .filter((finding): finding is JsonRecord => Boolean(finding))
    .slice(0, 8);
  const files = unique(
    findings
      .map((finding) => stringValue(finding.path))
      .filter((file): file is string => Boolean(file)),
  );
  const critical = numberValue(summary?.severity_critical_count) ?? 0;
  const high = numberValue(summary?.severity_high_count) ?? 0;

  return [
    {
      id: "fallow-complexity",
      title: `Fallow found ${count} complexity hotspot${count === 1 ? "" : "s"}`,
      severity: critical > 0 || high > 3 ? "high" : "medium",
      category: "architecture-drift",
      path: files[0],
      message:
        "Fallow health analysis found functions above configured complexity thresholds.",
      evidence: [
        `Functions above threshold: ${count}`,
        `Critical complexity findings: ${critical}`,
        `High complexity findings: ${high}`,
        ...findings.map(formatComplexityFinding).filter(Boolean),
      ].slice(0, 12),
      suggestedFix:
        "Prioritize the highest-severity Fallow health findings and split large or deeply nested functions into clearer units.",
    },
  ];
}

function summarizeFallowJson(raw: JsonRecord, issueCount: number) {
  const checkSummary = asRecord(asRecord(raw.check)?.summary);
  const healthSummary = asRecord(asRecord(raw.health)?.summary);
  const cloneGroups = arrayValue(asRecord(raw.dupes)?.clone_groups).length;
  const parts = [
    `${numberValue(checkSummary?.total_issues) ?? 0} dead-code/module issues`,
    `${cloneGroups} duplicate groups`,
    `${numberValue(healthSummary?.functions_above_threshold) ?? 0} complexity hotspots`,
  ];

  return issueCount
    ? `Fallow completed and reported ${parts.join(", ")}.`
    : "Fallow completed without dead-code, duplication, or complexity findings.";
}

function formatCloneGroup(group: JsonRecord) {
  const lineCount = numberValue(group.line_count);
  const files = arrayValue(group.instances)
    .map(asRecord)
    .filter((instance): instance is JsonRecord => Boolean(instance))
    .map((instance) => {
      const file = stringValue(instance.file);
      const start = numberValue(instance.start_line);
      const end = numberValue(instance.end_line);
      return file && start && end ? `${file}:${start}-${end}` : file;
    })
    .filter(Boolean)
    .join(", ");

  return files ? `${lineCount ?? "Unknown"} duplicated lines in ${files}` : "";
}

function formatComplexityFinding(finding: JsonRecord) {
  const path = stringValue(finding.path);
  const name = stringValue(finding.name);
  const line = numberValue(finding.line);
  const cognitive = numberValue(finding.cognitive);
  const cyclomatic = numberValue(finding.cyclomatic);

  if (!path) {
    return "";
  }

  return `${path}${line ? `:${line}` : ""} ${name ?? "function"} complexity: cyclomatic ${
    cyclomatic ?? "unknown"
  }, cognitive ${cognitive ?? "unknown"}`;
}

function countParts(
  summary: JsonRecord | null,
  fields: Array<[string, string]>,
): string[] {
  if (!summary) {
    return [];
  }

  return fields
    .map(([key, label]) => {
      const count = numberValue(summary[key]) ?? 0;
      return count > 0 ? `${count} ${label}` : "";
    })
    .filter(Boolean);
}

function pathsFromArray(value: unknown) {
  return arrayValue(value)
    .map(asRecord)
    .filter((entry): entry is JsonRecord => Boolean(entry))
    .map((entry) => stringValue(entry.path))
    .filter((file): file is string => Boolean(file));
}

function pathsFromDuplicateExports(value: unknown) {
  return arrayValue(value)
    .map(asRecord)
    .filter((entry): entry is JsonRecord => Boolean(entry))
    .flatMap((entry) =>
      arrayValue(entry.locations)
        .map(asRecord)
        .filter((location): location is JsonRecord => Boolean(location))
        .map((location) => stringValue(location.path))
        .filter((file): file is string => Boolean(file)),
    );
}

function pathsFromCycles(value: unknown) {
  return arrayValue(value)
    .map(asRecord)
    .filter((entry): entry is JsonRecord => Boolean(entry))
    .flatMap((entry) =>
      arrayValue(entry.cycle).filter((file): file is string => typeof file === "string"),
    );
}

function hasPositiveCount(summary: JsonRecord | null, fields: string[]) {
  if (!summary) {
    return false;
  }

  return fields.some((field) => (numberValue(summary[field]) ?? 0) > 0);
}

async function runLocalCommand(command: string, cwd: string): Promise<CommandOutput> {
  const startedAt = Date.now();

  return new Promise((resolve) => {
    const child = spawn("bash", ["-lc", command], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", (error) => {
      resolve({
        command,
        exitCode: null,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: `${Buffer.concat(stderr).toString("utf8")}\n${error.message}`.trim(),
        durationMs: Date.now() - startedAt,
      });
    });
    child.on("close", (exitCode) => {
      resolve({
        command,
        exitCode,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

function parseJsonObject(stdout: string): JsonRecord | null {
  const start = stdout.indexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end < start) {
    return null;
  }

  try {
    return JSON.parse(stdout.slice(start, end + 1)) as JsonRecord;
  } catch {
    return null;
  }
}

function trimOutput(output: CommandOutput): ToolCheckOutput {
  const stdout = truncate(output.stdout, MAX_OUTPUT_CHARS);
  const stderr = truncate(output.stderr, MAX_OUTPUT_CHARS);

  return {
    stdout,
    stderr,
    truncated:
      stdout.length < output.stdout.length || stderr.length < output.stderr.length,
  };
}

function outputEvidence(output: CommandOutput) {
  return [
    output.stderr ? `stderr: ${truncate(output.stderr, 500)}` : "",
    output.stdout ? `stdout: ${truncate(output.stdout, 500)}` : "",
  ].filter(Boolean);
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function unique(items: string[]) {
  return [...new Set(items)];
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength
    ? `${value.slice(0, maxLength)}\n...[truncated]`
    : value;
}
