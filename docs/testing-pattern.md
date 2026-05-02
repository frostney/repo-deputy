# Testing Pattern

Repo Deputy uses Bun's built-in test runner. Tests should be small,
deterministic, and co-located with the module they cover.

## Placement

Put test files beside the implementation file:

```txt
lib/commands/deputy-command.ts
lib/commands/deputy-command.test.ts

lib/review/report-markdown.ts
lib/review/report-markdown.test.ts

lib/scan/repo.ts
lib/scan/repo.test.ts
```

Use a top-level test folder only for a true cross-module integration test that
does not belong to a single module. Most tests should not need one.

## Naming

Use the `*.test.ts` suffix:

```txt
module-name.test.ts
```

Avoid broad names like `unit.test.ts` or `utils.test.ts`. The test filename
should name the behavior owner.

## What To Test

Prioritize deterministic, product-critical behavior:

- Scan context collection from a temporary repository fixture.
- Report markdown structure.
- Finding sorting, category counts, and fallback behavior.
- Memory sanitization and no-fail wrappers.
- Docs/code drift check output for realistic local file fixtures.
- Legacy command parsing only where it supports MCP/demo compatibility.

Avoid tests that call live external services. Mubit and AI Gateway behavior
should be tested through adapters, mocks, fixtures, or pure functions.

## Test Shape

Prefer simple arrange-act-assert tests:

```ts
import { describe, expect, test } from "bun:test";
import { collectRepoScanContext } from "./repo";

describe("collectRepoScanContext", () => {
  test("collects package and docs files from a repo fixture", async () => {
    const context = await collectRepoScanContext({ focus: "full", rootPath });

    expect(context.scope).toBe("repo");
    expect(context.packageJson?.path).toBe("package.json");
  });
});
```

Use real domain-shaped fixtures. A drift-check fixture should include file
paths, package manager signals, env examples, and docs text that resemble an
actual repository.

## External Boundaries

Do not make tests depend on:

- `AI_GATEWAY_API_KEY`
- `MUBIT_API_KEY`
- Network access
- A deployed app
- A live MCP client

Runtime integration should be checked manually through the app endpoint and MCP
stdio smoke tests. Automated tests should keep external services behind module
boundaries.

## Running Tests

Run all tests:

```bash
bun test
```

Run one co-located test file:

```bash
bun test lib/scan/repo.test.ts
```

Run a name filter:

```bash
bun test -t "collectRepoScanContext"
```

## CI Expectations

The GitHub Actions workflow runs tests after Biome format and lint checks:

```bash
bun run format:check
bun run lint
bun test
bun run typecheck
bun run build
```

New tests should pass under that full sequence.
