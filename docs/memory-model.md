# Memory Model

Repo Deputy has one optional long-term memory system: Mubit repo memory.

## Mubit Repo Memory

Configured through `lib/memory/repo-memory.ts` and `lib/memory/mubit.ts`.

Used for operational repo memory:

- Repeated docs drift patterns.
- Repeated code drift patterns.
- Package-manager conventions.
- Env-var conventions.
- Previous AI-generated mistakes.
- Previous scan confidence.
- Lessons learned from earlier repository scans.

Mubit is enabled only when:

```bash
MUBIT_ENABLED=true
MUBIT_API_KEY=<value>
```

Otherwise, Repo Deputy uses the fallback memory adapter.

## Fallback Memory

`lib/memory/fallback-memory.ts` stores a small in-process set of lessons for the
current runtime. It is safe for local demos and does not persist across process
restarts.

## Safe Write Policy

Repo Deputy may write:

- Repo name.
- Scan id or timestamp.
- Command.
- Finding category counts.
- Safe file paths.
- Short summaries.
- Safe evidence snippets.
- Lessons learned.
- Timestamp.

Repo Deputy must not write:

- Secrets.
- Tokens.
- Raw environment values.
- Private key contents.
- Full source files.
- Large code snippets.
- Private user data unrelated to repo review.

## Failure Policy

Memory is non-critical. Mubit recall and write failures are caught, logged
server-side, and ignored so scans can still complete.
