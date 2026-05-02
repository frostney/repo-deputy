# App and MCP Flow

Repo Deputy scans public repositories through Vercel Sandbox instead of reading
local filesystem checkouts from the app, API, or MCP server.

## App Flow

1. The user opens `/`.
2. The user enters a GitHub `owner/repo` shorthand or public git URL.
3. `app/_components/scanning.tsx` calls `/api/scan/session`.
4. The session route creates one Vercel Sandbox, performs the depth-1 checkout,
   prepares Bun, and returns a session containing the sandbox id.
5. The app calls `/api/scan/tool` in parallel for each analyzer while passing
   the same session, so Fallow, lightweight language analysis, markdownlint, and
   markdown-link-check run as separate API phases against one sandbox.
6. The app calls `/api/scan/report` with the accumulated `toolResults`.
7. The report route lifts tool issues into findings, stops the sandbox, and
   returns the final scan payload.
8. The report is generated through Vercel AI Gateway when configured, otherwise
   deterministic fallback reporting is used.
9. The dashboard renders merge confidence, counts, and current findings.

## JSON API Flow

The app uses the split API so scan phases can be tracked and retried without
creating extra sandboxes.

1. `POST /api/scan/session` with `{ "repo": "owner/repo", "focus": "full" }`.
2. If `ready` is true, call `POST /api/scan/tool` with `{ "session": ..., "tool": "fallow" }`.
3. Repeat the tool request for `light-language-analysis`, `markdownlint`, and
   `markdown-link-check`. These calls are independent after checkout and can be
   run in parallel by clients that want that behavior.
4. `POST /api/scan/report` with `{ "session": ..., "toolResults": [...] }`.
5. If a client abandons a scan before reporting, `POST /api/scan/stop` accepts
   the same session and releases the sandbox best-effort.

Example:

```bash
curl -X POST http://localhost:3000/api/scan/session \
  -H "content-type: application/json" \
  -d '{"repo":"vercel/next.js","focus":"full","ai":false}'
```

## MCP Flow

1. The user starts the server with `bun run mcp`.
2. An MCP client calls `repo_deputy_scan_repo` with `repoUrl`.
3. By default the tool uses deterministic reporting only.
4. If `useAi` is true and `AI_GATEWAY_API_KEY` exists, the report summary can use
   Vercel AI Gateway.

The MCP server does not scan `rootPath` or the MCP server working directory.
Local filesystem scan support should live in a separate CLI or Codex skill if
it is added later.

## Why This Shape

The app and MCP surfaces stay aligned around public remote repository audits.
Keeping local filesystem scans out of these surfaces avoids making the hosted
app or MCP tool imply access to a developer machine checkout.
