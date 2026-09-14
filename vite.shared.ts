import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Alias } from "vite";

export async function electrobunAliases(rootDir: string): Promise<Alias[]> {
  // After `bun run desktop:prepare` (or `bun run dev`), Hutch projects the SDK
  // here. Until then, views compile against src/shims/electrobun-view.ts.
  const devkitRoot = resolve(rootDir, ".hutch/devkit");
  const helper = resolve(devkitRoot, "api/config/electrobun-vite.ts");
  if (existsSync(helper)) {
    const mod = (await import(helper)) as {
      electrobunViteAliases: (root: string) => Alias[];
    };
    return mod.electrobunViteAliases(devkitRoot);
  }

  return [
    {
      find: /^electrobun\/view$/,
      replacement: resolve(rootDir, "src/shims/electrobun-view.ts"),
    },
  ];
}
