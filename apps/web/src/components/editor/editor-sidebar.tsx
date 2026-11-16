"use client";
import { documentText } from "@jot/contracts";
import { AppearancePanel } from "./appearance-panel";
import { AIPanel } from "./ai-panel";
import { PublicationHistory } from "./publication-history";
import { useEditorController } from "./editor-controller";
export function EditorSidebar() {
  const { busy, panel, setPanel, snapshot, updateDraft, post } = useEditorController();
  return (
    <aside
      hidden={!panel}
      className="w-full shrink-0 border-b border-border bg-white p-6 lg:sticky lg:top-[68px] lg:h-[calc(100vh-68px)] lg:w-80 lg:overflow-y-auto lg:border-b-0 lg:border-l"
    >
      <div className="mb-7 flex items-center justify-between">
        <p className="font-mono text-xs text-sky-deep">
          {panel === "appearance"
            ? "the finishing touches"
            : panel === "ai"
              ? "writing assistance"
              : "publication history"}
        </p>
        <button
          onClick={() => setPanel(null)}
          className="rounded-full px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-sky-soft hover:text-sky-deep"
        >
          Close
        </button>
      </div>
      {panel === "appearance" && (
        <AppearancePanel
          value={snapshot.appearance}
          onChange={(appearance) => updateDraft({ appearance })}
          disabled={busy}
        />
      )}
      <div hidden={panel !== "ai"}>
        <AIPanel postId={post.id} text={documentText(snapshot.content)} />
      </div>
      {panel === "history" && <PublicationHistory />}
    </aside>
  );
}
