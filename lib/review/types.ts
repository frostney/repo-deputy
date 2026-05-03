import type { RepoMemoryInsight } from "@/lib/memory/types";

export type ReviewFocus = "docs" | "code" | "full";

export type ReviewCommand = "scan" | "review" | "docs" | "code" | "full";

export type Finding = {
  id: string;
  category: "docs-drift" | "code-drift" | "dependency-drift" | "architecture-drift";
  severity: "low" | "medium" | "high";
  title: string;
  summary: string;
  evidence: string[];
  files: string[];
  suggestedFix: string;
  confidence: number;
};

export type ToolCheckStatus = "passed" | "failed" | "error" | "skipped";

export type ToolCheckIssue = {
  id: string;
  title: string;
  severity: Finding["severity"];
  category: Finding["category"];
  path?: string;
  line?: number;
  message: string;
  evidence: string[];
  suggestedFix: string;
};

export type ToolCheckOutput = {
  stdout: string;
  stderr: string;
  truncated: boolean;
};

export type ToolCheckResult = {
  id: string;
  name: string;
  command: string;
  status: ToolCheckStatus;
  exitCode: number | null;
  summary: string;
  durationMs?: number;
  issues: ToolCheckIssue[];
  output?: ToolCheckOutput;
};

export type SandboxScanMetadata = {
  repoUrl: string;
  cloneDepth: number;
  revision?: string;
  commit?: string;
  sandboxId?: string;
};

export type DeputyReport = {
  mergeConfidence: "safe" | "needs-docs-update" | "needs-human-review";
  summary: string;
  findings: Finding[];
  markdown: string;
  memoryUsed?: RepoMemoryInsight[];
  toolResults?: ToolCheckResult[];
};

export type ChangedFile = {
  filename: string;
  status:
    | "added"
    | "removed"
    | "modified"
    | "renamed"
    | "copied"
    | "changed"
    | "unchanged";
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
  previousFilename?: string;
  rawUrl?: string;
  content?: string;
};

export type RepoFile = {
  path: string;
  content: string;
  size?: number;
};

export type RepoLanguageLineStats = {
  language: string;
  files: number;
  loc: number;
  sloc: number;
};

export type RepoLineStats = {
  files: number;
  loc: number;
  sloc: number;
  prominentLanguage: string | null;
  languages: RepoLanguageLineStats[];
};

export type SourceExcerptLine = {
  number: number;
  text: string;
};

export type FindingSourceExcerpt = {
  path: string;
  line?: number;
  startLine: number;
  endLine: number;
  lines: SourceExcerptLine[];
};

export type ReviewContext = {
  scope: "repo" | "change-set";
  owner?: string;
  repoName?: string;
  repo: string;
  rootPath?: string;
  scannedFiles?: number;
  command: ReviewCommand;
  focus: ReviewFocus;
  changedFiles: ChangedFile[];
  docsFiles: RepoFile[];
  packageJson: RepoFile | null;
  packageInfo: Record<string, unknown> | null;
  readme: RepoFile | null;
  envExample: RepoFile | null;
  memoryInsights: RepoMemoryInsight[];
  toolResults: ToolCheckResult[];
  lineStats?: RepoLineStats;
  sourceExcerpts?: FindingSourceExcerpt[];
  sandbox?: SandboxScanMetadata;
  runExternalTools?: boolean;
};

export type RepoScanInput = {
  focus: ReviewFocus;
  rootPath?: string;
  repoUrl?: string;
  revision?: string;
  useAi?: boolean;
  useMemory?: boolean;
  useSandbox?: boolean;
  runExternalTools?: boolean;
};

export type RepoScanResult = {
  context: ReviewContext;
  report: DeputyReport;
  markdown: string;
};
