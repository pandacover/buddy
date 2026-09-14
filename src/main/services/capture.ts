import { Context, Effect, Layer } from "effect";
import type { ScreenshotPayload } from "../../shared/protocol";
import { CaptureError } from "./errors";

export type ScreenCaptureService = {
  readonly capturePrimary: () => Effect.Effect<ScreenshotPayload, CaptureError>;
};

export class ScreenCapture extends Context.Tag("buddy/ScreenCapture")<
  ScreenCapture,
  ScreenCaptureService
>() {}

export const CaptureLive = (impl: ScreenCaptureService) =>
  Layer.succeed(ScreenCapture, impl);
