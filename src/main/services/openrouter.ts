import { Context, Effect, Layer } from "effect";
import { OpenRouterError } from "./errors";
import type { BuddySettings } from "../../shared/protocol";

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export type OpenRouterClient = {
  readonly transcribe: (input: {
    settings: BuddySettings;
    audioBase64: string;
    format: string;
  }) => Effect.Effect<string, OpenRouterError>;
  readonly askVision: (input: {
    settings: BuddySettings;
    transcript: string;
    imageBase64: string;
  }) => Effect.Effect<string, OpenRouterError>;
  readonly speak: (input: {
    settings: BuddySettings;
    text: string;
  }) => Effect.Effect<{ mimeType: string; base64: string }, OpenRouterError>;
};

export class OpenRouter extends Context.Tag("buddy/OpenRouter")<
  OpenRouter,
  OpenRouterClient
>() {}

const BUDDY_HEADERS = {
  "HTTP-Referer": "https://github.com/pandacover/buddy",
  "X-Title": "Buddy",
} as const;

const VISION_SYSTEM_PROMPT = `You are Buddy, a Windows desktop companion.
The user is looking at their screen and speaking. You receive a screenshot and a speech transcript.

Reply with JSON only:
{
  "speech": "a short spoken answer, one or two sentences",
  "point": null
}

If the user asks where something is, or you should indicate a UI element, set point to:
{ "x": 0.0, "y": 0.0, "label": "short name" }

x and y are normalized screenshot coordinates: 0,0 is top-left and 1,1 is bottom-right.
You can only point. You cannot click, type, or control the computer.
Keep speech concise so it can be spoken aloud.`;

function requireKey(settings: BuddySettings): Effect.Effect<string, OpenRouterError> {
  if (!settings.apiKey || settings.apiKey.includes("•")) {
    return Effect.fail(
      new OpenRouterError({
        message: "Add an OpenRouter API key in the notch settings or OPENROUTER_API_KEY.",
      }),
    );
  }
  return Effect.succeed(settings.apiKey);
}

async function readErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string }; message?: string };
    return parsed.error?.message || parsed.message || text || `HTTP ${response.status}`;
  } catch {
    return text || `HTTP ${response.status}`;
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function makeOpenRouterClient(
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response> = fetch,
): OpenRouterClient {
  const requestJson = (path: string, apiKey: string, body: unknown) =>
    Effect.tryPromise({
      try: async () => {
        const response = await fetchImpl(`${OPENROUTER_BASE}${path}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...BUDDY_HEADERS,
          },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          throw new OpenRouterError({
            message: await readErrorMessage(response),
            status: response.status,
          });
        }
        return (await response.json()) as Record<string, unknown>;
      },
      catch: (cause) =>
        cause instanceof OpenRouterError
          ? cause
          : new OpenRouterError({
              message: cause instanceof Error ? cause.message : "OpenRouter request failed",
            }),
    });

  return {
    transcribe: ({ settings, audioBase64, format }) =>
      Effect.gen(function* () {
        const apiKey = yield* requireKey(settings);
        const json = yield* requestJson("/audio/transcriptions", apiKey, {
          model: settings.sttModel,
          input_audio: {
            data: audioBase64,
            format: format.replace(/^\./, ""),
          },
        });
        const text = typeof json.text === "string" ? json.text.trim() : "";
        if (!text) {
          return yield* Effect.fail(
            new OpenRouterError({ message: "Speech-to-text returned an empty transcript." }),
          );
        }
        return text;
      }),

    askVision: ({ settings, transcript, imageBase64 }) =>
      Effect.gen(function* () {
        const apiKey = yield* requireKey(settings);
        const json = yield* requestJson("/chat/completions", apiKey, {
          model: settings.visionModel,
          temperature: 0.2,
          messages: [
            { role: "system", content: VISION_SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: transcript
                    ? `User said: ${transcript}`
                    : "The user did not say anything audible. Describe what they might need from this screen briefly.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/png;base64,${imageBase64}`,
                  },
                },
              ],
            },
          ],
        });

        const choices = json.choices as Array<{
          message?: { content?: unknown };
        }> | undefined;
        const content = choices?.[0]?.message?.content;
        if (typeof content === "string" && content.trim()) {
          return content.trim();
        }
        if (Array.isArray(content)) {
          const joined = content
            .map((part) =>
              typeof part === "string"
                ? part
                : typeof part === "object" && part && "text" in part
                  ? String((part as { text: unknown }).text)
                  : "",
            )
            .join("\n")
            .trim();
          if (joined) return joined;
        }
        return yield* Effect.fail(
          new OpenRouterError({ message: "Vision model returned an empty reply." }),
        );
      }),

    speak: ({ settings, text }) =>
      Effect.gen(function* () {
        const apiKey = yield* requireKey(settings);
        const spoken = text.trim();
        if (!spoken) {
          return yield* Effect.fail(
            new OpenRouterError({ message: "Nothing to speak." }),
          );
        }

        const payload = yield* Effect.tryPromise({
          try: async () => {
            const response = await fetchImpl(`${OPENROUTER_BASE}/audio/speech`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
                ...BUDDY_HEADERS,
              },
              body: JSON.stringify({
                model: settings.ttsModel,
                input: spoken,
                voice: settings.ttsVoice,
                response_format: settings.ttsFormat,
              }),
            });
            if (!response.ok) {
              throw new OpenRouterError({
                message: await readErrorMessage(response),
                status: response.status,
              });
            }
            const mimeType = response.headers.get("content-type") ?? "audio/mpeg";
            const buffer = new Uint8Array(await response.arrayBuffer());
            return {
              mimeType,
              base64: uint8ToBase64(buffer),
            };
          },
          catch: (cause) =>
            cause instanceof OpenRouterError
              ? cause
              : new OpenRouterError({
                  message: cause instanceof Error ? cause.message : "TTS request failed",
                }),
        });

        return payload;
      }),
  };
}

export const OpenRouterLive = Layer.succeed(OpenRouter, makeOpenRouterClient());
