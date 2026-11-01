// Converts the JSON written by the in-game exporter mod (captain-of-data) into GameData.
// Pure and browser-safe: pass the parsed JSON of each file. Product ids are the in-game display names
// (unique, and the exporter's recipes refer to products by name), so data stays stable across patches.
import type { GameData, Machine, Product, ProductKind, Recipe, Stack, Storage, Transport } from "./schema";

export interface CodFiles {
  machines_and_buildings: any;  // machines_and_buildings.json
  products: any;                // products.json
  transports?: any;             // transports.json (optional)
}
export interface ImportResult { data: GameData; warnings: string[] }

const KIND: Record<string, ProductKind> = {
  CountableProductProto: "unit", LooseProductProto: "loose", FluidProductProto: "fluid", MoltenProductProto: "molten", VirtualProductProto: "virtual",
};
const OVERHEAD_VIRTUAL = new Set(["Electricity", "Computing", "Workers", "Worker"]);

export function importCod(files: CodFiles, exportedAt = new Date().toISOString()): ImportResult {
  const warnings: string[] = [];
  const mb = files.machines_and_buildings, pj = files.products;
  if (!mb?.machines_and_buildings || !pj?.products) throw new Error("Need machines_and_buildings.json and products.json from the exporter");
  const version = String(mb.game_version ?? pj.game_version ?? "unknown");

  const products = new Map<string, Product>();
  for (const p of pj.products) {
    const kind = KIND[p.type];
    if (!kind) warnings.push(`product ${p.name}: unknown type ${p.type}, treated as virtual`);
    products.set(p.name, { id: p.name, name: p.name, kind: kind ?? "virtual" });
  }
  const ensure = (name: string, where: string) => {
    if (!products.has(name)) { products.set(name, { id: name, name, kind: "unit" }); warnings.push(`${where} refers to unknown product "${name}"; added as unit`); }
    return name;
  };

  const buildings: any[] = mb.machines_and_buildings;
  const prevOf = new Map<string, string>();
  for (const b of buildings) if (b.next_tier) prevOf.set(b.next_tier, b.id);
  const tierAndFamily = (id: string) => { let t = 1, cur = id, root = id; while (prevOf.has(cur)) { cur = prevOf.get(cur)!; t++; root = cur; } return { tier: t, family: buildings.find((x) => x.id === root)?.name ?? root }; };

  const machines: Machine[] = [], recipes: Recipe[] = [], storages: Storage[] = [];
  for (const b of buildings) {
    const { tier, family } = tierAndFamily(b.id);
    const m: Machine = { id: b.id, name: b.name, family, tier };
    if (b.workers) m.workers = b.workers;
    const rs: any[] = b.recipes ?? [];
    // power can scale per recipe (power_multiplier); keep the highest as the machine's draw
    const kw = Math.max(b.electricity_consumed * (rs.length ? Math.max(...rs.map((r) => r.power_multiplier ?? 1)) : 1), 0);
    if (kw) m.electricityKw = kw;
    if (b.computing_consumed) m.computing = b.computing_consumed;
    if (b.maintenance_cost_units && b.maintenance_cost_quantity) m.maintenance = { product: ensure(b.maintenance_cost_units, `${b.id} maintenance`), perMonth: b.maintenance_cost_quantity };
    if (b.build_costs?.length) m.buildCost = b.build_costs.map((c: any) => ({ product: ensure(c.product, `${b.id} build cost`), qty: c.quantity }));
    for (const r of rs) {
      const stacks = (arr: any[], side: string): Stack[] => (arr ?? []).filter((s) => s.quantity > 0).map((s) => ({ product: ensure(s.name, `${b.id}:${r.id} ${side}`), qty: s.quantity }));
      const inputs = stacks(r.inputs, "input"), outputs = stacks(r.outputs, "output");
      if (inputs.some((s) => s.product.startsWith("Any "))) continue;
      recipes.push({ id: `${b.id}:${r.id}`, label: r.id, machineId: b.id, durationSec: r.duration > 0 ? r.duration : 1, inputs, outputs });
    }
    if (b.storage_capacity > 0) storages.push({ id: b.id, name: b.name, tier, kind: b.product_type || "unknown", capacity: b.storage_capacity });
    machines.push(m);
  }
  const transports: Transport[] = (files.transports?.transports ?? []).map((t: any) => {
    const sib = (files.transports.transports as any[]).filter((x) => x.category === t.category);
    return { id: t.id, name: t.name, tier: 1, kind: t.category || t.id, throughputPerMin: t.throughput_per_second * 60,
      electricityKwPerTile: t.electricity_consumed || undefined };
  });
  // tier numbers for transports from next_tier chains
  const tById = new Map(transports.map((t) => [t.id, t]));
  for (const t of files.transports?.transports ?? []) if (t.next_tier && tById.has(t.next_tier)) tById.get(t.next_tier)!.tier = (tById.get(t.id)?.tier ?? 1) + 1;
  void OVERHEAD_VIRTUAL;
  return { data: { meta: { gameVersion: version, exportedAt, source: "in-game exporter mod (captain-of-data format)" }, products: [...products.values()], machines, recipes, transports, storages }, warnings };
}
