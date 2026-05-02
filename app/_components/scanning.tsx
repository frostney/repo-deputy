"use client";

import { useEffect, useState } from "react";
import { CodeText, Icon, Sym } from "./icons";
import { LOG_LINES, SCAN_CHECKS } from "./data";

type Props = {
  repo: string;
  onComplete: () => void;
};

export function Scanning({ repo, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [pct, setPct] = useState(0);
  const [logIdx, setLogIdx] = useState(0);

  useEffect(() => {
    if (step >= SCAN_CHECKS.length) {
      const t = setTimeout(() => onComplete(), 700);
      return () => clearTimeout(t);
    }
    const dur = SCAN_CHECKS[step].duration;
    const start = Date.now();
    const totalDur = SCAN_CHECKS.reduce((s, c) => s + c.duration, 0);
    const before = SCAN_CHECKS.slice(0, step).reduce((s, c) => s + c.duration, 0);
    const tick = setInterval(() => {
      const local = Math.min(1, (Date.now() - start) / dur);
      setPct(Math.min(100, ((before + dur * local) / totalDur) * 100));
    }, 60);
    const advance = setTimeout(() => setStep((s) => s + 1), dur);
    return () => {
      clearInterval(tick);
      clearTimeout(advance);
    };
  }, [step, onComplete]);

  useEffect(() => {
    const i = setInterval(() => setLogIdx((x) => Math.min(x + 1, LOG_LINES.length)), 950);
    return () => clearInterval(i);
  }, []);

  const stateOf = (i: number): "done" | "active" | "pending" =>
    i < step ? "done" : i === step ? "active" : "pending";
  const visibleLogs = LOG_LINES.slice(0, logIdx).slice(-5);

  return (
    <main className="flex flex-1 flex-col py-16 pb-24">
      <div className="mx-auto w-full max-w-[1200px] px-8">
        <div className="mb-12 text-center">
          <div className="mb-5 inline-flex items-center gap-2.5 rounded-full border border-line bg-ink-2 px-4 py-2 font-[family-name:var(--font-mono)] text-[13px] text-text">
            <Sym>◆</Sym>
            <code className="rounded border border-line-soft bg-ink-3 px-1.5 py-px text-[0.92em]">
              {repo}
            </code>
          </div>
          <h1 className="headline-fraunces m-0 mb-3 text-[clamp(34px,4.8vw,48px)] font-normal font-[family-name:var(--font-display)]">
            Deputizing the <em className="italic text-gold">codebase</em>…
          </h1>
          <div className="text-base text-text-soft">
            Hold tight. We're reading every file twice.
          </div>
        </div>

        <div className="mx-auto flex max-w-[820px] flex-col items-center gap-10">
          <div className="relative mx-auto flex h-[300px] w-[300px] max-w-full items-center justify-center">
            <svg
              viewBox="-50 -50 100 100"
              className="spin-slow block h-full w-full drop-shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
              role="img"
              aria-label="Sheriff's badge spinning while scanning"
            >
              <title>Scanning badge</title>
              <defs>
                <radialGradient id="badgeGlow" cx="0" cy="0" r="50">
                  <stop
                    offset="0%"
                    stopColor="var(--color-gold-warm)"
                    stopOpacity="0.45"
                  />
                  <stop offset="60%" stopColor="var(--color-gold)" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0" />
                </radialGradient>
              </defs>
              <circle cx="0" cy="0" r="46" fill="url(#badgeGlow)" />
              <polygon
                points="0,-44 11,-14 42,-14 17,5 26,35 0,16 -26,35 -17,5 -42,-14 -11,-14"
                fill="var(--color-gold)"
                stroke="var(--color-gold-warm)"
                strokeWidth="0.8"
                strokeLinejoin="round"
              />
              <polygon
                points="0,-30 7.5,-9.5 28,-9.5 11.5,3 17.5,23 0,11 -17.5,23 -11.5,3 -28,-9.5 -7.5,-9.5"
                fill="none"
                stroke="rgba(0,0,0,0.35)"
                strokeWidth="0.8"
                strokeLinejoin="round"
              />
              <circle cx="0" cy="0" r="3.2" fill="rgba(0,0,0,0.4)" />
            </svg>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1">
              <div className="absolute h-[120px] w-[120px] rounded-full border border-line bg-ink shadow-[0_4px_18px_-6px_rgba(0,0,0,0.35),inset_0_0_0_6px_var(--color-ink)]" />
              <div className="relative z-[1] font-[family-name:var(--font-serif)] text-[44px] font-medium leading-none tabular-nums text-text [font-variation-settings:'opsz'_144]">
                {Math.round(pct)}%
              </div>
              <div className="relative z-[1] font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.25em] text-text-mute">
                Auditing
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-[10px] border border-line bg-ink-2">
            {SCAN_CHECKS.map((c, i) => {
              const st = stateOf(i);
              return (
                <div
                  key={c.id}
                  className={`flex items-center gap-3.5 border-b border-line-soft px-5 py-4 transition-all last:border-b-0 ${
                    st === "pending" ? "opacity-45" : st === "active" ? "bg-ink-3" : ""
                  }`}
                >
                  <div
                    className={`w-[22px] shrink-0 font-[family-name:var(--font-mono)] text-[11px] tracking-[0.1em] ${
                      st === "active" ? "text-gold" : "text-text-mute"
                    }`}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                      st === "done"
                        ? "bg-sage/15 text-sage-warm"
                        : st === "active"
                          ? "bg-gold/15 text-gold"
                          : "bg-ink-4 text-text-mute"
                    }`}
                  >
                    {st === "done" ? (
                      <Icon name="check" size={14} />
                    ) : st === "active" ? (
                      <span className="scan-spinner-mono" />
                    ) : (
                      <Sym>◆</Sym>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-text">{c.name}</div>
                    <div className="mt-0.5 font-[family-name:var(--font-mono)] text-[11px] text-text-mute">
                      {c.meta}
                    </div>
                  </div>
                  <div
                    className={`font-[family-name:var(--font-display)] text-sm italic tracking-[0.02em] ${
                      st === "done"
                        ? "text-sage-warm"
                        : st === "active"
                          ? "text-gold"
                          : "text-text-mute"
                    }`}
                  >
                    {st === "done"
                      ? "rounded up"
                      : st === "active"
                        ? "on patrol"
                        : "in line"}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="relative mx-auto mt-8 h-[130px] max-w-[820px] overflow-hidden rounded-[10px] border border-line bg-ink-2 px-5 py-4 font-[family-name:var(--font-mono)] text-xs text-text-soft">
            {visibleLogs.map((l, i) => (
              <div key={l.text} className="leading-[1.7]">
                <span className="mr-2.5 text-text-mute">
                  {new Date(Date.now() - (visibleLogs.length - i) * 850)
                    .toTimeString()
                    .slice(0, 8)}
                </span>
                <span
                  className={`mr-1.5 ${
                    l.t === "ok"
                      ? "text-sage-warm"
                      : l.t === "warn"
                        ? "text-gold-warm"
                        : l.t === "err"
                          ? "text-oxblood-soft"
                          : "text-gold"
                  }`}
                >
                  {l.t === "err"
                    ? "ERR"
                    : l.t === "warn"
                      ? "WARN"
                      : l.t === "ok"
                        ? "OK "
                        : "INF"}
                </span>
                <span
                  className={
                    l.t === "ok"
                      ? "text-sage-warm"
                      : l.t === "warn"
                        ? "text-gold-warm"
                        : l.t === "err"
                          ? "text-oxblood-soft"
                          : "text-text-soft"
                  }
                >
                  <CodeText>{l.text}</CodeText>
                </span>
              </div>
            ))}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-b from-transparent to-ink-2"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
