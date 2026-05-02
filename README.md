# Repo Deputy

Repo Deputy keeps your repo honest after AI changes it.

The current scope is a whole-repository drift scanner with two surfaces:

- A Next.js App Router dashboard at `/`
- A local stdio MCP server for agent workflows

It scans public Git repositories in Vercel Sandbox for docs drift, stale setup commands, env
documentation gaps, duplicate generated helpers, dependency drift, route naming
drift, TypeScript/JavaScript health through Fallow, and lightweight
Python/Ruby/Object Pascal/Java complexity and duplication signals.

## Run Locally

```bash
bun install
bun run dev
```

Open `http://localhost:3000` for the app dashboard.

Start a split sandbox scan session:

```bash
curl -X POST http://localhost:3000/api/scan/session \
  -H "content-type: application/json" \
  -d '{"repo":"vercel/next.js","focus":"full","ai":false}'
```

Run `/api/scan/tool` phases for the returned tool ids with the returned
`sandboxId`, in parallel if desired, then call `/api/scan/report` with the
accumulated `toolResults`. Language tool ids are returned only for source types
present in the checked-out repository.

Sandbox scans use a depth-1 git checkout and run Fallow, detected lightweight
Python/Ruby/Object Pascal/Java analyzers, markdownlint, and markdown-link-check.
Filesystem/local path scans are not part of the app/API/MCP product surface.

## MCP

Start the local MCP server:

```bash
bun run mcp
```

The main tool is `repo_deputy_scan_repo`, which scans a public repository in Vercel Sandbox and
returns findings plus markdown.

See [`docs/mcp.md`](./docs/mcp.md) for client configuration and all tools.

## Verification

```bash
bun install --frozen-lockfile
bun run format:check
bun run lint
bun test
bun run typecheck
bun run build
```

## Documentation

Detailed docs live in [`docs/`](./docs/README.md).

## Environment

Vercel AI Gateway and Mubit are optional. Sandbox credentials are required for
remote repository scans.
See [`.env.example`](./.env.example).
