declare module "electrobun" {
  export type {
    ElectrobunConfig,
    WindowsWebView2Permission,
  } from "./electrobun-config";
}

declare module "electrobun/main" {
  export type RPCSchema<T> = T;

  export class BrowserWindow {
    id: number;
    webview: BrowserView;
    constructor(options?: {
      title?: string;
      url?: string | null;
      html?: string | null;
      frame?: { x?: number; y?: number; width: number; height: number };
      rpc?: unknown;
      titleBarStyle?: "default" | "hidden" | "hiddenInset";
      transparent?: boolean;
      passthrough?: boolean;
      hidden?: boolean;
      activate?: boolean;
    });
    show(): void;
    showInactive(): void;
    hide(): void;
    isVisible(): boolean;
    close(): void;
    activate(): void;
    setAlwaysOnTop(value: boolean): void;
    setVisibleOnAllWorkspaces(value: boolean): void;
    setPosition(x: number, y: number): void;
    setSize(width: number, height: number): void;
    setFrame(x: number, y: number, width: number, height: number): void;
    getFrame(): { x: number; y: number; width: number; height: number };
    setTitle(title: string): void;
    on(event: string, handler: (event: unknown) => void): void;
  }

  export class BrowserView {
    id: number;
    static defineRPC<T>(config: {
      maxRequestTime?: number;
      handlers: {
        requests: Record<string, (params: never) => unknown> | object;
        messages: Record<string, (params: never) => void> | object;
      };
    }): {
      send: Record<string, (payload?: unknown) => void>;
      request: Record<string, (payload?: unknown) => Promise<unknown>>;
    };
    loadURL(url: string): void;
    executeJavascript(code: string): void;
    on(event: string, handler: (event: unknown) => void): void;
  }

  export type ElectrobunRPC<T> = {
    send: Record<string, (payload: unknown) => void>;
    request: Record<string, (payload: unknown) => Promise<unknown>>;
  } & T;

  export const Screen: {
    getPrimaryDisplay(): DisplayInfo;
    getAllDisplays(): DisplayInfo[];
    getCursorScreenPoint(): { x: number; y: number };
    captureRegion(region: {
      x: number;
      y: number;
      width: number;
      height: number;
    }): Uint8Array | null;
  };

  export type DisplayInfo = {
    id?: number;
    bounds: { x: number; y: number; width: number; height: number };
    workArea: { x: number; y: number; width: number; height: number };
    scaleFactor: number;
    isPrimary: boolean;
  };

  export const GlobalShortcut: {
    register(accelerator: string, callback: () => void): boolean;
    unregister(accelerator: string): void;
    unregisterAll(): void;
    isRegistered(accelerator: string): boolean;
  };

  export const Utils: {
    paths: {
      home: string;
      appData: string;
      config: string;
      cache: string;
      temp: string;
      logs: string;
      documents: string;
      downloads: string;
      desktop: string;
      userData: string;
      userCache: string;
      userLogs: string;
    };
    quit(exitCode?: number): void;
    showNotification(options: {
      title: string;
      subtitle?: string;
      body?: string;
      silent?: boolean;
    }): void;
  };

  export const Updater: {
    localInfo: {
      channel(): Promise<string>;
    };
  };

  export const ApplicationMenu: {
    setApplicationMenu(items: unknown[]): void;
    on(event: string, handler: (event: unknown) => void): void;
  };

  const Electrobun: {
    events: {
      on(event: string, handler: (event: { data: unknown; response?: unknown }) => void): void;
    };
  };

  export default Electrobun;
}

