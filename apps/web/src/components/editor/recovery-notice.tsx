"use client";
import { ClockCounterClockwise, WarningCircle } from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { useEditorController } from "./editor-controller";
export function RecoveryNotice() {
  const { recovery, recoveryWarning, recoverLocalDraft, discardLocalDraft, downloadRecovery } =
    useEditorController();
  return (
    <>
      {recovery && (
        <div role="status" className="rounded-xl bg-[#fff8e1] px-4 py-3.5 font-sans">
          <div className="flex gap-3">
            <ClockCounterClockwise
              weight="bold"
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0 text-[#9a6700]"
            />
            <div className="min-w-0 flex-1 space-y-2.5">
              <div>
                <h2 className="text-sm font-medium">this browser has an unsaved local draft.</h2>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  the saved draft is shown below. bring back your local writing, or export it before
                  you discard it. if another session saved newer changes, you&apos;ll need to merge
                  them.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={recoverLocalDraft}>
                  recover local draft
                </Button>
                <Button size="sm" variant="outline" onClick={downloadRecovery}>
                  export local copy
                </Button>
                <Button size="sm" variant="ghost" onClick={discardLocalDraft}>
                  discard local copy
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      {recoveryWarning && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl bg-destructive/[0.06] px-4 py-2.5 font-sans text-sm text-destructive"
        >
          <WarningCircle weight="fill" aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {recoveryWarning}
        </p>
      )}
    </>
  );
}
