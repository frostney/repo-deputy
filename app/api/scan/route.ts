import { runRepoScan } from "@/lib/scan/repo";
import type { ReviewFocus } from "@/lib/review/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const focus = parseFocus(url.searchParams.get("focus"));
  const useMemory = url.searchParams.get("memory") === "true";
  const useAi = url.searchParams.get("ai") !== "false";
  const repoUrl = url.searchParams.get("repo") || undefined;
  const revision = url.searchParams.get("revision") || undefined;
  const runExternalTools = url.searchParams.get("tools") === "true";
  const result = await runRepoScan({
    focus,
    repoUrl,
    revision,
    useAi,
    useMemory,
    runExternalTools,
  });

  return Response.json({
    repo: result.context.repo,
    repoUrl: result.context.sandbox?.repoUrl,
    rootPath: result.context.rootPath,
    sandbox: result.context.sandbox,
    scannedFiles: result.context.scannedFiles ?? result.context.changedFiles.length,
    mergeConfidence: result.report.mergeConfidence,
    summary: result.report.summary,
    findings: result.report.findings,
    markdown: result.markdown,
    memoryUsed: result.report.memoryUsed ?? [],
    toolResults: result.report.toolResults ?? [],
  });
}

function parseFocus(value: string | null): ReviewFocus {
  if (value === "docs" || value === "code" || value === "full") {
    return value;
  }

  return "full";
}
