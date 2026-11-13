import { importCod } from "../data/importCod";
import { importPlanner, isPlannerExport, type ImportResult } from "../data/importPlanner";
import { summarizeExport } from "../data/summarize";
import { diffData } from "../data/diff";
import { validateGameData, type GameData } from "../data/schema";
import { whenNative, type NativeApi, type NativeState } from "./native";
import { BUNDLED, LINES, checkLines, clearUserData, esc, exportBackup, importBackup, saveUserData } from "./store";

export function mountData(el: HTMLElement, getData: () => GameData, isUser: () => boolean, onChange: () => void) {
  let msg = "";
  let native: NativeApi | null = null, ns: NativeState | null = null, nmsg = "", confirmRemove = false;
  const refreshNative = async () => { if (native) { ns = await native.state(); render(); } };
  void whenNative().then(async (a) => { native = a; if (a) await refreshNative(); });
  function applyImport(res: ImportResult) {
    const errs = validateGameData(res.data);
    if (errs.length) throw new Error("Imported data is invalid: " + errs.slice(0, 3).join("; "));
    const d = diffData(getData(), res.data);
    const lineIssues = checkLines(res.data, LINES);
    const saved = saveUserData(res.data);
    msg = `<div class="box good"><b>Imported game ${esc(res.data.meta.gameVersion)}</b>: ${res.data.recipes.length} recipes, ${res.data.machines.length} machines, ${res.data.products.length} products${res.data.research?.length ? `, ${res.data.research.length} research nodes` : ""}. ${saved ? "Saved in this browser." : "Could not save (storage blocked); it will be lost on reload."}</div>`
      + (res.warnings.length ? `<div class="box warn"><b>${res.warnings.length} warning(s)</b><br>${res.warnings.slice(0, 8).map(esc).join("<br>")}</div>` : "")
      + (lineIssues.length ? `<div class="box bad"><b>Product lines need attention</b><br>${lineIssues.map(esc).join("<br>")}</div>` : "")
      + diffHtml(d);
    onChange();
  }
  async function onFiles(files: FileList) {
    const got: Record<string, unknown> = {};
    try {
      let planner: unknown = null;
      for (const f of Array.from(files)) {
        const j = JSON.parse(await f.text());
        if (isPlannerExport(j)) planner = j;
        else if (j.machines_and_buildings) got.machines_and_buildings = j;
        else if (j.products) got.products = j;
        else if (j.transports) got.transports = j;
      }
      applyImport(planner ? importPlanner(planner) : importCod(got as never));
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
  const kb = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " kB");
  function rightPanel(): string {
    if (native && ns) {
      const s = ns;
      const status = s.installed ? `installed${s.installedVersion ? " (v" + esc(s.installedVersion) + ")" : ""}` : "not installed";
      const built = !s.canBuild ? "source missing" : !s.built ? "not built yet" : s.needsRebuild ? "game changed: rebuild" : "up to date";
      return `<div class="panel"><h2>Game-data exporter</h2>
      <div class="stats"><div class="stat"><b style="font-size:1rem">${status}</b><span>in the game's Mods folder</span></div>
      <div class="stat"><b style="font-size:1rem">${built}</b><span>built for your game</span></div>
      <div class="stat"><b>${s.exports.length}</b><span>exports found</span></div></div>
      <p class="hint">Game: ${s.gameDir ? "<code>" + esc(s.gameDir) + "</code>" : "<b>not found</b>"} <button class="btn" id="nGame">Choose game folder…</button>${s.compiler === "none" ? " &nbsp;<b>No C# compiler found.</b>" : ""}</p>
      <div class="toolbar"><button class="btn" id="nBuild"${s.canBuild ? "" : " disabled"}>${s.installed || s.built ? "Rebuild and update exporter" : "Build and install exporter"}</button>
      <button class="btn" id="nImport"${s.exports.length ? "" : " disabled"}>Import newest export</button>
      <button class="btn" id="nSummary"${s.exports.length ? "" : " disabled"}>Make summary of newest export</button>
      <button class="btn" id="nBp" title="Lists the game's blueprint code so the planner can read and write blueprints">Show blueprint API</button>
      <button class="btn" id="nOpen"${s.installed ? "" : " disabled"}>Open exports folder</button>
      <button class="btn" id="nRemove"${s.installed ? "" : " disabled"}>${confirmRemove ? "Click again: delete mod AND exports" : "Remove exporter"}</button></div>
      ${s.needsRebuild ? `<div class="box warn">Your game has changed since the exporter was built. Rebuild it so it matches the new version.</div>` : ""}
      ${nmsg}
      ${s.exports.length ? `<div class="tbl"><table><thead><tr><th>Export</th><th class="n">Size</th><th>Saved</th></tr></thead><tbody>${s.exports.map((x) => `<tr><td>${esc(x.name)}</td><td class="n">${kb(x.bytes)}</td><td>${esc(x.modified)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <ol style="padding-left:18px;margin:12px 0 0"><li>Click <b>Build and install exporter</b>. The planner compiles the mod on this PC against your game, then copies it into the game's Mods folder.</li>
      <li>Start the game, enable <b>Planner Data Exporter</b> in the mod list and start a <b>new</b> map. Wait for it to load.</li>
      <li>Come back here and click <b>Import newest export</b> (use <b>Make summary</b> only if you want to send me the file): it loads the products, recipes, machines, storages, conveyors and the research tree straight from your game.</li>
      <li>When you are done, <b>Remove exporter</b>. After a game update, click <b>Rebuild and update exporter</b> (no new planner needed).</li></ol>
      <p class="note">Your data is stored in <code>${esc(s.dataDir)}</code> and moves with the program folder. Mods folder: <code>${esc(s.modsDir)}</code>${s.modsDirExists ? "" : " (not created yet)"}.</p></div>`;
    }
    return `<div class="panel"><h2>How to get the data from the game</h2>
      <p class="hint">This page is running in a browser. The <b>COI Planner</b> program window can install the exporter mod and read its files for you; here you do it by hand:</p>
      <ol style="padding-left:18px;margin:0"><li>Get the <code>PlannerDataExporter</code> mod folder (from the planner's GitHub release) and copy it to <code>%APPDATA%\\Captain of Industry\\Mods</code>; the folder must be named exactly <code>PlannerDataExporter</code>.</li>
      <li>Start the game, enable <b>Planner Data Exporter</b> and start a <b>new</b> map.</li>
      <li>The export appears in <code>...\\Mods\\PlannerDataExporter\\exports</code>. Very large? Use the summary box on the left.</li>
      <li>Import here (older exporter files <code>machines_and_buildings.json</code> and <code>products.json</code> work today).</li></ol>
      <p class="note">Nothing is uploaded: files are read in your browser.</p></div>`;
  }
  function render() {
    const d = getData(), issues = checkLines(d, LINES);
    el.innerHTML = `<div class="grid"><div class="panel"><h2>Game data</h2>
      <div class="stats"><div class="stat"><b style="font-size:1rem">${esc(d.meta.gameVersion)}</b><span>game version</span></div><div class="stat"><b>${d.recipes.length}</b><span>recipes</span></div><div class="stat"><b>${d.machines.length}</b><span>machines</span></div></div>
      <p class="hint">Source: ${isUser() ? "<b>your import</b> (stored in this browser)" : "bundled data (" + esc(BUNDLED.meta.source) + ")"}</p>
      ${issues.length ? `<div class="box bad sect"><b>Product lines need attention</b><br>${issues.map(esc).join("<br>")}</div>` : ""}
      <div class="sect"><label class="lbl" for="dF">Import from the game</label><input id="dF" type="file" accept=".json,application/json" multiple>
      <p class="hint">Select <code>machines_and_buildings.json</code> and <code>products.json</code> (and <code>transports.json</code>) together. Importing after a patch shows what changed.</p></div>
      ${isUser() ? `<div class="sect"><button class="btn" id="dReset">Go back to bundled data</button></div>` : ""}
      ${native ? "" : `<div class="sect"><label class="lbl" for="dSum">Export file too big to send? Make a small summary</label><input id="dSum" type="file" accept=".json,application/json">
      <p class="hint">Pick the large <code>planner-data-*.json</code> from the exporter mod. This reads it on your PC and saves a small <code>planner-export-summary.json</code> (structure and a few examples, not the whole file) that you can send.</p></div>`}
      <div class="sect"><label class="lbl">Backup (imported data, designs, choices)</label>
      <button class="btn" id="dBackup">Download backup</button> <label class="btn" style="display:inline-block;cursor:pointer">Restore backup<input id="dRestore" type="file" accept=".json,application/json" hidden></label>
      <p class="hint">${native ? "Saved data lives in the Data folder of this program and moves with it. A backup is still a good idea." : "Saved data lives in this browser for this file's location. If you move or rename the file, or use another browser, restore from a backup."}</p></div>
      <div class="sect">${msg}</div></div>
      ${rightPanel()}</div>`;
    const nb = (id: string, fn: () => Promise<void>) => { const b = el.querySelector<HTMLButtonElement>("#" + id); if (b) b.onclick = () => void fn().catch((e) => { nmsg = `<div class="box bad">${esc(e)}</div>`; render(); }); };
    nb("nBuild", async () => {
      nmsg = `<div class="box">Building the exporter for your game…</div>`; render();
      const r = await native!.build_and_install();
      nmsg = r.ok ? `<div class="box good">Built with the ${esc(r.compiler)} and installed. Now start the game, enable <b>Planner Data Exporter</b> and start a new map.</div>`
        : `<div class="box bad">${esc(r.error)}${r.log ? `<details><summary>Compiler log (send this if it keeps failing)</summary><pre style="white-space:pre-wrap;font-size:.75rem">${esc(r.log)}</pre></details>` : ""}</div>`;
      ns = r.state ?? (await native!.state()); render(); });
    nb("nGame", async () => { const r = await native!.pick_game_folder(); if (!r.ok && !r.cancelled) nmsg = `<div class="box bad">${esc(r.error)}</div>`; ns = r.state ?? (await native!.state()); render(); });
    nb("nOpen", async () => { const r = await native!.open_exports_folder(); if (!r.ok) { nmsg = `<div class="box bad">${esc(r.error)}</div>`; render(); } });
    nb("nSummary", async () => { nmsg = `<div class="box">Summarizing… (a very large export can take a minute)</div>`; render();
      const r = await native!.summarize_latest();
      nmsg = r.ok ? `<div class="box good">Summary of ${esc(r.source)} saved: ${kb(Number(r.bytes))}, ${r.types} kinds of prototype, ${r.prototypes} prototypes. <button class="btn" id="nCopy">Show text to copy</button> <button class="btn" id="nOpen2">Open folder</button></div>` : `<div class="box bad">${esc(r.error)}</div>`;
      ns = await native!.state(); render(); });
    nb("nImport", async () => {
      nmsg = `<div class="box">Reading the export…</div>`; render();
      const r = await native!.read_latest_export();
      nmsg = "";
      try { if (!r.ok) throw new Error(String(r.error)); applyImport(importPlanner(JSON.parse(String(r.text)))); }
      catch (e) { msg = `<div class="box bad">${esc((e as Error).message)}</div>`; }
      render(); });
    nb("nBp", async () => { const r = await native!.read_blueprint_api(); nmsg = r.ok ? `<div class="box"><textarea readonly style="width:100%;height:12rem;font:12px ui-monospace,monospace">${esc(r.text)}</textarea><p class="hint">${kb(Number(r.bytes))}. Select all, copy, and paste it into the chat. File: <code>${esc(r.path)}</code></p></div>` : `<div class="box bad">${esc(r.error)}${r.path ? " <code>" + esc(r.path) + "</code>" : ""}</div>`; render(); });
    nb("nRemove", async () => {
      if (!confirmRemove) { confirmRemove = true; render(); return; }
      confirmRemove = false; const r = await native!.uninstall_exporter();
      nmsg = r.ok ? `<div class="box good">Removed the exporter (and its exports) from the game's Mods folder.</div>` : `<div class="box bad">${esc(r.error)}</div>`; ns = r.state ?? (await native!.state()); render(); });
    nb("nOpen2", async () => { await native!.open_exports_folder(); });
    nb("nCopy", async () => { const r = await native!.read_summary(); nmsg = r.ok ? `<div class="box"><textarea readonly style="width:100%;height:12rem;font:12px ui-monospace,monospace">${esc(r.text)}</textarea><p class="hint">Select all, copy, and paste it into the chat.</p></div>` : `<div class="box bad">${esc(r.error)}</div>`; render(); });
    el.querySelector<HTMLInputElement>("#dF")!.onchange = (e) => { const f = (e.target as HTMLInputElement).files; if (f?.length) void onFiles(f); };
    const sumInput = el.querySelector<HTMLInputElement>("#dSum");
    if (sumInput) sumInput.onchange = async (e) => {
      const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
      try {
        const text = await f.text(); const sum = summarizeExport(JSON.parse(text)); const out = JSON.stringify(sum);
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([out], { type: "application/json" }));
        a.download = "planner-export-summary.json"; a.click(); URL.revokeObjectURL(a.href);
        msg = `<div class="box good">Summary saved as planner-export-summary.json: ${(out.length / 1024).toFixed(0)} kB from a ${(f.size / 1048576).toFixed(1)} MB file, ${Object.keys(sum.types).length} kinds of prototype.</div>`;
      } catch (err) {
        msg = `<div class="box bad">${esc(err instanceof RangeError || /memory|string length/i.test(String(err)) ? "That file is too big for the browser to read. Tell me its size in MB." : (err as Error).message)}</div>`;
      }
      render();
    };
    el.querySelector<HTMLButtonElement>("#dBackup")!.onclick = () => {
      if (native) { void native.save_text(`coi-planner-backup-${new Date().toISOString().slice(0, 10)}.json`, exportBackup()).then((r) => { msg = r.ok ? `<div class="box good">Backup saved to ${esc(r.path)}.</div>` : r.cancelled ? "" : `<div class="box bad">${esc(r.error)}</div>`; render(); }); return; }
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
  // Entry point used by the app: re-reads the exporter state first, so files that appeared while you were in the game show up.
  window.addEventListener("focus", () => { if (native) void refreshNative(); });
  return () => { if (native) void refreshNative(); render(); };
}
