import { paintPixels, seeded } from "./pixel";

// Painted pixel skies: banded blue that steps lighter toward the horizon, soft clouds, a sun,
// rolling hills with broken edges, and optional edges that crumble into the page.

const skyBands = ["#1f7ee0", "#2a90ee", "#36a3f7", "#4bb5fc", "#70c6ff", "#9bd8ff"];
const hillPaint = [
  { color: "#93e07a", shade: "#86d76c", light: "#c4f2b0" },
  { color: "#4cc35e", shade: "#43b554", light: "#7fdc85" },
  { color: "#29a24b", shade: "#239343", light: "#46bb60" },
];
const cloudShape = [
  "     ######       ",
  "   ##########     ",
  " ################ ",
  "##################",
  "  cccccccccccccc  ",
];
const smallCloud = ["   ####   ", " ######## ", "##########", "  cccccc  "];

export function paintSky({
  cols,
  rows,
  horizon,
  hills,
  clouds = [],
  sun,
  fringeTop = 0,
  fringeBottom = 0,
  seed = 5,
}: {
  cols: number;
  rows: number;
  /** Row where the sky reaches its lightest band. */
  horizon: number;
  /** Top row of each hill layer, back to front. */
  hills: number[];
  clouds?: { row: number; col: number; small?: boolean }[];
  sun?: { row: number; col: number; radius: number };
  fringeTop?: number;
  fringeBottom?: number;
  seed?: number;
}) {
  const wave = seeded(seed);
  const phases = hills.map(() => [wave() * 6, wave() * 6]);
  const hillTop = (layer: number, col: number) =>
    hills[layer] +
    Math.round(
      3.2 * Math.sin(col / (19 + layer * 7) + phases[layer][0]) +
        1.6 * Math.sin(col / (7 + layer * 2) + phases[layer][1]),
    );
  const bandHeight = horizon / skyBands.length;

  return paintPixels(
    cols,
    rows,
    (row, col, random) => {
      const roll = random();
      if (row < fringeTop && roll > ((row + 1) / (fringeTop + 1)) ** 1.3) return "";
      const fromBottom = rows - 1 - row;
      if (fromBottom < fringeBottom && roll > ((fromBottom + 1) / (fringeBottom + 1)) ** 1.3)
        return "";

      for (let layer = hills.length - 1; layer >= 0; layer--) {
        const top = hillTop(layer, col);
        // Broken edges: the row above a hill sometimes catches its color, the top row sometimes misses.
        if (row === top - 1 && random() < 0.3) return hillPaint[layer].light;
        if (row >= top) {
          if (row === top && random() < 0.25) continue;
          if (row <= top + 1) return hillPaint[layer].light;
          return random() < 0.08 ? hillPaint[layer].shade : hillPaint[layer].color;
        }
      }

      for (const cloud of clouds) {
        const cell = (cloud.small ? smallCloud : cloudShape)[row - cloud.row]?.[col - cloud.col];
        if (cell === "#") return "#ffffff";
        if (cell === "c") return "#fff1c2";
      }
      if (sun) {
        const distance = Math.hypot(row - sun.row, (col - sun.col) * 1);
        if (distance < sun.radius * 0.62) return "#fff6c4";
        if (distance < sun.radius) return "#ffe27a";
        if (distance < sun.radius * 1.3 && random() < 0.45) return "#ffe9a3";
      }

      const position = Math.min(row, horizon - 1) / bandHeight;
      const band = Math.floor(position);
      // Dither the last third of each band into the next one, so steps read as painted.
      const into = position - band;
      const next = into > 0.66 && random() < (into - 0.66) * 2.4 ? 1 : 0;
      return skyBands[Math.min(skyBands.length - 1, band + next)];
    },
    seed,
  );
}

/** The painted sky used inside rounded frames on the landing page. */
export const frameSky = {
  cols: 200,
  rows: 130,
  cells: paintSky({
    cols: 200,
    rows: 130,
    horizon: 100,
    hills: [100, 110, 119],
    clouds: [
      { row: 10, col: 8 },
      { row: 5, col: 92, small: true },
      { row: 30, col: 150, small: true },
    ],
    sun: { row: 0, col: 192, radius: 20 },
    seed: 13,
  }),
};
