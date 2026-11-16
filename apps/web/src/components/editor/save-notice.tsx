"use client";
import Link from "next/link";
import { DownloadSimple } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { ErrorMessage } from "../ui/fields";
import { useEditorController } from "./editor-controller";
export function SaveNotice() {
  const { busy, saveState, error, downloadDraft, retrySave, reloadDraft } = useEditorController();
  return (
    <>
      {(saveState.error || error) && (
        <div className="mx-auto max-w-5xl space-y-3 px-5 pt-5">
          <ErrorMessage message={error || saveState.error} />
          {saveState.error && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <p className="flex-1 text-muted-foreground">
                {saveState.conflict
                  ? "Another session saved a newer draft. Your local writing is still here. Export it before reloading to merge your changes."
                  : "Your writing is kept on this page. Check your connection and retry before leaving."}
              </p>
              <Button size="sm" variant="outline" onClick={downloadDraft}>
                <DownloadSimple weight="bold" />
                Export draft
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={retrySave}>
                Retry save
              </Button>
              {saveState.conflict && (
                <Button size="sm" variant="outline" onClick={reloadDraft}>
                  Reload newer draft
                </Button>
              )}
            </div>
          )}
          {error.toLowerCase().includes("verif") && (
            <Link href="/settings" className="text-sm text-primary underline">
              Open settings to verify your email
            </Link>
          )}
        </div>
      )}
    </>
  );
}
