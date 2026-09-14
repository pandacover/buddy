import Electrobun, { Electroview } from "electrobun/view";

const rpc = Electroview.defineRPC({
  maxRequestTime: 120_000,
  handlers: {
    requests: {},
    messages: {},
  },
});

export const electrobun = new Electrobun.Electroview({ rpc });

export function playBase64Audio(mimeType: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const blob = new Blob([bytes], { type: mimeType || "audio/mpeg" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.addEventListener("ended", () => URL.revokeObjectURL(url), { once: true });
  void audio.play();
}
