import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/** Jot's cast: small paper things with faces. Each one stands for a part of the product. */
const cast = {
  page: {
    color: "#ffd34d",
    body: "M10 6h20l8 8v28H10Z",
    detail: "M30 6v8h8",
    eyes: [19, 24, 29, 24],
  },
  plane: {
    color: "#a6dcff",
    body: "M3 23 45 5 35 43 22 31Z",
    detail: "M45 5 22 31",
    eyes: [30, 29, 37, 24],
  },
  letter: {
    color: "#ff9ec4",
    body: "M6 12h36v26H6Z",
    detail: "m6 12 18 13 18-13",
    eyes: [16, 31, 32, 31],
  },
  book: {
    color: "#86dd78",
    body: "M24 12C18 8 10 8 5 10v27c5-2 13-2 19 2 6-4 14-4 19-2V10c-5-2-13-2-19 2Z",
    detail: "M24 12v27",
    eyes: [14, 22, 34, 22],
  },
  heart: {
    color: "#f43f75",
    body: "M24 41C10 31 5 24 5 17a9.5 9.5 0 0 1 19-3 9.5 9.5 0 0 1 19 3c0 7-5 14-19 24Z",
    detail: "",
    eyes: [18, 21, 30, 21],
  },
  star: {
    color: "#ffb020",
    body: "M24 4l5.9 12 13.1 1.9-9.5 9.3 2.3 13.1L24 34.1l-11.8 6.2 2.3-13.1L5 17.9l13.1-1.9Z",
    detail: "",
    eyes: [20, 22, 28, 22],
  },
  bookmark: {
    color: "#a78bfa",
    body: "M13 5h22v38l-11-8-11 8Z",
    detail: "",
    eyes: [20, 18, 28, 18],
  },
  pencil: {
    color: "#ff9a5c",
    body: "M14 12a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v20L24 45 14 32Z",
    detail: "M14 14h20M14 32h20M20 40h8",
    eyes: [19, 23, 29, 23],
  },
  cup: {
    color: "#7fd6c2",
    body: "M9 16h26v16a10 10 0 0 1-10 10h-6A10 10 0 0 1 9 32Z",
    detail: "M35 20h3a5 5 0 0 1 0 10h-3M18 3c-2 3 2 5 0 8M26 3c-2 3 2 5 0 8",
    eyes: [17, 25, 27, 25],
  },
  cloud: {
    color: "#ffffff",
    body: "M12 38h25a9 9 0 0 0 1-18 12 12 0 0 0-23-3A10 10 0 0 0 12 38Z",
    detail: "",
    eyes: [21, 28, 30, 28],
  },
} as const;

export type CritterKind = keyof typeof cast;
export const critterKinds = Object.keys(cast) as CritterKind[];
export const critterColor = (kind: CritterKind) => cast[kind].color;

export function Critter({
  kind,
  color,
  className,
  blinkDelay = 0,
  style,
}: {
  style?: CSSProperties;
  kind: CritterKind;
  color?: string;
  className?: string;
  blinkDelay?: number;
}) {
  const part = cast[kind];
  const [lx, ly, rx, ry] = part.eyes;
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={cn("size-8 shrink-0 overflow-visible", className)}
      style={style}
    >
      <path
        d={part.body}
        fill={color ?? part.color}
        stroke="#16140f"
        strokeWidth="2.5"
        strokeLinejoin="round"
        className="transition-[fill] duration-300"
      />
      {part.detail && (
        <path
          d={part.detail}
          fill="none"
          stroke="#16140f"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      )}
      <g
        className="animate-[blink_4.5s_infinite] motion-reduce:animate-none"
        style={{
          transformBox: "fill-box",
          transformOrigin: "center",
          animationDelay: `${blinkDelay}s`,
        }}
      >
        <ellipse cx={lx} cy={ly} rx="2" ry="2.6" fill="#16140f" />
        <ellipse cx={rx} cy={ry} rx="2" ry="2.6" fill="#16140f" />
      </g>
      <circle cx={lx - 3.5} cy={ly + 4} r="1.6" fill="#ff7aa2" opacity=".55" />
      <circle cx={rx + 3.5} cy={ry + 4} r="1.6" fill="#ff7aa2" opacity=".55" />
    </svg>
  );
}
