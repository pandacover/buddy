import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { makeOpenRouterClient, OpenRouter } from "../src/bun/services/openrouter";
import { OverlayService } from "../src/bun/services/overlay";
import { runTalkPipeline } from "../src/bun/services/pipeline";
import { makeFileSettingsStore, Settings } from "../src/bun/services/settings";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("OpenRouter clients", () => {
  test("transcribes, answers with vision, and speaks", async () => {
    const calls: string[] = [];
    const client = makeOpenRouterClient(async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/audio/transcriptions")) {
        const body = JSON.parse(String(init?.body)) as {
          model: string;
          input_audio: { format: string };
        };
        expect(body.model).toBe("openai/whisper-large-v3-turbo");
        expect(body.input_audio.format).toBe("webm");
        return jsonResponse({ text: "Where is save?" });
      }
      if (url.endsWith("/chat/completions")) {
        const body = JSON.parse(String(init?.body)) as {
          model: string;
          messages: Array<{ content: unknown }>;
        };
        expect(body.model).toBe("openai/gpt-4o-mini");
        expect(JSON.stringify(body.messages)).toContain("data:image/png;base64,abc");
        return jsonResponse({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  speech: "Save is on the left.",
                  point: { x: 0.1, y: 0.2, label: "Save" },
                }),
              },
            },
          ],
        });
      }
      if (url.endsWith("/audio/speech")) {
        const body = JSON.parse(String(init?.body)) as {
          model: string;
          voice: string;
          response_format: string;
        };
        expect(body.model).toBe("hexgrad/kokoro-82m");
        expect(body.voice).toBe("af_sky");
        expect(body.response_format).toBe("mp3");
        return new Response(Uint8Array.from([1, 2, 3, 4]), {
          headers: { "Content-Type": "audio/mpeg" },
        });
      }
      return jsonResponse({ error: { message: "unknown" } }, 404);
    });

    const transcript = await Effect.runPromise(
      client.transcribe({
        settings: {
          apiKey: "test-key",
          visionModel: "openai/gpt-4o-mini",
          sttModel: "openai/whisper-large-v3-turbo",
          ttsModel: "hexgrad/kokoro-82m",
          ttsVoice: "af_sky",
          ttsFormat: "mp3",
        },
        audioBase64: "qqq",
        format: "webm",
      }),
    );
    expect(transcript).toBe("Where is save?");

    const dir = mkdtempSync(join(tmpdir(), "buddy-"));
    const file = join(dir, "settings.json");
    writeFileSync(
      file,
      JSON.stringify({
        apiKey: "test-key",
        visionModel: "openai/gpt-4o-mini",
        sttModel: "openai/whisper-large-v3-turbo",
        ttsModel: "hexgrad/kokoro-82m",
        ttsVoice: "af_sky",
        ttsFormat: "mp3",
      }),
    );

    let pointed = "";
    const result = await Effect.runPromise(
      runTalkPipeline({
        screenshot: {
          mimeType: "image/png",
          base64: "abc",
          width: 10,
          height: 10,
          display: { x: 0, y: 0, width: 10, height: 10 },
        },
        audio: { format: "webm", base64: "qqq" },
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            Layer.succeed(Settings, makeFileSettingsStore(file)),
            Layer.succeed(OpenRouter, client),
            Layer.succeed(OverlayService, {
              showPointer: (point) =>
                Effect.sync(() => {
                  pointed = point.label;
                }),
              hidePointer: () => Effect.void,
              hideForCapture: () => Effect.void,
              restoreAfterCapture: () => Effect.void,
            }),
          ),
        ),
      ),
    );

    expect(result.transcript).toBe("Where is save?");
    expect(result.reply.speech).toBe("Save is on the left.");
    expect(pointed).toBe("Save");
    expect(result.audio?.mimeType).toContain("audio/mpeg");
    expect(calls.some((url) => url.endsWith("/audio/speech"))).toBe(true);
  });
});
