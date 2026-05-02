import { Sandbox } from "@vercel/sandbox";
import { buildFallbackReport, generateDeputyReport } from "@/lib/review/generate-report";
import {
  buildFallowToolResult,
  FALLOW_COMMAND,
  toolIssuesToFindings,
} from "@/lib/review/fallow";
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
  ToolCheckResult,
} from "@/lib/review/types";

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

const CLONE_DEPTH = 1;
const SANDBOX_TIMEOUT_MS = 10 * 60 * 1000;
const SANDBOX_REPO_DIR = "/vercel/sandbox/repo";

const INSTALL_BUN_COMMAND = [
  "if command -v bun >/dev/null 2>&1; then bun --version; exit 0; fi",
  'if [ -x "$HOME/.bun/bin/bun" ]; then "$HOME/.bun/bin/bun" --version; exit 0; fi',
  "node -e \"fetch('https://bun.sh/install').then(async r => { if (!r.ok) throw new Error('download failed: ' + r.status); require('fs').writeFileSync('/tmp/repo-deputy-install-bun.sh', await r.text()); })\"",
  "bash /tmp/repo-deputy-install-bun.sh >/tmp/repo-deputy-install-bun.log 2>&1",
  '"$HOME/.bun/bin/bun" --version',
].join(" && ");

export async function runSandboxRepoScan(
  input: RepoScanInput & { repoUrl: string },
): Promise<RepoScanResult> {
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

    try {
      const clone = await runSandboxCommand(
        sandbox,
        buildGitCloneCommand(locator, input),
      );
      context.toolResults.push(buildGitCloneResult(clone, locator));

      if (clone.exitCode !== 0) {
        return buildSandboxScanResult(input, context);
      }

      const setup = await runSandboxCommand(sandbox, INSTALL_BUN_COMMAND);
      context.toolResults.push(buildSetupResult(setup));

      if (setup.exitCode !== 0) {
        return buildSandboxScanResult(input, context);
      }

      const metadata = await runSandboxCommand(
        sandbox,
        "git rev-parse --short HEAD && git ls-files | wc -l",
        SANDBOX_REPO_DIR,
      );
      applySandboxMetadata(context, metadata.stdout);

      const toolResults = [
        buildFallowToolResult(
          await runSandboxCommand(
            sandbox,
            withBunPath(`timeout 180s ${FALLOW_COMMAND}`),
            SANDBOX_REPO_DIR,
          ),
        ),
        buildMarkdownlintToolResult(
          await runSandboxCommand(
            sandbox,
            withBunPath(`timeout 120s ${MARKDOWNLINT_COMMAND}`),
            SANDBOX_REPO_DIR,
          ),
        ),
        buildMarkdownLinkCheckToolResult(
          await runSandboxCommand(
            sandbox,
            withBunPath(`timeout 180s ${MARKDOWN_LINK_CHECK_COMMAND}`),
            SANDBOX_REPO_DIR,
          ),
        ),
      ];
      context.toolResults.push(...toolResults);
    } finally {
      await sandbox.stop({ blocking: false }).catch(() => undefined);
    }
  } catch (error) {
    context.toolResults.push(buildSandboxFailureResult(error));
  }

  return buildSandboxScanResult(input, context);
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
