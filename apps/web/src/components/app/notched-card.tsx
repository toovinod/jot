import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** The pastel stripes from the landing's how-it-works stops. */
export const stripes = {
  sky: "bg-[#bfe6ff]",
  sun: "bg-[#ffe98a]",
  rose: "bg-[#ffc2d6]",
  grass: "bg-[#c4f2b0]",
  violet: "bg-[#d9ccff]",
} as const;
export type Stripe = keyof typeof stripes;

/**
 * A card with stepped pixel corners. `white` draws a 1px stepped hairline around a white face;
 * `tint` is the soft grey fill the landing uses on white. An optional stripe runs along the bottom;
 * leave room for it with bottom padding (pb-7 or more).
 * `<NotchedCard stripe="sun" className="p-5 pb-8">...</NotchedCard>`
 */
export function NotchedCard({
  tone = "white",
  stripe,
  className,
  children,
  ...props
}: ComponentProps<"div"> & { tone?: "white" | "tint"; stripe?: Stripe }) {
  return (
    <div
      data-slot="notched-card"
      className={cn(
        "notched relative isolate",
        tone === "white"
          ? "bg-border before:absolute before:inset-px before:-z-10 before:bg-white before:notched"
          : "bg-foreground/[0.045]",
        className,
      )}
      {...props}
    >
      {children}
      {stripe && (
        <span
          aria-hidden="true"
          className={cn("absolute inset-x-1.5 bottom-1.5 h-1.5", stripes[stripe])}
        />
      )}
    </div>
  );
}
