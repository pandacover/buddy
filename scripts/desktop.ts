#!/usr/bin/env bun
/**
 * Build renderers + Electron main/preload, then launch Electron.
 * Electron is a direct child so Ctrl+C / terminal close can kill it.
 */
import * as esbuild from "esbuild";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const electronBin = require("electron") as string;

const COMMANDS = ["dev", "start", "build"] as const;
type Command = (typeof COMMANDS)[number];

type Child = ReturnType<typeof Bun.spawn>;
const tracked = new Set<Child>();
let shuttingDown = false;

function isCommand(value: string | undefined): value is Command {
  return COMMANDS.includes(value as Command);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function killPidTree(pid: number | undefined) {
  if (pid == null || pid <= 0) return;
  if (process.platform === "win32") {
    Bun.spawnSync(["taskkill", "/PID", String(pid), "/T", "/F"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already gone.
  }
}

function killTracked() {
  for (const child of tracked) {
    killPidTree(child.pid);
  }
  tracked.clear();
  if (process.platform === "win32") {
    Bun.spawnSync(["taskkill", "/IM", "electron.exe", "/T", "/F"], {
      stdout: "ignore",
      stderr: "ignore",
    });
  }
}

function requestShutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  killTracked();
  process.exit(code);
}

process.on("SIGINT", () => requestShutdown(130));
process.on("SIGTERM", () => requestShutdown(143));
process.on("SIGHUP", () => requestShutdown(129));
process.on("exit", () => {
  killTracked();
});

async function run(argv: string[], extraEnv?: Record<string, string>): Promise<number> {
  const child = Bun.spawn(argv, {
    cwd: root,
    env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  tracked.add(child);
  const code = await child.exited;
  tracked.delete(child);
  return code ?? 0;
}

async function bunRun(script: string): Promise<void> {
  const code = await run([process.execPath, "run", script]);
  if (shuttingDown) return;
  if (code !== 0) requestShutdown(code);
}

async function bundleMain(): Promise<void> {
  const shared = {
    bundle: true,
    platform: "node" as const,
    format: "cjs" as const,
    target: "es2022",
    sourcemap: true,
    logLevel: "info" as const,
    external: ["electron", "koffi"],
  };
  await Promise.all([
    esbuild.build({
      ...shared,
      entryPoints: [resolve(root, "src/main/index.ts")],
      outfile: resolve(root, "dist/main/index.cjs"),
    }),
    esbuild.build({
      ...shared,
      entryPoints: [resolve(root, "src/preload/notch.ts")],
      outfile: resolve(root, "dist/preload/notch.cjs"),
    }),
    esbuild.build({
      ...shared,
      entryPoints: [resolve(root, "src/preload/overlay.ts")],
      outfile: resolve(root, "dist/preload/overlay.cjs"),
    }),
  ]);
}

async function waitForUrl(url: string, timeoutMs = 20_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url, { method: "HEAD" });
      if (response.ok || response.status === 404) return;
    } catch {
      // Vite is still starting.
    }
    await Bun.sleep(150);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function startVite(config: string, port: string): Promise<Child> {
  const child = Bun.spawn(
    [process.execPath, "x", "vite", "--config", config, "--port", port, "--strictPort"],
    {
      cwd: root,
      env: process.env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  tracked.add(child);
  return child;
}

async function launchElectron(env?: Record<string, string>): Promise<void> {
  const code = await run([electronBin, "."], env);
  if (shuttingDown) return;
  if (code !== 0) requestShutdown(code);
}

const command = process.argv[2];
if (!isCommand(command)) {
  fail(`Usage: bun scripts/desktop.ts <${COMMANDS.join("|")}>\nPrimary: bun run dev`);
}

switch (command) {
  case "build":
    await bunRun("build:views");
    await bundleMain();
    break;
  case "start":
    await bunRun("build:views");
    await bundleMain();
    await launchElectron();
    break;
  case "dev":
    await bundleMain();
    await startVite("vite.mainview.config.ts", "5173");
    await startVite("vite.overlay.config.ts", "5174");
    await waitForUrl("http://localhost:5173");
    await waitForUrl("http://localhost:5174");
    await launchElectron({
      BUDDY_NOTCH_URL: "http://localhost:5173",
      BUDDY_OVERLAY_URL: "http://localhost:5174",
    });
    requestShutdown(0);
    break;
}
