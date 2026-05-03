import { runSandboxRepoScan } from "@/lib/scan/sandbox";
import type { RepoScanInput, RepoScanResult } from "@/lib/review/types";

export async function runRepoScan(input: RepoScanInput): Promise<RepoScanResult> {
  if (!input.repoUrl) {
    throw new Error("repoUrl is required. Repo Deputy app/API scans use Vercel Sandbox.");
  }

  return runSandboxRepoScan(input);
}
