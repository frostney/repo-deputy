import { normalizeRepoLocator } from "@/lib/scan/sandbox";

export type PublicGitHubRepoCheck =
  | {
      ok: true;
      repo: string;
      repoName: string;
      repoUrl: string;
      htmlUrl: string;
      command: string;
    }
  | {
      ok: false;
      reason: "invalid" | "unsupported" | "not-public" | "unavailable";
      status: number;
      repo?: string;
      repoUrl?: string;
      command?: string;
      message: string;
    };

type Fetcher = (input: string | URL, init?: RequestInit) => Promise<Response>;

export async function checkPublicGitHubRepository(
  value: string,
  fetcher: Fetcher = fetch,
): Promise<PublicGitHubRepoCheck> {
  const locator = readGitHubLocator(value);
  if (!locator.ok) {
    return locator;
  }

  const command = `GET https://api.github.com/repos/${locator.owner}/${locator.repoName}`;
  let response: Response;
  try {
    response = await fetcher(
      `https://api.github.com/repos/${locator.owner}/${locator.repoName}`,
      {
        cache: "no-store",
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "repo-deputy",
        },
      },
    );
  } catch {
    return {
      ok: false,
      reason: "unavailable",
      status: 502,
      repo: locator.repo,
      repoUrl: locator.repoUrl,
      command,
      message: "Could not confirm whether this repository is public. Please try again.",
    };
  }

  if (response.status === 404) {
    return {
      ok: false,
      reason: "not-public",
      status: 404,
      repo: locator.repo,
      repoUrl: locator.repoUrl,
      command,
      message:
        "Repo Deputy can only audit public GitHub repositories. This repository was not found or is private.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: "unavailable",
      status: 502,
      repo: locator.repo,
      repoUrl: locator.repoUrl,
      command,
      message:
        "GitHub did not confirm this repository's public status. Please try again.",
    };
  }

  const payload = await safeJson(response);
  if (isRecord(payload) && payload.private === true) {
    return {
      ok: false,
      reason: "not-public",
      status: 404,
      repo: locator.repo,
      repoUrl: locator.repoUrl,
      command,
      message:
        "Repo Deputy can only audit public GitHub repositories. This repository is private.",
    };
  }

  const fullName =
    isRecord(payload) && typeof payload.full_name === "string"
      ? payload.full_name
      : locator.repo;
  const htmlUrl =
    isRecord(payload) && typeof payload.html_url === "string"
      ? payload.html_url
      : `https://github.com/${locator.repo}`;

  return {
    ok: true,
    repo: fullName,
    repoName: fullName.split("/").at(-1) ?? locator.repoName,
    repoUrl: `https://github.com/${fullName}.git`,
    htmlUrl,
    command,
  };
}

function readGitHubLocator(value: string):
  | {
      ok: true;
      owner: string;
      repoName: string;
      repo: string;
      repoUrl: string;
    }
  | Extract<PublicGitHubRepoCheck, { ok: false }> {
  let locator: ReturnType<typeof normalizeRepoLocator>;
  try {
    locator = normalizeRepoLocator(value);
  } catch {
    return {
      ok: false,
      reason: "invalid",
      status: 400,
      message: "Enter a public GitHub repository as owner/repo.",
    };
  }

  const url = new URL(locator.repoUrl);
  if (url.hostname !== "github.com") {
    return {
      ok: false,
      reason: "unsupported",
      status: 400,
      repo: locator.repo,
      repoUrl: locator.repoUrl,
      message: "Enter a public GitHub repository as owner/repo.",
    };
  }

  const [owner, rawRepoName] = url.pathname.split("/").filter(Boolean);
  const repoName = rawRepoName?.replace(/\.git$/, "");
  if (!owner || !repoName) {
    return {
      ok: false,
      reason: "invalid",
      status: 400,
      repo: locator.repo,
      repoUrl: locator.repoUrl,
      message: "Enter a public GitHub repository as owner/repo.",
    };
  }

  const repo = `${owner}/${repoName}`;
  return {
    ok: true,
    owner,
    repoName,
    repo,
    repoUrl: `https://github.com/${repo}.git`,
  };
}

async function safeJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}
