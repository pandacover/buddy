# File map

Open in this order for notch / mic / Settings bugs:

| File | Why |
| --- | --- |
| `src/mainview/App.tsx` | Mic hold/release, Settings expand, bounds RPC |
| `src/main/index.ts` | BrowserWindows, IPC, talk session, setBounds |
| `src/preload/notch.ts` | `window.buddy` bridge |
| `src/shared/overlay-geometry.ts` | `NOTCH_*` sizes, expanded floor |
| `src/mainview/recorder.ts` | `getUserMedia` / MediaRecorder |

Talk-pipeline only after the notch is ruled out: `src/shared/talk-session.ts`, then `src/main/services/pipeline.ts`.

Pointer overlay: `src/overlay/OverlayApp.tsx`, `src/preload/overlay.ts`.
