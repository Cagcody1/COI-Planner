import type { GameData, ResearchNode } from "../data/schema";
import { esc, pref } from "./store";

const CW = 190, RH = 66, NW = 168, NH = 50, PAD = 20;
const dur = (s: number) => (s >= 3600 ? (s / 3600).toFixed(1) + " h" : s >= 60 ? Math.round(s / 60) + " min" : Math.round(s) + " s");

/** The research tree of the player's own game, laid out on the game's own grid positions. Click a node for what it unlocks. */
export function mountResearch(el: HTMLElement, getData: () => GameData) {
  let sel: string | null = null, q = "";
  let done = new Set<string>(pref.get<string[]>("coi-research-done", []));
  const save = () => pref.set("coi-research-done", [...done]);

  function render() {
    const nodes = getData().research ?? [];
    if (!nodes.length) {
      el.innerHTML = `<div class="panel"><h2>Research tree</h2><p class="hint">The bundled data has no research tree. Import an export from your own game on the <b>Game data</b> tab (needs exporter 0.1.5 or newer) and the whole tree appears here.</p></div>`;
      return;
    }
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const kids = new Map<string, string[]>();
    for (const n of nodes) for (const p of n.parents) (kids.get(p) ?? kids.set(p, []).get(p)!).push(n.id);
    const minX = Math.min(...nodes.map((n) => n.x)), minY = Math.min(...nodes.map((n) => n.y));
    const pos = (n: ResearchNode) => ({ x: PAD + ((n.x - minX) / 4) * CW, y: PAD + (n.y - minY) * RH });
    const W = PAD * 2 + ((Math.max(...nodes.map((n) => n.x)) - minX) / 4) * CW + NW, H = PAD * 2 + (Math.max(...nodes.map((n) => n.y)) - minY) * RH + NH;
    // everything the selected node needs (ancestors) and opens up (descendants)
    const rel = new Set<string>();
    if (sel) {
      const up = (id: string) => { for (const p of byId.get(id)?.parents ?? []) if (!rel.has(p)) { rel.add(p); up(p); } };
      const down = (id: string) => { for (const c of kids.get(id) ?? []) if (!rel.has(c)) { rel.add(c); down(c); } };
      up(sel); down(sel); rel.add(sel);
    }
    const match = (n: ResearchNode) => q.length > 1 && (n.name.toLowerCase().includes(q) || n.unlocks.some((u) => (u.title ?? u.id).toLowerCase().includes(q)));
    const edges = nodes.flatMap((n) => n.parents.filter((p) => byId.has(p)).map((p) => {
      const a = pos(byId.get(p)!), b = pos(n), x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2;
      const hot = sel && rel.has(p) && rel.has(n.id);
      return `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" fill="none" stroke="${hot ? "var(--accent, #d9822b)" : "var(--line)"}" stroke-width="${hot ? 2.2 : 1}" opacity="${sel && !hot ? 0.25 : 1}"/>`;
    })).join("");
    const boxes = nodes.map((n) => {
      const p = pos(n), dim = sel && !rel.has(n.id), hit = match(n);
      return `<button class="rnode${n.id === sel ? " sel" : ""}${done.has(n.id) ? " done" : ""}${hit ? " hit" : ""}" data-id="${esc(n.id)}" style="left:${p.x}px;top:${p.y}px;width:${NW}px;height:${NH}px;${dim ? "opacity:.3" : ""}"><b>${esc(n.name)}</b><span>${dur(n.durationSec)}${n.unlocks.length ? " · " + n.unlocks.length + " unlock" + (n.unlocks.length > 1 ? "s" : "") : ""}</span></button>`;
    }).join("");
    const total = nodes.reduce((s, n) => s + n.durationSec, 0), left = nodes.filter((n) => !done.has(n.id)).reduce((s, n) => s + n.durationSec, 0);
    const d = sel ? byId.get(sel) : null;
    el.innerHTML = `<div class="panel"><h2>Research tree</h2>
      <div class="toolbar"><input id="rQ" type="search" placeholder="Search research, machines, recipes…" value="${esc(q)}" style="min-width:16rem">
        <span class="hint">${nodes.length} nodes · ${done.size} marked done · ${dur(left)} of ${dur(total)} research time left (before lab speed)</span>
        ${done.size ? `<button class="btn" id="rClear">Clear done marks</button>` : ""}</div>
      <div class="rwrap"><div class="rcanvas" style="width:${W}px;height:${H}px"><svg width="${W}" height="${H}">${edges}</svg>${boxes}</div></div>
      ${d ? detail(d, byId, kids) : `<p class="hint">Click a node to highlight what it needs and what it opens up. Double-click marks it as researched.</p>`}</div>`;
    el.querySelector<HTMLInputElement>("#rQ")!.oninput = (e) => {
      q = (e.target as HTMLInputElement).value.trim().toLowerCase();
      el.querySelectorAll<HTMLElement>(".rnode").forEach((b) => b.classList.toggle("hit", match(byId.get(b.dataset.id!)!)));
    };
    el.querySelector<HTMLElement>("#rClear")?.addEventListener("click", () => { done = new Set(); save(); render(); });
    el.querySelectorAll<HTMLElement>(".rnode").forEach((b) => {
      b.onclick = () => { sel = sel === b.dataset.id ? null : b.dataset.id!; const sc = el.querySelector<HTMLElement>(".rwrap")!; const l = sc.scrollLeft, t = sc.scrollTop; render(); const n = el.querySelector<HTMLElement>(".rwrap")!; n.scrollLeft = l; n.scrollTop = t; };
      b.ondblclick = () => { const id = b.dataset.id!; done.has(id) ? done.delete(id) : done.add(id); save(); const sc = el.querySelector<HTMLElement>(".rwrap")!; const l = sc.scrollLeft, t = sc.scrollTop; render(); const n = el.querySelector<HTMLElement>(".rwrap")!; n.scrollLeft = l; n.scrollTop = t; };
    });
  }
  function detail(n: ResearchNode, byId: Map<string, ResearchNode>, kids: Map<string, string[]>): string {
    const name = (id: string) => esc(byId.get(id)?.name ?? id);
    const group = (kind: string, label: string) => {
      const xs = n.unlocks.filter((u) => u.kind === kind);
      return xs.length ? `<p><b>${label}</b> (${xs.length}): ${xs.map((u) => esc(u.title ?? u.id.split(":").pop()!)).join(", ")}</p>` : "";
    };
    return `<div class="box" style="margin-top:12px"><b style="font-size:1.05rem">${esc(n.name)}</b> <span class="hint">${esc(n.id)} · ${dur(n.durationSec)} of research${done.has(n.id) ? " · marked done" : ""}${n.startUnlocked ? " · unlocked from the start" : ""}</span>
      ${n.description ? `<p>${esc(n.description)}</p>` : ""}
      <p><b>Needs</b>${n.anyParent ? " (any one of)" : ""}: ${n.parents.length ? n.parents.map(name).join(", ") : "nothing"}</p>
      <p><b>Opens up</b>: ${(kids.get(n.id) ?? []).length ? (kids.get(n.id) ?? []).map(name).join(", ") : "nothing further"}</p>
      ${group("machine", "Machines")}${group("building", "Buildings and other")}${group("recipe", "Recipes")}${group("product", "Products")}${group("other", "Other")}</div>`;
  }
  return render;
}
