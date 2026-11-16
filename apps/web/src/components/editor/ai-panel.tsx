"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, Sparkle } from "@phosphor-icons/react";
import { WritingRequestStore, type WritingMode } from "@/lib/writing-request";
import { api, ApiError, send } from "@/lib/api";
import { useSession } from "../providers";
import { useEditorController } from "./editor-controller";
import { Button } from "../ui/button";
import { Select, Textarea, ErrorMessage } from "../ui/fields";
type Job = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
};
export function AIPanel({ postId, text }: { postId: string; text: string }) {
  const { user, config, configError } = useSession();
  const { beginPendingWork } = useEditorController();
  const [mode, setMode] = useState<WritingMode>("grammar"),
    [source, setSource] = useState(""),
    [job, setJob] = useState<Job | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [storageWarning, setStorageWarning] = useState("");
  const requestStore = useRef<WritingRequestStore | null>(null);
  useEffect(() => {
    if (!user) return;
    try {
      const store = new WritingRequestStore(sessionStorage, user.id, postId);
      requestStore.current = store;
      const saved = store.read();
      if (saved === "expired") {
        setError("Your previous writing request has expired. You can ask for a new suggestion.");
      } else if (saved) {
        setMode(saved.mode);
        setSource(saved.source);
        setJob({ id: saved.id, status: "pending" });
      }
    } catch {
      setStorageWarning(
        "This browser cannot remember your writing request. Keep this page open and copy the result before leaving.",
      );
    }
  }, [user?.id, postId]);
  useEffect(() => {
    if (!job || !["pending", "running"].includes(job.status)) return;
    let active = true;
    const timer = setTimeout(() => {
      api<Job>(`/ai/jobs/${job.id}`)
        .then((value) => {
          if (active) setJob(value);
        })
        .catch((e) => {
          if (active) {
            if (e instanceof ApiError && e.status === 404) {
              requestStore.current?.clear();
              setJob({
                ...job,
                status: "failed",
                error:
                  "This writing request expired or is no longer available. You can ask for a new suggestion.",
              });
              setError("");
            } else setError(e.message);
            setBusy(false);
          }
        });
    }, 2000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [job]);
  return (
    <section className="space-y-5">
      <div>
        <Sparkle weight="duotone" className="mb-4 text-sky-deep" size={26} />
        <h2 className="font-serif text-2xl">A second pair of eyes.</h2>
        <p className="mt-3 text-xs leading-6 text-muted-foreground">
          Suggestions to consider, always your words to keep. Review flags possible gaps; it does
          not independently verify facts.
        </p>
      </div>
      {!config.aiEnabled ? (
        <p className="rounded-lg bg-muted p-3 text-xs leading-6 text-muted-foreground">
          {configError ||
            "Writing assistance is not configured. Your editor works fully without it."}
        </p>
      ) : (
        <>
          <label className="grid gap-2 text-xs">
            What would help?
            <Select
              disabled={busy || (!!job && ["pending", "running"].includes(job.status))}
              value={mode}
              onChange={(e) => setMode(e.target.value as WritingMode)}
            >
              <option value="grammar">Grammar and clarity</option>
              <option value="structure">Flow and structure</option>
              <option value="review">Questions and knowledge gaps</option>
            </Select>
          </label>
          <Button
            className="w-full"
            disabled={
              !text.trim() ||
              new TextEncoder().encode(text).length > 30000 ||
              busy ||
              (!!job && ["pending", "running"].includes(job.status))
            }
            onClick={async () => {
              const finish = beginPendingWork();
              setBusy(true);
              setError("");
              setCopied(false);
              setJob(null);
              setSource(text);
              try {
                const result = await api<{ id: string }>("/ai/jobs", {
                  method: "POST",
                  body: send({ postId, mode, text }),
                });
                setJob({ ...result, status: "pending" });
                if (
                  !requestStore.current?.write({
                    id: result.id,
                    mode,
                    source: text,
                    createdAt: Date.now(),
                  })
                )
                  setStorageWarning(
                    "This browser couldn't remember this writing request. Keep the page open and copy the result before leaving.",
                  );
                else setStorageWarning("");
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
                finish();
              }
            }}
          >
            {busy ? "Sending…" : "Ask for suggestions"}
          </Button>
          {new TextEncoder().encode(text).length > 30000 && (
            <p className="text-xs text-muted-foreground">
              Suggestions support up to 30,000 UTF-8 bytes at a time.
            </p>
          )}
          <p className="text-[11px] leading-5 text-muted-foreground">
            Your current draft text is sent to the configured AI provider. Images stay in your
            draft.
          </p>
        </>
      )}
      <ErrorMessage message={error || job?.error} />
      {storageWarning && (
        <p role="status" className="text-xs leading-6 text-muted-foreground">
          {storageWarning}
        </p>
      )}
      {error && job && ["pending", "running"].includes(job.status) && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setError("");
            setJob({ ...job });
          }}
        >
          Retry status check
        </Button>
      )}
      {job && (
        <div className="space-y-4">
          <p role="status" className="text-xs font-medium capitalize">
            {job.status === "pending"
              ? "Queued. You can keep writing."
              : job.status === "running"
                ? "Reading your words…"
                : job.status === "failed"
                  ? "The request didn't complete."
                  : "A few things to consider"}
          </p>
          <label className="grid gap-2 text-xs">
            Requested text
            <Textarea value={source} readOnly className="h-32 text-xs" />
          </label>
          {job.result && (
            <>
              <label className="grid gap-2 text-xs">
                Suggested changes
                <Textarea value={job.result} readOnly className="min-h-64 text-xs leading-6" />
              </label>
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(job.result || "");
                    setCopied(true);
                  } catch {
                    setError(
                      "Copy couldn't access your clipboard. Select and copy the suggestion above.",
                    );
                  }
                }}
              >
                <Copy weight="bold" />
                {copied ? "Copied" : "Copy suggestion"}
              </Button>
              <p className="text-[11px] leading-5 text-muted-foreground">
                Nothing has been changed. Review and make any edits yourself in the draft.
              </p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
