// Converts the in-game export published by doubleaxe/daxfb-calculator (MIT) into our GameData schema.
// Usage: tsx scripts/import-daxfb.ts <path to daxfb-calculator/data/coi> [outDir]
// The upstream data is produced by the captain-of-data C# mod, so it is an in-game export, not a wiki scrape.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import type { GameData, Machine, Product, ProductKind, Recipe, Stack } from "../src/data/schema";

const [dir, outArg] = process.argv.slice(2);
if (!dir) { console.error("usage: import-daxfb <daxfb data/coi dir> [outDir]"); process.exit(1); }
const raw = JSON.parse(readFileSync(`${dir}/parsed/data.json`, "utf8"));
const desc = JSON.parse(readFileSync(`${dir}/description.json`, "utf8"));
const items = new Map<string, any>(raw.items.map((i: any) => [i.name, i]));
const machineNames = new Set<string>(raw.recipeDictionaries.map((r: any) => r.name));

const kindOf = (t: number): ProductKind => ({ 5: "unit", 6: "loose", 4: "fluid", 7: "molten", 9: "virtual" } as Record<number, ProductKind>)[t] ?? "virtual";
const products: Product[] = [...items.values()]
  .filter((i) => i.type !== undefined && !i.name.startsWith("Any") && !machineNames.has(i.name))
  .map((i) => ({ id: i.name, name: i.label, kind: kindOf(i.type) }));
const productIds = new Set(products.map((p) => p.id));

const OVERHEAD = (n: string) => n === "Worker" || n === "Electricity" || n === "Computing" || n.startsWith("Maintenance");
const tierOf = (name: string): number => { let t = 1, cur = items.get(name); while (cur?.prevTier) { t++; cur = items.get(cur.prevTier); } return t; };
const familyOf = (name: string): string => { let cur = items.get(name); while (cur?.prevTier) cur = items.get(cur.prevTier); return cur?.label ?? name; };

const machines: Machine[] = [], recipes: Recipe[] = [];
for (const rd of raw.recipeDictionaries) {
  const item = items.get(rd.name);
  const m: Machine = { id: rd.name, name: item?.label ?? rd.name, family: familyOf(rd.name), tier: tierOf(rd.name) };
  if (item?.cost) m.buildCost = item.cost.filter((c: any) => productIds.has(c.name)).map((c: any) => ({ product: c.name, qty: c.count }));
  for (const r of rd.recipes ?? []) {
    // abstract storage pseudo-recipes (AnyCountableProduct etc.) are not production recipes
    if ([...(r.input ?? []), ...(r.output ?? [])].some((io: any) => io.name.startsWith("Any"))) continue;
    const inputs: Stack[] = [];
    for (const io of r.input ?? []) {
      if (io.count <= 0) continue;
      if (!OVERHEAD(io.name)) { inputs.push({ product: io.name, qty: io.count }); continue; }
      if (io.name === "Worker") m.workers = Math.max(m.workers ?? 0, io.count);
      else if (io.name === "Electricity") m.electricityKw = Math.max(m.electricityKw ?? 0, io.count);
      else if (io.name === "Computing") m.computing = Math.max(m.computing ?? 0, io.count);
      else if (!m.maintenance || io.count > m.maintenance.perMonth) m.maintenance = { product: io.name, perMonth: io.count };
    }
    recipes.push({ id: `${rd.name}:${r.name}`, label: r.name, machineId: rd.name, durationSec: r.time ?? 1, inputs,
      outputs: (r.output ?? []).filter((o: any) => o.count > 0).map((o: any) => ({ product: o.name, qty: o.count })) });
  }
  machines.push(m);
}
const data: GameData = {
  meta: { gameVersion: desc.version, exportedAt: new Date().toISOString(), source: "doubleaxe/daxfb-calculator data/coi (MIT), generated from the game by doubleaxe/captain-of-data" },
  products, machines, recipes,
  transports: raw.logistic.flatMap((l: any) => (l.transport ?? []).map((t: any, i: number) => ({ id: t.name, name: t.label, tier: i + 1, kind: l.name, throughputPerMin: t.count }))),
  storages: [],
};
const slug = desc.version.replace(/[^A-Za-z0-9.]+/g, "-").replace(/^-|-$/g, "");
const out = outArg ?? `data/${slug}`;
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/gamedata.json`, JSON.stringify(data, null, 1) + "\n");
writeFileSync(`${out}/NOTICE.md`, `Data in gamedata.json is converted from https://github.com/doubleaxe/daxfb-calculator (data/coi/parsed/data.json, game ${desc.version}), MIT License, (c) Alexey Usov.\nUpstream generated it from the game with https://github.com/doubleaxe/captain-of-data.\nMachine footprints, ports and storage transfer rates are not in the upstream data.\n`);
console.log(`${out}: game ${desc.version}; ${recipes.length} recipes, ${products.length} products, ${machines.length} machines, ${data.transports.length} transports`);
