import { describe, expect, test } from "bun:test";
import { encodeRgbaPng, scaleRgba } from "../src/main/png";

describe("encodeRgbaPng", () => {
  test("writes a valid PNG signature for a red pixel", () => {
    const png = encodeRgbaPng(1, 1, Uint8Array.from([255, 0, 0, 255]));
    expect(Array.from(png.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(png.length).toBeGreaterThan(8);
  });

  test("scales oversized frames down", () => {
    const rgba = new Uint8Array(8 * 4 * 4);
    const scaled = scaleRgba(8, 4, rgba, 4);
    expect(scaled.width).toBe(4);
    expect(scaled.height).toBe(2);
    expect(scaled.rgba.length).toBe(4 * 2 * 4);
  });
});
