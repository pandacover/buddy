import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Alias } from "vite";

type DevkitPackage = {
  exports?: Record<string, unknown>;
};

function exactImportPattern(specifier: string): RegExp {
  return new RegExp(`^${specifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`);
}

function isWithin(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child !== ".." && !child.startsWith(`..${sep}`) && !isAbsolute(child);
}

/**
 * Map `electrobun/*` to the SDK Hutch projects into `.hutch/devkit`.
 * Reads the generated package.json instead of importing the official
 * TypeScript helper, so Vite can run under Node or Bun.
 */
export function electrobunAliases(rootDir: string): Alias[] {
  const devkitRoot = resolve(rootDir, ".hutch/devkit");
  const packagePath = resolve(devkitRoot, "package.json");
  const shim = resolve(rootDir, "src/shims/electrobun-view.ts");

  if (!existsSync(packagePath)) {
    return [{ find: /^electrobun\/view$/, replacement: shim }];
  }

  let manifest: DevkitPackage;
  try {
    manifest = JSON.parse(readFileSync(packagePath, "utf8")) as DevkitPackage;
  } catch {
    return [{ find: /^electrobun\/view$/, replacement: shim }];
  }

  if (!manifest.exports || Array.isArray(manifest.exports)) {
    return [{ find: /^electrobun\/view$/, replacement: shim }];
  }

  const apiRoot = resolve(devkitRoot, "api");
  return Object.entries(manifest.exports).flatMap(([subpath, target]) => {
    if (subpath !== "." && !subpath.startsWith("./")) return [];
    if (typeof target !== "string" || !target.startsWith("./api/")) return [];
    const replacement = resolve(devkitRoot, target);
    if (!isWithin(apiRoot, replacement)) return [];
    const specifier = subpath === "." ? "electrobun" : `electrobun/${subpath.slice(2)}`;
    return [{ find: exactImportPattern(specifier), replacement }];
  });
}
