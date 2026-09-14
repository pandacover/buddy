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
  PARKED_OVERLAY_FRAME,
  pointerOverlayPlacement,
} from "../shared/overlay-geometry";
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

const DEV_SERVER_URL = "http://localhost:5173";
const NOTCH_WIDTH = 460;
const NOTCH_HEIGHT = 72;
const NOTCH_EXPANDED_HEIGHT = 420;
const POINTER_MS = 8000;

type PublicSettings = ReturnType<typeof publicSettings> & { hasKey: boolean };

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
        params: { expanded: boolean };
        response: { ok: true };
      };
      startTalk: {
        params: Record<string, never>;
        response: { ok: true };
      };
      toggleTalk: {
        params: Record<string, never>;
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

function notchFrame(expanded: boolean) {
  const display = Screen.getPrimaryDisplay();
  const height = expanded ? NOTCH_EXPANDED_HEIGHT : NOTCH_HEIGHT;
  return {
    x: Math.round(display.workArea.x + (display.workArea.width - NOTCH_WIDTH) / 2),
    y: Math.round(display.workArea.y + 10),
    width: NOTCH_WIDTH,
    height,
  };
}

function parkOverlayWindow() {
  overlayWindow.hide();
  overlayWindow.setAlwaysOnTop(false);
  overlayWindow.setFrame(
    PARKED_OVERLAY_FRAME.x,
    PARKED_OVERLAY_FRAME.y,
    PARKED_OVERLAY_FRAME.width,
    PARKED_OVERLAY_FRAME.height,
  );
}

function raiseNotch() {
  notchWindow?.setAlwaysOnTop(true);
  notchWindow?.activate();
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

let overlayWasVisible = false;
let pointerTimer: ReturnType<typeof setTimeout> | null = null;
let settingsExpanded = false;
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
  raiseNotch();
}

const overlayLayer = OverlayLive({
  showPointer: (point, display) =>
    Effect.sync(() => {
      if (pointerTimer) clearTimeout(pointerTimer);
      showPointerOverlay(point, display);
      pointerTimer = setTimeout(() => {
        pushOverlayPointer(null);
        parkOverlayWindow();
        raiseNotch();
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
      raiseNotch();
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
let screenshot: ScreenshotPayload | null = null;
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
  if (extra.error !== undefined) lastError = extra.error;
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

async function beginListen() {
  if (listening || pipelineRunning) return;
  listening = true;
  lastError = "";
  publishStatus("capturing", { detail: "Capturing screen" });
  try {
    screenshot = await appRuntime.runPromise(captureScreenshot);
    publishStatus("listening", { detail: "Listening" });
    notchRpc.send.recordingChanged({ recording: true });
  } catch (error) {
    listening = false;
    screenshot = null;
    publishStatus("error", {
      error: error instanceof Error ? error.message : "Failed to start listening",
    });
  }
}

function toggleTalk() {
  if (listening) {
    notchRpc.send.recordingChanged({ recording: false });
    return;
  }
  void beginListen();
}

async function finishListen(audio: RecordedAudio) {
  if (pipelineRunning) return;
  listening = false;
  notchRpc.send.recordingChanged({ recording: false });

  const captured = screenshot;
  screenshot = null;
  if (!captured) {
    publishStatus("error", { error: "No screenshot was captured." });
    return;
  }

  pipelineRunning = true;
  publishStatus("transcribing", { detail: "Transcribing speech" });
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
      error: error instanceof Error ? error.message : "Pipeline failed",
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
      setExpanded: ({ expanded }) => {
        settingsExpanded = expanded;
        const frame = notchFrame(expanded);
        notchWindow?.setFrame(frame.x, frame.y, frame.width, frame.height);
        if (expanded) {
          parkOverlayWindow();
        }
        raiseNotch();
        return { ok: true as const };
      },
      startTalk: async () => {
        void beginListen();
        return { ok: true as const };
      },
      toggleTalk: async () => {
        toggleTalk();
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
  isHoldPaused: () => settingsExpanded,
  onHoldStart: () => {
    void beginListen();
  },
  onHoldEnd: () => {
    if (listening) notchRpc.send.recordingChanged({ recording: false });
  },
  onToggle: () => {
    toggleTalk();
  },
});
lastHotkey = hotkeys.binding;

const url = await getNotchUrl();
notchWindow = new BrowserWindow({
  title: "Buddy",
  url,
  titleBarStyle: "hidden",
  transparent: true,
  passthrough: false,
  activate: true,
  frame: notchFrame(false),
  rpc: notchRpc,
});
notchWindow.setAlwaysOnTop(true);
notchWindow.activate();
notchWindow.on("close", () => {
  Utils.quit();
});

console.log(`Buddy started. ${hotkeys.binding}`);
