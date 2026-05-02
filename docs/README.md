# Repo Deputy Documentation

Repo Deputy is a whole-repository drift scanner for checking whether a repo
still tells the truth after AI-generated changes.

## Documentation Index

- [Setup and Deployment](./setup.md)
- [Architecture](./architecture.md)
- [App and MCP Flow](./app-and-mcp-flow.md)
- [Review Checks](./review-checks.md)
- [Memory Model](./memory-model.md)
- [Development and Testing](./development.md)
- [Testing Pattern](./testing-pattern.md)
- [MCP Server](./mcp.md)

## Core Promise

Repo Deputy keeps your repo honest after AI changes it.

It focuses on repository truthfulness:

- README and docs commands match the actual package manager.
- `.env.example` documents environment variables used by code.
- API docs and examples reference real routes, files, and functions.
- AI-generated helpers do not duplicate existing helpers.
- Client code does not import server-only configuration.
- Dependencies imported by code are declared in `package.json`.
- Repo memory can highlight repeated drift patterns without inventing issues.

It intentionally does not try to replace broad code review tools.
