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

## Fallow

Implemented in `lib/review/fallow.ts`.

The adapter parses JSON output from the sandbox scanner running `bunx --silent
fallow --format json --quiet --summary --no-cache`. Fallow findings are
converted into Repo Deputy findings for dead code/module graph issues, duplicate
code groups, and complexity hotspots in TypeScript/JavaScript projects.

## Lightweight Python/Ruby/Object Pascal/Java Analysis

Implemented in `lib/review/light-language.ts`.

The analyzer runs in-process with Bun/TypeScript over collected source text. It
does not require Python, Ruby, Delphi, Free Pascal, Java, RuboCop, Ruff, or any
other language runtime. It checks:

- Python files: `.py`, `.pyi`, `.pyw`.
- Ruby files: `.rb`, `.rake`, `.gemspec`, plus `Rakefile`, `Gemfile`,
  `Guardfile`, and `Capfile`.
- Object Pascal/Delphi/Free Pascal files: `.pas`, `.pp`, `.lpr`, `.dpr`,
  `.dpk`, and Pascal-looking `.inc` files.
- Java files: `.java`.

The v1 checks are intentionally heuristic:

- Structural complexity hotspots in functions, methods, procedures,
  constructors, and destructors.
- Duplicate normalized code blocks.

It does not claim dead-code detection, unused symbol detection, unresolved
import/include/uses detection, full syntax validation, or compiler-backed
analysis.

Sandbox language source collection is bounded to avoid unbounded JSON payloads:

- Up to 2,000 supported language files.
- Up to 500 KB per supported language file.
- Up to 25 MB of supported language source text total.

## Sandbox Tool Checks

Implemented in `lib/scan/sandbox.ts` with `@vercel/sandbox`.

Remote repository scans create an ephemeral Vercel Sandbox from a git source
with `depth: 1`, install Bun in the sandbox if needed, then run:

- Fallow for code graph, duplication, and health analysis.
- Lightweight Python/Ruby/Object Pascal/Java analysis for heuristic complexity
  and duplicate-block findings.
- `markdownlint-cli2` for Markdown style and structure diagnostics.
- `markdown-link-check` for broken Markdown links.

Each command returns a structured `toolResults` entry with status, exit code,
summary, bounded stdout/stderr previews, and parsed issues. Parsed issues are
also lifted into the main Repo Deputy findings list so they appear in markdown
reports, API responses, and MCP responses.

The app API runs these as separate phases against one sandbox session:

- Session phase: create sandbox, clone, setup Bun, collect metadata.
- Tool phase: run a single analyzer by id.
- Report phase: generate the report from accumulated `toolResults` and stop the
  sandbox.

The tool phase is independent after checkout, so API clients can run tool
requests in parallel while still sharing one sandbox.

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

If `AI_GATEWAY_API_KEY` is missing, `useAi` is false, generation fails, or the
Gateway call exceeds `AI_GATEWAY_TIMEOUT_MS`, Repo Deputy creates a deterministic
fallback report.

## Markdown Output

Implemented in `lib/review/report-markdown.ts`.

The markdown always includes:

- Repo Deputy heading.
- Merge confidence.
- Summary.
- Findings or an explicit no-findings statement.
- Tool checks from sandbox analyzers.
- Suggested next steps.
- What Repo Deputy checked.

The repo memory section appears only when memory insights were used.
