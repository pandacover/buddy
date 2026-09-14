# buddy

a heyclicky alt for windows

Buddy is a Windows desktop companion: hold Ctrl+Alt to talk, it captures the screen, transcribes you, asks a vision model about the screenshot, speaks the answer, and points at a UI element. It does not click or type.

This project is pinned to **Electrobun 2.0.1** (Bun main process) via `hutch.config.ts`.

## Stack

- [Bun](https://bun.sh) runtime and package manager
- [Electrobun](https://framework.blackboard.sh/electrobun/) desktop shell (`mainProcess: "bun"`)
- TypeScript
- [Effect](https://effect.website) services for settings, capture, OpenRouter, overlay, and the talk pipeline
- React + Vite + Tailwind for the notch and pointer overlay

Windows 11 is the target. macOS and Linux may build, but hold-to-talk uses `GetAsyncKeyState` on Windows. Other OSes fall back to a `Ctrl+Alt+Space` toggle plus the notch mic button.

## Install (Windows)

1. Install [Bun](https://bun.sh).
2. Install [Hutch](https://github.com/blackboardsh/electrobun) (Electrobun's build CLI):

```powershell
& ([scriptblock]::Create((irm https://hutch.blackboard.sh/hutch/install.ps1)))
```

On macOS/Linux:

```bash
curl -fsSL https://hutch.blackboard.sh/hutch/install.sh | sh
```

3. Clone this repo, then:

```bash
cd buddy
hutch electrobun sync
hutch run install
```

`hutch electrobun sync` projects the Electrobun TypeScript SDK into `.hutch/devkit`. Vite aliases `electrobun/view` from that SDK.

4. Copy `.env.example` to `.env` and set your key (or paste it in the notch later):

```bash
copy .env.example .env
```

```
OPENROUTER_API_KEY=sk-or-v1-...
```

Create a key at https://openrouter.ai/keys. Do not commit `.env`.

## Run

```bash
hutch run dev
```

That builds the React views, then starts Electrobun in watch mode.

With Vite HMR for the notch UI:

```bash
hutch run dev:hmr
```

Production-style package:

```bash
hutch run build
```

## Use

1. Leave the always-on notch visible (top center). Click it to open settings.
2. Save an OpenRouter API key if you did not set `OPENROUTER_API_KEY`.
3. **Hold Ctrl+Alt** and speak. Release to stop.
4. Buddy captures the primary display, transcribes with `openai/whisper-large-v3-turbo`, asks the vision model (default `openai/gpt-4o-mini`), speaks with `hexgrad/kokoro-82m` voice `af_sky`, and draws a highlight ring/arrow when the model returns coordinates.

### Hotkey notes

Electrobun's `GlobalShortcut` registers accelerator chords (keydown), not modifier-only hold/release. On Windows, Buddy polls `user32.GetAsyncKeyState` so **Ctrl+Alt hold** works without an extra key.

Also registered: **Ctrl+Alt+Space** as a start/stop toggle, in case hold polling fails or you are not on Windows. The notch mic button is a pointer-hold control and always works while Buddy is focused.

If another app already owns Ctrl+Alt+Space, use the notch button.

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
```

The talk pipeline is `src/bun/services/pipeline.ts`: capture → STT → vision/chat → overlay point → TTS. Overlay drawing is highlight-only.

## Tests

```bash
bun install
bun test
bun run typecheck
```

Unit tests cover pointer parsing, PNG encoding, and mocked OpenRouter STT / vision / TTS. The desktop shell is not exercised in this Linux CI environment (no Electrobun display session).

## Out of scope (v1)

Agents, computer-use (click/type), always-on ambient mic, accounts, cloud backend, MCP.
