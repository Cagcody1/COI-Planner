import { readdirSync, readFileSync, existsSync } from "node:fs";
import { validateGameData } from "../src/data/schema";
let bad = 0;
for (const v of readdirSync("data")) {
  const f = `data/${v}/gamedata.json`;
  if (!existsSync(f)) continue;
  const errs = validateGameData(JSON.parse(readFileSync(f, "utf8")));
  console.log(`${f}: ${errs.length ? errs.length + " problem(s)" : "ok"}`);
  errs.slice(0, 20).forEach((e) => console.log("  - " + e));
  bad += errs.length;
}
process.exit(bad ? 1 : 0);
