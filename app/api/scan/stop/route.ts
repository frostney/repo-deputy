import { stopSandboxScanSession } from "@/lib/scan/sandbox";
import { errorResponse, parseSandboxSession, readJsonBody } from "@/app/api/scan/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const session = parseSandboxSession(await readJsonBody(request));
    await stopSandboxScanSession(session);

    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
