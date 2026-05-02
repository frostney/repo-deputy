"use client";

import { useMemo, useState } from "react";
import { FIX_OPTIONS } from "./data";
import { CodeText, Icon } from "./icons";

type Props = {
  repo: string;
  preselected: string[] | null;
  onBack: () => void;
  onSubmit: (pr: { count: number; files: number; branch: string; title: string }) => void;
};

export function PRCreate({ repo, preselected, onBack, onSubmit }: Props) {
  const initial = useMemo(() => {
    const defaults = ["f1", "f2", "f3", "f5"];
    const ids = preselected && preselected.length > 0 ? preselected : defaults;
    return Object.fromEntries(FIX_OPTIONS.map((f) => [f.id, ids.includes(f.id)]));
  }, [preselected]);

  const [checked, setChecked] = useState<Record<string, boolean>>(initial);
  const [title, setTitle] = useState(
    "chore: deputize · clean up drift, dupes, and stale docs",
  );
  const [branch, setBranch] = useState("repo-deputy/audit-00482");

  const toggle = (id: string) => setChecked((c) => ({ ...c, [id]: !c[id] }));
  const allOn = FIX_OPTIONS.every((f) => checked[f.id]);
  const toggleAll = () => {
    const v = !allOn;
    setChecked(Object.fromEntries(FIX_OPTIONS.map((f) => [f.id, v])));
  };

  const selected = FIX_OPTIONS.filter((f) => checked[f.id]);
  const totalFiles = selected.reduce((s, f) => s + f.files, 0);
  const linesAdded = selected.reduce((s, f) => {
    const m = f.lines.match(/\+(\d+)/);
    return s + (m ? Number.parseInt(m[1], 10) : 0);
  }, 0);
  const linesRemoved = selected.reduce((s, f) => {
    const m = f.lines.match(/[−-](\d+)/);
    return s + (m ? Number.parseInt(m[1], 10) : 0);
  }, 0);

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
          Pick which fixes to bundle. Repo Deputy will open a PR with the selected
          changes, complete with explanation, diffs, and test runs.
        </p>

        <div className="grid gap-7 lg:grid-cols-[1fr_360px]">
          <div className="overflow-hidden rounded-[10px] border border-line bg-ink-2">
            <div className="flex items-center justify-between border-b border-line bg-ink-3 px-4 py-3.5 text-[13px]">
              <div>
                <strong className="font-medium text-text">{selected.length}</strong> of{" "}
                {FIX_OPTIONS.length} fixes selected
              </div>
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 font-[family-name:var(--font-mono)] text-[11px] text-text-mute hover:text-text"
                onClick={toggleAll}
              >
                {allOn ? "Deselect all" : "Select all"}
              </button>
            </div>
            {FIX_OPTIONS.map((f) => (
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
                      {f.files} {f.files === 1 ? "file" : "files"}
                    </span>
                    <span>·</span>
                    <span>{f.lines}</span>
                  </div>
                </div>
                <div className="whitespace-nowrap rounded bg-sage/10 px-2 py-0.5 font-[family-name:var(--font-mono)] text-[11px] text-sage-warm">
                  {f.impact}
                </div>
              </button>
            ))}
          </div>

          <div className="sticky top-[92px] flex flex-col gap-3.5 self-start rounded-[10px] border border-line bg-ink-2 p-5">
            <h4 className="feature-soft m-0 font-[family-name:var(--font-serif)] text-[17px] font-medium">
              Pull request preview
            </h4>
            <SummaryRow label="Fixes" value={`${selected.length}`} />
            <SummaryRow label="Files changed" value={`${totalFiles}`} />
            <SummaryRow label="Lines added" value={`+${linesAdded}`} tone="green" />
            <SummaryRow label="Lines removed" value={`−${linesRemoved}`} tone="red" />
            <SummaryRow label="Score after" value="B+ → A−" tone="green" />

            <div className="flex flex-col gap-2.5 border-t border-line-soft pt-3.5">
              <Field label="Branch">
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
                  onChange={(e) => setTitle(e.target.value)}
                />
              </Field>
              <Field label="Reviewers">
                <input
                  className="w-full rounded-md border border-line bg-ink-3 px-2.5 py-2 font-[family-name:var(--font-mono)] text-xs text-text outline-none focus:border-gold"
                  defaultValue="@maintainers"
                />
              </Field>
              <label className="mt-1 flex items-center gap-2 text-xs text-text-soft">
                <input type="checkbox" defaultChecked /> Run CI before opening
              </label>
              <label className="flex items-center gap-2 text-xs text-text-soft">
                <input type="checkbox" defaultChecked /> Mark as draft
              </label>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-lg mt-1.5 w-full"
              disabled={selected.length === 0}
              onClick={() =>
                onSubmit({
                  count: selected.length,
                  files: totalFiles,
                  branch,
                  title,
                })
              }
            >
              <Icon name="git-pull" size={14} /> Open pull request
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
