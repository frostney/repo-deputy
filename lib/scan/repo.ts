import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getRepoMemory, writeScanMemory } from "@/lib/memory/repo-memory";
import type { RepoMemoryEvent } from "@/lib/memory/types";
import { runCodeDriftChecks } from "@/lib/review/code-drift";
import { runDocsDriftChecks } from "@/lib/review/docs-drift";
import { runFallowAnalysis } from "@/lib/review/fallow-placeholder";
import { buildFallbackReport, generateDeputyReport } from "@/lib/review/generate-report";
import type {
  ChangedFile,
  DeputyReport,
  Finding,
  RepoFile,
  RepoScanInput,
  RepoScanResult,
  ReviewContext,
  ReviewFocus,
} from "@/lib/review/types";

const IGNORE_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

const MAX_FILE_BYTES = 180_000;
const MAX_TOTAL_FILES = 700;
const TEXT_FILE_PATTERN = /\.(cjs|css|env|js|json|jsx|md|mdx|mjs|ts|tsx|txt|yaml|yml)$/i;

export async function runRepoScan(input: RepoScanInput = { focus: "full" }) {
  const context = await collectRepoScanContext(input);
  const memoryInsights =
    input.useMemory === false
      ? []
      : await getRepoMemory({
          repo: context.repo,
          repoName: context.repoName,
        });
  context.memoryInsights = memoryInsights;

  const findings = await runScanChecks(context, input.focus);
  const report =
    input.useAi === false
      ? buildFallbackReport(findings, memoryInsights, context.focus)
      : await generateDeputyReport({
          repo: context.repo,
          focus: context.focus,
          findings,
          memoryInsights,
        });

  if (input.useMemory !== false) {
    await writeScanMemory(toMemoryEvent(context, report));
  }

  return {
    context,
    report,
    markdown: report.markdown,
  } satisfies RepoScanResult;
}

export async function collectRepoScanContext(
  input: RepoScanInput = { focus: "full" },
): Promise<ReviewContext> {
  const rootPath = path.resolve(
    input.rootPath ?? /* turbopackIgnore: true */ process.cwd(),
  );
  const files = await readRepoFiles(rootPath);
  const repoName = path.basename(rootPath);
  const repo = `local/${repoName}`;
  const packageJson = findFile(files, "package.json");
  const readme = findFile(files, "README.md");
  const envExample = findFile(files, ".env.example");
  const docsFiles = files.filter((file) => /^docs\/.+\.mdx?$/i.test(file.path));

  return {
    scope: "repo",
    repo,
    repoName,
    rootPath,
    command: "scan",
    focus: input.focus,
    changedFiles: files.map(toChangedFile),
    docsFiles,
    packageJson,
    packageInfo: parseJson(packageJson?.content),
    readme,
    envExample,
    memoryInsights: [],
  };
}

async function runScanChecks(context: ReviewContext, focus: ReviewFocus) {
  const findings: Finding[] = [];

  if (focus === "docs" || focus === "full") {
    findings.push(...runDocsDriftChecks(context));
  }

  if (focus === "code" || focus === "full") {
    findings.push(...runCodeDriftChecks(context));
    findings.push(...(await runFallowAnalysis(context)));
  }

  return [...new Map(findings.map((finding) => [finding.id, finding])).values()];
}

async function readRepoFiles(rootPath: string) {
  const files: RepoFile[] = [];

  async function walk(directory: string) {
    if (files.length >= MAX_TOTAL_FILES) {
      return;
    }

    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= MAX_TOTAL_FILES) {
        return;
      }

      if (entry.name.startsWith(".") && entry.name !== ".env.example") {
        if (entry.name !== ".env.example") {
          continue;
        }
      }

      const absolutePath = path.join(directory, entry.name);
      const relativePath = toRepoPath(path.relative(rootPath, absolutePath));

      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) {
          await walk(absolutePath);
        }
        continue;
      }

      if (!entry.isFile() || !isScannablePath(relativePath)) {
        continue;
      }

      const fileStat = await stat(absolutePath);
      if (fileStat.size > MAX_FILE_BYTES) {
        continue;
      }

      files.push({
        path: relativePath,
        content: await readFile(absolutePath, "utf8"),
        size: fileStat.size,
      });
    }
  }

  await walk(rootPath);
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

function toChangedFile(file: RepoFile): ChangedFile {
  return {
    filename: file.path,
    status: "unchanged",
    additions: 0,
    deletions: 0,
    changes: 0,
    content: file.content,
  };
}

function toMemoryEvent(context: ReviewContext, report: DeputyReport): RepoMemoryEvent {
  return {
    repo: context.repo,
    command: "scan",
    mergeConfidence: report.mergeConfidence,
    findingCounts: {
      docsDrift: countCategory(report.findings, "docs-drift"),
      codeDrift: countCategory(report.findings, "code-drift"),
      dependencyDrift: countCategory(report.findings, "dependency-drift"),
      architectureDrift: countCategory(report.findings, "architecture-drift"),
    },
    lessons: report.findings
      .map((finding) =>
        [
          `${finding.category}: ${finding.title}`,
          finding.files.length ? `Files: ${finding.files.join(", ")}` : "",
          finding.suggestedFix,
        ]
          .filter(Boolean)
          .join(" | "),
      )
      .slice(0, 8),
    timestamp: new Date().toISOString(),
  };
}

function countCategory(findings: Finding[], category: Finding["category"]) {
  return findings.filter((finding) => finding.category === category).length;
}

function findFile(files: RepoFile[], filePath: string) {
  return files.find((file) => file.path.toLowerCase() === filePath.toLowerCase()) ?? null;
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

function isScannablePath(filePath: string) {
  return (
    TEXT_FILE_PATTERN.test(filePath) ||
    filePath === "package.json" ||
    filePath === ".env.example"
  );
}

function toRepoPath(filePath: string) {
  return filePath.split(path.sep).join("/");
}
