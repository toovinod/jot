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
      className="w-full shrink-0 border-b border-border bg-card/30 p-6 lg:sticky lg:top-16 lg:h-[calc(100vh-65px)] lg:w-80 lg:overflow-y-auto lg:border-b-0 lg:border-l"
    >
      <div className="mb-7 flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[.16em] text-muted-foreground">
          {panel === "appearance"
            ? "The finishing touches"
            : panel === "ai"
              ? "Writing assistance"
              : "Publication history"}
        </p>
        <button onClick={() => setPanel(null)} className="text-xs text-muted-foreground underline">
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
