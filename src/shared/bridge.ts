import type { AppStatus, BuddySettings, PointerTarget, RecordedAudio } from "./protocol";

export type PublicSettings = BuddySettings & { hasKey: boolean };

export type TalkResult = { ok: boolean; error?: string; listening?: boolean };

export type BootstrapPayload = {
  settings: PublicSettings;
  status: AppStatus;
  hotkey: string;
  error: string;
};

export type StatusPayload = {
  status: AppStatus;
  detail?: string;
  error?: string;
  transcript?: string;
  speech?: string;
};

export type ExpandPayload = {
  expanded: boolean;
  height?: number;
  rev?: number;
};

export type BuddyNotchAPI = {
  getBootstrap: () => Promise<BootstrapPayload>;
  saveSettings: (patch: Partial<BuddySettings>) => Promise<{ settings: PublicSettings }>;
  setExpanded: (payload: ExpandPayload) => Promise<{ ok: true }>;
  setTyping: (payload: { typing: boolean }) => Promise<{ ok: true }>;
  startTalk: () => Promise<TalkResult>;
  endTalk: () => Promise<TalkResult>;
  toggleTalk: () => Promise<TalkResult>;
  cancelListen: () => Promise<{ ok: true }>;
  reportError: (payload: { error: string }) => Promise<{ ok: true }>;
  submitAudio: (payload: RecordedAudio) => Promise<{ ok: true }>;
  setIgnoreMouse: (ignore: boolean) => void;
  onStatusChanged: (handler: (payload: StatusPayload) => void) => () => void;
  onRecordingChanged: (handler: (payload: { recording: boolean }) => void) => () => void;
  onPlayAudio: (handler: (payload: { mimeType: string; base64: string }) => void) => () => void;
};

export type BuddyOverlayAPI = {
  onShowPointer: (handler: (point: PointerTarget) => void) => () => void;
  onHidePointer: (handler: () => void) => () => void;
};
