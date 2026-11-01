import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { engine, fullMatrix, type Design, type ProductLine } from "../src/engine/flexloop";
import { mixFor } from "../src/engine/balancer";
import { validateGameData, type GameData } from "../src/data/schema";
import { recipesFor, inputsRecord } from "../src/engine/rates";

const data: GameData = JSON.parse(readFileSync("data/prototype/gamedata.json", "utf8"));
const lines: ProductLine[] = JSON.parse(readFileSync("data/prototype/lines.json", "utf8"));
const CP = lines.find((l) => l.id === "CP")!, VP = lines.find((l) => l.id === "VP")!;

const design = (L: ProductLine, o: Partial<Design>): Design => {
  const d: Design = {
    line: L.id, tier: "Assembly II", n: 8, belt: 200, store: 400, top: 2, variant: "from Iron", mode: "phases",
    src: L.id === "CP" ? ["make", "make", "make", "make"] : ["import", "make", "make", "make"],
    merge: L.id === "CP" ? ["one", "best", "best", "best"] : ["best", "best", "best", "best"],
    matrix: [], ...o,
  };
  d.matrix = fullMatrix(d.n, L.tiers.length);
  return d;
};

// The plan's "~" values are rounded/truncated to 2 decimals, so allow 0.01.
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThan(0.01);

describe("data", () => {
  it("validates", () => expect(validateGameData(data)).toEqual([]));
  it("rejects a recipe with unknown machine/product", () => {
    const bad = structuredClone(data);
    bad.recipes[0].machineId = "nope"; bad.recipes[1].inputs[0].product = "nope";
    expect(validateGameData(bad).length).toBe(2);
  });
});

describe("PLAN.md section 5", () => {
  it("CP I recipe is 3 iron : 3 wood : 4 concrete on any Assembly tier", () => {
    for (const t of ["I", "II", "III", "IV", "V"]) {
      const r = recipesFor(data, "Construction Parts", "Assembly " + t).find((x) => x.label === "from Iron")!;
      const q = inputsRecord(r), m = q["Iron"] / 3;
      expect([q["Iron"] / m, q["Wood"] / m, q["Concrete Slab"] / m]).toEqual([3, 3, 4]);
    }
  });
  it("8x Assembly II, CP I only, 1:1:1 merge, Belt II -> ~66.7", () => {
    const r = engine(data, CP, design(CP, { top: 0, merge: ["one", "best", "best", "best"] }));
    expect(r.W).toBeCloseTo(66.67, 1);
  });
  it("6x Assembly II, CP I only, 60/60/80 throttled -> 72", () => {
    const r = engine(data, CP, design(CP, { n: 6, top: 0, merge: ["exact", "best", "best", "best"] }));
    expect(r.W).toBeCloseTo(72, 5);
  });
  it("8x Assembly II, CP I-III, phases, Belt II -> ~6.87 CP III", () => {
    near(engine(data, CP, design(CP, {})).W, 6.87);
  });
  it("8x Assembly III steel CP I, CP I-IV, phases: Belt II ~4.24, Belt III ~6.59, throttled ~5.13", () => {
    const b = { tier: "Assembly III", variant: "from Steel", top: 3 } as const;
    near(engine(data, CP, design(CP, { ...b })).W, 4.24);
    near(engine(data, CP, design(CP, { ...b, belt: 450 })).W, 6.59);
    near(engine(data, CP, design(CP, { ...b, mode: "blend" })).W, 5.13);
  });
  it("8x / 6x Assembly III, VP I-III, MP brought in, phases, Belt II -> ~7.48 / ~5.90", () => {
    const b = { tier: "Assembly III", variant: "from Steel", top: 3 } as const;
    near(engine(data, VP, design(VP, { ...b })).W, 7.48);
    near(engine(data, VP, design(VP, { ...b, n: 6 })).W, 5.9);
  });
  it("best balancer for VP I (3 MP : 1 Elec) is exactly 3 : 1", () => {
    const m = mixFor({ "Mechanical Parts": 3, Electronics: 1 }, "best");
    expect(m.f["Mechanical Parts"]).toBeCloseTo(0.75, 9);
    expect(m.f["Electronics"]).toBeCloseTo(0.25, 9);
    expect(m.desc).toMatch(/Balancer A: Mechanical Parts \+ Electronics, then Balancer B: A \+ Mechanical Parts/);
  });
});
