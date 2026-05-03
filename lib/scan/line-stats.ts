import type { Dirent, Stats } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type {
  Finding,
  FindingSourceExcerpt,
  RepoFile,
  RepoLineStats,
} from "@/lib/review/types";

type LanguageKind = "code" | "hash-comment" | "text";

type LanguageDefinition = {
  language: string;
  kind: LanguageKind;
};

const IGNORE_DIRS = new Set([
  ".git",
  ".next",
  ".turbo",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

const MAX_STATS_FILE_BYTES = 1_000_000;
const DEFAULT_SOURCE_CONTEXT_LINES = 6;

const LANGUAGE_BY_EXTENSION: Record<string, LanguageDefinition> = {
  ".cjs": { language: "JavaScript", kind: "code" },
  ".css": { language: "CSS", kind: "code" },
  ".env": { language: "Environment", kind: "hash-comment" },
  ".js": { language: "JavaScript", kind: "code" },
  ".json": { language: "JSON", kind: "text" },
  ".jsx": { language: "JavaScript JSX", kind: "code" },
  ".md": { language: "Markdown", kind: "text" },
  ".mdx": { language: "MDX", kind: "text" },
  ".mjs": { language: "JavaScript", kind: "code" },
  ".ts": { language: "TypeScript", kind: "code" },
  ".tsx": { language: "TypeScript TSX", kind: "code" },
  ".txt": { language: "Text", kind: "text" },
  ".yaml": { language: "YAML", kind: "hash-comment" },
  ".yml": { language: "YAML", kind: "hash-comment" },
};

export async function collectRepoLineStats(rootPath: string): Promise<RepoLineStats> {
  const files: RepoFile[] = [];

  async function walk(directory: string) {
    let entries: Dirent[];
    try {
      entries = await readdir(/*turbopackIgnore: true*/ directory, {
        withFileTypes: true,
      });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".env.example") {
        continue;
      }

      const absolutePath = path.join(directory, entry.name);
      const relativePath = toRepoPath(path.relative(rootPath, absolutePath));

      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.has(entry.name)) {
          await walk(absolutePath);
        }
        continue;
      }

      if (!entry.isFile() || !languageDefinitionForPath(relativePath)) {
        continue;
      }

      let fileStat: Stats;
      try {
        fileStat = await stat(/*turbopackIgnore: true*/ absolutePath);
      } catch {
        continue;
      }

      if (fileStat.size > MAX_STATS_FILE_BYTES) {
        continue;
      }

      let content: string;
      try {
        content = await readFile(/*turbopackIgnore: true*/ absolutePath, "utf8");
      } catch {
        continue;
      }

      if (content.includes("\0")) {
        continue;
      }

      files.push({
        path: relativePath,
        content,
        size: fileStat.size,
      });
    }
  }

  await walk(rootPath);

  return calculateRepoLineStats(files);
}

export function calculateRepoLineStats(files: RepoFile[]): RepoLineStats {
  const languages = new Map<
    string,
    { language: string; files: number; loc: number; sloc: number }
  >();

  for (const file of files) {
    const definition = languageDefinitionForPath(file.path);
    if (!definition) {
      continue;
    }

    const loc = countLoc(file.content);
    const sloc = countSloc(file.content, definition.kind);
    const existing =
      languages.get(definition.language) ??
      ({
        language: definition.language,
        files: 0,
        loc: 0,
        sloc: 0,
      } satisfies {
        language: string;
        files: number;
        loc: number;
        sloc: number;
      });

    existing.files += 1;
    existing.loc += loc;
    existing.sloc += sloc;
    languages.set(definition.language, existing);
  }

  const rows = [...languages.values()].sort(
    (a, b) => b.sloc - a.sloc || b.loc - a.loc || a.language.localeCompare(b.language),
  );

  return {
    files: rows.reduce((sum, entry) => sum + entry.files, 0),
    loc: rows.reduce((sum, entry) => sum + entry.loc, 0),
    sloc: rows.reduce((sum, entry) => sum + entry.sloc, 0),
    prominentLanguage: rows[0]?.language ?? null,
    languages: rows,
  };
}

export function buildSourceExcerpt(
  file: RepoFile,
  finding: Finding,
  contextLines = DEFAULT_SOURCE_CONTEXT_LINES,
): FindingSourceExcerpt {
  const lines = splitContentLines(file.content);
  const line = inferFindingLine(file, finding, lines) ?? 1;
  const startLine = Math.max(1, line - contextLines);
  const endLine = Math.min(lines.length, line + contextLines);

  return {
    path: file.path,
    line,
    startLine,
    endLine,
    lines: lines.slice(startLine - 1, endLine).map((text, index) => ({
      number: startLine + index,
      text,
    })),
  };
}

export function languageDefinitionForPath(filePath: string) {
  const normalized = filePath.toLowerCase();
  if (normalized === ".env.example") {
    return LANGUAGE_BY_EXTENSION[".env"];
  }

  return LANGUAGE_BY_EXTENSION[path.extname(normalized)] ?? null;
}

function inferFindingLine(
  file: RepoFile,
  finding: Finding,
  lines: string[],
): number | null {
  const explicit = explicitLineForPath(file.path, finding.evidence);
  if (explicit) {
    return explicit;
  }

  const tokens = tokensForFinding(finding);
  for (const token of tokens) {
    const index = lines.findIndex((line) => line.includes(token));
    if (index >= 0) {
      return index + 1;
    }
  }

  return null;
}

function explicitLineForPath(filePath: string, evidence: string[]) {
  const escapedPath = escapeRegExp(filePath);
  const pathPattern = new RegExp(`${escapedPath}:(\\d+)`);
  for (const item of evidence) {
    const pathMatch = item.match(pathPattern);
    if (pathMatch) {
      return Number(pathMatch[1]);
    }

    const lineMatch = item.match(/\bline\s+(\d+)\b/i);
    if (lineMatch && item.includes(filePath)) {
      return Number(lineMatch[1]);
    }
  }

  return null;
}

function tokensForFinding(finding: Finding) {
  const raw = [
    finding.summary,
    finding.suggestedFix,
    ...finding.evidence,
    finding.title,
  ].join("\n");

  return [...raw.matchAll(/`([^`]{3,120})`/g)]
    .map((match) => match[1].trim())
    .filter((token) => !token.includes("\n"))
    .sort((a, b) => b.length - a.length);
}

function countLoc(content: string) {
  return splitContentLines(content).length;
}

function countSloc(content: string, kind: LanguageKind) {
  if (kind === "code") {
    return countCodeSloc(content);
  }
  if (kind === "hash-comment") {
    return splitContentLines(content).filter((line) => {
      const trimmed = line.trim();
      return trimmed.length > 0 && !trimmed.startsWith("#");
    }).length;
  }

  return splitContentLines(content).filter((line) => line.trim().length > 0).length;
}

function countCodeSloc(content: string) {
  let inBlockComment = false;
  let count = 0;

  for (const line of splitContentLines(content)) {
    let text = line.trim();
    let hasCode = false;

    while (text) {
      if (inBlockComment) {
        const end = text.indexOf("*/");
        if (end < 0) {
          text = "";
          break;
        }
        text = text.slice(end + 2).trim();
        inBlockComment = false;
        continue;
      }

      if (text.startsWith("//")) {
        break;
      }

      const lineComment = text.indexOf("//");
      const blockComment = text.indexOf("/*");
      if (blockComment >= 0 && (lineComment < 0 || blockComment < lineComment)) {
        if (text.slice(0, blockComment).trim()) {
          hasCode = true;
        }

        const end = text.indexOf("*/", blockComment + 2);
        if (end < 0) {
          inBlockComment = true;
          text = "";
          break;
        }

        text = text.slice(end + 2).trim();
        continue;
      }

      const code = lineComment >= 0 ? text.slice(0, lineComment).trim() : text;
      if (code) {
        hasCode = true;
      }
      break;
    }

    if (hasCode) {
      count += 1;
    }
  }

  return count;
}

function splitContentLines(content: string) {
  if (!content) {
    return [];
  }

  const lines = content.split(/\r\n|\r|\n/);
  if (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

function toRepoPath(filePath: string) {
  return filePath.split(path.sep).join("/");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
