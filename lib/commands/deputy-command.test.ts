import { describe, expect, test } from "bun:test";
import { parseDeputyCommand } from "./deputy-command";

describe("parseDeputyCommand", () => {
  test("parses supported commands and maps review/full to full focus", () => {
    expect(parseDeputyCommand("@repo-deputy review")).toEqual({
      command: "review",
      focus: "full",
    });
    expect(parseDeputyCommand("@repo-deputy scan")).toEqual({
      command: "scan",
      focus: "full",
    });
    expect(parseDeputyCommand("please @repo-deputy full")).toEqual({
      command: "full",
      focus: "full",
    });
  });

  test("maps docs and code to narrow review focus", () => {
    expect(parseDeputyCommand("@repo-deputy docs")).toEqual({
      command: "docs",
      focus: "docs",
    });
    expect(parseDeputyCommand("@repo-deputy code")).toEqual({
      command: "code",
      focus: "code",
    });
  });

  test("parses help without running a review focus-specific command", () => {
    expect(parseDeputyCommand("@repo-deputy help")).toEqual({
      command: "help",
      focus: "full",
    });
  });

  test("ignores unrelated comments and bot/self comments", () => {
    expect(parseDeputyCommand("can someone review this?")).toBeNull();
    expect(
      parseDeputyCommand("@repo-deputy review", {
        author: {
          isMe: true,
          isBot: false,
          userName: "repo-deputy",
        },
      }),
    ).toBeNull();
    expect(
      parseDeputyCommand("@repo-deputy review", {
        author: {
          isMe: false,
          isBot: true,
          userName: "some-bot",
        },
      }),
    ).toBeNull();
  });
});
