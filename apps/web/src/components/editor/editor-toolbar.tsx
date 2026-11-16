"use client";
import {
  ArrowLeft,
  Check,
  Cloud,
  Paintbrush,
  Sparkles,
  History,
  PenLine,
  Eye,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
      <header className="sticky top-0 z-30 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur md:px-7">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Save and return to library"
            disabled={busy || uploads > 0}
            onClick={() => navigateTo("/dashboard")}
          >
            <ArrowLeft />
          </Button>
          <a
            href="/"
            onClick={(e) => {
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              navigateTo("/");
            }}
            className="text-lg font-black tracking-tight"
          >
            jot<span className="text-primary">.</span>
          </a>
          <span className="hidden text-muted-foreground sm:inline">/</span>
          <span
            role="status"
            aria-live="polite"
            className={cn(
              "sr-only items-center gap-1.5 text-[11px] sm:not-sr-only sm:inline-flex",
              saveState.error ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {saveState.error ? (
              "Unsaved changes"
            ) : saveState.saving ? (
              <>
                <Cloud size={13} />
                Saving…
              </>
            ) : saveState.dirty ? (
              "Unsaved changes"
            ) : (
              <>
                <Check size={13} />
                All changes saved
              </>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <Button
            size="sm"
            variant={panel === "appearance" ? "outline" : "ghost"}
            disabled={busy}
            aria-expanded={panel === "appearance"}
            aria-label="Customize"
            onClick={() => setPanel(panel === "appearance" ? null : "appearance")}
          >
            <Paintbrush />
            <span className="hidden sm:inline">Customize</span>
          </Button>
          <Button
            size="sm"
            variant={panel === "ai" ? "outline" : "ghost"}
            disabled={busy}
            aria-expanded={panel === "ai"}
            aria-label="Assist"
            onClick={() => setPanel(panel === "ai" ? null : "ai")}
          >
            <Sparkles />
            <span className="hidden sm:inline">Assist</span>
          </Button>
          <Button
            size="sm"
            variant={panel === "history" ? "outline" : "ghost"}
            disabled={busy}
            aria-label="Publication history"
            aria-expanded={panel === "history"}
            onClick={() => {
              setPanel(panel === "history" ? null : "history");
              void loadPublicationHistory();
            }}
          >
            <History />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy || uploads > 0}
            aria-label={preview ? "Edit" : "Preview"}
            onClick={() => setPreview((value) => !value)}
          >
            {preview ? <PenLine /> : <Eye />}
            <span className="hidden sm:inline">{preview ? "Edit" : "Preview"}</span>
          </Button>
          <Button
            size="sm"
            disabled={busy || uploads > 0}
            aria-expanded={publishOpen}
            onClick={() => setPublishOpen((value) => !value)}
          >
            <Send />
            {post.published ? "Update" : "Publish"}
          </Button>
        </div>
      </header>
    </>
  );
}
