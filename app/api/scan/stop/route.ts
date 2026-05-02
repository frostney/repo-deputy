import { stopSandboxById } from "@/lib/scan/sandbox";
import { errorResponse, parseSandboxId, readJsonBody } from "@/app/api/scan/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const sandboxId = parseSandboxId(await readJsonBody(request));
    await stopSandboxById(sandboxId);

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
