# buddy

a heyclicky alt for windows

Buddy is a Windows desktop companion: hold Ctrl+Alt to talk, it captures the screen, transcribes you, asks a vision model about the screenshot, speaks the answer, and points at a UI element. It does not click or type.

## Stack

- [Bun](https://bun.sh) runtime and package manager
- [Electrobun](https://framework.blackboard.sh/electrobun/) desktop shell (`mainProcess: "bun"`), launched through the npm `electrobun` CLI
- TypeScript
- [Effect](https://effect.website) services for settings, capture, OpenRouter, overlay, and the talk pipeline
- React + Vite + Tailwind for the notch and pointer overlay

Windows 11 is the target. macOS and Linux may build; hold-to-talk is Windows-only (`GetAsyncKeyState`). Other OSes use the registered toggle shortcut plus the notch mic button.

## Install (Windows)

You only need [Bun](https://bun.sh). Node.js and a global Hutch install are not required.

1. Install Bun from https://bun.sh (PowerShell: `irm bun.sh/install.ps1 | iex`).
2. Clone this repo and install JS dependencies:

```powershell
cd buddy
bun install
```

3. Copy `.env.example` to `.env` and set your key (or paste it in the notch later):

```powershell
copy .env.example .env
```

```
OPENROUTER_API_KEY=sk-or-v1-...
```

Create a key at https://openrouter.ai/keys. Do not commit `.env`.

Windows 11 already includes WebView2. The first `bun run dev` downloads Electrobun 2.0.1's paired build tools from GitHub into `%USERPROFILE%\.hutch\npm\` (private cache — not a PATH install). That step needs network access to GitHub. Do **not** run `electrobun init` or the Hutch PowerShell installer; those are what fail with `could not bootstrap release selection`.

## Run

```powershell
bun run dev
```

That prepares the Electrobun SDK, builds the React views, then starts the desktop app in watch mode.

| Script | What it does |
| --- | --- |
| `bun run dev` | Prepare SDK, build views, run Electrobun with `--watch` |
| `bun run start` | Same as `dev` without `--watch` |
| `bun run build` | Prepare SDK, build views, package `--env=stable` |
| `bun run dev:hmr` | Vite HMR for the notch plus Electrobun (overlay is still a production Vite build) |
| `bun run desktop:prepare` | Download/project the Electrobun SDK only (`electrobun prepare`) |
| `bun run build:views` | Vite-only build of notch + overlay |
| `bun test` | Unit tests |
| `bun run typecheck` | `tsc --noEmit` |

Equivalent one-liner if you prefer not to use the wrapper: `bunx electrobun@2.0.1 prepare` then `bunx electrobun@2.0.1 dev --watch` after `bun run build:views`. Prefer `bun run dev` on Windows so the CLI runs under Bun instead of Node.

## Use

1. Leave the always-on notch visible (top center). Click it to open settings.
2. Save an OpenRouter API key if you did not set `OPENROUTER_API_KEY`.
3. **Hold Ctrl+Alt** and speak. Release to stop. If hold does not fire, use the toggle shown on the notch (Buddy tries `Ctrl+Shift+Space`, then `Ctrl+Alt+Space`, then `Ctrl+Shift+B`, then `F8`) or hold the mic button.
4. Buddy captures the primary display, transcribes with `openai/whisper-large-v3-turbo`, asks the vision model (default `openai/gpt-4o-mini`), speaks with `hexgrad/kokoro-82m` voice `af_sky`, and draws a highlight ring/arrow when the model returns coordinates.

### Hotkey notes

Talk can be started three ways. None of them need Administrator or Accessibility permission.

1. **Hold Ctrl+Alt** (Windows) — Buddy polls `user32.GetAsyncKeyState` for left/right Ctrl and Alt. Press both to record; release to run the pipeline. Hold is paused while the settings panel is open so you can type an API key.
2. **Toggle shortcut** — Electrobun `GlobalShortcut` is press-only, so this is a start/stop tap. Buddy registers the first free combo from: `Ctrl+Shift+Space`, `Ctrl+Alt+Space`, `Ctrl+Shift+B`, `F8`. The notch subtitle shows which one stuck. `Ctrl+Alt+Space` is often already taken by another app; that is why it is not first.
3. **Mic button** on the notch — pointer-down starts, pointer-up stops. This works even if every global shortcut fails, as long as the notch is focused.

While Buddy is focused, `Ctrl+Shift+Space`, `Ctrl+Alt+Space`, and `F8` also work as in-window toggles (ignored while an input is focused).

If another elevated (Run as administrator) window is focused, Windows will not deliver keys to Buddy. Run Buddy normally; do not run it as admin unless the app you are pointing at is also elevated.

## Settings

Stored at Electrobun `userData/settings.json` with mode `0600`. The API key is never committed. Env vars override empty fields:

| Variable | Default |
| --- | --- |
| `OPENROUTER_API_KEY` | (required) |
| `OPENROUTER_VISION_MODEL` | `openai/gpt-4o-mini` |
| `OPENROUTER_STT_MODEL` | `openai/whisper-large-v3-turbo` |
| `OPENROUTER_TTS_MODEL` | `hexgrad/kokoro-82m` |
| `OPENROUTER_TTS_VOICE` | `af_sky` |
| `OPENROUTER_TTS_FORMAT` | `mp3` |

## Project layout

```
src/
  bun/                 # Electrobun main process (Bun)
    index.ts           # windows, RPC, hotkeys
    hotkeys.ts         # Ctrl+Alt hold + GlobalShortcut fallback
    png.ts             # RGBA → PNG for vision
    services/          # Effect services
  mainview/            # React notch / settings
  overlay/             # transparent pointer overlay
  shared/              # protocol + POINT/JSON parser
scripts/
  desktop.ts           # bun run dev/start/build → electrobun CLI
```

The talk pipeline is `src/bun/services/pipeline.ts`: capture → STT → vision/chat → overlay point → TTS. Overlay drawing is highlight-only.

`electrobun.config.ts` keeps `build.mainProcess: "bun"`. `hutch.config.ts` only pins Electrobun `2.0.1`; you do not need the `hutch` command on PATH.

## Tests

```powershell
bun install
bun test
bun run typecheck
```

Unit tests cover pointer parsing, PNG encoding, and mocked OpenRouter STT / vision / TTS. The desktop shell is not exercised in this Linux CI environment (no Electrobun display session).

## Optional: global Hutch

A machine-wide Hutch install is **not** part of the normal workflow. The npm CLI already caches a paired Hutch privately. If you already have Hutch and want its extra commands, you can still run `hutch electrobun prepare` / `hutch electrobun dev --watch` from this repo; the version pin in `hutch.config.ts` wins. Skip this unless you need it.

## Out of scope (v1)

Agents, computer-use (click/type), always-on ambient mic, accounts, cloud backend, MCP.
