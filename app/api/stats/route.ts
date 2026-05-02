import { readScanStats } from "@/lib/scan/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await readScanStats());
}
