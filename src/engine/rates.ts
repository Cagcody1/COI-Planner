import type { GameData, Recipe } from "../data/schema";

/** Per-minute rate = qty * 60 / durationSec. */
export const perMin = (qty: number, durationSec: number) => (qty * 60) / durationSec;

export const qtyOf = (stacks: { product: string; qty: number }[], product: string) =>
  stacks.find((s) => s.product === product)?.qty ?? 0;

export const inputsRecord = (r: Recipe) => Object.fromEntries(r.inputs.map((s) => [s.product, s.qty]));

export const recipeRate = (r: Recipe, product: string, side: "inputs" | "outputs") =>
  perMin(qtyOf(r[side], product), r.durationSec);

/** Recipes on `machineId` that output `product`. */
export const recipesFor = (d: GameData, product: string, machineId: string) =>
  d.recipes.filter((r) => r.machineId === machineId && qtyOf(r.outputs, product) > 0);

export const producers = (d: GameData, product: string) => d.recipes.filter((r) => qtyOf(r.outputs, product) > 0);

export const fmt = (x: number, dec = 1) =>
  (Math.round(x * 10 ** dec) / 10 ** dec).toLocaleString("en-US", { maximumFractionDigits: dec });
