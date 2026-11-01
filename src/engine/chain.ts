import type { GameData, Recipe } from "../data/schema";
import { producers, qtyOf } from "./rates";

export interface ChainOptions {
  /** product id -> recipe id to use (default: first producer in data order). */
  choice?: Record<string, string>;
  /** products to stop at (treated as brought in), like "iron comes by train". */
  supplied?: Set<string> | string[];
  maxDepth?: number;
}
export interface ChainNode {
  product: string; perMin: number; recipe?: Recipe; machines?: number;
  /** "raw" = no recipe exists, "supplied" = user stopped here, "loop" = cycle guard hit */
  stop?: "raw" | "supplied" | "loop"; children: ChainNode[];
}
export interface ChainResult {
  tree: ChainNode;
  /** machine id -> exact (fractional) count */
  machines: Record<string, number>;
  /** raw and supplied inputs, per minute */
  inputs: Record<string, number>;
  /** co-products made but not consumed by the chain, per minute */
  byproducts: Record<string, number>;
}

/**
 * Recursive expansion (PLAN.md section 3, first stage). Byproducts are reported, not recycled;
 * the LP solver replaces this when cycles / recycling matter.
 */
export function solveChain(data: GameData, target: string, perMin: number, opt: ChainOptions = {}): ChainResult {
  const supplied = new Set(opt.supplied ?? []);
  const machines: Record<string, number> = {}, inputs: Record<string, number> = {}, made: Record<string, number> = {}, used: Record<string, number> = {};
  const pick = (product: string): Recipe | undefined => {
    const ps = producers(data, product);
    return ps.find((r) => r.id === opt.choice?.[product]) ?? ps[0];
  };
  const walk = (product: string, need: number, depth: number, path: string[]): ChainNode => {
    const node: ChainNode = { product, perMin: need, children: [] };
    const r = pick(product);
    const stop = !r ? "raw" : supplied.has(product) && depth > 0 ? "supplied" : path.includes(product) || depth > (opt.maxDepth ?? 24) ? "loop" : undefined;
    if (stop) {
      node.stop = stop; node.recipe = stop === "raw" ? undefined : r;
      inputs[product] = (inputs[product] ?? 0) + need;
      return node;
    }
    const recipe = r!;
    const n = need / ((qtyOf(recipe.outputs, product) * 60) / recipe.durationSec);
    node.recipe = recipe; node.machines = n;
    machines[recipe.machineId] = (machines[recipe.machineId] ?? 0) + n;
    for (const o of recipe.outputs) made[o.product] = (made[o.product] ?? 0) + (o.qty * 60 / recipe.durationSec) * n;
    for (const i of recipe.inputs) {
      const rate = (i.qty * 60 / recipe.durationSec) * n;
      used[i.product] = (used[i.product] ?? 0) + rate;
      node.children.push(walk(i.product, rate, depth + 1, [...path, product]));
    }
    return node;
  };
  const tree = walk(target, perMin, 0, []);
  const byproducts: Record<string, number> = {};
  for (const [p, q] of Object.entries(made)) {
    const left = q - (used[p] ?? 0) - (p === target ? perMin : 0);
    if (left > 1e-9) byproducts[p] = left;
  }
  return { tree, machines, inputs, byproducts };
}
