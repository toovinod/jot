"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type RefObject,
} from "react";
import type { Editor } from "@tiptap/react";
import { ImageSquare, Trash } from "@phosphor-icons/react";
import { cn, slugify } from "@/lib/utils";
import { Article } from "../document";
import { accents } from "./appearance-panel";
import { RichEditor, prependMarkdown } from "./rich-editor";
import { pasteIntoField } from "./field-paste";
import { useEditorController } from "./editor-controller";

// The writing column matches the published text column, so lines break where readers see them.
export const columnWidths = {
  narrow: "max-w-xl",
  standard: "max-w-2xl",
  wide: "max-w-4xl",
} as const;
const fonts = { serif: "font-serif", sans: "font-sans", mono: "font-mono" } as const;
const limits = { title: 200, subtitle: 500 } as const;
const imageTypes = "image/png,image/jpeg,image/gif,image/webp";

/** Grows a textarea to fit its text, so nothing it holds is ever hidden behind a scroll. While
 * the .md view hides the page it measures nothing, and it fits again once its width changes. */
function useAutoGrow(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const fit = () => {
      if (!element.isConnected || element.closest("[hidden]")) return;
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
    };
    fit();
    let width = element.offsetWidth;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => {
            if (element.offsetWidth === width) return;
            width = element.offsetWidth;
            fit();
          });
    observer?.observe(element);
    window.addEventListener("resize", fit);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", fit);
    };
  }, [value]);
  return ref;
}

export function DraftCanvas({
  toolbarSlot,
  editorRef,
}: {
  toolbarSlot?: HTMLElement | null;
  /** Receives the page's editor, for the prompt box that writes into it. */
  editorRef?: RefObject<Editor | null>;
}) {
  const {
    busy,
    uploads,
    preview,
    snapshot,
    post,
    updateDraft,
    cover,
    uploadCover,
    editorKey,
    beginPendingWork,
    isOperationBlocked,
    registerEditorFlush,
  } = useEditorController();
  const disabled = busy;
  const appearance = snapshot.appearance;
  const ownEditor = useRef<Editor | null>(null);
  const body = editorRef ?? ownEditor;
  const title = useAutoGrow(snapshot.title),
    subtitle = useAutoGrow(snapshot.subtitle);
  const [note, setNote] = useState<{ field: "title" | "subtitle"; text: string } | null>(null);
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 5000);
    return () => clearTimeout(timer);
  }, [note]);
  function setTitle(value: string) {
    updateDraft({
      title: value,
      ...(!(post.reservedSlug || post.published?.slug) &&
      (!snapshot.slug || snapshot.slug === slugify(snapshot.title))
        ? { slug: slugify(value) }
        : {}),
    });
  }
  /** A paste of several lines keeps its first line here and moves the rest to the top of the
   * page; a paste longer than the field's limit is cut to fit. Both say so in a quiet note. */
  function paste(field: "title" | "subtitle", event: ClipboardEvent<HTMLTextAreaElement>) {
    const element = event.currentTarget;
    const result = pasteIntoField(
      element.value,
      element.selectionStart,
      element.selectionEnd,
      event.clipboardData.getData("text/plain"),
      limits[field],
    );
    // Without the page to take the rest, the browser's own paste keeps every word.
    if (!result || (result.rest && !body.current)) return;
    event.preventDefault();
    if (field === "title") setTitle(result.value);
    else updateDraft({ subtitle: result.value });
    if (result.rest) prependMarkdown(body.current!, result.rest);
    requestAnimationFrame(() => element.setSelectionRange(result.caret, result.caret));
    const parts = [
      result.rest && "moved the rest into the page.",
      result.clipped && `the ${field} keeps its first ${limits[field]} characters.`,
    ].filter(Boolean);
    setNote({ field, text: parts.join(" ") });
  }
  if (preview)
    return <Article snapshot={snapshot} author={post.author} publishedAt={post.publishedAt} />;
  const subtitleLength = snapshot.subtitle.length;
  const coverInput = (
    <input
      type="file"
      accept={imageTypes}
      disabled={disabled || uploads > 0}
      className="sr-only"
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void uploadCover(file);
        event.target.value = "";
      }}
    />
  );
  const overlayButton =
    "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-white/95 px-3 text-xs font-medium text-foreground shadow-[0_0_0_1px_var(--border)] backdrop-blur outline-none transition-colors hover:bg-white focus-visible:ring-3 focus-visible:ring-sky/50 focus-within:ring-3 focus-within:ring-sky/50";
  return (
    <div
      className={cn("mx-auto w-full", columnWidths[appearance.width], fonts[appearance.font])}
      // Links, quotes and checkboxes take the page accent while you write, as they will when live.
      style={{ "--primary": accents[appearance.accent].color } as CSSProperties}
    >
      <div className="group/header relative mb-8">
        {cover ? (
          <figure className="group/cover relative mb-8">
            <img
              src={cover}
              alt="Story cover"
              className="max-h-[420px] w-full rounded-xl bg-muted object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute right-3 top-3 flex gap-2 font-sans opacity-0 transition-opacity group-hover/cover:opacity-100 group-focus-within/cover:opacity-100 [@media(hover:none)]:opacity-100">
              <label
                className={cn(
                  overlayButton,
                  (disabled || uploads > 0) && "pointer-events-none opacity-45",
                )}
              >
                <ImageSquare weight="bold" aria-hidden="true" className="size-3.5" />
                replace cover
                {coverInput}
              </label>
              <button
                type="button"
                disabled={disabled}
                onClick={() => updateDraft({ cover: "" })}
                className={cn(overlayButton, "hover:text-destructive disabled:opacity-45")}
              >
                <Trash weight="bold" aria-hidden="true" className="size-3.5" />
                remove cover
              </button>
            </div>
          </figure>
        ) : (
          // Out of the way until the pointer or keyboard reaches the header; always shown on touch.
          <label
            className={cn(
              "absolute -top-8 left-0 inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full px-2.5 font-sans text-xs font-medium text-muted-foreground opacity-0 outline-none transition-[opacity,background-color,color] hover:bg-sky-soft hover:text-foreground focus-within:opacity-100 focus-within:ring-3 focus-within:ring-sky/50 group-hover/header:opacity-100 group-focus-within/header:opacity-100 [@media(hover:none)]:opacity-100",
              (disabled || uploads > 0) && "pointer-events-none opacity-45",
            )}
          >
            <ImageSquare weight="bold" aria-hidden="true" className="size-3.5" />
            {uploads > 0 ? "uploading" : "add cover"}
            {coverInput}
          </label>
        )}
        <label className="sr-only" htmlFor="story-title">
          Story title
        </label>
        <textarea
          ref={title}
          id="story-title"
          value={snapshot.title}
          rows={1}
          maxLength={limits.title}
          placeholder="title"
          disabled={disabled}
          aria-describedby={note?.field === "title" ? "story-title-note" : undefined}
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))}
          onPaste={(e) => paste("title", e)}
          onKeyDown={(e) => {
            // Enter moves on to the subtitle instead of breaking the title.
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              document.getElementById("story-subtitle")?.focus();
            }
          }}
          className="block w-full resize-none overflow-hidden bg-transparent text-[clamp(2rem,1.6rem+1.6vw,2.75rem)] font-medium leading-[1.12] tracking-[-0.035em] outline-none placeholder:text-muted-foreground/75"
        />
        {note?.field === "title" && (
          <p
            id="story-title-note"
            role="status"
            className="mt-1 font-sans text-xs text-muted-foreground"
          >
            {note.text}
          </p>
        )}
        <label className="sr-only" htmlFor="story-subtitle">
          Story subtitle
        </label>
        <textarea
          ref={subtitle}
          id="story-subtitle"
          value={snapshot.subtitle}
          rows={1}
          maxLength={limits.subtitle}
          disabled={disabled}
          aria-describedby="story-subtitle-hint"
          onChange={(e) => updateDraft({ subtitle: e.target.value })}
          onPaste={(e) => paste("subtitle", e)}
          placeholder="subtitle"
          className="mt-2 block w-full resize-none overflow-hidden bg-transparent text-lg leading-[1.5] text-muted-foreground outline-none placeholder:text-base placeholder:text-muted-foreground/75"
        />
        <p
          id="story-subtitle-hint"
          role="status"
          className="mt-1 flex flex-wrap gap-x-3 font-sans text-xs text-muted-foreground empty:hidden"
        >
          {note?.field === "subtitle" && <span>{note.text}</span>}
          {subtitleLength >= limits.subtitle ? (
            <span className="text-[#9a6700]">
              subtitles stop at {limits.subtitle} characters. the rest can go in the page.
            </span>
          ) : (
            subtitleLength > 400 && (
              <span className="tabular-nums">
                {subtitleLength}/{limits.subtitle}
              </span>
            )
          )}
        </p>
      </div>
      <RichEditor
        key={editorKey}
        document={snapshot.content}
        onChange={(content) => updateDraft({ content })}
        disabled={disabled}
        beginPendingWork={beginPendingWork}
        isOperationBlocked={isOperationBlocked}
        registerFlush={registerEditorFlush}
        toolbarSlot={toolbarSlot}
        editorRef={body}
        onImportTitle={(value) => {
          if (snapshot.title.trim()) return false;
          setTitle(value.slice(0, limits.title));
          return true;
        }}
      />
    </div>
  );
}
