import react from "@vitejs/plugin-react";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
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
    port: 5174,
    strictPort: true,
    fs: {
      allow: [rootDir],
    },
  },
});
