import type { GameData, Recipe } from "../data/schema";
import { producers, qtyOf } from "./rates";

export interface ChainOptions {
  /** product id -> recipe id to use (default: first producer in data order). */
  choice?: Record<string, string>;
  /** products to stop at (treated as brought in), like "iron comes by train". */
  supplied?: Set<string> | string[];
  maxDepth?: number;
  /** when no explicit choice: use the producer whose machine tier is closest to this (ties: lower tier). */
  preferTier?: number;
  /** stop at base resources (ores, water, crude oil ...) unless a recipe was chosen for them explicitly. Implied by preferTier. */
  autoRaw?: boolean;
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

const rawCache = new WeakMap<GameData, Set<string>>();
const isTrade = (r: Recipe) => r.machineId.startsWith("Contract");
/** Mined, pumped or harvested in game even where a recipe can also make them. Names that don't exist in the data are ignored. */
export const BASE_RESOURCES = ["Coal", "Water", "Seawater", "Crude oil", "Wood", "Rock", "Dirt"];
/**
 * Base resources: every product that no real (non-trade) recipe makes from other products, i.e. ores, limestone, quartz and
 * wood, which the game mines or harvests; products made from nothing (pumps); plus BASE_RESOURCES.
 */
export function rawProducts(data: GameData): Set<string> {
  let s = rawCache.get(data);
  if (!s) {
    const made = new Set<string>(), fromNothing = new Set<string>();
    for (const r of data.recipes) if (!isTrade(r)) for (const o of r.outputs) { made.add(o.product); if (r.inputs.length === 0) fromNothing.add(o.product); }
    s = new Set(data.products.filter((p) => p.kind !== "virtual" && (!made.has(p.id) || fromNothing.has(p.id) || BASE_RESOURCES.includes(p.id))).map((p) => p.id));
    rawCache.set(data, s);
  }
  return s;
}

/**
 * The recipe used for `product`: explicit choice; else (with preferTier) a sensible default: never a trade contract,
 * prefer recipes whose inputs are all base resources, then the machine nearest preferTier; else the first in data order.
 */
export function pickRecipe(data: GameData, product: string, opt: Pick<ChainOptions, "choice" | "preferTier"> = {}): Recipe | undefined {
  const ps = producers(data, product);
  const chosen = ps.find((r) => r.id === opt.choice?.[product]);
  if (chosen || opt.preferTier === undefined) return chosen ?? ps[0];
  const raw = rawProducts(data);
  const tier = (r: Recipe) => data.machines.find((m) => m.id === r.machineId)?.tier ?? 1;
  const cands = ps.filter((r) => !isTrade(r));
  const pool = cands.length ? cands : ps;  // only trade recipes: caller stops at raw anyway
  const nonRaw = (r: Recipe) => r.inputs.filter((i) => !raw.has(i.product)).length;
  const want = opt.preferTier;
  return [...pool].sort((a, b) => nonRaw(a) - nonRaw(b) || Math.abs(tier(a) - want) - Math.abs(tier(b) - want) || tier(a) - tier(b))[0];
}

/**
 * Recursive expansion (PLAN.md section 3, first stage). Byproducts are reported, not recycled;
 * the LP solver replaces this when cycles / recycling matter.
 */
export function solveChain(data: GameData, target: string, perMin: number, opt: ChainOptions = {}): ChainResult {
  const supplied = new Set(opt.supplied ?? []);
  const machines: Record<string, number> = {}, inputs: Record<string, number> = {}, made: Record<string, number> = {}, used: Record<string, number> = {};
  const pick = (product: string) => pickRecipe(data, product, opt);
  const walk = (product: string, need: number, depth: number, path: string[]): ChainNode => {
    const node: ChainNode = { product, perMin: need, children: [] };
    const r = pick(product);
    const autoRaw = (opt.autoRaw ?? opt.preferTier !== undefined) && depth > 0 && rawProducts(data).has(product) && !opt.choice?.[product];
    const stop = !r || autoRaw ? "raw" : supplied.has(product) && depth > 0 ? "supplied" : path.includes(product) || depth > (opt.maxDepth ?? 24) ? "loop" : undefined;
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
