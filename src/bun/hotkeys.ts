import { GlobalShortcut } from "electrobun/main";
import {
  TOGGLE_SHORTCUT_CANDIDATES,
  readTalkKeys,
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
  mode: "hold" | "toggle";
  detail: string;
};

type AsyncKeyStateLib = {
  symbols: {
    GetAsyncKeyState: (virtualKey: number) => number;
  };
};

async function openUser32(): Promise<AsyncKeyStateLib | null> {
  if (process.platform !== "win32") return null;
  const { dlopen, FFIType } = await import("bun:ffi");
  const candidates = [
    "user32.dll",
    "C:\\Windows\\System32\\user32.dll",
    "C:\\Windows\\SysWOW64\\user32.dll",
  ];
  for (const path of candidates) {
    try {
      return dlopen(path, {
        GetAsyncKeyState: {
          args: [FFIType.i32],
          // x64 returns SHORT in RAX; i32 avoids dropping the 0x8000 bit.
          returns: FFIType.i32,
        },
      });
    } catch {
      // Try the next path.
    }
  }
  return null;
}

async function startWindowsHold(handlers: TalkHandlers): Promise<KeyPoller | null> {
  if (process.platform !== "win32") return null;

  try {
    const user32 = await openUser32();
    if (!user32) {
      console.warn("Windows GetAsyncKeyState is unavailable (user32.dll)");
      return null;
    }

    let previous: TalkKeySnapshot | null = null;
    const timer = setInterval(() => {
      const paused = handlers.isHoldPaused?.() ?? false;
      const snapshot = readTalkKeys((vk) => user32.symbols.GetAsyncKeyState(vk));
      const edges = talkKeyEdges(previous, snapshot);
      previous = snapshot;

      if (paused) {
        if (edges.holdEnd) handlers.onHoldEnd();
        return;
      }

      if (edges.toggle) {
        if (snapshot.hold) handlers.onHoldEnd();
        handlers.onToggle();
        return;
      }
      if (edges.holdStart) handlers.onHoldStart();
      if (edges.holdEnd) handlers.onHoldEnd();
    }, 16);

    return {
      stop: () => clearInterval(timer),
      mode: "hold",
      detail: "Windows GetAsyncKeyState Ctrl+Alt hold-to-talk",
    };
  } catch (error) {
    console.warn("Windows Ctrl+Alt hold polling is unavailable:", error);
    return null;
  }
}

function registerToggleShortcut(onToggle: () => void): string | null {
  for (const accelerator of TOGGLE_SHORTCUT_CANDIDATES) {
    try {
      if (GlobalShortcut.register(accelerator, onToggle)) {
        return accelerator;
      }
    } catch (error) {
      console.warn(`GlobalShortcut.register(${accelerator}) failed:`, error);
    }
  }
  return null;
}

export async function startTalkHotkeys(handlers: TalkHandlers): Promise<{
  stop: () => void;
  binding: string;
}> {
  const hold = await startWindowsHold(handlers);
  const registered = registerToggleShortcut(handlers.onToggle);

  const parts: string[] = [];
  if (hold) {
    parts.push("Hold Ctrl+Alt to talk");
  }
  if (registered) {
    parts.push(`Toggle ${registered}`);
  }
  parts.push("Mic button on the notch");

  return {
    binding: parts.join(" · "),
    stop: () => {
      hold?.stop();
      if (registered) {
        try {
          GlobalShortcut.unregister(registered);
        } catch {
          // Ignore shutdown races.
        }
      }
    },
  };
}
