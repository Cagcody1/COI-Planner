import { describe, it, expect } from "vitest";
import { shrink, summarizeExport } from "../src/data/summarize";

const bigPkg = () => ({
  gameVersion: "0.8.7d", exporter: "PlannerDataExporter 0.1.1", protoCount: 3, errors: [],
  protos: {
    "Mafi.Machines.MachineProto": [
      { id: "AssemblyElectrifiedT2", name: "Assembly III", data: { type: "MachineProto", Layout: { type: "EntityLayout", Size: [5, 3], LayoutTiles: Array.from({ length: 5000 }, (_, i) => ({ x: i, y: 0, h: 2 })), Ports: Array.from({ length: 12 }, (_, i) => ({ X: i, Dir: "N" })) },
        Workers: { type: "Quantity", Value: 8 }, RecipeBindings: Array.from({ length: 500 }, (_, i) => ({ protoId: "r" + i })), Long: "x".repeat(500) } },
      { id: "Other", name: "Other", data: { type: "MachineProto", Extra: 1 } },
    ],
    "Mafi.Storages.StorageProto": [{ id: "UnitStorage", name: "Unit Storage", data: { Capacity: { Value: 1600 }, TransferLimit: { Value: 30 } } }],
  },
});

describe("export summary", () => {
  it("is tiny compared with the export but keeps structure, counts, examples and layouts", () => {
    const pkg = bigPkg(); const full = JSON.stringify(pkg).length;
    const s = summarizeExport(pkg); const out = JSON.stringify(s);
    expect(full).toBeGreaterThan(100_000); expect(out.length).toBeLessThan(25_000);
    expect(s.gameVersion).toBe("0.8.7d");
    const m = s.types["Mafi.Machines.MachineProto"];
    expect(m.count).toBe(2); expect(m.ids).toEqual(["AssemblyElectrifiedT2", "Other"]);
    expect(Object.keys(m.fieldPaths)).toEqual(expect.arrayContaining(["Layout.Size", "Layout.LayoutTiles[].x", "Workers.Value", "Layout.Ports[].Dir"]));
    expect(out).toContain("more items");                      // long lists are cut with a note
    expect(JSON.stringify(m.example)).toContain('"Size"');    // layout survives
    expect(m.extraExamples?.length).toBe(1);                  // a differently shaped second example
    expect(s.types["Mafi.Storages.StorageProto"].example).toMatchObject({ id: "UnitStorage" });
  });
  it("shrink cuts arrays, depth and long strings without changing the input", () => {
    const input = { a: [1, 2, 3, 4, 5], deep: { x: { y: { z: 1 } } }, s: "y".repeat(200) };
    const copy = JSON.stringify(input);
    const r = shrink(input, 2, 2) as any;
    expect(r.a).toEqual([1, 2, "… 3 more items"]); expect(r.deep.x).toMatch(/^\{/); expect(r.s.length).toBeLessThan(100);
    expect(JSON.stringify(input)).toBe(copy);
  });
  it("rejects files that are not exports", () => { expect(() => summarizeExport({ a: 1 })).toThrow(/PlannerDataExporter/); });
});
