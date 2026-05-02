import { describe, expect, test } from "bun:test";
import { parseMarkdownLinkCheckIssues, parseMarkdownlintIssues } from "./markdown-tools";

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
});
