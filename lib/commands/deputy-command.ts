import type { ReviewFocus } from "@/lib/review/types";

export type DeputyCommandName = "help" | "scan" | "review" | "docs" | "code" | "full";

export type DeputyCommand = {
  command: DeputyCommandName;
  focus: ReviewFocus;
};

type ParseOptions = {
  author?: Partial<AuthorLike>;
  botUserName?: string;
};

type AuthorLike = {
  isBot: boolean | "unknown";
  isMe: boolean;
  userName: string;
};

const COMMAND_PATTERN =
  /(?:^|\s)@repo-deputy(?:\s+)(help|scan|review|docs|code|full)(?:\b|$)/i;

export function parseDeputyCommand(
  text: string | null | undefined,
  options: ParseOptions = {},
): DeputyCommand | null {
  if (isOwnBotMessage(options.author, options.botUserName)) {
    return null;
  }

  const match = text?.match(COMMAND_PATTERN);
  if (!match) {
    return null;
  }

  const command = match[1].toLowerCase() as DeputyCommandName;
  return {
    command,
    focus: command === "docs" || command === "code" ? command : "full",
  };
}

function isOwnBotMessage(
  author: Partial<AuthorLike> | undefined,
  botUserName: string | undefined,
) {
  if (!author) {
    return false;
  }

  if (author.isMe || author.isBot === true) {
    return true;
  }

  const configuredName = normalizeUserName(botUserName);
  const authorName = normalizeUserName(author.userName);

  return Boolean(configuredName && authorName && configuredName === authorName);
}

function normalizeUserName(value: string | undefined) {
  return value?.replace(/\[bot\]$/i, "").toLowerCase();
}
