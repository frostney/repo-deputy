import { createFallbackMemory } from "@/lib/memory/fallback-memory";
import { createMubitMemory, isMubitEnabled } from "@/lib/memory/mubit";
import type {
  RepoMemoryContext,
  RepoMemoryEvent,
  RepoMemoryInsight,
} from "@/lib/memory/types";

const fallbackMemory = createFallbackMemory();

export async function getRepoMemory(
  context: RepoMemoryContext,
): Promise<RepoMemoryInsight[]> {
  try {
    const memory = isMubitEnabled() ? createMubitMemory() : fallbackMemory;
    return await memory.getRepoMemory(context);
  } catch (error) {
    console.warn("Repo memory read failed; using empty memory.", error);
    return [];
  }
}

export async function writeScanMemory(event: RepoMemoryEvent): Promise<void> {
  try {
    const memory = isMubitEnabled() ? createMubitMemory() : fallbackMemory;
    await memory.writeScanMemory(event);
  } catch (error) {
    console.warn("Repo memory write failed; ignoring.", error);
  }
}
