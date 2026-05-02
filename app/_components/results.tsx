"use client";

import { useState } from "react";
import {
  CATEGORIES,
  type CategoryRow,
  type Finding,
  FINDINGS,
  type ScanResult,
} from "./data";
import { CodeText, Icon } from "./icons";
import { ScoreRing } from "./score-ring";

type Props = {
  repo: string;
  scanResult: ScanResult | null;
  onOpenIssue: (finding: Finding) => void;
  onPropose: () => void;
  onHome: () => void;
};

const TABS = ["All", "Drift", "Duplication", "Cycles", "Complexity", "Docs"];

export function Results({ repo, scanResult, onOpenIssue, onPropose, onHome }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState("All");
  const liveFindings = scanResult ? scanResult.findings.map(toDashboardFinding) : null;
  const findings = scanResult ? (liveFindings ?? []) : FINDINGS;
  const categories = scanResult ? categoriesFromFindings(findings) : CATEGORIES;
  const overall = scanResult ? scoreFromConfidence(scanResult.mergeConfidence) : 76;
  const source = sourceLabel(scanResult);
  const criticalCount = findings.filter(
    (finding) => finding.severity === "critical" || finding.severity === "high",
  ).length;
  const summaryRows = scanResult
    ? [
        { label: "Source", value: source },
        { label: "Files scanned", value: scanResult.scannedFiles.toLocaleString() },
        { label: "Findings", value: String(scanResult.findings.length) },
        {
          label: "Tool checks",
          value: `${scanResult.toolResults.filter((tool) => tool.status !== "passed").length} / ${scanResult.toolResults.length}`,
        },
        { label: "Verdict", value: verdictLabel(scanResult.mergeConfidence) },
      ]
    : [
        { label: "Branch", value: <code className="code-pill">canary</code> },
        { label: "Commit", value: <code className="code-pill">9f4e21a</code> },
        { label: "Lines of code", value: "412,887" },
        { label: "Languages", value: "TS · JS · MDX" },
        { label: "Auto-fixable", value: <span className="text-sage-warm">31 / 52</span> },
      ];

  const filtered = tab === "All" ? findings : findings.filter((f) => f.category === tab);

  return (
    <main className="flex flex-1 flex-col py-10 pb-24">
      <div className="mx-auto w-full max-w-[1200px] px-8">
        <button
          type="button"
          onClick={onHome}
          className="mb-6 inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-[13px] text-text-soft hover:text-text"
        >
          <Icon name="arrow-left" size={14} /> <span>back to the repo input</span>
        </button>

        <div className="relative mb-12 grid items-center gap-10 overflow-hidden rounded-[14px] border border-line bg-ink-2 p-8 max-lg:grid-cols-1 max-lg:text-center lg:grid-cols-[auto_1fr_auto]">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(212,162,76,0.08),transparent_60%)]"
          />
          <div className="relative h-40 w-40 max-lg:mx-auto">
            <ScoreRing value={overall} size={160} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="font-[family-name:Fraunces,Georgia,serif] text-[64px] font-medium leading-none tabular-nums text-text">
                {overall}
              </div>
              <div className="mt-1 font-[family-name:Fraunces,Georgia,serif] text-[18px] tabular-nums tracking-[0.04em] text-text-mute">
                / 100
              </div>
            </div>
          </div>
          <div className="relative flex flex-col gap-2">
            <div className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.22em] text-text-mute">
              ★ Audit Report · #00482
            </div>
            <h2 className="m-0 font-normal font-[family-name:var(--font-display)] text-[30px] tracking-[-0.02em] [font-variation-settings:'opsz'_96,'SOFT'_50,'WONK'_1]">
              Verdict on{" "}
              <span className="font-[family-name:var(--font-mono)] text-[22px] font-medium text-text not-italic">
                {repo}
              </span>
            </h2>
            <div className="mt-1 flex flex-wrap gap-5 font-[family-name:var(--font-mono)] text-xs text-text-mute max-lg:justify-center">
              <span>
                Source: <strong className="font-medium text-text">{source}</strong>
              </span>
              <span>
                <strong className="font-medium text-text">{findings.length}</strong>{" "}
                findings
              </span>
              <span>
                <strong className="font-medium text-text">{criticalCount}</strong> high
              </span>
              <span>
                <strong className="font-medium text-text">
                  {scanResult?.scannedFiles.toLocaleString() ?? "4,128"}
                </strong>{" "}
                files scanned
              </span>
              <span>
                <strong className="font-medium text-text">
                  {scanResult ? `${scanResult.toolResults.length}` : "7"}
                </strong>{" "}
                checks
              </span>
            </div>
          </div>
          <div className="relative flex flex-col items-start gap-2 max-lg:items-center">
            <div className="self-start rounded border-[1.5px] border-gold-warm px-2.5 py-1 font-semibold font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.25em] text-gold-warm">
              {verdictLabel(scanResult?.mergeConfidence)} · Score {overall}
            </div>
            <button
              type="button"
              className="btn btn-primary btn-lg hidden"
              onClick={onPropose}
            >
              <Icon name="git-pull" size={16} /> Deputize a PR
            </button>
            <button type="button" className="btn btn-ghost btn-sm hidden">
              <Icon name="external" size={12} /> Export report
            </button>
          </div>
        </div>

        <div className="mb-10 grid grid-cols-2 gap-4 lg:grid-cols-5">
          {categories.map((c) => (
            <div
              key={c.key}
              className="relative flex flex-col gap-3.5 overflow-hidden rounded-[10px] border border-line bg-ink-2 p-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-ink-3 text-text">
                  <Icon name={c.icon} size={18} />
                </div>
                <div className="font-[family-name:var(--font-mono)] text-[11px] text-text-mute">
                  {c.issues} issues
                </div>
              </div>
              <div className="feature-soft font-[family-name:var(--font-serif)] text-[17px] font-medium tracking-[-0.01em]">
                {c.key}
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`font-[family-name:var(--font-serif)] text-[38px] font-medium leading-none tabular-nums [font-variation-settings:'opsz'_144] ${
                      c.tone === "good"
                        ? "text-sage-warm"
                        : c.tone === "bad"
                          ? "text-oxblood-soft"
                          : "text-gold-warm"
                    }`}
                  >
                    {c.score}
                  </span>
                  <span className="font-[family-name:var(--font-mono)] text-xs text-text-mute">
                    / 100
                  </span>
                </div>
                <div className="mt-2.5 h-1 overflow-hidden rounded-sm bg-ink-4">
                  <div
                    className={`h-full rounded-sm transition-[width] duration-700 ${
                      c.tone === "good"
                        ? "bg-sage-warm"
                        : c.tone === "bad"
                          ? "bg-oxblood-soft"
                          : "bg-gold-warm"
                    }`}
                    style={{ width: `${c.score}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="overflow-hidden rounded-[10px] border border-line bg-ink-2">
            <div className="flex items-center justify-between border-b border-line bg-ink-3 px-5 py-4">
              <div className="feature-soft font-[family-name:var(--font-serif)] text-[17px] font-medium">
                Findings
              </div>
              <div className="flex gap-1 font-[family-name:var(--font-mono)] text-[11px]">
                {TABS.map((t) => (
                  <button
                    type="button"
                    key={t}
                    className={`cursor-pointer rounded px-2.5 py-1 uppercase tracking-[0.08em] hover:text-text ${
                      tab === t ? "bg-ink-4 text-text" : "text-text-mute"
                    }`}
                    onClick={() => setTab(t)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {filtered.map((f) => (
              <div
                key={f.id}
                className={`border-b border-line-soft transition-colors last:border-b-0 ${
                  expanded === f.id ? "bg-ink-3" : ""
                }`}
              >
                <div className="grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-3.5">
                  <span className={`pill pill-${f.severity}`}>{f.severity}</span>
                  <div>
                    <div className="text-sm font-medium text-text">
                      <CodeText>{f.title}</CodeText>
                    </div>
                    <div className="mt-0.5 font-[family-name:var(--font-mono)] text-[11px] text-text-mute">
                      {f.path}
                    </div>
                  </div>
                  <span className="rounded border border-line px-2 py-0.5 font-[family-name:var(--font-mono)] text-[11px] text-text-soft">
                    {f.category}
                  </span>
                  <button
                    type="button"
                    aria-expanded={expanded === f.id}
                    aria-label={`${expanded === f.id ? "Hide" : "Show"} details for ${f.title}`}
                    onClick={() => setExpanded(expanded === f.id ? null : f.id)}
                    className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded border border-line bg-ink-2 text-text-mute transition hover:bg-ink-4 hover:text-text ${
                      expanded === f.id ? "rotate-90" : ""
                    }`}
                  >
                    <Icon name="chevron-right" size={14} />
                  </button>
                </div>
                {expanded === f.id && (
                  <div className="grid gap-4 px-5 pb-5">
                    <div className="rounded-md border border-line-soft bg-ink-2 p-4">
                      <div className="mb-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-text-mute">
                        Summary
                      </div>
                      <p className="m-0 text-[13px] leading-[1.6] text-text-soft">
                        <CodeText>{f.description}</CodeText>
                      </p>
                    </div>
                    {f.evidence?.length ? (
                      <div className="rounded-md border border-line-soft bg-ink-2 p-4">
                        <div className="mb-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-text-mute">
                          Evidence
                        </div>
                        <ul className="m-0 grid list-none gap-1.5 p-0 text-[12px] leading-[1.55] text-text-soft">
                          {f.evidence.map((item) => (
                            <li key={item} className="flex gap-2">
                              <span className="text-gold-warm">-</span>
                              <span>
                                <CodeText>{item}</CodeText>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {f.suggestedFix ? (
                      <div className="rounded-md border border-line-soft bg-ink-2 p-4">
                        <div className="mb-2 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-text-mute">
                          Suggested fix
                        </div>
                        <p className="m-0 text-[13px] leading-[1.6] text-text-soft">
                          <CodeText>{f.suggestedFix}</CodeText>
                        </p>
                      </div>
                    ) : null}
                    {f.id === "f1" && (
                      <div className="overflow-hidden rounded-md border border-line bg-ink-2 font-[family-name:var(--font-mono)] text-xs leading-[1.6] text-text">
                        <div className="flex justify-between border-b border-line bg-ink-3 px-3.5 py-2 text-[11px] text-text-mute">
                          <span>router-reducer.ts</span>
                          <span>line 42</span>
                        </div>
                        <pre className="m-0 overflow-x-auto whitespace-pre p-3.5">
                          <span className="block bg-oxblood/15 text-[#F2C9C5]">
                            <span className="mr-3.5 inline-block w-7 select-none text-right text-text-mute">
                              42
                            </span>
                            {
                              "import { internalRouteCache } from '../../server/internal/route-cache'"
                            }
                          </span>
                          {"\n"}
                          <span className="block bg-sage/15 text-[#C9DCB7]">
                            <span className="mr-3.5 inline-block w-7 select-none text-right text-text-mute">
                              42
                            </span>
                            {"import type { RouteCacheSnapshot } from '../router-types'"}
                          </span>
                          {"\n"}
                          <span className="block bg-sage/15 text-[#C9DCB7]">
                            <span className="mr-3.5 inline-block w-7 select-none text-right text-text-mute">
                              43
                            </span>
                            {"// Use the public RouteCacheSnapshot contract instead"}
                          </span>
                        </pre>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenIssue(f);
                        }}
                      >
                        <Icon name="search" size={12} /> Inspect
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm">
                        <Icon name="git-branch" size={12} /> Suggest fix
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm">
                        <Icon name="x" size={12} /> Mark as accepted
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="px-5 py-8 text-sm text-text-soft">
                No findings in this category.
              </div>
            )}
          </div>

          <aside className="flex flex-col gap-5">
            <div className="rounded-[10px] border border-line bg-ink-2 p-5">
              <h4 className="feature-soft m-0 mb-3.5 font-[family-name:var(--font-serif)] text-[15px] font-medium">
                Audit summary
              </h4>
              {summaryRows.map((row, i, arr) => (
                <div
                  key={row.label}
                  className={`flex items-center justify-between py-2 text-[13px] ${
                    i < arr.length - 1 ? "border-b border-line-soft" : ""
                  }`}
                >
                  <span className="text-text-soft">{row.label}</span>
                  <span className="font-medium font-[family-name:var(--font-mono)] text-text">
                    {row.value}
                  </span>
                </div>
              ))}
            </div>

            {scanResult?.toolResults.length ? (
              <div className="rounded-[10px] border border-line bg-ink-2 p-3.5">
                <h4 className="feature-soft m-0 mb-2.5 font-[family-name:var(--font-serif)] text-[13px] font-medium">
                  Tool checks
                </h4>
                {scanResult.toolResults.map((tool) => (
                  <div
                    key={tool.id}
                    className="border-b border-line-soft py-1.5 last:border-b-0 last:pb-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium text-text">
                        {tool.name}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-px font-[family-name:var(--font-mono)] text-[9px] uppercase ${
                          tool.status === "passed"
                            ? "border-sage/40 text-sage-warm"
                            : tool.status === "failed"
                              ? "border-gold/40 text-gold-warm"
                              : "border-oxblood/40 text-oxblood-soft"
                        }`}
                      >
                        {tool.status}
                      </span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[10px] leading-[1.4] text-text-soft">
                      <CodeText>{tool.summary}</CodeText>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="hidden rounded-[10px] border border-line bg-gradient-to-b from-gold/10 to-transparent p-5">
              <h4 className="feature-soft m-0 mb-3.5 flex items-center gap-2 font-[family-name:var(--font-serif)] text-[15px] font-medium">
                <Icon name="sparkle" size={14} /> Quick win
              </h4>
              <p className="m-0 mb-3 text-[13px] leading-[1.55] text-text-soft">
                Consolidating the 3 retry helpers (#f2) is a 1-file PR and resolves 8
                downstream warnings.
              </p>
              <button type="button" className="btn btn-quiet btn-sm" onClick={onPropose}>
                Open quick-win PR <Icon name="arrow-right" size={11} />
              </button>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function toDashboardFinding(finding: ScanResult["findings"][number]): Finding {
  const category = dashboardCategory(finding);
  return {
    id: finding.id,
    severity: finding.severity,
    category,
    title: finding.title,
    path: finding.files.length ? finding.files.join(" · ") : category,
    description: finding.summary,
    evidence: finding.evidence,
    files: finding.files,
    suggestedFix: finding.suggestedFix,
    impact: finding.severity === "high" ? "high" : finding.severity,
    effort: "medium",
  };
}

function sourceLabel(scanResult: ScanResult | null) {
  if (!scanResult) {
    return "Sandbox";
  }

  if (
    scanResult.repoUrl ||
    scanResult.toolResults.some(
      (tool) => tool.id === "sandbox" || tool.id === "git-clone",
    )
  ) {
    return "Sandbox";
  }

  return "Local";
}

function dashboardCategory(finding: ScanResult["findings"][number]) {
  const text = `${finding.id} ${finding.title} ${finding.category}`.toLowerCase();
  if (text.includes("duplicate") || text.includes("dupe")) {
    return "Duplication";
  }
  if (text.includes("complexity") || text.includes("health")) {
    return "Complexity";
  }
  if (text.includes("cycle")) {
    return "Cycles";
  }
  if (finding.category === "docs-drift") {
    return "Docs";
  }
  return "Drift";
}

function categoriesFromFindings(findings: Finding[]): CategoryRow[] {
  return TABS.filter((tab) => tab !== "All").map((key) => {
    const issues = findings.filter((finding) => finding.category === key);
    const highCount = issues.filter(
      (finding) => finding.severity === "critical" || finding.severity === "high",
    ).length;
    const mediumCount = issues.filter((finding) => finding.severity === "medium").length;
    const score = Math.max(
      0,
      100 - highCount * 24 - mediumCount * 12 - issues.length * 4,
    );

    return {
      key,
      icon:
        key === "Duplication"
          ? "duplicate"
          : key === "Cycles"
            ? "circular"
            : key === "Complexity"
              ? "complexity"
              : key === "Docs"
                ? "docs"
                : "drift",
      score,
      issues: issues.length,
      tone: score >= 85 ? "good" : score >= 55 ? "warn" : "bad",
    };
  });
}

function scoreFromConfidence(confidence: ScanResult["mergeConfidence"]) {
  if (confidence === "safe") {
    return 92;
  }
  if (confidence === "needs-docs-update") {
    return 74;
  }
  return 48;
}

function verdictLabel(confidence: ScanResult["mergeConfidence"] | undefined) {
  if (confidence === "safe") {
    return "Clean";
  }
  if (confidence === "needs-docs-update") {
    return "Needs Docs";
  }
  if (confidence === "needs-human-review") {
    return "Needs Review";
  }
  return "Mostly Honest";
}
