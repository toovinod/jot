"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { documentText, type Post, type Snapshot, type RevisionSummary } from "@jot/contracts";
import { api, ApiError, send, upload } from "@/lib/api";
import { SaveQueue } from "@/lib/save-queue";
import { DraftRecovery, sameDraftSnapshot, type RecoverableDraft } from "@/lib/draft-recovery";
import { PendingWork } from "@/lib/pending-work";
import { safeUrl } from "@/lib/utils";
import { useSession } from "../providers";
function snapshotOf(post: Post): Snapshot {
  return {
    title: post.title,
    subtitle: post.subtitle,
    slug: post.slug,
    cover: post.cover,
    content: post.content,
    appearance: post.appearance,
    visibility: post.visibility,
  };
}
function useEditorControllerState(initial: Post) {
  const router = useRouter();
  const { config } = useSession();
  const [post, setPost] = useState(initial),
    [snapshot, setSnapshot] = useState<Snapshot>(snapshotOf(initial)),
    [saveState, setSaveState] = useState({
      dirty: false,
      saving: false,
      error: "",
      conflict: false,
    }),
    [panel, setPanel] = useState<"appearance" | "ai" | "history" | null>(null),
    [preview, setPreview] = useState(false),
    [publishOpen, setPublishOpen] = useState(false),
    [emailSubscribers, setEmailSubscribers] = useState(false),
    [operationBusy, setBusy] = useState(false),
    [uploads, setPendingCount] = useState(0),
    [recovery, setRecovery] = useState<RecoverableDraft | null>(null),
    [recoveryWarning, setRecoveryWarning] = useState(""),
    [error, setError] = useState(""),
    [revisions, setRevisions] = useState<RevisionSummary[]>([]),
    [revisionLoading, setRevisionLoading] = useState(false),
    [editorKey, setEditorKey] = useState(0);
  const busy = operationBusy || recovery !== null;
  const recoveryStore = useRef<DraftRecovery | null>(null);
  const pendingWork = useRef<PendingWork | null>(null);
  if (!pendingWork.current) pendingWork.current = new PendingWork(setPendingCount);
  const currentDraft = useRef(snapshot),
    saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null),
    mounted = useRef(true),
    operationLocked = useRef(false),
    saveQueue = useRef<SaveQueue<Snapshot, Post> | null>(null);
  const refreshSaveState = useCallback(() => {
    const queue = saveQueue.current;
    if (mounted.current && queue)
      setSaveState({
        dirty: queue.dirty,
        saving: queue.saving,
        error: queue.error?.message || "",
        conflict: queue.error instanceof ApiError && queue.error.status === 409,
      });
  }, []);
  if (!saveQueue.current)
    saveQueue.current = new SaveQueue(
      initial.revision,
      (value, revision) =>
        api<Post>(`/posts/${initial.id}`, { method: "PUT", body: send({ ...value, revision }) }),
      (result) => {
        // An older save may finish after more typing. Only acknowledge server metadata here.
        if (result && mounted.current)
          setPost((previous) => ({
            ...previous,
            revision: result.revision,
            published: result.published,
            publishedAt: result.publishedAt,
            updatedAt: result.updatedAt,
          }));
        if (result && recoveryStore.current) {
          const kept = recoveryStore.current.acknowledge(snapshotOf(result), result.revision);
          if (mounted.current)
            setRecoveryWarning(
              kept
                ? ""
                : "This browser couldn't update its local recovery copy. Save or export your draft before leaving.",
            );
        }
        refreshSaveState();
      },
    );
  function updateDraft(patch: Partial<Snapshot>) {
    if (operationLocked.current || recovery) return;
    const next = { ...currentDraft.current, ...patch };
    currentDraft.current = next;
    setSnapshot(next);
    if (recoveryStore.current && !recoveryStore.current.write(next, saveQueue.current!.revision))
      setRecoveryWarning(
        "This browser couldn't keep a recovery copy. Keep this page open until your draft is saved, or export it.",
      );
    saveQueue.current!.enqueue(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!(saveQueue.current!.error instanceof ApiError && saveQueue.current!.error.status === 409))
      saveTimer.current = setTimeout(() => {
        void saveQueue.current!.flush().catch(() => {});
      }, 900);
  }
  async function saveDraft() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await saveQueue.current!.flush();
  }
  useEffect(() => {
    mounted.current = true;
    try {
      const store = new DraftRecovery(window.sessionStorage, initial.author.id, initial.id);
      recoveryStore.current = store;
      const saved = store.read();
      if (saved) {
        if (sameDraftSnapshot(saved.snapshot, currentDraft.current)) store.clear();
        else setRecovery(saved);
      }
    } catch {
      setRecoveryWarning(
        "This browser cannot keep a local recovery copy. Save or export your draft before leaving.",
      );
    }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        saveQueue.current?.dirty ||
        operationLocked.current ||
        recovery ||
        pendingWork.current!.pending > 0
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      mounted.current = false;
      window.removeEventListener("beforeunload", beforeUnload);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      void saveQueue.current?.flush().catch(() => {});
    };
  }, []);
  async function runSavedOperation(action: () => Promise<void>) {
    if (operationLocked.current || recovery || pendingWork.current!.pending > 0) return;
    operationLocked.current = true;
    setBusy(true);
    setError("");
    try {
      await saveDraft();
      await action();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      operationLocked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function updatePublicationMetadata(result: Post) {
    saveQueue.current!.revision = result.revision;
    setPost(result);
    refreshSaveState();
  }
  async function loadPublicationHistory() {
    setRevisionLoading(true);
    setError("");
    try {
      const data = await api<{ revisions: RevisionSummary[] }>(`/posts/${post.id}/revisions`);
      setRevisions(data.revisions);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setRevisionLoading(false);
    }
  }
  function downloadSnapshot(value: Snapshot) {
    const blob = new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${value.slug || "jot-draft"}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  function downloadDraft() {
    downloadSnapshot(currentDraft.current);
  }
  function downloadRecovery() {
    if (recovery) downloadSnapshot(recovery.snapshot);
  }
  function discardLocalDraft() {
    if (!confirm("Discard the unsaved local copy? Export it first if you need any of its writing."))
      return;
    recoveryStore.current?.clear();
    setRecovery(null);
  }
  function recoverLocalDraft() {
    if (!recovery) return;
    const local = recovery;
    setRecovery(null);
    currentDraft.current = local.snapshot;
    setSnapshot(local.snapshot);
    setEditorKey((value) => value + 1);
    saveQueue.current!.revision = local.baseRevision;
    saveQueue.current!.enqueue(local.snapshot);
    void saveQueue.current!.flush().catch(() => {});
  }
  function beginPendingWork() {
    return pendingWork.current!.begin();
  }
  function isOperationBlocked() {
    return operationLocked.current || recovery !== null;
  }
  function navigateTo(path: string) {
    if (pendingWork.current!.pending > 0) {
      setError("Wait for the current work to finish before leaving.");
      return;
    }
    void runSavedOperation(async () => router.push(path));
  }
  function publishDraft() {
    return runSavedOperation(async () => {
      const result = await api<Post>(`/posts/${post.id}/publish`, {
        method: "POST",
        body: send({
          revision: saveQueue.current!.revision,
          emailSubscribers: emailSubscribers && currentDraft.current.visibility === "public",
        }),
      });
      updatePublicationMetadata(result);
      setPublishOpen(false);
    });
  }
  function unpublishPost() {
    if (confirm("Take this story offline? Your draft will stay in your library."))
      void runSavedOperation(async () => {
        updatePublicationMetadata(
          await api<Post>(`/posts/${post.id}/unpublish`, {
            method: "POST",
            body: send({ revision: saveQueue.current!.revision }),
          }),
        );
        setPublishOpen(false);
      });
  }
  function restoreRevision(versionId: number) {
    if (
      confirm(
        "Restore this edition into the draft? Your current draft is saved first. This does not change the live publication.",
      )
    )
      void runSavedOperation(async () => {
        const result = await api<Post>(`/posts/${post.id}/restore`, {
          method: "POST",
          body: send({ revision: saveQueue.current!.revision, versionId }),
        });
        updatePublicationMetadata(result);
        currentDraft.current = snapshotOf(result);
        setSnapshot(currentDraft.current);
        setEditorKey((value) => value + 1);
      });
  }
  function deletePost() {
    if (confirm("Permanently delete this story and its revisions? This cannot be undone."))
      void runSavedOperation(async () => {
        await api(`/posts/${post.id}`, { method: "DELETE" });
        router.replace("/dashboard");
      });
  }
  async function uploadCover(file: File) {
    if (isOperationBlocked()) return;
    const finish = beginPendingWork();
    setError("");
    try {
      const result = await upload(file);
      updateDraft({ cover: result.url });
    } catch (error) {
      setError((error as Error).message);
    } finally {
      finish();
    }
  }
  function retrySave() {
    setError("");
    void saveDraft().catch(() => {});
  }
  function reloadDraft() {
    if (
      confirm(
        "Reload the newer draft? Export your local changes first. Unsaved local changes will be lost.",
      )
    ) {
      recoveryStore.current?.clear();
      location.reload();
    }
  }
  const words = documentText(snapshot.content).trim().split(/\s+/).filter(Boolean).length;
  return {
    post,
    snapshot,
    saveState,
    panel,
    setPanel,
    preview,
    setPreview,
    publishOpen,
    setPublishOpen,
    emailSubscribers,
    setEmailSubscribers,
    busy,
    uploads,
    error,
    revisions,
    revisionLoading,
    editorKey,
    words,
    cover: safeUrl(snapshot.cover, true),
    config,
    updateDraft,
    saveDraft,
    loadPublicationHistory,
    downloadDraft,
    navigateTo,
    publishDraft,
    unpublishPost,
    restoreRevision,
    deletePost,
    uploadCover,
    retrySave,
    reloadDraft,
    beginPendingWork,
    isOperationBlocked,
    recovery,
    recoveryWarning,
    recoverLocalDraft,
    discardLocalDraft,
    downloadRecovery,
  };
}
const EditorContext = createContext<ReturnType<typeof useEditorControllerState> | null>(null);
export function EditorProvider({ initial, children }: { initial: Post; children: ReactNode }) {
  const controller = useEditorControllerState(initial);
  return <EditorContext.Provider value={controller}>{children}</EditorContext.Provider>;
}
export function useEditorController() {
  const controller = useContext(EditorContext);
  if (!controller) throw new Error("Editor components require an EditorProvider");
  return controller;
}
