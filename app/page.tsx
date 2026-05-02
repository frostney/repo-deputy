import { runRepoScan } from "@/lib/scan/repo";

export const dynamic = "force-dynamic";

export default async function Home() {
  const result = await runRepoScan({ focus: "full", useMemory: false });
  const findings = result.report.findings;
  const highCount = findings.filter((finding) => finding.severity === "high").length;
  const docsCount = findings.filter(
    (finding) => finding.category === "docs-drift",
  ).length;
  const codeCount = findings.filter(
    (finding) => finding.category !== "docs-drift",
  ).length;

  return (
    <main className="shell">
      <section className="hero" aria-labelledby="page-title">
        <p className="eyebrow">Whole-repo scanner</p>
        <h1 id="page-title">Repo Deputy</h1>
        <p className="lede">
          Scans the repository for docs drift, env docs gaps, duplicate generated code,
          dependency drift, route naming drift, and architecture truthfulness.
        </p>
      </section>

      <section className="summary-band" aria-label="Current scan summary">
        <div>
          <p className="metric-label">Merge confidence</p>
          <p className="metric-value">
            {formatConfidence(result.report.mergeConfidence)}
          </p>
        </div>
        <div>
          <p className="metric-label">Files scanned</p>
          <p className="metric-value">{result.context.changedFiles.length}</p>
        </div>
        <div>
          <p className="metric-label">Findings</p>
          <p className="metric-value">{findings.length}</p>
        </div>
        <div>
          <p className="metric-label">High risk</p>
          <p className="metric-value">{highCount}</p>
        </div>
      </section>

      <section className="status-grid" aria-label="Repo Deputy scan channels">
        <div className="status-block accent-green">
          <h2>App endpoint</h2>
          <code>/api/scan</code>
          <p>Returns JSON for the current repository scan.</p>
        </div>

        <div className="status-block accent-blue">
          <h2>MCP command</h2>
          <code>bun run mcp</code>
          <p>Starts the local stdio MCP server for agent workflows.</p>
        </div>

        <div className="status-block accent-amber">
          <h2>Current mix</h2>
          <p>
            {docsCount} docs drift / {codeCount} code or architecture drift
          </p>
        </div>
      </section>

      <section className="findings-section" aria-labelledby="findings-title">
        <div className="section-heading">
          <p className="eyebrow">Scan report</p>
          <h2 id="findings-title">Current findings</h2>
        </div>

        {findings.length === 0 ? (
          <p className="empty-state">
            No repo truthfulness drift found by the deterministic scanner.
          </p>
        ) : (
          <div className="finding-list">
            {findings.slice(0, 8).map((finding) => (
              <article className="finding" key={finding.id}>
                <div className="finding-header">
                  <span className={`severity severity-${finding.severity}`}>
                    {finding.severity}
                  </span>
                  <span className="category">{finding.category.replace("-", " ")}</span>
                </div>
                <h3>{finding.title}</h3>
                <p>{finding.summary}</p>
                <ul>
                  {finding.files.slice(0, 4).map((file) => (
                    <li key={file}>
                      <code>{file}</code>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="footer">
        Powered by Next.js, Vercel AI Gateway, Mubit, MCP, and Bun
      </footer>
    </main>
  );
}

function formatConfidence(value: string) {
  return value
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
