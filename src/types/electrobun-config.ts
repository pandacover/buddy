/**
 * Local Electrobun config types.
 *
 * The npm `electrobun` package is CLI-only (its runtime export throws).
 * Keep this file as the source of truth for `electrobun.config.ts` so
 * TypeScript never resolves config types through node_modules/electrobun.
 */
export type WindowsWebView2Permission =
  | "camera"
  | "microphone"
  | "geolocation"
  | "notifications";

export interface ElectrobunConfig {
  app: {
    name: string;
    identifier: string;
    version: string;
    description?: string;
  };
  runtime?: {
    exitOnLastWindowClosed?: boolean;
    [key: string]: unknown;
  };
  build?: {
    mainProcess?: "bun" | "cottontail" | "zig" | "rust" | "go" | "odin";
    bun?: {
      entrypoint?: string;
      external?: string[];
    };
    cottontail?: {
      entrypoint?: string;
    };
    views?: Record<string, { entrypoint: string }>;
    copy?: Record<string, string>;
    watch?: string[];
    watchIgnore?: string[];
    mac?: { bundleCEF?: boolean };
    linux?: { bundleCEF?: boolean };
    win?: {
      bundleCEF?: boolean;
      autoGrantPermissions?: WindowsWebView2Permission[];
    };
  };
}
