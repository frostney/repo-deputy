"use client";

import { useEffect, useMemo, useState } from "react";
import type { ScanResult } from "./data";
import { CodeText, Icon } from "./icons";
import {
  buildFixOptions,
  buildPullRequestDraft,
  defaultPrBranch,
  defaultPrTitle,
  defaultSelectedFixIds,
  highestSeverity,
  type FixOption,
  type PullRequestDraft,
} from "./pr-data";

type Props = {
  repo: string;
  scanResult: ScanResult | null;
  preselected: string[] | null;
  onBack: () => void;
  onSubmit: (pr: PullRequestDraft) => void;
};

export function PRCreate({ repo, scanResult, preselected, onBack, onSubmit }: Props) {
  const fixOptions = useMemo(() => buildFixOptions(scanResult), [scanResult]);
  const initial = useMemo(
    () => checkedFromPreselection(fixOptions, preselected),
    [fixOptions, preselected],
  );

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [title, setTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [branch, setBranch] = useState("");

  useEffect(() => {
    setChecked(initial);
    setTitle(defaultPrTitle(fixOptions.filter((option) => initial[option.id])));
    setTitleEdited(false);
    setBranch(defaultPrBranch(repo, scanResult));
  }, [fixOptions, initial, repo, scanResult]);

  const toggle = (id: string) => setChecked((c) => ({ ...c, [id]: !c[id] }));
  const allOn = fixOptions.length > 0 && fixOptions.every((f) => checked[f.id]);
  const toggleAll = () => {
    const v = !allOn;
    setChecked(Object.fromEntries(fixOptions.map((f) => [f.id, v])));
  };

  const selected = useMemo(
    () => fixOptions.filter((f) => checked[f.id]),
    [fixOptions, checked],
  );
  const selectedFileCount = new Set(selected.flatMap((option) => option.files)).size;
  const evidenceCount = selected.reduce((sum, option) => sum + option.evidenceCount, 0);
  const selectedHighestSeverity = highestSeverity(selected);

  useEffect(() => {
    if (!titleEdited) {
      setTitle(defaultPrTitle(selected));
    }
  }, [selected, titleEdited]);

  return (
    <main className="flex flex-1 flex-col py-10 pb-24">
      <div className="mx-auto w-full max-w-[1200px] px-8">
        <div className="mb-8 flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-[13px] text-text-soft hover:text-text"
          >
            <Icon name="arrow-left" size={14} /> Back to audit
          </button>
          <div className="font-[family-name:var(--font-mono)] text-xs text-text-mute">
            <Icon
              name="github"
              size={12}
              style={{ verticalAlign: "-2px", marginRight: 6 }}
            />
            {repo}
          </div>
        </div>

        <h1 className="headline-fraunces m-0 mb-2 text-[34px] font-normal font-[family-name:var(--font-display)]">
          Deputize a <em className="italic text-gold">pull request</em>
        </h1>
        <p className="mb-6 text-[15px] text-text-soft">
          Pick which current scan findings to bundle into a PR request. The draft below is
          built from this scan's findings, files, and evidence.
        </p>

        <div className="grid gap-7 lg:grid-cols-[1fr_360px]">
          <div className="overflow-hidden rounded-[10px] border border-line bg-ink-2">
            <div className="flex items-center justify-between border-b border-line bg-ink-3 px-4 py-3.5 text-[13px]">
              <div>
                <strong className="font-medium text-text">{selected.length}</strong> of{" "}
                {fixOptions.length} findings selected
              </div>
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 font-[family-name:var(--font-mono)] text-[11px] text-text-mute hover:text-text"
                onClick={toggleAll}
              >
                {allOn ? "Deselect all" : "Select all"}
              </button>
            </div>
            {fixOptions.map((f) => (
              <button
                type="button"
                key={f.id}
                onClick={() => toggle(f.id)}
                className={`grid w-full cursor-pointer grid-cols-[auto_1fr_auto] items-start gap-3.5 border-b border-line-soft px-4 py-4 text-left transition-colors last:border-b-0 hover:bg-ink-3 ${
                  checked[f.id] ? "bg-gold/5" : ""
                }`}
              >
                <div
                  className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border-[1.5px] transition-all ${
                    checked[f.id] ? "border-gold bg-gold text-ink" : "border-text-mute"
                  }`}
                >
                  {checked[f.id] && <Icon name="check" size={12} strokeWidth={3} />}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-medium text-text">
                    <CodeText>{f.title}</CodeText>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5 font-[family-name:var(--font-mono)] text-[11px] text-text-mute">
                    <span className={`pill pill-${f.severity}`}>{f.severity}</span>
                    <span>{f.category}</span>
                    <span>·</span>
                    <span>
                      {f.fileCount} {f.fileCount === 1 ? "file" : "files"}
                    </span>
                    <span>·</span>
                    <span>
                      {f.evidenceCount}{" "}
                      {f.evidenceCount === 1 ? "evidence item" : "evidence items"}
                    </span>
                  </div>
                </div>
                <div className="whitespace-nowrap rounded bg-sage/10 px-2 py-0.5 font-[family-name:var(--font-mono)] text-[11px] text-sage-warm">
                  {confidenceLabel(f)}
                </div>
              </button>
            ))}
            {fixOptions.length === 0 && (
              <div className="px-5 py-8 text-sm text-text-soft">
                No current scan findings are available for a PR request.
              </div>
            )}
          </div>

          <div className="sticky top-[92px] flex flex-col gap-3.5 self-start rounded-[10px] border border-line bg-ink-2 p-5">
            <h4 className="feature-soft m-0 font-[family-name:var(--font-serif)] text-[17px] font-medium">
              PR request
            </h4>
            <SummaryRow label="Fixes" value={`${selected.length}`} />
            <SummaryRow label="Files referenced" value={`${selectedFileCount}`} />
            <SummaryRow label="Evidence items" value={`${evidenceCount}`} />
            <SummaryRow
              label="Highest severity"
              value={selectedHighestSeverity ?? "none"}
              tone={
                selectedHighestSeverity === "critical" ||
                selectedHighestSeverity === "high"
                  ? "red"
                  : undefined
              }
            />
            <SummaryRow
              label="Scan verdict"
              value={scanResult?.mergeConfidence ?? "unavailable"}
            />

            <div className="flex flex-col gap-2.5 border-t border-line-soft pt-3.5">
              <Field label="Proposed branch">
                <input
                  className="w-full rounded-md border border-line bg-ink-3 px-2.5 py-2 font-[family-name:var(--font-mono)] text-xs text-text outline-none focus:border-gold"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                />
              </Field>
              <Field label="Title">
                <input
                  className="w-full rounded-md border border-line bg-ink-3 px-2.5 py-2 font-[family-name:var(--font-mono)] text-xs text-text outline-none focus:border-gold"
                  value={title}
                  onChange={(e) => {
                    setTitleEdited(true);
                    setTitle(e.target.value);
                  }}
                />
              </Field>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-lg mt-1.5 w-full"
              disabled={selected.length === 0}
              onClick={() =>
                onSubmit(
                  buildPullRequestDraft({
                    options: fixOptions,
                    selectedIds: selected.map((option) => option.id),
                    scanResult,
                    branch,
                    title,
                  }),
                )
              }
            >
              <Icon name="git-pull" size={14} /> Prepare PR request
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

function SummaryRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "green" | "red";
}) {
  return (
    <div className="flex justify-between text-[13px]">
      <span className="text-text-soft">{label}</span>
      <span
        className={`font-medium font-[family-name:var(--font-mono)] ${
          tone === "green"
            ? "text-sage-warm"
            : tone === "red"
              ? "text-oxblood-soft"
              : "text-text"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.16em] text-text-mute">
        {label}
      </div>
      {children}
    </div>
  );
}

function checkedFromPreselection(options: FixOption[], preselected: string[] | null) {
  const validIds = new Set(options.map((option) => option.id));
  const requested = preselected?.filter((id) => validIds.has(id)) ?? [];
  const selectedIds = requested.length ? requested : defaultSelectedFixIds(options);
  const selected = new Set(selectedIds);

  return Object.fromEntries(
    options.map((option) => [option.id, selected.has(option.id)]),
  );
}

function confidenceLabel(option: FixOption) {
  if (option.confidence === null) {
    return `${option.evidenceCount} evidence`;
  }

  return `${Math.round(option.confidence * 100)}% confidence`;
}
