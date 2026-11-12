# Planner Data Exporter (game mod)

A read-only Captain of Industry mod that writes the game's prototype data to JSON for the COI Planner: recipes,
machines (workers, power, maintenance, costs) and what the existing exporters do not give us: **building layouts
(footprints and port positions), storages and transports**. It changes nothing in your save and does not contain any game
files; it is built against the game's own DLLs on your PC.

The mod skeleton and the reflection approach follow BalancerDataExporter (MIT, shuntianyifang); see `LICENSE-THIRD-PARTY`.

## Build (Windows, game installed)
- With PocketBuilder: recipe **COI-Exporter** (downloads the .NET SDK itself).
- Or by hand: `powershell -ExecutionPolicy Bypass -File build.ps1 -Install`. It finds the game through `COI_ROOT`,
  then Steam; only the game's `Managed\*.dll` files are read. Output: `build\PlannerDataExporter`.

## Use
1. Put the mod in `%APPDATA%\Captain of Industry\Mods` so that this file exists exactly:
   `%APPDATA%\Captain of Industry\Mods\PlannerDataExporter\manifest.json`
   The folder name must be exactly `PlannerDataExporter` (the game requires the folder name to match the mod id in
   `manifest.json`). Unzipping "to a folder named after the zip" makes an extra outer folder such as
   `PlannerDataExporter-v0.1.0`: copy the **inner** `PlannerDataExporter` folder (the one containing `manifest.json`),
   not the outer one, and do not nest it twice. `build.ps1 -Install` does it correctly.
2. Start the game, enable the mod in the mod list, load a **new vanilla test map** (not an important save, no other mods).
3. The file appears in `...\Mods\PlannerDataExporter\exports\planner-data-<time>.json`; errors go to the game log
   (`PlannerDataExporter`). Send me that file: the first real run shows the exact structure of layouts and storages,
   and the planner's importer is then written against it.

## Output
`protos` is grouped by the game's prototype type. Each entry is `{id, name, data}` where `data` is a reflective dump of
the prototype's public members (depth 7). References to other prototypes are kept as `{"protoId": ...}`; cycles and
members that throw are marked, not fatal.

## What is and is not verified
- `./check.sh` (needs Mono's `mcs`): the code compiles against stand-in game types and, run on a fake database, writes
  valid JSON with layouts, ports, structs, enums, prototype references, cycles and throwing getters handled.
- **Not verified:** compiling against the real 0.8.7 DLLs and running inside the game. Only the mod interface and database
  calls that the MIT exporter above already uses are used directly; everything else is read by reflection.
- If compilation fails after a game update, send the compiler message.
