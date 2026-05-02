import { finishSandboxScanSession } from "@/lib/scan/sandbox";
import {
  errorResponse,
  parseSandboxSession,
  parseToolResults,
  readJsonBody,
  scanResultResponse,
} from "@/app/api/scan/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const session = parseSandboxSession(body);
    const toolResults = parseToolResults(
      typeof body === "object" && body
        ? (body as { toolResults?: unknown }).toolResults
        : undefined,
    );
    const useAi =
      typeof body === "object" && body
        ? (body as { ai?: unknown; useAi?: unknown }).ai !== false &&
          (body as { ai?: unknown; useAi?: unknown }).useAi !== false
        : undefined;
    const result = await finishSandboxScanSession({
      session,
      toolResults,
      useAi,
    });

    return Response.json(scanResultResponse(result));
  } catch (error) {
    return errorResponse(error);
  }
}
