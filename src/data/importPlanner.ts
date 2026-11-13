// Converts the JSON written by our own PlannerDataExporter mod (a reflective dump of the game's prototypes) into GameData.
// Pure and browser-safe. Product ids are the in-game display names (made unique if two products share a name).
import type { GameData, Machine, Port, Product, ProductKind, Recipe, ResearchNode, Stack, Storage, Transport, Unlock } from "./schema";

export interface ImportResult { data: GameData; warnings: string[] }

const TICKS_PER_SEC = 10;
const KIND_BY_TYPE: Record<string, ProductKind> = {
  CountableProductProto: "unit", LooseProductProto: "loose", FluidProductProto: "fluid", MoltenProductProto: "molten",
  VirtualProductProto: "virtual", VirtualResourceProductProto: "virtual", MixedMemberProductProto: "loose",
};
const DIRS = ["E", "N", "W", "S"] as const;     // Direction90 index 0..3; 0 = +X (checked against the port positions on the buildings)

const short = (t: string) => t.slice(t.lastIndexOf(".") + 1);
const num = (v: any): number => (typeof v === "number" ? v : typeof v?.Value === "number" ? v.Value : typeof v?.Value?.RawValue === "number" ? v.Value.RawValue / 1024 : typeof v?.RawValue === "number" ? v.RawValue : 0);
const fix = (v: any): number => (typeof v?.Value?.RawValue === "number" ? v.Value.RawValue / 1024 : num(v));      // Fix32 quantities
const ref = (v: any): string | null => (v && typeof v.protoId === "string" ? v.protoId : v?.some?.protoId ?? null);
const ticks = (v: any): number => (typeof v?.Ticks === "number" ? v.Ticks : 0);
const text = (v: any): string | undefined => (typeof v === "string" ? v : typeof v?.Value === "string" ? v.Value : typeof v?.TranslatedString === "string" ? v.TranslatedString : undefined);

export function isPlannerExport(j: any): boolean { return !!j && typeof j === "object" && typeof j.protos === "object" && typeof j.exporter === "string"; }

export function importPlanner(json: any, exportedAt = json?.exportedAt ?? new Date().toISOString()): ImportResult {
  if (!isPlannerExport(json)) throw new Error("This is not an export from the Planner Data Exporter.");
  const warnings: string[] = [];
  const all: { type: string; id: string; name: string; d: any }[] = [];
  for (const [type, list] of Object.entries<any[]>(json.protos)) for (const p of list) all.push({ type: short(type), id: p.id, name: p.name || p.id, d: p.data ?? {} });
  const of = (...types: string[]) => all.filter((x) => types.includes(x.type));

  // ---- products ------------------------------------------------------------------------------
  const protoKind = new Map<string, { name: string; kind: ProductKind; label: string }>();
  for (const x of all) if (KIND_BY_TYPE[x.type]) protoKind.set(x.id, { name: x.name, kind: KIND_BY_TYPE[x.type], label: x.type === "MixedMemberProductProto" ? "mixed" : x.type === "VirtualResourceProductProto" ? "resource" : KIND_BY_TYPE[x.type] });
  const pid = new Map<string, string>();          // proto id -> product id
  const products = new Map<string, Product>();
  // The real product keeps its plain name; mixed-category stand-ins ("Iron scrap (mixed)") and other repeats get a suffix.
  for (const [id, v] of [...protoKind].sort((a, b) => Number(a[1].label === "mixed") - Number(b[1].label === "mixed"))) {
    let name = v.name;
    if (products.has(name)) name = `${v.name} (${v.label})`;
    while (products.has(name)) name += "'";
    pid.set(id, name);
    products.set(name, { id: name, name, kind: v.kind });
  }
  const P = (proto: string, where: string): string => {
    const got = pid.get(proto);
    if (got) return got;
    const name = proto.replace(/^Product_/, "");
    pid.set(proto, name);
    if (!products.has(name)) { products.set(name, { id: name, name, kind: "unit" }); warnings.push(`${where} refers to unknown product ${proto}; added as unit`); }
    return name;
  };

  // ---- research (also tells which research unlocks each machine / recipe) --------------------
  const research: ResearchNode[] = [];
  const unlockOf = new Map<string, string>();      // "machine" or "machine:recipe" -> research id
  // every building that runs recipes through bindings counts as a machine (MachineProto and its subclasses: pumps, depots, dumps ...)
  const machineProtos = all.filter((x) => Array.isArray(x.d.RecipeBindings));
  const machineName = new Map(machineProtos.map((m) => [m.id, m.name]));
  for (const n of of("ResearchNodeProto")) {
    const unlocks: Unlock[] = [];
    for (const u of n.d.Units ?? []) {
      const t = short(u.type ?? ""), id = ref(u.Proto);
      if (t === "RecipeUnlock" && id) {
        const mach = ref(u.MachineProto) ?? "";
        unlocks.push({ kind: "recipe", id: `${mach}:${id}`, title: id, machine: mach });
        unlockOf.set(`${mach}:${id}`, n.id);
      } else if (t === "ProductUnlock" && id) {
        unlocks.push({ kind: "product", id: P(id, `research ${n.id}`), title: text(u.Title) });
      } else if (id) {
        const isMachine = machineName.has(id);
        unlocks.push({ kind: isMachine ? "machine" : "building", id, title: text(u.Title) ?? id });
        if (isMachine) unlockOf.set(id, n.id);
      } else if (t) unlocks.push({ kind: "other", id: t, title: text(u.Title) ?? t });
    }
    research.push({ id: n.id, name: n.name, durationSec: ticks(n.d.ResearchDuration) / TICKS_PER_SEC, parents: (n.d.Parents ?? []).map(ref).filter(Boolean) as string[],
      x: n.d.GridPosition?.X ?? 0, y: n.d.GridPosition?.Y ?? 0, description: text(n.d.ResolvedDescription), unlocks,
      startUnlocked: n.d.IsUnlockedFromStart || undefined, anyParent: n.d.AnyParentCanUnlock || undefined });
  }

  // ---- machines and recipes ------------------------------------------------------------------
  const recipeProto = new Map(of("RecipeProto").map((r) => [r.id, r.d]));
  const prev = new Map<string, string>();         // tier chain: machine -> previous tier
  for (const m of machineProtos) { const p = ref(m.d.TierData?.PreviousTierIndirect); if (p) prev.set(m.id, p); }
  const tierFamily = (id: string) => { let t = 1, cur = id; const seen = new Set([id]); while (prev.has(cur) && !seen.has(prev.get(cur)!)) { cur = prev.get(cur)!; seen.add(cur); t++; } return { tier: t, family: machineName.get(cur) ?? cur }; };
  const ports = (list: any[] | undefined): Port[] => (list ?? []).map((p) => ({
    x: p.RelativePosition?.X ?? 0, y: p.RelativePosition?.Y ?? 0, dir: DIRS[(p.RelativeDirection?.DirectionIndex ?? 0) & 3],
    kind: ref(p.Shape) ?? "unknown", name: p.Name, io: p.Type === "Input" ? "in" : p.Type === "Output" ? "out" : "any" }));
  const stacks = (arr: any[] | undefined, mult: number, where: string): Stack[] => {
    const out = new Map<string, number>();
    for (const s of arr ?? []) { const q = num(s.Quantity) * mult; if (q > 0 && ref(s.Product)) { const k = P(ref(s.Product)!, where); out.set(k, (out.get(k) ?? 0) + q); } }
    return [...out].map(([product, qty]) => ({ product, qty }));
  };

  const machines: Machine[] = [], recipes: Recipe[] = [];
  for (const m of machineProtos) {
    const { tier, family } = tierFamily(m.id);
    const mach: Machine = { id: m.id, name: m.name, family, tier };
    const workers = m.d.Costs?.Workers; if (workers) mach.workers = workers;
    const bindings: any[] = m.d.RecipeBindings ?? [];
    const power = Math.max(1, ...bindings.map((b) => num(recipeProto.get(ref(b.Recipe) ?? "")?.PowerMultiplier) / 100000 || 1));
    const kw = num(m.d.ElectricityConsumed) * (bindings.length ? power : 1); if (kw) mach.electricityKw = kw;
    const comp = num(m.d.ComputingConsumed); if (comp) mach.computing = comp;
    const mt = m.d.Costs?.Maintenance, mp = ref(mt?.Product), perMonth = fix(mt?.MaintenancePerMonth);
    if (mp && perMonth > 0 && pid.has(mp)) mach.maintenance = { product: P(mp, `${m.id} maintenance`), perMonth };
    const size = m.d.Layout?.LayoutSize; if (size?.X) mach.footprint = { w: size.X, h: size.Y };
    const mp2 = ports(m.d.Layout?.Ports); if (mp2.length) mach.ports = mp2;
    const bc = stacks(m.d.Costs?.BaseConstructionCost?.Products, 1, `${m.id} build cost`); if (bc.length) mach.buildCost = bc;
    if (unlockOf.has(m.id)) mach.unlockedBy = unlockOf.get(m.id);
    machines.push(mach);
    for (const b of bindings) {
      const rid = ref(b.Recipe); const rp = rid ? recipeProto.get(rid) : undefined;
      if (!rid || !rp) { warnings.push(`${m.id}: recipe ${rid} not in the export`); continue; }
      const mult = b.Multiplier > 0 ? b.Multiplier : 1;
      const inputs = stacks(rp.AllInputs, mult, `${m.id}:${rid}`), outputs = stacks(rp.AllOutputs, mult, `${m.id}:${rid}`);
      const dur = ticks(b.Duration) / TICKS_PER_SEC;
      if (!(dur > 0) || (!inputs.length && !outputs.length)) continue;
      const r: Recipe = { id: `${m.id}:${rid}`, label: rid, machineId: m.id, durationSec: dur, inputs, outputs };
      if (unlockOf.has(r.id)) r.unlockedBy = unlockOf.get(r.id);
      recipes.push(r);
    }
  }

  // ---- storages and transports ---------------------------------------------------------------
  const storages: Storage[] = [];
  for (const kindType of [["UnitStorageProto", "unit"], ["LooseStorageProto", "loose"], ["FluidStorageProto", "fluid"]] as const) {
    const list = of(kindType[0]);
    const prevS = new Map(list.map((s) => [s.id, ref(s.d.TierData?.PreviousTierIndirect)]));
    for (const s of list) {
      let tier = 1, cur = s.id; while (prevS.get(cur)) { cur = prevS.get(cur)!; tier++; if (tier > 20) break; }
      const win = ticks(s.d.TransferLimitDuration) / TICKS_PER_SEC, lim = num(s.d.TransferLimit);
      const st: Storage = { id: s.id, name: s.name, tier, kind: kindType[1], capacity: num(s.d.Capacity) };
      if (win > 0 && lim > 0 && lim < 1e9) st.transferPerMin = (lim / win) * 60;
      const sp = ports(s.d.Layout?.Ports); if (sp.length) st.ports = sp;
      storages.push(st);
    }
  }
  const tp = of("TransportProto");
  const prevT = new Map(tp.map((t) => [t.id, ref(t.d.TierData?.PreviousTierIndirect)]));
  const transports: Transport[] = tp.map((t) => {
    let tier = 1, cur = t.id; while (prevT.get(cur)) { cur = prevT.get(cur)!; tier++; if (tier > 20) break; }
    const out: Transport = { id: t.id, name: t.name, tier, kind: (ref(t.d.PortsShape) ?? t.id).replace(/^IoPortShape_/, ""), throughputPerMin: num(t.d.ThroughputPer60) };
    const e = num(t.d.BaseElectricityCost); if (e) out.electricityKwPerTile = e;
    return out;
  });

  return { data: { meta: { gameVersion: String(json.gameVersion ?? "unknown"), exportedAt, source: `PlannerDataExporter ${String(json.exporter).replace(/^PlannerDataExporter\s*/, "")}` },
    products: [...products.values()], machines, recipes, transports, storages, research }, warnings };
}
