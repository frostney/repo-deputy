import type {
  Finding,
  LightLanguageSkipped,
  ReviewContext,
  ToolCheckIssue,
  ToolCheckResult,
} from "@/lib/review/types";
import { toolIssuesToFindings } from "@/lib/review/tool-results";

export const LIGHT_LANGUAGE_TOOL_ID = "light-language-analysis";

const LIGHT_LANGUAGE_COMMAND = "repo-deputy light-language-analysis (in-process)";
const MIN_DUPLICATE_LINES = 8;
const MIN_DUPLICATE_CHARS = 240;
const MAX_COMPLEXITY_EVIDENCE = 8;
const MAX_DUPLICATE_GROUPS = 4;
const MAX_DUPLICATE_LOCATIONS = 12;
const MEDIUM_BRANCH_COUNT = 12;
const MEDIUM_STRUCTURAL_SCORE = 18;
const MEDIUM_LINE_COUNT = 90;
const HIGH_BRANCH_COUNT = 20;
const HIGH_STRUCTURAL_SCORE = 32;
const HIGH_LINE_COUNT = 180;

export type SourceLanguage = "python" | "ruby" | "pascal" | "java";

type SourceFile = {
  path: string;
  content: string;
  size?: number;
};

type SkippedCounts = LightLanguageSkipped;

type ClassifiedSource = SourceFile & {
  language: SourceLanguage;
};

type RoutineScore = {
  path: string;
  language: SourceLanguage;
  name: string;
  line: number;
  branchCount: number;
  structuralScore: number;
  lineCount: number;
  severity: "medium" | "high";
};

type SourceLine = {
  text: string;
  line: number;
};

type DuplicateLocation = {
  path: string;
  startIndex: number;
  startLine: number;
  endLine: number;
  lines: SourceLine[];
};

type DuplicateGroup = {
  lineCount: number;
  locations: DuplicateLocation[];
};

const RUBY_BASENAMES = new Set(["capfile", "gemfile", "guardfile", "rakefile"]);
export const LIGHT_LANGUAGE_ANALYSIS_LANGUAGES: SourceLanguage[] = [
  "python",
  "ruby",
  "pascal",
  "java",
];
const LANGUAGE_ORDER = LIGHT_LANGUAGE_ANALYSIS_LANGUAGES;
const LANGUAGE_LABELS: Record<SourceLanguage, string> = {
  java: "Java",
  pascal: "Object Pascal",
  python: "Python",
  ruby: "Ruby",
};

const LOW_SIGNAL_LINES = new Set([
  "begin",
  "do",
  "else",
  "end",
  "end.",
  "end;",
  "{",
  "}",
  "};",
  "pass",
  "then",
]);

export function runLightLanguageAnalysis(context: ReviewContext): Finding[] {
  if (context.focus === "docs") {
    return [];
  }

  const files = context.changedFiles
    .filter((file) => typeof file.content === "string")
    .map((file) => ({
      path: file.filename,
      content: file.content ?? "",
    }));

  const skipped = normalizeSkippedCounts(context.lightLanguageSkipped);
  if (!hasAnalyzableInput(files, skipped)) {
    return [];
  }

  const result = buildLightLanguageToolResult({
    files,
    skipped,
    source: "fixture",
  });
  context.toolResults.push(result);

  return toolIssuesToFindings(result);
}

export function buildLightLanguageToolResult(input: {
  files: SourceFile[];
  skipped?: SkippedCounts;
  source?: "sandbox" | "fixture";
  language?: SourceLanguage;
}): ToolCheckResult {
  const skipped = normalizeSkippedCounts(input.skipped);
  const sources = classifySources(input.files).filter(
    (source) => !input.language || source.language === input.language,
  );
  const issues = analyzeSources(sources);
  const scanLimitIssue = buildScanLimitIssue(skipped, input.language);
  const meta = lightLanguageToolMeta(input.language);

  if (scanLimitIssue) {
    issues.push(scanLimitIssue);
  }

  const status = issues.length > 0 ? "failed" : sources.length > 0 ? "passed" : "skipped";

  return {
    id: meta.id,
    name: meta.name,
    command: meta.command,
    status,
    exitCode: 0,
    summary: summarizeResult(sources, issues, skipped),
    issues,
  };
}

export function lightLanguageToolId(language: SourceLanguage) {
  return `light-language-${language}` as const;
}

export function analyzeLightLanguageFiles(files: SourceFile[]): ToolCheckIssue[] {
  return analyzeSources(classifySources(files));
}

function analyzeSources(sources: ClassifiedSource[]) {
  return LANGUAGE_ORDER.flatMap((language) => {
    const languageSources = sources.filter((source) => source.language === language);
    if (languageSources.length === 0) {
      return [];
    }

    const issues: ToolCheckIssue[] = [];
    const complexity = buildComplexityIssue(language, languageSources);
    const duplication = buildDuplicationIssue(language, languageSources);

    if (complexity) {
      issues.push(complexity);
    }

    if (duplication) {
      issues.push(duplication);
    }

    return issues;
  });
}

function buildComplexityIssue(
  language: SourceLanguage,
  sources: ClassifiedSource[],
): ToolCheckIssue | null {
  const hotspots = sources
    .flatMap(scoreSourceComplexity)
    .filter(isComplexityHotspot)
    .sort(
      (left, right) =>
        right.structuralScore - left.structuralScore ||
        right.branchCount - left.branchCount ||
        right.lineCount - left.lineCount,
    );

  if (hotspots.length === 0) {
    return null;
  }

  const severity = hotspots.some((hotspot) => hotspot.severity === "high")
    ? "high"
    : "medium";
  const files = unique(hotspots.map((hotspot) => hotspot.path));

  return {
    id: `light-language-${language}-complexity`,
    title: `Lightweight ${LANGUAGE_LABELS[language]} analyzer found ${
      hotspots.length
    } structural complexity hotspot${hotspots.length === 1 ? "" : "s"}`,
    severity,
    category: "architecture-drift",
    path: files[0],
    message: `Lightweight language analysis found heuristic structural complexity hotspots in ${LANGUAGE_LABELS[language]} code.`,
    evidence: hotspots
      .slice(0, MAX_COMPLEXITY_EVIDENCE)
      .map(
        (hotspot) =>
          `${hotspot.path}:${hotspot.line} ${hotspot.name} branch count ${hotspot.branchCount}, structural score ${hotspot.structuralScore}, lines ${hotspot.lineCount}`,
      ),
    suggestedFix:
      "Review the highest-scoring routine, then split nested branches or long procedural sections into smaller named helpers.",
  };
}

function buildDuplicationIssue(
  language: SourceLanguage,
  sources: ClassifiedSource[],
): ToolCheckIssue | null {
  const groups = findDuplicateGroups(sources);
  if (groups.length === 0) {
    return null;
  }

  const duplicatedLines = groups.reduce(
    (total, group) => total + group.lineCount * Math.max(0, group.locations.length - 1),
    0,
  );
  const severity = groups.length > 5 || duplicatedLines > 120 ? "high" : "medium";
  const files = unique(
    groups.flatMap((group) => group.locations.map((location) => location.path)),
  );

  return {
    id: `light-language-${language}-duplication`,
    title: `Lightweight ${LANGUAGE_LABELS[language]} analyzer found ${
      groups.length
    } duplicate code block${groups.length === 1 ? "" : "s"}`,
    severity,
    category: "code-drift",
    path: files[0],
    message: `Lightweight language analysis found repeated normalized code blocks in ${LANGUAGE_LABELS[language]} code.`,
    evidence: groups.slice(0, MAX_DUPLICATE_GROUPS).map(formatDuplicateGroup),
    suggestedFix:
      "Compare the duplicate blocks and extract shared helpers or remove stale parallel implementations where the behavior should stay in sync.",
  };
}

function buildScanLimitIssue(
  skipped: Required<SkippedCounts>,
  language?: SourceLanguage,
): ToolCheckIssue | null {
  const materialSkipped = skipped.tooLarge + skipped.totalLimit + skipped.unreadable;
  if (materialSkipped <= 0) {
    return null;
  }

  const languageLabel = language ? LANGUAGE_LABELS[language] : null;
  return {
    id: language ? `light-language-${language}-scan-limit` : "light-language-scan-limit",
    title: languageLabel
      ? `Lightweight ${languageLabel} analysis skipped some source files`
      : "Lightweight language analysis skipped some source files",
    severity: skipped.totalLimit > 0 ? "medium" : "low",
    category: "code-drift",
    message: languageLabel
      ? `Lightweight language analysis did not inspect every matching ${languageLabel} file because collection limits were reached.`
      : "Lightweight language analysis did not inspect every matching Python, Ruby, Object Pascal, or Java file because collection limits were reached.",
    evidence: [
      `Files too large: ${skipped.tooLarge}`,
      `Files skipped by total-size limit: ${skipped.totalLimit}`,
      `Unreadable files: ${skipped.unreadable}`,
    ],
    suggestedFix:
      "Reduce the target source size, then rerun the sandbox scan or inspect the skipped large source files manually.",
  };
}

function lightLanguageToolMeta(language?: SourceLanguage) {
  if (!language) {
    return {
      id: LIGHT_LANGUAGE_TOOL_ID,
      name: "Lightweight language analysis",
      command: LIGHT_LANGUAGE_COMMAND,
    };
  }

  return {
    id: lightLanguageToolId(language),
    name: `${LANGUAGE_LABELS[language]} analysis`,
    command: `${LIGHT_LANGUAGE_COMMAND} --language ${language}`,
  };
}

function scoreSourceComplexity(source: ClassifiedSource): RoutineScore[] {
  if (source.language === "python") {
    return scorePythonRoutines(source);
  }

  if (source.language === "ruby") {
    return scoreRubyRoutines(source);
  }

  if (source.language === "java") {
    return scoreJavaRoutines(source);
  }

  return scorePascalRoutines(source);
}

function scorePythonRoutines(source: ClassifiedSource): RoutineScore[] {
  const lines = source.content.split(/\r?\n/);
  const routines: RoutineScore[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);
    if (!match) {
      continue;
    }

    const routineIndent = indentationWidth(match[1]);
    const routineLine = firstDecoratorLine(lines, index, routineIndent) ?? index + 1;
    let endIndex = lines.length;

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const clean = stripPythonRubyLine(lines[cursor]).trim();
      if (!clean) {
        continue;
      }

      if (indentationWidth(lines[cursor]) <= routineIndent) {
        endIndex = cursor;
        break;
      }
    }

    routines.push(
      scoreRoutine({
        path: source.path,
        language: "python",
        name: match[2],
        line: routineLine,
        bodyLines: lines.slice(index + 1, endIndex),
        baseIndent: routineIndent + 1,
      }),
    );
  }

  return routines;
}

function scoreRubyRoutines(source: ClassifiedSource): RoutineScore[] {
  const lines = source.content.split(/\r?\n/);
  const routines: RoutineScore[] = [];
  let inBlockComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    const cleanLine = stripRubyLine(lines[index], {
      inBlockComment,
      updateState: (value) => {
        inBlockComment = value;
      },
    });
    const match = cleanLine.match(
      /^\s*def\s+((?:self\.)?[A-Za-z_]\w*[!?=]?|[A-Za-z_]\w*(?:\.[A-Za-z_]\w*[!?=]?)?)\b/,
    );
    if (!match) {
      continue;
    }

    let depth = 1;
    let endIndex = lines.length;
    let bodyBlockComment = inBlockComment;

    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const bodyClean = stripRubyLine(lines[cursor], {
        inBlockComment: bodyBlockComment,
        updateState: (value) => {
          bodyBlockComment = value;
        },
      }).trim();
      if (!bodyClean) {
        continue;
      }

      if (/^end\b/.test(bodyClean)) {
        depth -= 1;
        if (depth === 0) {
          endIndex = cursor;
          break;
        }
      }

      depth += rubyOpenerCount(bodyClean);
    }

    routines.push(
      scoreRoutine({
        path: source.path,
        language: "ruby",
        name: match[1],
        line: index + 1,
        bodyLines: lines.slice(index + 1, endIndex),
      }),
    );
  }

  return routines;
}

function scorePascalRoutines(source: ClassifiedSource): RoutineScore[] {
  const rawLines = source.content.split(/\r?\n/);
  const lines = stripPascalComments(rawLines);
  const routines: RoutineScore[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(
      /\b(?:class\s+)?(?:procedure|function|constructor|destructor)\s+([A-Za-z_][\w.]*)/i,
    );
    if (!match) {
      continue;
    }

    let beginIndex = -1;
    for (let cursor = index; cursor < lines.length; cursor += 1) {
      if (
        cursor > index &&
        /\b(?:class\s+)?(?:procedure|function|constructor|destructor)\s+[A-Za-z_][\w.]*/i.test(
          lines[cursor],
        )
      ) {
        break;
      }

      if (/\bbegin\b/i.test(lines[cursor])) {
        beginIndex = cursor;
        break;
      }
    }

    if (beginIndex < 0) {
      continue;
    }

    let depth = 0;
    let endIndex = lines.length;
    for (let cursor = beginIndex; cursor < lines.length; cursor += 1) {
      depth += pascalBeginCount(lines[cursor]);
      depth -= pascalEndCount(lines[cursor]);

      if (cursor > beginIndex && depth <= 0) {
        endIndex = cursor + 1;
        break;
      }
    }

    routines.push(
      scoreRoutine({
        path: source.path,
        language: "pascal",
        name: match[1],
        line: index + 1,
        bodyLines: lines.slice(beginIndex, endIndex),
      }),
    );
  }

  return routines;
}

function scoreJavaRoutines(source: ClassifiedSource): RoutineScore[] {
  const rawLines = source.content.split(/\r?\n/);
  const lines = stripJavaComments(rawLines);
  const routines: RoutineScore[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const clean = lines[index].trim();
    const match = clean.match(
      /^(?:(?:public|private|protected|static|final|synchronized|abstract|native|strictfp|default)\s+)*(?:<[^>]+>\s*)?(?:(?:[A-Za-z_$][\w.$<>,?]*(?:\[\])*\s+)+)?([A-Za-z_$][\w$]*)\s*\([^;{}]*\)\s*(?:throws\s+[^{]+)?\{/,
    );
    if (!match || isJavaControlKeyword(match[1])) {
      continue;
    }

    let depth = javaBraceDelta(clean);
    let endIndex = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      depth += javaBraceDelta(lines[cursor]);
      if (depth <= 0) {
        endIndex = cursor;
        break;
      }
    }

    routines.push(
      scoreRoutine({
        path: source.path,
        language: "java",
        name: match[1],
        line: index + 1,
        bodyLines: lines.slice(index + 1, endIndex),
      }),
    );
  }

  return routines;
}

function scoreRoutine(input: {
  path: string;
  language: SourceLanguage;
  name: string;
  line: number;
  bodyLines: string[];
  baseIndent?: number;
}): RoutineScore {
  let branchCount = 1;
  let structuralScore = 1;
  let lineCount = 0;
  let blockDepth = 0;

  for (const rawLine of input.bodyLines) {
    const clean = cleanLineForComplexity(rawLine, input.language).trim();
    if (!clean || LOW_SIGNAL_LINES.has(clean.toLowerCase())) {
      continue;
    }

    lineCount += 1;
    const branchHits = countBranches(clean, input.language);
    const nesting =
      input.language === "python"
        ? pythonNestingDepth(rawLine, input.baseIndent ?? 0)
        : Math.max(0, blockDepth);

    if (branchHits > 0) {
      branchCount += branchHits;
      structuralScore += branchHits + nesting;
    }

    if (input.language === "ruby") {
      if (/^end\b/.test(clean)) {
        blockDepth = Math.max(0, blockDepth - 1);
      }
      blockDepth += rubyOpenerCount(clean);
    } else if (input.language === "java") {
      blockDepth = Math.max(0, blockDepth + javaBraceDelta(clean));
    } else if (input.language === "pascal") {
      blockDepth += pascalBeginCount(clean);
      blockDepth = Math.max(0, blockDepth - pascalEndCount(clean));
    }
  }

  const severity =
    branchCount >= HIGH_BRANCH_COUNT ||
    structuralScore >= HIGH_STRUCTURAL_SCORE ||
    lineCount >= HIGH_LINE_COUNT
      ? "high"
      : "medium";

  return {
    path: input.path,
    language: input.language,
    name: input.name,
    line: input.line,
    branchCount,
    structuralScore,
    lineCount,
    severity,
  };
}

function isComplexityHotspot(score: RoutineScore) {
  return (
    score.branchCount >= MEDIUM_BRANCH_COUNT ||
    score.structuralScore >= MEDIUM_STRUCTURAL_SCORE ||
    score.lineCount >= MEDIUM_LINE_COUNT
  );
}

function findDuplicateGroups(sources: ClassifiedSource[]) {
  const windowsByHash = new Map<string, DuplicateLocation[]>();
  const linesByPath = new Map<string, SourceLine[]>();

  for (const source of sources) {
    const lines = normalizeSourceLines(source);
    linesByPath.set(source.path, lines);

    for (let index = 0; index <= lines.length - MIN_DUPLICATE_LINES; index += 1) {
      const window = lines.slice(index, index + MIN_DUPLICATE_LINES);
      const text = window.map((line) => line.text).join("\n");
      if (text.length < MIN_DUPLICATE_CHARS) {
        continue;
      }

      const key = hashText(text);
      if (!windowsByHash.has(key)) {
        windowsByHash.set(key, []);
      }
      windowsByHash.get(key)?.push({
        path: source.path,
        startIndex: index,
        startLine: window[0].line,
        endLine: window.at(-1)?.line ?? window[0].line,
        lines,
      });
    }
  }

  const candidates = [...windowsByHash.values()]
    .map(nonOverlappingLocations)
    .filter((locations) => locations.length >= 2)
    .map((locations) => extendDuplicateGroup(locations, linesByPath))
    .sort((left, right) => right.lineCount - left.lineCount);

  const accepted: DuplicateGroup[] = [];
  for (const candidate of candidates) {
    if (accepted.some((group) => groupsOverlap(group, candidate))) {
      continue;
    }
    accepted.push(candidate);
  }

  return accepted;
}

function normalizeSourceLines(source: ClassifiedSource): SourceLine[] {
  const rawLines = source.content.split(/\r?\n/);
  const lines =
    source.language === "pascal"
      ? stripPascalComments(rawLines)
      : source.language === "java"
        ? stripJavaComments(rawLines)
        : rawLines.slice();
  const normalized: SourceLine[] = [];
  let rubyBlockComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    let text =
      source.language === "ruby"
        ? stripRubyLine(lines[index], {
            inBlockComment: rubyBlockComment,
            updateState: (value) => {
              rubyBlockComment = value;
            },
          })
        : source.language === "python"
          ? stripPythonRubyLine(lines[index])
          : source.language === "java"
            ? lines[index].replace(/\/\/.*$/, "")
            : lines[index].replace(/\/\/.*$/, "");

    text = replaceStringLiterals(text, source.language).replace(/\s+/g, " ").trim();

    if (source.language === "pascal" || source.language === "java") {
      text = text.toLowerCase();
    }

    if (!text || LOW_SIGNAL_LINES.has(text.toLowerCase())) {
      continue;
    }

    normalized.push({
      text,
      line: index + 1,
    });
  }

  return normalized;
}

function nonOverlappingLocations(locations: DuplicateLocation[]) {
  const accepted: DuplicateLocation[] = [];

  for (const location of locations.sort(compareLocations)) {
    if (
      accepted.some(
        (existing) =>
          existing.path === location.path &&
          rangesOverlap(
            existing.startIndex,
            existing.startIndex + MIN_DUPLICATE_LINES - 1,
            location.startIndex,
            location.startIndex + MIN_DUPLICATE_LINES - 1,
          ),
      )
    ) {
      continue;
    }

    accepted.push(location);
  }

  return accepted;
}

function extendDuplicateGroup(
  locations: DuplicateLocation[],
  linesByPath: Map<string, SourceLine[]>,
): DuplicateGroup {
  let lineCount = MIN_DUPLICATE_LINES;

  while (
    locations.every((location) => {
      const lines = linesByPath.get(location.path) ?? [];
      return location.startIndex + lineCount < lines.length;
    })
  ) {
    const nextLines = locations.map((location) => {
      const lines = linesByPath.get(location.path) ?? [];
      return lines[location.startIndex + lineCount]?.text;
    });
    if (new Set(nextLines).size !== 1) {
      break;
    }
    lineCount += 1;
  }

  return {
    lineCount,
    locations: locations.map((location) => {
      const lines = linesByPath.get(location.path) ?? [];
      return {
        ...location,
        endLine: lines[location.startIndex + lineCount - 1]?.line ?? location.endLine,
      };
    }),
  };
}

function groupsOverlap(left: DuplicateGroup, right: DuplicateGroup) {
  return left.locations.some((leftLocation) =>
    right.locations.some(
      (rightLocation) =>
        leftLocation.path === rightLocation.path &&
        rangesOverlap(
          leftLocation.startIndex,
          leftLocation.startIndex + left.lineCount - 1,
          rightLocation.startIndex,
          rightLocation.startIndex + right.lineCount - 1,
        ),
    ),
  );
}

function formatDuplicateGroup(group: DuplicateGroup) {
  const locations = group.locations
    .slice(0, MAX_DUPLICATE_LOCATIONS)
    .map((location) => `${location.path}:${location.startLine}-${location.endLine}`)
    .join(", ");

  return `Duplicate group: ${group.lineCount} normalized lines in ${locations}`;
}

function classifySources(files: SourceFile[]): ClassifiedSource[] {
  return files
    .map((file) => ({
      ...file,
      path: normalizePath(file.path),
    }))
    .filter((file) => !isIgnoredPath(file.path))
    .map((file) => {
      const language = classifySource(file);
      return language ? { ...file, language } : null;
    })
    .filter((file): file is ClassifiedSource => Boolean(file));
}

function classifySource(file: SourceFile): SourceLanguage | null {
  const path = normalizePath(file.path);
  const lowerPath = path.toLowerCase();
  const basename = lowerPath.split("/").at(-1) ?? lowerPath;

  if (/\.(py|pyi|pyw)$/.test(lowerPath)) {
    return "python";
  }

  if (/\.java$/.test(lowerPath)) {
    return "java";
  }

  if (/\.(rb|rake|gemspec)$/.test(lowerPath) || RUBY_BASENAMES.has(basename)) {
    return "ruby";
  }

  if (/\.(pas|pp|lpr|dpr|dpk)$/.test(lowerPath)) {
    return "pascal";
  }

  if (/\.inc$/.test(lowerPath) && looksLikePascal(file.content)) {
    return "pascal";
  }

  return null;
}

function looksLikePascal(content: string) {
  return /\b(unit|interface|implementation|procedure|function|begin)\b|end\.|\{\$/i.test(
    content,
  );
}

function hasAnalyzableInput(files: SourceFile[], skipped: Required<SkippedCounts>) {
  return classifySources(files).length > 0 || skippedTotal(skipped) > 0;
}

function summarizeResult(
  sources: ClassifiedSource[],
  issues: ToolCheckIssue[],
  skipped: Required<SkippedCounts>,
) {
  if (sources.length === 0 && skippedTotal(skipped) === 0) {
    return "No supported Python, Ruby, Object Pascal, or Java files were found.";
  }

  if (sources.length === 0) {
    return `No supported Python, Ruby, Object Pascal, or Java files were analyzed; source collection skipped ${skippedTotal(
      skipped,
    )} file${skippedTotal(skipped) === 1 ? "" : "s"}.`;
  }

  const complexity = issues.some((issue) => issue.id.endsWith("-complexity"));
  const duplication = issues.some((issue) => issue.id.endsWith("-duplication"));
  const limit = issues.some((issue) => issue.id === "light-language-scan-limit");
  const languageSummary = summarizeLanguages(sources);
  const parts = [
    complexity ? "structural complexity hotspots" : "",
    duplication ? "duplicate code blocks" : "",
    limit ? "scan-limit coverage gaps" : "",
  ].filter(Boolean);

  return parts.length
    ? `Lightweight language analysis inspected ${languageSummary} and reported ${parts.join(
        ", ",
      )}.`
    : `Lightweight language analysis inspected ${languageSummary} without structural complexity or duplicate-block findings.`;
}

function cleanLineForComplexity(line: string, language: SourceLanguage) {
  if (language === "pascal" || language === "java") {
    return replaceStringLiterals(line.replace(/\/\/.*$/, ""), language);
  }
  return replaceStringLiterals(stripPythonRubyLine(line), language);
}

function countBranches(line: string, language: SourceLanguage) {
  const lower = line.toLowerCase();
  if (language === "python") {
    return (
      countWordMatches(lower, ["if", "elif", "for", "while", "except", "case"]) +
      countWordMatches(lower, ["and", "or"])
    );
  }

  if (language === "ruby") {
    return (
      countWordMatches(lower, [
        "if",
        "elsif",
        "unless",
        "case",
        "when",
        "for",
        "while",
        "until",
        "rescue",
      ]) + countSymbolMatches(lower, ["&&", "||"])
    );
  }

  if (language === "java") {
    return (
      countWordMatches(lower, [
        "if",
        "else",
        "for",
        "while",
        "catch",
        "case",
        "switch",
        "try",
      ]) + countSymbolMatches(lower, ["&&", "||", "?"])
    );
  }

  return countWordMatches(lower, [
    "if",
    "case",
    "for",
    "while",
    "repeat",
    "except",
    "and",
    "or",
  ]);
}

function rubyOpenerCount(line: string) {
  const lower = line.toLowerCase();
  return (
    countWordMatches(lower, [
      "begin",
      "case",
      "class",
      "def",
      "for",
      "if",
      "module",
      "unless",
      "until",
      "while",
    ]) + countWordMatches(lower, ["do"])
  );
}

function pascalBeginCount(line: string) {
  return countWordMatches(line.toLowerCase(), ["begin", "repeat", "case"]);
}

function pascalEndCount(line: string) {
  return countWordMatches(line.toLowerCase(), ["end", "until"]);
}

function javaBraceDelta(line: string) {
  return countSymbolMatches(line, ["{"]) - countSymbolMatches(line, ["}"]);
}

function isJavaControlKeyword(value: string) {
  return new Set([
    "catch",
    "do",
    "else",
    "for",
    "if",
    "new",
    "switch",
    "synchronized",
    "try",
    "while",
  ]).has(value);
}

function countWordMatches(value: string, words: string[]) {
  return words.reduce((total, word) => {
    const matches = value.match(new RegExp(`\\b${escapeRegExp(word)}\\b`, "g"));
    return total + (matches?.length ?? 0);
  }, 0);
}

function countSymbolMatches(value: string, symbols: string[]) {
  return symbols.reduce((total, symbol) => {
    const matches = value.match(new RegExp(escapeRegExp(symbol), "g"));
    return total + (matches?.length ?? 0);
  }, 0);
}

function stripPythonRubyLine(line: string) {
  return line.replace(/#.*$/, "");
}

function stripRubyLine(
  line: string,
  state: { inBlockComment: boolean; updateState: (value: boolean) => void },
) {
  const trimmed = line.trim();
  if (state.inBlockComment) {
    if (/^=end\b/.test(trimmed)) {
      state.updateState(false);
    }
    return "";
  }

  if (/^=begin\b/.test(trimmed)) {
    state.updateState(true);
    return "";
  }

  return stripPythonRubyLine(line);
}

function stripPascalComments(lines: string[]) {
  const stripped: string[] = [];
  let braceComment = false;
  let parenComment = false;

  for (const line of lines) {
    let output = "";
    for (let index = 0; index < line.length; index += 1) {
      const current = line[index];
      const next = line[index + 1];

      if (braceComment) {
        if (current === "}") {
          braceComment = false;
        }
        continue;
      }

      if (parenComment) {
        if (current === "*" && next === ")") {
          parenComment = false;
          index += 1;
        }
        continue;
      }

      if (current === "/" && next === "/") {
        break;
      }

      if (current === "{") {
        braceComment = true;
        continue;
      }

      if (current === "(" && next === "*") {
        parenComment = true;
        index += 1;
        continue;
      }

      output += current;
    }
    stripped.push(output);
  }

  return stripped;
}

function stripJavaComments(lines: string[]) {
  const stripped: string[] = [];
  let blockComment = false;

  for (const line of lines) {
    let output = "";
    for (let index = 0; index < line.length; index += 1) {
      const current = line[index];
      const next = line[index + 1];

      if (blockComment) {
        if (current === "*" && next === "/") {
          blockComment = false;
          index += 1;
        }
        continue;
      }

      if (current === "/" && next === "*") {
        blockComment = true;
        index += 1;
        continue;
      }

      if (current === "/" && next === "/") {
        break;
      }

      output += current;
    }
    stripped.push(output);
  }

  return stripped;
}

function replaceStringLiterals(value: string, language: SourceLanguage) {
  if (language === "pascal") {
    return value.replace(/'(?:''|[^'])*'/g, "<string>");
  }

  return value.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, "<string>");
}

function firstDecoratorLine(lines: string[], defIndex: number, routineIndent: number) {
  let cursor = defIndex - 1;
  let firstLine: number | null = null;

  while (cursor >= 0) {
    const line = lines[cursor];
    if (
      indentationWidth(line) !== routineIndent ||
      !stripPythonRubyLine(line).trim().startsWith("@")
    ) {
      break;
    }

    firstLine = cursor + 1;
    cursor -= 1;
  }

  return firstLine;
}

function pythonNestingDepth(line: string, baseIndent: number) {
  return Math.max(0, Math.floor((indentationWidth(line) - baseIndent) / 4));
}

function indentationWidth(line: string) {
  const indentation = line.match(/^\s*/)?.[0] ?? "";
  return indentation.replace(/\t/g, "    ").length;
}

function isIgnoredPath(filePath: string) {
  const path = normalizePath(filePath).toLowerCase();
  return (
    path.startsWith(".git/") ||
    path.startsWith(".next/") ||
    path.startsWith(".turbo/") ||
    path.startsWith("coverage/") ||
    path.startsWith("dist/") ||
    path.startsWith("node_modules/") ||
    path.startsWith("out/") ||
    path.startsWith(".venv/") ||
    path.startsWith("venv/") ||
    path.includes("/__pycache__/") ||
    path.startsWith("__pycache__/") ||
    path.startsWith(".bundle/") ||
    path.startsWith("vendor/bundle/") ||
    path.includes("/site-packages/") ||
    path.startsWith("site-packages/") ||
    path.startsWith("build/") ||
    path.startsWith("target/")
  );
}

function normalizePath(filePath: string) {
  return filePath
    .trim()
    .replace(/^(\.\.\/)+/, "")
    .replace(/^\.\/+/, "")
    .replace(/\\/g, "/");
}

function normalizeSkippedCounts(skipped: SkippedCounts | undefined) {
  return {
    tooLarge: skipped?.tooLarge ?? 0,
    unsupported: skipped?.unsupported ?? 0,
    totalLimit: skipped?.totalLimit ?? 0,
    unreadable: skipped?.unreadable ?? 0,
  };
}

function summarizeLanguages(sources: ClassifiedSource[]) {
  return LANGUAGE_ORDER.map((language) => {
    const count = sources.filter((source) => source.language === language).length;
    if (count === 0) {
      return "";
    }
    return `${count} ${LANGUAGE_LABELS[language]} file${count === 1 ? "" : "s"}`;
  })
    .filter(Boolean)
    .join(", ");
}

function skippedTotal(skipped: Required<SkippedCounts>) {
  return skipped.tooLarge + skipped.unsupported + skipped.totalLimit + skipped.unreadable;
}

function rangesOverlap(
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
) {
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

function compareLocations(left: DuplicateLocation, right: DuplicateLocation) {
  return left.path.localeCompare(right.path) || left.startIndex - right.startIndex;
}

function unique(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function hashText(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
