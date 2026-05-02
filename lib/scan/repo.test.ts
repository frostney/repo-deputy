import { describe, expect, test } from "bun:test";
import type { RepoScanInput } from "@/lib/review/types";
import { runRepoScan } from "./repo";

describe("runRepoScan", () => {
  test("requires a sandbox repository URL", async () => {
    await expect(runRepoScan({ focus: "full" } as RepoScanInput)).rejects.toThrow(
      "repoUrl is required",
    );
  });
});
