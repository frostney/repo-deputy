# App and MCP Flow

Repo Deputy scans the whole repository instead of waiting for an external
comment or event.

## App Flow

1. The user opens `/`.
2. `app/page.tsx` calls `runRepoScan({ focus: "full", useMemory: false })`.
3. `lib/scan/repo.ts` reads the current repository checkout.
4. The scanner builds a repo-wide review context.
5. Deterministic docs and code drift checks run.
6. The report is generated through Vercel AI Gateway when configured, otherwise
   deterministic fallback reporting is used.
7. The dashboard renders merge confidence, counts, and current findings.

## JSON API Flow

1. The user or tool calls `/api/scan?focus=full`.
2. The route parses the focus value.
3. The route runs `runRepoScan({ focus, useAi, useMemory })`.
4. The response returns scan metadata, findings, markdown, memory insights, and
   any external `toolResults`.

`memory=true` is required before the GET endpoint writes repo memory.

For remote repository scans, pass `repo=owner/repo` or a public git URL:

```txt
/api/scan?repo=vercel/next.js&focus=full&ai=false
```

That path creates a Vercel Sandbox with a depth-1 git source checkout, runs
Fallow, lightweight Python/Ruby/Object Pascal/Java analysis, markdownlint, and
markdown-link-check, then returns the parsed tool results and lifted Repo
Deputy findings. Local scans do not require Vercel Sandbox credentials.

## MCP Flow

1. The user starts the server with `bun run mcp`.
2. An MCP client calls `repo_deputy_scan_repo`.
3. The tool scans `rootPath` or the MCP server working directory.
4. By default the tool uses deterministic reporting only.
5. If `useAi` is true and `AI_GATEWAY_API_KEY` exists, the report summary can use
   Vercel AI Gateway.
6. If `useMemory` is true and Mubit is configured, repo memory can be read and
   updated with sanitized lessons.

Passing `repoUrl` to `repo_deputy_scan_repo` switches the MCP tool to the
sandbox scan path. Sandbox scans always use a depth-1 git checkout and run the
external toolchain plus the in-process lightweight language analyzer. Passing
`runExternalTools: true` with `rootPath` runs the local Fallow adapter for local
checkouts; Python/Ruby/Object Pascal/Java analysis does not require external
language runtimes.

## Why This Shape

The app gives humans a fast local/deployed view of repo truthfulness. MCP gives
agents the same scanner as a tool they can call before or after making changes.
Both surfaces use the same `lib/scan/repo.ts` orchestration path.
