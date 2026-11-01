// dist-single/index.html -> dist-single/coi-planner.html (a name that makes sense on a USB stick)
import { renameSync, statSync } from "node:fs";
renameSync("dist-single/index.html", "dist-single/coi-planner.html");
console.log(`dist-single/coi-planner.html  ${(statSync("dist-single/coi-planner.html").size / 1024).toFixed(0)} kB`);
