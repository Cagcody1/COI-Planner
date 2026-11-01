// Minimal shell: a first-cut flex loop designer wired to the engine. The full UI comes in M3-M5.
import data from "../data/0.8.1a-b550-Update-4/gamedata.json";
import lines from "../data/0.8.1a-b550-Update-4/lines.json";
import { engine, fullMatrix, type Design, type ProductLine } from "./engine/flexloop";
import type { GameData } from "./data/schema";

const G = data as unknown as GameData, LS = lines as ProductLine[];
const app = document.getElementById("app")!;
app.innerHTML = `<style>body{font:15px system-ui;margin:16px;max-width:760px}label{display:block;margin:6px 0}</style>
<h1>Captain of Industry Planner</h1><p>Game data: <b>${G.meta.gameVersion}</b> (${G.recipes.length} recipes). Early build: flex loop result only.</p>
<label>Line <select id="l">${LS.map((l) => `<option>${l.id}</option>`).join("")}</select></label>
<label>Assembler <select id="t">${["I","II","III","IV","V"].map((x, i) => `<option value="${(LS[0] as any).assemblers[i]}"${i === 2 ? " selected" : ""}>Assembly ${x}</option>`).join("")}</select></label>
<label>Count <input id="n" type="number" value="8" min="1" max="24"></label>
<label>Belt <select id="b"><option value="199.80468">Belt II</option><option value="450">Belt III</option></select></label>
<label>Final tier <select id="top"><option value="1">2nd</option><option value="2" selected>3rd</option><option value="3">4th</option></select></label>
<label>Mode <select id="m"><option value="phases">Priority phases</option><option value="blend">Throttled</option></select></label>
<pre id="out"></pre>`;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
function run() {
  const L = LS.find((l) => l.id === $<HTMLSelectElement>("l").value)!, cp = L.id === "CP";
  const n = Math.max(1, +$<HTMLInputElement>("n").value || 1);
  const D: Design = { line: L.id, tier: $<HTMLSelectElement>("t").value, n, belt: +$<HTMLSelectElement>("b").value, store: 400,
    top: +$<HTMLSelectElement>("top").value, variant: cp ? "from Iron" : "from Steel", mode: $<HTMLSelectElement>("m").value as Design["mode"],
    src: cp ? ["make","make","make","make"] : ["import","make","make","make"], merge: cp ? ["one","best","best","best"] : ["best","best","best","best"],
    matrix: fullMatrix(n, L.tiers.length) };
  const r = engine(G, L, D);
  $("out").textContent = (r.bad ? "" : `${L.tiers[D.top].short}: ${r.W.toFixed(2)} / min  (max possible ${r.Wbl.toFixed(2)}, assemblers busy ${(r.busy * 100).toFixed(0)}%)\nFeed from outside: ${Object.entries(r.feeds).map(([k, v]) => `${k} ${v.toFixed(1)}`).join(", ")}\n\n`)
    + r.issues.map((i) => `[${i.sev}] ${i.msg}`).join("\n");
}
app.addEventListener("input", run); run();
