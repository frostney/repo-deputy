import { runRepoScan } from "@/lib/scan/repo";
import {
  checkPublicGitHubRepository,
  type PublicGitHubRepoCheck,
} from "@/lib/scan/public-repo";
import type {
  Finding,
  FindingSourceExcerpt,
  RepoFile,
  ReviewContext,
  ReviewFocus,
} from "@/lib/review/types";
import { buildSourceExcerpt } from "@/lib/scan/line-stats";
import { recordScanRun } from "@/lib/scan/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const focus = parseFocus(url.searchParams.get("focus"));
  const useMemory = url.searchParams.get("memory") === "true";
  const useAi = url.searchParams.get("ai") !== "false";
  let repoUrl = url.searchParams.get("repo") || undefined;
  const revision = url.searchParams.get("revision") || undefined;
  const runExternalTools = url.searchParams.get("tools") === "true";
  if (repoUrl) {
    const repoCheck = await checkPublicGitHubRepository(repoUrl);
    if (repoCheck.ok) {
      repoUrl = repoCheck.repo;
    } else if (repoCheck.reason !== "unsupported") {
      return Response.json(buildRepoCheckFailure(repoUrl, repoCheck), {
        status: repoCheck.status,
      });
    }
  }

  const result = await runRepoScan({
    focus,
    repoUrl,
    revision,
    useAi,
    useMemory,
    runExternalTools,
  });

  const response = {
    repo: result.context.repo,
    repoUrl: result.context.sandbox?.repoUrl,
    rootPath: result.context.rootPath,
    sandbox: result.context.sandbox,
    scannedFiles: result.context.scannedFiles ?? result.context.changedFiles.length,
    lineStats: result.context.lineStats,
    mergeConfidence: result.report.mergeConfidence,
    summary: result.report.summary,
    findings: result.report.findings.map((finding) =>
      toApiFinding(finding, result.context),
    ),
    markdown: result.markdown,
    memoryUsed: result.report.memoryUsed ?? [],
    toolResults: result.report.toolResults ?? [],
  };

  await recordScanRun({
    repo: response.repo,
    repoUrl: response.repoUrl,
    scannedFiles: response.scannedFiles,
  }).catch((error) => {
    console.warn(
      "Repo Deputy stats write failed; continuing without counter update.",
      error,
    );
  });

  return Response.json(response);
}

function parseFocus(value: string | null): ReviewFocus {
  if (value === "docs" || value === "code" || value === "full") {
    return value;
  }

  return "full";
}

function buildRepoCheckFailure(
  repo: string,
  repoCheck: Extract<PublicGitHubRepoCheck, { ok: false }>,
) {
  return {
    repo: repoCheck.repo ?? repo,
    repoUrl: repoCheck.repoUrl,
    scannedFiles: 0,
    lineStats: undefined,
    mergeConfidence: "needs-human-review",
    summary: repoCheck.message,
    findings: [],
    markdown: "",
    memoryUsed: [],
    toolResults: [
      {
        id: "repo-public-check",
        name: "Repository availability",
        command: repoCheck.command ?? "GET https://api.github.com/repos/:owner/:repo",
        status: "error",
        exitCode: null,
        summary: repoCheck.message,
        issues: [
          {
            id: "repo-public-check-failed",
            title: "Repository is not publicly audit-ready",
            message: repoCheck.message,
          },
        ],
      },
    ],
  };
}

function toApiFinding(finding: Finding, context: ReviewContext) {
  return {
    ...finding,
    sources: sourceExcerptsForFinding(finding, context),
  };
}

function sourceExcerptsForFinding(
  finding: Finding,
  context: ReviewContext,
): FindingSourceExcerpt[] {
  const byPath = new Map<string, FindingSourceExcerpt>();

  for (const excerpt of context.sourceExcerpts ?? []) {
    if (finding.files.includes(excerpt.path)) {
      byPath.set(excerpt.path, excerpt);
    }
  }

  for (const file of sourceFilesForFinding(finding, context)) {
    if (!byPath.has(file.path)) {
      byPath.set(file.path, buildSourceExcerpt(file, finding));
    }
  }

  return [...byPath.values()].slice(0, 6);
}

function sourceFilesForFinding(finding: Finding, context: ReviewContext): RepoFile[] {
  const files = new Map<string, RepoFile>();

  for (const file of context.changedFiles) {
    if (typeof file.content === "string") {
      files.set(file.filename, {
        path: file.filename,
        content: file.content,
      });
    }
  }

  for (const file of [
    context.readme,
    context.packageJson,
    context.envExample,
    ...context.docsFiles,
  ]) {
    if (file) {
      files.set(file.path, file);
    }
  }

  return finding.files
    .map((filePath) => files.get(filePath))
    .filter((file): file is RepoFile => Boolean(file));
}
