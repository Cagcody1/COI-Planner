import { describe, it, expect } from "vitest";
import { importCod } from "../src/data/importCod";
import { diffData } from "../src/data/diff";
import { validateGameData } from "../src/data/schema";
import { pickRecipe } from "../src/engine/chain";

// Hand-written fixture in the exporter's file format (not game data).
const files = () => ({
  products: { game_version: "9.9.9", products: [
    { id: "p1", name: "Iron", type: "CountableProductProto" }, { id: "p2", name: "Plate", type: "CountableProductProto" },
    { id: "p3", name: "Maintenance I", type: "VirtualProductProto" }, { id: "p4", name: "Steam", type: "FluidProductProto" } ] },
  machines_and_buildings: { game_version: "9.9.9", machines_and_buildings: [
    { id: "PressT1", name: "Press", category: "General", next_tier: "PressT2", workers: 4, maintenance_cost_units: "Maintenance I", maintenance_cost_quantity: 2,
      electricity_consumed: 100, electricity_generated: 0, computing_consumed: 0, storage_capacity: 0, build_costs: [{ product: "Iron", quantity: 10 }],
      recipes: [{ id: "Plate1", name: "Plate", duration: 20, inputs: [{ name: "Iron", quantity: 6 }], outputs: [{ name: "Plate", quantity: 3 }], power_multiplier: 1 }] },
    { id: "PressT2", name: "Press II", category: "General", next_tier: "", workers: 6, maintenance_cost_units: "Maintenance I", maintenance_cost_quantity: 3,
      electricity_consumed: 200, electricity_generated: 0, computing_consumed: 0, storage_capacity: 0, build_costs: [],
      recipes: [{ id: "Plate2", name: "Plate", duration: 10, inputs: [{ name: "Iron", quantity: 6 }], outputs: [{ name: "Plate", quantity: 3 }], power_multiplier: 1 }] },
    { id: "Tank", name: "Tank", category: "Storage", next_tier: "", workers: 0, maintenance_cost_units: "", maintenance_cost_quantity: 0,
      electricity_consumed: 0, electricity_generated: 0, computing_consumed: 0, storage_capacity: 500, product_type: "Fluid", build_costs: [], recipes: [] } ] },
  transports: { game_version: "9.9.9", transports: [{ id: "BeltT1", name: "Belt I", category: "Flat", next_tier: "BeltT2", throughput_per_second: 1, electricity_consumed: 0, build_costs: [] },
    { id: "BeltT2", name: "Belt II", category: "Flat", next_tier: "", throughput_per_second: 3.5, electricity_consumed: 0, build_costs: [] }] },
});

describe("importCod", () => {
  const { data, warnings } = importCod(files());
  it("converts and validates", () => {
    expect(warnings).toEqual([]);
    expect(validateGameData(data)).toEqual([]);
    expect(data.meta.gameVersion).toBe("9.9.9");
    expect(data.recipes.map((r) => r.id)).toEqual(["PressT1:Plate1", "PressT2:Plate2"]);
  });
  it("derives tiers, families, workers, power, maintenance, build cost, belts, storages", () => {
    const m = data.machines.find((x) => x.id === "PressT2")!;
    expect([m.tier, m.family, m.workers, m.electricityKw, m.maintenance]).toEqual([2, "Press", 6, 200, { product: "Maintenance I", perMonth: 3 }]);
    expect(data.machines[0].buildCost).toEqual([{ product: "Iron", qty: 10 }]);
    expect(data.transports.map((t) => [t.id, t.tier, t.throughputPerMin])).toEqual([["BeltT1", 1, 60], ["BeltT2", 2, 210]]);
    expect(data.storages).toEqual([{ id: "Tank", name: "Tank", tier: 1, kind: "Fluid", capacity: 500 }]);
  });
  it("warns and recovers when a patch references an unknown product", () => {
    const f = files(); f.machines_and_buildings.machines_and_buildings[0].recipes[0].outputs[0].name = "Gizmo";
    const r = importCod(f);
    expect(r.warnings[0]).toMatch(/unknown product "Gizmo"/);
    expect(validateGameData(r.data)).toEqual([]);
  });
  it("rejects files that aren't exporter output", () => {
    expect(() => importCod({ machines_and_buildings: {}, products: {} })).toThrow(/exporter/);
  });
  it("pickRecipe honours explicit choice, then preferred tier", () => {
    expect(pickRecipe(data, "Plate")!.id).toBe("PressT1:Plate1");
    expect(pickRecipe(data, "Plate", { preferTier: 2 })!.id).toBe("PressT2:Plate2");
    expect(pickRecipe(data, "Plate", { preferTier: 2, choice: { Plate: "PressT1:Plate1" } })!.id).toBe("PressT1:Plate1");
  });
});

describe("diffData (what a patch changed)", () => {
  it("flags changed, added and removed recipes and machine stat changes", () => {
    const a = importCod(files()).data;
    const f = files();
    f.machines_and_buildings.machines_and_buildings[0].recipes[0].outputs[0].quantity = 4;
    f.machines_and_buildings.machines_and_buildings[1].workers = 8;
    f.machines_and_buildings.machines_and_buildings[1].recipes = [];
    f.products.game_version = f.machines_and_buildings.game_version = "10.0.0";
    const d = diffData(a, importCod(f).data);
    expect([d.fromVersion, d.toVersion]).toEqual(["9.9.9", "10.0.0"]);
    expect(d.changedRecipes).toEqual([{ id: "PressT1:Plate1", before: "6 Iron -> 3 Plate / 20s", after: "6 Iron -> 4 Plate / 20s" }]);
    expect(d.removedRecipes).toEqual(["PressT2:Plate2"]);
    expect(d.changedMachines.map((x) => x.id)).toEqual(["PressT2"]);
  });
});

import { isOlderThanCurrent } from "../src/ui/store";
describe("version check", () => {
  it("compares against the current game version", () => {
    expect(isOlderThanCurrent("0.8.1a(b550) - Update 4")).toBe(true);
    expect(isOlderThanCurrent("0.8.1.0")).toBe(true);
    expect(isOlderThanCurrent("0.8.7d")).toBe(true);
    expect(isOlderThanCurrent("0.8.8d")).toBe(false);
    expect(isOlderThanCurrent("0.9.0")).toBe(false);
    expect(isOlderThanCurrent("nonsense")).toBeNull();
  });
});

import { exportBackup, importBackup } from "../src/ui/store";
describe("backup", () => {
  it("rejects files that are not backups", () => {
    expect(() => importBackup('{"a":1}')).toThrow(/not a Factory Planner backup/);
    expect(() => importBackup("not json")).toThrow();
  });
  it("round-trips through localStorage", () => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = { get length() { return store.size; }, key: (i: number) => [...store.keys()][i] ?? null, getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
    store.set("coi-rate", "48"); store.set("other", "x");
    const b = exportBackup();
    store.clear();
    expect(importBackup(b)).toBe(1);
    expect(store.get("coi-rate")).toBe("48"); expect(store.has("other")).toBe(false);
  });
});
