"use client";
import { useId, useRef, type ReactNode } from "react";
import { motion, useReducedMotionConfig } from "motion/react";
import { cn } from "@/lib/utils";
import { JotMark } from "@/components/brand/logo";
import { useParallax } from "./use-parallax";

export function Sun({ className }: { className?: string }) {
  return (
    <motion.div
      className={cn(
        "absolute size-64 rounded-full bg-[radial-gradient(circle,#fff6c4_0_38%,#ffe27a_39%_56%,rgba(255,226,122,.35)_57%_70%,transparent_71%)]",
        className,
      )}
      animate={{ scale: [1, 1.05, 1] }}
      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

export function Cloud({ className, depth = 6 }: { className?: string; depth?: number }) {
  return (
    <svg
      data-depth={depth}
      viewBox="0 0 150 60"
      className={cn("absolute w-36 drop-shadow-[0_6px_0_rgba(0,60,140,.12)]", className)}
    >
      <path
        d="M20 50h110a18 18 0 0 0 0-36 26 26 0 0 0-48-6 20 20 0 0 0-34 10A16 16 0 0 0 20 50Z"
        fill="#fff"
      />
    </svg>
  );
}

const hillLayers = [
  {
    d: "M0 110 C160 40 330 150 520 80 S860 30 1000 100 V250 H0Z",
    edge: "M0 112 C160 42 330 152 520 82 S860 32 1000 102",
    fill: "var(--grass-1)",
    stroke: "#c8f5b8",
    top: 0,
    depth: 4,
  },
  {
    d: "M0 160 C220 110 420 190 680 140 S920 130 1000 150 V250 H0Z",
    edge: "M0 162 C220 112 420 192 680 142 S920 132 1000 152",
    fill: "var(--grass-2)",
    stroke: "#8be38a",
    top: 0,
    depth: 8,
  },
  {
    d: "M0 210 C300 170 600 240 1000 190 V250 H0Z",
    edge: "",
    fill: "var(--grass-3)",
    stroke: "",
    top: 0,
    depth: 14,
  },
];

export function Hills({ layers = 3, className }: { layers?: 1 | 2 | 3; className?: string }) {
  return (
    <div className={cn("absolute inset-x-0 bottom-0 h-56", className)}>
      {hillLayers.slice(3 - layers).map((layer) => (
        <svg
          key={layer.d}
          data-depth={layer.depth}
          viewBox="0 0 1000 250"
          preserveAspectRatio="none"
          className="absolute inset-x-[-2%] bottom-0 h-full w-[104%]"
        >
          <path d={layer.d} fill={layer.fill} />
          {layer.edge && <path d={layer.edge} fill="none" stroke={layer.stroke} strokeWidth="5" />}
        </svg>
      ))}
    </div>
  );
}

export function House({
  door = "terra",
  className,
}: {
  door?: "terra" | "sky";
  className?: string;
}) {
  return (
    <svg viewBox="0 0 44 40" className={cn("absolute w-11", className)}>
      <path
        d="M4 18 22 4l18 14v20H4Z"
        fill="#fbf8f1"
        stroke="#16140f"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <rect
        x="17"
        y="24"
        width="10"
        height="14"
        fill={door === "terra" ? "var(--terra)" : "var(--sky)"}
      />
    </svg>
  );
}

export function Flyer({
  tag,
  className,
  delay = 0,
  size = "size-10",
}: {
  tag?: string;
  className?: string;
  delay?: number;
  size?: string;
}) {
  return (
    <motion.div
      className={cn("absolute flex items-center gap-1", className)}
      animate={{ x: [0, 22, 0], y: [0, -16, 0], rotate: [-6, 4, -6] }}
      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay }}
    >
      <JotMark className={cn("-rotate-[30deg] text-ink", size)} />
      {tag && (
        <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2.5 py-1.5 font-mono text-[11px] text-ink shadow-[0_3px_0_rgba(0,40,90,.18)]">
          <span className="size-1.5 rounded-full bg-grass-2" />
          {tag}
        </span>
      )}
    </motion.div>
  );
}

export function Bubble({ children, className }: { children: ReactNode; className?: string }) {
  const classes = cn(
    "absolute whitespace-nowrap rounded-[10px] bg-ink px-2.5 py-1.5 font-mono text-[11px] text-white after:absolute after:-bottom-[5px] after:left-3.5 after:border-x-[5px] after:border-t-[5px] after:border-x-transparent after:border-t-ink",
    className,
  );
  // Motion keeps opacity loops under reduced motion, so render the bubble still instead.
  if (useReducedMotionConfig()) return <div className={classes}>{children}</div>;
  return (
    <motion.div
      className={classes}
      animate={{ opacity: [0, 1, 1, 0], y: [6, 0, 0, 0], scale: [0.6, 1, 1, 1] }}
      transition={{ duration: 3.2, repeat: Infinity, times: [0, 0.25, 0.8, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function Grain() {
  const id = useId();
  return (
    <svg className="pointer-events-none absolute inset-0 size-full opacity-20 mix-blend-overlay">
      <filter id={id}>
        <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" stitchTiles="stitch" />
        <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 0" />
      </filter>
      <rect width="100%" height="100%" filter={`url(#${id})`} />
    </svg>
  );
}

export function Trail({
  d,
  viewBox,
  className,
}: {
  d: string;
  viewBox: string;
  className?: string;
}) {
  return (
    <svg
      viewBox={viewBox}
      preserveAspectRatio="none"
      className={cn("absolute inset-0 size-full", className)}
    >
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="6 7"
        vectorEffect="non-scaling-stroke"
        className="animate-[trail-dash_1.2s_linear_infinite] motion-reduce:animate-none"
      />
    </svg>
  );
}

const skyGradient =
  "bg-[linear-gradient(180deg,var(--sky-deep)_0%,var(--sky)_42%,var(--sky-mid)_78%,var(--sky-light)_100%)]";

export function SkyScene({
  variant,
  children,
  className,
  decor,
}: {
  variant: "hero" | "panel" | "banner" | "strip";
  children?: ReactNode;
  className?: string;
  decor?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useParallax(ref, variant === "hero");
  return (
    <div
      ref={ref}
      className={cn(
        "relative isolate overflow-hidden",
        variant === "strip"
          ? "bg-[linear-gradient(180deg,var(--background)_0%,var(--sky-light)_45%,var(--sky-mid)_100%)]"
          : skyGradient,
        variant !== "strip" && "text-white",
        className,
      )}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        {variant === "hero" && (
          <>
            <Sun className="-right-24 -top-28" />
            <Cloud className="left-[3%] top-24 w-28 opacity-90" depth={6} />
            <Cloud className="right-[8%] top-[46%] w-24 opacity-70" depth={10} />
            <Hills layers={3} className="h-64" />
          </>
        )}
        {variant === "panel" && (
          <>
            <Sun className="-right-20 -top-20 size-56" />
            <Cloud className="left-[8%] top-[18%] w-32" />
            <Cloud className="right-[12%] top-[38%] w-20 opacity-75" />
            <Hills layers={3} className="h-48" />
            <House className="bottom-24 right-[18%]" />
            <House door="sky" className="bottom-12 left-[20%] scale-90" />
          </>
        )}
        {variant === "banner" && (
          <>
            <Cloud className="right-[22%] top-6 w-24 opacity-80" />
            <Cloud className="right-[4%] top-14 w-16 opacity-60" />
            <svg
              viewBox="0 0 600 34"
              preserveAspectRatio="none"
              className="absolute inset-x-0 -bottom-px h-9 w-full"
            >
              <path d="M0 20 C120 0 260 34 400 14 S560 6 600 16 V34 H0Z" fill="var(--background)" />
            </svg>
          </>
        )}
        {variant === "strip" && <Hills layers={2} className="h-28" />}
        {decor}
        {variant !== "strip" && <Grain />}
      </div>
      {children}
    </div>
  );
}
