export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type OverlayPlacement = {
  frame: Rect;
  local: { x: number; y: number; label: string };
};

/** Hidden overlay stays 1×1 on-screen. Do not use -32000 — Windows treats that as minimized. */
export const PARKED_OVERLAY_FRAME: Rect = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

export const POINTER_OVERLAY_SIZE = 360;

export function pointerOverlayPlacement(
  point: { x: number; y: number; label: string },
  display: Rect,
  size = POINTER_OVERLAY_SIZE,
): OverlayPlacement {
  const screenX = display.x + point.x * display.width;
  const screenY = display.y + point.y * display.height;
  const width = Math.min(size, Math.max(1, display.width));
  const height = Math.min(size, Math.max(1, display.height));
  const maxX = display.x + display.width - width;
  const maxY = display.y + display.height - height;
  const x = Math.round(clamp(screenX - width / 2, display.x, maxX));
  const y = Math.round(clamp(screenY - height / 2, display.y, maxY));
  return {
    frame: { x, y, width: Math.round(width), height: Math.round(height) },
    local: {
      x: width === 0 ? 0.5 : (screenX - x) / width,
      y: height === 0 ? 0.5 : (screenY - y) / height,
      label: point.label,
    },
  };
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}
