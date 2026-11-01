import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { GameData } from "../src/data/schema";
import { solveChain } from "../src/engine/chain";
import { totalCosts } from "../src/engine/costs";

const data: GameData = JSON.parse(readFileSync("data/0.8.1a-b550-Update-4/gamedata.json", "utf8"));
const opt = { choice: { ConstructionParts: "AssemblyElectrified:CpAssemblyT2" }, supplied: ["Iron", "Wood", "ConcreteSlab"] };

describe("chain solver", () => {
  const r = solveChain(data, "ConstructionParts", 48, opt);
  it("48 CP/min on Assembly II (12/min each) needs 4 assemblers and the CP I ratio of inputs", () => {
    expect(r.machines).toEqual({ AssemblyElectrified: 4 });
    expect(r.inputs.Iron).toBeCloseTo(36); expect(r.inputs.Wood).toBeCloseTo(36); expect(r.inputs.ConcreteSlab).toBeCloseTo(48);
    expect(r.byproducts).toEqual({});
  });
  it("totals: 4 x Assembly II = 24 workers, 0.32 MW, 8 Maintenance I / month", () => {
    const c = totalCosts(data, r.machines);
    expect(c.built).toEqual({ AssemblyElectrified: 4 });
    expect([c.workers, c.electricityMw]).toEqual([24, 0.32]);
    expect(c.maintenancePerMonth).toEqual({ MaintenanceT1: 8 });
    expect(c.buildCost.ConstructionParts2).toBe(120);
  });
  it("expands unsupplied inputs down to raw and reports byproducts", () => {
    const deep = solveChain(data, "ConstructionParts", 48, { choice: opt.choice });
    expect(Object.keys(deep.machines).length).toBeGreaterThan(1);
    expect(deep.tree.children.length).toBe(3);
    for (const v of Object.values(deep.inputs)) expect(v).toBeGreaterThan(0);
  });
  it("guards against recipe cycles", () => {
    expect(() => solveChain(data, "Electronics2", 10)).not.toThrow();
  });
});
