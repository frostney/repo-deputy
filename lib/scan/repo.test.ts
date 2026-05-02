import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectRepoScanContext, runRepoScan } from "./repo";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

describe("collectRepoScanContext", () => {
  test("collects repo files and ignores dependency directories", async () => {
    const rootPath = await createFixtureRepo();

    const context = await collectRepoScanContext({ focus: "full", rootPath });

    expect(context.scope).toBe("repo");
    expect(context.repo).toBe(`local/${path.basename(rootPath)}`);
    expect(context.packageJson?.path).toBe("package.json");
    expect(context.readme?.path).toBe("README.md");
    expect(context.envExample?.path).toBe(".env.example");
    expect(context.docsFiles.map((file) => file.path)).toContain("docs/setup.md");
    const filenames = context.changedFiles.map((file) => file.filename);
    expect(filenames).toContain("lib/script.py");
    expect(filenames).toContain("lib/task.rb");
    expect(filenames).toContain("lib/unit.pas");
    expect(filenames).toContain("lib/App.java");
    expect(
      context.changedFiles.some((file) => file.filename.includes("node_modules")),
    ).toBe(false);
  });
});

describe("runRepoScan", () => {
  test("runs a deterministic repo scan without AI or memory", async () => {
    const rootPath = await createFixtureRepo();

    const result = await runRepoScan({
      focus: "full",
      rootPath,
      useAi: false,
      useMemory: false,
    });

    expect(result.context.rootPath).toBe(rootPath);
    expect(result.report.findings.map((finding) => finding.id)).toContain(
      "docs-bun-dev-command",
    );
    expect(result.report.findings.map((finding) => finding.id)).toContain(
      "docs-bun-install-command",
    );
    expect(result.markdown).toContain("## Repo Deputy scan");
    expect(result.markdown).toContain("### What Repo Deputy checked");
  });

  test("includes markdown duplication findings in docs scans", async () => {
    const rootPath = await createMarkdownDuplicationFixtureRepo();

    const result = await runRepoScan({
      focus: "docs",
      rootPath,
      useAi: false,
      useMemory: false,
    });

    expect(result.report.findings.map((finding) => finding.id)).toContain(
      "docs-markdown-duplicate-exact",
    );
  });

  test("runs lightweight language analysis for supported source files", async () => {
    const rootPath = await createLightLanguageFixtureRepo();

    const result = await runRepoScan({
      focus: "full",
      rootPath,
      useAi: false,
      useMemory: false,
    });

    expect(result.report.toolResults?.map((tool) => tool.id)).toContain(
      "light-language-analysis",
    );
    expect(result.report.findings.map((finding) => finding.id)).toContain(
      "light-language-python-duplication",
    );
  });
});

async function createFixtureRepo() {
  const rootPath = await mkdtemp(path.join(tmpdir(), "repo-deputy-scan-"));
  tempDirs.push(rootPath);

  await mkdir(path.join(rootPath, "app/api/review"), { recursive: true });
  await mkdir(path.join(rootPath, "docs"), { recursive: true });
  await mkdir(path.join(rootPath, "lib"), { recursive: true });
  await mkdir(path.join(rootPath, "node_modules/ignored"), { recursive: true });

  await writeFile(
    path.join(rootPath, "package.json"),
    JSON.stringify({
      packageManager: "bun@1.3.9",
      scripts: { dev: "bun run dev" },
    }),
  );
  await writeFile(
    path.join(rootPath, "README.md"),
    "Install with pnpm install.\nRun npm run dev.\n",
  );
  await writeFile(path.join(rootPath, ".env.example"), "AI_GATEWAY_API_KEY=\n");
  await writeFile(path.join(rootPath, "docs/setup.md"), "Run npm run dev.\n");
  await writeFile(
    path.join(rootPath, "app/api/review/route.ts"),
    "export const key = process.env.NEW_SERVICE_TOKEN;\n",
  );
  await writeFile(
    path.join(rootPath, "lib/format.ts"),
    "export function formatFinding() {}\nexport function formatReviewFinding() {}\n",
  );
  await writeFile(path.join(rootPath, "lib/script.py"), "def ok():\n    return 1\n");
  await writeFile(path.join(rootPath, "lib/task.rb"), "def ok\n  1\nend\n");
  await writeFile(
    path.join(rootPath, "lib/App.java"),
    "public final class App { public int ok() { return 1; } }\n",
  );
  await writeFile(
    path.join(rootPath, "lib/unit.pas"),
    "unit Unit1;\ninterface\nimplementation\nend.\n",
  );
  await writeFile(path.join(rootPath, "node_modules/ignored/index.ts"), "ignored");

  return rootPath;
}

async function createMarkdownDuplicationFixtureRepo() {
  const rootPath = await mkdtemp(path.join(tmpdir(), "repo-deputy-docdup-scan-"));
  tempDirs.push(rootPath);

  await mkdir(path.join(rootPath, "docs"), { recursive: true });
  await writeFile(
    path.join(rootPath, "package.json"),
    JSON.stringify({
      packageManager: "bun@1.3.9",
      scripts: { dev: "bun run dev" },
    }),
  );

  const duplicate = [
    "This duplicated documentation paragraph explains the repository behavior",
    "with enough repeated words to cross the exact clone threshold while staying",
    "plain prose that should be consolidated into one canonical section for",
    "future readers and maintainers who need a single source of truth for",
    "the scan workflow and expected backend-only verification behavior.",
  ].join(" ");

  await writeFile(path.join(rootPath, "docs/one.md"), `# One\n\n${duplicate}`);
  await writeFile(path.join(rootPath, "docs/two.md"), `# Two\n\n${duplicate}`);

  return rootPath;
}

async function createLightLanguageFixtureRepo() {
  const rootPath = await mkdtemp(path.join(tmpdir(), "repo-deputy-lang-scan-"));
  tempDirs.push(rootPath);

  await mkdir(path.join(rootPath, "src"), { recursive: true });
  await writeFile(
    path.join(rootPath, "package.json"),
    JSON.stringify({
      packageManager: "bun@1.3.9",
      scripts: { dev: "bun run dev" },
    }),
  );
  await writeFile(path.join(rootPath, "README.md"), "Run bun run dev.\n");
  await writeFile(path.join(rootPath, "src/a.py"), duplicatePythonBlock("alpha"));
  await writeFile(path.join(rootPath, "src/b.py"), duplicatePythonBlock("beta"));

  return rootPath;
}

function duplicatePythonBlock(name: string) {
  return [
    `def ${name}():`,
    "    customer_profile = load_customer_profile_with_history(account_id, region_code)",
    "    billing_profile = normalize_billing_profile_for_invoice_run(customer_profile)",
    "    usage_records = collect_usage_records_for_statement_window(customer_profile)",
    "    risk_summary = calculate_account_risk_summary_for_operations(customer_profile)",
    "    invoice_lines = build_invoice_lines_from_usage_records(usage_records)",
    "    audit_context = create_audit_context_for_finance_reconciliation(customer_profile)",
    "    publish_finance_audit_event(audit_context, billing_profile, risk_summary)",
    "    return render_invoice_response(invoice_lines, billing_profile, risk_summary)",
  ].join("\n");
}
