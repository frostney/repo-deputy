"use client";

import { useState } from "react";
import { CATEGORIES, type Finding, FINDINGS } from "./data";
import { CodeText, Icon } from "./icons";
import { ScoreRing } from "./score-ring";

type Props = {
  repo: string;
  onOpenIssue: (finding: Finding) => void;
  onPropose: () => void;
  onHome: () => void;
};

const TABS = ["All", "Drift", "Duplication", "Cycles", "Complexity", "Docs"];

export function Results({ repo, onOpenIssue, onPropose, onHome }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState("All");
  const overall = 76;

  const filtered = tab === "All" ? FINDINGS : FINDINGS.filter((f) => f.category === tab);

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
                <strong className="font-medium text-text">52</strong> findings
              </span>
              <span>
                <strong className="font-medium text-text">3</strong> critical
              </span>
              <span>
                <strong className="font-medium text-text">4,128</strong> files scanned
              </span>
              <span>
                <strong className="font-medium text-text">14.7s</strong> elapsed
              </span>
            </div>
          </div>
          <div className="relative flex flex-col items-start gap-2 max-lg:items-center">
            <div className="self-start rounded border-[1.5px] border-gold-warm px-2.5 py-1 font-semibold font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.25em] text-gold-warm">
              Mostly Honest · Score 76
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
          {CATEGORIES.map((c) => (
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
                    aria-label="Toggle details"
                    onClick={() => setExpanded(expanded === f.id ? null : f.id)}
                    className={`hidden cursor-pointer border-0 bg-transparent text-text-mute transition-transform ${
                      expanded === f.id ? "rotate-90" : ""
                    }`}
                  >
                    <Icon name="chevron-right" size={14} />
                  </button>
                </div>
                {expanded === f.id && (
                  <div className="hidden gap-4 px-5 pb-5">
                    <p className="m-0 text-[13px] leading-[1.6] text-text-soft">
                      <CodeText>{f.description}</CodeText>
                    </p>
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
          </div>

          <aside className="flex flex-col gap-5">
            <div className="rounded-[10px] border border-line bg-ink-2 p-5">
              <h4 className="feature-soft m-0 mb-3.5 font-[family-name:var(--font-serif)] text-[15px] font-medium">
                Audit summary
              </h4>
              {[
                {
                  label: "Branch",
                  value: <code className="code-pill">canary</code>,
                },
                {
                  label: "Commit",
                  value: <code className="code-pill">9f4e21a</code>,
                },
                { label: "Lines of code", value: "412,887" },
                { label: "Languages", value: "TS · JS · MDX" },
                {
                  label: "Auto-fixable",
                  value: <span className="text-sage-warm">31 / 52</span>,
                },
              ].map((row, i, arr) => (
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

            <div className="rounded-[10px] border border-line bg-ink-2 p-5">
              <h4 className="feature-soft m-0 mb-3.5 font-[family-name:var(--font-serif)] text-[15px] font-medium">
                Past patrols
              </h4>
              <PatrolItem
                grade="b"
                num="76"
                title="Today · canary"
                sub="52 findings · 9f4e21a"
                delta="+4"
              />
              <PatrolItem
                grade="c"
                num="72"
                title="3 days ago"
                sub="68 findings · 7c1d8b2"
                delta="−12"
              />
              <PatrolItem
                grade="c"
                num="74"
                title="Last week"
                sub="56 findings · 4a2e0c1"
                delta="−2"
                deltaDown
              />
            </div>

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

function PatrolItem({
  grade,
  num,
  title,
  sub,
  delta,
  deltaDown,
}: {
  grade: "a" | "b" | "c";
  num: string;
  title: string;
  sub: string;
  delta: string;
  deltaDown?: boolean;
}) {
  const tone =
    grade === "a"
      ? "bg-sage/15 text-sage-warm"
      : grade === "b"
        ? "bg-gold/15 text-gold"
        : "bg-rust/15 text-rust";
  return (
    <div className="flex items-center gap-3 border-b border-line-soft py-2.5 last:border-b-0 last:pb-0">
      <div
        className={`flex h-7 w-9 shrink-0 items-center justify-center rounded-full font-semibold font-[family-name:var(--font-serif)] text-sm tabular-nums ${tone}`}
      >
        {num}
      </div>
      <div className="flex-1">
        <div className="text-xs text-text">{title}</div>
        <div className="mt-0.5 font-[family-name:var(--font-mono)] text-[10px] text-text-mute">
          {sub}
        </div>
      </div>
      <div
        className={`font-[family-name:var(--font-mono)] text-[11px] ${
          deltaDown ? "text-oxblood-soft" : "text-sage-warm"
        }`}
      >
        {delta}
      </div>
    </div>
  );
}
