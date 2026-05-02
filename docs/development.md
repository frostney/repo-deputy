# Development and Testing

## Package Manager

Use Bun only.

Allowed:

```bash
bun install
bun add <package>
bun run dev
bun run build
bun run typecheck
bun run lint
bun run format:check
bun test
bun run mcp
bunx <tool>
```

Do not use `npm`, `pnpm`, or `yarn`.

## Verification

Run the full local check before handoff:

```bash
bun install --frozen-lockfile
bun run format:check
bun run lint
bun test
bun run typecheck
bun run build
```

## Formatting and Linting

Biome is the formatter and linter.

```bash
bun run format
bun run format:check
bun run lint
```

There is no ESLint config in this repo.

## Tests

Tests use `bun test` and are co-located with the code they cover. The detailed
testing pattern is documented in [Testing Pattern](./testing-pattern.md).

Examples:

- `lib/commands/deputy-command.test.ts`
- `lib/review/report-markdown.test.ts`
- `lib/scan/repo.test.ts`

Prefer co-located tests for module behavior. Only create a top-level test folder
for cross-cutting integration tests that do not naturally belong beside one
module. Do not write tests that require Mubit, AI Gateway, or any other live
external service.

Run one co-located test file:

```bash
bun test lib/scan/repo.test.ts
```

Run all tests:

```bash
bun test
```

## CI

GitHub Actions workflow:

```txt
.github/workflows/ci.yml
```

The workflow runs:

1. `bun install --frozen-lockfile`
2. `bun run format:check`
3. `bun run lint`
4. `bun test`
5. `bun run typecheck`
6. `bun run build`

## Local App

```bash
bun run dev
```

Open `http://localhost:3000` to see the Repo Deputy scan dashboard.

Start a split sandbox scan session:

```bash
curl -X POST http://localhost:3000/api/scan/session \
  -H "content-type: application/json" \
  -d '{"repo":"vercel/next.js","focus":"full","ai":false}'
```

Use the returned session with `/api/scan/tool`, then pass accumulated
`toolResults` to `/api/scan/report`.

## Local MCP Server

```bash
bun run mcp
```

See [MCP Server](./mcp.md) for client configuration and available tools.
