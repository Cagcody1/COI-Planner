import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { validateGameData, type GameData } from "../src/data/schema";
import { run } from "../scripts/section5-report";

const DIR = "0.8.1a-b550-Update-4";
const data: GameData = JSON.parse(readFileSync(`data/${DIR}/gamedata.json`, "utf8"));

describe(`in-game export ${DIR}`, () => {
  it("is tagged with the game version and validates", () => {
    expect(data.meta.gameVersion).toBe("0.8.1a(b550) - Update 4");
    expect(validateGameData(data)).toEqual([]);
  });
  it("CP I recipe is 3 iron : 3 wood : 4 concrete on every assembler tier", () => {
    const cp = data.recipes.filter((r) => /^Assembly/.test(r.machineId) && /^CpAssembly(T\d)$/.test(r.label ?? ""));
    expect(cp.length).toBe(5);
    for (const r of cp) {
      const q = Object.fromEntries(r.inputs.map((s) => [s.product, s.qty]));
      expect(q.Iron / 3).toBe(q.Wood / 3);
      expect(q["Concrete slab"] / 4).toBe(q.Iron / 3);
    }
  });
  it("belt rates are the in-game values", () => {
    const t = (id: string) => data.transports.find((x) => x.id === id)!.throughputPerMin;
    expect(t("FlatConveyorT2")).toBeCloseTo(199.80, 1);
    expect(t("FlatConveyorT3")).toBe(450);
  });
  it("Assembly III has 8 workers, 150 kW; Assembly V has 400 kW and 6 computing", () => {
    const m = (id: string) => data.machines.find((x) => x.id === id)!;
    expect([m("AssemblyElectrifiedT2").workers, m("AssemblyElectrifiedT2").electricityKw]).toEqual([8, 150]);
    expect([m("AssemblyRoboticT2").electricityKw, m("AssemblyRoboticT2").computing]).toEqual([400, 6]);
  });
  // Regression values computed from THIS export (belts at exact rates). The plan's older numbers came from the prototype's guessed recipes.
  it("section 5 scenarios match the export-derived values", () => {
    const expected = [66.6, 72, 6.97, 4.28, 6.0, 5.12, 7.47, 6.0];
    run(DIR, true).forEach((r, i) => expect(r.got).toBeCloseTo(expected[i], 1));
  });
});
