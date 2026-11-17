"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { MarkdownManager } from "@tiptap/markdown";
import { documentText, type Post, type Snapshot, type RevisionSummary } from "@jot/contracts";
import { api, ApiError, getPost, send, upload } from "@/lib/api";
import { friendlyError, isNetworkError } from "@/lib/errors";
import { SaveQueue } from "@/lib/save-queue";
import { DraftRecovery, sameDraftSnapshot, type RecoverableDraft } from "@/lib/draft-recovery";
import { PendingWork } from "@/lib/pending-work";
import { safeUrl } from "@/lib/utils";
import { useSession } from "../providers";
import { editorExtensions } from "./rich-editor";
function snapshotOf(post: Post): Snapshot {
  return {
    title: post.title,
    subtitle: post.subtitle,
    slug: post.slug,
    cover: post.cover,
    content: post.content,
    appearance: post.appearance,
    visibility: post.visibility,
    // Drafts saved before tags existed come back without them.
    tags: post.tags || [],
    commentsOff: !!post.commentsOff,
  };
}
/** A page body, or any part of one, as Markdown in the editor's own schema. */
export function markdownBody(content: Snapshot["content"]) {
  return new MarkdownManager({ extensions: editorExtensions() }).serialize(content);
}
/** The draft as Markdown: the title as an H1, the subtitle as the first line, then the page. */
export function markdownOf(value: Snapshot) {
  const body = markdownBody(value.content);
  return `${value.title ? `# ${value.title}\n\n` : ""}${value.subtitle ? `${value.subtitle}\n\n` : ""}${body}\n`;
}
export const markdownFileName = (value: Snapshot) => `${value.slug || "untitled"}.md`;
/** Text length, in characters, from which draft changes persist after a pause. */
const longText = 20_000;
/** Autosave retries a failed save this many times, waiting 1, 2, 4, 8, 16 and 30 seconds. */
const maxRetries = 6;
const isConflict = (error: unknown) => error instanceof ApiError && error.status === 409;
const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
/** Says what failed and, when it helps, a word for the person; never the raw request error. */
export function operationError(error: unknown) {
  return friendlyError(error, { auto: false }).message;
}
export type EditorPanel = "appearance" | "publish" | "ai" | "history";
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
      /** A retry is waiting to run on its own. */
      retrying: false,
      /** The browser reports no network; saving resumes on the `online` event. */
      offline: false,
    }),
    [panel, setPanel] = useState<EditorPanel | null>(null),
    [preview, setPreview] = useState(false),
    /** The read-only Markdown view of the draft, in place of the page. */
    [markdownView, setMarkdownView] = useState(false),
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
    saveQueue = useRef<SaveQueue<Snapshot, Post> | null>(null),
    // The rich editor hands over its document lazily on long posts; this pulls any pending change.
    editorFlush = useRef<(() => void) | null>(null),
    persistTimer = useRef<ReturnType<typeof setTimeout>>(undefined),
    persistSince = useRef<number | null>(null),
    textLength = useRef(0),
    retry = useRef<{
      attempts: number;
      timer?: ReturnType<typeof setTimeout>;
      handled?: unknown;
    }>({ attempts: 0 });
  /** Pulls the editor's last keystrokes and persists any change still waiting for a pause. */
  function flushEditor() {
    editorFlush.current?.();
    if (persistSince.current !== null) persistDraft();
  }
  /** Returns the function that unregisters it, which leaves a newer editor's flush alone. */
  function registerEditorFlush(flush: () => void) {
    editorFlush.current = flush;
    return () => {
      if (editorFlush.current === flush) editorFlush.current = null;
    };
  }
  /** The draft's text as of the last keystroke, for work that must not miss any of it. */
  function latestText() {
    flushEditor();
    return documentText(currentDraft.current.content);
  }
  const refreshSaveState = useCallback(() => {
    const queue = saveQueue.current;
    if (!mounted.current || !queue) return;
    const retrying = retry.current.timer !== undefined,
      offline = isOffline();
    setSaveState({
      dirty: queue.dirty,
      saving: queue.saving,
      error: !queue.error
        ? ""
        : offline && isNetworkError(queue.error)
          ? "you're offline. saving resumes when you're back online."
          : friendlyError(queue.error, { auto: retrying }).message,
      conflict: isConflict(queue.error),
      retrying,
      offline,
    });
  }, []);
  function clearRetry() {
    clearTimeout(retry.current.timer);
    retry.current.timer = undefined;
  }
  /** After a failed save, tries again with a growing wait when that could help. Offline, it waits
   * for the browser's `online` event instead; a conflict or a refusal waits for the person. */
  function saveFailed(error: unknown) {
    // Callers sharing one failed run all land here; count it once.
    if (retry.current.handled === error) return;
    retry.current.handled = error;
    clearRetry();
    if (!mounted.current) return;
    if (
      !isConflict(error) &&
      friendlyError(error).retry &&
      !isOffline() &&
      retry.current.attempts < maxRetries
    ) {
      const wait = Math.min(30_000, 1000 * 2 ** retry.current.attempts);
      retry.current.attempts++;
      retry.current.timer = setTimeout(() => {
        retry.current.timer = undefined;
        autosave();
      }, wait);
    }
    refreshSaveState();
  }
  function saveSucceeded() {
    retry.current.attempts = 0;
  }
  /** Sends the queued draft in the background. */
  function autosave() {
    void saveQueue.current!.flush().then(saveSucceeded, saveFailed);
  }
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
  /** Writes the current draft to the recovery copy and the save queue, and arms autosave. */
  function persistDraft() {
    clearTimeout(persistTimer.current);
    persistSince.current = null;
    const next = currentDraft.current;
    if (recoveryStore.current && !recoveryStore.current.write(next, saveQueue.current!.revision))
      setRecoveryWarning(
        "This browser couldn't keep a recovery copy. Keep this page open until your draft is saved, or export it.",
      );
    saveQueue.current!.enqueue(next);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    // A waiting retry or the `online` event sends the latest draft; typing doesn't jump the queue.
    if (!isConflict(saveQueue.current!.error) && retry.current.timer === undefined && !isOffline())
      saveTimer.current = setTimeout(autosave, 900);
  }
  function updateDraft(patch: Partial<Snapshot>) {
    if (operationLocked.current || recovery) return;
    const next = { ...currentDraft.current, ...patch };
    currentDraft.current = next;
    setSnapshot(next);
    // Copying a long post for the queue and the recovery copy costs milliseconds, so on long
    // posts it waits for a pause in typing (at most two seconds). Short drafts persist at once.
    if (textLength.current < longText) return persistDraft();
    const now = Date.now();
    persistSince.current ??= now;
    clearTimeout(persistTimer.current);
    if (now - persistSince.current >= 2000) return persistDraft();
    persistTimer.current = setTimeout(persistDraft, 400);
    setSaveState((state) => (state.dirty ? state : { ...state, dirty: true }));
  }
  async function saveDraft() {
    flushEditor();
    if (saveTimer.current) clearTimeout(saveTimer.current);
    clearRetry();
    try {
      await saveQueue.current!.flush();
      saveSucceeded();
    } catch (error) {
      saveFailed(error);
      throw error;
    }
  }
  useEffect(() => {
    mounted.current = true;
    try {
      const store = new DraftRecovery(window.localStorage, initial.author.id, initial.id);
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
      flushEditor();
      if (
        saveQueue.current?.dirty ||
        operationLocked.current ||
        recovery ||
        pendingWork.current!.pending > 0
      )
        event.preventDefault();
    };
    // Back online, a draft that couldn't be sent goes out at once.
    const online = () => {
      clearRetry();
      retry.current.attempts = 0;
      if (saveQueue.current?.dirty && !isConflict(saveQueue.current.error)) autosave();
      refreshSaveState();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("online", online);
    window.addEventListener("offline", refreshSaveState);
    return () => {
      mounted.current = false;
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", refreshSaveState);
      flushEditor();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      clearRetry();
      void saveQueue.current?.flush().catch(() => {});
    };
  }, []);
  async function runSavedOperation(action: () => Promise<void>) {
    if (operationLocked.current || recovery || pendingWork.current!.pending > 0) return;
    // Take the editor's last keystrokes before the lock, which refuses draft changes.
    flushEditor();
    operationLocked.current = true;
    setBusy(true);
    setError("");
    try {
      await saveDraft();
      await action();
    } catch (error) {
      setError(operationError(error));
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
      setError(operationError(error));
    } finally {
      setRevisionLoading(false);
    }
  }
  function download(text: string, type: string, name: string) {
    const url = URL.createObjectURL(new Blob([text], { type })),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  function downloadSnapshot(value: Snapshot) {
    download(
      JSON.stringify(value, null, 2),
      "application/json",
      `${value.slug || "jot-draft"}.json`,
    );
  }
  function downloadDraft() {
    flushEditor();
    downloadSnapshot(currentDraft.current);
  }
  function downloadMarkdown() {
    flushEditor();
    const value = currentDraft.current;
    download(markdownOf(value), "text/markdown", markdownFileName(value));
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
    autosave();
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
    });
  }
  function schedulePublish(at: string) {
    return runSavedOperation(async () => {
      await api(`/posts/${post.id}/schedule`, {
        method: "POST",
        body: send({
          at,
          emailSubscribers: emailSubscribers && currentDraft.current.visibility === "public",
          revision: saveQueue.current!.revision,
        }),
      });
      updatePublicationMetadata(await getPost(post.id));
    });
  }
  function cancelSchedule() {
    return runSavedOperation(async () => {
      await api(`/posts/${post.id}/schedule`, { method: "DELETE" });
      updatePublicationMetadata(await getPost(post.id));
    });
  }
  function createShareLink() {
    return runSavedOperation(async () => {
      const { token } = await api<{ token: string }>(`/posts/${post.id}/share`, {
        method: "POST",
      });
      setPost((previous) => ({ ...previous, shareToken: token }));
    });
  }
  function revokeShareLink() {
    if (confirm("Turn off the private link? Anyone who has it will lose access."))
      void runSavedOperation(async () => {
        await api(`/posts/${post.id}/share`, { method: "DELETE" });
        setPost((previous) => ({ ...previous, shareToken: undefined }));
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
      setError(operationError(error));
    } finally {
      finish();
    }
  }
  function retrySave() {
    setError("");
    retry.current.attempts = 0;
    void saveDraft().catch(() => {});
  }
  function dismissError() {
    setError("");
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
  // Long posts run to tens of thousands of nodes, so walk the document only when it changes.
  const text = useMemo(() => documentText(snapshot.content), [snapshot.content]);
  useEffect(() => {
    textLength.current = text.length;
  }, [text]);
  const words = useMemo(() => text.match(/\S+/g)?.length ?? 0, [text]);
  function showPanel(next: EditorPanel | null) {
    setPanel(next);
    if (next === "history") void loadPublicationHistory();
  }
  function togglePreview() {
    flushEditor();
    setMarkdownView(false);
    setPreview((value) => !value);
  }
  function showMarkdown(on: boolean) {
    flushEditor();
    setPreview(false);
    setMarkdownView(on);
  }
  return {
    post,
    snapshot,
    saveState,
    panel,
    setPanel,
    showPanel,
    preview,
    setPreview,
    togglePreview,
    markdownView,
    showMarkdown,
    emailSubscribers,
    setEmailSubscribers,
    busy,
    uploads,
    error,
    revisions,
    revisionLoading,
    editorKey,
    text,
    words,
    cover: safeUrl(snapshot.cover, true),
    config,
    updateDraft,
    saveDraft,
    loadPublicationHistory,
    downloadDraft,
    downloadMarkdown,
    navigateTo,
    publishDraft,
    schedulePublish,
    cancelSchedule,
    createShareLink,
    revokeShareLink,
    unpublishPost,
    restoreRevision,
    deletePost,
    uploadCover,
    retrySave,
    dismissError,
    reloadDraft,
    beginPendingWork,
    isOperationBlocked,
    flushEditor,
    registerEditorFlush,
    latestText,
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
