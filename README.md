# Captain of Industry Factory Planner

Static TypeScript/Vite planner for Captain of Industry: production chains, flex-loop factory designer, costs, layout.
See the build plan in `docs/PLAN.md`.

```
npm ci
npm test              # engine tests (PLAN.md section 5 cases)
npm run data:validate # schema-check data/*/gamedata.json
npm run dev           # local UI
npm run build         # type-check + production build into dist/
npm run wiki:check    # cross-check recipes against wiki.coigame.com (needs network)
```

## Live site
Every push to `main` is built and tested by GitHub Actions and published to GitHub Pages: https://cagcody1.github.io/COI-Planner/ . One-time setup: repo Settings → Pages → Source: **GitHub Actions**.

## Portable version (single file)
`npm run build:single` writes `dist-single/coi-planner.html` (~240 kB): the whole app and the bundled game data in one file you can open by double-click, copy to a USB stick, or email. GitHub builds it on every push to `main`: download it from the site at `/coi-planner.html` or as the `coi-planner-portable` artifact on the workflow run.
Saved data (imported game data, designs, choices) is stored by the browser for the file's location; use **Download backup** / **Restore backup** on the Game data tab to move it between browsers or after moving the file.

## Status
| Milestone | State |
|---|---|
| M0 setup (Vite, TS, Vitest, CI) | done |
| M1 data: schema + validator | done |
| M1 data | `data/0.8.1a-b550-Update-4` is an in-game export (see Data). Wiki cross-check script is written but unrun (wiki unreachable from the build sandbox). Own C# exporter not needed unless the upstream one lags a patch |
| M2 engine | rates, balancer, flex loop, issues, recursive chain solver, cost totals done and tested. Still to do: LP solver for cycles/recycling |
| M3 chain calculator UI | done (`src/ui/chainView.ts`) |
| M4 factory designer UI | done for CP and VP lines (`src/ui/designView.ts`); no flow diagram yet |
| M1/M7 data import + patch diff | done (`src/data/importCod.ts`, `diff.ts`, Game data tab) |
| M5 layout, M6 save/share, LP solver | not started |

Machine workers, power, maintenance, footprint and ports are optional in the schema and absent from the prototype data until the real export exists.

## Data
**The bundled data is out of date.** It is game 0.8.1a (b550) Update 4, converted from [doubleaxe/daxfb-calculator](https://github.com/doubleaxe/daxfb-calculator) (MIT), which was generated in March 2026. The game is now at **0.8.7** (confirmed by the project owner). Another project ([shuntianyifang/coi-balancer](https://github.com/shuntianyifang/coi-balancer), MIT, Oct 2026) targets 0.8.7d (build 619), and the game last updated on 2026-09-23. The app warns whenever the loaded data is older than 0.8.7 (`CURRENT_GAME` in `src/ui/store.ts`).

**Get current data from your own game** (Game data tab in the app, or `npx tsx scripts/import-cod.ts <dir>`):
1. Build the exporter mod [doubleaxe/captain-of-data](https://github.com/doubleaxe/captain-of-data) (`mod/DataExtractor.csproj`, Visual Studio, set `COI_ROOT` to your game folder). It has no license file, so it is not copied into this repo. It was last updated for 0.8.1a, so it may need small fixes for newer versions; check that it still compiles.
2. Put `DataExtractor.dll` in `%APPDATA%\Captain of Industry\Mods\DataExtractor`, load a save. It writes JSON to `c:\temp`.
3. In the app pick `machines_and_buildings.json`, `products.json` and `transports.json`. The data is stored in your browser, and the page lists every recipe and machine that changed against the previous data.

Format notes: product ids are in-game display names, machine ids are the game's ids, recipe ids are `<machine id>:<recipe id>`. Product lines (`data/<version>/lines.json`) refer to those names; after a patch the Game data tab reports any line whose products or assemblers no longer exist.

Not in any export I found: footprints, port positions, storage transfer rates, probabilistic outputs (waste sorting). Trade contracts are never used as default recipes. Base resources (ores, wood, water, ...) are treated as raw inputs (`BASE_RESOURCES` in `src/engine/chain.ts`).

`scripts/import-daxfb.ts` produced the bundled set; a cross-check of the exporter format against it matched all 640 shared recipe ids, 631 exactly (the 9 differences are research labs and the data center).
`data/prototype/` is the old hand-copied wiki table, kept only as a model regression fixture; several of its upper-tier quantities are wrong. `npx tsx scripts/section5-report.ts` prints the PLAN section 5 scenarios on both sets.
