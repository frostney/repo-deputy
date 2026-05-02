import { describe, expect, test } from "bun:test";
import type { ReviewContext } from "@/lib/review/types";
import {
  analyzeLightLanguageFiles,
  buildLightLanguageToolResult,
  runLightLanguageAnalysis,
} from "./light-language";

describe("analyzeLightLanguageFiles", () => {
  test("reports Python structural complexity hotspots", () => {
    const issues = analyzeLightLanguageFiles([
      {
        path: "src/workflow.py",
        content: pythonComplexityFixture(),
      },
    ]);

    const complexity = issues.find(
      (issue) => issue.id === "light-language-python-complexity",
    );
    expect(complexity?.path).toBe("src/workflow.py");
    expect(complexity?.evidence.join("\n")).toContain("src/workflow.py:1");
    expect(complexity?.evidence.join("\n")).toContain("branch count");
  });

  test("reports Ruby structural complexity hotspots", () => {
    const issues = analyzeLightLanguageFiles([
      {
        path: "lib/workflow.rb",
        content: rubyComplexityFixture(),
      },
    ]);

    const complexity = issues.find(
      (issue) => issue.id === "light-language-ruby-complexity",
    );
    expect(complexity?.path).toBe("lib/workflow.rb");
    expect(complexity?.evidence.join("\n")).toContain("lib/workflow.rb:1");
  });

  test("reports Object Pascal structural complexity hotspots and ignores interface declarations", () => {
    const issues = analyzeLightLanguageFiles([
      {
        path: "src/workflow.pas",
        content: pascalComplexityFixture(),
      },
    ]);

    const complexity = issues.find(
      (issue) => issue.id === "light-language-pascal-complexity",
    );
    expect(complexity?.path).toBe("src/workflow.pas");
    expect(complexity?.evidence.join("\n")).toContain("src/workflow.pas:9");
    expect(complexity?.evidence.join("\n")).not.toContain("OnlyDeclared");
  });

  test("reports Java structural complexity hotspots", () => {
    const issues = analyzeLightLanguageFiles([
      {
        path: "src/Workflow.java",
        content: javaComplexityFixture(),
      },
    ]);

    const complexity = issues.find(
      (issue) => issue.id === "light-language-java-complexity",
    );
    expect(complexity?.path).toBe("src/Workflow.java");
    expect(complexity?.evidence.join("\n")).toContain("src/Workflow.java:2");
  });

  test("detects duplicate Python blocks", () => {
    const issues = analyzeLightLanguageFiles([
      { path: "src/a.py", content: pythonDuplicateFixture("alpha") },
      { path: "src/b.py", content: pythonDuplicateFixture("beta") },
    ]);

    const duplication = issues.find(
      (issue) => issue.id === "light-language-python-duplication",
    );
    expect(duplication?.evidence.join("\n")).toContain("src/a.py");
    expect(duplication?.evidence.join("\n")).toContain("src/b.py");
  });

  test("detects duplicate Ruby blocks", () => {
    const issues = analyzeLightLanguageFiles([
      { path: "lib/a.rb", content: rubyDuplicateFixture("alpha") },
      { path: "lib/b.rb", content: rubyDuplicateFixture("beta") },
    ]);

    expect(issues.map((issue) => issue.id)).toContain("light-language-ruby-duplication");
  });

  test("detects duplicate Pascal blocks", () => {
    const issues = analyzeLightLanguageFiles([
      { path: "src/a.pas", content: pascalDuplicateFixture("Alpha") },
      { path: "src/b.pas", content: pascalDuplicateFixture("Beta") },
    ]);

    expect(issues.map((issue) => issue.id)).toContain(
      "light-language-pascal-duplication",
    );
  });

  test("detects duplicate Java blocks", () => {
    const issues = analyzeLightLanguageFiles([
      { path: "src/A.java", content: javaDuplicateFixture("alpha") },
      { path: "src/B.java", content: javaDuplicateFixture("beta") },
    ]);

    expect(issues.map((issue) => issue.id)).toContain("light-language-java-duplication");
  });

  test("ignores comment-only and whitespace-only duplicate matches", () => {
    const repeatedComments = Array.from(
      { length: 12 },
      (_, index) => `# repeated comment ${index} with enough words to look long`,
    ).join("\n");

    const issues = analyzeLightLanguageFiles([
      { path: "src/a.py", content: repeatedComments },
      { path: "src/b.py", content: repeatedComments },
    ]);

    expect(issues.map((issue) => issue.id).join("\n")).not.toContain("duplication");
  });

  test("classifies Ruby basenames and extensions", () => {
    const result = buildLightLanguageToolResult({
      files: [
        { path: "Rakefile", content: rubyComplexityFixture() },
        { path: "Gemfile", content: rubyDuplicateFixture("gemfile") },
        { path: "tasks/build.rake", content: rubyDuplicateFixture("task") },
        { path: "example.gemspec", content: rubyDuplicateFixture("spec") },
      ],
    });

    expect(result.status).not.toBe("skipped");
    expect(result.summary).toContain("Ruby");
  });

  test("classifies Object Pascal extensions and Pascal-looking .inc files", () => {
    const result = buildLightLanguageToolResult({
      files: [
        { path: "src/a.pas", content: pascalDuplicateFixture("A") },
        { path: "src/b.pp", content: pascalDuplicateFixture("B") },
        { path: "src/main.lpr", content: pascalDuplicateFixture("Main") },
        { path: "src/app.dpr", content: pascalDuplicateFixture("App") },
        { path: "src/pkg.dpk", content: pascalDuplicateFixture("Pkg") },
        { path: "src/shared.inc", content: "procedure Shared;\nbegin\nend;\n" },
      ],
    });

    expect(result.status).not.toBe("skipped");
  });

  test("classifies Java source files", () => {
    const result = buildLightLanguageToolResult({
      files: [{ path: "src/Workflow.java", content: javaComplexityFixture() }],
    });

    expect(result.status).not.toBe("skipped");
    expect(result.summary).toContain("Java");
  });

  test("runs duplicate analysis separately per detected language", () => {
    const issues = analyzeLightLanguageFiles([
      { path: "src/a.py", content: pythonDuplicateFixture("alpha") },
      { path: "src/b.py", content: pythonDuplicateFixture("beta") },
      { path: "src/A.java", content: javaDuplicateFixture("alpha") },
      { path: "src/B.java", content: javaDuplicateFixture("beta") },
    ]);

    const issueIds = issues.map((issue) => issue.id);
    expect(issueIds).toContain("light-language-python-duplication");
    expect(issueIds).toContain("light-language-java-duplication");
  });

  test("does not classify generic .inc files as Pascal", () => {
    const result = buildLightLanguageToolResult({
      files: [{ path: "config/settings.inc", content: "HOST=example.test\n" }],
    });

    expect(result.status).toBe("skipped");
    expect(result.issues).toEqual([]);
  });
});

describe("runLightLanguageAnalysis", () => {
  test("does not add a tool result when no supported files exist", () => {
    const context: ReviewContext = {
      scope: "repo",
      repo: "local/repo",
      command: "scan",
      focus: "full",
      changedFiles: [
        {
          filename: "README.md",
          status: "unchanged",
          additions: 0,
          deletions: 0,
          changes: 0,
          content: "# Example\n",
        },
      ],
      docsFiles: [],
      packageJson: null,
      packageInfo: null,
      readme: null,
      envExample: null,
      memoryInsights: [],
      toolResults: [],
    };

    expect(runLightLanguageAnalysis(context)).toEqual([]);
    expect(context.toolResults).toEqual([]);
  });

  test("adds a scan-limit result when source collection skipped supported files", () => {
    const context: ReviewContext = {
      scope: "repo",
      repo: "local/repo",
      command: "scan",
      focus: "full",
      changedFiles: [],
      docsFiles: [],
      packageJson: null,
      packageInfo: null,
      readme: null,
      envExample: null,
      memoryInsights: [],
      toolResults: [],
      lightLanguageSkipped: { tooLarge: 1 },
    };

    const findings = runLightLanguageAnalysis(context);

    expect(context.toolResults[0].id).toBe("light-language-analysis");
    expect(findings.map((finding) => finding.id)).toContain("light-language-scan-limit");
  });
});

function pythonComplexityFixture() {
  return [
    "async def reconcile(value):",
    "    total = 0",
    ...Array.from(
      { length: 12 },
      (_, index) =>
        `    if value.get("flag_${index}") and value.get("ready_${index}"):\n        total += ${index}`,
    ),
    "    return total",
  ].join("\n");
}

function rubyComplexityFixture() {
  return [
    "def reconcile(value)",
    "  total = 0",
    ...Array.from(
      { length: 12 },
      (_, index) =>
        `  if value[:flag_${index}] && value[:ready_${index}]\n    total += ${index}\n  end`,
    ),
    "  total",
    "end",
  ].join("\n");
}

function pascalComplexityFixture() {
  return [
    "unit Workflow;",
    "interface",
    "procedure OnlyDeclared;",
    "implementation",
    "",
    "procedure OnlyDeclared;",
    "begin",
    "end;",
    "procedure Reconcile;",
    "begin",
    "  Total := 0;",
    ...Array.from(
      { length: 12 },
      (_, index) =>
        `  if Flag${index} and Ready${index} then\n  begin\n    Total := Total + ${index};\n  end;`,
    ),
    "end;",
    "end.",
  ].join("\n");
}

function javaComplexityFixture() {
  return [
    "public final class Workflow {",
    "  public int reconcile(Map<String, Boolean> value) {",
    "    int total = 0;",
    ...Array.from(
      { length: 12 },
      (_, index) =>
        `    if (value.get("flag_${index}") && value.get("ready_${index}")) {\n      total += ${index};\n    }`,
    ),
    "    return total;",
    "  }",
    "}",
  ].join("\n");
}

function pythonDuplicateFixture(name: string) {
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

function rubyDuplicateFixture(name: string) {
  return [
    `def ${name}`,
    "  customer_profile = load_customer_profile_with_history(account_id, region_code)",
    "  billing_profile = normalize_billing_profile_for_invoice_run(customer_profile)",
    "  usage_records = collect_usage_records_for_statement_window(customer_profile)",
    "  risk_summary = calculate_account_risk_summary_for_operations(customer_profile)",
    "  invoice_lines = build_invoice_lines_from_usage_records(usage_records)",
    "  audit_context = create_audit_context_for_finance_reconciliation(customer_profile)",
    "  publish_finance_audit_event(audit_context, billing_profile, risk_summary)",
    "  render_invoice_response(invoice_lines, billing_profile, risk_summary)",
    "end",
  ].join("\n");
}

function pascalDuplicateFixture(name: string) {
  return [
    "unit Invoice;",
    "interface",
    `procedure ${name};`,
    "implementation",
    `procedure ${name};`,
    "begin",
    "  CustomerProfile := LoadCustomerProfileWithHistory(AccountId, RegionCode);",
    "  BillingProfile := NormalizeBillingProfileForInvoiceRun(CustomerProfile);",
    "  UsageRecords := CollectUsageRecordsForStatementWindow(CustomerProfile);",
    "  RiskSummary := CalculateAccountRiskSummaryForOperations(CustomerProfile);",
    "  InvoiceLines := BuildInvoiceLinesFromUsageRecords(UsageRecords);",
    "  AuditContext := CreateAuditContextForFinanceReconciliation(CustomerProfile);",
    "  PublishFinanceAuditEvent(AuditContext, BillingProfile, RiskSummary);",
    "  RenderInvoiceResponse(InvoiceLines, BillingProfile, RiskSummary);",
    "end;",
    "end.",
  ].join("\n");
}

function javaDuplicateFixture(name: string) {
  return [
    "public final class Invoice {",
    `  public InvoiceResponse ${name}() {`,
    "    var customerProfile = loadCustomerProfileWithHistory(accountId, regionCode);",
    "    var billingProfile = normalizeBillingProfileForInvoiceRun(customerProfile);",
    "    var usageRecords = collectUsageRecordsForStatementWindow(customerProfile);",
    "    var riskSummary = calculateAccountRiskSummaryForOperations(customerProfile);",
    "    var invoiceLines = buildInvoiceLinesFromUsageRecords(usageRecords);",
    "    var auditContext = createAuditContextForFinanceReconciliation(customerProfile);",
    "    publishFinanceAuditEvent(auditContext, billingProfile, riskSummary);",
    "    return renderInvoiceResponse(invoiceLines, billingProfile, riskSummary);",
    "  }",
    "}",
  ].join("\n");
}
