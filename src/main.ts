import "./style.css";
import { mountChain } from "./ui/chainView";
import { mountData } from "./ui/dataView";
import { mountDesign } from "./ui/designView";
import { mountLayout } from "./ui/layoutView";
import { mountResearch } from "./ui/researchView";
import { BUNDLED, CURRENT_GAME, isOlderThanCurrent, loadActive } from "./ui/store";

let active = loadActive();
const getData = () => active.data;

const app = document.getElementById("app")!;
app.innerHTML = `<div class="wrap"><header><h1><small>Captain of Industry · Blueprint aid</small>Factory Planner</h1>
  <div class="tabs" role="tablist"><button role="tab" data-t="chain">Production chain</button><button role="tab" data-t="design">Factory designer</button><button role="tab" data-t="layout">Layout</button><button role="tab" data-t="research">Research tree</button><button role="tab" data-t="data">Game data</button></div></header>
  <div id="stale"></div><section id="v-chain"></section><section id="v-design" hidden></section><section id="v-layout" hidden></section><section id="v-research" hidden></section><section id="v-data" hidden></section></div>`;
const views = { chain: mountChain(document.getElementById("v-chain")!, getData), design: mountDesign(document.getElementById("v-design")!, getData),
  layout: mountLayout(document.getElementById("v-layout")!, getData),
  research: mountResearch(document.getElementById("v-research")!, getData),
  data: mountData(document.getElementById("v-data")!, getData, () => active.user, () => { active = loadActive(); refresh(); }) };

function refresh() {
  const d = active.data;
  const old = isOlderThanCurrent(d.meta.gameVersion), cur = CURRENT_GAME.join(".");
  document.getElementById("stale")!.innerHTML = old
    ? `<div class="box warn">${d === BUNDLED ? "Bundled data is" : "Imported data is"} for game <b>${d.meta.gameVersion}</b>, but the game is at <b>${cur}</b>, so recipes, power and workers may be out of date. ${d === BUNDLED ? "Import your own export on the <b>Game data</b> tab." : "Re-export from the game and import again."}</div>`
    : old === null ? `<div class="box warn">Could not read the game version (<b>${d.meta.gameVersion}</b>); check it matches ${cur}.</div>` : "";
  (Object.keys(views) as (keyof typeof views)[]).forEach((k) => views[k]());
}
function show(t: keyof typeof views) {
  document.querySelectorAll<HTMLElement>("[data-t]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.t === t)));
  (Object.keys(views) as string[]).forEach((k) => (document.getElementById("v-" + k)!.hidden = k !== t));
  history.replaceState(null, "", "#" + t);
  if (t === "data") views.data();
}
document.querySelectorAll<HTMLElement>("[data-t]").forEach((b) => (b.onclick = () => show(b.dataset.t as keyof typeof views)));
refresh();
show((["chain", "design", "layout", "research", "data"].find((t) => location.hash === "#" + t) ?? "chain") as keyof typeof views);
