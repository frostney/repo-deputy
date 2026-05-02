# Setup and Deployment

## Requirements

- Bun 1.3.9 or compatible.
- Optional Vercel AI Gateway API key for model-backed report generation.
- Optional Mubit API key for long-term repo memory.
- Optional Vercel Sandbox credentials for remote repository scans.

## Install

```bash
bun install
```

Do not use `npm`, `pnpm`, or `yarn`. This repo keeps `bun.lock` as the only
package manager lockfile.

## Environment Variables

Optional:

```bash
AI_GATEWAY_API_KEY=
AI_GATEWAY_MODEL=anthropic/claude-sonnet-4.6
AI_GATEWAY_TIMEOUT_MS=6000

MUBIT_ENABLED=false
MUBIT_API_KEY=
MUBIT_PROJECT_PREFIX=repo-deputy

VERCEL_OIDC_TOKEN=
VERCEL_TEAM_ID=
VERCEL_PROJECT_ID=
VERCEL_TOKEN=
```

`AI_GATEWAY_API_KEY` enables model-backed report summarization through Vercel AI
Gateway. If it is missing, Repo Deputy falls back to a deterministic report.
`AI_GATEWAY_TIMEOUT_MS` bounds production Gateway calls so deployed scans can
fall back before the request times out.

`MUBIT_ENABLED=true` and `MUBIT_API_KEY` are both required before Repo Deputy
uses Mubit. If either is missing, the fallback memory adapter is used.

Vercel Sandbox uses `VERCEL_OIDC_TOKEN` when available. Outside Vercel, set
`VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, and `VERCEL_TOKEN` before remote
repository scans.

## Local Development

```bash
bun run dev
```

The app is available at `http://localhost:3000`.

The app uses split scan endpoints so each phase can report progress while
sharing one sandbox:

```bash
curl -X POST http://localhost:3000/api/scan/session \
  -H "content-type: application/json" \
  -d '{"repo":"vercel/next.js","focus":"full","ai":false}'
```

Then call `/api/scan/tool` for each returned tool id using the returned
`sandboxId`. Tool calls can run in parallel because they attach to the same
sandbox. Lightweight language tool ids are language-specific, such as
`light-language-python` or `light-language-java`, and are returned only when
matching files exist. Finish with `/api/scan/report`. Supported focus values are
`docs`, `code`, and `full`. Use `ai=false` for deterministic fallback reporting.
The `repo` field is required because app/API scans use Vercel Sandbox rather
than reading local filesystem paths.

The sandbox scan runs Fallow, lightweight Python/Ruby/Object Pascal/Java analysis,
markdownlint, and markdown-link-check, then returns parsed `toolResults`
alongside Repo Deputy findings. The lightweight language analyzer is
in-process and does not require Python, Ruby, Delphi, Free Pascal, or Java
runtimes.

## MCP Server

```bash
bun run mcp
```

See [MCP Server](./mcp.md) for client configuration and tool inputs.

## Deployment

Deploy the app as a standard Next.js App Router project on Vercel.

The scan endpoint uses the Node.js runtime because it starts Vercel Sandbox
scans:

```ts
export const runtime = "nodejs";
```

Repository scans use Vercel Sandbox from the `/api/scan/session`,
`/api/scan/tool`, and `/api/scan/report` route phases. Scan routes export a
300-second max duration so clone and analyzer runs can finish in production
before falling back to deterministic report rendering.
