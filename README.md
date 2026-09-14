# buddy

a heyclicky alt for windows

Buddy is a Windows desktop companion: hold Ctrl+Alt to talk, it captures the screen, transcribes you, asks a vision model about the screenshot, speaks the answer, and points at a UI element. It does not click or type.

## Stack

- [Bun](https://bun.sh) as the package manager, test runner, and `bun run dev` launcher
- [Electron](https://www.electronjs.org/) 44.3.0 desktop shell (main process + two renderer windows)
- TypeScript
- [Effect](https://effect.website) services for settings, capture, OpenRouter, overlay, and the talk pipeline
- React + Vite + Tailwind for the notch and pointer overlay

Windows 11 is the target. macOS and Linux may build; hold-to-talk is Windows-only (`GetAsyncKeyState` via koffi). Other OSes use the registered toggle shortcut plus the notch mic button.

## Install (Windows)

You only need [Bun](https://bun.sh).

1. Install Bun from https://bun.sh (PowerShell: `irm bun.sh/install.ps1 | iex`).
2. Clone this repo and install JS dependencies (the first install downloads Electron 44.3.0):

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

## Run

```powershell
bun run dev
```

That bundles the Electron main/preload processes, starts Vite for the notch (5173) and overlay (5174), then launches Electron. Ctrl+C kills Electron and the Vite servers.

| Script | What it does |
| --- | --- |
| `bun run dev` | Vite HMR + Electron |
| `bun run start` | Production-built views + Electron |
| `bun run build` | Bundle main, preload, and renderer views into `dist/` |
| `bun run build:views` | Vite-only build of notch + overlay |
| `bun test` | Unit tests |
| `bun run typecheck` | `tsc --noEmit` |

If an old Buddy/Electrobun process is still in Task Manager, end it before `bun run dev`.

## Use

1. Leave the always-on notch visible (top center). Click **Settings** (or the Buddy title) to open the API key form. Clicks on empty glass pass through to the desktop.
2. Save an OpenRouter API key if you did not set `OPENROUTER_API_KEY`. Click **Close** to collapse the form.
3. Talk using any of: **Hold Ctrl+Alt**, the toggle printed on the notch, or **hold the mic**. Release the mic or Ctrl+Alt to stop.
4. Buddy captures the primary display, transcribes with `openai/whisper-large-v3-turbo`, asks the vision model (default `openai/gpt-4o-mini`), speaks with `hexgrad/kokoro-82m` voice `af_sky`, and draws a highlight ring/arrow when the model returns coordinates.

### Hotkey notes

1. **Hold Ctrl+Alt** (Windows) — Buddy polls `user32.GetAsyncKeyState`. Press both to record; release to run the pipeline. Hold is paused only while a settings field is focused.
2. **Toggle shortcut** — Electron `globalShortcut` is press-only. Buddy registers the first free combo from: `Ctrl+Shift+Space`, `Ctrl+Alt+Space`, `Ctrl+Shift+B`, `F8`.
3. **Mic button** — press and hold to record, release to send.

While Buddy is focused, `Ctrl+Shift+Space`, `Ctrl+Alt+Space`, and `F8` also work as in-window toggles (ignored while an input is focused).

Missing API key, mic permission denied, empty audio, and OpenRouter failures show as an error on the notch.

If another elevated (Run as administrator) window is focused, Windows will not deliver keys to Buddy.

## Settings

Stored at Electron `userData/settings.json` (`%APPDATA%/buddy/settings.json` on Windows) with mode `0600`. Env vars override empty fields:

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
  main/                # Electron main process
    index.ts           # windows, IPC, talk session
    hotkeys.ts         # Ctrl+Alt hold + globalShortcut
    services/          # Effect services
  preload/             # contextBridge for notch + overlay
  mainview/            # React notch / settings
  overlay/             # transparent pointer overlay
  shared/              # protocol + POINT/JSON parser
scripts/
  desktop.ts           # bun run dev/start/build
```

The talk pipeline is `src/main/services/pipeline.ts`: capture → STT → vision/chat → overlay point → TTS.

## Tests

```powershell
bun install
bun test
bun run typecheck
```

Unit tests cover pointer parsing, PNG encoding, and mocked OpenRouter STT / vision / TTS.

## Out of scope (v1)

Agents, computer-use (click/type), always-on ambient mic, accounts, cloud backend, MCP.
