export type RepoMemoryCategory =
  | "docs-drift"
  | "code-drift"
  | "dependency-drift"
  | "architecture-drift"
  | "repo-convention";

export type RepoMemoryInsight = {
  id: string;
  repo: string;
  summary: string;
  category: RepoMemoryCategory;
  evidence?: string[];
  confidence: number;
  lastSeenAt?: string;
};

export type RepoMemoryEvent = {
  repo: string;
  scanId?: string;
  command: "scan" | "review" | "docs" | "code" | "full";
  mergeConfidence: "safe" | "needs-docs-update" | "needs-human-review";
  findingCounts: {
    docsDrift: number;
    codeDrift: number;
    dependencyDrift: number;
    architectureDrift: number;
  };
  lessons: string[];
  timestamp: string;
};

export type RepoMemoryContext = {
  repo: string;
  owner?: string;
  repoName?: string;
};
