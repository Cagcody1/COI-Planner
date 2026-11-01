import { importCod } from "../data/importCod";
import { diffData } from "../data/diff";
import { validateGameData, type GameData } from "../data/schema";
import { BUNDLED, LINES, checkLines, clearUserData, esc, exportBackup, importBackup, saveUserData } from "./store";

export function mountData(el: HTMLElement, getData: () => GameData, isUser: () => boolean, onChange: () => void) {
  let msg = "";
  async function onFiles(files: FileList) {
    const got: Record<string, unknown> = {};
    try {
      for (const f of Array.from(files)) {
        const j = JSON.parse(await f.text());
        if (j.machines_and_buildings) got.machines_and_buildings = j;
        else if (j.products) got.products = j;
        else if (j.transports) got.transports = j;
      }
      const res = importCod(got as never);
      const errs = validateGameData(res.data);
      if (errs.length) throw new Error("Imported data is invalid: " + errs.slice(0, 3).join("; "));
      const d = diffData(getData(), res.data);
      const lineIssues = checkLines(res.data, LINES);
      const saved = saveUserData(res.data);
      msg = `<div class="box good"><b>Imported game ${esc(res.data.meta.gameVersion)}</b>: ${res.data.recipes.length} recipes, ${res.data.machines.length} machines, ${res.data.products.length} products. ${saved ? "Saved in this browser." : "Could not save (storage blocked); it will be lost on reload."}</div>`
        + (res.warnings.length ? `<div class="box warn"><b>${res.warnings.length} warning(s)</b><br>${res.warnings.slice(0, 8).map(esc).join("<br>")}</div>` : "")
        + (lineIssues.length ? `<div class="box bad"><b>Product lines need attention</b><br>${lineIssues.map(esc).join("<br>")}</div>` : "")
        + diffHtml(d);
      onChange();
    } catch (e) {
      msg = `<div class="box bad">${esc((e as Error).message)}</div>`;
    }
    render();
  }
  const diffHtml = (d: ReturnType<typeof diffData>) => {
    const n = d.changedRecipes.length + d.addedRecipes.length + d.removedRecipes.length + d.changedMachines.length + d.addedMachines.length + d.removedMachines.length;
    if (!n) return `<div class="box">No differences from ${esc(d.fromVersion)}.</div>`;
    const list = (t: string, xs: string[]) => (xs.length ? `<p class="hint"><b>${t} (${xs.length})</b><br>${xs.slice(0, 40).map(esc).join("<br>")}${xs.length > 40 ? "<br>…" : ""}</p>` : "");
    return `<div class="box warn"><b>${n} change(s)</b> from ${esc(d.fromVersion)} to ${esc(d.toVersion)}`
      + list("Changed recipes", d.changedRecipes.map((c) => `${c.id}: ${c.before} → ${c.after}`)) + list("New recipes", d.addedRecipes) + list("Removed recipes", d.removedRecipes)
      + list("Changed machines", d.changedMachines.map((c) => `${c.id}: ${c.what}`)) + list("New machines", d.addedMachines) + list("Removed machines", d.removedMachines) + `</div>`;
  };
  function render() {
    const d = getData(), issues = checkLines(d, LINES);
    el.innerHTML = `<div class="grid"><div class="panel"><h2>Game data</h2>
      <div class="stats"><div class="stat"><b style="font-size:1rem">${esc(d.meta.gameVersion)}</b><span>game version</span></div><div class="stat"><b>${d.recipes.length}</b><span>recipes</span></div><div class="stat"><b>${d.machines.length}</b><span>machines</span></div></div>
      <p class="hint">Source: ${isUser() ? "<b>your import</b> (stored in this browser)" : "bundled data (" + esc(BUNDLED.meta.source) + ")"}</p>
      ${issues.length ? `<div class="box bad sect"><b>Product lines need attention</b><br>${issues.map(esc).join("<br>")}</div>` : ""}
      <div class="sect"><label class="lbl" for="dF">Import from the game</label><input id="dF" type="file" accept=".json,application/json" multiple>
      <p class="hint">Select <code>machines_and_buildings.json</code> and <code>products.json</code> (and <code>transports.json</code>) together. Importing after a patch shows what changed.</p></div>
      ${isUser() ? `<div class="sect"><button class="btn" id="dReset">Go back to bundled data</button></div>` : ""}
      <div class="sect"><label class="lbl">Backup (imported data, designs, choices)</label>
      <button class="btn" id="dBackup">Download backup</button> <label class="btn" style="display:inline-block;cursor:pointer">Restore backup<input id="dRestore" type="file" accept=".json,application/json" hidden></label>
      <p class="hint">Saved data lives in this browser for this file's location. If you move or rename the file, or use another browser, restore from a backup.</p></div>
      <div class="sect">${msg}</div></div>
      <div class="panel"><h2>How to get the data from the game</h2>
      <ol style="padding-left:18px;margin:0"><li>Get the exporter mod <b>captain-of-data</b> (github.com/doubleaxe/captain-of-data). Build <code>mod/DataExtractor.csproj</code> with Visual Studio (Windows, .NET 4.8) after setting <code>COI_ROOT</code> to your game folder.</li>
      <li>Copy the built <code>DataExtractor.dll</code> to <code>%APPDATA%\\Captain of Industry\\Mods\\DataExtractor</code> and start the game and load a save.</li>
      <li>The mod writes JSON files to <code>c:\\temp</code>. Pick them in the box on the left.</li></ol>
      <p class="note">Nothing is uploaded: files are read in your browser. After a game update, repeat step 2 and 3; the page lists changed recipes and machines. Footprints and port positions are not in this export yet, so the grid layout is not available.</p></div></div>`;
    el.querySelector<HTMLInputElement>("#dF")!.onchange = (e) => { const f = (e.target as HTMLInputElement).files; if (f?.length) void onFiles(f); };
    el.querySelector<HTMLButtonElement>("#dBackup")!.onclick = () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([exportBackup()], { type: "application/json" }));
      a.download = `coi-planner-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
    };
    el.querySelector<HTMLInputElement>("#dRestore")!.onchange = async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
      try { const n = importBackup(await f.text()); msg = `<div class="box good">Restored ${n} saved item(s).</div>`; onChange(); }
      catch (err) { msg = `<div class="box bad">${esc((err as Error).message)}</div>`; }
      render();
    };
    el.querySelector<HTMLButtonElement>("#dReset")?.addEventListener("click", () => { clearUserData(); msg = ""; onChange(); render(); });
  }
  return render;
}
