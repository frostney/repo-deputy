import { describe, expect, test } from "bun:test";
import {
  parseSandboxScanToolId,
  parseSandboxSession,
  parseScanRequestInput,
  parseToolResults,
} from "./_shared";

describe("split scan API helpers", () => {
  test("parses a session request body", () => {
    expect(
      parseScanRequestInput({
        repo: "vercel/next.js",
        focus: "code",
        ai: false,
      }),
    ).toEqual({
      repoUrl: "vercel/next.js",
      focus: "code",
      revision: undefined,
      useAi: false,
    });
  });

  test("parses a sandbox session with sandbox id", () => {
    expect(
      parseSandboxSession({
        session: {
          repo: "vercel/next.js",
          repoName: "next.js",
          repoUrl: "https://github.com/vercel/next.js.git",
          focus: "full",
          scannedFiles: 123,
          sandbox: {
            repoUrl: "https://github.com/vercel/next.js.git",
            cloneDepth: 1,
            sandboxId: "sbx_123",
          },
        },
      }),
    ).toEqual({
      repo: "vercel/next.js",
      repoName: "next.js",
      repoUrl: "https://github.com/vercel/next.js.git",
      focus: "full",
      revision: undefined,
      scannedFiles: 123,
      sandbox: {
        repoUrl: "https://github.com/vercel/next.js.git",
        cloneDepth: 1,
        revision: undefined,
        commit: undefined,
        sandboxId: "sbx_123",
      },
    });
  });

  test("accepts only known sandbox tool ids", () => {
    expect(parseSandboxScanToolId("fallow")).toBe("fallow");
    expect(() => parseSandboxScanToolId("unknown")).toThrow("Unsupported scan tool");
  });

  test("keeps valid tool results and drops malformed entries", () => {
    const results = parseToolResults([
      {
        id: "fallow",
        name: "Fallow",
        command: "bunx fallow",
        status: "passed",
        exitCode: 0,
        summary: "No issues",
        issues: [],
      },
      {
        id: "broken",
        issues: "not an array",
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("fallow");
  });
});
