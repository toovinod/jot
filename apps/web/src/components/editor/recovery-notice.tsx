"use client";
import { Button } from "../ui/button";
import { useEditorController } from "./editor-controller";
export function RecoveryNotice() {
  const { recovery, recoveryWarning, recoverLocalDraft, discardLocalDraft, downloadRecovery } =
    useEditorController();
  return (
    <>
      {recovery && (
        <section
          role="status"
          className="mx-auto my-5 max-w-4xl space-y-4 rounded-2xl border border-[#f5d77a] bg-[#fff8e0] p-5"
        >
          <h2 className="font-medium">This tab has an unsaved local draft.</h2>
          <p className="text-sm leading-6 text-muted-foreground">
            The saved server draft is shown below. Recover your local writing or export it before
            discarding. If another session saved newer changes, recovery will require you to merge
            them.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button size="sm" onClick={recoverLocalDraft}>
              Recover local draft
            </Button>
            <Button size="sm" variant="outline" onClick={downloadRecovery}>
              Export local copy
            </Button>
            <Button size="sm" variant="ghost" onClick={discardLocalDraft}>
              Discard local copy
            </Button>
          </div>
        </section>
      )}
      {recoveryWarning && (
        <p role="alert" className="mx-auto max-w-4xl px-5 py-4 text-sm text-destructive">
          {recoveryWarning}
        </p>
      )}
    </>
  );
}
