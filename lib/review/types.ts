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

export type DeputyReport = {
  mergeConfidence: "safe" | "needs-docs-update" | "needs-human-review";
  summary: string;
  findings: Finding[];
  markdown: string;
  memoryUsed?: RepoMemoryInsight[];
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

export type ReviewContext = {
  scope: "repo" | "change-set";
  owner?: string;
  repoName?: string;
  repo: string;
  rootPath?: string;
  command: ReviewCommand;
  focus: ReviewFocus;
  changedFiles: ChangedFile[];
  docsFiles: RepoFile[];
  packageJson: RepoFile | null;
  packageInfo: Record<string, unknown> | null;
  readme: RepoFile | null;
  envExample: RepoFile | null;
  memoryInsights: RepoMemoryInsight[];
};

export type RepoScanInput = {
  focus: ReviewFocus;
  rootPath?: string;
  useAi?: boolean;
  useMemory?: boolean;
};

export type RepoScanResult = {
  context: ReviewContext;
  report: DeputyReport;
  markdown: string;
};
