"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";
import type { Post } from "@jot/contracts";
import { Copy, DownloadSimple } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  EditorProvider,
  markdownFileName,
  markdownOf,
  useEditorController,
} from "./editor-controller";
import { EditorToolbar } from "./editor-toolbar";
import { RecoveryNotice } from "./recovery-notice";
import { SaveNotice } from "./save-notice";
import { DraftCanvas, columnWidths } from "./draft-canvas";
import { EditorSidebar } from "./editor-sidebar";
import { PagesColumn } from "./pages-pane";
import { pageStatus } from "./publication-panel";
import { PromptDock } from "./prompt-box";
import { chip, hues, keepChoice, pageLine, readChoice, useWide } from "./page-look";

export function EditorWorkspace({ initial }: { initial: Post }) {
  return (
    <EditorProvider initial={initial}>
      <Workspace />
    </EditorProvider>
  );
}

const pagesKey = "jot:editor-pages",
  panelKey = "jot:editor-panel";
/** The light dot grid of the landing demo's center pane, which the writing sits directly on. */
export const dotted = "bg-[radial-gradient(var(--border)_1px,transparent_1px)] bg-[size:18px_18px]";

/** Whether the pages pane shows: a column wide screens remember, or a sheet on smaller ones. */
export function usePagesPane() {
  const wide = useWide();
  const [hidden, setHidden] = useState(() => readChoice(pagesKey) === "hidden");
  const [sheetOpen, setSheetOpen] = useState(false);
  return {
    open: wide ? !hidden : sheetOpen,
    setOpen(open: boolean) {
      if (!wide) return setSheetOpen(open);
      setHidden(!open);
      keepChoice(pagesKey, open ? null : "hidden");
    },
  };
}

/** Three panes filling the window, like the landing demo: the writer's pages, the page written
 * straight onto the dotted canvas under a slim strip with the prompt box pinned below it, and the page settings. */
function Workspace() {
  const {
    snapshot,
    preview,
    markdownView,
    post,
    busy,
    uploads,
    navigateTo,
    saveDraft,
    panel,
    showPanel,
  } = useEditorController();
  const wide = useWide();
  const pages = usePagesPane();
  const [toolbarSlot, setToolbarSlot] = useState<HTMLElement | null>(null);
  const editor = useRef<Editor | null>(null),
    scroller = useRef<HTMLElement>(null);
  // On wide screens the settings column shows unless the writer closed it last time.
  const restored = useRef(false);
  useEffect(() => {
    if (!wide) return;
    if (!restored.current) {
      restored.current = true;
      if (!panel && readChoice(panelKey) !== "closed") showPanel("appearance");
      return;
    }
    keepChoice(panelKey, panel ? null : "closed");
  }, [wide, panel]);
  const status = pageStatus(post);
  const column = cn("mx-auto w-full", columnWidths[snapshot.appearance.width]);
  return (
    <div className="flex h-svh overflow-hidden bg-white text-ink">
      <PagesColumn
        open={pages.open}
        onOpenChange={pages.setOpen}
        currentId={post.id}
        live={{
          title: snapshot.title,
          status,
          line: pageLine({
            status,
            views: post.views,
            scheduledAt: post.scheduledAt,
            updatedAt: post.updatedAt,
            shareToken: post.shareToken,
          }),
        }}
        navigate={navigateTo}
        prepare={saveDraft}
        disabled={busy || uploads > 0}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <EditorToolbar pages={{ open: pages.open, toggle: () => pages.setOpen(!pages.open) }} />
        <div className="relative z-20 shrink-0 bg-white">
          {!preview && (
            <div ref={setToolbarSlot} hidden={markdownView} className="border-b border-border" />
          )}
          <SaveNotice />
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* No sheet: the writing column sits on the dots themselves, with nothing around it. */}
          <main
            id="editor-view"
            ref={scroller}
            className={cn(
              "flex min-h-0 flex-1 flex-col overflow-y-auto bg-white",
              dotted,
              !preview && "px-5 pb-56 pt-10 sm:px-8 sm:pt-16",
            )}
          >
            <div className={cn(column, "mb-6 space-y-3 empty:hidden", preview && "px-5 pt-4")}>
              <RecoveryNotice />
            </div>
            {markdownView && <MarkdownView className={column} />}
            {/* Hidden, not unmounted, behind the .md view, so the page keeps its undo history. */}
            <div
              hidden={markdownView}
              className={cn(preview && "flex flex-1 flex-col [&>article]:flex-1")}
            >
              <DraftCanvas toolbarSlot={toolbarSlot} editorRef={editor} />
            </div>
          </main>
          <PromptDock editorRef={editor} scroller={scroller} className={column} hidden={preview} />
        </div>
      </div>
      <EditorSidebar />
    </div>
  );
}

/** The draft as the .md export writes it, read-only, with copy and download. */
function MarkdownView({ className }: { className: string }) {
  const { snapshot, downloadMarkdown } = useEditorController();
  const markdown = useMemo(() => markdownOf(snapshot), [snapshot]);
  const [copied, setCopied] = useState<"" | "copied" | "failed">("");
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(""), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  const action = cn(
    chip,
    "h-7 cursor-pointer px-2.5 text-xs outline-none transition-colors hover:bg-sky-soft focus-visible:ring-3 focus-visible:ring-sky/50",
  );
  return (
    <figure className={className}>
      <figcaption className="flex items-center gap-2 pb-4">
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {markdownFileName(snapshot)}
        </span>
        <button
          type="button"
          className={action}
          onClick={() =>
            void navigator.clipboard
              ?.writeText(markdown)
              .then(() => setCopied("copied"))
              .catch(() => setCopied("failed"))
          }
        >
          <Copy weight="bold" aria-hidden="true" className="size-3.5" style={{ color: hues.sky }} />
          <span role="status">
            {copied === "copied" ? "copied" : copied === "failed" ? "couldn't copy" : "copy"}
          </span>
        </button>
        <button type="button" className={action} onClick={downloadMarkdown}>
          <DownloadSimple
            weight="bold"
            aria-hidden="true"
            className="size-3.5"
            style={{ color: hues.grass }}
          />
          download
        </button>
      </figcaption>
      <pre
        aria-label="Markdown"
        tabIndex={0}
        className="-mx-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg px-2 font-mono text-[13px] leading-relaxed outline-none focus-visible:shadow-[0_0_0_2px_var(--sky)]"
      >
        {markdown}
      </pre>
    </figure>
  );
}
