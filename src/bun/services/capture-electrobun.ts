import { Effect } from "effect";
import { Screen } from "electrobun/main";
import { encodeRgbaPng, scaleRgba, uint8ToBase64 } from "../png";
import { CaptureLive } from "./capture";
import { CaptureError } from "./errors";

export const ElectrobunCaptureLive = CaptureLive({
  capturePrimary: () =>
    Effect.try({
      try: () => {
        const display = Screen.getPrimaryDisplay();
        const { x, y, width, height } = display.bounds;
        const pixels = Screen.captureRegion({
          x: Math.round(x),
          y: Math.round(y),
          width: Math.max(1, Math.round(width)),
          height: Math.max(1, Math.round(height)),
        });

        if (!pixels) {
          throw new CaptureError({
            message:
              "Screen capture returned no pixels. On Windows this should work; grant screen-recording permission if prompted.",
          });
        }

        const scaled = scaleRgba(
          Math.max(1, Math.round(width)),
          Math.max(1, Math.round(height)),
          pixels,
        );
        const png = encodeRgbaPng(scaled.width, scaled.height, scaled.rgba);
        return {
          mimeType: "image/png" as const,
          base64: uint8ToBase64(png),
          width: scaled.width,
          height: scaled.height,
          display: {
            x: display.bounds.x,
            y: display.bounds.y,
            width: display.bounds.width,
            height: display.bounds.height,
          },
        };
      },
      catch: (cause) =>
        cause instanceof CaptureError
          ? cause
          : new CaptureError({
              message:
                cause instanceof Error ? cause.message : "Failed to capture the screen",
            }),
    }),
});
