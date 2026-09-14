export type PointerTarget = {
  x: number;
  y: number;
  label: string;
};

export type BuddyReply = {
  speech: string;
  point: PointerTarget | null;
};

export type AppStatus =
  | "idle"
  | "listening"
  | "capturing"
  | "transcribing"
  | "thinking"
  | "speaking"
  | "pointing"
  | "error";

export type BuddySettings = {
  apiKey: string;
  visionModel: string;
  sttModel: string;
  ttsModel: string;
  ttsVoice: string;
  ttsFormat: "mp3" | "pcm";
};

export type PipelineProgress = {
  status: AppStatus;
  detail?: string;
};

export type ScreenshotPayload = {
  mimeType: "image/png";
  base64: string;
  width: number;
  height: number;
  display: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
};

export type RecordedAudio = {
  format: string;
  base64: string;
};

export const DEFAULT_SETTINGS: Omit<BuddySettings, "apiKey"> = {
  visionModel: "openai/gpt-4o-mini",
  sttModel: "openai/whisper-large-v3-turbo",
  ttsModel: "hexgrad/kokoro-82m",
  ttsVoice: "af_sky",
  ttsFormat: "mp3",
};

export const TOGGLE_HOTKEY = "CommandOrControl+Alt+Space";
