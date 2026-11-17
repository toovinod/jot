import { useSyncExternalStore } from "react";
import { cn, date } from "@/lib/utils";
import { critterKinds, type CritterKind } from "../world/critters";

// The width where the side panes become columns beside the page (Tailwind's lg).
const wideQuery = "(min-width: 1024px)";
export function useWide() {
  return useSyncExternalStore(
    (change) => {
      const list = window.matchMedia(wideQuery);
      list.addEventListener("change", change);
      return () => list.removeEventListener("change", change);
    },
    () => window.matchMedia(wideQuery).matches,
    () => true,
  );
}

/** A per-browser layout choice, such as a hidden pane; storage can be missing or blocked. */
export function readChoice(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function keepChoice(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

/** The landing's label style: a white pill with a soft shadow, as under "on the web". */
export const chipShadow = "shadow-[0_1px_0_rgba(0,0,0,.06),0_4px_12px_-4px_rgba(0,0,0,.18)]";
export const chip = cn(
  "inline-flex items-center gap-1.5 rounded-full bg-white text-ink [&_svg]:shrink-0",
  chipShadow,
);
/** Saturated brand colors for small bold icons, as the landing's labels use them. */
export const hues = {
  sky: "#1677c9",
  rose: "#ff4f8b",
  grass: "#23944c",
  violet: "#7c4dcc",
  sun: "#e09a00",
} as const;

export type PageState = "draft" | "live" | "unlisted" | "scheduled";

/** The same critter for a page wherever it shows, picked from its id across the whole cast. */
export function critterFor(id: string): CritterKind {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return critterKinds[hash % critterKinds.length]!;
}

/** A page's status in a few words: "live · 2,400 reads", "unlisted · link only". */
export function pageLine(page: {
  status: PageState;
  views?: number;
  scheduledAt?: string;
  updatedAt: string;
  shareToken?: string;
}) {
  if (page.status === "live") {
    const views = page.views || 0;
    return `live · ${views.toLocaleString("en")} ${views === 1 ? "read" : "reads"}`;
  }
  if (page.status === "unlisted") return "unlisted · link only";
  if (page.status === "scheduled" && page.scheduledAt)
    return `scheduled · ${date(page.scheduledAt).toLowerCase()}`;
  if (page.shareToken) return "draft · share link on";
  return `draft · ${date(page.updatedAt).toLowerCase()}`;
}

const dots: Record<PageState, string> = {
  live: "bg-grass-2",
  unlisted: "bg-sky",
  scheduled: "bg-sky-deep",
  draft: "bg-[#f5b400]",
};

/** The status dot from the landing demo; a live page's dot pings. */
export function StatusDot({ status }: { status: PageState }) {
  return (
    <span aria-hidden="true" className="relative flex size-1.5 shrink-0">
      {status === "live" && (
        <span className="absolute inset-0 animate-ping rounded-full bg-grass-2 opacity-60 motion-reduce:animate-none" />
      )}
      <span className={cn("size-1.5 rounded-full", dots[status])} />
    </span>
  );
}
