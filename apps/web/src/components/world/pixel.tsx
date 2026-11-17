import { cn } from "@/lib/utils";

export function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
}

// Paints a grid cell by cell, then merges runs of one color into a single path per color,
// so a large scene stays a handful of SVG nodes. An empty string leaves the cell clear.
export function paintPixels(
  cols: number,
  rows: number,
  colorAt: (row: number, col: number, random: () => number) => string,
  seed = 7,
) {
  const random = seeded(seed);
  const paths = new Map<string, string>();
  for (let row = 0; row < rows; row++) {
    let run = null as { color: string; from: number } | null;
    for (let col = 0; col <= cols; col++) {
      const color = col < cols ? colorAt(row, col, random) : "";
      if (run?.color === color) continue;
      if (run)
        paths.set(
          run.color,
          (paths.get(run.color) ?? "") + `M${run.from} ${row}h${col - run.from}v1H${run.from}z`,
        );
      run = color ? { color, from: col } : null;
    }
  }
  return [...paths];
}

export function PixelArt({
  cols,
  rows,
  cells,
  fit = "none",
  soft = false,
  className,
}: {
  cols: number;
  rows: number;
  cells: [string, string][];
  fit?: "none" | "cover";
  /** A slight blur so the pixels read as painted rather than printed. */
  soft?: boolean;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${cols} ${rows}`}
      preserveAspectRatio={fit === "cover" ? "xMidYMax slice" : "none"}
      shapeRendering="crispEdges"
      className={cn("absolute inset-0 size-full", soft && "[filter:blur(0.6px)]", className)}
    >
      {cells.map(([color, d]) => (
        <path key={color} d={d} fill={color} />
      ))}
    </svg>
  );
}
