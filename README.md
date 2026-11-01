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

## Status
| Milestone | State |
|---|---|
| M0 setup (Vite, TS, Vitest, CI) | done |
| M1 data: schema + validator | done |
| M1 data | `data/0.8.1a-b550-Update-4` is an in-game export (see Data). Wiki cross-check script is written but unrun (wiki unreachable from the build sandbox). Own C# exporter not needed unless the upstream one lags a patch |
| M2 engine | rates, balancer, flex loop (phases + throttled), issues done; all section 5 tests pass. Still to do: LP chain solver, costs |
| M3-M7 | not started (a minimal designer shell is in `src/main.ts`) |

Machine workers, power, maintenance, footprint and ports are optional in the schema and absent from the prototype data until the real export exists.

## Data
- **Current set:** `data/0.8.1a-b550-Update-4/` (game 0.8.1a b550, Update 4): 700 recipes, 122 machines with workers/power/computing/maintenance/build cost, belt rates. Converted by `scripts/import-daxfb.ts` from [doubleaxe/daxfb-calculator](https://github.com/doubleaxe/daxfb-calculator) (MIT), which generates its data from the game with the [captain-of-data](https://github.com/doubleaxe/captain-of-data) mod. See `NOTICE.md` there.
- **Not in that export:** footprints, port positions, storage transfer rates, and probabilistic outputs (waste sorting). Belt II is 199.80/min in game, not 200.
- **Is it the latest game version?** It is the newest data I could find on GitHub, but I could not confirm the live game version (Steam, the wiki and coigame.com are blocked from the build sandbox). Check the version in game and re-import after a patch: `npx tsx scripts/import-daxfb.ts <daxfb-calculator>/data/coi`.
- `data/prototype/` is the old hand-copied wiki table, kept only as a model regression fixture. Several of its upper-tier recipe quantities are wrong (e.g. Assembly III CP II is 12/min, not 36). `npx tsx scripts/section5-report.ts` prints the PLAN section 5 scenarios on both sets.
