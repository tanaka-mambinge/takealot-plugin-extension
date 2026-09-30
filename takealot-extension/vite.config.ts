import { resolve } from "node:path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  root: resolve(import.meta.dirname, "src/ui"),
  base: "./",
  plugins: [viteSingleFile()],
  build: {
    outDir: resolve(import.meta.dirname, "dist/ui"),
    emptyOutDir: true,
    assetsInlineLimit: 2_000_000,
  },
});
