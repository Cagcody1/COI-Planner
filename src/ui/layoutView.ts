import type { GameData, Machine } from "../data/schema";
import { solveChain } from "../engine/chain";
import { autoArrange, connections, overlapping, rectOf, sizeOf, worldPorts, type Placed } from "../engine/layout";
import { esc, pref } from "./store";

const COLORS: Record<string, string> = { FlatConveyor: "#3b82c4", LooseMaterialConveyor: "#b07a3a", Pipe: "#2a9d8f", MoltenMetalChannel: "#d1493f", Shaft: "#7d6bb5" };
const colorOf = (kind: string) => COLORS[kind.replace(/^IoPortShape_/, "")] ?? "#888";

/** Tile-grid layout: drag machines around, rotate them, see overlaps and which ports line up. Everything is saved in the browser. */
export function mountLayout(el: HTMLElement, getData: () => GameData) {
  let placed: Placed[] = pref.get("coi-layout", []);
  let sel: string | null = null, scale = pref.get<number>("coi-layout-scale", 12), add = pref.get<string>("coi-layout-add", "");
  let nextId = placed.reduce((m, p) => Math.max(m, Number(p.id.slice(1)) || 0), 0) + 1;
  const save = () => { pref.set("coi-layout", placed); pref.set("coi-layout-scale", scale); pref.set("coi-layout-add", add); };

  function render() {
    const data = getData();
    const M = new Map<string, Machine>(data.machines.filter((m) => m.footprint).map((m) => [m.id, m]));
    placed = placed.filter((p) => M.has(p.machineId));
    if (!add || !M.has(add)) add = [...M.keys()][0] ?? "";
    const bad = overlapping(M, placed), links = connections(M, placed);
    const linked = new Set(links.flatMap((l) => [`${l.from}/${l.fromPort}`, `${l.to}/${l.toPort}`]));
    const rects = placed.map((p) => rectOf(M.get(p.machineId)!, p));
    const x0 = Math.min(0, ...rects.map((r) => r.x0)) - 6, y0 = Math.min(0, ...rects.map((r) => r.y0)) - 6;
    const x1 = Math.max(40, ...rects.map((r) => r.x1)) + 6, y1 = Math.max(20, ...rects.map((r) => r.y1)) + 6;
    const W = (x1 - x0) * scale, H = (y1 - y0) * scale;
    const sx = (x: number) => (x - x0) * scale, sy = (y: number) => (y1 - y) * scale;      // world y points north
    let grid = "";
    for (let x = Math.ceil(x0 / 10) * 10; x <= x1; x += 10) grid += `<line x1="${sx(x)}" y1="0" x2="${sx(x)}" y2="${H}" stroke="var(--line)" stroke-width="${x === 0 ? 1.5 : 0.5}"/>`;
    for (let y = Math.ceil(y0 / 10) * 10; y <= y1; y += 10) grid += `<line x1="0" y1="${sy(y)}" x2="${W}" y2="${sy(y)}" stroke="var(--line)" stroke-width="${y === 0 ? 1.5 : 0.5}"/>`;
    const body = placed.map((p) => {
      const m = M.get(p.machineId)!, r = rectOf(m, p), isSel = p.id === sel;
      const ports = worldPorts(m, p).map((q) => {
        const on = linked.has(`${p.id}/${q.name ?? ""}`), cx = sx(q.wx) + scale / 2, cy = sy(q.wy) + scale / 2;
        const d = { E: [1, 0], N: [0, -1], W: [-1, 0], S: [0, 1] }[q.dir]!, px = cx + d[0] * scale * 0.55, py = cy + d[1] * scale * 0.55, s = Math.max(4, scale * 0.45);
        return `<rect x="${px - s / 2}" y="${py - s / 2}" width="${s}" height="${s}" rx="${q.io === "in" ? s / 2 : 1}" fill="${q.io === "in" ? "var(--panel)" : colorOf(q.kind)}" stroke="${on ? "var(--good)" : colorOf(q.kind)}" stroke-width="${on ? 2.5 : 1.5}"><title>${esc(m.name)} ${esc(q.name ?? "")}: ${q.io === "in" ? "input" : q.io === "out" ? "output" : "either"}, ${esc(q.kind.replace(/^IoPortShape_/, ""))}${on ? " (connected)" : ""}</title></rect>`;
      }).join("");
      return `<g data-id="${p.id}" style="cursor:move"><rect x="${sx(r.x0)}" y="${sy(r.y1)}" width="${(r.x1 - r.x0) * scale}" height="${(r.y1 - r.y0) * scale}" fill="${bad.has(p.id) ? "rgba(176,74,74,.35)" : "var(--panel)"}" stroke="${isSel ? "var(--accent)" : bad.has(p.id) ? "var(--bad)" : "var(--muted)"}" stroke-width="${isSel ? 3 : 1.2}"/>`
        + `<text x="${sx(r.x0) + 3}" y="${sy(r.y1) + 11}" font-size="${Math.max(9, scale * 0.8)}" fill="var(--ink)" pointer-events="none">${esc(m.name)}</text>${ports}</g>`;
    }).join("");
    const area = rects.length ? (Math.max(...rects.map((r) => r.x1)) - Math.min(...rects.map((r) => r.x0))) * (Math.max(...rects.map((r) => r.y1)) - Math.min(...rects.map((r) => r.y0))) : 0;
    const s = sel ? placed.find((p) => p.id === sel) : undefined;
    el.innerHTML = `<div class="panel"><h2>Layout</h2>
      <div class="toolbar"><select id="lAdd" aria-label="Machine to add">${[...M.values()].sort((a, b) => a.name.localeCompare(b.name)).map((m) => `<option value="${esc(m.id)}"${m.id === add ? " selected" : ""}>${esc(m.name)} (${m.footprint!.w}×${m.footprint!.h})</option>`).join("")}</select>
        <button class="btn" id="lAddB">Add</button><button class="btn" id="lChain" title="Replace the layout with the machines the Production chain tab needs">Fill from production chain</button>
        <button class="btn" id="lRot"${s ? "" : " disabled"}>Rotate (R)</button><button class="btn" id="lDup"${s ? "" : " disabled"}>Duplicate</button><button class="btn" id="lDel"${s ? "" : " disabled"}>Delete (Del)</button>
        <button class="btn" id="lClear"${placed.length ? "" : " disabled"}>Clear</button>
        <label class="hint">Zoom <input id="lZoom" type="range" min="5" max="30" value="${scale}"></label></div>
      <p class="hint">${placed.length} machines · ${links.length} connected port pair(s) · ${bad.size ? `<b style="color:var(--bad)">${bad.size} overlapping</b>` : "no overlaps"} · bounding box ${area} tiles. Ports: ${Object.entries(COLORS).map(([k, c]) => `<span style="color:${c}">■</span> ${k.replace(/Conveyor|Channel/, "")}`).join(" ")}; filled = output, hollow = input, green ring = connected. Grid lines every 10 tiles.</p>
      <div class="rwrap"><svg id="lSvg" width="${W}" height="${H}" style="touch-action:none;display:block">${grid}${body}</svg></div>
      ${s ? `<p class="hint">Selected: <b>${esc(M.get(s.machineId)!.name)}</b> at (${s.x}, ${s.y}), turned ${s.rot * 90}°, ${sizeOf(M.get(s.machineId)!, s.rot).w}×${sizeOf(M.get(s.machineId)!, s.rot).h} tiles.</p>` : `<p class="hint">Drag machines to move them (they snap to tiles). Click one to select it.</p>`}</div>`;
    save();
    const q = (id: string) => el.querySelector<HTMLElement>(id)!;
    (q("#lAdd") as HTMLSelectElement).onchange = (e) => { add = (e.target as HTMLSelectElement).value; save(); };
    q("#lAddB").onclick = () => { const o = placed.length ? Math.max(...placed.map((p) => p.x + 10)) : 0; placed.push({ id: `p${nextId++}`, machineId: add, x: o > 100 ? 0 : o, y: o > 100 ? 40 : 0, rot: 0 }); sel = placed[placed.length - 1].id; render(); };
    q("#lChain").onclick = () => {
      const r = solveChain(data, pref.get("coi-target", "Construction Parts"), pref.get("coi-rate", 48), { choice: pref.get("coi-choice", {}), supplied: Object.keys(pref.get<Record<string, boolean>>("coi-sup", {})).filter((k) => pref.get<Record<string, boolean>>("coi-sup", {})[k]), preferTier: pref.get("coi-ptier", 2) });
      placed = autoArrange(Object.entries(r.machines).map(([machineId, n]) => ({ machineId, count: Math.max(1, Math.ceil(n - 1e-9)) })), M);
      nextId = placed.length + 1; sel = null; render();
    };
    q("#lRot").onclick = () => rotate(); q("#lDel").onclick = () => del();
    q("#lDup").onclick = () => { if (s) { const c = { ...s, id: `p${nextId++}`, x: s.x + 2, y: s.y - 2 }; placed.push(c); sel = c.id; render(); } };
    q("#lClear").onclick = () => { placed = []; sel = null; render(); };
    (q("#lZoom") as HTMLInputElement).oninput = (e) => { scale = +(e.target as HTMLInputElement).value; render(); };
    // dragging: pointer position -> tile delta; the machine snaps to whole tiles
    const svg = q("#lSvg") as unknown as SVGSVGElement;
    svg.querySelectorAll<SVGGElement>("g[data-id]").forEach((g) => {
      g.onpointerdown = (ev) => {
        const p = placed.find((x) => x.id === g.dataset.id)!; sel = p.id;
        const sX = ev.clientX, sY = ev.clientY, ox = p.x, oy = p.y; let moved = false;
        g.setPointerCapture(ev.pointerId);
        g.onpointermove = (e) => { const nx = ox + Math.round((e.clientX - sX) / scale), ny = oy - Math.round((e.clientY - sY) / scale); if (nx !== p.x || ny !== p.y) { p.x = nx; p.y = ny; moved = true; g.setAttribute("transform", `translate(${(nx - ox) * scale},${-(ny - oy) * scale})`); } };
        g.onpointerup = () => { g.onpointermove = null; g.onpointerup = null; render(); void moved; };
      };
    });
  }
  const rotate = () => { const p = placed.find((x) => x.id === sel); if (p) { p.rot = (p.rot + 1) % 4; render(); } };
  const del = () => { placed = placed.filter((x) => x.id !== sel); sel = null; render(); };
  document.addEventListener("keydown", (e) => {
    if (el.hidden || !sel || (e.target as HTMLElement)?.matches?.("input,select,textarea")) return;
    if (e.key === "r" || e.key === "R") rotate(); else if (e.key === "Delete" || e.key === "Backspace") del();
  });
  return render;
}
