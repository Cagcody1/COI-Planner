import type { GameData, Recipe } from "./schema";

export interface DataDiff {
  fromVersion: string; toVersion: string;
  addedRecipes: string[]; removedRecipes: string[];
  changedRecipes: { id: string; before: string; after: string }[];
  addedMachines: string[]; removedMachines: string[];
  changedMachines: { id: string; what: string }[];
}
const show = (r: Recipe) => `${r.inputs.map((s) => `${s.qty} ${s.product}`).join(" + ") || "-"} -> ${r.outputs.map((s) => `${s.qty} ${s.product}`).join(" + ") || "-"} / ${r.durationSec}s`;

/** Flags what a patch changed (PLAN.md M7): recipes, and machine workers/power/maintenance. */
export function diffData(a: GameData, b: GameData): DataDiff {
  const ra = new Map(a.recipes.map((r) => [r.id, r])), rb = new Map(b.recipes.map((r) => [r.id, r]));
  const ma = new Map(a.machines.map((m) => [m.id, m])), mb = new Map(b.machines.map((m) => [m.id, m]));
  const d: DataDiff = { fromVersion: a.meta.gameVersion, toVersion: b.meta.gameVersion, addedRecipes: [], removedRecipes: [], changedRecipes: [], addedMachines: [], removedMachines: [], changedMachines: [] };
  for (const [id, r] of rb) { const o = ra.get(id); if (!o) d.addedRecipes.push(id); else if (show(o) !== show(r)) d.changedRecipes.push({ id, before: show(o), after: show(r) }); }
  for (const id of ra.keys()) if (!rb.has(id)) d.removedRecipes.push(id);
  for (const [id, m] of mb) {
    const o = ma.get(id);
    if (!o) { d.addedMachines.push(id); continue; }
    const f = (x: typeof m) => `workers ${x.workers ?? 0}, ${x.electricityKw ?? 0} kW, maint ${x.maintenance ? x.maintenance.perMonth + " " + x.maintenance.product : "-"}`;
    if (f(o) !== f(m)) d.changedMachines.push({ id, what: `${f(o)} -> ${f(m)}` });
  }
  for (const id of ma.keys()) if (!mb.has(id)) d.removedMachines.push(id);
  return d;
}
