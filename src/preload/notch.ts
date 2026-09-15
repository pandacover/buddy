import { contextBridge, ipcRenderer } from "electron";
import type {
  BuddyNotchAPI,
  ExpandPayload,
  StatusPayload,
} from "../shared/bridge";
import type { BuddySettings, RecordedAudio } from "../shared/protocol";

function listen<T>(channel: string, handler: (payload: T) => void): () => void {
  const wrapped = (_event: unknown, payload: T) => handler(payload);
  ipcRenderer.on(channel, wrapped);
  return () => {
    ipcRenderer.removeListener(channel, wrapped);
  };
}

const api: BuddyNotchAPI = {
  getBootstrap: () => ipcRenderer.invoke("buddy:getBootstrap"),
  saveSettings: (patch: Partial<BuddySettings>) =>
    ipcRenderer.invoke("buddy:saveSettings", patch),
  setExpanded: (payload: ExpandPayload) => ipcRenderer.invoke("buddy:setExpanded", payload),
  setTyping: (payload: { typing: boolean }) => ipcRenderer.invoke("buddy:setTyping", payload),
  startTalk: () => ipcRenderer.invoke("buddy:startTalk"),
  endTalk: () => ipcRenderer.invoke("buddy:endTalk"),
  toggleTalk: () => ipcRenderer.invoke("buddy:toggleTalk"),
  cancelListen: () => ipcRenderer.invoke("buddy:cancelListen"),
  reportError: (payload: { error: string }) => ipcRenderer.invoke("buddy:reportError", payload),
  submitAudio: (payload: RecordedAudio) => ipcRenderer.invoke("buddy:submitAudio", payload),
  setIgnoreMouse: (ignore: boolean) => ipcRenderer.send("buddy:setIgnoreMouse", ignore),
  onStatusChanged: (handler: (payload: StatusPayload) => void) =>
    listen("buddy:statusChanged", handler),
  onRecordingChanged: (handler: (payload: { recording: boolean }) => void) =>
    listen("buddy:recordingChanged", handler),
  onPlayAudio: (handler: (payload: { mimeType: string; base64: string }) => void) =>
    listen("buddy:playAudio", handler),
};

contextBridge.exposeInMainWorld("buddy", api);
