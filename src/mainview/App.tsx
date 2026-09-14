import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { NOTCH_BOOTSTRAP_HEIGHT } from "../shared/overlay-geometry";
import type { AppStatus, BuddySettings } from "../shared/protocol";
import { EMPTY_AUDIO_ERROR } from "../shared/talk-session";
import { friendlyHotkey } from "../shared/talk-keys";
import { MicRecorder, micFailureMessage } from "./recorder";
import { buddy, playBase64Audio } from "./rpc";

const STATUS_LABEL: Record<AppStatus, string> = {
  idle: "Hold Ctrl+Alt",
  listening: "Listening… release to send",
  capturing: "Capturing…",
  transcribing: "Transcribing…",
  thinking: "Looking…",
  speaking: "Speaking…",
  pointing: "Pointing…",
  error: "Something broke",
};

export default function App() {
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<AppStatus>("idle");
  const [hotkey, setHotkey] = useState("Hold Ctrl+Alt");
  const [error, setError] = useState("");
  const [transcript, setTranscript] = useState("");
  const [speech, setSpeech] = useState("");
  const [settings, setSettings] = useState<BuddySettings & { hasKey?: boolean }>({
    apiKey: "",
    visionModel: "openai/gpt-4o-mini",
    sttModel: "openai/whisper-large-v3-turbo",
    ttsModel: "hexgrad/kokoro-82m",
    ttsVoice: "af_sky",
    ttsFormat: "mp3",
  });
  const recorder = useMemo(() => new MicRecorder(), []);
  const recording = useRef(false);
  const recordChain = useRef(Promise.resolve());
  const holdingMic = useRef(false);
  const holdGen = useRef(0);
  const releaseGuards = useRef<(() => void) | null>(null);
  const expandRev = useRef(0);
  const shellRef = useRef<HTMLDivElement>(null);
  const [rpcReady, setRpcReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let detach: (() => void) | undefined;
    let retry: ReturnType<typeof setInterval> | undefined;

    const attach = () => {
      const api = window.buddy;
      if (!api || cancelled || detach) return false;

      const onStatus = (payload: {
        status: AppStatus;
        error?: string;
        transcript?: string;
        speech?: string;
      }) => {
        setStatus(payload.status);
        if (payload.error !== undefined) setError(payload.error);
        if (payload.transcript) setTranscript(payload.transcript);
        if (payload.speech) setSpeech(payload.speech);
      };
      const onRecording = (payload: { recording: boolean }) => {
        enqueueRecording(payload.recording);
      };
      const onAudio = (payload: { mimeType: string; base64: string }) => {
        playBase64Audio(payload.mimeType, payload.base64);
      };
      const onKeyDown = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) {
          return;
        }
        const spaceToggle =
          event.code === "Space" &&
          event.ctrlKey &&
          (event.altKey || event.shiftKey);
        const f8 = event.code === "F8";
        if (!spaceToggle && !f8) return;
        event.preventDefault();
        void api.toggleTalk();
      };

      void api.getBootstrap().then((boot) => {
        if (cancelled) return;
        setSettings(boot.settings);
        setStatus(boot.status);
        setHotkey(boot.hotkey);
        setError(boot.error);
      });

      const offStatus = api.onStatusChanged(onStatus);
      const offRecording = api.onRecordingChanged(onRecording);
      const offAudio = api.onPlayAudio(onAudio);
      window.addEventListener("keydown", onKeyDown);
      setRpcReady(true);
      detach = () => {
        offStatus();
        offRecording();
        offAudio();
        window.removeEventListener("keydown", onKeyDown);
      };
      return true;
    };

    if (!attach()) {
      retry = setInterval(() => {
        if (attach() && retry) clearInterval(retry);
      }, 50);
    }

    return () => {
      cancelled = true;
      if (retry) clearInterval(retry);
      detach?.();
    };
  }, [recorder]);

  useEffect(() => {
    const node = shellRef.current;
    if (!node || !buddy.ready) return;

    if (expanded) {
      const rev = ++expandRev.current;
      void buddy.request.setExpanded({
        expanded: true,
        height: NOTCH_BOOTSTRAP_HEIGHT,
        rev,
      });
      return;
    }

    const report = () => {
      const height = Math.max(
        Math.ceil(node.getBoundingClientRect().height),
        node.scrollHeight,
      );
      void buddy.request.setExpanded({
        expanded: false,
        height,
        rev: ++expandRev.current,
      });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [expanded, rpcReady]);

  function enqueueRecording(shouldRecord: boolean) {
    recordChain.current = recordChain.current
      .then(() => applyRecording(shouldRecord))
      .catch((cause) => {
        console.warn("[buddy] recording sync failed", cause);
      });
  }

  async function applyRecording(shouldRecord: boolean) {
    const rpc = window.buddy;
    if (shouldRecord) {
      if (recording.current) return;
      recording.current = true;
      try {
        await recorder.start();
      } catch (cause) {
        recording.current = false;
        const message = micFailureMessage(cause);
        setError(message);
        setStatus("error");
        await rpc?.reportError({ error: message });
      }
      return;
    }

    if (!recording.current) {
      await rpc?.cancelListen();
      return;
    }

    recording.current = false;
    const audio = await recorder.stop();
    if (audio && rpc) {
      await rpc.submitAudio(audio);
      return;
    }
    setError(EMPTY_AUDIO_ERROR);
    setStatus("error");
    await rpc?.reportError({ error: EMPTY_AUDIO_ERROR });
  }

  async function holdMic() {
    if (holdingMic.current) return;
    const rpc = window.buddy;
    if (!rpc) {
      setStatus("error");
      setError("Buddy is still starting. Try the mic again in a moment.");
      return;
    }

    const gen = ++holdGen.current;
    holdingMic.current = true;
    const onLostHold = () => void releaseMic();
    window.addEventListener("pointerup", onLostHold, true);
    window.addEventListener("pointercancel", onLostHold, true);
    window.addEventListener("blur", onLostHold);
    releaseGuards.current = () => {
      window.removeEventListener("pointerup", onLostHold, true);
      window.removeEventListener("pointercancel", onLostHold, true);
      window.removeEventListener("blur", onLostHold);
    };

    recording.current = true;
    setStatus("listening");
    const startPromise = recorder.start();

    try {
      const result = await rpc.startTalk();
      if (!holdingMic.current || gen !== holdGen.current) {
        recording.current = false;
        await recorder.stop();
        await rpc.endTalk();
        await startPromise.catch(() => undefined);
        return;
      }
      if (result && result.ok === false && result.error) {
        holdingMic.current = false;
        releaseGuards.current?.();
        releaseGuards.current = null;
        recording.current = false;
        await recorder.stop();
        setStatus("error");
        setError(result.error);
        await startPromise.catch(() => undefined);
        return;
      }
    } catch (cause) {
      holdingMic.current = false;
      releaseGuards.current?.();
      releaseGuards.current = null;
      recording.current = false;
      await recorder.stop();
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Could not start talking");
      await startPromise.catch(() => undefined);
      return;
    }

    try {
      await startPromise;
    } catch (cause) {
      holdingMic.current = false;
      releaseGuards.current?.();
      releaseGuards.current = null;
      recording.current = false;
      const message = micFailureMessage(cause);
      setError(message);
      setStatus("error");
      await rpc.reportError({ error: message });
    }
  }

  async function releaseMic() {
    if (!holdingMic.current) return;
    holdingMic.current = false;
    holdGen.current += 1;
    releaseGuards.current?.();
    releaseGuards.current = null;
    try {
      await window.buddy?.endTalk();
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Could not stop talking");
    }
  }

  function onMicPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture is optional; window pointerup is the fallback.
    }
    void holdMic();
  }

  function onMicPointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 && event.type !== "pointercancel") return;
    event.preventDefault();
    event.stopPropagation();
    void releaseMic();
  }

  function setTyping(typing: boolean) {
    void buddy.request.setTyping({ typing });
  }

  const idleLabel = friendlyHotkey(hotkey) || STATUS_LABEL.idle;
  const statusText =
    status === "error" && error ? error : status === "idle" ? idleLabel : STATUS_LABEL[status];
  const busy = status === "listening" || status === "capturing";

  return (
    <div ref={shellRef} className="px-3 py-2">
      <div
        data-buddy-card
        className="rounded-[28px] border border-white/10 bg-buddy-bg text-white shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
      >
        <div className="flex items-center gap-2 px-3 py-2">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            aria-controls="buddy-settings"
          >
            <span
              className={`h-3 w-3 shrink-0 rounded-full ${
                busy
                  ? "bg-buddy-record shadow-[0_0_12px_#ff4d6d]"
                  : status === "error"
                    ? "bg-amber-400"
                    : "bg-buddy-speak"
              }`}
            />
            <span className="min-w-0">
              <span className="block text-[11px] uppercase tracking-[0.18em] text-white/45">
                Buddy
              </span>
              <span className="block text-sm font-medium leading-5">{statusText}</span>
            </span>
          </button>
          <button
            type="button"
            className="rounded-full px-3 py-2 text-xs font-medium text-white/80 hover:bg-white/10"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            aria-controls="buddy-settings"
          >
            {expanded ? "Close" : "Settings"}
          </button>
          <button
            type="button"
            className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              status === "listening"
                ? "bg-buddy-record text-white"
                : "bg-buddy-accent text-white"
            }`}
            onPointerDown={onMicPointerDown}
            onPointerUp={onMicPointerUp}
            onPointerCancel={onMicPointerUp}
            aria-label="Hold to talk"
            aria-pressed={status === "listening"}
          >
            <MicIcon />
          </button>
        </div>

        {expanded ? (
          <form
            id="buddy-settings"
            className="space-y-3 border-t border-white/10 px-4 py-3 text-sm"
            onSubmit={(event) => {
              event.preventDefault();
              void buddy.request.saveSettings(settings).then((result) => {
                setSettings(result.settings);
              });
            }}
            onPointerDown={(event) => event.stopPropagation()}
            onFocusCapture={(event) => {
              if (
                event.target instanceof HTMLInputElement ||
                event.target instanceof HTMLTextAreaElement
              ) {
                setTyping(true);
              }
            }}
            onBlurCapture={() => setTyping(false)}
          >
            <label className="block">
              <span className="mb-1 block text-xs text-white/50">OpenRouter API key</span>
              <input
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none"
                value={settings.apiKey}
                placeholder="sk-or-..."
                type="password"
                autoComplete="off"
                onChange={(event) =>
                  setSettings((current) => ({ ...current, apiKey: event.target.value }))
                }
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-white/50">Vision model</span>
              <input
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none"
                value={settings.visionModel}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    visionModel: event.target.value,
                  }))
                }
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs text-white/50">STT</span>
                <input
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none"
                  value={settings.sttModel}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, sttModel: event.target.value }))
                  }
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-white/50">TTS voice</span>
                <input
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 outline-none"
                  value={settings.ttsVoice}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, ttsVoice: event.target.value }))
                  }
                />
              </label>
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-buddy-accent px-3 py-2 font-medium"
            >
              Save settings
            </button>
            {transcript ? (
              <p className="text-xs text-white/60">You: {transcript}</p>
            ) : null}
            {speech ? <p className="text-xs text-buddy-speak">{speech}</p> : null}
            <p className="text-[11px] leading-5 text-white/35">
              Hold Ctrl+Alt or hold the mic to talk (works with Settings open). The notch
              shows the registered toggle shortcut. Typing in these fields pauses
              hold-to-talk only. Buddy never clicks the desktop.
            </p>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 15a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
        fill="currentColor"
      />
      <path
        d="M19 12a7 7 0 0 1-14 0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M12 19v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
