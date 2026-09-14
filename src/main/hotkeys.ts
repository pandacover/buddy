import { createRequire } from "node:module";
import { globalShortcut } from "electron";
import {
  TOGGLE_SHORTCUT_CANDIDATES,
  friendlyHotkey,
  readTalkKeys,
  talkHotkeyActions,
  talkKeyEdges,
  type TalkKeySnapshot,
} from "../shared/talk-keys";

export type TalkHandlers = {
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onToggle: () => void;
  isHoldPaused?: () => boolean;
};

type KeyPoller = {
  stop: () => void;
};

function openGetAsyncKeyState(): ((virtualKey: number) => number) | null {
  if (process.platform !== "win32") return null;
  try {
    const require = createRequire(import.meta.url);
    const koffi = require("koffi") as {
      load: (name: string) => { func: (sig: string) => (...args: unknown[]) => unknown };
    };
    const user32 = koffi.load("user32.dll");
    const GetAsyncKeyState = user32.func("int __stdcall GetAsyncKeyState(int vKey)");
    return (virtualKey: number) => Number(GetAsyncKeyState(virtualKey));
  } catch (error) {
    console.warn("Windows GetAsyncKeyState is unavailable:", error);
    return null;
  }
}

function startWindowsHold(handlers: TalkHandlers): KeyPoller | null {
  const getAsyncKeyState = openGetAsyncKeyState();
  if (!getAsyncKeyState) return null;

  let previous: TalkKeySnapshot | null = null;
  const timer = setInterval(() => {
    const paused = handlers.isHoldPaused?.() ?? false;
    const snapshot = readTalkKeys(getAsyncKeyState);
    const edges = talkKeyEdges(previous, snapshot);
    previous = snapshot;
    for (const action of talkHotkeyActions(paused, edges)) {
      if (action === "holdStart") handlers.onHoldStart();
      else if (action === "holdEnd") handlers.onHoldEnd();
      else handlers.onToggle();
    }
  }, 16);

  return { stop: () => clearInterval(timer) };
}

function registerToggleShortcut(onToggle: () => void): string | null {
  for (const accelerator of TOGGLE_SHORTCUT_CANDIDATES) {
    try {
      if (globalShortcut.register(accelerator, onToggle)) {
        console.log(`[buddy] registered toggle ${accelerator}`);
        return accelerator;
      }
    } catch (error) {
      console.warn(`globalShortcut.register(${accelerator}) failed:`, error);
    }
  }
  return null;
}

export function startTalkHotkeys(handlers: TalkHandlers): {
  stop: () => void;
  binding: string;
} {
  const hold = startWindowsHold(handlers);
  const registered = registerToggleShortcut(handlers.onToggle);
  const parts: string[] = [];
  if (hold) parts.push("Hold Ctrl+Alt");
  if (registered) parts.push(friendlyHotkey(registered));
  return {
    binding: parts.length > 0 ? parts.join(" · ") : "Hold the mic to talk",
    stop: () => {
      hold?.stop();
      globalShortcut.unregisterAll();
    },
  };
}
