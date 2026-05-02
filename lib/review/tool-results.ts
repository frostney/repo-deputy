import type { Finding, ToolCheckResult } from "@/lib/review/types";

export function toolIssuesToFindings(
  result: ToolCheckResult,
  options: {
    confidence?: number;
    errorConfidence?: number;
  } = {},
): Finding[] {
  const confidence = options.confidence ?? 0.86;
  const errorConfidence = options.errorConfidence ?? 0.7;

  return result.issues.map((issue) => ({
    id: issue.id,
    category: issue.category,
    severity: issue.severity,
    title: issue.title,
    summary: issue.message,
    evidence: issue.evidence,
    files: issue.path ? [issue.path] : [],
    suggestedFix: issue.suggestedFix,
    confidence: result.status === "error" ? errorConfidence : confidence,
  }));
}
