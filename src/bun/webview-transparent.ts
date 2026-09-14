import { pathToFileURL } from "node:url";
import { join } from "node:path";

type TransparentFfi = {
  request: {
    webviewSetTransparent: (opts: { id: number; transparent: boolean }) => void;
  };
};

/**
 * BrowserWindow sets native window transparency but does not pass
 * `startTransparent` into the BrowserView. WebView2 then fills the HWND with
 * an opaque black canvas — the large backdrop around the rounded card.
 * Reuse Electrobun's already-loaded FFI singleton (same resolved native.ts).
 */
export async function enableWebviewTransparency(webviewId: number | undefined): Promise<void> {
  if (webviewId == null) return;
  const ffi = await loadElectrobunFfi();
  if (!ffi) {
    console.warn("[buddy] webviewSetTransparent unavailable (Electrobun FFI not loaded)");
    return;
  }
  try {
    ffi.request.webviewSetTransparent({ id: webviewId, transparent: true });
  } catch (error) {
    console.warn("[buddy] webviewSetTransparent failed", error);
  }
}

async function loadElectrobunFfi(): Promise<TransparentFfi | null> {
  const candidates: string[] = [];
  try {
    const mainSdk = import.meta.resolve("electrobun/main");
    candidates.push(new URL("./proc/native.ts", mainSdk).href);
  } catch {
    // Resolver can miss before the Hutch devkit is on the module path.
  }
  const devkit = process.env.ELECTROBUN_DEVKIT;
  if (devkit) {
    candidates.push(pathToFileURL(join(devkit, "api/sdks/main/proc/native.ts")).href);
  }

  for (const url of candidates) {
    try {
      const mod = (await import(url)) as { ffi?: TransparentFfi };
      if (mod.ffi?.request?.webviewSetTransparent) return mod.ffi;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}
