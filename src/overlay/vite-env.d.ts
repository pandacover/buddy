/// <reference types="vite/client" />

import type { BuddyOverlayAPI } from "../shared/bridge";

declare global {
  interface Window {
    buddyOverlay?: BuddyOverlayAPI;
  }
}

export {};
