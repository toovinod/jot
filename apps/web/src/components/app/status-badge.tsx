import type { ReactNode } from "react";
import { Clock, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/utils";
import { ink, raised } from "./pill";

export type PageStatus = "draft" | "live" | "unlisted" | "scheduled" | "failed";

// White landing labels with ink text; a thin tinted ring and a saturated dot or icon tell them apart.
const looks: Record<PageStatus, { ring: string; mark: string; label: string; text?: string }> = {
  live: { ring: "ring-[#45bd5f]/40", mark: ink.grass, label: "live" },
  unlisted: { ring: "ring-[#a78bfa]/45", mark: ink.violet, label: "unlisted" },
  scheduled: { ring: "ring-[#3fa9ff]/40", mark: ink.sky, label: "scheduled" },
  draft: { ring: "ring-[#ffb020]/55", mark: "#ffb020", label: "draft" },
  failed: {
    ring: "ring-destructive/35",
    mark: "var(--destructive)",
    label: "schedule failed",
    text: "text-destructive",
  },
};

/**
 * A small pill naming where a page stands. Children replace the default label.
 * `<StatusBadge status="scheduled">scheduled nov 20</StatusBadge>`
 */
export function StatusBadge({
  status,
  children,
  title,
  className,
}: {
  status: PageStatus;
  children?: ReactNode;
  /** Hover text, such as the reason a scheduled publish failed. */
  title?: string;
  className?: string;
}) {
  const look = looks[status];
  const Icon = status === "scheduled" ? Clock : status === "failed" ? WarningCircle : null;
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full pl-2 pr-2.5 text-xs font-medium ring-1 ring-inset",
        raised,
        look.ring,
        look.text ?? "text-ink",
        className,
      )}
    >
      {Icon ? (
        <Icon
          weight={status === "failed" ? "fill" : "bold"}
          aria-hidden="true"
          className="size-3.5"
          style={{ color: look.mark }}
        />
      ) : (
        <span aria-hidden="true" className="relative flex size-2">
          {status === "live" && (
            <span className="absolute inset-0 animate-ping rounded-full bg-grass-2 opacity-60 motion-reduce:animate-none" />
          )}
          <span
            className={cn(
              "size-2 rounded-full",
              status === "draft" && "shadow-[inset_0_0_0_1px_rgba(150,90,0,.35)]",
            )}
            style={{ background: look.mark }}
          />
        </span>
      )}
      {children ?? look.label}
    </span>
  );
}
