import { desktopCapturer, screen } from "electron";
import { Effect } from "effect";
import { CaptureError } from "./errors";
import { CaptureLive } from "./capture";

export const ElectronCaptureLive = CaptureLive({
  capturePrimary: () =>
    Effect.tryPromise({
      try: async () => {
        const display = screen.getPrimaryDisplay();
        const scale = display.scaleFactor || 1;
        const width = Math.max(1, Math.round(display.size.width * scale));
        const height = Math.max(1, Math.round(display.size.height * scale));
        const sources = await desktopCapturer.getSources({
          types: ["screen"],
          thumbnailSize: { width, height },
        });
        const match =
          sources.find((source) => source.display_id === String(display.id)) ?? sources[0];
        if (!match) {
          throw new CaptureError({
            message: "Screen capture returned no sources.",
          });
        }
        const png = match.thumbnail.toPNG();
        return {
          mimeType: "image/png" as const,
          base64: png.toString("base64"),
          width: match.thumbnail.getSize().width,
          height: match.thumbnail.getSize().height,
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
