import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod/v4";
import { parseDeputyCommand } from "@/lib/commands/deputy-command";
import { runCodeDriftChecks } from "@/lib/review/code-drift";
import { runDocsDriftChecks } from "@/lib/review/docs-drift";
import { runFallowAnalysis } from "@/lib/review/fallow-placeholder";
import { buildFallbackReport } from "@/lib/review/generate-report";
import { SEEDED_DEMO_FINDINGS } from "@/lib/review/mock-findings";
import { reportToMarkdown } from "@/lib/review/report-markdown";
import { runRepoScan } from "@/lib/scan/repo";
import type {
  ChangedFile,
  DeputyReport,
  Finding,
  RepoFile,
  ReviewContext,
  ReviewFocus,
} from "@/lib/review/types";

const reviewFocusSchema = z.enum(["docs", "code", "full"]);

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

const memoryInsightSchema = z.object({
  id: z.string(),
  repo: z.string(),
  summary: z.string(),
  category: z.enum([
    "docs-drift",
    "code-drift",
    "dependency-drift",
    "architecture-drift",
    "repo-convention",
  ]),
  evidence: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1),
  lastSeenAt: z.string().optional(),
});

const changedFileSchema = z.object({
  filename: z.string(),
  status: z
    .enum(["added", "removed", "modified", "renamed", "copied", "changed", "unchanged"])
    .default("modified"),
  additions: z.number().int().nonnegative().default(0),
  deletions: z.number().int().nonnegative().default(0),
  changes: z.number().int().nonnegative().default(0),
  patch: z.string().optional(),
  previousFilename: z.string().optional(),
  content: z.string().optional(),
});

const repoFileSchema = z.object({
  path: z.string(),
  content: z.string(),
});

export function createRepoDeputyMcpServer() {
  const server = new McpServer({
    name: "repo-deputy",
    version: "0.1.0",
  });

  server.registerTool(
    "repo_deputy_parse_command",
    {
      title: "Parse Repo Deputy command",
      description:
        "Parse a Repo Deputy command string and return the recognized command/focus, or null for ignored text.",
      inputSchema: {
        text: z.string().describe("Command text"),
        botUserName: z.string().optional(),
        authorIsBot: z.boolean().optional(),
        authorIsMe: z.boolean().optional(),
        authorUserName: z.string().optional(),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async ({ text, botUserName, authorIsBot, authorIsMe, authorUserName }) => {
      const command = parseDeputyCommand(text, {
        botUserName,
        author: {
          isBot: authorIsBot ?? false,
          isMe: authorIsMe ?? false,
          userName: authorUserName,
        },
      });

      return jsonResult({ command });
    },
  );

  server.registerTool(
    "repo_deputy_scan_repo",
    {
      title: "Scan a local repository",
      description:
        "Run Repo Deputy's whole-repository scanner against a local path and return findings plus markdown.",
      inputSchema: {
        rootPath: z
          .string()
          .optional()
          .describe("Repository root. Defaults to the MCP server working directory."),
        focus: reviewFocusSchema.default("full"),
        useAi: z
          .boolean()
          .default(false)
          .describe("Use Vercel AI Gateway when AI_GATEWAY_API_KEY is configured."),
        useMemory: z
          .boolean()
          .default(false)
          .describe("Read/write optional Mubit repo memory when configured."),
      },
      annotations: {
        readOnlyHint: false,
        openWorldHint: true,
      },
    },
    async ({ rootPath, focus, useAi, useMemory }) => {
      const result = await runRepoScan({ rootPath, focus, useAi, useMemory });

      return jsonResult({
        repo: result.context.repo,
        rootPath: result.context.rootPath,
        scannedFiles: result.context.changedFiles.length,
        mergeConfidence: result.report.mergeConfidence,
        summary: result.report.summary,
        findings: result.report.findings,
        markdown: result.markdown,
        memoryUsed: result.report.memoryUsed ?? [],
      });
    },
  );

  server.registerTool(
    "repo_deputy_demo_scan",
    {
      title: "Generate seeded Repo Deputy demo scan",
      description:
        "Return a deterministic demo Repo Deputy report using the seeded fallback findings.",
      inputSchema: {
        focus: reviewFocusSchema.default("full"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async ({ focus }) => {
      const report = buildFallbackReport(
        filterFindingsForFocus(SEEDED_DEMO_FINDINGS, focus),
        [],
        focus,
      );

      return jsonResult({ report });
    },
  );

  server.registerTool(
    "repo_deputy_render_report",
    {
      title: "Render Repo Deputy scan markdown",
      description:
        "Render a DeputyReport-shaped payload into Repo Deputy's GitHub Flavored Markdown scan format.",
      inputSchema: {
        focus: reviewFocusSchema.default("full"),
        mergeConfidence: z.enum(["safe", "needs-docs-update", "needs-human-review"]),
        summary: z.string(),
        findings: z.array(findingSchema),
        memoryUsed: z.array(memoryInsightSchema).optional(),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async ({ focus, mergeConfidence, summary, findings, memoryUsed }) => {
      const report: DeputyReport = {
        mergeConfidence,
        summary,
        findings,
        markdown: "",
        memoryUsed,
      };
      const markdown = reportToMarkdown(report, { focus });

      return jsonResult({ markdown });
    },
  );

  server.registerTool(
    "repo_deputy_check_drift",
    {
      title: "Run deterministic Repo Deputy drift checks",
      description:
        "Run Repo Deputy's deterministic docs/code drift checks against supplied file fixtures. This does not call Mubit or AI Gateway.",
      inputSchema: {
        focus: reviewFocusSchema.default("full"),
        repo: z.string().default("local/repo"),
        scope: z.enum(["repo", "change-set"]).default("repo"),
        packageJsonContent: z.string().optional(),
        readmeContent: z.string().optional(),
        envExampleContent: z.string().optional(),
        docsFiles: z.array(repoFileSchema).default([]),
        changedFiles: z.array(changedFileSchema).default([]),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const context = createFixtureReviewContext(input);
      const findings = await runDeterministicChecks(context);
      const report = buildFallbackReport(findings, [], input.focus);

      return jsonResult({ findings, report });
    },
  );

  return server;
}

async function main() {
  const server = createRepoDeputyMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Repo Deputy MCP server running on stdio");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error("Repo Deputy MCP server failed", error);
    process.exit(1);
  });
}

async function runDeterministicChecks(context: ReviewContext) {
  const findings: Finding[] = [];

  if (context.focus === "docs" || context.focus === "full") {
    findings.push(...runDocsDriftChecks(context));
  }

  if (context.focus === "code" || context.focus === "full") {
    findings.push(...runCodeDriftChecks(context));
    findings.push(...(await runFallowAnalysis(context)));
  }

  return [...new Map(findings.map((finding) => [finding.id, finding])).values()];
}

function createFixtureReviewContext(input: {
  focus: ReviewFocus;
  repo: string;
  scope?: "repo" | "change-set";
  packageJsonContent?: string;
  readmeContent?: string;
  envExampleContent?: string;
  docsFiles: RepoFile[];
  changedFiles: ChangedFile[];
}): ReviewContext {
  const [owner, repoName] = input.repo.includes("/")
    ? input.repo.split("/", 2)
    : ["local", input.repo];
  const packageJson = input.packageJsonContent
    ? { path: "package.json", content: input.packageJsonContent }
    : null;

  return {
    owner,
    repoName,
    repo: `${owner}/${repoName}`,
    scope: input.scope ?? "repo",
    command: "scan",
    focus: input.focus,
    changedFiles: input.changedFiles,
    docsFiles: input.docsFiles,
    packageJson,
    packageInfo: parseJson(packageJson?.content),
    readme: input.readmeContent
      ? { path: "README.md", content: input.readmeContent }
      : null,
    envExample: input.envExampleContent
      ? { path: ".env.example", content: input.envExampleContent }
      : null,
    memoryInsights: [],
  };
}

function parseJson(content: string | undefined) {
  if (!content) {
    return null;
  }

  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function filterFindingsForFocus(findings: Finding[], focus: ReviewFocus) {
  if (focus === "docs") {
    return findings.filter((finding) => finding.category === "docs-drift");
  }

  if (focus === "code") {
    return findings.filter((finding) => finding.category !== "docs-drift");
  }

  return findings;
}

function jsonResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}
