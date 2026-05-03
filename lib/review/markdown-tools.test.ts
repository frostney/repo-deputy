import { describe, expect, test } from "bun:test";
import {
  buildMarkdownLinkCheckToolResult,
  MARKDOWN_LINK_CHECK_COMMAND,
  parseMarkdownLinkCheckIssues,
  parseMarkdownlintIssues,
} from "./markdown-tools";

describe("parseMarkdownlintIssues", () => {
  test("parses markdownlint-cli2 diagnostic lines", () => {
    const issues = parseMarkdownlintIssues(
      'docs/setup.md:7 error MD022/blanks-around-headings Headings should be surrounded by blank lines [Context: "# Setup"]',
    );

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      title: "Markdown lint violation: MD022",
      path: "docs/setup.md",
      line: 7,
      category: "docs-drift",
    });
  });
});

describe("parseMarkdownLinkCheckIssues", () => {
  test("parses broken-link output grouped by Markdown file", () => {
    const issues = parseMarkdownLinkCheckIssues(`
  ERROR: 1 dead link found in docs/setup.md !
  [x] ./missing.md -> Status: 400
`);

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      title: "Broken Markdown link",
      path: "docs/setup.md",
      message: "./missing.md returned 400.",
    });
  });

  test("deduplicates diagnostics repeated across stdout and stderr", () => {
    const output = `
  ERROR: 1 dead link found in docs/setup.md !
  [x] ./missing.md -> Status: 400
`;
    const result = buildMarkdownLinkCheckToolResult({
      command: "markdown-link-check",
      exitCode: 1,
      stdout: output,
      stderr: output,
    });

    expect(result.status).toBe("failed");
    expect(result.issues).toHaveLength(1);
    expect(result.output).toMatchObject({
      stdout: output.trim(),
      stderr: "",
      truncated: false,
    });
  });

  test("parses diagnostics split across stdout and stderr as broken links", () => {
    const result = buildMarkdownLinkCheckToolResult({
      command: "markdown-link-check",
      exitCode: 1,
      stdout: "  [x] ./missing.md -> Status: 400\n",
      stderr: "  ERROR: 1 dead link found in docs/setup.md !\n",
    });

    expect(result.status).toBe("failed");
    expect(result.summary).toBe("markdown-link-check reported 1 broken Markdown link.");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      title: "Broken Markdown link",
      path: "docs/setup.md",
      message: "./missing.md returned 400.",
    });
    expect(result.output?.stderr).toBe("");
  });

  test("checks repository Markdown files without descending into ignored output directories", () => {
    expect(MARKDOWN_LINK_CHECK_COMMAND).toContain("find .");
    expect(MARKDOWN_LINK_CHECK_COMMAND).toContain("-name node_modules");
    expect(MARKDOWN_LINK_CHECK_COMMAND).not.toContain("markdown-link-check .");
  });
});
