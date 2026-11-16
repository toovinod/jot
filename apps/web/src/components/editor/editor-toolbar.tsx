"use client";
import {
  ArrowLeft,
  Check,
  ClockCounterClockwise,
  CloudArrowUp,
  Eye,
  PaintBrush,
  PaperPlaneTilt,
  PencilSimpleLine,
  Sparkle,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { JotMark } from "../brand/logo";
import { Button } from "../ui/button";
import { useEditorController } from "./editor-controller";
export function EditorToolbar() {
  const {
    busy,
    uploads,
    navigateTo,
    saveState,
    panel,
    setPanel,
    loadPublicationHistory,
    preview,
    setPreview,
    publishOpen,
    setPublishOpen,
    post,
  } = useEditorController();
  return (
    <>
      <header className="sticky top-0 z-30 flex min-h-[68px] flex-wrap items-center justify-between gap-3 border-b border-border bg-white/90 px-4 py-3 backdrop-blur-md md:px-7">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Save and return to library"
            disabled={busy || uploads > 0}
            onClick={() => navigateTo("/dashboard")}
          >
            <ArrowLeft weight="bold" />
          </Button>
          <a
            href="/"
            onClick={(e) => {
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              navigateTo("/");
            }}
            className="inline-flex items-center gap-1.5 font-display text-xl font-extrabold tracking-[-0.05em]"
          >
            <JotMark className="size-6 text-ink" />
            jot
          </a>
          <span className="hidden text-muted-foreground sm:inline">/</span>
          <span
            role="status"
            aria-live="polite"
            className={cn(
              "sr-only items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium sm:not-sr-only sm:inline-flex",
              saveState.error || saveState.dirty
                ? "bg-[#fff1c7] text-[#8a6200]"
                : saveState.saving
                  ? "bg-sky-soft text-sky-deep"
                  : "bg-[#dff5e3] text-[#22803a]",
            )}
          >
            {saveState.error ? (
              "Unsaved changes"
            ) : saveState.saving ? (
              <>
                <CloudArrowUp
                  size={13}
                  weight="bold"
                  className="animate-pulse motion-reduce:animate-none"
                />
                Saving…
              </>
            ) : saveState.dirty ? (
              "Unsaved changes"
            ) : (
              <>
                <Check size={13} weight="bold" />
                All changes saved
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <Button
            size="sm"
            variant="ghost"
            className={cn(panel === "appearance" && "bg-sky-soft text-sky-deep")}
            disabled={busy}
            aria-expanded={panel === "appearance"}
            aria-label="Customize"
            onClick={() => setPanel(panel === "appearance" ? null : "appearance")}
          >
            <PaintBrush weight={panel === "appearance" ? "fill" : "bold"} />
            <span className="hidden sm:inline">Customize</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={cn(panel === "ai" && "bg-sky-soft text-sky-deep")}
            disabled={busy}
            aria-expanded={panel === "ai"}
            aria-label="Assist"
            onClick={() => setPanel(panel === "ai" ? null : "ai")}
          >
            <Sparkle weight={panel === "ai" ? "fill" : "bold"} />
            <span className="hidden sm:inline">Assist</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className={cn(panel === "history" && "bg-sky-soft text-sky-deep")}
            disabled={busy}
            aria-label="Publication history"
            aria-expanded={panel === "history"}
            onClick={() => {
              setPanel(panel === "history" ? null : "history");
              void loadPublicationHistory();
            }}
          >
            <ClockCounterClockwise weight={panel === "history" ? "fill" : "bold"} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || uploads > 0}
            aria-label={preview ? "Edit" : "Preview"}
            onClick={() => setPreview((value) => !value)}
          >
            {preview ? <PencilSimpleLine weight="bold" /> : <Eye weight="bold" />}
            <span className="hidden sm:inline">{preview ? "Edit" : "Preview"}</span>
          </Button>
          <Button
            size="sm"
            disabled={busy || uploads > 0}
            aria-expanded={publishOpen}
            onClick={() => setPublishOpen((value) => !value)}
          >
            <PaperPlaneTilt weight="fill" />
            {post.published ? "Update" : "Publish"}
          </Button>
        </div>
      </header>
    </>
  );
}
