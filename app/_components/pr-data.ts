import type { ApiFinding, ScanResult, Severity } from "./data";

export type FixOption = {
  id: string;
  title: string;
  category: string;
  severity: Severity;
  files: string[];
  fileCount: number;
  evidenceCount: number;
  suggestedFix: string;
  confidence: number | null;
};

export type PullRequestDraft = {
  count: number;
  files: number;
  evidence: number;
  branch: string;
  title: string;
  findingIds: string[];
  filePaths: string[];
  highestSeverity: Severity | null;
  scanSummary: string;
  mergeConfidence: ScanResult["mergeConfidence"] | null;
};

type BuildDraftInput = {
  options: FixOption[];
  selectedIds: string[];
  branch: string;
  title: string;
  scanResult: ScanResult | null;
};

export function buildFixOptions(scanResult: ScanResult | null): FixOption[] {
  if (!scanResult) {
    return [];
  }

  return scanResult.findings.map((finding) => {
    const files = uniqueStrings(finding.files);
    const suggestedFix = cleanText(finding.suggestedFix);
    const summary = cleanText(finding.summary);

    return {
      id: finding.id,
      title: suggestedFix || summary || finding.title,
      category: dashboardCategoryForFinding(finding),
      severity: finding.severity,
      files,
      fileCount: files.length,
      evidenceCount: finding.evidence.filter(Boolean).length,
      suggestedFix,
      confidence: Number.isFinite(finding.confidence) ? finding.confidence : null,
    };
  });
}

export function buildPullRequestDraft({
  options,
  selectedIds,
  branch,
  title,
  scanResult,
}: BuildDraftInput): PullRequestDraft {
  const selected = selectedFixOptions(options, selectedIds);
  const filePaths = uniqueStrings(selected.flatMap((option) => option.files));

  return {
    count: selected.length,
    files: filePaths.length,
    evidence: selected.reduce((sum, option) => sum + option.evidenceCount, 0),
    branch: cleanText(branch),
    title: cleanText(title) || defaultPrTitle(selected),
    findingIds: selected.map((option) => option.id),
    filePaths,
    highestSeverity: highestSeverity(selected),
    scanSummary: scanResult?.summary ?? "",
    mergeConfidence: scanResult?.mergeConfidence ?? null,
  };
}

export function defaultSelectedFixIds(options: FixOption[]) {
  const prioritized = options.filter(
    (option) => option.severity === "critical" || option.severity === "high",
  );

  return (prioritized.length ? prioritized : options).map((option) => option.id);
}

export function defaultPrBranch(repo: string, scanResult: ScanResult | null) {
  const repoSlug = slugify(repo) || "repo";
  const findingSeed =
    scanResult?.findings.map((finding) => finding.id).join("-") ||
    scanResult?.repo ||
    repo;

  return `repo-deputy/${repoSlug.slice(0, 36)}-${stableHash(findingSeed)}`;
}

export function defaultPrTitle(options: FixOption[]) {
  if (options.length === 0) {
    return "chore: prepare repo deputy scan request";
  }

  const category = dominantCategory(options).toLowerCase();
  const suffix = options.length === 1 ? "finding" : "findings";

  return `chore: address ${options.length} ${category} ${suffix}`;
}

export function highestSeverity(options: FixOption[]): Severity | null {
  return options.reduce<Severity | null>((highest, option) => {
    if (!highest || severityRank(option.severity) > severityRank(highest)) {
      return option.severity;
    }

    return highest;
  }, null);
}

export function dashboardCategoryForFinding(finding: ApiFinding) {
  const text = `${finding.id} ${finding.title} ${finding.category}`.toLowerCase();
  if (text.includes("duplicate") || text.includes("dupe")) {
    return "Duplication";
  }
  if (text.includes("complexity") || text.includes("health")) {
    return "Complexity";
  }
  if (text.includes("cycle")) {
    return "Cycles";
  }
  if (finding.category === "docs-drift") {
    return "Docs";
  }

  return "Drift";
}

function selectedFixOptions(options: FixOption[], selectedIds: string[]) {
  const selected = new Set(selectedIds);
  return options.filter((option) => selected.has(option.id));
}

function uniqueStrings(values: string[]) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function cleanText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function dominantCategory(options: FixOption[]) {
  const counts = new Map<string, number>();
  for (const option of options) {
    counts.set(option.category, (counts.get(option.category) ?? 0) + 1);
  }

  return (
    [...counts.entries()].sort(
      ([leftCategory, leftCount], [rightCategory, rightCount]) =>
        rightCount - leftCount || leftCategory.localeCompare(rightCategory),
    )[0]?.[0] ?? "scan"
  );
}

function severityRank(severity: Severity) {
  return {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  }[severity];
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stableHash(value: string) {
  let hash = 2_166_136_261;

  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16_777_619);
  }

  return (hash >>> 0).toString(36).padStart(6, "0").slice(0, 6);
}
