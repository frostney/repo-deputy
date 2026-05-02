# Repo Deputy Agent Guide

This repository is a Bun-only Next.js App Router app for Repo Deputy, a
whole-repository drift scanner surfaced through the web app and a local MCP
server.

## Product Positioning

Repo Deputy keeps a repo honest after AI-generated changes. It is not a generic
code reviewer, a CodeRabbit clone, or a paste-a-repo-url tool.

Primary surfaces:

- App dashboard at `/`
- JSON scan endpoint at `/api/scan`
- Local stdio MCP server through `bun run mcp`

## Hard Constraints

- Use Bun only.
- Do not use `npm`, `pnpm`, or `yarn`.
- Keep `bun.lock`.
- Do not add `package-lock.json`, `pnpm-lock.yaml`, or `yarn.lock`.
- Use Vercel AI SDK with Vercel AI Gateway through `@ai-sdk/gateway`.
- Do not install or import `openai` or `@ai-sdk/openai`.
- Do not use direct OpenAI API calls.
- Do not use `OPENAI_API_KEY` except in seeded demo finding text.
- Mubit is optional operational repo memory.
- Missing Mubit or AI Gateway configuration must not break local scans.

## Commands

Run these before handing off code changes:

```bash
bun install --frozen-lockfile
bun run format:check
bun run lint
bun test
bun run typecheck
bun run build
```

Use `bun run format` only when intentionally formatting files.

## Code Organization

- `app/page.tsx` renders the whole-repo scan dashboard.
- `app/api/scan/route.ts` exposes scan results as JSON.
- `lib/scan/` collects local repository context and orchestrates scans.
- `lib/mcp/` exposes local MCP tools for agents.
- `lib/commands/` contains legacy Repo Deputy command parsing helpers.
- `lib/review/` contains deterministic checks, report generation, markdown
  formatting, and fallback reporting.
- `lib/memory/` contains Mubit and fallback repo memory adapters.
- Tests are co-located with the code they cover using `*.test.ts`.
- `docs/` contains operator and architecture documentation.

## Testing Guidance

Prefer small Bun tests beside the module under test. See
`docs/testing-pattern.md` for the full pattern.

- `lib/commands/deputy-command.test.ts`
- `lib/review/report-markdown.test.ts`
- `lib/scan/repo.test.ts`

Do not create a detached top-level test tree unless a test is explicitly
cross-cutting and cannot sensibly live near one module.

Tests should be deterministic and should not call live Mubit or AI Gateway
services. Use fixtures and pure module boundaries instead.

## Safety Rules

Memory writes must only include safe summaries, safe file paths, finding
categories, timestamps, and lessons learned. Never write tokens, raw env values,
private keys, full source files, or private user data unrelated to repo review.

Mubit and AI Gateway failures must not break scans when a safe fallback exists.

## MCP Boundary

The MCP server is a local agent-facing surface. The default scan tool runs
without AI Gateway and without Mubit memory unless explicitly requested through
tool input. It must not claim remote hosting, multi-tenant repository access, or
GitHub App behavior.
