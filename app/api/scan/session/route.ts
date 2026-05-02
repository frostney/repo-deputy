import { createSandboxScanSession } from "@/lib/scan/sandbox";
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
    const result = await createSandboxScanSession(input);

    return Response.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
