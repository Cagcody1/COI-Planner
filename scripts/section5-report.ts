// Runs the PLAN.md section 5 scenarios against every dataset and prints the results side by side.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { engine, fullMatrix, type Design, type ProductLine } from "../src/engine/flexloop";
import type { GameData } from "../src/data/schema";

const ASM_NAMES = ["I", "II", "III", "IV", "V"];
const scenarios = [
  { name: "8x Asm II, CP I only, 1:1:1 merge, Belt II", line: "CP", asm: 1, n: 8, top: 0, merge: "one", belt: "II", expect: 66.7 },
  { name: "6x Asm II, CP I only, 60/60/80 throttled", line: "CP", asm: 1, n: 6, top: 0, merge: "exact", belt: "II", expect: 72 },
  { name: "8x Asm II, CP I-III, phases, Belt II", line: "CP", asm: 1, n: 8, top: 2, belt: "II", expect: 6.87 },
  { name: "8x Asm III steel, CP I-IV, phases, Belt II", line: "CP", asm: 2, n: 8, top: 3, steel: true, belt: "II", expect: 4.24 },
  { name: "8x Asm III steel, CP I-IV, phases, Belt III", line: "CP", asm: 2, n: 8, top: 3, steel: true, belt: "III", expect: 6.59 },
  { name: "8x Asm III steel, CP I-IV, throttled, Belt II", line: "CP", asm: 2, n: 8, top: 3, steel: true, belt: "II", mode: "blend", expect: 5.13 },
  { name: "8x Asm III, VP I-III (MP in), phases, Belt II", line: "VP", asm: 2, n: 8, top: 3, belt: "II", expect: 7.48 },
  { name: "6x Asm III, VP I-III (MP in), phases, Belt II", line: "VP", asm: 2, n: 6, top: 3, belt: "II", expect: 5.9 },
] as const;

export function run(dir: string, exactBelts: boolean) {
  const data: GameData = JSON.parse(readFileSync(`data/${dir}/gamedata.json`, "utf8"));
  const lines: ProductLine[] = JSON.parse(readFileSync(`data/${dir}/lines.json`, "utf8"));
  const belts: Record<string, number> = exactBelts
    ? { II: data.transports.find((t) => t.id === "FlatConveyorT2")!.throughputPerMin, III: data.transports.find((t) => t.id === "FlatConveyorT3")!.throughputPerMin }
    : { II: 200, III: 450 };
  return scenarios.map((s) => {
    const L = lines.find((l) => l.id === s.line)! as ProductLine & { assemblers?: string[] };
    const cp = s.line === "CP";
    const D: Design = {
      line: s.line, tier: L.assemblers ? L.assemblers[s.asm + 0] : "Assembly " + ASM_NAMES[s.asm + 0], n: s.n, belt: belts[s.belt], store: 400, top: s.top,
      variant: cp ? ("steel" in s && s.steel ? "from Steel" : "from Iron") : "from Steel", mode: ("mode" in s ? s.mode : "phases") as Design["mode"],
      src: cp ? ["make", "make", "make", "make"] : ["import", "make", "make", "make"],
      merge: [("merge" in s ? s.merge : cp ? "one" : "best") as any, "best", "best", "best"], matrix: [],
    };
    D.matrix = fullMatrix(D.n, L.tiers.length);
    const r = engine(data, L, D);
    return { ...s, got: r.bad ? NaN : r.W, why: r.bad ? r.issues[0]?.msg : "" };
  });
}
if (process.argv[1]?.endsWith("section5-report.ts")) {
  for (const dir of readdirSync("data").filter((d) => existsSync(`data/${d}/lines.json`))) {
    const real = dir !== "prototype";
    console.log(`\n== ${dir}${real ? " (belts at exact in-game rates)" : ""}`);
    for (const r of run(dir, real)) console.log(`${r.name.padEnd(50)} plan ~${String(r.expect).padEnd(6)} got ${Number.isNaN(r.got) ? "n/a" : r.got.toFixed(2)} ${r.why ?? ""}`);
  }
}
