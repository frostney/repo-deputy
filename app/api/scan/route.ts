import { runRepoScan } from "@/lib/scan/repo";
import type { ReviewFocus } from "@/lib/review/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const focus = parseFocus(url.searchParams.get("focus"));
  const useMemory = url.searchParams.get("memory") === "true";
  const useAi = url.searchParams.get("ai") !== "false";
  const result = await runRepoScan({ focus, useAi, useMemory });

  return Response.json({
    repo: result.context.repo,
    rootPath: result.context.rootPath,
    scannedFiles: result.context.changedFiles.length,
    mergeConfidence: result.report.mergeConfidence,
    summary: result.report.summary,
    findings: result.report.findings,
    markdown: result.markdown,
    memoryUsed: result.report.memoryUsed ?? [],
  });
}

function parseFocus(value: string | null): ReviewFocus {
  if (value === "docs" || value === "code" || value === "full") {
    return value;
  }

  return "full";
}
