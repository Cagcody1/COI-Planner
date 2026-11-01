// Usage: tsx scripts/import-cod.ts <dir with machines_and_buildings.json, products.json, transports.json> [outDir]
// Converts the exporter mod's output (c:/temp on the player's machine) into data/<gameVersion>/gamedata.json.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { importCod } from "../src/data/importCod";
import { validateGameData } from "../src/data/schema";
const [dir, outArg] = process.argv.slice(2);
if (!dir) { console.error("usage: import-cod <exporter output dir> [outDir]"); process.exit(1); }
const rd = (f: string) => (existsSync(`${dir}/${f}`) ? JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) : undefined);
const { data, warnings } = importCod({ machines_and_buildings: rd("machines_and_buildings.json"), products: rd("products.json"), transports: rd("transports.json") });
const errs = validateGameData(data);
warnings.slice(0, 10).forEach((w) => console.warn("warn:", w));
if (errs.length) { errs.slice(0, 10).forEach((e) => console.error("error:", e)); process.exit(1); }
const out = outArg ?? `data/${data.meta.gameVersion.replace(/[^A-Za-z0-9.]+/g, "-").replace(/^-|-$/g, "")}`;
mkdirSync(out, { recursive: true });
writeFileSync(`${out}/gamedata.json`, JSON.stringify(data, null, 1) + "\n");
console.log(`${out}: game ${data.meta.gameVersion}; ${data.recipes.length} recipes, ${data.machines.length} machines, ${data.products.length} products`);
