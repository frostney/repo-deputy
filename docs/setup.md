# Setup and Deployment

## Requirements

- Bun 1.3.9 or compatible.
- Optional Vercel AI Gateway API key for model-backed report generation.
- Optional Mubit API key for long-term repo memory and public scan counters.
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
uses Mubit. If either is missing, repo memory falls back safely and public scan
counters are unavailable rather than written to local storage.

Vercel Sandbox uses `VERCEL_OIDC_TOKEN` when available. Outside Vercel, set
`VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, and `VERCEL_TOKEN` before remote
repository scans. Local path scans do not require Sandbox credentials.

## Local Development

```bash
bun run dev
```

The app is available at `http://localhost:3000`.

The JSON scan endpoint is available at:

```txt
http://localhost:3000/api/scan?focus=full
```

Supported focus values are `docs`, `code`, and `full`. Add `ai=false` for
deterministic fallback reporting, or `memory=true` to opt into memory reads and
writes when Mubit is configured.

Remote repository scans use Vercel Sandbox and a shallow git checkout:

```txt
http://localhost:3000/api/scan?repo=vercel/next.js&focus=full&ai=false
```

The sandbox scan runs Fallow, markdownlint, and markdown-link-check, then
returns parsed `toolResults` alongside Repo Deputy findings.

## MCP Server

```bash
bun run mcp
```

See [MCP Server](./mcp.md) for client configuration and tool inputs.

## Deployment

Deploy the app as a standard Next.js App Router project on Vercel.

The scan endpoint uses the Node.js runtime because it reads the deployed
repository checkout:

```ts
export const runtime = "nodejs";
```

Vercel deployments scan the deployed source tree. Local MCP scans are still the
preferred way to point Repo Deputy at any arbitrary local repository path.
Remote repository scans use Vercel Sandbox from `/api/scan?repo=owner/repo`;
the route exports a 300-second max duration so clone and analyzer runs can
finish in production before falling back to deterministic report rendering.
