# MCP Server

Repo Deputy includes a local Model Context Protocol server for agent workflows.
It exposes the same whole-repository scanner used by the app.

## Start The Server

```bash
bun run mcp
```

This starts a stdio MCP server using `@modelcontextprotocol/sdk`.

## Client Configuration

For MCP clients that accept a JSON server config, use:

```json
{
  "mcpServers": {
    "repo-deputy": {
      "command": "bun",
      "args": [
        "run",
        "/absolute/path/to/repo-deputy/lib/mcp/server.ts"
      ],
      "cwd": "/absolute/path/to/repo-deputy"
    }
  }
}
```

Replace `/absolute/path/to/repo-deputy` with this repository path.

## Tools

### `repo_deputy_scan_repo`

Scans a local repository path or a public git repository and returns findings
plus markdown.

Input:

```json
{
  "rootPath": "/absolute/path/to/target-repo",
  "focus": "full",
  "useAi": false,
  "useMemory": false
}
```

Remote sandbox input:

```json
{
  "repoUrl": "vercel/next.js",
  "focus": "full",
  "useAi": false,
  "useMemory": false
}
```

Notes:

- `rootPath` defaults to the MCP server working directory.
- `repoUrl` accepts a public git URL or GitHub `owner/repo` shorthand. When set,
  Repo Deputy uses Vercel Sandbox with `depth: 1` instead of `rootPath`.
- Sandbox scans run Fallow, lightweight Python/Ruby/Object Pascal analysis,
  markdownlint, and markdown-link-check and return parsed `toolResults`.
- `focus` can be `docs`, `code`, or `full`.
- `useAi` defaults to `false` so local MCP calls are deterministic by default.
- `useMemory` defaults to `false` so MCP scans do not write Mubit memory unless
  explicitly requested.
- `runExternalTools` can be set to `true` for local `rootPath` scans to run the
  local Fallow adapter. The lightweight Python/Ruby/Object Pascal analyzer is
  in-process and does not need those language runtimes.

### `repo_deputy_check_drift`

Runs deterministic docs/code drift checks against supplied file fixtures. This
tool does not call Mubit or AI Gateway.

Example input:

```json
{
  "focus": "full",
  "repo": "local/example",
  "scope": "repo",
  "packageJsonContent": "{\"packageManager\":\"bun@1.3.9\",\"scripts\":{\"dev\":\"bun run dev\"}}",
  "readmeContent": "Run the outdated dev command",
  "envExampleContent": "AI_GATEWAY_API_KEY=\\n",
  "changedFiles": [
    {
      "filename": "lib/ai/example.ts",
      "status": "modified",
      "patch": "+const key = process.env.NEW_SERVICE_TOKEN"
    }
  ],
  "docsFiles": []
}
```

Use `scope: "change-set"` when the fixture represents a diff instead of a
whole-repository scan.

### `repo_deputy_render_report`

Renders a `DeputyReport`-shaped payload into Repo Deputy's GitHub Flavored
Markdown scan format.

### `repo_deputy_demo_scan`

Returns a deterministic demo report using seeded fallback findings.

### `repo_deputy_parse_command`

Parses legacy Repo Deputy command text and returns the command/focus or `null`.
This is kept for migration and demos; it is not the primary product surface.

## Boundaries

The MCP server can read local repository files through `repo_deputy_scan_repo`.
When `repoUrl` is supplied, it can also start a single Vercel Sandbox for a
public shallow git checkout. It does not provide remote repository hosting,
multi-tenant access, or GitHub App behavior.

External calls are opt-in:

- AI Gateway is used only when `useAi` is true and `AI_GATEWAY_API_KEY` exists.
- Mubit memory is used only when `useMemory` is true and Mubit env vars are
  configured.
