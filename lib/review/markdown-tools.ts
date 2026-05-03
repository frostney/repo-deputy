import type { ToolCheckIssue, ToolCheckResult } from "@/lib/review/types";

export const MARKDOWNLINT_TOOL_ID = "markdownlint";
export const MARKDOWN_LINK_CHECK_TOOL_ID = "markdown-link-check";

export const MARKDOWNLINT_COMMAND =
  'bunx --silent markdownlint-cli2 "**/*.{md,mdx}" "#node_modules" "#.git" "#.next" "#dist" "#coverage"';
export const MARKDOWN_LINK_CHECK_COMMAND = String.raw`bash <<'REPO_DEPUTY_MARKDOWN_LINK_CHECK'
status=0
found=0
while IFS= read -r -d '' file; do
  found=1
  bunx --silent markdown-link-check "$file" -q || status=1
done < <(
  find . \
    \( -type d \( -name node_modules -o -name .git -o -name .next -o -name dist -o -name coverage \) -prune \) \
    -o \( -name '*.md' -o -name '*.mdx' \) -type f -print0
)
if [ "$found" -eq 0 ]; then
  echo "No Markdown files found."
fi
exit "$status"
REPO_DEPUTY_MARKDOWN_LINK_CHECK`;

type CommandOutput = {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs?: number;
};

const MAX_OUTPUT_CHARS = 12_000;

export function buildMarkdownlintToolResult(output: CommandOutput): ToolCheckResult {
  const issues = parseMarkdownlintIssues(`${output.stdout}\n${output.stderr}`);
  const erroredWithoutIssues = output.exitCode !== 0 && issues.length === 0;

  return {
    id: MARKDOWNLINT_TOOL_ID,
    name: "markdownlint-cli2",
    command: output.command,
    status: erroredWithoutIssues ? "error" : issues.length ? "failed" : "passed",
    exitCode: output.exitCode,
    summary: erroredWithoutIssues
      ? "markdownlint-cli2 failed before reporting lint diagnostics."
      : issues.length
        ? `markdownlint-cli2 reported ${issues.length} Markdown lint diagnostic${
            issues.length === 1 ? "" : "s"
          }.`
        : "markdownlint-cli2 completed without Markdown lint diagnostics.",
    durationMs: output.durationMs,
    issues: erroredWithoutIssues
      ? [
          {
            id: "markdownlint-runtime-error",
            title: "markdownlint-cli2 did not complete",
            severity: "high",
            category: "docs-drift",
            message: "markdownlint-cli2 exited without parseable diagnostics.",
            evidence: outputEvidence(output),
            suggestedFix:
              "Run markdownlint-cli2 in the checkout and fix the command or configuration error.",
          },
        ]
      : issues,
    output: trimOutput(output),
  };
}

export function buildMarkdownLinkCheckToolResult(output: CommandOutput): ToolCheckResult {
  const normalizedOutput = normalizeMarkdownLinkCheckOutput(output);
  const issues = parseMarkdownLinkCheckIssues(normalizedOutput.stdout);
  const erroredWithoutIssues = normalizedOutput.exitCode !== 0 && issues.length === 0;

  return {
    id: MARKDOWN_LINK_CHECK_TOOL_ID,
    name: "markdown-link-check",
    command: normalizedOutput.command,
    status: erroredWithoutIssues ? "error" : issues.length ? "failed" : "passed",
    exitCode: normalizedOutput.exitCode,
    summary: erroredWithoutIssues
      ? "markdown-link-check failed before reporting broken links."
      : issues.length
        ? `markdown-link-check reported ${issues.length} broken Markdown link${
            issues.length === 1 ? "" : "s"
          }.`
        : "markdown-link-check completed without broken Markdown links.",
    durationMs: output.durationMs,
    issues: erroredWithoutIssues
      ? [
          {
            id: "markdown-link-check-runtime-error",
            title: "markdown-link-check did not complete",
            severity: "high",
            category: "docs-drift",
            message: "markdown-link-check exited without parseable broken-link output.",
            evidence: outputEvidence(normalizedOutput),
            suggestedFix:
              "Run markdown-link-check in the checkout and fix the command or configuration error.",
          },
        ]
      : issues,
    output: trimOutput(normalizedOutput),
  };
}

export function parseMarkdownlintIssues(output: string): ToolCheckIssue[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.match(/^(.+?):(\d+)(?::(\d+))?\s+error\s+(MD\d+\/\S+)\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match, index) => {
      const path = normalizePath(match[1]);
      const line = Number(match[2]);
      const rule = match[4];
      const message = match[5];

      return {
        id: `markdownlint-${rule.split("/")[0].toLowerCase()}-${hashText(
          `${path}:${line}:${index}`,
        )}`,
        title: `Markdown lint violation: ${rule.split("/")[0]}`,
        severity: "low",
        category: "docs-drift",
        path,
        line,
        message,
        evidence: [`${path}:${line} ${rule}`, message],
        suggestedFix:
          "Update the Markdown to satisfy the reported markdownlint rule or add an intentional local suppression.",
      };
    });
}

export function parseMarkdownLinkCheckIssues(output: string): ToolCheckIssue[] {
  const issues: ToolCheckIssue[] = [];

  const fileHeaders = [
    ...output.matchAll(/ERROR:\s+\d+\s+dead links?\s+found in (.+?) !/g),
  ];
  for (const [index, fileMatch] of fileHeaders.entries()) {
    const currentFile = normalizePath(fileMatch[1]);
    const start = fileMatch.index ?? 0;
    const end = fileHeaders[index + 1]?.index ?? output.length;
    issues.push(...markdownLinkIssuesForFile(currentFile, output.slice(start, end)));
  }

  if (fileHeaders.length === 1) {
    const currentFile = normalizePath(fileHeaders[0][1]);
    issues.push(
      ...markdownLinkIssuesForFile(currentFile, output.slice(0, fileHeaders[0].index)),
    );
  }

  return [...new Map(issues.map((issue) => [issue.id, issue])).values()];
}

function normalizeMarkdownLinkCheckOutput(output: CommandOutput): CommandOutput {
  const streams = [output.stdout.trim(), output.stderr.trim()].filter(Boolean);
  return {
    ...output,
    stdout: [...new Set(streams)].join("\n"),
    stderr: "",
  };
}

function markdownLinkIssuesForFile(filePath: string, output: string): ToolCheckIssue[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.match(/\[.\]\s+(.+?)\s+(?:→|->)\s+Status:\s+(.+)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => {
      const link = match[1].trim();
      const status = match[2].trim();
      return {
        id: `markdown-link-check-${hashText(`${filePath}:${link}:${status}`)}`,
        title: "Broken Markdown link",
        severity: "medium",
        category: "docs-drift",
        path: filePath,
        message: `${link} returned ${status}.`,
        evidence: [`File: ${filePath}`, `Broken link: ${link}`, `Status: ${status}`],
        suggestedFix:
          "Update the Markdown link target, add the missing local file, or configure an explicit ignore for an intentionally unavailable URL.",
      };
    });
}

function trimOutput(output: CommandOutput) {
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

function normalizePath(filePath: string) {
  return filePath
    .trim()
    .replace(/^(\.\.\/)+/, "")
    .replace(/^\.\/+/, "")
    .replace(/\\/g, "/");
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function truncate(value: string, maxLength: number) {
  return value.length > maxLength
    ? `${value.slice(0, maxLength)}\n...[truncated]`
    : value;
}
