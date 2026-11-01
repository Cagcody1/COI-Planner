// Cross-check a sample of recipes in data/<version>/gamedata.json against the wiki via the MediaWiki API.
// Usage: npm run wiki:check -- [version] [sampleSize]
// Needs network access to wiki.coigame.com (api.php). Reports recipes whose wikitext doesn't mention
// the expected quantities/products; this is a heuristic cross-check, not a parser.
import { readFileSync } from "node:fs";
import type { GameData } from "../../src/data/schema";

const [version = "prototype", sampleArg = "15"] = process.argv.slice(2);
const API = process.env.COI_WIKI_API ?? "https://wiki.coigame.com/api.php";
const data: GameData = JSON.parse(readFileSync(`data/${version}/gamedata.json`, "utf8"));

async function wikitext(title: string): Promise<string | null> {
  const url = `${API}?action=query&prop=revisions&rvprop=content&rvslots=main&format=json&formatversion=2&titles=${encodeURIComponent(title)}`;
  const res = await fetch(url, { headers: { "User-Agent": "coi-planner-wiki-check" } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${title}`);
  const j: any = await res.json();
  return j.query?.pages?.[0]?.revisions?.[0]?.slots?.main?.content ?? null;
}

const sample = data.recipes.filter((_, i) => i % Math.max(1, Math.floor(data.recipes.length / +sampleArg)) === 0).slice(0, +sampleArg);
const cache = new Map<string, string | null>();
let mismatches = 0;
for (const r of sample) {
  const page = r.machineId; // wiki has one page per machine
  if (!cache.has(page)) cache.set(page, await wikitext(page).catch((e) => { console.warn(String(e)); return null; }));
  const text = cache.get(page);
  if (!text) { console.log(`?  ${r.id}: no wiki page "${page}"`); continue; }
  const missing = [...r.inputs, ...r.outputs].filter((s) => !text.includes(s.product) || !new RegExp(`\\b${s.qty}\\b`).test(text));
  if (missing.length) { mismatches++; console.log(`!  ${r.id}: wiki page "${page}" lacks ${missing.map((m) => `${m.qty} ${m.product}`).join(", ")}`); }
  else console.log(`ok ${r.id}`);
}
console.log(`${sample.length} checked, ${mismatches} to review (add confirmed fixes to data/${version}/overrides.json)`);
process.exit(0);
