# Game-data exporter (M1)

Plan order (PLAN.md section 2): (1) use an existing exporter if its output covers recipes, machines, transports and
storages, e.g. the CLExporter mod (https://coigame.com/Mod/47/CLExporter), (2) otherwise write a read-only C# mod
that dumps the prototype database to JSON matching `src/data/schema.ts`.

Status: **not started**. coigame.com and the wiki were not reachable from the build sandbox, so CLExporter's output
format is still unchecked. To check it: install the mod, load a save, and look in the mod/`%APPDATA%` folder for output.
Send me a sample file and I'll write an importer to `data/<gameVersion>/gamedata.json`.

Write the result to `data/<gameVersion>/gamedata.json` and run `npm run data:validate`.
