# Constraints (from sessions)

Source of truth is the code. These bullets exist so the next run does not rediscover them.

## Electron shell

- Desktop shell is **Electron 44.3.0**, not Electrobun. Main is `src/main/index.ts`, preload is `src/preload/`, renderers stay React/Vite.
- Click-through uses `setIgnoreMouseEvents(ignore, { forward: true })`. The notch renderer calls `buddy.setIgnoreMouse` from mousemove over `[data-buddy-card]` vs empty glass. Overlay is always ignore-mouse.
- Frameless windows use `thickFrame: false` and `resizable: false` so Windows does not put a resize hit-test on the mic.
- `bun run dev` spawns Electron as a **direct child**. Ctrl+C must `taskkill /T` that tree. Kill leftover `electron.exe` in Task Manager before blaming new code.

## Notch HWND

- Collapsed measure of an expanded form is ~72px. Freeze at `NOTCH_BOOTSTRAP_HEIGHT` while Settings is open; stamp `rev` and drop older `setExpanded` calls.

## Mic

- Push-to-talk: pointerdown `startTalk`, pointerup/cancel `endTalk`, plus `setPointerCapture`.
- `getUserMedia` must start in the same pointerdown turn.

## What Electrobun taught (do not re-port)

WebView2 FFI transparency, Hutch/electrobun `--watch` grandchildren, and `passthrough: true` are gone. Do not add them back.
