function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
    return "audio/webm;codecs=opus";
  }
  if (MediaRecorder.isTypeSupported("audio/webm")) return "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
  return "";
}

export function micFailureMessage(cause: unknown): string {
  const name = cause instanceof DOMException ? cause.name : "";
  if (name === "NotAllowedError" || name === "PermissionDeniedError") {
    return "Microphone permission denied. Allow the mic for Buddy in Windows privacy settings.";
  }
  if (name === "NotFoundError") {
    return "No microphone found.";
  }
  if (name === "NotReadableError") {
    return "The microphone is already in use by another app.";
  }
  if (cause instanceof Error && cause.message) return cause.message;
  return "Could not open the microphone.";
}

export class MicRecorder {
  private media: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async start(): Promise<void> {
    await this.reset();
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("This WebView cannot access the microphone.");
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        channelCount: 1,
      },
    });
    if (typeof MediaRecorder === "undefined") {
      await this.reset();
      throw new Error("This WebView cannot record audio.");
    }
    const mimeType = pickMimeType();
    this.media = mimeType
      ? new MediaRecorder(this.stream, { mimeType })
      : new MediaRecorder(this.stream);
    this.chunks = [];
    this.media.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) this.chunks.push(event.data);
    });
    this.media.start(100);
  }

  async stop(): Promise<{ format: string; base64: string } | null> {
    const media = this.media;
    if (!media || media.state === "inactive") {
      await this.reset();
      return null;
    }

    const blob = await new Promise<Blob>((resolve) => {
      media.addEventListener(
        "stop",
        () => {
          resolve(new Blob(this.chunks, { type: media.mimeType || "audio/webm" }));
        },
        { once: true },
      );
      media.stop();
    });

    await this.reset();
    if (blob.size < 64) return null;
    const format = blob.type.includes("mp4") ? "m4a" : "webm";
    return { format, base64: await blobToBase64(blob) };
  }

  private async reset() {
    this.media = null;
    this.chunks = [];
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }
}
