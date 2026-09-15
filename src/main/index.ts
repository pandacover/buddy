import { Effect, Layer, ManagedRuntime } from "effect";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  screen,
  session,
  type IpcMainInvokeEvent,
} from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AppStatus,
  BuddySettings,
  PointerTarget,
  RecordedAudio,
  ScreenshotPayload,
} from "../shared/protocol";
import type {
  BootstrapPayload,
  ExpandPayload,
  PublicSettings,
  StatusPayload,
  TalkResult,
} from "../shared/bridge";
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
import { loadDotEnv } from "./env";
import { startTalkHotkeys } from "./hotkeys";
import { ElectronCaptureLive } from "./services/capture-electron";
import { OpenRouterLive } from "./services/openrouter";
import { OverlayLive } from "./services/overlay";
import { captureScreenshot, runTalkPipeline } from "./services/pipeline";
import {
  FileSettingsLive,
  Settings,
  defaultSettingsPath,
  publicSettings,
} from "./services/settings";

loadDotEnv();

const POINTER_MS = 8000;

const TRANSPARENT_WINDOW = {
  frame: false,
  transparent: true,
  backgroundColor: "#00000000",
  hasShadow: false,
  resizable: false,
  maximizable: false,
  minimizable: false,
  fullscreenable: false,
  skipTaskbar: true,
  autoHideMenuBar: true,
  thickFrame: false,
} as const;

function preloadPath(name: "notch" | "overlay"): string {
  return join(__dirname, "..", "preload", `${name}.cjs`);
}

function rendererUrl(kind: "notch" | "overlay"): string {
  const envKey = kind === "notch" ? "BUDDY_NOTCH_URL" : "BUDDY_OVERLAY_URL";
  const fromEnv = process.env[envKey];
  if (fromEnv) return fromEnv;
  const file = join(__dirname, "..", kind === "notch" ? "mainview" : "overlay", "index.html");
  return pathToFileURL(file).href;
}

function notchFrame(contentHeight?: number, expanded = false) {
  const display = screen.getPrimaryDisplay();
  return {
    x: Math.round(display.workArea.x + (display.workArea.width - NOTCH_WIDTH) / 2),
    y: Math.round(display.workArea.y + 10),
    width: NOTCH_WIDTH,
    height: notchWindowHeight(contentHeight, display.workArea.height, expanded),
  };
}

function toPublic(settings: BuddySettings): PublicSettings {
  return {
    ...publicSettings(settings),
    hasKey: Boolean(settings.apiKey),
    apiKey: settings.apiKey ? "••••••••" : "",
  };
}

let notchWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let overlayWasVisible = false;
let pointerTimer: ReturnType<typeof setTimeout> | null = null;
let settingsExpanded = false;
let expandRev = 0;
let typingInField = false;
let lastOverlayPlacement: ReturnType<typeof pointerOverlayPlacement> | null = null;
let status: AppStatus = "idle";
let lastError = "";
let lastHotkey = "";
let listening = false;
let pipelineRunning = false;
let screenshotPromise: Promise<ScreenshotPayload | null> = Promise.resolve(null);
let hotkeysStop: (() => void) | null = null;

function sendNotch(channel: string, payload: unknown) {
  if (!notchWindow || notchWindow.isDestroyed()) return;
  notchWindow.webContents.send(channel, payload);
}

function sendOverlay(channel: string, payload?: unknown) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.webContents.send(channel, payload);
}

function parkOverlayWindow() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.hide();
  overlayWindow.setAlwaysOnTop(false);
  overlayWindow.setBounds(PARKED_OVERLAY_FRAME);
}

function raiseNotch(activate: boolean) {
  if (!notchWindow || notchWindow.isDestroyed()) return;
  notchWindow.setAlwaysOnTop(true, "screen-saver");
  if (activate) notchWindow.show();
}

function pushOverlayPointer(point: PointerTarget | null) {
  if (point) sendOverlay("buddy:showPointer", point);
  else sendOverlay("buddy:hidePointer");
}

function showPointerOverlay(
  point: PointerTarget,
  display: { x: number; y: number; width: number; height: number },
) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  const placement = pointerOverlayPlacement(point, display);
  lastOverlayPlacement = placement;
  overlayWindow.setBounds(placement.frame);
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.setIgnoreMouseEvents(true);
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
      overlayWasVisible = Boolean(overlayWindow?.isVisible());
      parkOverlayWindow();
    }),
  restoreAfterCapture: () =>
    Effect.sync(() => {
      if (!overlayWasVisible || !lastOverlayPlacement || !overlayWindow) return;
      overlayWindow.setBounds(lastOverlayPlacement.frame);
      overlayWindow.setAlwaysOnTop(true, "screen-saver");
      overlayWindow.showInactive();
      raiseNotch(false);
    }),
});

const appRuntime = ManagedRuntime.make(
  Layer.mergeAll(
    FileSettingsLive(defaultSettingsPath(app.getPath("userData"))),
    ElectronCaptureLive,
    OpenRouterLive,
    overlayLayer,
  ),
);

function publishStatus(next: AppStatus, extra: Omit<StatusPayload, "status"> = {}) {
  status = next;
  if (next === "idle") lastError = extra.error ?? "";
  else if (extra.error !== undefined) lastError = extra.error;
  else if (next === "listening") lastError = "";
  sendNotch("buddy:statusChanged", {
    status,
    detail: extra.detail,
    error: lastError,
    transcript: extra.transcript,
    speech: extra.speech,
  } satisfies StatusPayload);
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
  if (nextPatch.apiKey?.includes("•")) delete nextPatch.apiKey;
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
  sendNotch("buddy:recordingChanged", { recording: true });
  screenshotPromise = appRuntime.runPromise(captureScreenshot).catch((error) => {
    console.warn("[buddy] screenshot failed", error);
    return null;
  });
  return { ok: true, listening: true };
}

function requestStopListening() {
  if (!listening || pipelineRunning) return;
  sendNotch("buddy:recordingChanged", { recording: false });
}

async function endTalk(): Promise<TalkResult> {
  if (!listening) return { ok: true, listening: false };
  requestStopListening();
  return { ok: true, listening: false };
}

async function toggleTalk(): Promise<TalkResult> {
  if (listening) return endTalk();
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
        onProgress: (next, detail) => publishStatus(next, { detail }),
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
    if (result.audio) sendNotch("buddy:playAudio", result.audio);
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

function applyNotchBounds(expanded: boolean, height?: number) {
  if (!notchWindow || notchWindow.isDestroyed()) return;
  const frame = notchFrame(height, expanded);
  notchWindow.setBounds(frame);
}

function registerIpc() {
  ipcMain.handle("buddy:getBootstrap", async (): Promise<BootstrapPayload> => ({
    settings: await currentPublicSettings(),
    status,
    hotkey: lastHotkey,
    error: lastError,
  }));
  ipcMain.handle("buddy:saveSettings", async (_event, patch: Partial<BuddySettings>) => ({
    settings: await persistSettings(patch),
  }));
  ipcMain.handle("buddy:setExpanded", async (_event, payload: ExpandPayload) => {
    const { expanded, height, rev } = payload;
    if (typeof rev === "number") {
      if (rev < expandRev) return { ok: true as const };
      expandRev = rev;
    }
    const opening = expanded && !settingsExpanded;
    settingsExpanded = expanded;
    if (expanded) parkOverlayWindow();
    applyNotchBounds(expanded, height);
    raiseNotch(opening);
    return { ok: true as const };
  });
  ipcMain.handle("buddy:setTyping", async (_event, payload: { typing: boolean }) => {
    typingInField = payload.typing;
    return { ok: true as const };
  });
  ipcMain.handle("buddy:startTalk", async () => beginListen());
  ipcMain.handle("buddy:endTalk", async () => endTalk());
  ipcMain.handle("buddy:toggleTalk", async () => toggleTalk());
  ipcMain.handle("buddy:cancelListen", async () => {
    if (!pipelineRunning) {
      listening = false;
      screenshotPromise = Promise.resolve(null);
      if (status === "listening" || status === "capturing") publishStatus("idle");
    }
    return { ok: true as const };
  });
  ipcMain.handle("buddy:reportError", async (_event, payload: { error: string }) => {
    if (!pipelineRunning) {
      listening = false;
      screenshotPromise = Promise.resolve(null);
      publishStatus("error", { error: payload.error });
    }
    return { ok: true as const };
  });
  ipcMain.handle("buddy:submitAudio", async (_event: IpcMainInvokeEvent, audio: RecordedAudio) => {
    void finishListen(audio);
    return { ok: true as const };
  });
  ipcMain.on("buddy:setIgnoreMouse", (event, ignore: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    win.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  });
}

function createWindows() {
  overlayWindow = new BrowserWindow({
    title: "Buddy Pointer",
    ...TRANSPARENT_WINDOW,
    show: false,
    focusable: false,
    width: PARKED_OVERLAY_FRAME.width,
    height: PARKED_OVERLAY_FRAME.height,
    x: PARKED_OVERLAY_FRAME.x,
    y: PARKED_OVERLAY_FRAME.y,
    webPreferences: {
      preload: preloadPath("overlay"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  overlayWindow.setIgnoreMouseEvents(true);
  void overlayWindow.loadURL(rendererUrl("overlay"));

  const frame = notchFrame(NOTCH_BOOTSTRAP_HEIGHT);
  notchWindow = new BrowserWindow({
    title: "Buddy",
    ...TRANSPARENT_WINDOW,
    show: true,
    focusable: true,
    ...frame,
    webPreferences: {
      preload: preloadPath("notch"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  notchWindow.setAlwaysOnTop(true, "screen-saver");
  notchWindow.setIgnoreMouseEvents(false);
  void notchWindow.loadURL(rendererUrl("notch"));
  notchWindow.on("closed", () => {
    notchWindow = null;
    app.quit();
  });
}

app.setName("Buddy");
if (process.platform === "win32") {
  app.setAppUserModelId("dev.pandacover.buddy");
}

Menu.setApplicationMenu(
  Menu.buildFromTemplate([{ label: "Buddy", submenu: [{ role: "quit" }] }]),
);

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media" || permission === "display-capture");
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return permission === "media" || permission === "display-capture";
  });

  registerIpc();
  createWindows();

  const hotkeys = startTalkHotkeys({
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
  hotkeysStop = hotkeys.stop;
  console.log(`Buddy started. ${hotkeys.binding}`);
});

app.on("will-quit", () => {
  hotkeysStop?.();
  void appRuntime.dispose();
});

app.on("window-all-closed", () => {
  app.quit();
});
