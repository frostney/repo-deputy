import { generateObject } from "ai";
import { z } from "zod";
import { getGatewayModel } from "@/lib/ai/gateway";
import type {
  DeputyReport,
  Finding,
  ReviewFocus,
  ToolCheckResult,
} from "@/lib/review/types";
import type { RepoMemoryInsight } from "@/lib/memory/types";
import { reportToMarkdown } from "@/lib/review/report-markdown";

const REPORT_PROMPT = `You are Repo Deputy, a focused whole-repository code-and-docs drift scanner for AI-generated changes.

You are not a generic code reviewer.
Your job is to check whether the repo still tells the truth after an AI agent changed the code.

Use the deterministic findings as evidence.
Do not invent files.
Do not invent issues.
Do not create findings from memory alone.

Relevant repo memory may influence prioritisation, but current repository evidence is stronger.
Memory can help identify repeated drift patterns.
Memory cannot be used as the only basis for a finding.

Rank findings by merge risk.
Prefer docs drift and repo truthfulness issues over style comments.
Be concise, practical, and specific.
Output a concise GitHub Flavored Markdown scan report.`;

const DEFAULT_AI_GATEWAY_TIMEOUT_MS = 6_000;

const findingSchema = z.object({
  id: z.string(),
  category: z.enum([
    "docs-drift",
    "code-drift",
    "dependency-drift",
    "architecture-drift",
  ]),
  severity: z.enum(["low", "medium", "high"]),
  title: z.string(),
  summary: z.string(),
  evidence: z.array(z.string()),
  files: z.array(z.string()),
  suggestedFix: z.string(),
  confidence: z.number().min(0).max(1),
});

const reportSchema = z.object({
  mergeConfidence: z.enum(["safe", "needs-docs-update", "needs-human-review"]),
  summary: z.string(),
  findings: z.array(findingSchema),
  markdown: z.string(),
});

export async function generateDeputyReport(input: {
  repo: string;
  focus: ReviewFocus;
  findings: Finding[];
  memoryInsights: RepoMemoryInsight[];
  toolResults?: ToolCheckResult[];
}): Promise<DeputyReport> {
  if (!process.env.AI_GATEWAY_API_KEY) {
    return buildFallbackReport(
      input.findings,
      input.memoryInsights,
      input.focus,
      input.toolResults,
    );
  }

  try {
    const result = await generateObject({
      model: getGatewayModel(),
      schema: reportSchema,
      timeout: readAiGatewayTimeoutMs(),
      maxRetries: 0,
      maxOutputTokens: 1_500,
      prompt: buildPrompt(input),
    });

    const allowedIds = new Set(input.findings.map((finding) => finding.id));
    const findings = result.object.findings.filter((finding) =>
      allowedIds.has(finding.id),
    );

    const report: DeputyReport = {
      mergeConfidence: result.object.mergeConfidence,
      summary: result.object.summary,
      findings: findings.length ? findings : input.findings,
      markdown: result.object.markdown,
      memoryUsed: input.memoryInsights,
      toolResults: input.toolResults,
    };

    return {
      ...report,
      markdown: reportToMarkdown(report, { focus: input.focus }),
    };
  } catch (error) {
    console.warn("AI Gateway report generation failed; using fallback report.", error);
    return buildFallbackReport(
      input.findings,
      input.memoryInsights,
      input.focus,
      input.toolResults,
    );
  }
}

export function buildFallbackReport(
  findings: Finding[],
  memoryInsights: RepoMemoryInsight[],
  focus: ReviewFocus,
  toolResults: ToolCheckResult[] = [],
): DeputyReport {
  const mergeConfidence = confidenceFromFindings(findings);
  const summary =
    findings.length === 0
      ? "Repo Deputy did not find docs or code drift in the scanned repository."
      : `Repo Deputy found ${findings.length} drift finding${
          findings.length === 1 ? "" : "s"
        }, prioritizing repo truthfulness over general review comments.`;

  const report: DeputyReport = {
    mergeConfidence,
    summary,
    findings: sortFindings(findings),
    markdown: "",
    memoryUsed: memoryInsights,
    toolResults,
  };

  return {
    ...report,
    markdown: reportToMarkdown(report, { focus }),
  };
}

export function readAiGatewayTimeoutMs(value = process.env.AI_GATEWAY_TIMEOUT_MS) {
  if (!value) {
    return DEFAULT_AI_GATEWAY_TIMEOUT_MS;
  }

  const timeoutMs = Number(value);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000) {
    return DEFAULT_AI_GATEWAY_TIMEOUT_MS;
  }

  return Math.min(timeoutMs, 25_000);
}

function buildPrompt(input: {
  repo: string;
  focus: ReviewFocus;
  findings: Finding[];
  memoryInsights: RepoMemoryInsight[];
  toolResults?: ToolCheckResult[];
}) {
  return `${REPORT_PROMPT}

Repo: ${input.repo}
Scope: whole repository
Focus: ${input.focus}

Deterministic findings:
${JSON.stringify(input.findings, null, 2)}

Relevant repo memory:
${JSON.stringify(input.memoryInsights, null, 2)}

External tool results:
${JSON.stringify(input.toolResults ?? [], null, 2)}`;
}

function confidenceFromFindings(findings: Finding[]): DeputyReport["mergeConfidence"] {
  if (
    findings.some(
      (finding) =>
        finding.severity === "high" &&
        (finding.category === "architecture-drift" ||
          finding.category === "code-drift" ||
          finding.category === "dependency-drift"),
    )
  ) {
    return "needs-human-review";
  }

  if (
    findings.some(
      (finding) => finding.category === "docs-drift" && finding.severity !== "low",
    )
  ) {
    return "needs-docs-update";
  }

  return findings.length ? "needs-human-review" : "safe";
}

function sortFindings(findings: Finding[]) {
  const severityRank = { high: 0, medium: 1, low: 2 };
  return [...findings].sort(
    (a, b) =>
      severityRank[a.severity] - severityRank[b.severity] || b.confidence - a.confidence,
  );
}
