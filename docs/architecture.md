# Architecture

Repo Deputy is organized around whole-repository scanning with two user-facing
surfaces: the Next.js app and a local stdio MCP server.

## Runtime Shape

```txt
Next.js app or MCP tool
  -> lib/scan/repo.ts
  -> local repository file collection or depth-1 Vercel Sandbox git checkout
  -> optional Mubit memory read
  -> deterministic docs/code drift checks or sandbox tool checks
  -> Vercel AI Gateway report generation or deterministic fallback
  -> optional Mubit memory write
  -> dashboard, JSON, or MCP tool response
```

## Module Responsibilities

### `app/page.tsx`

Renders the dashboard from a live scan of the current repository. It is an
operational view, not a marketing page or generic code review surface.

### `app/api/scan/route.ts`

Runs a scan and returns JSON:

- `repo`
- `rootPath`
- `scannedFiles`
- `mergeConfidence`
- `summary`
- `findings`
- `markdown`
- `memoryUsed`
- `toolResults`

It supports `?focus=docs`, `?focus=code`, `?focus=full`, `?ai=false`, and
`?memory=true`. Passing `?repo=owner/repo` or a public git URL switches to the
Vercel Sandbox scan path.

### `lib/scan/`

Collects local repository context and orchestrates scans:

- Walks the repository with size and directory limits.
- Creates Vercel Sandbox depth-1 git checkouts for remote `repoUrl` scans.
- Reads text-like source, docs, config, and example files.
- Builds a `ReviewContext` with `scope: "repo"`.
- Runs deterministic checks for the selected focus.
- Runs Fallow, markdownlint, and markdown-link-check for sandbox scans.
- Calls report generation or deterministic fallback.
- Writes sanitized memory when memory is enabled.

The scanner ignores generated and dependency directories such as `.git`,
`.next`, `coverage`, `dist`, `node_modules`, and `out`.

### `lib/review/`

Owns product intelligence:

- Shared review and finding types.
- Docs drift checks.
- Code drift checks.
- Real Fallow JSON adapter and external tool result parsing.
- Markdown lint and Markdown link-check parsing.
- Vercel AI Gateway report generation.
- GitHub Flavored Markdown rendering.
- Seeded fallback findings for demo viability.

### `lib/mcp/`

Provides local agent/tool integration:

- `repo_deputy_scan_repo` scans a local repository path.
- `repo_deputy_check_drift` runs deterministic checks against supplied fixtures.
- `repo_deputy_render_report` renders markdown from a report-shaped payload.
- `repo_deputy_demo_scan` returns seeded demo findings.
- `repo_deputy_parse_command` keeps a small legacy command parser available.

The scan tool defaults to no AI Gateway and no Mubit writes unless the caller
explicitly opts in.

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
