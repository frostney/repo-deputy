import { createSandboxScanSession } from "@/lib/scan/sandbox";
import { checkPublicGitHubRepository } from "@/lib/scan/public-repo";
import {
  errorResponse,
  parseScanRequestInput,
  readJsonBody,
} from "@/app/api/scan/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const input = parseScanRequestInput(await readJsonBody(request));
    const repoCheck = await checkPublicGitHubRepository(input.repoUrl);
    if (!repoCheck.ok) {
      return errorResponse(new Error(repoCheck.message), repoCheck.status);
    }

    input.repoUrl = repoCheck.repo;
    const result = await createSandboxScanSession(input);

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
