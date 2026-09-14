import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { electrobunAliases } from "./vite.shared";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => ({
  plugins: [react()],
  resolve: {
    alias: await electrobunAliases(rootDir),
  },
  root: "src/overlay",
  base: "./",
  css: {
    postcss: resolve(rootDir, "postcss.config.js"),
  },
  build: {
    outDir: "../../dist/overlay",
    emptyOutDir: true,
  },
  server: {
    fs: {
      allow: [rootDir],
    },
  },
}));
