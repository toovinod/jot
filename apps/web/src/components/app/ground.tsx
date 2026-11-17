import { cn } from "@/lib/utils";
import { PixelArt, paintPixels, seeded } from "@/components/world/pixel";

const layers = [
  { color: "#93e07a", shade: "#86d76c", light: "#c4f2b0" },
  { color: "#4cc35e", shade: "#43b554", light: "#7fdc85" },
  { color: "#29a24b", shade: "#239343", light: "#46bb60" },
];
const COLS = 64;
const ROWS = 16;
const wave = seeded(31);
const tops = [5, 9, 12].map((top) => ({ top, phase: wave() * 6 }));

// Three rolling pixel hills with broken edges and nothing above them, so they sit on any background.
const cells = paintPixels(
  COLS,
  ROWS,
  (row, col, random) => {
    for (let layer = layers.length - 1; layer >= 0; layer--) {
      const top =
        tops[layer].top + Math.round(1.6 * Math.sin(col / (6 + layer * 4) + tops[layer].phase));
      const paint = layers[layer];
      if (row === top - 1 && random() < 0.3) return paint.light;
      if (row >= top) {
        if (row === top && random() < 0.25) continue;
        if (row <= top + 1) return paint.light;
        return random() < 0.08 ? paint.shade : paint.color;
      }
    }
    return "";
  },
  31,
);

/**
 * A strip of pixel hills with a clear sky, pinned to the bottom of its `relative` parent.
 * Set its height with className: `<Ground className="h-24" />`.
 */
export function Ground({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-16", className)}>
      <PixelArt cols={COLS} rows={ROWS} cells={cells} fit="cover" />
    </div>
  );
}
