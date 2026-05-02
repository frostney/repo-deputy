import type {
  RepoMemoryContext,
  RepoMemoryEvent,
  RepoMemoryInsight,
} from "@/lib/memory/types";

const memory = new Map<string, RepoMemoryInsight[]>();

export function createFallbackMemory() {
  return {
    async getRepoMemory(context: RepoMemoryContext): Promise<RepoMemoryInsight[]> {
      return memory.get(context.repo)?.slice(0, 5) ?? [];
    },

    async writeScanMemory(event: RepoMemoryEvent): Promise<void> {
      const existing = memory.get(event.repo) ?? [];
      const insights = event.lessons.slice(0, 5).map((lesson, index) => ({
        id: `fallback-${event.repo}-${event.timestamp}-${index}`,
        repo: event.repo,
        summary: lesson,
        category: "repo-convention" as const,
        confidence: 0.5,
        lastSeenAt: event.timestamp,
      }));

      memory.set(event.repo, [...insights, ...existing].slice(0, 20));
    },
  };
}
