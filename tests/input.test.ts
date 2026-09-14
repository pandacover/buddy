import { describe, expect, test } from "bun:test";
import {
  NOTCH_BOOTSTRAP_HEIGHT,
  NOTCH_MIN_HEIGHT,
  PARKED_OVERLAY_FRAME,
  notchWindowHeight,
  pointerOverlayPlacement,
} from "../src/shared/overlay-geometry";
import { talkStartBlockers } from "../src/shared/talk-session";
import {
  VK_CONTROL,
  VK_LMENU,
  VK_MENU,
  VK_SPACE,
  friendlyHotkey,
  readTalkKeys,
  talkHotkeyActions,
  talkKeyEdges,
} from "../src/shared/talk-keys";

describe("pointerOverlayPlacement", () => {
  const display = { x: 0, y: 0, width: 1920, height: 1080 };

  test("keeps the overlay small and on-screen", () => {
    const placement = pointerOverlayPlacement(
      { x: 0.5, y: 0.5, label: "Save" },
      display,
    );
    expect(placement.frame.width).toBe(360);
    expect(placement.frame.height).toBe(360);
    expect(placement.frame.x).toBeGreaterThanOrEqual(display.x);
    expect(placement.frame.y).toBeGreaterThanOrEqual(display.y);
    expect(placement.frame.x + placement.frame.width).toBeLessThanOrEqual(
      display.x + display.width,
    );
    expect(placement.local.label).toBe("Save");
    expect(placement.local.x).toBeCloseTo(0.5, 5);
    expect(placement.local.y).toBeCloseTo(0.5, 5);
  });

  test("clamps to the display origin", () => {
    const placement = pointerOverlayPlacement(
      { x: 0, y: 0, label: "Corner" },
      display,
    );
    expect(placement.frame.x).toBe(0);
    expect(placement.frame.y).toBe(0);
    expect(PARKED_OVERLAY_FRAME.width).toBe(1);
    expect(PARKED_OVERLAY_FRAME.x).toBeGreaterThanOrEqual(0);
    expect(PARKED_OVERLAY_FRAME.y).toBeGreaterThanOrEqual(0);
  });
});

describe("talkKeyEdges", () => {
  const down = 0x8000;
  const reader = (pressed: number[]) => (vk: number) =>
    pressed.includes(vk) ? down : 0;

  test("starts hold on Ctrl+Alt without Space", () => {
    const next = readTalkKeys(reader([VK_CONTROL, VK_MENU]));
    expect(next.hold).toBe(true);
    expect(talkKeyEdges(null, next)).toEqual({
      holdStart: true,
      holdEnd: false,
      toggle: false,
    });
  });

  test("treats left Alt the same as VK_MENU", () => {
    const next = readTalkKeys(reader([VK_CONTROL, VK_LMENU]));
    expect(next.hold).toBe(true);
  });

  test("does not start hold when Space is released after a toggle chord", () => {
    const chord = readTalkKeys(reader([VK_CONTROL, VK_MENU, VK_SPACE]));
    const stillMods = readTalkKeys(reader([VK_CONTROL, VK_MENU]));
    expect(talkKeyEdges(chord, stillMods).holdStart).toBe(false);
  });

  test("emits toggle on Ctrl+Alt+Space and not hold", () => {
    const held = readTalkKeys(reader([VK_CONTROL, VK_MENU]));
    const chord = readTalkKeys(reader([VK_CONTROL, VK_MENU, VK_SPACE]));
    expect(chord.hold).toBe(false);
    expect(chord.toggleChord).toBe(true);
    expect(talkKeyEdges(held, chord)).toEqual({
      holdStart: false,
      holdEnd: true,
      toggle: true,
    });
  });

  test("paused typing skips hold start but still toggles", () => {
    expect(
      talkHotkeyActions(true, { holdStart: true, holdEnd: false, toggle: false }),
    ).toEqual([]);
    expect(
      talkHotkeyActions(true, { holdStart: false, holdEnd: true, toggle: false }),
    ).toEqual(["holdEnd"]);
    expect(
      talkHotkeyActions(true, { holdStart: false, holdEnd: false, toggle: true }),
    ).toEqual(["toggle"]);
  });

  test("friendlyHotkey maps Electrobun accelerators to Ctrl", () => {
    expect(friendlyHotkey("CommandOrControl+Shift+Space")).toBe("Ctrl+Shift+Space");
  });
});

describe("notchWindowHeight", () => {
  test("sizes to the card instead of staying at bootstrap height", () => {
    expect(notchWindowHeight(96, 1080)).toBe(96);
    expect(notchWindowHeight(400, 1080)).toBe(400);
    expect(notchWindowHeight(undefined, 1080)).toBe(NOTCH_MIN_HEIGHT);
    expect(notchWindowHeight(NOTCH_BOOTSTRAP_HEIGHT, 200)).toBe(176);
  });
});

describe("talkStartBlockers", () => {
  test("requires an API key before listening", () => {
    expect(talkStartBlockers({ apiKey: "", pipelineRunning: false })).toEqual({
      ok: false,
      error: "Add an OpenRouter API key in Settings.",
    });
  });

  test("blocks a second pipeline while one is running", () => {
    expect(
      talkStartBlockers({ apiKey: "sk-or-v1-test", pipelineRunning: true }),
    ).toEqual({
      ok: false,
      error: "Buddy is still working on the last request.",
    });
  });

  test("allows talk when a key is present", () => {
    expect(talkStartBlockers({ apiKey: "sk-or-v1-test", pipelineRunning: false })).toEqual({
      ok: true,
    });
  });
});
