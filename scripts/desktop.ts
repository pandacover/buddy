#!/usr/bin/env bun
/**
 * Windows-safe Electrobun launcher.
 *
 * The npm `electrobun` package is a CLI only: it downloads a paired Hutch
 * archive from GitHub into ~/.hutch/npm/… and forwards `electrobun <cmd>`
 * to that cache. It does not require a global Hutch install, and we never
 * call `electrobun init` (that path runs install.ps1).
 *
 * The CLI file's shebang is `node`. Running it through Bun means a machine
 * with only Bun installed still works.
 */
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const electrobunCli = resolve(root, "node_modules/electrobun/bin/electrobun.cjs");

const COMMANDS = ["dev", "start", "build", "hmr", "prepare"] as const;
type Command = (typeof COMMANDS)[number];

function isCommand(value: string | undefined): value is Command {
  return COMMANDS.includes(value as Command);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

async function run(argv: string[]): Promise<void> {
  const child = Bun.spawn(argv, {
    cwd: root,
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const code = await child.exited;
  if (code !== 0) {
    process.exit(code ?? 1);
  }
}

async function electrobun(args: string[]): Promise<void> {
  if (!existsSync(electrobunCli)) {
    fail("Missing the electrobun CLI. Run `bun install` from the repo root first.");
  }
  await run([process.execPath, electrobunCli, ...args]);
}

async function bunRun(script: string): Promise<void> {
  await run([process.execPath, "run", script]);
}

function viteBin(): string {
  return resolve(root, "node_modules/vite/bin/vite.js");
}

async function runHmr(): Promise<void> {
  await electrobun(["prepare"]);
  await bunRun("build:overlay");

  const vite = Bun.spawn(
    [process.execPath, viteBin(), "--config", "vite.mainview.config.ts", "--port", "5173"],
    {
      cwd: root,
      env: process.env,
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  const app = Bun.spawn([process.execPath, electrobunCli, "dev"], {
    cwd: root,
    env: process.env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const stop = () => {
    vite.kill();
    app.kill();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const codes = await Promise.all([vite.exited, app.exited]);
  const failed = codes.find((code) => code !== 0);
  process.exit(failed ?? 0);
}

const command = process.argv[2];
const extra = process.argv.slice(3);

if (!isCommand(command)) {
  fail(
    `Usage: bun scripts/desktop.ts <${COMMANDS.join("|")}> [electrobun-args...]\n` +
      "Primary: bun run dev",
  );
}

switch (command) {
  case "prepare":
    await electrobun(["prepare", ...extra]);
    break;
  case "dev":
    await electrobun(["prepare"]);
    await bunRun("build:views");
    await electrobun(["dev", "--watch", ...extra]);
    break;
  case "start":
    await electrobun(["prepare"]);
    await bunRun("build:views");
    await electrobun(["dev", ...extra]);
    break;
  case "build":
    await electrobun(["prepare"]);
    await bunRun("build:views");
    await electrobun(["build", "--env=stable", ...extra]);
    break;
  case "hmr":
    await runHmr();
    break;
}
