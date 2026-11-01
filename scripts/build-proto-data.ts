// Builds data/prototype/*.json (single GameData file) from the prototype recipe table.
import { writeFileSync, mkdirSync } from "node:fs";
import { PROTO } from "../src/data/protoRecipes";
import type { GameData, Machine, Product, ProductKind } from "../src/data/schema";

const MOLTEN = /^Molten /;
const FLUID = new Set(["Water","Oxygen","Nitrogen","Exhaust","Diesel","Crude Oil","Waste Water","Acid","Naphtha","Chlorine"]);
const LOOSE = new Set(["Iron Ore","Iron Ore Crushed","Copper Ore","Coal","Limestone","Sand","Gravel","Slag","Slag Crushed","Salt","Sulfur","Cement","Glass Mix","Graphite","Polysilicon","Iron Scrap","Copper Scrap","Broken Glass"]);
const kind = (n: string): ProductKind => MOLTEN.test(n) ? "molten" : FLUID.has(n) ? "fluid" : LOOSE.has(n) ? "loose" : "unit";
const ROMAN = ["I","II","III","IV","V"];
const tierOf = (name: string) => { const m = name.match(/ (I{1,3}|IV|V)$/); return m ? ROMAN.indexOf(m[1]) + 1 : 1; };
const familyOf = (name: string) => name.replace(/ (I{1,3}|IV|V)$/, "");

const prods = new Map<string, Product>();
const machines = new Map<string, Machine>();
const id = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
for (const r of PROTO) {
  for (const n of [...Object.keys(r.inp), ...Object.keys(r.out)]) if (!prods.has(n)) prods.set(n, { id: n, name: n, kind: kind(n) });
  if (!machines.has(r.machine)) machines.set(r.machine, { id: r.machine, name: r.machine, family: familyOf(r.machine), tier: tierOf(r.machine) });
}
const data: GameData = {
  meta: { gameVersion: "prototype", exportedAt: new Date().toISOString(), source: "coi-ratio.html prototype (wiki, partly guessed)" },
  products: [...prods.values()], machines: [...machines.values()],
  recipes: PROTO.map((r, i) => ({
    id: `r${String(i).padStart(3, "0")}_${id(r.machine)}_${id(Object.keys(r.out)[0])}`, machineId: r.machine, durationSec: r.time,
    inputs: Object.entries(r.inp).map(([product, qty]) => ({ product, qty })),
    outputs: Object.entries(r.out).map(([product, qty]) => ({ product, qty })), ...(r.label ? { label: r.label } : {}),
  })),
  transports: [60, 200, 450].map((t, i) => ({ id: `belt_${i + 1}`, name: "Belt " + ROMAN[i], tier: i + 1, kind: "belt", throughputPerMin: t })),
  storages: [[400, "Unit Storage"], [900, "Unit Storage II"]].map(([t, n], i) => ({ id: `unit_storage_${i + 1}`, name: n as string, tier: i + 1, kind: "unit", capacity: 0, transferPerMin: t as number })),
};
mkdirSync("data/prototype", { recursive: true });
writeFileSync("data/prototype/gamedata.json", JSON.stringify(data, null, 1) + "\n");
console.log(`wrote data/prototype/gamedata.json: ${data.recipes.length} recipes, ${data.products.length} products, ${data.machines.length} machines`);
