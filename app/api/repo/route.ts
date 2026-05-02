import { checkPublicGitHubRepository } from "@/lib/scan/public-repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const repo = url.searchParams.get("repo") ?? "";
  const result = await checkPublicGitHubRepository(repo);

  return Response.json(result, { status: result.ok ? 200 : result.status });
}
