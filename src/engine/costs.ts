import type { GameData } from "../data/schema";

export interface CostTotals {
  /** whole machines to build (ceil of the exact count) */
  built: Record<string, number>;
  workers: number;
  electricityMw: number;
  computing: number;
  /** maintenance product -> units per month (exact machine use) */
  maintenancePerMonth: Record<string, number>;
  /** product -> units needed to construct the built machines */
  buildCost: Record<string, number>;
}

/**
 * Totals for a design. `exact` is machine id -> fractional count from the solver.
 * Workers and construction use whole machines (you can't build 0.4 of one);
 * maintenance uses the exact count, since idle machines still cost (upstream notes ~30%), so this is a lower bound.
 */
export function totalCosts(data: GameData, exact: Record<string, number>): CostTotals {
  const byId = new Map(data.machines.map((m) => [m.id, m]));
  const t: CostTotals = { built: {}, workers: 0, electricityMw: 0, computing: 0, maintenancePerMonth: {}, buildCost: {} };
  for (const [id, n] of Object.entries(exact)) {
    const m = byId.get(id);
    if (!m) throw new Error(`unknown machine ${id}`);
    const whole = Math.ceil(n - 1e-9);
    t.built[id] = whole;
    t.workers += whole * (m.workers ?? 0);
    t.electricityMw += (whole * (m.electricityKw ?? 0)) / 1000;
    t.computing += whole * (m.computing ?? 0);
    if (m.maintenance) t.maintenancePerMonth[m.maintenance.product] = (t.maintenancePerMonth[m.maintenance.product] ?? 0) + whole * m.maintenance.perMonth;
    for (const c of m.buildCost ?? []) t.buildCost[c.product] = (t.buildCost[c.product] ?? 0) + whole * c.qty;
  }
  return t;
}
