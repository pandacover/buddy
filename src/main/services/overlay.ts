import { Context, Effect, Layer } from "effect";
import type { PointerTarget } from "../../shared/protocol";

export type OverlayServiceApi = {
  readonly showPointer: (
    point: PointerTarget,
    display: { x: number; y: number; width: number; height: number },
  ) => Effect.Effect<void>;
  readonly hidePointer: () => Effect.Effect<void>;
  readonly hideForCapture: () => Effect.Effect<void>;
  readonly restoreAfterCapture: () => Effect.Effect<void>;
};

export class OverlayService extends Context.Tag("buddy/Overlay")<
  OverlayService,
  OverlayServiceApi
>() {}

export const OverlayLive = (impl: OverlayServiceApi) =>
  Layer.succeed(OverlayService, impl);
