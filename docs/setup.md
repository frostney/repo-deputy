# Setup and Deployment

## Requirements

- Bun 1.3.9 or compatible.
- Optional Vercel AI Gateway API key for model-backed report generation.
- Optional Mubit API key for long-term repo memory.

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

MUBIT_ENABLED=false
MUBIT_API_KEY=
MUBIT_PROJECT_PREFIX=repo-deputy
```

`AI_GATEWAY_API_KEY` enables model-backed report summarization through Vercel AI
Gateway. If it is missing, Repo Deputy falls back to a deterministic report.

`MUBIT_ENABLED=true` and `MUBIT_API_KEY` are both required before Repo Deputy
uses Mubit. If either is missing, the fallback memory adapter is used.

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
