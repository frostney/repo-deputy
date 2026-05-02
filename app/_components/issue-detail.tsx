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
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

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
            <Section title="Why it matters">
              <p className="m-0 text-pretty text-sm leading-[1.6] text-text-soft">
                Architectural boundaries exist so client code can be bundled, tree-shaken,
                and shipped without dragging server-only modules along for the ride.
                Reaching across this boundary{" "}
                <strong className="font-medium text-text">
                  increases bundle size by ~14kb
                </strong>
                , breaks the static analysis that powers route splitting, and creates a
                load-order trap where edge runtimes will fail at cold start.
              </p>
            </Section>
            <Section title="Suggested fix">
              <div className="overflow-hidden rounded-md border border-line bg-ink-2 font-[family-name:var(--font-mono)] text-xs leading-[1.6] text-text">
                <div className="flex justify-between border-b border-line bg-ink-3 px-3.5 py-2 text-[11px] text-text-mute">
                  <span>packages/next/src/client/components/router-reducer.ts</span>
                  <span>2 changes</span>
                </div>
                <pre className="m-0 overflow-x-auto whitespace-pre p-3.5">
                  <span className="block bg-oxblood/15 text-[#F2C9C5]">
                    <Gutter>42</Gutter>
                    {
                      "import { internalRouteCache } from '../../server/internal/route-cache'"
                    }
                  </span>
                  {"\n"}
                  <span className="block bg-sage/15 text-[#C9DCB7]">
                    <Gutter>42</Gutter>
                    {"import type { RouteCacheSnapshot } from '../router-types'"}
                  </span>
                  {"\n"}
                  <span className="block">
                    <Gutter>43</Gutter>
                  </span>
                  {"\n"}
                  <span className="block bg-oxblood/15 text-[#F2C9C5]">
                    <Gutter>87</Gutter>
                    {"  const cache = internalRouteCache.get(key)"}
                  </span>
                  {"\n"}
                  <span className="block bg-sage/15 text-[#C9DCB7]">
                    <Gutter>87</Gutter>
                    {"  const cache = ctx.routeCache.get(key) as RouteCacheSnapshot"}
                  </span>
                </pre>
              </div>
            </Section>
            <Section title="Related findings">
              <p className="m-0 text-pretty text-sm leading-[1.6] text-text-soft">
                Two other modules import from{" "}
                <code className="code-pill">server/internal/*</code>. Resolving #F1
                unlocks the same fix for #F8 and #F23.
              </p>
            </Section>
          </div>

          <aside className="flex flex-col gap-4 border-l border-line pl-6">
            <AsideRow label="Severity">
              <span className="uppercase text-oxblood-soft">Critical</span>
            </AsideRow>
            <AsideRow label="Confidence">96%</AsideRow>
            <AsideRow label="Effort">~15 min</AsideRow>
            <AsideRow label="Auto-fixable">
              <span className="text-sage-warm">Yes</span>
            </AsideRow>
            <div className="flex flex-col gap-1">
              <span className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.18em] text-text-mute">
                Files affected
              </span>
              <div className="flex flex-col gap-1">
                {["router-reducer.ts", "router-types.ts", "route-cache.ts"].map((f) => (
                  <div
                    key={f}
                    className="rounded bg-ink-2 px-2 py-1 font-[family-name:var(--font-mono)] text-[11px] text-text-soft"
                  >
                    <code>{f}</code>
                  </div>
                ))}
              </div>
            </div>
            <AsideRow label="First detected">3 days ago</AsideRow>
            <AsideRow label="Introduced by">PR #58231</AsideRow>
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

function Gutter({ children }: { children: React.ReactNode }) {
  return (
    <span className="mr-3.5 inline-block w-7 select-none text-right text-text-mute">
      {children}
    </span>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded border border-line bg-ink-3 px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] text-text-mute">
      {children}
    </span>
  );
}
