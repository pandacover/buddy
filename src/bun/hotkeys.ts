import { GlobalShortcut } from "electrobun/main";
import { TOGGLE_HOTKEY } from "../shared/protocol";

export type TalkHandlers = {
  onHoldStart: () => void;
  onHoldEnd: () => void;
  onToggle: () => void;
};

type KeyPoller = {
  stop: () => void;
  mode: "hold" | "toggle";
  detail: string;
};

const VK_CONTROL = 0x11;
const VK_MENU = 0x12;

async function startWindowsHold(handlers: TalkHandlers): Promise<KeyPoller | null> {
  if (process.platform !== "win32") return null;

  try {
    const { dlopen, FFIType } = await import("bun:ffi");
    const user32 = dlopen("user32.dll", {
      GetAsyncKeyState: {
        args: [FFIType.i32],
        returns: FFIType.i16,
      },
    });

    const isDown = (vk: number) =>
      (user32.symbols.GetAsyncKeyState(vk) & 0x8000) !== 0;

    let held = false;
    const timer = setInterval(() => {
      const next = isDown(VK_CONTROL) && isDown(VK_MENU);
      if (next && !held) handlers.onHoldStart();
      if (!next && held) handlers.onHoldEnd();
      held = next;
    }, 32);

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

export async function startTalkHotkeys(handlers: TalkHandlers): Promise<{
  stop: () => void;
  binding: string;
}> {
  const hold = await startWindowsHold(handlers);
  let registered = false;
  try {
    registered = GlobalShortcut.register(TOGGLE_HOTKEY, handlers.onToggle);
  } catch (error) {
    console.warn("GlobalShortcut.register failed:", error);
  }

  return {
    binding: hold
      ? `Hold Ctrl+Alt to talk. Fallback toggle: ${TOGGLE_HOTKEY}${registered ? "" : " (failed to register)"}`
      : registered
        ? `Hold-to-talk modifiers are not available on this OS. Toggle with ${TOGGLE_HOTKEY}.`
        : `Could not register ${TOGGLE_HOTKEY}. Use the notch mic button.`,
    stop: () => {
      hold?.stop();
      if (registered) {
        try {
          GlobalShortcut.unregister(TOGGLE_HOTKEY);
        } catch {
          // Ignore shutdown races.
        }
      }
    },
  };
}
