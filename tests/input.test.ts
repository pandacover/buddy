import { describe, expect, test } from "bun:test";
import {
  PARKED_OVERLAY_FRAME,
  pointerOverlayPlacement,
} from "../src/shared/overlay-geometry";
import {
  VK_CONTROL,
  VK_LMENU,
  VK_MENU,
  VK_SPACE,
  readTalkKeys,
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
});
