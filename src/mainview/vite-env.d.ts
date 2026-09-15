/// <reference types="vite/client" />

import type { BuddyNotchAPI } from "../shared/bridge";

declare global {
  interface Window {
    buddy?: BuddyNotchAPI;
  }
}

export {};
