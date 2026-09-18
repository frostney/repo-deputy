import type { Finding, FindingSource } from "./data";
import { CodeText, Icon } from "./icons";
import type { ReactNode } from "react";

export type EvidenceFileRef = {
  path: string;
  line?: number;
  endLine?: number;
  label: string;
};

export type EvidenceMetrics = {
  score: number;
  label: "Strong" | "Moderate" | "Light";
  items: number;
  files: number;
  lineRefs: number;
  sourceLines: number;
};

type EvidenceItemProps = {
  finding: Finding;
  text: string;
  hrefForRef: (ref: EvidenceFileRef) => string | null;
  showSource?: boolean;
};

export function EvidenceItem({
  finding,
  text,
  hrefForRef,
  showSource = false,
}: EvidenceItemProps) {
  const source = showSource ? sourceForEvidence(text, finding) : null;

  return (
    <div className="border-b border-line-soft px-3.5 py-2.5 last:border-b-0">
      <div className="flex gap-2">
        <span className="text-gold-warm">-</span>
        <span className="min-w-0">
          <EvidenceText finding={finding} text={text} hrefForRef={hrefForRef} />
        </span>
      </div>
      {source ? <SourceSnippet source={source} /> : null}
    </div>
  );
}

export function EvidenceMeter({ metrics }: { metrics: EvidenceMetrics }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded border border-line bg-ink-3 px-2 py-1 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.08em] text-text-soft">
      Evidence <strong className="font-semibold text-text">{metrics.score}</strong>
      <span className="text-text-mute">{metrics.label}</span>
    </span>
  );
}

export function evidenceMetricsForFinding(finding: Finding): EvidenceMetrics {
  const evidence = finding.evidence?.filter(Boolean) ?? [];
  const paths = knownEvidencePaths(finding);
  const refs = evidence.flatMap((item) => evidenceFileRefsForText(item, finding));
  const lineRefs = refs.filter((ref) => typeof ref.line === "number").length;
  const sourceLines =
    finding.sources?.reduce(
      (sum, source) => sum + Math.max(0, source.endLine - source.startLine + 1),
      0,
    ) ?? 0;
  const confidence =
    typeof finding.confidence === "number" && Number.isFinite(finding.confidence)
      ? finding.confidence
      : 0.5;
  const severity =
    finding.severity === "critical"
      ? 1
      : finding.severity === "high"
        ? 0.85
        : finding.severity === "medium"
          ? 0.6
          : 0.38;
  const evidenceBreadth = Math.min(1, evidence.length / 4);
  const fileCoverage = paths.length > 0 ? Math.min(1, refs.length / paths.length) : 0;
  const sourceDepth = Math.min(1, sourceLines / 18);
  const linePrecision = refs.length > 0 ? lineRefs / refs.length : 0;
  const score = Math.round(
    100 *
      (confidence * 0.34 +
        evidenceBreadth * 0.2 +
        fileCoverage * 0.16 +
        sourceDepth * 0.18 +
        linePrecision * 0.08 +
        severity * 0.04),
  );

  return {
    score: clampScore(score),
    label: score >= 80 ? "Strong" : score >= 60 ? "Moderate" : "Light",
    items: evidence.length,
    files: paths.length,
    lineRefs,
    sourceLines,
  };
}

export function weightedFindingPenalty(finding: Finding) {
  const metrics = evidenceMetricsForFinding(finding);
  const severityBase =
    finding.severity === "critical"
      ? 42
      : finding.severity === "high"
        ? 30
        : finding.severity === "medium"
          ? 17
          : 8;
  const confidence =
    typeof finding.confidence === "number" && Number.isFinite(finding.confidence)
      ? finding.confidence
      : 0.65;
  const evidenceMultiplier = 0.55 + metrics.score / 200;
  const confidenceMultiplier = 0.7 + confidence * 0.3;

  return severityBase * evidenceMultiplier * confidenceMultiplier;
}

export function evidenceFileRefsForText(
  text: string,
  finding: Finding,
): EvidenceFileRef[] {
  const refs: Array<EvidenceFileRef & { start: number; end: number }> = [];

  for (const path of knownEvidencePaths(finding).sort((a, b) => b.length - a.length)) {
    const escapedPath = escapeRegExp(path);
    const pattern = new RegExp(
      `(^|[^A-Za-z0-9_./-])(${escapedPath})(?::(\\d+)(?:-(\\d+))?)?`,
      "g",
    );

    for (const match of text.matchAll(pattern)) {
      const prefix = match[1] ?? "";
      const start = (match.index ?? 0) + prefix.length;
      const lineText = match[3];
      const endLineText = match[4];
      const end = start + match[0].length - prefix.length;
      if (refs.some((ref) => rangesOverlap(start, end, ref.start, ref.end))) {
        continue;
      }
      refs.push({
        path,
        line: lineText ? Number(lineText) : undefined,
        endLine: endLineText ? Number(endLineText) : undefined,
        label: text.slice(start, end),
        start,
        end,
      });
    }
  }

  return refs
    .sort((a, b) => a.start - b.start)
    .map(({ start: _start, end: _end, ...ref }) => ref);
}

function EvidenceText({
  finding,
  text,
  hrefForRef,
}: {
  finding: Finding;
  text: string;
  hrefForRef: (ref: EvidenceFileRef) => string | null;
}) {
  const refs = evidenceFileRefsForText(text, finding);
  if (refs.length === 0) {
    return <CodeText>{text}</CodeText>;
  }

  let cursor = 0;
  const nodes: ReactNode[] = [];
  refs.forEach((ref) => {
    const start = text.indexOf(ref.label, cursor);
    const end = start + ref.label.length;
    const href = hrefForRef(ref);

    if (start > cursor) {
      nodes.push(
        <CodeText key={`text-${cursor}-${start}`}>{text.slice(cursor, start)}</CodeText>,
      );
    }

    nodes.push(
      href ? (
        <a
          key={`ref-${ref.label}-${start}-${end}`}
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex max-w-full items-center gap-1 rounded border border-line bg-ink-3 px-1.5 py-px font-[family-name:var(--font-mono)] text-[0.92em] text-text hover:border-text-mute"
        >
          <code className="truncate">{ref.label}</code>
          <Icon name="external" size={10} />
        </a>
      ) : (
        <code
          key={`ref-${ref.label}-${start}-${end}`}
          className="rounded border border-line-soft bg-ink-3 px-1.5 py-px font-[family-name:var(--font-mono)] text-[0.92em] text-text"
        >
          {ref.label}
        </code>
      ),
    );
    cursor = end;
  });

  if (cursor < text.length) {
    nodes.push(<CodeText key="text-tail">{text.slice(cursor)}</CodeText>);
  }

  return <>{nodes}</>;
}

function SourceSnippet({ source }: { source: FindingSource }) {
  return (
    <div className="mt-2 overflow-hidden rounded-md border border-line-soft bg-ink font-[family-name:var(--font-mono)] text-[11px] leading-[1.55] text-text-soft">
      <div className="flex items-center justify-between gap-3 border-b border-line-soft bg-ink-2 px-3 py-1.5">
        {source.url ? (
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1 text-text-soft hover:text-text"
          >
            <code className="truncate">{source.path}</code>
            <Icon name="external" size={10} />
          </a>
        ) : (
          <code className="min-w-0 truncate text-text-soft">{source.path}</code>
        )}
        <span className="shrink-0 text-[10px] uppercase tracking-[0.12em] text-text-mute">
          lines {source.startLine}-{source.endLine}
        </span>
      </div>
      <pre className="m-0 max-h-[300px] overflow-auto px-0 py-2">
        {source.lines.map((line) => (
          <span
            key={line.number}
            className={`block px-3 ${
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
    </div>
  );
}

function sourceForEvidence(text: string, finding: Finding) {
  const refs = evidenceFileRefsForText(text, finding);
  const sources = finding.sources ?? [];
  const refSource = refs
    .map((ref) => sources.find((source) => source.path === ref.path))
    .find((source): source is FindingSource => Boolean(source));

  if (refSource) {
    return refSource;
  }

  return sources.length === 1 ? sources[0] : null;
}

function knownEvidencePaths(finding: Finding) {
  return [
    ...new Set([
      ...(finding.files ?? []),
      ...(finding.sources?.map((source) => source.path) ?? []),
    ]),
  ].filter(Boolean);
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function clampScore(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
