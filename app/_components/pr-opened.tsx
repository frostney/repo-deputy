"use client";

import { Icon, Sym } from "./icons";
import type { PullRequestDraft } from "./pr-data";

type Props = {
  repo: string;
  pr: PullRequestDraft;
  onBack: () => void;
  onView: () => void;
};

export function PROpened({ repo, pr, onBack, onView }: Props) {
  return (
    <main className="flex flex-1 items-center justify-center py-20 pb-32">
      <div className="mx-auto w-full max-w-[1200px] px-8">
        <div className="relative mx-auto w-full max-w-[720px] overflow-hidden rounded-[14px] border border-line bg-ink-2 p-10 text-center">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-[-50%] top-[-50%] h-[200%] bg-[radial-gradient(circle_at_50%_0%,rgba(212,162,76,0.18),transparent_60%)]"
          />
          <div className="relative">
            <div className="mb-4 flex justify-center">
              <div className="inline-flex -rotate-3 items-center gap-3 border-[2px] border-double border-gold bg-gold/[0.06] px-5 py-2.5 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.4em] text-gold">
                <Sym>★</Sym> DEPUTIZED <Sym>★</Sym>
              </div>
            </div>
            <div className="mb-3 font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.25em] text-gold">
              ★ ★ ★ PR Request Ready ★ ★ ★
            </div>
            <h1 className="headline-fraunces m-0 mb-3 text-[38px] font-normal font-[family-name:var(--font-display)]">
              The <em className="italic text-gold">request</em> is ready.
            </h1>
            <p className="mx-auto mb-7 max-w-[480px] text-pretty text-base leading-[1.55] text-text-soft">
              Repo Deputy prepared a draft from {pr.count} current scan findings across{" "}
              {pr.files} referenced files. No remote pull request was filed from this
              local flow.
            </p>

            <div className="mx-auto mb-7 flex max-w-[520px] items-center gap-3.5 rounded-[10px] border border-line bg-ink-3 px-5 py-4 text-left">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage/15 text-sage-warm">
                <Icon name="git-pull" size={16} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-text">{pr.title}</div>
                <div className="mt-0.5 font-[family-name:var(--font-mono)] text-[11px] text-text-mute">
                  {repo} · <code className="code-pill">{pr.branch}</code> ·{" "}
                  {pr.highestSeverity ?? "no"} severity · {pr.evidence} evidence items
                </div>
                {pr.findingIds.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pr.findingIds.slice(0, 4).map((id) => (
                      <code key={id} className="code-pill">
                        {id}
                      </code>
                    ))}
                    {pr.findingIds.length > 4 && (
                      <code className="code-pill">+{pr.findingIds.length - 4}</code>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-center gap-3">
              <button type="button" className="btn btn-ghost" onClick={onBack}>
                <Icon name="arrow-left" size={14} /> Back to audit
              </button>
              <button type="button" className="btn btn-primary" onClick={onView}>
                Audit another repo <Icon name="arrow-right" size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
