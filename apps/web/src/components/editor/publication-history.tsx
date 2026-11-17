"use client";
import { Trash } from "@phosphor-icons/react";
import { cn, date } from "@/lib/utils";
import { Button } from "../ui/button";
import { Skeleton } from "../ui/skeleton";
import { Critter } from "../world/critters";
import { useEditorController } from "./editor-controller";
export function PublicationHistory() {
  const { busy, uploads, revisionLoading, revisions, restoreRevision, deletePost } =
    useEditorController();
  const disabled = busy || uploads > 0;
  return (
    <section aria-label="History" className="space-y-5">
      {revisionLoading ? (
        <div role="status" className="space-y-2">
          <span className="sr-only">loading editions</span>
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : !revisions.length ? (
        <div className="flex gap-2.5 rounded-xl bg-background p-3 text-sm leading-6 text-muted-foreground">
          <Critter kind="book" className="size-6 shrink-0" />
          publish once and every edition is kept here.
        </div>
      ) : (
        <ol className="relative space-y-1 before:absolute before:bottom-5 before:left-[19px] before:top-5 before:w-0.5 before:bg-border">
          {revisions.map((revision, i) => (
            <li
              key={revision.id}
              className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-background"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "size-3 shrink-0 rounded-full border-2 border-white ring-1",
                  i === 0 ? "bg-grass-2 ring-grass-2" : "bg-white ring-border",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="block text-sm">
                  edition {revision.number}{" "}
                  <span className="text-muted-foreground">· {date(revision.createdAt)}</span>
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {revision.title || "untitled"}
                </span>
              </span>
              <button
                type="button"
                disabled={disabled}
                aria-label={`Restore edition ${revision.number} into the draft`}
                onClick={() => restoreRevision(revision.id)}
                className="shrink-0 cursor-pointer rounded-full bg-background px-2.5 py-1 text-xs outline-none transition-colors hover:bg-sky-soft focus-visible:ring-2 focus-visible:ring-sky disabled:cursor-not-allowed disabled:opacity-50"
              >
                restore
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="border-t border-dashed border-border pt-5">
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:bg-destructive/10"
          disabled={disabled}
          onClick={deletePost}
        >
          <Trash weight="bold" />
          delete this page
        </Button>
        <p className="mt-1 px-3.5 text-xs text-muted-foreground">
          removes the draft and every edition. this can&apos;t be undone.
        </p>
      </div>
    </section>
  );
}
