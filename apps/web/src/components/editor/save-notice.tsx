"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowClockwise,
  CloudSlash,
  DownloadSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { useEditorController } from "./editor-controller";

function Action({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-foreground outline-none transition-colors hover:bg-white focus-visible:ring-3 focus-visible:ring-sky/50 disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}

/**
 * One quiet line under the toolbar when saving or an action fails: what happened, and only the
 * actions that help. A save that can recover retries on its own and says so; a conflict offers
 * the newer draft.
 */
export function SaveNotice() {
  const { busy, saveState, error, downloadDraft, retrySave, reloadDraft, dismissError } =
    useEditorController();
  const offline = saveState.offline && saveState.dirty;
  const message = error
    ? error
    : saveState.conflict
      ? "another session saved a newer draft. your writing is still here; export it before reloading, then merge your changes."
      : saveState.error ||
        (offline ? "you're offline. saving resumes when you're back online." : "");
  if (!message) return null;
  const saveProblem = !error && (!!saveState.error || offline);
  const calm = saveProblem && (saveState.retrying || saveState.offline);
  const Icon = saveState.offline ? CloudSlash : saveState.retrying ? ArrowClockwise : WarningCircle;
  return (
    <div
      id="save-notice"
      tabIndex={-1}
      className={cn(
        "border-t px-4 py-1.5 font-sans text-sm outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-sky/50 sm:px-6",
        calm
          ? "border-sky/20 bg-sky-soft/70 text-sky-deep"
          : "border-destructive/15 bg-[#fff1f2] text-destructive",
      )}
    >
      <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-1">
        <p
          role={calm ? "status" : "alert"}
          className="flex min-w-0 flex-1 basis-60 items-center gap-2 leading-5"
        >
          <Icon weight={calm ? "bold" : "fill"} aria-hidden="true" className="size-4 shrink-0" />
          <span>{message}</span>
        </p>
        <div className="flex items-center gap-1">
          {error.toLowerCase().includes("verif") && (
            <Link
              href="/settings"
              className="rounded-full px-2.5 text-xs font-medium underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-sky/50"
            >
              verify your email in settings
            </Link>
          )}
          {saveState.error && !saveState.conflict && (
            <Action disabled={busy} onClick={retrySave}>
              <ArrowClockwise weight="bold" aria-hidden="true" />
              retry now
            </Action>
          )}
          {(saveState.error || offline) && (
            <Action onClick={downloadDraft}>
              <DownloadSimple weight="bold" aria-hidden="true" />
              export draft
            </Action>
          )}
          {saveState.conflict && <Action onClick={reloadDraft}>reload newer draft</Action>}
          {error && (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={dismissError}
              className="grid size-7 cursor-pointer place-items-center rounded-full outline-none transition-colors hover:bg-white focus-visible:ring-3 focus-visible:ring-sky/50"
            >
              <X weight="bold" aria-hidden="true" className="size-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
