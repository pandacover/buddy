import {
  ApplicationMenu,
  BrowserView,
  BrowserWindow,
  Screen,
  Updater,
  Utils,
  type RPCSchema,
} from "electrobun/main";
import { Effect, Layer, ManagedRuntime } from "effect";
import { join } from "node:path";
import type {
  AppStatus,
  BuddySettings,
  PointerTarget,
  RecordedAudio,
  ScreenshotPayload,
} from "../shared/protocol";
import { startTalkHotkeys } from "./hotkeys";
import {
  NOTCH_BOOTSTRAP_HEIGHT,
  NOTCH_WIDTH,
  PARKED_OVERLAY_FRAME,
  notchWindowHeight,
  pointerOverlayPlacement,
} from "../shared/overlay-geometry";
import {
  EMPTY_AUDIO_ERROR,
  SCREEN_CAPTURE_ERROR,
  talkStartBlockers,
} from "../shared/talk-session";
import { ElectrobunCaptureLive } from "./services/capture-electrobun";
import { OpenRouterLive } from "./services/openrouter";
import { OverlayLive } from "./services/overlay";
import { captureScreenshot, runTalkPipeline } from "./services/pipeline";
import {
  FileSettingsLive,
  Settings,
  defaultSettingsPath,
  publicSettings,
} from "./services/settings";
import { enableWebviewTransparency } from "./webview-transparent";

const DEV_SERVER_URL = "http://localhost:5173";
const POINTER_MS = 8000;

type PublicSettings = ReturnType<typeof publicSettings> & { hasKey: boolean };
type TalkResult = { ok: boolean; error?: string; listening?: boolean };

type NotchRPC = {
  bun: RPCSchema<{
    requests: {
      getBootstrap: {
        params: Record<string, never>;
        response: {
          settings: PublicSettings;
          status: AppStatus;
          hotkey: string;
          error: string;
        };
      };
      saveSettings: {
        params: Partial<BuddySettings>;
        response: { settings: PublicSettings };
      };
      setExpanded: {
        params: { expanded: boolean; height?: number };
        response: { ok: true };
      };
      setTyping: {
        params: { typing: boolean };
        response: { ok: true };
      };
      startTalk: {
        params: Record<string, never>;
        response: TalkResult;
      };
      toggleTalk: {
        params: Record<string, never>;
        response: TalkResult;
      };
      cancelListen: {
        params: Record<string, never>;
        response: { ok: true };
      };
      reportError: {
        params: { error: string };
        response: { ok: true };
      };
      submitAudio: {
        params: RecordedAudio;
        response: { ok: true };
      };
    };
    messages: Record<string, never>;
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: {
      statusChanged: {
        status: AppStatus;
        detail?: string;
        error?: string;
        transcript?: string;
        speech?: string;
      };
      recordingChanged: { recording: boolean };
      playAudio: { mimeType: string; base64: string };
    };
  }>;
};

type OverlayRPC = {
  bun: RPCSchema<{
    requests: Record<string, never>;
    messages: Record<string, never>;
  }>;
  webview: RPCSchema<{
    requests: Record<string, never>;
    messages: {
      showPointer: PointerTarget;
      hidePointer: Record<string, never>;
    };
  }>;
};

async function getNotchUrl(): Promise<string> {
  try {
    const channel = await Updater.localInfo.channel();
    if (channel === "dev") {
      await fetch(DEV_SERVER_URL, { method: "HEAD" });
      return DEV_SERVER_URL;
    }
  } catch {
    // Bundled views:// URL is the normal path.
  }
  return "views://mainview/index.html";
}

function notchFrame(contentHeight?: number) {
  const display = Screen.getPrimaryDisplay();
  return {
    x: Math.round(display.workArea.x + (display.workArea.width - NOTCH_WIDTH) / 2),
    y: Math.round(display.workArea.y + 10),
    width: NOTCH_WIDTH,
    height: notchWindowHeight(contentHeight, display.workArea.height),
  };
}

function parkOverlayWindow() {
  overlayWindow.hide();
  overlayWindow.setAlwaysOnTop(false);
}

function raiseNotch(activate: boolean) {
  notchWindow?.setAlwaysOnTop(true);
  if (activate) notchWindow?.activate();
}

function toPublic(settings: BuddySettings): PublicSettings {
  return {
    ...publicSettings(settings),
    hasKey: Boolean(settings.apiKey),
    apiKey: settings.apiKey ? "••••••••" : "",
  };
}

ApplicationMenu.setApplicationMenu([
  { label: "Buddy", submenu: [{ role: "quit" }] },
]);

const overlayRpc = BrowserView.defineRPC<OverlayRPC>({
  maxRequestTime: 10_000,
  handlers: {
    requests: {},
    messages: {},
  },
});

const overlayWindow = new BrowserWindow({
  title: "Buddy Pointer",
  url: "views://overlay/index.html",
  titleBarStyle: "hidden",
  transparent: true,
  passthrough: true,
  hidden: true,
  activate: false,
  frame: PARKED_OVERLAY_FRAME,
  rpc: overlayRpc,
});
void enableWebviewTransparency(overlayWindow.webview?.id);

let overlayWasVisible = false;
let pointerTimer: ReturnType<typeof setTimeout> | null = null;
let settingsExpanded = false;
let typingInField = false;
let lastOverlayPlacement: ReturnType<typeof pointerOverlayPlacement> | null = null;

function pushOverlayPointer(point: PointerTarget | null) {
  try {
    if (point) overlayRpc.send.showPointer(point);
    else overlayRpc.send.hidePointer({});
  } catch {
    // Overlay RPC can race the first capture before the view is ready.
  }
  overlayWindow.webview.executeJavascript(
    `window.dispatchEvent(new CustomEvent("buddy-pointer", { detail: ${JSON.stringify(point)} }));`,
  );
}

function showPointerOverlay(point: PointerTarget, display: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const placement = pointerOverlayPlacement(point, display);
  lastOverlayPlacement = placement;
  overlayWindow.setFrame(
    placement.frame.x,
    placement.frame.y,
    placement.frame.width,
    placement.frame.height,
  );
  overlayWindow.setAlwaysOnTop(true);
  overlayWindow.showInactive();
  pushOverlayPointer(placement.local);
  raiseNotch(false);
}

const overlayLayer = OverlayLive({
  showPointer: (point, display) =>
    Effect.sync(() => {
      if (pointerTimer) clearTimeout(pointerTimer);
      showPointerOverlay(point, display);
      pointerTimer = setTimeout(() => {
        pushOverlayPointer(null);
        parkOverlayWindow();
        raiseNotch(false);
      }, POINTER_MS);
    }),
  hidePointer: () =>
    Effect.sync(() => {
      if (pointerTimer) clearTimeout(pointerTimer);
      pushOverlayPointer(null);
      parkOverlayWindow();
    }),
  hideForCapture: () =>
    Effect.sync(() => {
      overlayWasVisible = overlayWindow.isVisible();
      parkOverlayWindow();
    }),
  restoreAfterCapture: () =>
    Effect.sync(() => {
      if (!overlayWasVisible || !lastOverlayPlacement) return;
      overlayWindow.setFrame(
        lastOverlayPlacement.frame.x,
        lastOverlayPlacement.frame.y,
        lastOverlayPlacement.frame.width,
        lastOverlayPlacement.frame.height,
      );
      overlayWindow.setAlwaysOnTop(true);
      overlayWindow.showInactive();
      raiseNotch(false);
    }),
});

const settingsPath = defaultSettingsPath(
  Utils.paths.userData || join(Utils.paths.home || process.cwd(), ".buddy"),
);

const appRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    FileSettingsLive(settingsPath),
    ElectrobunCaptureLive,
    OpenRouterLive,
    overlayLayer,
  ),
);

let status: AppStatus = "idle";
let lastError = "";
let lastHotkey = "";
let listening = false;
let pipelineRunning = false;
let screenshotPromise: Promise<ScreenshotPayload | null> = Promise.resolve(null);
let notchWindow: BrowserWindow | null = null;

function publishStatus(
  next: AppStatus,
  extra: {
    detail?: string;
    error?: string;
    transcript?: string;
    speech?: string;
  } = {},
) {
  status = next;
  if (next === "idle") lastError = extra.error ?? "";
  else if (extra.error !== undefined) lastError = extra.error;
  else if (next === "listening") lastError = "";
  notchRpc.send.statusChanged({
    status,
    detail: extra.detail,
    error: lastError,
    transcript: extra.transcript,
    speech: extra.speech,
  });
}

async function currentPublicSettings(): Promise<PublicSettings> {
  const settings = await appRuntime.runPromise(
    Effect.gen(function* () {
      const store = yield* Settings;
      return yield* store.load();
    }),
  );
  return toPublic(settings);
}

async function persistSettings(patch: Partial<BuddySettings>): Promise<PublicSettings> {
  const nextPatch = { ...patch };
  if (nextPatch.apiKey?.includes("•")) {
    delete nextPatch.apiKey;
  }
  const settings = await appRuntime.runPromise(
    Effect.gen(function* () {
      const store = yield* Settings;
      return yield* store.save(nextPatch);
    }),
  );
  return toPublic(settings);
}

async function loadApiKey(): Promise<string> {
  const settings = await appRuntime.runPromise(
    Effect.gen(function* () {
      const store = yield* Settings;
      return yield* store.load();
    }),
  );
  return settings.apiKey;
}

async function beginListen(): Promise<TalkResult> {
  if (listening) return { ok: true, listening: true };

  const blocked = talkStartBlockers({
    apiKey: await loadApiKey(),
    pipelineRunning,
  });
  if (!blocked.ok) {
    publishStatus("error", { error: blocked.error });
    return blocked;
  }

  listening = true;
  lastError = "";
  publishStatus("listening", { detail: "Listening" });
  notchRpc.send.recordingChanged({ recording: true });

  screenshotPromise = appRuntime.runPromise(captureScreenshot).catch((error) => {
    console.warn("[buddy] screenshot failed", error);
    return null;
  });
  return { ok: true, listening: true };
}

function requestStopListening() {
  if (!listening || pipelineRunning) return;
  notchRpc.send.recordingChanged({ recording: false });
}

async function toggleTalk(): Promise<TalkResult> {
  if (listening) {
    requestStopListening();
    return { ok: true, listening: false };
  }
  return beginListen();
}

async function finishListen(audio: RecordedAudio) {
  if (pipelineRunning) return;
  listening = false;
  pipelineRunning = true;

  if (!audio.base64) {
    pipelineRunning = false;
    publishStatus("error", { error: EMPTY_AUDIO_ERROR });
    return;
  }

  publishStatus("transcribing", { detail: "Transcribing speech" });
  const captured = await screenshotPromise;
  screenshotPromise = Promise.resolve(null);
  if (!captured) {
    pipelineRunning = false;
    publishStatus("error", { error: SCREEN_CAPTURE_ERROR });
    return;
  }
  try {
    const result = await appRuntime.runPromise(
      runTalkPipeline({
        screenshot: captured,
        audio,
        onProgress: (next, detail) => {
          publishStatus(next, { detail });
        },
      }),
    );

    if (result.reply.point) {
      publishStatus("pointing", {
        transcript: result.transcript,
        speech: result.reply.speech,
        detail: result.reply.point.label,
      });
    } else {
      publishStatus("speaking", {
        transcript: result.transcript,
        speech: result.reply.speech,
      });
    }

    if (result.audio) {
      notchRpc.send.playAudio(result.audio);
    }

    setTimeout(() => {
      if (status === "speaking" || status === "pointing") publishStatus("idle");
    }, POINTER_MS);
  } catch (error) {
    publishStatus("error", {
      error: error instanceof Error ? error.message : "OpenRouter request failed",
    });
  } finally {
    pipelineRunning = false;
  }
}

const notchRpc = BrowserView.defineRPC<NotchRPC>({
  maxRequestTime: 120_000,
  handlers: {
    requests: {
      getBootstrap: async () => ({
        settings: await currentPublicSettings(),
        status,
        hotkey: lastHotkey,
        error: lastError,
      }),
      saveSettings: async (patch) => ({
        settings: await persistSettings(patch),
      }),
      setExpanded: ({ expanded, height }) => {
        const opening = expanded && !settingsExpanded;
        settingsExpanded = expanded;
        if (expanded) parkOverlayWindow();
        const frame = notchFrame(height);
        notchWindow?.setFrame(frame.x, frame.y, frame.width, frame.height);
        raiseNotch(opening);
        return { ok: true as const };
      },
      setTyping: ({ typing }) => {
        typingInField = typing;
        return { ok: true as const };
      },
      startTalk: async () => beginListen(),
      toggleTalk: async () => toggleTalk(),
      cancelListen: async () => {
        if (!pipelineRunning) {
          listening = false;
          screenshotPromise = Promise.resolve(null);
          if (status === "listening" || status === "capturing") publishStatus("idle");
        }
        return { ok: true as const };
      },
      reportError: async ({ error }) => {
        if (!pipelineRunning) {
          listening = false;
          screenshotPromise = Promise.resolve(null);
          publishStatus("error", { error });
        }
        return { ok: true as const };
      },
      submitAudio: async (audio) => {
        void finishListen(audio);
        return { ok: true as const };
      },
    },
    messages: {},
  },
});

const hotkeys = await startTalkHotkeys({
  isHoldPaused: () => typingInField,
  onHoldStart: () => {
    void beginListen();
  },
  onHoldEnd: () => {
    requestStopListening();
  },
  onToggle: () => {
    void toggleTalk();
  },
});
lastHotkey = hotkeys.binding;

const url = await getNotchUrl();
notchWindow = new BrowserWindow({
  title: "Buddy",
  url,
  titleBarStyle: "hidden",
  transparent: true,
  passthrough: true,
  activate: true,
  frame: notchFrame(NOTCH_BOOTSTRAP_HEIGHT),
  rpc: notchRpc,
});
notchWindow.setAlwaysOnTop(true);
notchWindow.activate();
void enableWebviewTransparency(notchWindow.webview?.id);
setTimeout(() => void enableWebviewTransparency(notchWindow?.webview?.id), 50);
setTimeout(() => void enableWebviewTransparency(notchWindow?.webview?.id), 250);
notchWindow.on("close", () => {
  Utils.quit();
});

console.log(`Buddy started. ${hotkeys.binding}`);
