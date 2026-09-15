import { contextBridge, ipcRenderer } from "electron";
import type { BuddyOverlayAPI } from "../shared/bridge";
import type { PointerTarget } from "../shared/protocol";

function listen<T>(channel: string, handler: (payload: T) => void): () => void {
  const wrapped = (_event: unknown, payload: T) => handler(payload);
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
}

const api: BuddyOverlayAPI = {
  onShowPointer: (handler: (point: PointerTarget) => void) =>
    listen("buddy:showPointer", handler),
  onHidePointer: (handler: () => void) =>
    listen("buddy:hidePointer", () => handler()),
};

contextBridge.exposeInMainWorld("buddyOverlay", api);
