import { describe, expect, test } from "bun:test";
import { normalizeRepoLocator } from "./sandbox";

describe("normalizeRepoLocator", () => {
  test("normalizes GitHub shorthand to a shallow-cloneable git URL", () => {
    expect(normalizeRepoLocator("vercel/next.js")).toEqual({
      repo: "vercel/next.js",
      repoName: "next.js",
      repoUrl: "https://github.com/vercel/next.js.git",
    });
  });

  test("normalizes HTTPS GitHub URLs", () => {
    expect(normalizeRepoLocator("https://github.com/facebook/react")).toEqual({
      repo: "facebook/react",
      repoName: "react",
      repoUrl: "https://github.com/facebook/react.git",
    });
  });
});
