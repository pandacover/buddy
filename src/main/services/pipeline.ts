import { Effect } from "effect";
import type { BuddyReply, RecordedAudio, ScreenshotPayload } from "../../shared/protocol";
import { parseBuddyReply } from "../../shared/pointer";
import { OpenRouter } from "./openrouter";
import { OverlayService } from "./overlay";
import { ScreenCapture } from "./capture";
import { Settings } from "./settings";

export type PipelineResult = {
  transcript: string;
  reply: BuddyReply;
  audio: { mimeType: string; base64: string } | null;
};

export const captureScreenshot = Effect.gen(function* () {
  const overlay = yield* OverlayService;
  const capture = yield* ScreenCapture;
  yield* overlay.hideForCapture();
  const screenshot = yield* capture.capturePrimary().pipe(
    Effect.ensuring(overlay.restoreAfterCapture()),
  );
  return screenshot;
});

export const runTalkPipeline = (input: {
  screenshot: ScreenshotPayload;
  audio: RecordedAudio;
  onProgress?: (status: "transcribing" | "thinking" | "speaking", detail?: string) => void;
}) =>
  Effect.gen(function* () {
    const store = yield* Settings;
    const settings = yield* store.load();
    const openrouter = yield* OpenRouter;
    const overlay = yield* OverlayService;
    const notify = input.onProgress ?? (() => undefined);

    const format = input.audio.format.replace(/^\./, "").toLowerCase();
    notify("transcribing", "Transcribing speech");
    const transcript = yield* openrouter.transcribe({
      settings,
      audioBase64: input.audio.base64,
      format: format || "webm",
    });

    notify("thinking", "Looking at the screen");
    const rawReply = yield* openrouter.askVision({
      settings,
      transcript,
      imageBase64: input.screenshot.base64,
    });
    const reply = parseBuddyReply(rawReply);

    if (reply.point) {
      yield* overlay.showPointer(reply.point, input.screenshot.display);
    } else {
      yield* overlay.hidePointer();
    }

    notify("speaking", "Speaking");
    const audio = yield* openrouter
      .speak({ settings, text: reply.speech })
      .pipe(Effect.orElseSucceed(() => null));

    return { transcript, reply, audio } satisfies PipelineResult;
  });
