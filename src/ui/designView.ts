import type { GameData } from "../data/schema";
import { ratioStr } from "../engine/balancer";
import { engine, fullMatrix, type Design } from "../engine/flexloop";
import { fmt, producers, qtyOf } from "../engine/rates";
import { pickRecipe } from "../engine/chain";
import { LINES, esc, pref, type Line } from "./store";

const BELTS: [string, string][] = [["FlatConveyorT1", "Belt I"], ["FlatConveyorT2", "Belt II"], ["FlatConveyorT3", "Belt III"]];

export function mountDesign(el: HTMLElement, getData: () => GameData) {
  let D: Design | null = pref.get<Design | null>("coi-design2", null);
  const fresh = (L: Line, data: GameData, keep?: Partial<Design>): Design => {
    const cp = L.id === "CP";
    const t2 = data.transports.find((t) => t.id === "FlatConveyorT2")?.throughputPerMin ?? 200;
    const d: Design = { line: L.id, tier: L.assemblers[cp ? 1 : 2], n: 8, belt: t2, store: 400, top: 2, variant: cp ? "from Iron" : "from Steel", mode: "phases",
      src: cp ? ["make", "make", "make", "make"] : ["import", "make", "make", "make"], merge: cp ? ["one", "best", "best", "best"] : ["best", "best", "best", "best"], matrix: [], ...keep };
    d.matrix = fullMatrix(d.n, L.tiers.length);
    return d;
  };

  function render() {
    const data = getData();
    const machines = new Map(data.machines.map((m) => [m.id, m]));
    const usable = LINES.filter((l) => l.tiers.every((t) => data.products.some((p) => p.id === t.product)) && l.assemblers.every((a) => machines.has(a)));
    if (!usable.length) { el.innerHTML = `<div class="panel"><div class="box bad">None of the product lines match this game data (products or assemblers were renamed). Check the Game data tab.</div></div>`; return; }
    if (!D || !usable.find((l) => l.id === D!.line)) D = fresh(usable[0], data);
    const L = usable.find((l) => l.id === D!.line)!;
    D.n = Math.max(1, Math.min(24, D.n)); while (D.matrix.length < D.n) D.matrix.push(Array(L.tiers.length).fill(true)); D.matrix.length = D.n;
    pref.set("coi-design2", D);
    const R = engine(data, L, D);
    const sn = (p: string) => L.tiers.find((t) => t.product === p)?.short ?? p;
    const variants = L.tiers[0].variants && typeof L.tiers[0].variants === "object" ? Object.keys(L.tiers[0].variants) : [];
    const act: number[] = []; for (let k = D.top; k >= 0; k--) { if (k < D.top && D.src[k] === "import") break; act.unshift(k); }
    const opt = (v: string, label: string, cur: string | number) => `<option value="${esc(v)}"${String(cur) === v ? " selected" : ""}>${esc(label)}</option>`;
    const bad = (s: string) => (s === "bad" ? "bad" : s === "warn" ? "warn" : "");

    const tierRows = L.tiers.slice(0, D.top + 1).map((t, k) => `<tr><td>${esc(t.short)}</td><td>${k === D!.top ? '<span class="hint">Make (final)</span>' : `<select data-src="${k}">${opt("make", "Make in loop", D!.src[k])}${opt("import", "Bring in", D!.src[k])}</select>`}</td>
      <td><select data-merge="${k}">${opt("best", "Best balancer setup", D!.merge[k])}${opt("one", "One balancer, one of each", D!.merge[k])}${opt("exact", "Exact (throttled feeds)", D!.merge[k])}</select></td></tr>`).join("");
    const matrix = `<thead><tr><th>Assembler</th>${act.map((k) => `<th>${esc(L.tiers[k].short)}</th>`).join("")}</tr></thead><tbody>${D.matrix.map((row, i) => `<tr><td>A${i + 1}</td>${act.map((k) => `<td><input type="checkbox" data-m="${i}_${k}"${row[k] ? " checked" : ""} aria-label="A${i + 1} ${esc(L.tiers[k].short)}"></td>`).join("")}</tr>`).join("")}</tbody>`;

    let results = "";
    if (!R.bad) {
      const fe = Object.entries(R.feeds).sort((a, b) => b[1] - a[1]);
      const sweep = [4, 6, 8, 10, 12, 16].map((n) => { const a = engine(data, L, D!, { n, belt: data.transports.find((t) => t.id === "FlatConveyorT2")?.throughputPerMin ?? 200, allOn: true }), b = engine(data, L, D!, { n, belt: data.transports.find((t) => t.id === "FlatConveyorT3")?.throughputPerMin ?? 450, allOn: true });
        return `<tr${n === D!.n ? ' style="font-weight:600"' : ""}><td>${n}</td><td class="n">${a.bad ? "—" : fmt(a.W, 2)}</td><td class="n">${b.bad ? "—" : fmt(b.W, 2)}</td></tr>`; }).join("");
      results = `<div class="stats"><div class="stat"><b>${fmt(R.W, 2)}</b><span>${esc(L.tiers[D.top].short)} / min</span></div><div class="stat"><b>${fmt(R.busy * 100, 0)}%</b><span>assemblers busy</span></div><div class="stat"><b>${fmt(R.Wbl, 2)}</b><span>most possible / min</span></div></div>`
        + R.issues.map((x, i) => `<div class="box ${bad(x.sev)}"><b>${i + 1}.</b> ${esc(x.msg)}</div>`).join("")
        + `<label class="lbl">Phases</label><div class="tbl"><table><thead><tr><th>Tier</th><th class="n">Can run</th><th class="n">Out / min</th><th>Limit</th><th class="n">Time</th><th class="n">Returns</th></tr></thead><tbody>${[...R.act].reverse().map((k) => { const x = R.T[k];
          return `<tr><td>${esc(x.t.short)}</td><td class="n">${x.nk}</td><td class="n">${fmt(x.P, 1)}</td><td>${x.lim}</td><td class="n">${D!.mode === "phases" ? fmt((x.time ?? 0) * 100, 0) + "%" : "—"}</td><td class="n">${D!.mode === "phases" ? fmt(x.ret ?? 0, 0) : "—"}</td></tr>`; }).join("")}</tbody></table></div>`
        + `<div class="sect"><label class="lbl">Feed from outside</label><div style="font-size:1.2rem;font-weight:600">${fe.length ? esc(ratioStr(fe.map((e) => e[1]))) : ""}<br><span class="hint">${fe.map((e) => esc(sn(e[0]))).join(" : ")}</span></div>
          <div class="tbl"><table><thead><tr><th>Item</th><th class="n">/ min</th><th>Support machines</th></tr></thead><tbody>${fe.map(([p, v]) => { const r = pickRecipe(data, p, { preferTier: 2 }); const pm = r ? (qtyOf(r.outputs, p) * 60) / r.durationSec : 0;
            return `<tr><td>${esc(sn(p))}</td><td class="n">${fmt(v, 2)}</td><td>${r && producers(data, p).length ? `${fmt(v / pm, 2)} × ${esc(machines.get(r.machineId)?.name ?? r.machineId)} <span class="hint">(${Math.ceil(v / pm - 1e-9)} to build)</span>` : '<span class="hint">raw or brought in</span>'}</td></tr>`; }).join("")}</tbody></table></div></div>`
        + `<div class="sect"><label class="lbl">Balancer setups</label>${[...R.act].reverse().map((k, i) => { const x = R.T[k], its = Object.keys(x.q);
            return `<p class="hint"><b>${D!.mode === "phases" ? "Priority " + (i + 1) + " · " : ""}${esc(x.t.short)} mix</b> — recipe ${esc(ratioStr(its.map((j) => x.q[j])))}, belt gets ${esc(ratioStr(its.map((j) => x.mix.f[j])))} (${its.map((j) => esc(sn(j))).join(" : ")})<br>${esc(x.mix.desc)}</p>`; }).join("")}</div>`
        + `<div class="sect"><label class="lbl">Final product / min by assembler count</label><div class="tbl"><table><thead><tr><th>Assemblers</th><th class="n">Belt II</th><th class="n">Belt III</th></tr></thead><tbody>${sweep}</tbody></table></div></div>`;
    } else results = R.issues.map((x) => `<div class="box bad">${esc(x.msg)}</div>`).join("");

    el.innerHTML = `<div class="grid"><div class="panel"><h2>Factory setup</h2>
      <div class="row3"><div><label class="lbl" for="gL">Product line</label><select id="gL">${usable.map((l) => opt(l.id, l.name, D!.line)).join("")}</select></div>
      <div><label class="lbl" for="gT">Assemblers</label><select id="gT">${L.assemblers.map((a) => opt(a, machines.get(a)!.name, D!.tier)).join("")}</select></div>
      <div><label class="lbl" for="gN">How many</label><input id="gN" type="number" min="1" max="24" value="${D.n}"></div></div>
      <div class="row3"><div><label class="lbl" for="gB">Supply belt</label><select id="gB">${BELTS.map(([id, n]) => { const t = data.transports.find((x) => x.id === id); return t ? opt(String(t.throughputPerMin), `${n} · ${fmt(t.throughputPerMin, 1)}/min`, String(D!.belt)) : ""; }).join("")}</select></div>
      <div><label class="lbl" for="gS">Storage transfer /min</label><input id="gS" type="number" min="1" value="${D.store}"></div>
      <div><label class="lbl" for="gF">Final product</label><select id="gF">${L.tiers.map((t, k) => (k > 0 ? opt(String(k), t.short, D!.top) : "")).join("")}</select></div></div>
      <div class="row3" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div><label class="lbl" for="gV">${esc(L.base)} recipe</label><select id="gV">${variants.map((v) => opt(v, v, D!.variant)).join("")}</select></div>
      <div><label class="lbl" for="gM">Supply belt control</label><select id="gM">${opt("phases", "Priority balancers, no throttles", D.mode)}${opt("blend", "Throttled, all tiers at once", D.mode)}</select></div></div>
      <label class="lbl">Tiers</label><div class="tbl"><table><thead><tr><th>Tier</th><th>Source</th><th>Merge onto belt</th></tr></thead><tbody>${tierRows}</tbody></table></div>
      <div class="sect"><h2 style="margin-bottom:6px">Recipes per assembler <button class="btn" id="gAll">All on</button></h2><div class="tbl"><table id="dMatrix">${matrix}</table></div></div>
      <p class="note">Assumptions to confirm in game: storages push as fast as the belt takes, balancers hold their ratio, a sorter clears the loop before the merge. Storage transfer rate isn't in the game export, so 400/min is a guess.</p></div>
      <div class="panel"><h2>Results</h2>${results}</div></div>`;

    const $ = <T extends HTMLElement>(s: string) => el.querySelector<T>(s)!;
    $<HTMLSelectElement>("#gL").onchange = (e) => { const l = usable.find((x) => x.id === (e.target as HTMLSelectElement).value)!; D = fresh(l, data, { n: D!.n, belt: D!.belt, store: D!.store }); render(); };
    $<HTMLSelectElement>("#gT").onchange = (e) => { D!.tier = (e.target as HTMLSelectElement).value; render(); };
    $<HTMLInputElement>("#gN").oninput = (e) => { D!.n = Math.max(1, Math.min(24, parseInt((e.target as HTMLInputElement).value) || 1)); render(); const i = $<HTMLInputElement>("#gN"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
    $<HTMLSelectElement>("#gB").onchange = (e) => { D!.belt = +(e.target as HTMLSelectElement).value; render(); };
    $<HTMLInputElement>("#gS").onchange = (e) => { D!.store = +(e.target as HTMLInputElement).value || 400; render(); };
    $<HTMLSelectElement>("#gF").onchange = (e) => { D!.top = +(e.target as HTMLSelectElement).value; render(); };
    $<HTMLSelectElement>("#gV").onchange = (e) => { D!.variant = (e.target as HTMLSelectElement).value; render(); };
    $<HTMLSelectElement>("#gM").onchange = (e) => { D!.mode = (e.target as HTMLSelectElement).value as Design["mode"]; render(); };
    $<HTMLButtonElement>("#gAll").onclick = () => { D!.matrix = fullMatrix(D!.n, L.tiers.length); render(); };
    el.querySelectorAll<HTMLSelectElement>("select[data-src]").forEach((s) => (s.onchange = () => { D!.src[+s.dataset.src!] = s.value as "make" | "import"; render(); }));
    el.querySelectorAll<HTMLSelectElement>("select[data-merge]").forEach((s) => (s.onchange = () => { D!.merge[+s.dataset.merge!] = s.value as Design["merge"][number]; render(); }));
    el.querySelectorAll<HTMLInputElement>("input[data-m]").forEach((s) => (s.onchange = () => { const [i, k] = s.dataset.m!.split("_").map(Number); D!.matrix[i][k] = s.checked; render(); }));
  }
  return render;
}
