export function talkStartBlockers(input: {
  apiKey?: string;
  pipelineRunning: boolean;
}): { ok: true } | { ok: false; error: string } {
  if (input.pipelineRunning) {
    return { ok: false, error: "Buddy is still working on the last request." };
  }
  const key = input.apiKey?.trim() ?? "";
  if (!key || key.includes("•")) {
    return { ok: false, error: "Add an OpenRouter API key in Settings." };
  }
  return { ok: true };
}

export const EMPTY_AUDIO_ERROR =
  "Didn't catch any audio. Tap the mic, speak, then tap again.";

export const SCREEN_CAPTURE_ERROR = "Could not capture the screen.";
