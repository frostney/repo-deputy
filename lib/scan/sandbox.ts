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
  Finding,
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
      "git rev-parse --short HEAD && git ls-files | wc -l",
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
        message: "Repo Deputy could not attach the analyzer to an active sandbox.",
        evidence: ["The split scan session did not include a sandbox id."],
        suggestedFix:
          "Start a new scan session, then rerun the analyzer before the sandbox times out.",
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
    : "Lightweight language analysis";

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
