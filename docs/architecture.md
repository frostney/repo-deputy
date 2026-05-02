# Architecture

Repo Deputy is organized around whole-repository scanning with two user-facing
surfaces: the Next.js app and a local stdio MCP server.

## Runtime Shape

```txt
Next.js app or MCP tool
  -> lib/scan/repo.ts
  -> depth-1 Vercel Sandbox git checkout
  -> optional Mubit memory read
  -> deterministic docs/code drift checks or sandbox tool checks
  -> Vercel AI Gateway report generation or deterministic fallback
  -> optional Mubit memory write
  -> dashboard, JSON, or MCP tool response
```

## Module Responsibilities

### `app/page.tsx`

Renders the dashboard for a live sandbox scan of a public repository. It is an
operational view, not a marketing page or generic code review surface.

### `app/api/scan/*`

The app-facing scan API is split into phases while reusing one sandbox:

- `POST /api/scan/session` starts the sandbox, clones the repo, prepares Bun,
  and returns a session with the sandbox id plus initial `toolResults`.
- `POST /api/scan/tool` runs one analyzer against that existing sandbox.
- `POST /api/scan/report` accepts the accumulated `toolResults`, generates the
  final report, and stops the sandbox.
- `POST /api/scan/stop` releases an abandoned session best-effort.

The final report response includes:

- `repo`
- `scannedFiles`
- `mergeConfidence`
- `summary`
- `findings`
- `markdown`
- `memoryUsed`
- `toolResults`

### `app/api/stats/route.ts`

Returns scan counters for the dashboard: completed scan runs, unique
repositories scanned, total scanned files, and recent repository totals. In
production these counters are backed by the existing Mubit integration. When
Mubit is not configured, stats are unavailable and Repo Deputy does not write a
local fallback counter.

### `lib/scan/`

Orchestrates sandbox scans:

- Requires a public `repoUrl`.
- Creates Vercel Sandbox depth-1 git checkouts.
- Exposes session, per-tool, report-finalization, and cleanup helpers so API
  phases can share one sandbox.
- Runs Fallow, detected lightweight Python/Ruby/Object Pascal/Java analyzers,
  markdownlint, and markdown-link-check for sandbox scans.
- Calls report generation or deterministic fallback.
- Does not read arbitrary local filesystem paths.

### `lib/review/`

Owns product intelligence:

- Shared review and finding types.
- Docs drift checks.
- Code drift checks.
- Real Fallow JSON adapter and external tool result parsing.
- In-process lightweight Python/Ruby/Object Pascal/Java complexity and duplication
  analysis that does not require language runtimes.
- Markdown lint and Markdown link-check parsing.
- Vercel AI Gateway report generation.
- GitHub Flavored Markdown rendering.
- Seeded fallback findings for demo viability.

### `lib/mcp/`

Provides local agent/tool integration:

- `repo_deputy_scan_repo` scans a public repository in Vercel Sandbox.
- `repo_deputy_check_drift` runs deterministic checks against supplied fixtures.
- `repo_deputy_render_report` renders markdown from a report-shaped payload.
- `repo_deputy_demo_scan` returns seeded demo findings.
- `repo_deputy_parse_command` keeps a small legacy command parser available.

The scan tool defaults to no AI Gateway. It does not write Mubit memory.

### `lib/memory/`

Keeps optional operational repo memory:

- `repo-memory.ts` selects Mubit or fallback memory.
- `mubit.ts` uses `@mubit-ai/sdk` when enabled.
- `fallback-memory.ts` provides a safe in-process fallback.

Mubit failures are logged server-side and never fail the scan.

## AI Boundary

All model calls go through:

```ts
import { gateway } from "@ai-sdk/gateway";
```

Repo Deputy does not import provider-specific SDKs and does not use direct
provider API calls.

The model receives deterministic findings and optional memory insights. It must
not invent files, issues, or findings from memory alone.
