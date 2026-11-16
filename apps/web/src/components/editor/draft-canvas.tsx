"use client";
import { Upload } from "lucide-react";
import { cn, slugify } from "@/lib/utils";
import { Article } from "../document";
import { RichEditor } from "./rich-editor";
import { useEditorController } from "./editor-controller";
export function DraftCanvas() {
  const {
    busy,
    uploads,
    preview,
    snapshot,
    post,
    updateDraft,
    cover,
    uploadCover,
    words,
    editorKey,
    beginPendingWork,
    isOperationBlocked,
  } = useEditorController();
  const disabled = busy;
  return (
    <>
      <main className="min-w-0 flex-1">
        {preview ? (
          <Article snapshot={snapshot} author={post.author} publishedAt={post.publishedAt} />
        ) : (
          <div
            className={cn(
              "mx-auto px-6 py-12 sm:px-10 sm:py-16",
              snapshot.appearance.width === "narrow"
                ? "max-w-2xl"
                : snapshot.appearance.width === "wide"
                  ? "max-w-5xl"
                  : "max-w-3xl",
              snapshot.appearance.font === "serif"
                ? "font-serif"
                : snapshot.appearance.font === "mono"
                  ? "font-mono"
                  : "font-sans",
            )}
          >
            <div className="mb-10">
              <p className="mb-7 font-sans text-[10px] uppercase tracking-[.18em] text-muted-foreground">
                {post.published ? "A new draft of your published story" : "A little room to begin"}
              </p>
              <label className="sr-only" htmlFor="story-title">
                Story title
              </label>
              <textarea
                id="story-title"
                value={snapshot.title}
                rows={2}
                maxLength={200}
                placeholder="An untitled thought"
                disabled={disabled}
                onChange={(e) => {
                  const title = e.target.value.replace(/\n/g, "");
                  updateDraft({
                    title,
                    ...(!(post.reservedSlug || post.published?.slug) &&
                    (!snapshot.slug || snapshot.slug === slugify(snapshot.title))
                      ? { slug: slugify(title) }
                      : {}),
                  });
                }}
                className="w-full resize-none bg-transparent text-4xl leading-[1.15] tracking-tight outline-none placeholder:text-muted-foreground/40 sm:text-5xl"
              />
              <label className="sr-only" htmlFor="story-subtitle">
                Story subtitle
              </label>
              <textarea
                id="story-subtitle"
                value={snapshot.subtitle}
                rows={2}
                maxLength={500}
                disabled={disabled}
                onChange={(e) => updateDraft({ subtitle: e.target.value })}
                placeholder="A subtitle, if the thought needs a little more room…"
                className="mt-4 w-full resize-none bg-transparent text-xl leading-8 text-muted-foreground outline-none placeholder:text-muted-foreground/40"
              />
              <div className="mt-4 flex flex-wrap items-center gap-4 font-sans text-xs text-muted-foreground">
                <label
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-2 rounded hover:text-primary focus-within:ring-2 focus-within:ring-ring",
                    (disabled || uploads > 0) && "pointer-events-none opacity-40",
                  )}
                >
                  <Upload size={14} />
                  {cover ? "Replace cover" : "Add a cover image"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif"
                    disabled={disabled || uploads > 0}
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadCover(file);
                    }}
                  />
                </label>
                {cover && (
                  <button disabled={disabled} onClick={() => updateDraft({ cover: "" })}>
                    Remove cover
                  </button>
                )}
                <span className="ml-auto">
                  {words} words · {Math.max(1, Math.ceil(words / 220))} min read
                </span>
              </div>
              {cover && (
                <img
                  src={cover}
                  alt="Story cover"
                  className="mt-7 max-h-96 w-full rounded-xl object-cover"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>
            <RichEditor
              key={editorKey}
              document={snapshot.content}
              onChange={(content) => updateDraft({ content })}
              disabled={disabled}
              beginPendingWork={beginPendingWork}
              isOperationBlocked={isOperationBlocked}
            />
          </div>
        )}
      </main>
    </>
  );
}
