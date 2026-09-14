import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { AppStatus, BuddySettings } from "../shared/protocol";
import { EMPTY_AUDIO_ERROR } from "../shared/talk-session";
import { friendlyHotkey } from "../shared/talk-keys";
import { MicRecorder, micFailureMessage } from "./recorder";
import { electrobun, playBase64Audio } from "./rpc";

const STATUS_LABEL: Record<AppStatus, string> = {
  idle: "Hold Ctrl+Alt",
  listening: "Listening… tap mic to stop",
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
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const rpc = electrobun.rpc;
    if (!rpc) return;

    void rpc.request.getBootstrap({}).then((boot) => {
      setSettings(boot.settings);
      setStatus(boot.status);
      setHotkey(boot.hotkey);
      setError(boot.error);
    });

    rpc.addMessageListener("statusChanged", (payload) => {
      setStatus(payload.status);
      if (payload.error !== undefined) setError(payload.error);
      if (payload.transcript) setTranscript(payload.transcript);
      if (payload.speech) setSpeech(payload.speech);
    });

    rpc.addMessageListener("recordingChanged", (payload) => {
      enqueueRecording(payload.recording);
    });

    rpc.addMessageListener("playAudio", (payload) => {
      playBase64Audio(payload.mimeType, payload.base64);
    });

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
      void rpc.request.toggleTalk({});
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [recorder]);

  useEffect(() => {
    const node = shellRef.current;
    const rpc = electrobun.rpc;
    if (!node || !rpc) return;

    const report = () => {
      const height = Math.ceil(node.getBoundingClientRect().height);
      void rpc.request.setExpanded({ expanded, height });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(node);
    return () => observer.disconnect();
  }, [expanded]);

  function enqueueRecording(shouldRecord: boolean) {
    recordChain.current = recordChain.current
      .then(() => applyRecording(shouldRecord))
      .catch((cause) => {
        console.warn("[buddy] recording sync failed", cause);
      });
  }

  async function applyRecording(shouldRecord: boolean) {
    const rpc = electrobun.rpc;
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
        await rpc?.request.reportError({ error: message });
      }
      return;
    }

    if (!recording.current) {
      await rpc?.request.cancelListen({});
      return;
    }

    recording.current = false;
    const audio = await recorder.stop();
    if (audio && rpc) {
      await rpc.request.submitAudio(audio);
      return;
    }
    setError(EMPTY_AUDIO_ERROR);
    setStatus("error");
    await rpc?.request.reportError({ error: EMPTY_AUDIO_ERROR });
  }

  async function onMicClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const rpc = electrobun.rpc;
    if (!rpc) {
      setStatus("error");
      setError("Buddy is still starting. Try the mic again in a moment.");
      return;
    }
    try {
      const result = await rpc.request.toggleTalk({});
      if (result && result.ok === false && result.error) {
        setStatus("error");
        setError(result.error);
      }
    } catch (cause) {
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Could not start talking");
    }
  }

  function setTyping(typing: boolean) {
    void electrobun.rpc?.request.setTyping({ typing });
  }

  const idleLabel = friendlyHotkey(hotkey) || STATUS_LABEL.idle;
  const statusText =
    status === "error" && error ? error : status === "idle" ? idleLabel : STATUS_LABEL[status];
  const busy = status === "listening" || status === "capturing";

  return (
    <div ref={shellRef} className="p-2">
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
            className={`flex h-10 w-10 items-center justify-center rounded-full ${
              status === "listening"
                ? "bg-buddy-record text-white"
                : "bg-buddy-accent text-white"
            }`}
            onClick={(event) => void onMicClick(event)}
            aria-label={status === "listening" ? "Stop talking" : "Start talking"}
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
              void electrobun.rpc?.request.saveSettings(settings).then((result) => {
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
              Hold Ctrl+Alt to talk, or tap the mic (works with Settings open). The notch
              shows the registered toggle. Typing in these fields pauses hold-to-talk only.
              Buddy never clicks the desktop.
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
