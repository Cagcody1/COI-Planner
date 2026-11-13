// Versioned game-data schema (PLAN.md section 2) and a dependency-free validator.
export type ProductKind = "unit" | "loose" | "fluid" | "molten" | "virtual";
export interface Stack { product: string; qty: number }
export interface Product { id: string; name: string; kind: ProductKind; icon?: string }
export interface Port { x: number; y: number; dir: "N" | "E" | "S" | "W"; kind: string; name?: string; io?: "in" | "out" | "any" }
export interface Machine {
  id: string; name: string; family: string; tier: number;
  workers?: number; electricityKw?: number; computing?: number;
  maintenance?: { product: string; perMonth: number };
  footprint?: { w: number; h: number };
  ports?: Port[];
  buildCost?: Stack[];
  unlockedBy?: string;      // research node id
}
export interface Recipe {
  id: string; machineId: string; durationSec: number;
  inputs: Stack[]; outputs: Stack[]; label?: string; unlockedBy?: string;
}
export interface Transport {
  id: string; name: string; tier: number; kind: string;
  throughputPerMin: number; electricityKwPerTile?: number; maintenancePer100?: number;
}
export interface Storage {
  id: string; name: string; tier: number; kind: string;
  capacity: number; transferPerMin?: number; ports?: Port[];
}
export interface Unlock { kind: "machine" | "building" | "recipe" | "product" | "other"; id: string; title?: string; machine?: string }
export interface ResearchNode {
  id: string; name: string; durationSec: number; parents: string[]; x: number; y: number;
  description?: string; unlocks: Unlock[]; startUnlocked?: boolean; anyParent?: boolean;
}
export interface Meta { gameVersion: string; exportedAt: string; source: string }
export interface GameData {
  meta: Meta; products: Product[]; machines: Machine[]; recipes: Recipe[];
  transports: Transport[]; storages: Storage[]; research?: ResearchNode[];
}

const KINDS = new Set(["unit", "loose", "fluid", "molten", "virtual"]);

/** Returns a list of problems; empty means valid. Every recipe must reference real machines and products. */
export function validateGameData(d: unknown): string[] {
  const errs: string[] = [];
  const o = d as Partial<GameData>;
  if (!o || typeof o !== "object") return ["data is not an object"];
  const arr = (k: keyof GameData) => {
    if (!Array.isArray(o[k])) { errs.push(`${k} must be an array`); return [] as any[]; }
    return o[k] as any[];
  };
  if (!o.meta || typeof o.meta.gameVersion !== "string" || !o.meta.gameVersion) errs.push("meta.gameVersion missing");
  if (!o.meta?.source) errs.push("meta.source missing");
  const products = arr("products"), machines = arr("machines"), recipes = arr("recipes");
  arr("transports"); arr("storages");
  const pid = new Set<string>(), mid = new Set<string>();
  for (const p of products) {
    if (!p.id) errs.push("product without id");
    else if (pid.has(p.id)) errs.push(`duplicate product ${p.id}`);
    pid.add(p.id);
    if (!KINDS.has(p.kind)) errs.push(`product ${p.id}: bad kind ${p.kind}`);
  }
  for (const m of machines) {
    if (!m.id) errs.push("machine without id");
    else if (mid.has(m.id)) errs.push(`duplicate machine ${m.id}`);
    mid.add(m.id);
    if (typeof m.tier !== "number") errs.push(`machine ${m.id}: tier must be a number`);
    if (m.maintenance && !pid.has(m.maintenance.product)) errs.push(`machine ${m.id}: unknown maintenance product ${m.maintenance.product}`);
    for (const s of m.buildCost ?? []) if (!pid.has(s.product)) errs.push(`machine ${m.id}: unknown build product ${s.product}`);
  }
  const rid = new Set<string>();
  for (const r of recipes) {
    if (rid.has(r.id)) errs.push(`duplicate recipe ${r.id}`);
    rid.add(r.id);
    if (!mid.has(r.machineId)) errs.push(`recipe ${r.id}: unknown machine ${r.machineId}`);
    if (!(r.durationSec > 0)) errs.push(`recipe ${r.id}: durationSec must be > 0`);
    if (!Array.isArray(r.inputs) || !Array.isArray(r.outputs)) errs.push(`recipe ${r.id}: needs inputs[] and outputs[] (outputs may be empty for sinks)`);
    for (const s of [...(r.inputs ?? []), ...(r.outputs ?? [])]) {
      if (!pid.has(s.product)) errs.push(`recipe ${r.id}: unknown product ${s.product}`);
      if (!(s.qty > 0)) errs.push(`recipe ${r.id}: qty must be > 0 for ${s.product}`);
    }
  }
  return errs;
}
