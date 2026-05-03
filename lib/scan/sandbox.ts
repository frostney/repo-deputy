import { Sandbox } from "@vercel/sandbox";
import { buildFallbackReport, generateDeputyReport } from "@/lib/review/generate-report";
import {
  buildLightLanguageToolResult,
  LIGHT_LANGUAGE_ANALYSIS_LANGUAGES,
  lightLanguageToolId,
  type SourceLanguage,
} from "@/lib/review/light-language";
import { buildFallowToolResult, FALLOW_COMMAND } from "@/lib/review/fallow";
import {
  buildMarkdownLinkCheckToolResult,
  buildMarkdownlintToolResult,
  MARKDOWN_LINK_CHECK_COMMAND,
  MARKDOWNLINT_COMMAND,
} from "@/lib/review/markdown-tools";
import type {
  FindingSourceExcerpt,
  Finding,
  RepoLineStats,
  RepoScanInput,
  RepoScanResult,
  ReviewContext,
  SandboxScanMetadata,
  ToolCheckResult,
} from "@/lib/review/types";
import { toolIssuesToFindings } from "@/lib/review/tool-results";

type SandboxCommandOutput = {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs?: number;
};

type RepoLocator = {
  repo: string;
  repoName: string;
  repoUrl: string;
};

export const SANDBOX_SCAN_TOOL_IDS = [
  "fallow",
  "light-language-python",
  "light-language-ruby",
  "light-language-pascal",
  "light-language-java",
  "markdownlint",
  "markdown-link-check",
] as const;

export type SandboxScanToolId = (typeof SANDBOX_SCAN_TOOL_IDS)[number];

export type SandboxScanSession = {
  repo: string;
  repoName?: string;
  focus: RepoScanInput["focus"];
  revision?: string;
  scannedFiles?: number;
  lineStats?: RepoLineStats;
  languageFiles?: Partial<Record<SourceLanguage, number>>;
  sandbox?: SandboxScanMetadata;
};

export type SandboxScanSessionResult = {
  session: SandboxScanSession;
  toolResults: ToolCheckResult[];
  tools: SandboxScanToolId[];
  ready: boolean;
};

const CLONE_DEPTH = 1;
const SANDBOX_TIMEOUT_MS = 10 * 60 * 1000;
const SANDBOX_REPO_DIR = "/vercel/sandbox/repo";
const MAX_SANDBOX_LANGUAGE_FILES = 2_000;
const MAX_SANDBOX_LANGUAGE_FILE_BYTES = 500_000;
const MAX_SANDBOX_LANGUAGE_TOTAL_BYTES = 25_000_000;
const LIGHT_LANGUAGE_LABELS: Record<SourceLanguage, string> = {
  java: "Java",
  pascal: "Object Pascal",
  python: "Python",
  ruby: "Ruby",
};

const INSTALL_BUN_COMMAND = [
  "if command -v bun >/dev/null 2>&1; then bun --version; exit 0; fi",
  'if [ -x "$HOME/.bun/bin/bun" ]; then "$HOME/.bun/bin/bun" --version; exit 0; fi',
  "node -e \"fetch('https://bun.sh/install').then(async r => { if (!r.ok) throw new Error('download failed: ' + r.status); require('fs').writeFileSync('/tmp/repo-deputy-install-bun.sh', await r.text()); })\"",
  "bash /tmp/repo-deputy-install-bun.sh >/tmp/repo-deputy-install-bun.log 2>&1",
  '"$HOME/.bun/bin/bun" --version',
].join(" && ");

const SANDBOX_LANGUAGE_SOURCE_COMMAND = `cat > /tmp/repo-deputy-language-source.ts <<'REPO_DEPUTY_LANGUAGE_SOURCE'
import { readFile, stat } from "node:fs/promises";

const MAX_FILES = ${MAX_SANDBOX_LANGUAGE_FILES};
const MAX_FILE_BYTES = ${MAX_SANDBOX_LANGUAGE_FILE_BYTES};
const MAX_TOTAL_BYTES = ${MAX_SANDBOX_LANGUAGE_TOTAL_BYTES};
const TARGET_LANGUAGE = "__TARGET_LANGUAGE__";
const RUBY_BASENAMES = new Set(["capfile", "gemfile", "guardfile", "rakefile"]);

const git = Bun.spawnSync({
  cmd: ["git", "ls-files", "-z"],
  stdout: "pipe",
  stderr: "pipe",
});

if (git.exitCode !== 0) {
  throw new Error(new TextDecoder().decode(git.stderr).trim() || "git ls-files failed");
}

const paths = new TextDecoder().decode(git.stdout).split("\\0").filter(Boolean);
const files: Array<{ path: string; content: string; size: number }> = [];
const skipped = {
  tooLarge: 0,
  unsupported: 0,
  totalLimit: 0,
  unreadable: 0,
};
let totalBytes = 0;

for (const filePath of paths) {
  const normalizedPath = filePath.replaceAll("\\\\", "/");
  if (isIgnoredPath(normalizedPath) || !isCandidatePath(normalizedPath)) {
    continue;
  }

  let fileStat: { size: number };
  try {
    fileStat = await stat(normalizedPath);
  } catch {
    skipped.unreadable += 1;
    continue;
  }

  if (fileStat.size > MAX_FILE_BYTES) {
    skipped.tooLarge += 1;
    continue;
  }

  if (files.length >= MAX_FILES || totalBytes + fileStat.size > MAX_TOTAL_BYTES) {
    skipped.totalLimit += 1;
    continue;
  }

  let content: string;
  try {
    content = await readFile(normalizedPath, "utf8");
  } catch {
    skipped.unreadable += 1;
    continue;
  }

  if (normalizedPath.toLowerCase().endsWith(".inc") && !looksLikePascal(content)) {
    skipped.unsupported += 1;
    continue;
  }

  files.push({ path: normalizedPath, content, size: fileStat.size });
  totalBytes += fileStat.size;
}

console.log(JSON.stringify({ files, skipped }));

function isCandidatePath(filePath: string) {
  const lowerPath = filePath.toLowerCase();
  const basename = lowerPath.split("/").at(-1) ?? lowerPath;
  if (TARGET_LANGUAGE === "python") {
    return /\\.(py|pyi|pyw)$/.test(lowerPath);
  }
  if (TARGET_LANGUAGE === "ruby") {
    return /\\.(rb|rake|gemspec)$/.test(lowerPath) || RUBY_BASENAMES.has(basename);
  }
  if (TARGET_LANGUAGE === "pascal") {
    return /\\.(pas|pp|lpr|dpr|dpk|inc)$/.test(lowerPath);
  }
  return /\\.java$/.test(lowerPath);
}

function isIgnoredPath(filePath: string) {
  const lowerPath = filePath.toLowerCase();
  return (
    lowerPath.startsWith(".git/") ||
    lowerPath.startsWith(".next/") ||
    lowerPath.startsWith(".turbo/") ||
    lowerPath.startsWith("coverage/") ||
    lowerPath.startsWith("dist/") ||
    lowerPath.startsWith("node_modules/") ||
    lowerPath.startsWith("out/") ||
    lowerPath.startsWith(".venv/") ||
    lowerPath.startsWith("venv/") ||
    lowerPath.includes("/__pycache__/") ||
    lowerPath.startsWith("__pycache__/") ||
    lowerPath.startsWith(".bundle/") ||
    lowerPath.startsWith("vendor/bundle/") ||
    lowerPath.includes("/site-packages/") ||
    lowerPath.startsWith("site-packages/") ||
    lowerPath.startsWith("build/") ||
    lowerPath.startsWith("target/")
  );
}

function looksLikePascal(content: string) {
  return /\\b(unit|interface|implementation|procedure|function|begin)\\b|end\\.|\\{\\$/i.test(
    content,
  );
}
REPO_DEPUTY_LANGUAGE_SOURCE
timeout 120s bun --silent /tmp/repo-deputy-language-source.ts`;

const SANDBOX_LANGUAGE_MANIFEST_COMMAND = `cat > /tmp/repo-deputy-language-manifest.ts <<'REPO_DEPUTY_LANGUAGE_MANIFEST'
import { open } from "node:fs/promises";

const RUBY_BASENAMES = new Set(["capfile", "gemfile", "guardfile", "rakefile"]);
const counts: Record<"python" | "ruby" | "pascal" | "java", number> = {
  java: 0,
  pascal: 0,
  python: 0,
  ruby: 0,
};

const git = Bun.spawnSync({
  cmd: ["git", "ls-files", "-z"],
  stdout: "pipe",
  stderr: "pipe",
});

if (git.exitCode !== 0) {
  throw new Error(new TextDecoder().decode(git.stderr).trim() || "git ls-files failed");
}

const paths = new TextDecoder().decode(git.stdout).split("\\0").filter(Boolean);

for (const filePath of paths) {
  const normalizedPath = filePath.replaceAll("\\\\", "/");
  if (isIgnoredPath(normalizedPath)) {
    continue;
  }

  const language = classifyPath(normalizedPath);
  if (!language) {
    continue;
  }

  if (language === "pascal-inc") {
    const prefix = await readPrefix(normalizedPath);
    if (looksLikePascal(prefix)) {
      counts.pascal += 1;
    }
    continue;
  }

  counts[language] += 1;
}

console.log(
  JSON.stringify({
    languages: Object.entries(counts)
      .filter(([, count]) => count > 0)
      .map(([language, count]) => ({ language, count })),
  }),
);

function classifyPath(filePath: string) {
  const lowerPath = filePath.toLowerCase();
  const basename = lowerPath.split("/").at(-1) ?? lowerPath;
  if (/\\.(py|pyi|pyw)$/.test(lowerPath)) {
    return "python";
  }
  if (/\\.(rb|rake|gemspec)$/.test(lowerPath) || RUBY_BASENAMES.has(basename)) {
    return "ruby";
  }
  if (/\\.(pas|pp|lpr|dpr|dpk)$/.test(lowerPath)) {
    return "pascal";
  }
  if (/\\.inc$/.test(lowerPath)) {
    return "pascal-inc";
  }
  if (/\\.java$/.test(lowerPath)) {
    return "java";
  }
  return null;
}

function isIgnoredPath(filePath: string) {
  const lowerPath = filePath.toLowerCase();
  return (
    lowerPath.startsWith(".git/") ||
    lowerPath.startsWith(".next/") ||
    lowerPath.startsWith(".turbo/") ||
    lowerPath.startsWith("coverage/") ||
    lowerPath.startsWith("dist/") ||
    lowerPath.startsWith("node_modules/") ||
    lowerPath.startsWith("out/") ||
    lowerPath.startsWith(".venv/") ||
    lowerPath.startsWith("venv/") ||
    lowerPath.includes("/__pycache__/") ||
    lowerPath.startsWith("__pycache__/") ||
    lowerPath.startsWith(".bundle/") ||
    lowerPath.startsWith("vendor/bundle/") ||
    lowerPath.includes("/site-packages/") ||
    lowerPath.startsWith("site-packages/") ||
    lowerPath.startsWith("build/") ||
    lowerPath.startsWith("target/")
  );
}

async function readPrefix(filePath: string) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(20_000);
    const result = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.toString("utf8", 0, result.bytesRead);
  } catch {
    return "";
  } finally {
    await handle.close();
  }
}

function looksLikePascal(content: string) {
  return /\\b(unit|interface|implementation|procedure|function|begin)\\b|end\\.|\\{\\$/i.test(
    content,
  );
}
REPO_DEPUTY_LANGUAGE_MANIFEST
timeout 60s bun --silent /tmp/repo-deputy-language-manifest.ts`;

export async function runSandboxRepoScan(
  input: RepoScanInput & { repoUrl: string },
): Promise<RepoScanResult> {
  const sessionResult = await createSandboxScanSession(input);
  const toolResults = [...sessionResult.toolResults];

  if (sessionResult.ready) {
    toolResults.push(
      ...(await Promise.all(
        sessionResult.tools.map((toolId) =>
          runSandboxScanTool(sessionResult.session.sandbox?.sandboxId, toolId),
        ),
      )),
    );
  }

  return finishSandboxScanSession({
    session: sessionResult.session,
    toolResults,
    useAi: input.useAi,
  });
}

export async function createSandboxScanSession(
  input: RepoScanInput & { repoUrl: string },
): Promise<SandboxScanSessionResult> {
  const locator = normalizeRepoLocator(input.repoUrl);
  const context = createSandboxContext(input, locator);

  try {
    const sandbox = await Sandbox.create({
      runtime: "node24",
      resources: { vcpus: 2 },
      timeout: SANDBOX_TIMEOUT_MS,
    });

    context.sandbox = {
      repoUrl: locator.repoUrl,
      cloneDepth: CLONE_DEPTH,
      revision: input.revision,
      sandboxId: sandbox.sandboxId,
    };

    const clone = await runSandboxCommand(sandbox, buildGitCloneCommand(locator, input));
    context.toolResults.push(buildGitCloneResult(clone, locator));

    if (clone.exitCode !== 0) {
      return {
        session: sandboxSessionFromContext(context),
        toolResults: context.toolResults,
        tools: [],
        ready: false,
      };
    }

    const setup = await runSandboxCommand(sandbox, INSTALL_BUN_COMMAND);
    context.toolResults.push(buildSetupResult(setup));

    if (setup.exitCode !== 0) {
      return {
        session: sandboxSessionFromContext(context),
        toolResults: context.toolResults,
        tools: [],
        ready: false,
      };
    }

    const metadata = await runSandboxCommand(
      sandbox,
      buildSandboxMetadataCommand(),
      SANDBOX_REPO_DIR,
    );
    applySandboxMetadata(context, metadata.stdout);
    const languageFiles = parseSandboxLanguageManifestPayload(
      await runSandboxCommand(
        sandbox,
        withBunPath(SANDBOX_LANGUAGE_MANIFEST_COMMAND),
        SANDBOX_REPO_DIR,
      ),
    );
    const session = sandboxSessionFromContext(context, languageFiles ?? undefined);

    return {
      session,
      toolResults: context.toolResults,
      tools: sandboxScanToolsForSession(session),
      ready: true,
    };
  } catch (error) {
    context.toolResults.push(buildSandboxFailureResult(error));
  }

  return {
    session: sandboxSessionFromContext(context),
    toolResults: context.toolResults,
    tools: [],
    ready: false,
  };
}

export async function runSandboxScanTool(
  sandboxId: string | undefined,
  toolId: SandboxScanToolId,
): Promise<ToolCheckResult> {
  if (!sandboxId) {
    return buildMissingSandboxToolResult(toolId);
  }

  try {
    const sandbox = await Sandbox.get({ sandboxId });

    switch (toolId) {
      case "fallow":
        return buildFallowToolResult(
          await runSandboxCommand(
            sandbox,
            withBunPath(`timeout 180s ${FALLOW_COMMAND}`),
            SANDBOX_REPO_DIR,
          ),
        );
      case "light-language-python":
        return runSandboxLightLanguageTool(sandbox, "python");
      case "light-language-ruby":
        return runSandboxLightLanguageTool(sandbox, "ruby");
      case "light-language-pascal":
        return runSandboxLightLanguageTool(sandbox, "pascal");
      case "light-language-java":
        return runSandboxLightLanguageTool(sandbox, "java");
      case "markdownlint":
        return buildMarkdownlintToolResult(
          await runSandboxCommand(
            sandbox,
            withBunPath(`timeout 120s ${MARKDOWNLINT_COMMAND}`),
            SANDBOX_REPO_DIR,
          ),
        );
      case "markdown-link-check":
        return buildMarkdownLinkCheckToolResult(
          await runSandboxCommand(
            sandbox,
            withBunPath(`timeout 180s ${MARKDOWN_LINK_CHECK_COMMAND}`),
            SANDBOX_REPO_DIR,
          ),
        );
    }

    const exhaustive: never = toolId;
    return exhaustive;
  } catch (error) {
    return buildSandboxToolFailureResult(toolId, error);
  }
}

export async function finishSandboxScanSession(input: {
  session: SandboxScanSession;
  toolResults: ToolCheckResult[];
  useAi?: boolean;
}): Promise<RepoScanResult> {
  const context = contextFromSandboxSession(input.session, input.toolResults);

  try {
    if (input.session.sandbox?.sandboxId) {
      context.sourceExcerpts = await Sandbox.get({
        sandboxId: input.session.sandbox.sandboxId,
      })
        .then((sandbox) => collectSandboxSourceExcerpts(sandbox, input.toolResults))
        .catch(() => []);
    }

    return await buildSandboxScanResult(
      {
        focus: input.session.focus,
        repoUrl: input.session.sandbox?.repoUrl ?? input.session.repo,
        revision: input.session.revision,
        useAi: input.useAi,
      },
      context,
    );
  } finally {
    await stopSandboxScanSession(input.session);
  }
}

export async function stopSandboxScanSession(session: SandboxScanSession) {
  await stopSandboxById(session.sandbox?.sandboxId);
}

export async function stopSandboxById(sandboxId: string | undefined) {
  if (!sandboxId) {
    return;
  }

  try {
    const sandbox = await Sandbox.get({ sandboxId });
    await sandbox.stop({ blocking: false });
  } catch {
    // Best-effort cleanup only. A sandbox timeout still bounds abandoned sessions.
  }
}

async function runSandboxLightLanguageTool(sandbox: Sandbox, language: SourceLanguage) {
  return parseSandboxLanguageSourcePayload(
    await runSandboxCommand(
      sandbox,
      withBunPath(buildSandboxLanguageSourceCommand(language)),
      SANDBOX_REPO_DIR,
    ),
    language,
  );
}

function buildSandboxLanguageSourceCommand(language: SourceLanguage) {
  return SANDBOX_LANGUAGE_SOURCE_COMMAND.replaceAll("__TARGET_LANGUAGE__", language);
}

function sandboxScanToolsForSession(session: SandboxScanSession): SandboxScanToolId[] {
  const languages = session.languageFiles
    ? LIGHT_LANGUAGE_ANALYSIS_LANGUAGES.filter(
        (language) => (session.languageFiles?.[language] ?? 0) > 0,
      )
    : LIGHT_LANGUAGE_ANALYSIS_LANGUAGES;

  return [
    "fallow",
    ...languages.map((language) => lightLanguageToolId(language)),
    "markdownlint",
    "markdown-link-check",
  ];
}

export function normalizeRepoLocator(value: string): RepoLocator {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Repository URL is required for sandbox scans.");
  }

  const sshMatch = trimmed.match(/^git@github\.com:(.+?)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return fromOwnerRepo(sshMatch[1], sshMatch[2]);
  }

  const githubHostMatch = trimmed.match(/^github\.com\/(.+?)\/(.+?)(?:\.git)?\/?$/);
  if (githubHostMatch) {
    return fromOwnerRepo(githubHostMatch[1], githubHostMatch[2]);
  }

  const shorthandMatch = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/);
  if (shorthandMatch) {
    return fromOwnerRepo(shorthandMatch[1], shorthandMatch[2]);
  }

  const url = new URL(trimmed);
  const repoName = url.pathname
    .split("/")
    .filter(Boolean)
    .at(-1)
    ?.replace(/\.git$/, "");

  if (!repoName) {
    throw new Error(`Could not derive repository name from ${trimmed}.`);
  }

  const repoPath =
    url.hostname === "github.com"
      ? url.pathname.replace(/^\/|\/$|\.git$/g, "")
      : repoName;

  return {
    repo: repoPath,
    repoName,
    repoUrl: normalizeGitUrl(url),
  };
}

export function parseSandboxLanguageSourcePayload(
  output: SandboxCommandOutput,
  language?: SourceLanguage,
): ToolCheckResult {
  if (output.exitCode !== 0) {
    return buildLanguageSourceErrorResult(
      output,
      "Sandbox language source collection failed before producing JSON.",
      language,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(output.stdout);
  } catch {
    return buildLanguageSourceErrorResult(
      output,
      "Sandbox language source collection returned invalid JSON.",
      language,
    );
  }

  if (!isSandboxLanguagePayload(parsed)) {
    return buildLanguageSourceErrorResult(
      output,
      "Sandbox language source collection returned an unexpected payload.",
      language,
    );
  }

  return buildLightLanguageToolResult({
    files: parsed.files,
    skipped: parsed.skipped,
    source: "sandbox",
    language,
  });
}

export function parseSandboxLanguageManifestPayload(
  output: SandboxCommandOutput,
): Partial<Record<SourceLanguage, number>> | null {
  if (output.exitCode !== 0) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(output.stdout);
  } catch {
    return null;
  }

  if (!isSandboxLanguageManifestPayload(parsed)) {
    return null;
  }

  return Object.fromEntries(
    parsed.languages
      .filter((entry) => LIGHT_LANGUAGE_ANALYSIS_LANGUAGES.includes(entry.language))
      .map((entry) => [entry.language, entry.count]),
  ) as Partial<Record<SourceLanguage, number>>;
}

function sandboxSessionFromContext(
  context: ReviewContext,
  languageFiles?: Partial<Record<SourceLanguage, number>>,
): SandboxScanSession {
  return {
    repo: context.repo,
    repoName: context.repoName,
    focus: context.focus,
    revision: context.sandbox?.revision,
    scannedFiles: context.scannedFiles,
    lineStats: context.lineStats,
    languageFiles,
    sandbox: context.sandbox,
  };
}

function contextFromSandboxSession(
  session: SandboxScanSession,
  toolResults: ToolCheckResult[],
): ReviewContext {
  const [owner] = session.repo.includes("/")
    ? session.repo.split("/", 2)
    : ["remote", session.repo];

  return {
    scope: "repo",
    owner,
    repoName: session.repoName,
    repo: session.repo,
    command: "scan",
    focus: session.focus,
    changedFiles: [],
    docsFiles: [],
    packageJson: null,
    packageInfo: null,
    readme: null,
    envExample: null,
    memoryInsights: [],
    toolResults,
    scannedFiles: session.scannedFiles,
    lineStats: session.lineStats,
    sandbox:
      session.sandbox ??
      ({
        repoUrl: session.repo,
        cloneDepth: CLONE_DEPTH,
        revision: session.revision,
      } satisfies SandboxScanMetadata),
  };
}

function createSandboxContext(input: RepoScanInput, locator: RepoLocator): ReviewContext {
  const [owner] = locator.repo.includes("/")
    ? locator.repo.split("/", 2)
    : ["remote", locator.repo];

  return {
    scope: "repo",
    owner,
    repoName: locator.repoName,
    repo: locator.repo,
    command: "scan",
    focus: input.focus,
    changedFiles: [],
    docsFiles: [],
    packageJson: null,
    packageInfo: null,
    readme: null,
    envExample: null,
    memoryInsights: [],
    toolResults: [],
    sandbox: {
      repoUrl: locator.repoUrl,
      cloneDepth: CLONE_DEPTH,
      revision: input.revision,
    },
  };
}

function buildMissingSandboxToolResult(toolId: SandboxScanToolId): ToolCheckResult {
  const meta = sandboxToolMeta(toolId);

  return {
    id: meta.id,
    name: meta.name,
    command: meta.command,
    status: "error",
    exitCode: null,
    summary: `${meta.name} could not run because the sandbox session is missing a sandbox id.`,
    issues: [
      {
        id: `${meta.id}-missing-sandbox`,
        title: `${meta.name} could not run`,
        severity: "medium",
        category: "code-drift",
        message: "Repo Deputy could not attach the check to an active sandbox.",
        evidence: ["The split scan session did not include a sandbox id."],
        suggestedFix:
          "Start a new scan session, then rerun the check before the sandbox times out.",
      },
    ],
  };
}

function buildSandboxToolFailureResult(
  toolId: SandboxScanToolId,
  error: unknown,
): ToolCheckResult {
  const meta = sandboxToolMeta(toolId);
  const message = sandboxErrorMessage(error);

  return {
    id: meta.id,
    name: meta.name,
    command: meta.command,
    status: "error",
    exitCode: null,
    summary: `${meta.name} could not run in the sandbox: ${message}`,
    issues: [
      {
        id: `${meta.id}-sandbox-run-failed`,
        title: `${meta.name} failed in the sandbox`,
        severity: "medium",
        category: "code-drift",
        message,
        evidence: [message],
        suggestedFix:
          "Rerun the scan. If it still fails, reduce repository size or check sandbox credentials.",
      },
    ],
  };
}

function sandboxToolMeta(toolId: SandboxScanToolId) {
  switch (toolId) {
    case "fallow":
      return {
        id: "fallow",
        name: "Fallow",
        command: FALLOW_COMMAND,
      };
    case "light-language-python":
      return lightLanguageToolMeta("python");
    case "light-language-ruby":
      return lightLanguageToolMeta("ruby");
    case "light-language-pascal":
      return lightLanguageToolMeta("pascal");
    case "light-language-java":
      return lightLanguageToolMeta("java");
    case "markdownlint":
      return {
        id: "markdownlint",
        name: "markdownlint-cli2",
        command: MARKDOWNLINT_COMMAND,
      };
    case "markdown-link-check":
      return {
        id: "markdown-link-check",
        name: "markdown-link-check",
        command: MARKDOWN_LINK_CHECK_COMMAND,
      };
  }

  const exhaustive: never = toolId;
  return exhaustive;
}

function lightLanguageToolMeta(language: SourceLanguage) {
  return {
    id: lightLanguageToolId(language),
    name: `${LIGHT_LANGUAGE_LABELS[language]} analysis`,
    command: `repo-deputy light-language-analysis (in-process) --language ${language}`,
  };
}

async function runSandboxCommand(
  sandbox: Sandbox,
  command: string,
  cwd?: string,
): Promise<SandboxCommandOutput> {
  const startedAt = Date.now();
  const finished = await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", command],
    cwd,
  });

  return {
    command,
    exitCode: finished.exitCode,
    stdout: await finished.stdout(),
    stderr: await finished.stderr(),
    durationMs: Date.now() - startedAt,
  };
}

function buildGitCloneCommand(locator: RepoLocator, input: RepoScanInput) {
  const branchArgs = input.revision
    ? ` --single-branch --branch ${shellQuote(input.revision)}`
    : " --single-branch";

  return `rm -rf ${shellQuote(SANDBOX_REPO_DIR)} && GIT_TERMINAL_PROMPT=0 timeout 180s git clone --depth=${CLONE_DEPTH} --filter=blob:none${branchArgs} ${shellQuote(
    locator.repoUrl,
  )} ${shellQuote(SANDBOX_REPO_DIR)}`;
}

function buildSandboxMetadataCommand() {
  return String.raw`node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");

const languages = {
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

function languageForPath(filePath) {
  const normalized = filePath.toLowerCase();
  if (normalized === ".env.example") return languages[".env"];
  return languages[path.extname(normalized)] || null;
}

function splitLines(content) {
  if (!content) return [];
  const lines = content.split(/\r\n|\r|\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function countCodeSloc(content) {
  let inBlock = false;
  let count = 0;
  for (const line of splitLines(content)) {
    let text = line.trim();
    let hasCode = false;
    while (text) {
      if (inBlock) {
        const end = text.indexOf("*/");
        if (end < 0) {
          text = "";
          break;
        }
        text = text.slice(end + 2).trim();
        inBlock = false;
        continue;
      }
      if (text.startsWith("//")) break;
      const lineComment = text.indexOf("//");
      const blockComment = text.indexOf("/*");
      if (blockComment >= 0 && (lineComment < 0 || blockComment < lineComment)) {
        if (text.slice(0, blockComment).trim()) hasCode = true;
        const end = text.indexOf("*/", blockComment + 2);
        if (end < 0) {
          inBlock = true;
          text = "";
          break;
        }
        text = text.slice(end + 2).trim();
        continue;
      }
      const code = lineComment >= 0 ? text.slice(0, lineComment).trim() : text;
      if (code) hasCode = true;
      break;
    }
    if (hasCode) count += 1;
  }
  return count;
}

function countSloc(content, kind) {
  if (kind === "code") return countCodeSloc(content);
  if (kind === "hash-comment") {
    return splitLines(content).filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith("#");
    }).length;
  }
  return splitLines(content).filter((line) => line.trim()).length;
}

const commit = cp.execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  encoding: "utf8",
}).trim();
const paths = cp.execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);
const byLanguage = new Map();

for (const filePath of paths) {
  const definition = languageForPath(filePath);
  if (!definition) continue;
  let stats;
  try {
    stats = fs.statSync(filePath);
  } catch {
    continue;
  }
  if (!stats.isFile() || stats.size > 1000000) continue;
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    continue;
  }
  if (content.includes("\0")) continue;
  const loc = splitLines(content).length;
  const sloc = countSloc(content, definition.kind);
  const existing =
    byLanguage.get(definition.language) ||
    { language: definition.language, files: 0, loc: 0, sloc: 0 };
  existing.files += 1;
  existing.loc += loc;
  existing.sloc += sloc;
  byLanguage.set(definition.language, existing);
}

const rows = [...byLanguage.values()].sort(
  (a, b) => b.sloc - a.sloc || b.loc - a.loc || a.language.localeCompare(b.language),
);

console.log(
  JSON.stringify({
    commit,
    scannedFiles: paths.length,
    lineStats: {
      files: rows.reduce((sum, entry) => sum + entry.files, 0),
      loc: rows.reduce((sum, entry) => sum + entry.loc, 0),
      sloc: rows.reduce((sum, entry) => sum + entry.sloc, 0),
      prominentLanguage: rows[0]?.language || null,
      languages: rows,
    },
  }),
);
NODE`;
}

async function collectSandboxSourceExcerpts(
  sandbox: Sandbox,
  results: ToolCheckResult[],
): Promise<FindingSourceExcerpt[]> {
  const requests = sourceRequestsFromToolResults(results);
  if (requests.length === 0) {
    return [];
  }

  const output = await runSandboxCommand(
    sandbox,
    buildSandboxSourceExcerptCommand(requests),
    SANDBOX_REPO_DIR,
  );

  if (output.exitCode !== 0) {
    return [];
  }

  return parseSourceExcerpts(output.stdout);
}

function sourceRequestsFromToolResults(results: ToolCheckResult[]) {
  const byPath = new Map<string, { path: string; line?: number }>();

  for (const issue of results.flatMap((result) => result.issues)) {
    if (!issue.path || !isSafeRepoRelativePath(issue.path)) {
      continue;
    }

    const existing = byPath.get(issue.path);
    if (existing) {
      if (!existing.line && issue.line) {
        existing.line = issue.line;
      }
      continue;
    }

    byPath.set(issue.path, {
      path: issue.path,
      line: issue.line,
    });
  }

  return [...byPath.values()].slice(0, 16);
}

function buildSandboxSourceExcerptCommand(
  requests: Array<{ path: string; line?: number }>,
) {
  return String.raw`repo_deputy_source_requests=${shellQuote(JSON.stringify(requests))} node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

function splitLines(content) {
  if (!content) return [];
  const lines = content.split(/\r\n|\r|\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function isSafeRepoRelativePath(filePath) {
  return (
    filePath &&
    !path.isAbsolute(filePath) &&
    !filePath.split(/[\\/]+/).includes("..") &&
    !filePath.includes("\0")
  );
}

const requests = JSON.parse(process.env.repo_deputy_source_requests || "[]");
const excerpts = [];

for (const request of requests.slice(0, 16)) {
  const filePath = String(request.path || "");
  if (!isSafeRepoRelativePath(filePath)) continue;
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch {
    continue;
  }
  if (content.includes("\0")) continue;
  const lines = splitLines(content);
  const requestedLine = Number(request.line);
  const line =
    Number.isFinite(requestedLine) && requestedLine > 0
      ? Math.min(Math.floor(requestedLine), Math.max(lines.length, 1))
      : 1;
  const startLine = Math.max(1, line - 6);
  const endLine = Math.min(lines.length, line + 6);
  excerpts.push({
    path: filePath,
    line,
    startLine,
    endLine,
    lines: lines.slice(startLine - 1, endLine).map((text, index) => ({
      number: startLine + index,
      text,
    })),
  });
}

console.log(JSON.stringify(excerpts));
NODE`;
}

function buildGitCloneResult(
  output: SandboxCommandOutput,
  locator: RepoLocator,
): ToolCheckResult {
  return {
    id: "git-clone",
    name: "Git clone",
    command: output.command,
    status: output.exitCode === 0 ? "passed" : "error",
    exitCode: output.exitCode,
    summary:
      output.exitCode === 0
        ? `Checked out ${locator.repo} with git clone depth=${CLONE_DEPTH} and blob filtering.`
        : `git clone depth=${CLONE_DEPTH} failed for ${locator.repo}.`,
    durationMs: output.durationMs,
    issues:
      output.exitCode === 0
        ? []
        : [
            {
              id: "sandbox-git-clone-failed",
              title: "Sandbox git clone failed",
              severity: "high",
              category: "architecture-drift",
              message: `git clone depth=${CLONE_DEPTH} failed for ${locator.repo}.`,
              evidence: [
                output.stderr ? `stderr: ${output.stderr.slice(0, 1_000)}` : "",
                output.stdout ? `stdout: ${output.stdout.slice(0, 1_000)}` : "",
              ].filter(Boolean),
              suggestedFix:
                "Verify the repository URL is publicly cloneable over HTTPS, then rerun the sandbox scan.",
            },
          ],
    output: {
      stdout: output.stdout.slice(0, 4_000),
      stderr: output.stderr.slice(0, 4_000),
      truncated: output.stdout.length > 4_000 || output.stderr.length > 4_000,
    },
  };
}

function buildSetupResult(output: SandboxCommandOutput): ToolCheckResult {
  return {
    id: "sandbox-bun-setup",
    name: "Sandbox Bun setup",
    command: output.command,
    status: output.exitCode === 0 ? "passed" : "error",
    exitCode: output.exitCode,
    summary:
      output.exitCode === 0
        ? `Bun is available in the sandbox (${output.stdout.trim() || "version unknown"}).`
        : "Bun could not be installed in the sandbox.",
    durationMs: output.durationMs,
    issues:
      output.exitCode === 0
        ? []
        : [
            {
              id: "sandbox-bun-setup-failed",
              title: "Sandbox Bun setup failed",
              severity: "high",
              category: "code-drift",
              message:
                "Repo Deputy could not install or locate Bun before running sandbox tools.",
              evidence: [
                output.stderr ? `stderr: ${output.stderr.slice(0, 500)}` : "",
                output.stdout ? `stdout: ${output.stdout.slice(0, 500)}` : "",
              ].filter(Boolean),
              suggestedFix:
                "Verify the sandbox can reach bun.sh, then rerun the scan with Vercel Sandbox credentials.",
            },
          ],
    output: {
      stdout: output.stdout.slice(0, 2_000),
      stderr: output.stderr.slice(0, 2_000),
      truncated: output.stdout.length > 2_000 || output.stderr.length > 2_000,
    },
  };
}

function buildLanguageSourceErrorResult(
  output: SandboxCommandOutput,
  message: string,
  language?: SourceLanguage,
): ToolCheckResult {
  const id = language ? lightLanguageToolId(language) : "light-language-analysis";
  const name = language
    ? `${LIGHT_LANGUAGE_LABELS[language]} analysis`
    : "Language analysis";

  return {
    id,
    name,
    command: output.command,
    status: "error",
    exitCode: output.exitCode,
    summary: message,
    durationMs: output.durationMs,
    issues: [
      {
        id: language
          ? `light-language-${language}-source-collection-error`
          : "light-language-source-collection-error",
        title: `${name} could not collect source files`,
        severity: "medium",
        category: "code-drift",
        message,
        evidence: [
          output.stderr ? `stderr: ${output.stderr.slice(0, 1_000)}` : "",
          output.stdout ? `stdout: ${output.stdout.slice(0, 1_000)}` : "",
        ].filter(Boolean),
        suggestedFix: "Reduce the target source size before rerunning the sandbox scan.",
      },
    ],
    output: {
      stdout: output.stdout.slice(0, 4_000),
      stderr: output.stderr.slice(0, 4_000),
      truncated: output.stdout.length > 4_000 || output.stderr.length > 4_000,
    },
  };
}

function buildSandboxFailureResult(error: unknown): ToolCheckResult {
  const message = sandboxErrorMessage(error);

  return {
    id: "sandbox",
    name: "Vercel Sandbox",
    command: "Sandbox.create({ source: { type: 'git', depth: 1 } })",
    status: "error",
    exitCode: null,
    summary: `Vercel Sandbox scan did not start: ${message}`,
    issues: [
      {
        id: "sandbox-scan-failed",
        title: "Vercel Sandbox scan did not start",
        severity: "high",
        category: "architecture-drift",
        message,
        evidence: [message],
        suggestedFix:
          "Configure Vercel Sandbox credentials, then rerun the shallow clone scan.",
      },
    ],
  };
}

async function buildSandboxScanResult(
  input: RepoScanInput,
  context: ReviewContext,
): Promise<RepoScanResult> {
  const findings = toolResultsToFindings(context.toolResults);
  const report =
    input.useAi === false
      ? buildFallbackReport(findings, [], context.focus, context.toolResults)
      : await generateDeputyReport({
          repo: context.repo,
          focus: context.focus,
          findings,
          memoryInsights: [],
          toolResults: context.toolResults,
        });

  return {
    context,
    report,
    markdown: report.markdown,
  };
}

function applySandboxMetadata(context: ReviewContext, stdout: string) {
  const parsed = parseSandboxMetadata(stdout);
  if (parsed) {
    if (context.sandbox && parsed.commit) {
      context.sandbox.commit = parsed.commit;
    }
    if (typeof parsed.scannedFiles === "number" && parsed.scannedFiles > 0) {
      context.scannedFiles = parsed.scannedFiles;
    }
    if (parsed.lineStats) {
      context.lineStats = parsed.lineStats;
    }
    return;
  }

  const [commit, files] = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (context.sandbox && commit) {
    context.sandbox.commit = commit;
  }

  const scannedFiles = Number(files);
  if (Number.isFinite(scannedFiles) && scannedFiles > 0) {
    context.scannedFiles = scannedFiles;
  }
}

function parseSandboxMetadata(stdout: string) {
  try {
    const value = JSON.parse(stdout.trim()) as {
      commit?: unknown;
      scannedFiles?: unknown;
      lineStats?: unknown;
    };
    return {
      commit: typeof value.commit === "string" ? value.commit : undefined,
      scannedFiles:
        typeof value.scannedFiles === "number" ? value.scannedFiles : undefined,
      lineStats: parseLineStats(value.lineStats),
    };
  } catch {
    return null;
  }
}

function parseLineStats(value: unknown): RepoLineStats | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const languages = Array.isArray(record.languages)
    ? record.languages
        .map((entry) =>
          entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null,
        )
        .filter((entry): entry is Record<string, unknown> => Boolean(entry))
        .map((entry) => ({
          language: typeof entry.language === "string" ? entry.language : "",
          files: numberValue(entry.files),
          loc: numberValue(entry.loc),
          sloc: numberValue(entry.sloc),
        }))
        .filter(
          (
            entry,
          ): entry is { language: string; files: number; loc: number; sloc: number } =>
            Boolean(entry.language) &&
            entry.files !== undefined &&
            entry.loc !== undefined &&
            entry.sloc !== undefined,
        )
    : [];

  return {
    files:
      numberValue(record.files) ?? languages.reduce((sum, row) => sum + row.files, 0),
    loc: numberValue(record.loc) ?? languages.reduce((sum, row) => sum + row.loc, 0),
    sloc: numberValue(record.sloc) ?? languages.reduce((sum, row) => sum + row.sloc, 0),
    prominentLanguage:
      typeof record.prominentLanguage === "string" ? record.prominentLanguage : null,
    languages,
  };
}

function parseSourceExcerpts(stdout: string): FindingSourceExcerpt[] {
  try {
    const value = JSON.parse(stdout.trim()) as unknown;
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((entry) =>
        entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null,
      )
      .filter((entry): entry is Record<string, unknown> => Boolean(entry))
      .map((entry) => {
        const lines = Array.isArray(entry.lines)
          ? entry.lines
              .map((line) =>
                line && typeof line === "object"
                  ? (line as Record<string, unknown>)
                  : null,
              )
              .filter((line): line is Record<string, unknown> => Boolean(line))
              .map((line) => ({
                number: numberValue(line.number) ?? 0,
                text: typeof line.text === "string" ? line.text : "",
              }))
              .filter((line) => line.number > 0)
          : [];

        return {
          path: typeof entry.path === "string" ? entry.path : "",
          line: numberValue(entry.line),
          startLine: numberValue(entry.startLine) ?? lines[0]?.number ?? 1,
          endLine: numberValue(entry.endLine) ?? lines.at(-1)?.number ?? 1,
          lines,
        };
      })
      .filter((entry) => entry.path && entry.lines.length > 0);
  } catch {
    return [];
  }
}

function isSafeRepoRelativePath(filePath: string) {
  return (
    Boolean(filePath) &&
    !filePath.startsWith("/") &&
    !filePath.split(/[\\/]+/).includes("..") &&
    !filePath.includes("\0")
  );
}

function toolResultsToFindings(results: ToolCheckResult[]): Finding[] {
  return results.flatMap((result) => toolIssuesToFindings(result));
}

function withBunPath(command: string) {
  return `export PATH="$HOME/.bun/bin:$PATH"; ${command}`;
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function sandboxErrorMessage(error: unknown) {
  const record = error as {
    message?: string;
    response?: { status?: number; statusText?: string };
    json?: unknown;
    text?: string;
  };
  const parts = [
    record.message ?? String(error),
    record.response?.status
      ? `HTTP ${record.response.status}${
          record.response.statusText ? ` ${record.response.statusText}` : ""
        }`
      : "",
    safeJsonErrorMessage(record.json),
    record.text && !safeJsonErrorMessage(record.json) ? record.text.slice(0, 500) : "",
  ].filter(Boolean);

  return [...new Set(parts)].join(" | ");
}

function isSandboxLanguagePayload(value: unknown): value is {
  files: Array<{ path: string; content: string; size?: number }>;
  skipped?: {
    tooLarge?: number;
    unsupported?: number;
    totalLimit?: number;
    unreadable?: number;
  };
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as {
    files?: unknown;
    skipped?: unknown;
  };
  if (!Array.isArray(payload.files)) {
    return false;
  }

  return payload.files.every((file) => {
    if (!file || typeof file !== "object") {
      return false;
    }
    const candidate = file as { path?: unknown; content?: unknown; size?: unknown };
    return (
      typeof candidate.path === "string" &&
      typeof candidate.content === "string" &&
      (candidate.size === undefined || typeof candidate.size === "number")
    );
  });
}

function isSandboxLanguageManifestPayload(value: unknown): value is {
  languages: Array<{ language: SourceLanguage; count: number }>;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const payload = value as { languages?: unknown };
  if (!Array.isArray(payload.languages)) {
    return false;
  }

  return payload.languages.every((entry) => {
    if (!entry || typeof entry !== "object") {
      return false;
    }

    const candidate = entry as { language?: unknown; count?: unknown };
    return (
      typeof candidate.language === "string" &&
      LIGHT_LANGUAGE_ANALYSIS_LANGUAGES.includes(candidate.language as SourceLanguage) &&
      typeof candidate.count === "number" &&
      Number.isFinite(candidate.count)
    );
  });
}

function safeJsonErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") {
    return "";
  }

  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object") {
    return "";
  }

  const details = error as {
    code?: string;
    message?: string;
    exitCode?: number;
    sandboxId?: string;
  };

  return [
    details.code ? `code=${details.code}` : "",
    details.message ? `message=${details.message}` : "",
    typeof details.exitCode === "number" ? `exitCode=${details.exitCode}` : "",
    details.sandboxId ? `sandboxId=${details.sandboxId}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function fromOwnerRepo(owner: string, repo: string): RepoLocator {
  const cleanRepo = repo.replace(/\.git$/, "");
  const repoPath = `${owner}/${cleanRepo}`;

  return {
    repo: repoPath,
    repoName: cleanRepo,
    repoUrl: `https://github.com/${repoPath}.git`,
  };
}

function normalizeGitUrl(url: URL) {
  url.hash = "";
  url.search = "";

  if (url.hostname === "github.com" && !url.pathname.endsWith(".git")) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}.git`;
  }

  return url.toString();
}
