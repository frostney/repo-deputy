import type { IconName } from "./icons";

export type Severity = "critical" | "high" | "medium" | "low";

export type Finding = {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  path: string;
  description: string;
  impact: string;
  effort: string;
};

export const FINDINGS: Finding[] = [
  {
    id: "f1",
    severity: "critical",
    category: "Drift",
    title: "New feature module imports from `internal/server` boundary",
    path: "packages/next/src/client/components/router-reducer.ts",
    description:
      "The `routerReducer` reaches into private server-only utilities, breaking the established client/server layering.",
    impact: "high",
    effort: "medium",
  },
  {
    id: "f2",
    severity: "high",
    category: "Duplication",
    title: "Three near-identical retry helpers across packages",
    path: "packages/next · packages/next-server · packages/swc · 3 files",
    description:
      "`withRetry`, `retryFetch`, and `fetchWithRetry` have 92% AST similarity. Consolidate into a single utility.",
    impact: "high",
    effort: "low",
  },
  {
    id: "f3",
    severity: "high",
    category: "Cycles",
    title: "Circular import between `telemetry` and `log`",
    path: "packages/next/src/telemetry/index.ts ↔ packages/next/src/lib/log.ts",
    description:
      "Tightly coupled mutual imports prevent tree-shaking and complicate testing in isolation.",
    impact: "medium",
    effort: "low",
  },
  {
    id: "f4",
    severity: "medium",
    category: "Complexity",
    title: "`buildManifest()` exceeds cognitive complexity threshold",
    path: "packages/next/src/build/manifest.ts:142",
    description:
      "Cognitive complexity 38 (threshold 15). `buildManifest()` has 6 nested branches and three early-return ladders.",
    impact: "medium",
    effort: "high",
  },
  {
    id: "f5",
    severity: "medium",
    category: "Docs",
    title: "README still references deprecated `next export` command",
    path: "README.md · docs/api-reference/cli.md",
    description:
      "Four mentions of `next export`, removed in 14.x. Replace with the static export configuration in `next.config.js`.",
    impact: "low",
    effort: "low",
  },
  {
    id: "f6",
    severity: "low",
    category: "Duplication",
    title: "Two parallel implementations of slug parsing",
    path: "packages/next/src/shared/lib/router/utils/parse-relative-url.ts",
    description:
      "`parseSlug()` and `toSlug()` differ only in unicode handling. Choose one canonical implementation.",
    impact: "low",
    effort: "low",
  },
  {
    id: "f7",
    severity: "low",
    category: "Docs",
    title: "Missing JSDoc on 14 public exports in `/server`",
    path: "packages/next/src/server/index.ts",
    description:
      "Public API surface should be fully documented per the project's contributor guidelines.",
    impact: "low",
    effort: "medium",
  },
];

export type CategoryRow = {
  key: string;
  icon: IconName;
  score: number;
  issues: number;
  tone: "good" | "warn" | "bad";
};

export const CATEGORIES: CategoryRow[] = [
  { key: "Duplication", icon: "duplicate", score: 72, issues: 14, tone: "warn" },
  { key: "Drift", icon: "drift", score: 64, issues: 8, tone: "warn" },
  { key: "Cycles", icon: "circular", score: 81, issues: 3, tone: "warn" },
  { key: "Complexity", icon: "complexity", score: 76, issues: 19, tone: "warn" },
  { key: "Docs", icon: "docs", score: 88, issues: 6, tone: "good" },
];

export type FixOption = {
  id: string;
  title: string;
  category: string;
  severity: Severity;
  files: number;
  lines: string;
  impact: string;
};

export const FIX_OPTIONS: FixOption[] = [
  {
    id: "f1",
    title: "Replace `internal/server` import with public type contract",
    category: "Drift",
    severity: "critical",
    files: 1,
    lines: "+4 −2",
    impact: "Resolves 3 boundary violations",
  },
  {
    id: "f2",
    title: "Consolidate retry helpers into `@next/utils/retry`",
    category: "Duplication",
    severity: "high",
    files: 4,
    lines: "+38 −146",
    impact: "−108 LOC · resolves 8 warnings",
  },
  {
    id: "f3",
    title: "Break circular dep: `telemetry` ↔ `log`",
    category: "Cycles",
    severity: "high",
    files: 2,
    lines: "+12 −7",
    impact: "Enables tree-shaking",
  },
  {
    id: "f4",
    title: "Refactor `buildManifest()` into 3 helpers",
    category: "Complexity",
    severity: "medium",
    files: 1,
    lines: "+62 −58",
    impact: "Cognitive 38 → 11",
  },
  {
    id: "f5",
    title: "Update README to remove `next export` references",
    category: "Docs",
    severity: "medium",
    files: 2,
    lines: "+8 −12",
    impact: "Doc accuracy +6%",
  },
  {
    id: "f6",
    title: "Unify slug parsing into `parseSlug()` canonical impl",
    category: "Duplication",
    severity: "low",
    files: 1,
    lines: "+4 −22",
    impact: "Removes parallel impl",
  },
  {
    id: "f7",
    title: "Add JSDoc to 14 public exports in `/server`",
    category: "Docs",
    severity: "low",
    files: 1,
    lines: "+58 −0",
    impact: "Public API coverage 86% → 100%",
  },
];

export type ScanCheck = {
  id: string;
  name: string;
  meta: string;
  duration: number;
};

export const SCAN_CHECKS: ScanCheck[] = [
  {
    id: "clone",
    name: "Cloning repository",
    meta: "git fetch --depth=1",
    duration: 1200,
  },
  {
    id: "index",
    name: "Indexing source files",
    meta: "tree-sitter parse · 4,128 files",
    duration: 1600,
  },
  {
    id: "dup",
    name: "Detecting duplication",
    meta: "AST fingerprints · 318 modules",
    duration: 1900,
  },
  {
    id: "drift",
    name: "Checking architectural drift",
    meta: "boundary rules · 12 layers",
    duration: 1800,
  },
  {
    id: "cycles",
    name: "Hunting circular dependencies",
    meta: "tarjan SCC · graph depth 14",
    duration: 1500,
  },
  {
    id: "complex",
    name: "Measuring complexity",
    meta: "cyclomatic + cognitive · 2,914 fns",
    duration: 1700,
  },
  {
    id: "docs",
    name: "Comparing docs to code",
    meta: "README · CHANGELOG · 187 docstrings",
    duration: 1900,
  },
];

export type LogTag = "ok" | "info" | "warn" | "err";
export type LogLine = { t: LogTag; text: string };

export const LOG_LINES: LogLine[] = [
  { t: "ok", text: "→ Cloned vercel/next.js @ canary-9f4e21" },
  { t: "info", text: "  Indexed 4,128 files (TypeScript, JavaScript, MDX)" },
  { t: "info", text: "  AST fingerprint cache · cold start" },
  {
    t: "warn",
    text: "  Found 14 likely-duplicate blocks across `packages/next/src/server/router`",
  },
  {
    t: "info",
    text: "  Boundary check: `app` may not import from `pages-internal`",
  },
  { t: "err", text: "  Drift: 3 violations of layered architecture detected" },
  {
    t: "info",
    text: "  Tarjan strongly-connected components computed in 142ms",
  },
  { t: "warn", text: "  Cycle: `utils/log` → `telemetry/index` → `utils/log`" },
  { t: "info", text: "  Cyclomatic median 4 · 95th-pct 23" },
  {
    t: "warn",
    text: "  README references deprecated `next export` API in 4 places",
  },
  { t: "ok", text: "  Comparing API surface against `docs.nextjs.org` snapshot" },
  { t: "ok", text: "✓ Audit complete · grading…" },
];
