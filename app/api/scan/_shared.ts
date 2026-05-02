import type {
  RepoScanResult,
  ReviewFocus,
  SandboxScanMetadata,
  ToolCheckIssue,
  ToolCheckResult,
  ToolCheckStatus,
} from "@/lib/review/types";
import type { SandboxScanSession, SandboxScanToolId } from "@/lib/scan/sandbox";
import { SANDBOX_SCAN_TOOL_IDS } from "@/lib/scan/sandbox";

export type ScanRequestInput = {
  focus: ReviewFocus;
  repoUrl: string;
  revision?: string;
  useAi?: boolean;
};

export async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export function parseScanRequestInput(value: unknown): ScanRequestInput {
  const body = asRecord(value);
  const repoUrl = textField(body.repoUrl) ?? textField(body.repo);

  if (!repoUrl) {
    throw new Error(
      "Missing required `repo` or `repoUrl` field. Repo Deputy app/API scans use Vercel Sandbox.",
    );
  }

  return {
    focus: parseFocus(textField(body.focus)),
    repoUrl,
    revision: textField(body.revision),
    useAi: body.ai === false || body.useAi === false ? false : undefined,
  };
}

export function parseSandboxSession(value: unknown): SandboxScanSession {
  const body = asRecord(value);
  const session = asRecord(body.session ?? body);
  const repo = textField(session.repo);
  const repoUrl = textField(session.repoUrl);

  if (!repo || !repoUrl) {
    throw new Error("Missing split scan session.");
  }

  const sandbox = parseSandboxMetadata(session.sandbox, repoUrl);
  const scannedFiles =
    typeof session.scannedFiles === "number" && Number.isFinite(session.scannedFiles)
      ? session.scannedFiles
      : undefined;

  return {
    repo,
    repoName: textField(session.repoName),
    repoUrl,
    focus: parseFocus(textField(session.focus)),
    revision: textField(session.revision),
    scannedFiles,
    sandbox,
  };
}

export function parseSandboxScanToolId(value: unknown): SandboxScanToolId {
  if (
    typeof value === "string" &&
    SANDBOX_SCAN_TOOL_IDS.includes(value as SandboxScanToolId)
  ) {
    return value as SandboxScanToolId;
  }

  throw new Error(
    `Unsupported scan tool. Expected one of: ${SANDBOX_SCAN_TOOL_IDS.join(", ")}.`,
  );
}

export function parseToolResults(value: unknown): ToolCheckResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isToolCheckResult);
}

export function scanResultResponse(result: RepoScanResult) {
  return {
    repo: result.context.repo,
    repoUrl: result.context.sandbox?.repoUrl,
    sandbox: result.context.sandbox,
    scannedFiles: result.context.scannedFiles ?? result.context.changedFiles.length,
    mergeConfidence: result.report.mergeConfidence,
    summary: result.report.summary,
    findings: result.report.findings,
    markdown: result.markdown,
    memoryUsed: result.report.memoryUsed ?? [],
    toolResults: result.report.toolResults ?? [],
  };
}

export function errorResponse(error: unknown, status = 400) {
  return Response.json({ error: scanErrorMessage(error) }, { status });
}

export function parseFocus(value: string | null | undefined): ReviewFocus {
  if (value === "docs" || value === "code" || value === "full") {
    return value;
  }

  return "full";
}

export function scanErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function parseSandboxMetadata(
  value: unknown,
  repoUrl: string,
): SandboxScanMetadata | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const metadata = value as Record<string, unknown>;
  const parsedRepoUrl = textField(metadata.repoUrl) ?? repoUrl;
  const cloneDepth =
    typeof metadata.cloneDepth === "number" && Number.isFinite(metadata.cloneDepth)
      ? metadata.cloneDepth
      : 1;

  return {
    repoUrl: parsedRepoUrl,
    cloneDepth,
    revision: textField(metadata.revision),
    commit: textField(metadata.commit),
    sandboxId: textField(metadata.sandboxId),
  };
}

function isToolCheckResult(value: unknown): value is ToolCheckResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const result = value as Record<string, unknown>;
  return (
    typeof result.id === "string" &&
    typeof result.name === "string" &&
    typeof result.command === "string" &&
    isToolCheckStatus(result.status) &&
    (typeof result.exitCode === "number" || result.exitCode === null) &&
    typeof result.summary === "string" &&
    Array.isArray(result.issues) &&
    result.issues.every(isToolCheckIssue)
  );
}

function isToolCheckIssue(value: unknown): value is ToolCheckIssue {
  if (!value || typeof value !== "object") {
    return false;
  }

  const issue = value as Record<string, unknown>;
  return (
    typeof issue.id === "string" &&
    typeof issue.title === "string" &&
    isFindingSeverity(issue.severity) &&
    isFindingCategory(issue.category) &&
    typeof issue.message === "string" &&
    Array.isArray(issue.evidence) &&
    issue.evidence.every((item) => typeof item === "string") &&
    typeof issue.suggestedFix === "string"
  );
}

function isToolCheckStatus(value: unknown): value is ToolCheckStatus {
  return (
    value === "passed" || value === "failed" || value === "error" || value === "skipped"
  );
}

function isFindingSeverity(value: unknown) {
  return value === "low" || value === "medium" || value === "high";
}

function isFindingCategory(value: unknown) {
  return (
    value === "docs-drift" ||
    value === "code-drift" ||
    value === "dependency-drift" ||
    value === "architecture-drift"
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return value as Record<string, unknown>;
}

function textField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
