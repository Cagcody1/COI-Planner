/** Fraction of the belt each item gets, plus a human description of the balancer setup. */
export interface Mix { f: Record<string, number>; desc: string }
export type MergeMode = "exact" | "best" | "one";

const multisets = (n: number, k: number, start = 0): number[][] => {
  if (k === 0) return [[]];
  const out: number[][] = [];
  for (let i = start; i < n; i++) for (const rest of multisets(n, k - 1, i)) out.push([i, ...rest]);
  return out;
};

/**
 * Pick the belt mix for a recipe's inputs `q` (item -> qty per cycle).
 * "best": enumerate a single balancer (2-3 inputs) or a sub-balancer feeding a final balancer;
 * score = min_i(fraction_i / qty_i); ties -> fewer balancers, then fewer ports.
 */
export function mixFor(q: Record<string, number>, mode: MergeMode, label: (i: string) => string = (x) => x): Mix {
  const items = Object.keys(q), m = items.length;
  if (m === 1) return { f: { [items[0]]: 1 }, desc: "No balancer: feed straight onto the merge" };
  if (mode === "exact") {
    const s = items.reduce((a, i) => a + q[i], 0);
    return { f: Object.fromEntries(items.map((i) => [i, q[i] / s])), desc: "Exact recipe ratio (feeds throttled to rate, no balancer needed)" };
  }
  if (mode === "one") {
    return { f: Object.fromEntries(items.map((i) => [i, 1 / m])), desc: "One balancer: " + items.map(label).join(" + ") };
  }
  const vec = (i: number) => items.map((_, j) => (j === i ? 1 : 0));
  const avg = (vs: number[][]) => vs[0].map((_, j) => vs.reduce((a, v) => a + v[j], 0) / vs.length);
  const nm = (i: number) => label(items[i]);
  type Cand = { v: number[]; desc: string; nb: number; p: number; sc?: number };
  const cands: Cand[] = [];
  for (const k of [2, 3]) for (const s of multisets(m, k)) cands.push({ v: avg(s.map(vec)), desc: "One balancer: " + s.map(nm).join(" + "), nb: 1, p: k });
  for (const ks of [2, 3]) for (const sub of multisets(m, ks)) {
    if (new Set(sub).size < 2) continue;
    const sv = avg(sub.map(vec));
    for (const kf of [2, 3]) for (const rest of multisets(m, kf - 1))
      cands.push({ v: avg([sv, ...rest.map(vec)]), desc: `Balancer A: ${sub.map(nm).join(" + ")}, then Balancer B: A + ${rest.map(nm).join(" + ")}`, nb: 2, p: ks + kf });
  }
  let best: Cand | null = null;
  for (const x of cands) {
    if (x.v.some((y) => y <= 0)) continue;
    x.sc = Math.min(...items.map((it, j) => x.v[j] / q[it]));
    if (!best || x.sc > best.sc! + 1e-9 || (Math.abs(x.sc - best.sc!) < 1e-9 && (x.nb < best.nb || (x.nb === best.nb && x.p < best.p)))) best = x;
  }
  return { f: Object.fromEntries(items.map((it, j) => [it, best!.v[j]])), desc: best!.desc };
}

/** Smallest small-integer ratio string for an array of positive numbers, e.g. "3 : 1". */
export function ratioStr(arr: number[]): string {
  const mn = Math.min(...arr.filter((x) => x > 0));
  if (!isFinite(mn)) return "";
  for (let m = 1; m <= 12; m++) {
    const v = arr.map((x) => (x / mn) * m);
    if (v.every((x) => Math.abs(x - Math.round(x)) < 0.06)) return v.map((x) => Math.round(x)).join(" : ");
  }
  return arr.map((x) => (Math.round((x / mn) * 10) / 10).toString()).join(" : ");
}
