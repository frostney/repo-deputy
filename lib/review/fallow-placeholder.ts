import type { Finding, ReviewContext } from "@/lib/review/types";

export async function runFallowAnalysis(context: ReviewContext): Promise<Finding[]> {
  if (context.scope === "repo") {
    return [];
  }

  const architectureDocs = context.docsFiles.filter((file) =>
    /architecture|conventions|adr/i.test(file.path),
  );
  const serverBoundaryChanged = context.changedFiles.some((file) =>
    /^lib\/(?:ai|memory|server)\//.test(file.filename),
  );
  const clientChanged = context.changedFiles.some(
    (file) => /\.(tsx|jsx)$/.test(file.filename) && /component|app\//.test(file.filename),
  );

  if (!architectureDocs.length || !serverBoundaryChanged || !clientChanged) {
    return [];
  }

  return [
    {
      id: "fallow-placeholder-architecture-convention",
      category: "architecture-drift",
      severity: "low",
      title: "Architecture convention may need a focused follow-up",
      summary:
        "This placeholder detected server-boundary and client component changes near architecture docs.",
      evidence: [
        "Server-side library files changed.",
        "Client-facing component files changed.",
        "Architecture or convention docs exist.",
      ],
      files: [
        ...context.changedFiles
          .filter((file) => /^lib\/|^app\//.test(file.filename))
          .map((file) => file.filename),
        ...architectureDocs.map((file) => file.path),
      ].slice(0, 8),
      suggestedFix:
        "Manually verify the documented architecture boundaries still match the changed code.",
      confidence: 0.55,
    },
  ];
}
