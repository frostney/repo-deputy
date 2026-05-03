"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { ApiToolResult, LogLine, ScanCheck, ScanResult } from "./data";
import { CodeText, Icon, Sym } from "./icons";
import { SCAN_CHECKS } from "./data";

const SPLIT_SCAN_TOOLS = ["fallow", "markdownlint", "markdown-link-check"] as const;

type LightLanguage = "python" | "ruby" | "pascal" | "java";
type SplitScanTool =
  | (typeof SPLIT_SCAN_TOOLS)[number]
  | `light-language-${LightLanguage}`;

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
  const [scanChecks, setScanChecks] = useState<ScanCheck[]>(SCAN_CHECKS);
  const logLines = scanResult
    ? resultLogLines(repo, scanResult)
    : progressLogLines(repo, step, scanChecks);

  useEffect(() => {
    if (step >= scanChecks.length) {
      setPct(100);
      return;
    }
    const dur = currentStepDuration(scanChecks, step);
    const start = Date.now();
    const totalDur = scanChecks.reduce((s, _c, index) => {
      if (
        isParallelToolStep(scanChecks, index) &&
        index > parallelToolStart(scanChecks)
      ) {
        return s;
      }
      return s + currentStepDuration(scanChecks, index);
    }, 0);
    const before = scanChecks.slice(0, step).reduce((s, _c, index) => {
      if (
        isParallelToolStep(scanChecks, index) &&
        index > parallelToolStart(scanChecks)
      ) {
        return s;
      }
      return s + currentStepDuration(scanChecks, index);
    }, 0);
    const tick = setInterval(() => {
      const local = Math.min(1, (Date.now() - start) / dur);
      setPct(Math.min(100, ((before + dur * local) / totalDur) * 100));
    }, 60);
    const advance = setTimeout(() => setStep((s) => nextScanStep(scanChecks, s)), dur);
    return () => {
      clearInterval(tick);
      clearTimeout(advance);
    };
  }, [scanChecks, step]);

  useEffect(() => {
    const controller = new AbortController();

    async function scan() {
      try {
        setScanResult(await runSplitScan(repo, controller.signal, setScanChecks));
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

    setStep(scanChecks.length);
    setPct(100);
  }, [scanChecks.length, scanDone]);

  useEffect(() => {
    if (step < scanChecks.length || !scanDone || !scanResult) {
      return;
    }

    const timer = setTimeout(() => onComplete(scanResult), 700);
    return () => clearTimeout(timer);
  }, [scanChecks.length, step, scanDone, scanResult, onComplete]);

  useEffect(() => {
    const i = setInterval(() => setLogIdx((x) => Math.min(x + 1, logLines.length)), 700);
    return () => clearInterval(i);
  }, [logLines.length]);

  const failedStep = scanResult ? failedStepIndex(scanResult, scanChecks) : null;
  const stateOf = (i: number): "done" | "active" | "pending" | "error" => {
    if (failedStep !== null) {
      if (i < failedStep) {
        return "done";
      }
      return i === failedStep ? "error" : "pending";
    }

    if (isParallelToolStep(scanChecks, step)) {
      const start = parallelToolStart(scanChecks);
      const end = parallelToolEnd(scanChecks);
      if (i < start) {
        return "done";
      }
      if (i >= start && i <= end) {
        return "active";
      }
      return "pending";
    }

    if (isParallelToolStep(scanChecks, i) && step > parallelToolEnd(scanChecks)) {
      return "done";
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
            {scanChecks.map((c, i) => {
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

type SplitScanSession = {
  repo: string;
  repoName?: string;
  focus: "docs" | "code" | "full";
  revision?: string;
  scannedFiles?: number;
  lineStats?: ScanResult["lineStats"];
  languageFiles?: Partial<Record<LightLanguage, number>>;
  sandbox?: {
    repoUrl: string;
    cloneDepth: number;
    revision?: string;
    commit?: string;
    sandboxId?: string;
  };
};

type SplitScanSessionResponse = {
  session: SplitScanSession;
  toolResults: ApiToolResult[];
  tools: SplitScanTool[];
  ready: boolean;
};

async function runSplitScan(
  repo: string,
  signal: AbortSignal,
  onToolsDiscovered: (checks: ScanCheck[]) => void,
): Promise<ScanResult> {
  let session: SplitScanSession | null = null;
  const toolResults: ApiToolResult[] = [];

  try {
    const sessionResponse = await postJson<SplitScanSessionResponse>(
      "/api/scan/session",
      {
        repo,
        focus: "full",
        ai: false,
      },
      signal,
    );

    session = sessionResponse.session;
    toolResults.push(...sessionResponse.toolResults);
    const tools = sessionResponse.ready
      ? sessionResponse.tools.length
        ? sessionResponse.tools
        : [...SPLIT_SCAN_TOOLS]
      : [];
    onToolsDiscovered(buildScanChecks(tools));

    if (sessionResponse.ready) {
      const analyzerResults = await Promise.all(
        tools.map(async (tool) => {
          try {
            const response = await postJson<{ toolResult: ApiToolResult }>(
              "/api/scan/tool",
              {
                sandboxId: session?.sandbox?.sandboxId,
                tool,
              },
              signal,
            );
            return response.toolResult;
          } catch (error) {
            if (signal.aborted) {
              throw error;
            }
            return scanToolRequestError(tool, error);
          }
        }),
      );
      toolResults.push(...analyzerResults);
    }

    return postJson<ScanResult>(
      "/api/scan/report",
      {
        session,
        toolResults,
        ai: false,
      },
      signal,
    );
  } catch (error) {
    if (session && signal.aborted) {
      void fetch("/api/scan/stop", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ sandboxId: session.sandbox?.sandboxId }),
        keepalive: true,
      });
    } else if (session) {
      await postJson(
        "/api/scan/stop",
        {
          sandboxId: session.sandbox?.sandboxId,
        },
        signal,
      ).catch(() => undefined);
    }

    throw error;
  }
}

async function postJson<T>(
  path: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(
      readScanErrorMessage(payload) ?? `${path} failed with ${response.status}`,
    );
  }

  return (await response.json()) as T;
}

function readScanErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as { error?: unknown; summary?: unknown; message?: unknown };
  if (typeof record.error === "string" && record.error) {
    return record.error;
  }
  if (typeof record.summary === "string" && record.summary) {
    return record.summary;
  }
  if (typeof record.message === "string" && record.message) {
    return record.message;
  }

  return null;
}

function scanToolRequestError(tool: SplitScanTool, error: unknown): ApiToolResult {
  const message = error instanceof Error ? error.message : String(error);
  const meta = scanToolMeta(tool);

  return {
    id: tool,
    name: meta.name,
    command: `POST /api/scan/tool ${tool}`,
    status: "error",
    exitCode: null,
    summary: `${meta.name} request failed: ${message}`,
    issues: [
      {
        id: `${tool}-request-failed`,
        title: `${meta.name} request failed`,
        severity: "medium",
        category: "code-drift",
        message,
        evidence: [message],
        suggestedFix: "Rerun the scan. If it still fails, check sandbox availability.",
      },
    ],
  };
}

function scanToolMeta(tool: SplitScanTool) {
  switch (tool) {
    case "fallow":
      return { name: "Fallow" };
    case "light-language-python":
      return { name: "Python analysis" };
    case "light-language-ruby":
      return { name: "Ruby analysis" };
    case "light-language-pascal":
      return { name: "Object Pascal analysis" };
    case "light-language-java":
      return { name: "Java analysis" };
    case "markdownlint":
      return { name: "markdownlint-cli2" };
    case "markdown-link-check":
      return { name: "markdown-link-check" };
  }
}

function buildScanChecks(tools: SplitScanTool[]): ScanCheck[] {
  return [
    ...SCAN_CHECKS.slice(0, 3),
    ...tools.map(toolToScanCheck),
    SCAN_CHECKS[SCAN_CHECKS.length - 1],
  ];
}

function toolToScanCheck(tool: SplitScanTool): ScanCheck {
  switch (tool) {
    case "fallow":
      return {
        id: "fallow",
        name: "Running Fallow",
        meta: "dead code · duplication · complexity",
        duration: 1800,
      };
    case "light-language-python":
      return {
        id: tool,
        name: "Checking Python",
        meta: "complexity · duplication",
        duration: 1300,
      };
    case "light-language-ruby":
      return {
        id: tool,
        name: "Checking Ruby",
        meta: "complexity · duplication",
        duration: 1300,
      };
    case "light-language-pascal":
      return {
        id: tool,
        name: "Checking Object Pascal",
        meta: "complexity · duplication",
        duration: 1300,
      };
    case "light-language-java":
      return {
        id: tool,
        name: "Checking Java",
        meta: "complexity · duplication",
        duration: 1300,
      };
    case "markdownlint":
      return {
        id: "markdownlint",
        name: "Linting Markdown",
        meta: "markdownlint-cli2",
        duration: 1400,
      };
    case "markdown-link-check":
      return {
        id: "markdown-link-check",
        name: "Checking Markdown links",
        meta: "markdown-link-check",
        duration: 1400,
      };
  }
}

function currentStepDuration(checks: ScanCheck[], step: number) {
  if (!isParallelToolStep(checks, step)) {
    return checks[step]?.duration ?? 0;
  }

  const start = parallelToolStart(checks);
  const end = parallelToolEnd(checks);
  return Math.max(...checks.slice(start, end + 1).map((check) => check.duration));
}

function nextScanStep(checks: ScanCheck[], step: number) {
  if (isParallelToolStep(checks, step)) {
    return parallelToolEnd(checks) + 1;
  }

  return step + 1;
}

function isParallelToolStep(checks: ScanCheck[], step: number) {
  const start = parallelToolStart(checks);
  const end = parallelToolEnd(checks);
  return start >= 0 && step >= start && step <= end;
}

function parallelToolStart(checks: ScanCheck[]) {
  return checks.findIndex((check) => isAnalyzerToolId(check.id));
}

function parallelToolEnd(checks: ScanCheck[]) {
  const reportIndex = checks.findIndex((check) => check.id === "report");
  return reportIndex > 0 ? reportIndex - 1 : checks.length - 1;
}

function isAnalyzerToolId(id: string) {
  return (
    id === "fallow" ||
    id.startsWith("light-language-") ||
    id === "markdownlint" ||
    id === "markdown-link-check"
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
        command: "POST /api/scan/session",
        status: "error",
        exitCode: null,
        summary: message,
        issues: [],
      },
    ],
  };
}

function progressLogLines(
  repo: string,
  step: number,
  scanChecks: ScanCheck[],
): LogLine[] {
  const visibleEnd = isParallelToolStep(scanChecks, step)
    ? parallelToolEnd(scanChecks) + 1
    : Math.min(step + 1, scanChecks.length);
  const visibleChecks = scanChecks.slice(0, visibleEnd);

  return [
    {
      t: "info",
      text: `Starting split sandbox scan for ${repo}`,
    },
    ...visibleChecks.map((check, index) => ({
      t:
        index < step || (isParallelToolStep(scanChecks, step) && index < step)
          ? ("ok" as const)
          : ("info" as const),
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
      text: `Sandbox request for ${result.repoUrl ?? repo}`,
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

function failedStepIndex(result: ScanResult, scanChecks: ScanCheck[]) {
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
  const toolIndex = scanChecks.findIndex((check) => check.id === failedTool.id);
  if (toolIndex >= 0) {
    return toolIndex;
  }

  return scanChecks.length - 1;
}
