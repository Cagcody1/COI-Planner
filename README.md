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
| M1 data: real export / wiki cross-check | **blocked**: `data/prototype` is the prototype's recipe table (wiki, partly guessed). `tools/wiki-check` is written but unrun (wiki and coigame.com were unreachable from the build sandbox); the C# exporter is not started (`tools/exporter/README.md`) |
| M2 engine | rates, balancer, flex loop (phases + throttled), issues done; all section 5 tests pass. Still to do: LP chain solver, costs |
| M3-M7 | not started (a minimal designer shell is in `src/main.ts`) |

Machine workers, power, maintenance, footprint and ports are optional in the schema and absent from the prototype data until the real export exists.
