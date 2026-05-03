import { runSandboxScanTool } from "@/lib/scan/sandbox";
import {
  errorResponse,
  parseSandboxId,
  parseSandboxScanToolId,
  readJsonBody,
} from "@/app/api/scan/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await readJsonBody(request);
    const sandboxId = parseSandboxId(body);
    const tool = parseSandboxScanToolId(
      typeof body === "object" && body ? (body as { tool?: unknown }).tool : undefined,
    );
    const toolResult = await runSandboxScanTool(sandboxId, tool);

    return Response.json({ toolResult });
  } catch (error) {
    return errorResponse(error);
  }
}
