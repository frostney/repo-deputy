"use client";

import { useEffect } from "react";
import type { Finding } from "./data";
import { CodeText, Icon } from "./icons";

type Props = {
  issue: Finding;
  onClose: () => void;
  onPropose: (ids: string[]) => void;
};

export function IssueDetail({ issue, onClose, onPropose }: Props) {
  const evidence = issue.evidence ?? [];
  const files = issue.files?.length
    ? issue.files
    : issue.path
        .split(" · ")
        .map((path) => path.trim())
        .filter(Boolean);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const sourceUrlByPath = new Map(
    issue.sources?.map((source) => [source.path, source.url]) ?? [],
  );

  return (
    <div
      className="fade-in fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-6 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label={issue.title}
    >
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click handled at parent */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: panel stops propagation */}
      <div
        className="modal-pop flex max-h-[90vh] w-full max-w-[920px] flex-col overflow-hidden rounded-[14px] border border-line bg-ink shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7),0_2px_0_rgba(255,255,255,0.04)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-[1fr_auto] items-start gap-5 border-b border-line px-7 py-6">
          <div>
            <div className="mb-2.5 flex items-center gap-2 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-text-mute">
              <span className={`pill pill-${issue.severity}`}>{issue.severity}</span>
              <span>·</span>
              <span>{issue.category}</span>
              <span>·</span>
              <span>Finding #{issue.id.toUpperCase()}</span>
            </div>
            <h2 className="m-0 font-[family-name:var(--font-serif)] text-[28px] font-medium leading-[1.15] tracking-[-0.02em] [font-variation-settings:'opsz'_96,'SOFT'_50,'WONK'_1]">
              <CodeText>{issue.title}</CodeText>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-line bg-ink-2 text-text-soft hover:bg-ink-3 hover:text-text"
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="grid gap-7 overflow-y-auto px-7 py-6 lg:grid-cols-[1fr_240px]">
          <div>
            <Section title="What we found">
              <p className="m-0 text-pretty text-sm leading-[1.6] text-text-soft">
                <CodeText>{issue.description}</CodeText>
              </p>
            </Section>
            {evidence.length > 0 && (
              <Section title="Evidence">
                <div className="overflow-hidden rounded-md border border-line bg-ink-2 font-[family-name:var(--font-mono)] text-xs leading-[1.6] text-text">
                  {evidence.map((item) => (
                    <div
                      key={item}
                      className="border-b border-line-soft px-3.5 py-2.5 last:border-b-0"
                    >
                      <CodeText>{item}</CodeText>
                    </div>
                  ))}
                </div>
              </Section>
            )}
            {issue.sources?.length ? (
              <Section title="Source">
                <div className="grid gap-2.5">
                  {issue.sources.map((source) => (
                    <SourceExcerpt key={source.path} source={source} />
                  ))}
                </div>
              </Section>
            ) : null}
            <Section title="Why it matters">
              <p className="m-0 text-pretty text-sm leading-[1.6] text-text-soft">
                {impactText(issue)}
              </p>
            </Section>
            <Section title="Suggested fix">
              <p className="m-0 text-pretty text-sm leading-[1.6] text-text-soft">
                <CodeText>
                  {issue.suggestedFix ??
                    "Review the finding evidence, then make the smallest focused change that removes the drift."}
                </CodeText>
              </p>
            </Section>
          </div>

          <aside className="flex flex-col gap-4 border-l border-line pl-6">
            <AsideRow label="Severity">
              <span className={`uppercase ${severityTone(issue.severity)}`}>
                {issue.severity}
              </span>
            </AsideRow>
            <AsideRow label="Confidence">
              {typeof issue.confidence === "number"
                ? `${Math.round(issue.confidence * 100)}%`
                : "heuristic"}
            </AsideRow>
            <AsideRow label="Impact">{issue.impact}</AsideRow>
            <AsideRow label="Effort">{issue.effort}</AsideRow>
            <div className="flex flex-col gap-1">
              <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-text-mute">
                Files affected
              </span>
              <div className="flex flex-col gap-1">
                {files.map((f) => (
                  <IssueFileLink key={f} path={f} href={sourceUrlByPath.get(f) ?? null} />
                ))}
              </div>
            </div>
          </aside>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-7 py-4">
          <div className="font-[family-name:var(--font-mono)] text-[11px] text-text-mute">
            <Kbd>Esc</Kbd> to close · <Kbd>↵</Kbd> to deputize
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Dismiss
            </button>
            <button type="button" className="btn btn-quiet">
              Mark as accepted
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onClose();
                onPropose([issue.id]);
              }}
            >
              <Icon name="git-pull" size={14} /> Open PR for this fix
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceExcerpt({ source }: { source: NonNullable<Finding["sources"]>[number] }) {
  return (
    <details className="overflow-hidden rounded-md border border-line-soft bg-ink-2">
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2.5 text-[12px] text-text-soft marker:text-text-mute hover:text-text">
        <IssueFileLink path={source.path} href={source.url ?? null} />
        <span className="shrink-0 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-text-mute">
          lines {source.startLine}-{source.endLine}
        </span>
      </summary>
      <pre className="m-0 max-h-[320px] overflow-auto border-t border-line-soft bg-ink px-0 py-2 font-[family-name:var(--font-mono)] text-[11px] leading-[1.6] text-text-soft">
        {source.lines.map((line) => (
          <span
            key={line.number}
            className={`block px-3.5 ${
              source.line === line.number ? "bg-gold/10 text-text" : ""
            }`}
          >
            <span className="mr-3 inline-block w-8 select-none text-right text-text-mute">
              {line.number}
            </span>
            <span>{line.text || " "}</span>
          </span>
        ))}
      </pre>
    </details>
  );
}

function IssueFileLink({ path, href }: { path: string; href: string | null }) {
  const className =
    "inline-flex max-w-full items-center gap-1.5 rounded bg-ink-2 px-2 py-1 font-[family-name:var(--font-mono)] text-[11px] text-text-soft hover:text-text";

  if (!href) {
    return (
      <code className="max-w-full truncate rounded bg-ink-2 px-2 py-1 font-[family-name:var(--font-mono)] text-[11px] text-text-soft">
        {path}
      </code>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      onClick={(event) => event.stopPropagation()}
    >
      <code className="truncate">{path}</code>
      <Icon name="external" size={11} />
    </a>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h3 className="m-0 mb-2.5 font-medium font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.18em] text-text-mute">
        {title}
      </h3>
      {children}
    </div>
  );
}

function AsideRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-text-mute">
        {label}
      </span>
      <span className="font-[family-name:var(--font-mono)] text-[13px] text-text">
        {children}
      </span>
    </div>
  );
}

function impactText(issue: Finding) {
  if (issue.severity === "high" || issue.severity === "critical") {
    return "This finding is high enough risk to deserve human review before merging, especially because Repo Deputy found concrete evidence in the scanned repository.";
  }

  if (issue.category === "Duplication" || issue.category === "Complexity") {
    return "This can make future generated changes harder to keep consistent because similar logic or deeply nested paths need to be updated together.";
  }

  return "This is a repo-truthfulness signal. Fixing it keeps the codebase easier to scan, maintain, and safely change.";
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded border border-line bg-ink-3 px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] text-text-mute">
      {children}
    </span>
  );
}

function severityTone(severity: Finding["severity"]) {
  if (severity === "critical") {
    return "text-oxblood-soft";
  }
  if (severity === "high") {
    return "text-rust";
  }
  if (severity === "medium") {
    return "text-gold-warm";
  }
  return "text-slate-western";
}
