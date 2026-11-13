import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { importPlanner, isPlannerExport } from "../src/data/importPlanner";
import { validateGameData, type GameData } from "../src/data/schema";

const q = (n: number) => ({ type: "Mafi.Quantity", Value: n });
const pr = (id: string) => ({ protoId: id });
const prod = (type: string, id: string, name: string) => ({ id, name, data: { type } });
const fake = {
  exporter: "PlannerDataExporter 0.1.5", gameVersion: "0.8.8d", exportedAt: "2026-01-01T00:00:00Z",
  protos: {
    "Mafi.Core.Products.LooseProductProto": [prod("x", "Product_Coal", "Coal")],
    "Mafi.Core.Products.CountableProductProto": [prod("x", "Product_Iron", "Iron"), prod("x", "Product_IronCountable", "Coal")],
    "Mafi.Core.Products.MixedMemberProductProto": [prod("x", "Product_CoalMixed", "Coal")],
    "Mafi.Core.Factory.Recipes.RecipeProto": [{ id: "Smelt", name: "Smelt", data: { AllInputs: [{ Product: pr("Product_Coal"), Quantity: q(2) }], AllOutputs: [{ Product: pr("Product_Iron"), Quantity: q(3) }], PowerMultiplier: { RawValue: 100000 } } }],
    "Mafi.Core.Factory.Machines.MachineProto": [{ id: "Furnace", name: "Furnace", data: {
      ElectricityConsumed: { Value: 100 }, ComputingConsumed: { Value: 0 }, Costs: { Workers: 4, BaseConstructionCost: { Products: [{ Product: pr("Product_Iron"), Quantity: q(10) }] }, Maintenance: { Product: pr("Product_Iron"), MaintenancePerMonth: { Value: { RawValue: 2048 } } } },
      RecipeBindings: [{ Recipe: pr("Smelt"), Multiplier: 2, Duration: { Ticks: 300 } }],
      Layout: { LayoutSize: { X: 6, Y: 4, Z: 3 }, Ports: [{ Name: "A", Type: "Input", RelativePosition: { X: 0, Y: 1, Z: 0 }, RelativeDirection: { DirectionIndex: 2 }, Shape: pr("IoPortShape_Pipe") }] },
    } }],
    "Mafi.Core.Research.ResearchNodeProto": [{ id: "ResearchSmelting", name: "Smelting", data: { ResearchDuration: { Ticks: 600 }, GridPosition: { X: 3, Y: 1 }, Parents: [], Units: [
      { type: "Mafi.Core.UnlockingTree.ProtoWithIconUnlock", Proto: pr("Furnace"), Title: { Value: "Furnace" } },
      { type: "Mafi.Core.UnlockingTree.RecipeUnlock", Proto: pr("Smelt"), MachineProto: pr("Furnace") }] } },
      { id: "ResearchNext", name: "Next", data: { ResearchDuration: { Ticks: 100 }, GridPosition: { X: 4, Y: 1 }, Parents: [pr("ResearchSmelting")], Units: [] } }],
  },
};

describe("importPlanner (synthetic export)", () => {
  const { data, warnings } = importPlanner(fake);
  it("is recognised and valid", () => {
    expect(isPlannerExport(fake)).toBe(true);
    expect(isPlannerExport({ products: [] })).toBe(false);
    expect(validateGameData(data)).toEqual([]);
    expect(warnings).toEqual([]);
    expect(data.meta.gameVersion).toBe("0.8.8d");
  });
  it("keeps real product names plain and suffixes repeats / mixed stand-ins", () => {
    expect(data.products.map((p) => p.id).sort()).toEqual(["Coal", "Coal (mixed)", "Coal (unit)", "Iron"]);
  });
  it("scales recipe quantities by the binding multiplier and converts ticks to seconds", () => {
    const r = data.recipes[0];
    expect(r).toMatchObject({ id: "Furnace:Smelt", machineId: "Furnace", durationSec: 30, inputs: [{ product: "Coal", qty: 4 }], outputs: [{ product: "Iron", qty: 6 }] });
    expect(r.unlockedBy).toBe("ResearchSmelting");
  });
  it("reads machine stats, footprint, ports, costs and maintenance", () => {
    const m = data.machines[0];
    expect(m).toMatchObject({ workers: 4, electricityKw: 100, footprint: { w: 6, h: 4 }, buildCost: [{ product: "Iron", qty: 10 }], maintenance: { product: "Iron", perMonth: 2 }, unlockedBy: "ResearchSmelting" });
    expect(m.ports).toEqual([{ x: 0, y: 1, dir: "W", kind: "IoPortShape_Pipe", name: "A", io: "in" }]);
  });
  it("reads the research tree", () => {
    expect(data.research).toHaveLength(2);
    expect(data.research![0]).toMatchObject({ durationSec: 60, x: 3, y: 1, unlocks: [{ kind: "machine", id: "Furnace" }, { kind: "recipe", id: "Furnace:Smelt" }] });
    expect(data.research![1].parents).toEqual(["ResearchSmelting"]);
  });
  it("refuses other files", () => { expect(() => importPlanner({ machines_and_buildings: [] })).toThrow(/not an export/); });
});

describe("bundled game 0.8.8d data (from the owner's own game)", () => {
  const d: GameData = JSON.parse(readFileSync("data/0.8.8d/gamedata.json", "utf8"));
  it("validates and has the expected size", () => {
    expect(d.meta.gameVersion).toBe("0.8.8d");
    expect(validateGameData(d)).toEqual([]);
    expect(d.machines.length).toBeGreaterThan(80);
    expect(d.research!.length).toBe(226);
  });
  it("research parents all exist and unlocked machines/recipes resolve", () => {
    const ids = new Set(d.research!.map((r) => r.id)), rec = new Set(d.recipes.map((r) => r.id));
    for (const r of d.research!) for (const p of r.parents) expect(ids.has(p)).toBe(true);
    for (const r of d.recipes) if (r.unlockedBy) expect(ids.has(r.unlockedBy)).toBe(true);
    const lost = d.research!.flatMap((r) => r.unlocks.filter((u) => u.kind === "recipe" && !rec.has(u.id)));
    expect(lost.length).toBeLessThan(8);
  });
  it("conveyors are the in-game rates", () => {
    expect(d.transports.find((t) => t.id === "FlatConveyorT3")!.throughputPerMin).toBe(450);
  });
});

import { requiredResearch } from "../src/engine/unlocks";
describe("research needed for a chain", () => {
  const d: GameData = JSON.parse(readFileSync("data/0.8.8d/gamedata.json", "utf8"));
  it("lists the unlocking node and its prerequisites, prerequisites first", () => {
    const r = requiredResearch(d, [{ recipeId: "FoodMill:WheatMilling", machineId: "FoodMill" }]);
    expect(r.direct.size).toBe(1);
    const ids = r.all.map((n) => n.id), last = ids[ids.length - 1];
    expect(r.direct.has(last)).toBe(true);
    for (const n of r.all) for (const p of n.parents) expect(ids.indexOf(p)).toBeLessThan(ids.indexOf(n.id));
    const done = requiredResearch(d, [{ machineId: "FoodMill" }], new Set(ids));
    expect(done.todo).toEqual([]);
  });
});
