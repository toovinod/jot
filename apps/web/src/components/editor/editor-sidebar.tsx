"use client";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { IconButton } from "../app/toolbar";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import { Critter } from "../world/critters";
import { AppearancePanel } from "./appearance-panel";
import { AIPanel } from "./ai-panel";
import { PublicationHistory } from "./publication-history";
import { PublicationPanel, pageStatus } from "./publication-panel";
import { panelTabs } from "./editor-toolbar";
import { arrowSelect } from "./controls";
import { useEditorController } from "./editor-controller";
import { StatusDot, chipShadow, critterFor, useWide } from "./page-look";

/**
 * The page settings pane: the page's critter, title and status, then look, publish, assist and
 * history behind icon tabs, as in the landing demo. A column at the window's right edge on wide
 * screens and a modal sheet from the bottom on smaller ones, so it never squeezes the writing. Assist stays mounted while hidden so a request keeps
 * polling.
 */
export function EditorSidebar() {
  const { busy, panel, showPanel, snapshot, updateDraft, post, text, words } =
    useEditorController();
  const wide = useWide();
  const status = pageStatus(post);
  const ids = panelTabs.map((tab) => tab.id);
  // The sheet unmounts when it closes, so on small screens assist renders once into this node,
  // which moves into each new sheet instead of remounting and dropping its request.
  const [assistNode] = useState(() => document.createElement("div"));
  const placeAssist = useCallback(
    (slot: HTMLDivElement | null) => {
      slot?.appendChild(assistNode);
    },
    [assistNode],
  );
  const opener = useRef<HTMLElement | null>(null);
  // Closing hands focus back to the bar button that opened the panel.
  function close() {
    const trigger = document.querySelector<HTMLElement>(
      'button[aria-controls="editor-panel"][aria-expanded="true"]',
    );
    showPanel(null);
    trigger?.focus();
  }
  const body = (assist: ReactNode) => (
    <>
      <div className="relative flex flex-col items-center pb-4 pt-2 text-center">
        <IconButton
          label="Close panel"
          variant="ghost"
          onClick={wide ? close : () => showPanel(null)}
          className="absolute -right-1 -top-1 size-8"
        >
          <X weight="bold" />
        </IconButton>
        <motion.span
          initial={{ scale: 0.6, rotate: -12 }}
          animate={{ scale: 1, rotate: 0 }}
          whileHover={{ rotate: [0, -8, 8, 0], transition: { duration: 0.5 } }}
          transition={{ type: "spring", stiffness: 400, damping: 14 }}
          className={cn("grid size-16 place-items-center rounded-2xl bg-white", chipShadow)}
        >
          <Critter kind={critterFor(post.id)} className="size-11" />
        </motion.span>
        <p className="mt-3 max-w-full truncate text-lg font-medium tracking-[-0.01em]">
          {snapshot.title.trim() || "untitled"}
        </p>
        <p className="flex max-w-full items-center gap-1.5 truncate text-xs text-muted-foreground">
          <StatusDot status={status} />
          {status} · {words.toLocaleString("en")} {words === 1 ? "word" : "words"}
        </p>
      </div>
      <div
        role="tablist"
        aria-label="Page settings"
        onKeyDown={(event) =>
          panel &&
          arrowSelect(event, ids, panel, (next) => {
            showPanel(next);
            requestAnimationFrame(() => document.getElementById(`editor-tab-${next}`)?.focus());
          })
        }
        className="grid grid-cols-4 gap-1"
      >
        {panelTabs.map((tab) => {
          const on = panel === tab.id;
          return (
            <button
              key={tab.id}
              id={`editor-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls="editor-tabpanel"
              tabIndex={on ? 0 : -1}
              disabled={busy && !on}
              onClick={() => showPanel(tab.id)}
              className={cn(
                "relative flex cursor-pointer flex-col items-center gap-0.5 rounded-xl py-1.5 text-xs outline-none transition-colors focus-visible:ring-3 focus-visible:ring-sky/50 disabled:cursor-not-allowed disabled:opacity-50",
                on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {on && (
                <motion.span
                  layoutId="editor-tab"
                  className={cn("absolute inset-0 rounded-xl bg-white", chipShadow)}
                />
              )}
              <tab.icon
                weight={on ? "fill" : "bold"}
                className="relative size-4"
                style={{ color: tab.color }}
              />
              <span className="relative">{tab.label}</span>
            </button>
          );
        })}
      </div>
      <div
        id="editor-tabpanel"
        role="tabpanel"
        aria-labelledby={panel ? `editor-tab-${panel}` : undefined}
        className="mt-5"
      >
        {panel === "appearance" && (
          <AppearancePanel
            value={snapshot.appearance}
            onChange={(appearance) => updateDraft({ appearance })}
            disabled={busy}
          />
        )}
        {panel === "publish" && <PublicationPanel />}
        <div hidden={panel !== "ai"} ref={wide ? undefined : placeAssist}>
          {assist}
        </div>
        {panel === "history" && <PublicationHistory />}
      </div>
    </>
  );
  if (wide)
    return (
      <aside
        id="editor-panel"
        aria-label="Page settings"
        hidden={!panel}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) close();
        }}
        className="h-full w-[300px] shrink-0 overflow-y-auto overscroll-contain border-l border-border bg-white px-4 pb-8 pt-4"
      >
        {body(<AIPanel postId={post.id} text={text} />)}
      </aside>
    );
  // Radix moves focus into the sheet, keeps it there, and closes on Escape or a tap outside.
  return (
    <>
      {createPortal(<AIPanel postId={post.id} text={text} />, assistNode)}
      <Sheet open={!!panel} onOpenChange={(open) => !open && showPanel(null)}>
        <SheetContent
          id="editor-panel"
          side="bottom"
          showCloseButton={false}
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            opener.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          className="max-h-[80svh] gap-0 overflow-y-auto overscroll-contain rounded-t-[28px] border-t-0 px-5 pb-8 pt-3 shadow-[0_-24px_60px_-24px_rgba(0,40,100,.45)]"
        >
          <SheetTitle className="sr-only">Page settings</SheetTitle>
          <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-border" />
          {body(null)}
        </SheetContent>
      </Sheet>
    </>
  );
}
