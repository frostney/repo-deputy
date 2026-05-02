import { describe, expect, test } from "bun:test";
import { normalizeRepoLocator, parseSandboxLanguageSourcePayload } from "./sandbox";

describe("normalizeRepoLocator", () => {
  test("normalizes GitHub shorthand to a shallow-cloneable git URL", () => {
    expect(normalizeRepoLocator("vercel/next.js")).toEqual({
      repo: "vercel/next.js",
      repoName: "next.js",
      repoUrl: "https://github.com/vercel/next.js.git",
    });
  });

  test("normalizes HTTPS GitHub URLs", () => {
    expect(normalizeRepoLocator("https://github.com/facebook/react")).toEqual({
      repo: "facebook/react",
      repoName: "react",
      repoUrl: "https://github.com/facebook/react.git",
    });
  });
});

describe("parseSandboxLanguageSourcePayload", () => {
  test("parses valid sandbox language source JSON", () => {
    const result = parseSandboxLanguageSourcePayload({
      command: "collect language sources",
      exitCode: 0,
      stdout: JSON.stringify({
        files: [
          {
            path: "src/a.py",
            content: duplicatePythonBlock("alpha"),
            size: 512,
          },
          {
            path: "src/b.py",
            content: duplicatePythonBlock("beta"),
            size: 512,
          },
        ],
        skipped: { tooLarge: 0, unsupported: 0, totalLimit: 0, unreadable: 0 },
      }),
      stderr: "",
    });

    expect(result.id).toBe("light-language-analysis");
    expect(result.status).toBe("failed");
    expect(result.issues.map((issue) => issue.id)).toContain(
      "light-language-python-duplication",
    );
  });

  test("returns an error result for invalid sandbox language source JSON", () => {
    const result = parseSandboxLanguageSourcePayload({
      command: "collect language sources",
      exitCode: 0,
      stdout: "not json",
      stderr: "",
    });

    expect(result.status).toBe("error");
    expect(result.issues[0].id).toBe("light-language-source-collection-error");
  });

  test("reflects sandbox source collection limits in the summary", () => {
    const result = parseSandboxLanguageSourcePayload({
      command: "collect language sources",
      exitCode: 0,
      stdout: JSON.stringify({
        files: [],
        skipped: { tooLarge: 2, unsupported: 1, totalLimit: 3, unreadable: 0 },
      }),
      stderr: "",
    });

    expect(result.status).toBe("failed");
    expect(result.summary).toContain("skipped 6 files");
    expect(result.issues.map((issue) => issue.id)).toContain("light-language-scan-limit");
  });
});

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
