# Review Checks

Repo Deputy combines deterministic checks with concise report generation. The
deterministic findings are the source of truth.

## Docs Drift Checks

Implemented in `lib/review/docs-drift.ts`.

Checks include:

- README command mismatch, especially stale non-Bun dev commands when the repo
  uses Bun.
- Install docs that mention another package manager when the repo uses Bun.
- `.env.example` missing environment variables used in scanned code.
- Special handling for seeded provider-key drift: if code references the seeded
  provider-key example, the suggested fix points to `AI_GATEWAY_API_KEY`.
- Docs references to deleted or renamed files in change-set fixtures.
- Docs references to renamed API routes in change-set fixtures.
- Public API or route changes without README/docs updates in change-set
  fixtures.

Whole-repo scans treat docs as part of the scanned repository state. Change-set
fixtures can still model "code changed without docs changed" behavior for tests
and MCP inputs.

## Code Drift Checks

Implemented in `lib/review/code-drift.ts`.

Checks include:

- Duplicate helper names such as `formatReviewFinding` duplicating
  `formatFinding`.
- Client components importing server-only config or private environment
  variables.
- External imports missing from `package.json`.
- Route rename hints for change-set fixtures.

## Fallow Placeholder

Implemented in `lib/review/fallow-placeholder.ts`.

This is a placeholder adapter shape for a future fallow integration. It returns
simple deterministic architecture drift hints only. It does not claim real
fallow integration.

## Report Generation

Implemented in `lib/review/generate-report.ts`.

The model prompt instructs Repo Deputy to:

- Use deterministic findings as evidence.
- Not invent files.
- Not invent issues.
- Not create findings from memory alone.
- Use memory only for prioritization.
- Rank findings by merge risk.
- Prefer repo truthfulness over generic style comments.

If `AI_GATEWAY_API_KEY` is missing, `useAi` is false, or generation fails, Repo
Deputy creates a deterministic fallback report.

## Markdown Output

Implemented in `lib/review/report-markdown.ts`.

The markdown always includes:

- Repo Deputy heading.
- Merge confidence.
- Summary.
- Findings or an explicit no-findings statement.
- Suggested next steps.
- What Repo Deputy checked.

The repo memory section appears only when memory insights were used.
