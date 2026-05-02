import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runMarkdownDuplicationChecks } from "./markdown-duplication";
import type { ChangedFile, RepoFile, ReviewContext } from "./types";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })),
  );
});

describe("runMarkdownDuplicationChecks", () => {
  test("returns no findings for unique markdown files", () => {
    const findings = runMarkdownDuplicationChecks(
      createContext({
        docsFiles: [
          { path: "docs/one.md", content: "# One\n\nShort unique docs." },
          { path: "docs/two.md", content: "# Two\n\nAnother brief unique note." },
        ],
      }),
    );

    expect(findings).toEqual([]);
  });

  test("detects exact duplicated prose across two markdown files", () => {
    const duplicate = duplicateParagraph("shared");
    const findings = runMarkdownDuplicationChecks(
      createContext({
        docsFiles: [
          { path: "docs/one.md", content: `# One\n\n${duplicate}` },
          { path: "docs/two.md", content: `# Two\n\n${duplicate}` },
        ],
      }),
    );

    expect(findings.map((finding) => finding.id)).toContain(
      "docs-markdown-duplicate-exact",
    );
  });

  test("ignores duplicated prose inside fenced code blocks", () => {
    const duplicate = duplicateParagraph("code");
    const findings = runMarkdownDuplicationChecks(
      createContext({
        docsFiles: [
          { path: "docs/one.md", content: `# One\n\n\`\`\`\n${duplicate}\n\`\`\`` },
          { path: "docs/two.md", content: `# Two\n\n\`\`\`\n${duplicate}\n\`\`\`` },
        ],
      }),
    );

    expect(findings).toEqual([]);
  });

  test("ignores configured generated and dependency paths", () => {
    const duplicate = duplicateParagraph("ignored");
    const findings = runMarkdownDuplicationChecks(
      createContext({
        docsFiles: [{ path: "docs/one.md", content: `# One\n\n${duplicate}` }],
        changedFiles: [
          changedMarkdown("node_modules/ignored.md", `# Ignored\n\n${duplicate}`),
          changedMarkdown(
            "website/content/docs/copied.md",
            `# Generated\n\n${duplicate}`,
          ),
        ],
      }),
    );

    expect(findings).toEqual([]);
  });

  test("caps evidence and files for large duplicate output", () => {
    const docsFiles: RepoFile[] = Array.from({ length: 20 }, (_, fileIndex) => ({
      path: `docs/file-${fileIndex}.md`,
      content: Array.from({ length: 10 }, (_, cloneIndex) =>
        duplicateParagraph(`clone-${cloneIndex}`),
      ).join("\n\n"),
    }));

    const findings = runMarkdownDuplicationChecks(createContext({ docsFiles }));
    const exactFinding = findings.find(
      (finding) => finding.id === "docs-markdown-duplicate-exact",
    );

    expect(exactFinding).toBeDefined();
    expect(exactFinding?.evidence.length).toBeLessThanOrEqual(8);
    expect(exactFinding?.files.length).toBeLessThanOrEqual(12);
  });

  test("works without rootPath using fixture markdown content", () => {
    const duplicate = duplicateParagraph("fixture");
    const findings = runMarkdownDuplicationChecks(
      createContext({
        changedFiles: [
          changedMarkdown("guides/one.md", `# One\n\n${duplicate}`),
          changedMarkdown("guides/two.md", `# Two\n\n${duplicate}`),
        ],
      }),
    );

    expect(findings.map((finding) => finding.id)).toContain(
      "docs-markdown-duplicate-exact",
    );
  });

  test("reads markdown files from rootPath when available", async () => {
    const rootPath = await mkdtemp(path.join(tmpdir(), "repo-deputy-docdup-"));
    tempDirs.push(rootPath);
    await mkdir(path.join(rootPath, "docs"), { recursive: true });

    const duplicate = duplicateParagraph("root");
    await writeFile(path.join(rootPath, "docs/one.md"), `# One\n\n${duplicate}`);
    await writeFile(path.join(rootPath, "docs/two.md"), `# Two\n\n${duplicate}`);

    const findings = runMarkdownDuplicationChecks(createContext({ rootPath }));

    expect(findings.map((finding) => finding.id)).toContain(
      "docs-markdown-duplicate-exact",
    );
  });
});

function createContext(
  overrides: Partial<ReviewContext> & {
    changedFiles?: ChangedFile[];
    docsFiles?: RepoFile[];
  } = {},
): ReviewContext {
  return {
    scope: "repo",
    repo: "local/fixture",
    repoName: "fixture",
    command: "scan",
    focus: "full",
    changedFiles: overrides.changedFiles ?? [],
    docsFiles: overrides.docsFiles ?? [],
    packageJson: null,
    packageInfo: null,
    readme: null,
    envExample: null,
    memoryInsights: [],
    ...overrides,
  };
}

function changedMarkdown(filename: string, content: string): ChangedFile {
  return {
    filename,
    status: "modified",
    additions: 0,
    deletions: 0,
    changes: 0,
    content,
  };
}

function duplicateParagraph(marker: string) {
  return [
    "This duplicated documentation paragraph explains the repository behavior",
    marker,
    "with enough repeated words to cross the exact clone threshold while staying",
    "plain prose that should be consolidated into one canonical section for",
    "future readers and maintainers who need a single source of truth.",
  ].join(" ");
}
