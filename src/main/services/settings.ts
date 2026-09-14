import { Context, Effect, Layer } from "effect";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DEFAULT_SETTINGS, type BuddySettings } from "../../shared/protocol";
import { SettingsError } from "./errors";

export type SettingsStore = {
  readonly load: () => Effect.Effect<BuddySettings, SettingsError>;
  readonly save: (
    patch: Partial<BuddySettings>,
  ) => Effect.Effect<BuddySettings, SettingsError>;
};

export class Settings extends Context.Tag("buddy/Settings")<
  Settings,
  SettingsStore
>() {}

function readEnv(name: string): string {
  return (typeof Bun !== "undefined" ? Bun.env[name] : process.env[name]) ?? "";
}

export function settingsFromEnv(stored: Partial<BuddySettings> = {}): BuddySettings {
  const format = stored.ttsFormat ?? readEnv("OPENROUTER_TTS_FORMAT") ?? DEFAULT_SETTINGS.ttsFormat;
  return {
    apiKey: stored.apiKey || readEnv("OPENROUTER_API_KEY"),
    visionModel:
      stored.visionModel ||
      readEnv("OPENROUTER_VISION_MODEL") ||
      DEFAULT_SETTINGS.visionModel,
    sttModel:
      stored.sttModel || readEnv("OPENROUTER_STT_MODEL") || DEFAULT_SETTINGS.sttModel,
    ttsModel:
      stored.ttsModel || readEnv("OPENROUTER_TTS_MODEL") || DEFAULT_SETTINGS.ttsModel,
    ttsVoice:
      stored.ttsVoice || readEnv("OPENROUTER_TTS_VOICE") || DEFAULT_SETTINGS.ttsVoice,
    ttsFormat: format === "pcm" ? "pcm" : "mp3",
  };
}

function publicSettings(settings: BuddySettings): BuddySettings {
  return {
    ...settings,
    apiKey: settings.apiKey ? "••••••••" : "",
  };
}

export { publicSettings };

export function makeFileSettingsStore(filePath: string): SettingsStore {
  const readStored = (): Partial<BuddySettings> => {
    try {
      const raw = readFileSync(filePath, "utf8");
      return JSON.parse(raw) as Partial<BuddySettings>;
    } catch {
      return {};
    }
  };

  return {
    load: () => Effect.sync(() => settingsFromEnv(readStored())),
    save: (patch) =>
      Effect.try({
        try: () => {
          const next = settingsFromEnv({ ...readStored(), ...patch });
          mkdirSync(dirname(filePath), { recursive: true });
          writeFileSync(filePath, JSON.stringify(next, null, 2), { mode: 0o600 });
          return next;
        },
        catch: (cause) =>
          new SettingsError({
            message: cause instanceof Error ? cause.message : "Failed to save settings",
          }),
      }),
  };
}

export const FileSettingsLive = (filePath: string) =>
  Layer.succeed(Settings, makeFileSettingsStore(filePath));

export function defaultSettingsPath(userData: string): string {
  return join(userData, "settings.json");
}
