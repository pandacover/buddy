import type { BuddyNotchAPI } from "../shared/bridge";

function api(): BuddyNotchAPI {
  const bridge = window.buddy;
  if (!bridge) {
    throw new Error("Buddy preload is not available.");
  }
  return bridge;
}

export const buddy = {
  get ready() {
    return Boolean(window.buddy);
  },
  request: {
    getBootstrap: () => api().getBootstrap(),
    saveSettings: (patch: Parameters<BuddyNotchAPI["saveSettings"]>[0]) =>
      api().saveSettings(patch),
    setExpanded: (payload: Parameters<BuddyNotchAPI["setExpanded"]>[0]) =>
      api().setExpanded(payload),
    setTyping: (payload: { typing: boolean }) => api().setTyping(payload),
    startTalk: () => api().startTalk(),
    endTalk: () => api().endTalk(),
    toggleTalk: () => api().toggleTalk(),
    cancelListen: () => api().cancelListen(),
    reportError: (payload: { error: string }) => api().reportError(payload),
    submitAudio: (payload: Parameters<BuddyNotchAPI["submitAudio"]>[0]) =>
      api().submitAudio(payload),
  },
  addMessageListener(name: "statusChanged" | "recordingChanged" | "playAudio", handler: (data: never) => void) {
    if (name === "statusChanged") return api().onStatusChanged(handler as never);
    if (name === "recordingChanged") return api().onRecordingChanged(handler as never);
    return api().onPlayAudio(handler as never);
  },
  removeMessageListener(_name: string, unsubscribe?: () => void) {
    unsubscribe?.();
  },
};

export function playBase64Audio(mimeType: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], { type: mimeType || "audio/mpeg" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
  void audio.play();
}

export function syncIgnoreMouse(target: EventTarget | null) {
  const node = target instanceof Element ? target : null;
  const hit = node?.closest("[data-buddy-card], button, input, label, textarea");
  window.buddy?.setIgnoreMouse(!hit);
}
