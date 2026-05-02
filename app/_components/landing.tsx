"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import { Icon, type IconName, Sym } from "./icons";

type Props = {
  onAudit: (repo: string) => void;
};

const SAMPLE_REPOS = ["vercel/next.js", "facebook/react", "honojs/hono"];

const FEATURES: Array<{
  num: string;
  icon: IconName;
  title: string;
  desc: string;
}> = [
  {
    num: "01",
    icon: "duplicate",
    title: "Duplication",
    desc: "Catches near-identical functions, copy-pasted blocks, and parallel implementations.",
  },
  {
    num: "02",
    icon: "drift",
    title: "Drift",
    desc: "Flags new code that violates established architectural patterns and module boundaries.",
  },
  {
    num: "03",
    icon: "circular",
    title: "Cycles",
    desc: "Detects circular imports and dependency loops before they become a hairball.",
  },
  {
    num: "04",
    icon: "complexity",
    title: "Complexity",
    desc: "Hot-spots cyclomatic complexity, deep nesting, and functions that grow past their welcome.",
  },
  {
    num: "05",
    icon: "docs",
    title: "Docs",
    desc: "Verifies README, docstrings, and ADRs match what the code actually does.",
  },
];

export function Landing({ onAudit }: Props) {
  const [url, setUrl] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onAudit(url.trim() || "vercel/next.js");
  };

  return (
    <main className="flex flex-1 flex-col pt-20 pb-32">
      <div className="mx-auto w-full max-w-[880px] px-8">
        <div className="mx-auto mb-14 grid max-w-[880px] items-center gap-8 text-left sm:grid-cols-[minmax(150px,212px)_minmax(0,1fr)] sm:gap-10">
          <div className="w-[168px] sm:w-[212px]">
            <Image
              src="/deputy.png"
              alt="Repo Deputy holding a code audit report"
              width={500}
              height={500}
              priority
              sizes="(min-width: 640px) 212px, 168px"
              className="h-auto w-full object-contain drop-shadow-[0_18px_28px_rgba(0,0,0,0.35)]"
            />
          </div>
          <div>
            <h1 className="headline-fraunces m-0 mb-6 text-[clamp(40px,5.4vw,64px)] font-normal font-[family-name:var(--font-display)]">
              Keep your repo <em className="italic text-gold">honest</em>
              <br />
              after the AI rides through.
            </h1>
            <p className="max-w-[560px] text-pretty text-[19px] leading-[1.55] text-text-soft">
              Repo Deputy audits any GitHub repository for duplication, architectural
              drift, circular dependencies, complexity, and stale documentation — then
              deputizes a pull request to clean it up.
            </p>
          </div>
        </div>

        <form className="relative mx-auto max-w-[680px]" onSubmit={submit}>
          <div className="flex items-center gap-3 rounded-[14px] border border-line bg-ink-2 py-2 pr-2 pl-5 shadow-[0_1px_0_rgba(255,255,255,0.03),0_12px_32px_-12px_rgba(0,0,0,0.6)] transition-all focus-within:border-gold focus-within:ring-4 focus-within:ring-gold/15">
            <span className="shrink-0 text-text-mute">
              <Icon name="github" size={16} />
            </span>
            <input
              type="text"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="github.com/owner/repo  —  paste a URL to deputize"
              className="min-w-0 flex-1 border-0 bg-transparent py-3.5 font-[family-name:var(--font-mono)] text-[15px] text-text outline-none placeholder:text-text-mute"
            />
            <button type="submit" className="btn btn-primary shrink-0">
              Run audit <Icon name="arrow-right" size={14} />
            </button>
          </div>

          <div className="mt-[18px] flex flex-wrap items-center justify-center gap-3">
            <span className="font-[family-name:var(--font-mono)] text-[11px] uppercase tracking-[0.15em] text-text-mute">
              — or audit a known repo —
            </span>
            {SAMPLE_REPOS.map((repo) => (
              <button
                type="button"
                key={repo}
                onClick={() => {
                  setUrl(repo);
                  onAudit(repo);
                }}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-ink-2 px-3 py-1.5 font-[family-name:var(--font-mono)] text-xs text-text-soft transition-all hover:border-gold hover:text-gold"
              >
                <span className="inline-block w-[1ch] text-center align-[-0.05em] font-[family-name:var(--font-mono)] text-gold leading-none">
                  ◆
                </span>{" "}
                {repo}
              </button>
            ))}
          </div>
        </form>

        <div className="mx-auto mt-16 flex max-w-[760px] -rotate-[0.4deg] items-center gap-5 rounded-md bg-paper py-[18px] px-7 font-[family-name:var(--font-serif)] text-ink shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)] relative">
          <span
            aria-hidden
            className="absolute -top-1.5 left-[30px] h-[30px] w-[30px] -rotate-[8deg] rounded bg-black/15"
          />
          <span
            aria-hidden
            className="absolute -top-1.5 right-[30px] h-[30px] w-[30px] rotate-[6deg] rounded bg-black/15"
          />
          <div>
            <div className="font-semibold font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.3em] text-oxblood">
              <Sym>★</Sym> Wanted <Sym>★</Sym>
            </div>
            <div className="poster-soft text-[28px] font-semibold leading-none tracking-[-0.01em]">
              Code that drifts in the night
            </div>
            <div className="mt-0.5 font-[family-name:var(--font-mono)] text-[11px] text-black/60">
              Last seen: in your last AI-assisted PR · Reward: a clean diff
            </div>
          </div>
          <div className="flex-1" />
          <div className="hidden text-right">
            <div className="text-[32px] font-semibold leading-none text-oxblood">
              12,847
            </div>
            <div className="mt-1 font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.2em] text-black/50">
              Repos patrolled
            </div>
          </div>
        </div>

        <div className="mt-[72px] flex items-center justify-center gap-3 font-[family-name:var(--font-mono)] text-xs tracking-[0.3em] text-text-mute">
          <span aria-hidden className="max-w-20 flex-1 border-t border-line" />
          <Sym>✦</Sym> the deputy's duties <Sym>✦</Sym>
          <span aria-hidden className="max-w-20 flex-1 border-t border-line" />
        </div>

        <div className="mt-24 grid grid-cols-1 border-y border-line sm:grid-cols-2 lg:grid-cols-5">
          {FEATURES.map((feature, index) => (
            <div
              key={feature.num}
              className={`flex flex-col gap-2.5 px-6 py-7 ${
                index < FEATURES.length - 1 ? "lg:border-r lg:border-line" : ""
              } ${index < FEATURES.length - 1 ? "max-sm:border-b max-sm:border-line" : ""} ${
                index % 2 === 0 && index < 4
                  ? "sm:max-lg:border-r sm:max-lg:border-line"
                  : ""
              }`}
            >
              <div className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.1em] text-text-mute">
                N
                <span className="inline-block w-[1ch] text-center align-[-0.05em] font-[family-name:var(--font-mono)] leading-none">
                  º
                </span>{" "}
                {feature.num}
              </div>
              <div className="feature-soft flex items-center gap-2 font-[family-name:var(--font-serif)] text-lg font-medium tracking-[-0.01em]">
                <Icon name={feature.icon} size={16} /> {feature.title}
              </div>
              <div className="text-[13px] leading-[1.5] text-text-soft">
                {feature.desc}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
