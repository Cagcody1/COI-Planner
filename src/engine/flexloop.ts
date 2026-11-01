import type { GameData, Recipe } from "../data/schema";
import { inputsRecord, qtyOf, recipesFor } from "./rates";
import { mixFor, type Mix, type MergeMode } from "./balancer";

export interface LineTier { product: string; short: string; variants?: boolean }
export interface ProductLine { id: string; name: string; base: string; tiers: LineTier[] }

export interface Design {
  line: string; tier: string; n: number; belt: number; store: number; top: number;
  variant: string; mode: "phases" | "blend";
  src: ("make" | "import")[]; merge: MergeMode[];
  /** matrix[assembler][tier] = recipe enabled */
  matrix: boolean[][];
}
export interface Issue { sev: "bad" | "warn" | "info"; k?: number; item?: string; msg: string }
export interface TierResult {
  k: number; t: LineTier; r: Recipe; q: Record<string, number>; o: number; rate: number; mix: Mix;
  nk: number; Pbelt: number; Pasm: number; P: number; lim: "belt" | "assemblers"; bpu: number;
  time?: number | null; flow?: number; ret?: number;
}
export interface EngineResult {
  issues: Issue[]; bad: boolean; act: number[]; T: Record<number, TierResult>; need: Record<number, number>;
  W: number; Wph: number; Wbl: number; blLim: string; feeds: Record<string, number>;
  busy: number; useful: number; maxRet: number; maxOut: number; B: number;
}

export const fullMatrix = (n: number, tiers: number): boolean[][] => Array.from({ length: n }, () => Array(tiers).fill(true));

/** Pure model from PLAN.md section 4. `shortName` is only used to word messages. */
export function engine(data: GameData, L: ProductLine, D: Design, over: Partial<Design> & { allOn?: boolean } = {}): EngineResult {
  const C = { ...D, ...over };
  const B = +C.belt, issues: Issue[] = [];
  const sn = (p: string) => L.tiers.find((t) => t.product === p)?.short ?? p;
  const matrix = over.allOn ? fullMatrix(C.n, L.tiers.length) : C.matrix;
  const act: number[] = [];
  let lowestImported: number | null = null;
  for (let k = C.top; k >= 0; k--) {
    if (k < C.top && C.src[k] === "import") { lowestImported = k; break; }
    act.unshift(k);
  }
  const T: Record<number, TierResult> = {};
  const fail = (msg: string, k: number): EngineResult => {
    issues.push({ sev: "bad", k, msg });
    return { issues, bad: true, act, T, need: {}, W: 0, Wph: 0, Wbl: 0, blLim: "", feeds: {}, busy: 0, useful: 0, maxRet: 0, maxOut: 0, B };
  };
  for (const k of act) {
    const t = L.tiers[k];
    const rs = recipesFor(data, t.product, C.tier);
    const r = t.variants ? rs.find((x) => x.label === C.variant) : rs[0];
    if (!r) return fail(`${t.short} can't be made on ${C.tier}${t.variants ? " with the " + C.variant.replace("from ", "").toLowerCase() + " recipe" : ""}. Choose a higher assembler tier, another recipe, or a lower final product.`, k);
    const q = inputsRecord(r), o = qtyOf(r.outputs, t.product), rate = (o * 60) / r.durationSec;
    const mix = mixFor(q, C.merge[k] ?? "best", sn);
    const cyc = Math.min(...Object.keys(q).map((i) => (B * mix.f[i]) / q[i]));
    const Pbelt = cyc * o;
    const nk = matrix.filter((a) => a[k]).length, Pasm = nk * rate;
    T[k] = { k, t, r, q, o, rate, mix, nk, Pbelt, Pasm, P: Math.min(Pbelt, Pasm), lim: Pasm <= Pbelt + 1e-9 ? "assemblers" : "belt", bpu: Math.max(...Object.keys(q).map((i) => q[i] / mix.f[i])) / o };
    if (nk === 0) issues.push({ sev: "bad", k, msg: `No assembler has the ${t.short} recipe turned on, so nothing above it can be made.` });
  }
  const need: Record<number, number> = { [C.top]: 1 };
  for (let i = act.length - 1; i > 0; i--) { const k = act[i], lo = act[i - 1]; need[lo] = need[k] * (T[k].q[L.tiers[lo].product] || 0) / T[k].o; }
  let W = 0;
  if (act.every((k) => T[k].P > 0)) W = 1 / act.reduce((a, k) => a + need[k] / T[k].P, 0);
  // throttled / blended model
  const Wa = C.n / act.reduce((a, k) => a + need[k] / T[k].rate, 0);
  const Wk = Math.min(...act.map((k) => (T[k].nk ? (T[k].nk * T[k].rate) / need[k] : 0)));
  const Wb = B / act.reduce((a, k) => a + need[k] * T[k].bpu, 0);
  const Wbl = Math.min(Wa, Wk, Wb), blLim = Wbl === Wb ? "belt" : "assemblers";
  const mode = C.mode, Wuse = mode === "blend" ? Wbl : W;
  const feeds: Record<string, number> = {};
  const loopProd = new Set(act.map((k) => L.tiers[k].product));
  let busy = 0, useful = 0, maxRet = 0, maxOut = 0;
  for (const k of act) {
    const x = T[k];
    x.time = mode === "blend" ? null : (need[k] * W) / x.P;
    const cyc = (need[k] * Wuse) / x.o; x.flow = need[k] * Wuse;
    for (const i in x.q) if (!loopProd.has(i)) feeds[i] = (feeds[i] || 0) + cyc * x.q[i];
    const cons = Object.keys(x.q).reduce((a, i) => a + (x.P / x.o) * x.q[i], 0);
    x.ret = Math.max(0, B - cons);
    if (mode === "phases") { busy += x.time! * (x.P / x.rate); useful += x.time! * cons; maxRet = Math.max(maxRet, x.ret); maxOut = Math.max(maxOut, x.P); }
    for (const i in x.q) {
      const r = B * x.mix.f[i];
      if (mode === "phases" && r > C.store + 1e-9) issues.push({ sev: "warn", k, item: i, msg: `In the ${x.t.short} phase, ${sn(i)} has to come off storage at ${Math.round(r * 10) / 10}/min, more than one storage's ${C.store}/min. Feed it from two storages or use Unit Storage II.` });
    }
    if (mode === "phases" && x.nk < C.n) issues.push({ sev: "warn", k, msg: `In the ${x.t.short} phase, ${C.n - x.nk} assembler${C.n - x.nk > 1 ? "s" : ""} without that recipe sit idle. With priority balancers, turn every recipe on in every assembler.` });
    if (x.lim === "belt" && mode === "phases") issues.push({ sev: "info", k, msg: `${x.t.short} phase is limited by the belt: only ${Math.round((x.P / x.rate) * 10) / 10} of ${x.nk} assemblers can be kept busy.` });
  }
  if (mode === "blend") {
    busy = act.reduce((a, k) => a + (need[k] * Wbl) / T[k].rate, 0) / C.n;
    useful = act.reduce((a, k) => a + need[k] * Wbl * T[k].bpu, 0);
    maxOut = act.reduce((a, k) => a + need[k] * Wbl, 0);
    issues.push({ sev: "info", msg: `Throttled mode assumes each tier's mix is rate-capped so all tiers share the belt. Reaching ${Math.round(Wbl * 100) / 100}/min needs the caps set close to the feed rates.` });
  } else {
    busy = busy / C.n;
    if (maxRet > 0) issues.push({ sev: "info", msg: `Up to ${Math.round(maxRet * 10) / 10}/min goes around unused and must be pulled off by the sorters before the merge.` });
  }
  if (maxOut > B) issues.push({ sev: "bad", msg: `The output belt would need ${Math.round(maxOut * 10) / 10}/min, more than the belt carries. Use a faster output belt or two output belts.` });
  if (lowestImported !== null) issues.push({ sev: "info", msg: `${L.tiers[lowestImported].short} is brought in, so tiers below it aren't built here.` });
  return { issues, bad: false, act, T, need, W: Wuse, Wph: W, Wbl, blLim, feeds, busy, useful, maxRet, maxOut, B };
}
