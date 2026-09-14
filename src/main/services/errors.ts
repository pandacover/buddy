import { Data } from "effect";

export class SettingsError extends Data.TaggedError("SettingsError")<{
  readonly message: string;
}> {}

export class CaptureError extends Data.TaggedError("CaptureError")<{
  readonly message: string;
}> {}

export class OpenRouterError extends Data.TaggedError("OpenRouterError")<{
  readonly message: string;
  readonly status?: number;
}> {}

