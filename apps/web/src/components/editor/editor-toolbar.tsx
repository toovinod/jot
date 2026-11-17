"use client";
import { useRef, type ComponentProps } from "react";
import { motion } from "motion/react";
import type { Icon } from "@phosphor-icons/react";
import {
  Check,
  CircleNotch,
  ClockCounterClockwise,
  Eye,
  PaintBrush,
  PaperPlaneTilt,
  SidebarSimple,
  SlidersHorizontal,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { IconButton } from "../app/toolbar";
import { Button } from "../ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";
import { useEditorController, type EditorPanel } from "./editor-controller";
import { chip, chipShadow, hues } from "./page-look";

export const panelTabs = [
  { id: "appearance", label: "look", name: "Look", icon: PaintBrush, color: hues.violet },
  { id: "publish", label: "publish", name: "Publish", icon: PaperPlaneTilt, color: hues.sky },
  { id: "ai", label: "assist", name: "Assist", icon: Sparkle, color: hues.rose },
  {
    id: "history",
    label: "history",
    name: "History",
    icon: ClockCounterClockwise,
    color: hues.grass,
  },
] as const satisfies readonly {
  id: EditorPanel;
  label: string;
  name: string;
  icon: Icon;
  color: string;
}[];

/** Where the draft stands with the server. A change waiting for autosave reads as saving: it
 * goes out within a second unless saving fails. */
function SaveStatus() {
  const { saveState } = useEditorController();
  const failed = !!saveState.error || (saveState.offline && saveState.dirty);
  const label = failed ? (
    <>
      <WarningCircle weight="fill" aria-hidden="true" className="size-3.5 text-destructive" />
      <span className="max-sm:sr-only">not saved</span>
    </>
  ) : saveState.saving || saveState.dirty ? (
    <>
      <CircleNotch
        weight="bold"
        aria-hidden="true"
        className="size-3.5 animate-spin text-[#1677c9] motion-reduce:animate-none"
      />
      <span className="max-sm:sr-only">saving</span>
    </>
  ) : (
    <>
      <Check weight="bold" aria-hidden="true" className="size-3.5 text-grass-3" />
      <span className="max-sm:sr-only">saved</span>
    </>
  );
  const pill = cn(chip, "h-7 whitespace-nowrap px-2.5 text-xs max-sm:px-2");
  return (
    <span role="status" aria-live="polite" className="flex shrink-0">
      {failed ? (
        // A failed save says why in the strip under the bar; this takes you to it.
        <button
          type="button"
          aria-controls="save-notice"
          title="see what went wrong"
          onClick={() => {
            const notice = document.getElementById("save-notice");
            notice?.scrollIntoView({ block: "nearest" });
            notice?.focus();
          }}
          className={cn(
            pill,
            "cursor-pointer outline-none transition-colors hover:bg-[#fff1f2] focus-visible:ring-3 focus-visible:ring-sky/50",
          )}
        >
          {label}
        </button>
      ) : (
        <span className={pill}>{label}</span>
      )}
    </span>
  );
}

/** An icon button with a hover and focus tip that repeats its name. */
function TipButton({
  label,
  children,
  ...props
}: ComponentProps<typeof IconButton> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <IconButton label={label} title={undefined} variant="ghost" {...props}>
          {children}
        </IconButton>
      </TooltipTrigger>
      <TooltipContent sideOffset={6}>{label.toLowerCase()}</TooltipContent>
    </Tooltip>
  );
}

const pill =
  "absolute inset-0 rounded-full bg-white shadow-[0_1px_0_rgba(0,0,0,.06),0_4px_12px_-4px_rgba(0,0,0,.18)]";
const views = [
  { id: "page", label: "page" },
  { id: "markdown", label: ".md" },
] as const;

/**
 * The strip over the page, as in the landing demo: the pages pane, page or .md on the left; the
 * save state, preview, the settings panel and publish on the right.
 */
export function EditorToolbar({
  pages,
}: {
  /** The pages pane's toggle, when the workspace has one. */
  pages?: { open: boolean; toggle: () => void };
}) {
  const {
    busy,
    uploads,
    panel,
    showPanel,
    preview,
    togglePreview,
    markdownView,
    showMarkdown,
    post,
  } = useEditorController();
  const leaving = busy || uploads > 0;
  // The settings button reopens the tab that was last showing.
  const lastPanel = useRef<EditorPanel>("appearance");
  if (panel) lastPanel.current = panel;
  const view = markdownView ? "markdown" : "page";
  function pick(id: (typeof views)[number]["id"]) {
    if (id === "markdown") showMarkdown(true);
    else if (preview) togglePreview();
    else showMarkdown(false);
  }
  return (
    <TooltipProvider delayDuration={300}>
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border bg-white px-1.5 sm:gap-2 sm:px-3">
        {pages && (
          <TipButton
            label={pages.open ? "Hide pages" : "Show pages"}
            aria-expanded={pages.open}
            aria-controls="editor-pages"
            onClick={pages.toggle}
            className="size-8"
          >
            <SidebarSimple weight="bold" />
          </TipButton>
        )}
        <div
          role="tablist"
          aria-label="View"
          // One stop in the tab order; the arrow keys move between page and .md.
          onKeyDown={(event) => {
            const index = views.findIndex((item) => item.id === view);
            const to = {
              ArrowRight: (index + 1) % views.length,
              ArrowLeft: (index - 1 + views.length) % views.length,
              Home: 0,
              End: views.length - 1,
            }[event.key];
            if (to === undefined || leaving) return;
            event.preventDefault();
            const target = views[to]!;
            pick(target.id);
            requestAnimationFrame(() =>
              document.getElementById(`editor-view-${target.id}`)?.focus(),
            );
          }}
          className="flex shrink-0 rounded-full bg-background p-1 text-[13px]"
        >
          {views.map((item) => {
            const on = view === item.id;
            return (
              <button
                key={item.id}
                id={`editor-view-${item.id}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls="editor-view"
                tabIndex={on ? 0 : -1}
                disabled={leaving}
                onClick={() => pick(item.id)}
                className={cn(
                  "relative cursor-pointer rounded-full px-2.5 py-1 outline-none sm:px-3 transition-colors focus-visible:ring-3 focus-visible:ring-sky/50 disabled:cursor-not-allowed",
                  item.id === "markdown" && "font-mono text-xs",
                  on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {on && <motion.span layoutId="editor-view" className={pill} />}
                <span className="relative">{item.label}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <SaveStatus />
          <button
            type="button"
            aria-label="Preview"
            aria-pressed={preview}
            title="how readers will see it"
            disabled={leaving}
            onClick={togglePreview}
            className={cn(
              "inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2 text-[13px] sm:px-2.5 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-sky/50 disabled:cursor-not-allowed disabled:opacity-50",
              preview ? cn("bg-white", chipShadow) : "hover:bg-sky-soft",
            )}
          >
            <Eye
              weight={preview ? "fill" : "bold"}
              aria-hidden="true"
              className="size-4 text-[#1677c9]"
            />
            <span className="max-md:sr-only">preview</span>
          </button>
          <TipButton
            label="Page settings"
            aria-expanded={!!panel}
            aria-controls="editor-panel"
            disabled={busy}
            onClick={() => showPanel(panel ? null : lastPanel.current)}
            className={cn("size-8", panel && "bg-sky-soft text-sky-deep")}
          >
            <SlidersHorizontal weight="bold" />
          </TipButton>
          <Button
            size="sm"
            variant="sky"
            disabled={leaving}
            aria-expanded={panel === "publish"}
            aria-controls="editor-panel"
            onClick={() => showPanel(panel === "publish" ? null : "publish")}
            // Under 640px only the icon shows, so the strip fits a 320px screen.
            className="h-8 max-sm:w-8 max-sm:px-0"
          >
            <PaperPlaneTilt weight="fill" />
            <span className="max-sm:sr-only">{post.published ? "update" : "publish"}</span>
          </Button>
        </div>
      </header>
    </TooltipProvider>
  );
}
