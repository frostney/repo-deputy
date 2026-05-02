import { describe, expect, test } from "bun:test";
import { checkPublicGitHubRepository } from "./public-repo";

describe("checkPublicGitHubRepository", () => {
  test("normalizes github.com-prefixed input before checking GitHub", async () => {
    const requests: string[] = [];
    const result = await checkPublicGitHubRepository(
      "github.com/vercel/next.js",
      async (input) => {
        requests.push(String(input));
        return Response.json({
          full_name: "vercel/next.js",
          private: false,
          html_url: "https://github.com/vercel/next.js",
        });
      },
    );

    expect(requests).toEqual(["https://api.github.com/repos/vercel/next.js"]);
    expect(result).toMatchObject({
      ok: true,
      repo: "vercel/next.js",
      repoName: "next.js",
      repoUrl: "https://github.com/vercel/next.js.git",
    });
  });

  test("reports missing or private repositories before sandbox creation", async () => {
    const result = await checkPublicGitHubRepository("owner/private-repo", async () =>
      Response.json({ message: "Not Found" }, { status: 404 }),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "not-public",
      status: 404,
    });
  });

  test("rejects invalid repository input", async () => {
    const result = await checkPublicGitHubRepository("not-a-repo", async () =>
      Response.json({}),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: "invalid",
      status: 400,
    });
  });
});
