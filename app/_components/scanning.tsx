"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { LogLine, ScanResult } from "./data";
import { CodeText, Icon, Sym } from "./icons";
import { SCAN_CHECKS } from "./data";

type Props = {
  repo: string;
  onComplete: (result: ScanResult) => void;
};

export function Scanning({ repo, onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [pct, setPct] = useState(0);
  const [logIdx, setLogIdx] = useState(0);
  const [scanDone, setScanDone] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const logLines = scanResult
    ? resultLogLines(repo, scanResult)
    : progressLogLines(repo, step);

  useEffect(() => {
    if (step >= SCAN_CHECKS.length) {
      setPct(100);
      return;
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
  }, [step]);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({
      repo,
      focus: "full",
      ai: "false",
      memory: "false",
    });

    async function scan() {
      try {
        const response = await fetch(`/api/scan?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(
            readScanErrorMessage(payload) ??
              `Scan request failed with ${response.status}`,
          );
        }
        setScanResult((await response.json()) as ScanResult);
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        setScanResult(scanErrorResult(repo, error));
      } finally {
        if (!controller.signal.aborted) {
          setScanDone(true);
        }
      }
    }

    scan();
    return () => controller.abort();
  }, [repo]);

  useEffect(() => {
    if (!scanDone) {
      return;
    }

    setStep(SCAN_CHECKS.length);
    setPct(100);
  }, [scanDone]);

  useEffect(() => {
    if (step < SCAN_CHECKS.length || !scanDone || !scanResult) {
      return;
    }

    const timer = setTimeout(() => onComplete(scanResult), 700);
    return () => clearTimeout(timer);
  }, [step, scanDone, scanResult, onComplete]);

  useEffect(() => {
    const i = setInterval(() => setLogIdx((x) => Math.min(x + 1, logLines.length)), 700);
    return () => clearInterval(i);
  }, [logLines.length]);

  const failedStep = scanResult ? failedStepIndex(scanResult) : null;
  const stateOf = (i: number): "done" | "active" | "pending" | "error" => {
    if (failedStep !== null) {
      if (i < failedStep) {
        return "done";
      }
      return i === failedStep ? "error" : "pending";
    }

    return i < step ? "done" : i === step ? "active" : "pending";
  };
  const visibleLogs = logLines.slice(0, Math.max(logIdx, 1)).slice(-5);

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
            {scanDone
              ? scanResult?.summary
              : "Starting an isolated shallow checkout and audit run."}
          </div>
        </div>

        <div className="mx-auto flex max-w-[820px] flex-col items-center gap-10">
          <div className="relative mx-auto flex h-[300px] w-[300px] max-w-full items-center justify-center">
            <Image
              src="/star.png"
              alt=""
              width={1254}
              height={1254}
              sizes="300px"
              className="spin-slow absolute inset-0 h-full w-full object-contain drop-shadow-[0_14px_24px_rgba(0,0,0,0.3)]"
            />
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
                        : st === "error"
                          ? "bg-oxblood/15 text-oxblood-soft"
                          : st === "active"
                            ? "bg-gold/15 text-gold"
                            : "bg-ink-4 text-text-mute"
                    }`}
                  >
                    {st === "done" ? (
                      <Icon name="check" size={14} />
                    ) : st === "error" ? (
                      <Icon name="x" size={14} />
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
                        : st === "error"
                          ? "text-oxblood-soft"
                          : st === "active"
                            ? "text-gold"
                            : "text-text-mute"
                    }`}
                  >
                    {st === "done"
                      ? "rounded up"
                      : st === "error"
                        ? "blocked"
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

function scanErrorResult(repo: string, error: unknown): ScanResult {
  const message = error instanceof Error ? error.message : String(error);

  return {
    repo,
    scannedFiles: 0,
    mergeConfidence: "needs-human-review",
    summary: message,
    findings: [],
    markdown: "",
    toolResults: [
      {
        id: "scan-request",
        name: "Scan request",
        command: "GET /api/scan",
        status: "error",
        exitCode: null,
        summary: message,
        issues: [],
      },
    ],
  };
}

function readScanErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as { summary?: unknown; message?: unknown };
  if (typeof record.summary === "string" && record.summary) {
    return record.summary;
  }
  if (typeof record.message === "string" && record.message) {
    return record.message;
  }

  return null;
}

function progressLogLines(repo: string, step: number): LogLine[] {
  const visibleChecks = SCAN_CHECKS.slice(0, Math.min(step + 1, SCAN_CHECKS.length));

  return [
    {
      t: "info",
      text: `Requesting sandbox scan for ${repo}`,
    },
    ...visibleChecks.map((check, index) => ({
      t: index < step ? ("ok" as const) : ("info" as const),
      text: `${index < step ? "✓" : "→"} ${check.name} · ${check.meta}`,
    })),
  ];
}

function resultLogLines(repo: string, result: ScanResult): LogLine[] {
  const lines: LogLine[] = [
    {
      t: result.toolResults.some(
        (tool) => tool.id === "sandbox" && tool.status === "error",
      )
        ? "err"
        : "ok",
      text: result.repoUrl
        ? `Sandbox request for ${result.repoUrl}`
        : `Local scan for ${repo}`,
    },
  ];

  for (const tool of result.toolResults) {
    lines.push({
      t:
        tool.status === "passed"
          ? "ok"
          : tool.status === "failed"
            ? "warn"
            : tool.status === "skipped"
              ? "info"
              : "err",
      text: `${tool.name}: ${tool.summary}`,
    });
  }

  lines.push({
    t: result.mergeConfidence === "safe" ? "ok" : "warn",
    text: `Report ready · ${result.findings.length} finding${
      result.findings.length === 1 ? "" : "s"
    }`,
  });

  return lines;
}

function failedStepIndex(result: ScanResult) {
  const failedTool = result.toolResults.find((tool) => tool.status === "error");

  if (!failedTool) {
    return null;
  }

  if (failedTool.id === "sandbox" || failedTool.id === "scan-request") {
    return 0;
  }
  if (failedTool.id === "git-clone") {
    return 1;
  }
  if (failedTool.id === "sandbox-bun-setup") {
    return 2;
  }
  if (failedTool.id === "fallow") {
    return 3;
  }
  if (failedTool.id === "markdownlint") {
    return 4;
  }
  if (failedTool.id === "markdown-link-check") {
    return 5;
  }

  return SCAN_CHECKS.length - 1;
}
