"use client";
import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const pages = [
  "M22 82 L33.6 24.2 Q34.6 20 38.8 19.2 L56.6 15.8 Q60.8 15.2 59.6 19.2 L52 40 Z",
  "M22 82 L39.2 41.2 Q41 37.2 45.2 36.4 L67.8 32.4 Q72 31.8 70.8 35.8 L63 54 Z",
  "M22 82 L44.2 56 Q46.8 53 50.4 52.6 L77.4 49.4 Q81.4 49.1 80.2 53 L72.2 72.2 Q70.6 75.2 67.2 75.6 Z",
];
const fanFrom = [26, 12, 0];

export function JotMark({
  variant = "outline",
  animate = false,
  className,
  title,
}: {
  variant?: "outline" | "filled";
  animate?: boolean;
  className?: string;
  title?: string;
}) {
  const outline = variant === "outline";
  return (
    <svg
      viewBox="0 0 100 100"
      className={cn("size-8 shrink-0 overflow-visible", className)}
      {...(title ? { role: "img" } : { "aria-hidden": true })}
    >
      {title && <title>{title}</title>}
      {pages.map((d, i) => (
        <motion.path
          key={d}
          d={d}
          fill={outline ? "var(--mark-fill, #fff)" : "currentColor"}
          stroke={outline ? "currentColor" : "var(--mark-gap, #fff)"}
          strokeWidth={outline ? 6 : 4}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ transformBox: "view-box", transformOrigin: "22px 82px" }}
          initial={animate && fanFrom[i] ? { rotate: fanFrom[i] } : false}
          animate={{ rotate: 0 }}
          transition={{ type: "spring", stiffness: 140, damping: 11, delay: 0.15 }}
        />
      ))}
    </svg>
  );
}

export function Brand({
  href = "/",
  className,
  animate = false,
}: {
  href?: string;
  className?: string;
  animate?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 font-display text-[22px] font-bold tracking-[-0.04em]",
        className,
      )}
    >
      <JotMark animate={animate} className="size-8" />
      <span>jot</span>
    </Link>
  );
}
