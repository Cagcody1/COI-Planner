import type { GameData, ResearchNode } from "../data/schema";

/** Research node that unlocks this recipe, falling back to the one that unlocks its machine. */
export function recipeResearch(data: GameData, recipeId: string, machineId: string): string | undefined {
  return data.recipes.find((r) => r.id === recipeId)?.unlockedBy ?? data.machines.find((m) => m.id === machineId)?.unlockedBy;
}

/**
 * Everything that has to be researched to run the given recipes/machines: the unlocking nodes plus all their prerequisites,
 * in tree order (prerequisites first). Nodes in `done` are left out of `todo` but still listed in `all`.
 */
export function requiredResearch(data: GameData, items: { recipeId?: string; machineId: string }[], done: Set<string> = new Set()) {
  const byId = new Map((data.research ?? []).map((n) => [n.id, n]));
  const direct = new Set<string>();
  for (const it of items) {
    const id = (it.recipeId && recipeResearch(data, it.recipeId, it.machineId)) || data.machines.find((m) => m.id === it.machineId)?.unlockedBy;
    if (id) direct.add(id);
  }
  const all: ResearchNode[] = [], seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id)) return; seen.add(id);
    const n = byId.get(id); if (!n) return;
    for (const p of n.parents) visit(p);
    all.push(n);
  };
  direct.forEach(visit);
  const todo = all.filter((n) => !done.has(n.id));
  return { direct, all, todo, seconds: todo.reduce((s, n) => s + n.durationSec, 0) };
}
