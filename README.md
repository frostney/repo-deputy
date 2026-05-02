# Repo Deputy

Repo Deputy keeps your repo honest after AI changes it.

The current scope is a whole-repository drift scanner with two surfaces:

- A Next.js App Router dashboard at `/`
- A local stdio MCP server for agent workflows

It scans the checked-out repository for docs drift, stale setup commands, env
documentation gaps, duplicate generated helpers, dependency drift, route naming
drift, and architecture truthfulness issues.

## Run Locally

```bash
bun install
bun run dev
```

Open `http://localhost:3000` for the app dashboard.

Fetch scan JSON directly:

```bash
curl "http://localhost:3000/api/scan?focus=full&ai=false"
```

## MCP

Start the local MCP server:

```bash
bun run mcp
```

The main tool is `repo_deputy_scan_repo`, which scans a local repository path and
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

Vercel AI Gateway and Mubit are optional. Missing keys do not break local scans.
See [`.env.example`](./.env.example).
