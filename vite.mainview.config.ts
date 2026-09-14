import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { electrobunAliases } from "./vite.shared";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: electrobunAliases(rootDir),
  },
  root: "src/mainview",
  base: "./",
  css: {
    postcss: resolve(rootDir, "postcss.config.js"),
  },
  build: {
    outDir: "../../dist/mainview",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [rootDir],
    },
  },
});
