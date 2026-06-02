"use client";

// Zoom control for the mockup preview. Lives in its own file (separate from
// MockupCanvas) so it can be imported statically without pulling the heavy
// renderMockup string-builder into the route's first-load JS — MockupCanvas
// itself is loaded dynamically.
export const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function ZoomBar({
  zoom,
  setZoom,
}: {
  zoom: number;
  setZoom: (z: number) => void;
}) {
  function step(dir: -1 | 1) {
    const i = ZOOMS.indexOf(zoom);
    setZoom(ZOOMS[Math.min(ZOOMS.length - 1, Math.max(0, (i < 0 ? 2 : i) + dir))]);
  }
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => step(-1)}
        className="rounded border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
        aria-label="Zoom out"
      >
        −
      </button>
      <button
        onClick={() => setZoom(1)}
        className="min-w-12 rounded px-1 text-center text-xs text-neutral-400 hover:text-neutral-200"
        title="Reset to 100%"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        onClick={() => step(1)}
        className="rounded border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
        aria-label="Zoom in"
      >
        +
      </button>
    </div>
  );
}
