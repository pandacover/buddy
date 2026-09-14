export const VK_CONTROL = 0x11;
export const VK_MENU = 0x12;
export const VK_SPACE = 0x20;
export const VK_LCONTROL = 0xa2;
export const VK_RCONTROL = 0xa3;
export const VK_LMENU = 0xa4;
export const VK_RMENU = 0xa5;

const DOWN = 0x8000;

export type KeyReader = (virtualKey: number) => number;

export type TalkKeySnapshot = {
  ctrl: boolean;
  alt: boolean;
  space: boolean;
  hold: boolean;
  toggleChord: boolean;
};

export function keyIsDown(bits: number): boolean {
  return (bits & DOWN) !== 0;
}

export function readTalkKeys(getAsyncKeyState: KeyReader): TalkKeySnapshot {
  const ctrl =
    keyIsDown(getAsyncKeyState(VK_CONTROL)) ||
    keyIsDown(getAsyncKeyState(VK_LCONTROL)) ||
    keyIsDown(getAsyncKeyState(VK_RCONTROL));
  const alt =
    keyIsDown(getAsyncKeyState(VK_MENU)) ||
    keyIsDown(getAsyncKeyState(VK_LMENU)) ||
    keyIsDown(getAsyncKeyState(VK_RMENU));
  const space = keyIsDown(getAsyncKeyState(VK_SPACE));
  return {
    ctrl,
    alt,
    space,
    hold: ctrl && alt && !space,
    toggleChord: ctrl && alt && space,
  };
}

export type TalkKeyEdges = {
  holdStart: boolean;
  holdEnd: boolean;
  toggle: boolean;
};

export function talkKeyEdges(
  previous: TalkKeySnapshot | null,
  next: TalkKeySnapshot,
): TalkKeyEdges {
  const wasHold = previous?.hold ?? false;
  const wasToggle = previous?.toggleChord ?? false;
  return {
    holdStart: next.hold && !wasHold && !wasToggle,
    holdEnd: !next.hold && wasHold,
    toggle: next.toggleChord && !wasToggle,
  };
}

export type TalkHotkeyAction = "holdStart" | "holdEnd" | "toggle";

/** Typing in a field pauses hold-to-talk only. Toggle and mic always work. */
export function talkHotkeyActions(
  paused: boolean,
  edges: TalkKeyEdges,
): TalkHotkeyAction[] {
  if (edges.toggle) {
    const actions: TalkHotkeyAction[] = [];
    if (edges.holdEnd) actions.push("holdEnd");
    actions.push("toggle");
    return actions;
  }
  const actions: TalkHotkeyAction[] = [];
  if (edges.holdStart && !paused) actions.push("holdStart");
  if (edges.holdEnd) actions.push("holdEnd");
  return actions;
}

export function friendlyHotkey(value: string): string {
  return value.replaceAll("CommandOrControl", "Ctrl").replaceAll("Control", "Ctrl");
}

/** Tried in order; first successful Electron globalShortcut wins. */
export const TOGGLE_SHORTCUT_CANDIDATES = [
  "CommandOrControl+Shift+Space",
  "Control+Shift+Space",
  "CommandOrControl+Alt+Space",
  "Control+Alt+Space",
  "CommandOrControl+Shift+B",
  "Control+Shift+B",
  "F8",
] as const;
