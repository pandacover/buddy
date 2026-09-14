import { useEffect, useState } from "react";
import type { PointerTarget } from "../shared/protocol";

export default function OverlayApp() {
  const [point, setPoint] = useState<PointerTarget | null>(null);

  useEffect(() => {
    const overlay = window.buddyOverlay;
    if (!overlay) return;
    const offShow = overlay.onShowPointer((next) => setPoint(next));
    const offHide = overlay.onHidePointer(() => setPoint(null));
    return () => {
      offShow();
      offHide();
    };
  }, []);

  if (!point) return null;

  const left = `${point.x * 100}%`;
  const top = `${point.y * 100}%`;
  const fromX = `${Math.max(0, point.x * 100 - 6)}%`;
  const fromY = `${Math.max(0, point.y * 100 - 8)}%`;

  return (
    <div className="relative h-full w-full">
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <marker
            id="buddy-arrow"
            markerWidth="10"
            markerHeight="10"
            refX="8"
            refY="3"
            orient="auto"
          >
            <polygon points="0 0, 10 3, 0 6" fill="#7c5cff" />
          </marker>
        </defs>
        <line
          x1={fromX}
          y1={fromY}
          x2={left}
          y2={top}
          stroke="#7c5cff"
          strokeWidth="3"
          markerEnd="url(#buddy-arrow)"
        />
      </svg>
      <div
        className="absolute h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-buddy-accent shadow-[0_0_0_10px_rgba(124,92,255,0.18)]"
        style={{ left, top }}
      />
      <div
        className="absolute -translate-x-1/2 rounded-full bg-buddy-bg/90 px-3 py-1 text-sm text-white shadow-lg"
        style={{ left, top: `calc(${top} + 42px)` }}
      >
        {point.label}
      </div>
    </div>
  );
}
