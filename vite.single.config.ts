// Portable build: everything (code, styles, bundled game data) inlined into one HTML file that opens by double-click.
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
export default defineConfig({
  base: "./",
  plugins: [viteSingleFile()],
  build: { outDir: "dist-single", emptyOutDir: true },
});
