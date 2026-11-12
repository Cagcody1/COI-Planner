// Shrinks a (possibly huge) PlannerDataExporter file to a small summary: per prototype type, a count, a few ids,
// every field path seen with its value type, and a trimmed example. Meant to be sent for writing/adjusting the importer.
type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
export interface ExportSummary {
  summaryOf: string; gameVersion: unknown; exporter: unknown; protoCount: unknown; errors: unknown;
  types: Record<string, { count: number; ids: string[]; fieldPaths: Record<string, string>; example: Json; extraExamples?: Json[] }>;
}

const KEYS_WITH_BIG_LISTS = /layout|port|tile|cell|slot/i;

/** Copy of `v` with long arrays cut to `arr` items (with a note), deep nesting cut at `maxDepth`, long strings cut. */
export function shrink(v: unknown, arr: number, maxDepth: number, depth = 0, key = ""): Json {
  if (v === null || typeof v === "boolean" || typeof v === "number") return v as Json;
  if (typeof v === "string") return v.length > 80 ? v.slice(0, 80) + "…" : v;
  const limit = KEYS_WITH_BIG_LISTS.test(key) ? arr * 4 : arr;      // layouts/ports are what we need most: keep more of them
  if (Array.isArray(v)) {
    if (depth >= maxDepth) return `[array of ${v.length}]`;
    const out: Json[] = v.slice(0, limit).map((x) => shrink(x, arr, maxDepth, depth + 1, key));
    if (v.length > limit) out.push(`… ${v.length - limit} more items`);
    return out;
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (depth >= maxDepth) return `{${Object.keys(o).slice(0, 12).join(", ")}${Object.keys(o).length > 12 ? ", …" : ""}}`;
    const out: { [k: string]: Json } = {};
    for (const k of Object.keys(o)) out[k] = shrink(o[k], arr, maxDepth, depth + 1, k);
    return out;
  }
  return String(v);
}

function collectPaths(v: unknown, prefix: string, out: Record<string, Set<string>>, depth: number) {
  const seg = prefix.split(".");
  if (seg.length >= 2 && seg[seg.length - 1] === seg[seg.length - 2]) return;      // Abs.Abs.Abs...: a value returning itself
  const type = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
  (out[prefix || "$"] ??= new Set()).add(type);
  if (depth > 7 || Object.keys(out).length > 200) return;
  if (Array.isArray(v)) { for (const x of v.slice(0, 3)) collectPaths(x, prefix + "[]", out, depth + 1); }
  else if (v && typeof v === "object") for (const [k, x] of Object.entries(v as object)) collectPaths(x, prefix ? prefix + "." + k : k, out, depth + 1);
}

const size = (v: unknown) => JSON.stringify(v).length;

export function summarizeExport(pkg: any, budgetPerType = 9000): ExportSummary {
  if (!pkg || typeof pkg !== "object" || !pkg.protos) throw new Error("That is not a PlannerDataExporter file (no 'protos').");
  const types: ExportSummary["types"] = {};
  for (const [type, list] of Object.entries<any[]>(pkg.protos)) {
    const paths: Record<string, Set<string>> = {};
    for (const e of list.slice(0, 40)) collectPaths(e.data, "", paths, 0);
    // example: first entry, shrunk harder until it fits the budget
    let example: Json = null;
    for (const [arr, depth] of [[8, 7], [5, 6], [3, 5], [2, 4], [1, 3]] as const) {
      example = { id: list[0].id, name: list[0].name, data: shrink(list[0].data, arr, depth) } as Json;
      if (size(example) <= budgetPerType) break;
    }
    const extras: Json[] = [];
    for (const e of list.slice(1)) {                      // a second, differently-shaped example helps a lot
      if (extras.length >= 1) break;
      if (JSON.stringify(Object.keys(e.data ?? {})) !== JSON.stringify(Object.keys(list[0].data ?? {}))) extras.push({ id: e.id, name: e.name, data: shrink(e.data, 3, 4) } as Json);
    }
    types[type] = {
      count: list.length, ids: list.slice(0, 6).map((e) => e.id),
      fieldPaths: Object.fromEntries(Object.entries(paths).slice(0, 150).map(([p, t]) => [p, [...t].join("|")])),
      example, ...(extras.length ? { extraExamples: extras } : {}),
    };
  }
  return { summaryOf: "PlannerDataExporter export", gameVersion: pkg.gameVersion, exporter: pkg.exporter, protoCount: pkg.protoCount, errors: Array.isArray(pkg.errors) ? pkg.errors.slice(0, 20) : pkg.errors, types };
}
