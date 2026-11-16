"use client";
import { Trash2 } from "lucide-react";
import { date } from "@/lib/utils";
import { Button } from "../ui/button";
import { useEditorController } from "./editor-controller";
export function PublicationHistory() {
  const { busy, uploads, revisionLoading, revisions, restoreRevision, deletePost } =
    useEditorController();
  const disabled = busy;
  return (
    <>
      <section>
        <h2 className="font-serif text-2xl">Earlier editions.</h2>
        <p className="mb-6 mt-3 text-xs leading-6 text-muted-foreground">
          Restore an edition into this draft. The live publication stays as it is until you publish
          again.
        </p>
        {revisionLoading ? (
          <p className="text-xs text-muted-foreground">Loading editions…</p>
        ) : !revisions.length ? (
          <p className="text-xs text-muted-foreground">
            Your first edition will appear when you publish.
          </p>
        ) : (
          revisions.map((revision) => (
            <div key={revision.id} className="border-b border-border py-4">
              <p className="text-sm">{revision.title}</p>
              <p className="mb-3 mt-1 text-xs text-muted-foreground">{date(revision.createdAt)}</p>
              <Button
                size="sm"
                variant="outline"
                disabled={disabled || uploads > 0}
                onClick={() => restoreRevision(revision.id)}
              >
                Restore into draft
              </Button>
            </div>
          ))
        )}
        <Button
          variant="ghost"
          className="mt-12 text-destructive"
          disabled={disabled || uploads > 0}
          onClick={deletePost}
        >
          <Trash2 />
          Delete story
        </Button>
      </section>
    </>
  );
}
