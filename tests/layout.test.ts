import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import type { GameData } from "../src/data/schema";
import { autoArrange, connections, overlapping, rotatePort, sizeOf, worldPorts, type Placed } from "../src/engine/layout";

const d: GameData = JSON.parse(readFileSync("data/0.8.8d/gamedata.json", "utf8"));
const M = new Map(d.machines.map((m) => [m.id, m]));
const mill = M.get("FoodMill")!;

describe("layout geometry", () => {
  it("four quarter turns bring every port back, and ports stay on the footprint edge", () => {
    for (const m of d.machines) for (const p of m.ports ?? []) {
      const f = m.footprint!;
      expect(rotatePort(p, f.w, f.h, 4)).toEqual(p);
      for (let r = 0; r < 4; r++) {
        const q = rotatePort(p, f.w, f.h, r), s = sizeOf(m, r);
        expect(q.x).toBeGreaterThanOrEqual(0); expect(q.x).toBeLessThan(s.w); expect(q.y).toBeGreaterThanOrEqual(0); expect(q.y).toBeLessThan(s.h);
      }
    }
  });
  it("a mill's output faces east, and a quarter turn makes it face north", () => {
    const x = (rot: number) => worldPorts(mill, { id: "a", machineId: "FoodMill", x: 0, y: 0, rot }).find((p) => p.name === "X")!;
    expect(x(0)).toMatchObject({ dir: "E", wx: 7, wy: 3 });
    expect(x(1)).toMatchObject({ dir: "N" });
    expect(sizeOf(mill, 1)).toEqual({ w: 5, h: 8 });
  });
  it("detects overlaps", () => {
    const a: Placed = { id: "a", machineId: "FoodMill", x: 0, y: 0, rot: 0 };
    expect(overlapping(M, [a, { ...a, id: "b", x: 7 }]).size).toBe(2);
    expect(overlapping(M, [a, { ...a, id: "b", x: 8 }]).size).toBe(0);
  });
  it("connects facing ports of the same shape (output into input)", () => {
    const out = d.machines.find((m) => m.ports?.some((p) => p.io === "out" && p.kind.includes("Flat")) && m.ports.some((p) => p.io === "in" && p.kind.includes("Flat")))!;
    const a: Placed = { id: "a", machineId: out.id, x: 0, y: 0, rot: 0 };
    // find an east-facing flat output and a west-facing flat input and place a copy so they touch
    const o = worldPorts(out, a).find((p) => p.io === "out" && p.kind.includes("Flat") && p.dir === "E");
    const i = worldPorts(out, a).find((p) => p.io === "in" && p.kind.includes("Flat") && p.dir === "W");
    if (o && i) {
      const b: Placed = { id: "b", machineId: out.id, x: o.wx + 1 - i.wx, y: o.wy - i.wy, rot: 0 };
      expect(connections(M, [a, b]).length).toBeGreaterThanOrEqual(1);
    }
    expect(connections(M, [a, { ...a, id: "b", x: 50 }])).toEqual([]);
  });
  it("auto-arrange places without overlap", () => {
    const placed = autoArrange([{ machineId: "FoodMill", count: 9 }, { machineId: "AssemblyRoboticT2", count: 3 }], M);
    expect(placed).toHaveLength(12);
    expect(overlapping(M, placed).size).toBe(0);
  });
});
