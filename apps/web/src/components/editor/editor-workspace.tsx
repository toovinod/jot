"use client";
import type { Post } from "@jot/contracts";
import { EditorProvider, useEditorController } from "./editor-controller";
import { EditorToolbar } from "./editor-toolbar";
import { RecoveryNotice } from "./recovery-notice";
import { SaveNotice } from "./save-notice";
import { PublicationPanel } from "./publication-panel";
import { DraftCanvas } from "./draft-canvas";
import { EditorSidebar } from "./editor-sidebar";
export function EditorWorkspace({ initial }: { initial: Post }) {
  return (
    <EditorProvider initial={initial}>
      <div className="min-h-screen">
        <EditorToolbar />
        <RecoveryNotice />
        <SaveNotice />
        <PublicationPanel />
        <div className="flex flex-col-reverse lg:flex-row">
          <DraftCanvas />
          <EditorSidebar />
        </div>
        <DraftFooter />
      </div>
    </EditorProvider>
  );
}
function DraftFooter() {
  const { downloadDraft } = useEditorController();
  return (
    <footer className="flex justify-between gap-3 border-t border-border px-6 py-5 text-[11px] text-muted-foreground">
      <span>Your draft is private. Publishing is always your choice.</span>
      <button onClick={downloadDraft} className="underline">
        Export draft
      </button>
    </footer>
  );
}
