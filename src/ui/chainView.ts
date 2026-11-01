import type { GameData } from "../data/schema";
import { pickRecipe, solveChain, type ChainNode } from "../engine/chain";
import { totalCosts } from "../engine/costs";
import { fmt, producers } from "../engine/rates";
import { esc, pref } from "./store";

export function mountChain(el: HTMLElement, getData: () => GameData) {
  let choice: Record<string, string> = pref.get("coi-choice", {});
  let supplied: Record<string, boolean> = pref.get("coi-sup", {});
  let target = pref.get("coi-target", "Construction Parts");
  let rate = pref.get("coi-rate", 48);
  let tier = pref.get("coi-ptier", 2);

  function render() {
    const data = getData();
    const made = [...new Set(data.recipes.flatMap((r) => r.outputs.map((o) => o.product)))];
    const kind = new Map(data.products.map((p) => [p.id, p.kind]));
    const options = made.filter((p) => kind.get(p) !== "virtual").sort();
    if (!options.includes(target)) target = options.includes("Construction Parts") ? "Construction Parts" : options[0];
    pref.set("coi-choice", choice); pref.set("coi-sup", supplied); pref.set("coi-target", target); pref.set("coi-rate", rate); pref.set("coi-ptier", tier);
    const sup = Object.keys(supplied).filter((k) => supplied[k]);
    const opt = { choice, supplied: sup, preferTier: tier };
    const r = solveChain(data, target, rate, opt);
    const c = totalCosts(data, r.machines);
    const names = new Map(data.machines.map((m) => [m.id, m.name]));

    const node = (n: ChainNode, depth: number): string => {
      let h = `<div class="${depth ? "node" : ""}"><div class="trow"><span class="it">${esc(n.product)}</span><span class="rate">${fmt(n.perMin, 2)}/min</span>`;
      if (n.stop) h += `<span class="raw">${n.stop === "raw" ? "raw input" : n.stop === "loop" ? "loop, stopped" : "supplied"}</span>`;
      else if (n.recipe) h += `<span class="mc">${fmt(n.machines!, 2)} × ${esc(names.get(n.recipe.machineId) ?? n.recipe.machineId)}</span>`;
      const ps = producers(data, n.product);
      if (ps.length > 1 && n.stop !== "raw") {
        h += `<select data-pick="${esc(n.product)}" aria-label="Recipe for ${esc(n.product)}">${ps.map((p) => `<option value="${esc(p.id)}"${p.id === n.recipe?.id ? " selected" : ""}>${esc(names.get(p.machineId) ?? p.machineId)} · ${esc(p.label ?? p.id)} (${p.durationSec}s)</option>`).join("")}</select>`;
      }
      if (depth > 0 && ps.length) h += `<label class="sup"><input type="checkbox" data-sup="${esc(n.product)}"${supplied[n.product] ? " checked" : ""}> supplied</label>`;
      return h + `</div>${n.children.map((x) => node(x, depth + 1)).join("")}</div>`;
    };
    const tbl = (o: Record<string, number>, build = false) =>
      Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(names.get(k) ?? k)}</td><td class="n">${fmt(v, 2)}</td>${build ? `<td class="n"><b>${c.built[k]}</b></td>` : ""}</tr>`).join("") || `<tr><td colspan="3" class="hint">None</td></tr>`;
    const kv = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${fmt(v, 1)}</td></tr>`).join("") || `<tr><td colspan="2" class="hint">None</td></tr>`;

    el.innerHTML = `<div class="grid"><div class="panel"><h2>Target</h2>
      <div class="row3"><div><label class="lbl" for="cT">Product</label><select id="cT">${options.map((p) => `<option${p === target ? " selected" : ""}>${esc(p)}</option>`).join("")}</select></div>
      <div><label class="lbl" for="cR">Per minute</label><input id="cR" type="number" min="0" step="1" value="${rate}"></div>
      <div><label class="lbl" for="cP">Default machine tier</label><select id="cP">${[1, 2, 3, 4, 5].map((t) => `<option${t === tier ? " selected" : ""}>${t}</option>`).join("")}</select></div></div>
      <p class="hint">Pick a recipe on any row to change it everywhere. Tick "supplied" to stop at that item. The default tier picks the machine closest to that tier when you haven't chosen one.</p>
      <div class="sect">${node(r.tree, 0)}</div></div>
      <div class="panel"><h2>Totals</h2>
      <div class="stats"><div class="stat"><b>${c.workers}</b><span>workers</span></div><div class="stat"><b>${fmt(c.electricityMw, 2)}</b><span>MW</span></div><div class="stat"><b>${c.computing}</b><span>computing</span></div></div>
      <label class="lbl">Machines</label><div class="tbl"><table><thead><tr><th>Machine</th><th class="n">Exact</th><th class="n">Build</th></tr></thead><tbody>${tbl(r.machines, true)}</tbody></table></div>
      <div class="sect"><label class="lbl">Raw &amp; supplied inputs / min</label><div class="tbl"><table><tbody>${kv(r.inputs)}</tbody></table></div></div>
      <div class="sect"><label class="lbl">Byproducts to handle / min</label><div class="tbl"><table><tbody>${kv(r.byproducts)}</tbody></table></div></div>
      <div class="sect"><label class="lbl">Maintenance / month</label><div class="tbl"><table><tbody>${kv(c.maintenancePerMonth)}</tbody></table></div></div>
      <div class="sect"><label class="lbl">Construction materials</label><div class="tbl"><table><tbody>${kv(c.buildCost)}</tbody></table></div></div>
      <p class="note">Maintenance is a lower bound (idle machines still cost). Recycling loops are reported as byproducts, not solved.</p></div></div>`;
    el.querySelector<HTMLSelectElement>("#cT")!.onchange = (e) => { target = (e.target as HTMLSelectElement).value; render(); };
    el.querySelector<HTMLInputElement>("#cR")!.oninput = (e) => { rate = +(e.target as HTMLInputElement).value || 0; renderKeepFocus(); };
    el.querySelector<HTMLSelectElement>("#cP")!.onchange = (e) => { tier = +(e.target as HTMLSelectElement).value; render(); };
    el.querySelectorAll<HTMLSelectElement>("select[data-pick]").forEach((s) => (s.onchange = () => { choice[s.dataset.pick!] = s.value; render(); }));
    el.querySelectorAll<HTMLInputElement>("input[data-sup]").forEach((s) => (s.onchange = () => { supplied[s.dataset.sup!] = s.checked; render(); }));
  }
  function renderKeepFocus() { render(); const i = el.querySelector<HTMLInputElement>("#cR")!; i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  return render;
}
void pickRecipe;
