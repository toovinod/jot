"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CircleNotch, Copy, Sparkle } from "@phosphor-icons/react";
import { WritingRequestStore, writingRequestLimit, type WritingMode } from "@/lib/writing-request";
import { api, ApiError, send } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { useSession } from "../providers";
import { useEditorController } from "./editor-controller";
import { Button } from "../ui/button";
import { Textarea, ErrorMessage } from "../ui/fields";
import { Critter } from "../world/critters";
import { Segmented } from "./controls";
const modes: Record<WritingMode, string> = {
  grammar: "grammar and clarity",
  structure: "flow and structure",
  review: "questions and knowledge gaps",
};
export type Job = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
  error?: string;
};
export function AIPanel({ postId, text }: { postId: string; text: string }) {
  const { user, config, configError } = useSession();
  const { beginPendingWork, latestText } = useEditorController();
  // Measured once per text change: a long post is tens of thousands of bytes.
  const bytes = useMemo(() => new TextEncoder().encode(text).length, [text]);
  const tooLong = bytes > writingRequestLimit;
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
        setError("your last request expired. you can ask for new suggestions.");
      } else if (saved) {
        setMode(saved.mode);
        setSource(saved.source);
        setJob({ id: saved.id, status: "pending" });
      }
    } catch {
      setStorageWarning(
        "this browser can't remember your request. keep this page open and copy the result before leaving.",
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
                  "this request expired or is no longer available. you can ask for new suggestions.",
              });
              setError("");
            } else setError(friendlyError(e, { auto: false }).message);
            setBusy(false);
          }
        });
    }, 2000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [job]);
  const active = !!job && ["pending", "running"].includes(job.status);
  return (
    <section aria-label="Assist" className="space-y-5">
      {!config.aiEnabled ? (
        <div className="flex gap-2.5 rounded-xl bg-background p-3 text-xs leading-5 text-muted-foreground">
          <Critter kind="letter" className="size-6 shrink-0" />
          <span>
            {configError ||
              "writing assist is not turned on for this instance. the editor works fully without it."}
          </span>
        </div>
      ) : (
        <>
          <Segmented
            id="editor-assist"
            label="what would help?"
            value={mode}
            options={["grammar", "structure", "review"] as const}
            labels={modes}
            stacked
            disabled={busy || active}
            onChange={setMode}
          />
          <Button
            variant="sky"
            className="w-full"
            disabled={!text.trim() || tooLong || busy || active}
            onClick={async () => {
              // The panel's text can trail the last keystrokes on a long post.
              const latest = latestText();
              if (!latest.trim() || new TextEncoder().encode(latest).length > writingRequestLimit)
                return;
              const finish = beginPendingWork();
              setBusy(true);
              setError("");
              setCopied(false);
              setJob(null);
              setSource(latest);
              try {
                const result = await api<{ id: string }>("/ai/jobs", {
                  method: "POST",
                  body: send({ postId, mode, text: latest }),
                });
                setJob({ ...result, status: "pending" });
                if (
                  !requestStore.current?.write({
                    id: result.id,
                    mode,
                    source: latest,
                    createdAt: Date.now(),
                  })
                )
                  setStorageWarning(
                    "this browser couldn't remember this request. keep the page open and copy the result before leaving.",
                  );
                else setStorageWarning("");
              } catch (e) {
                setError(friendlyError(e, { auto: false }).message);
              } finally {
                setBusy(false);
                finish();
              }
            }}
          >
            <Sparkle weight="fill" />
            {busy ? "sending" : "ask for suggestions"}
          </Button>
          {tooLong && (
            <p className="text-xs text-muted-foreground">
              suggestions read up to {writingRequestLimit.toLocaleString("en")} bytes of text at a
              time. this draft has {bytes.toLocaleString("en")}.
            </p>
          )}
          <p className="text-xs leading-5 text-muted-foreground">
            your draft text is sent to the configured AI provider. images stay in your draft.
          </p>
        </>
      )}
      <ErrorMessage message={error || job?.error} />
      {storageWarning && (
        <p role="status" className="text-xs leading-5 text-muted-foreground">
          {storageWarning}
        </p>
      )}
      {error && job && active && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setError("");
            setJob({ ...job });
          }}
        >
          retry status check
        </Button>
      )}
      {job && (
        <div className="space-y-4">
          <p role="status" className="flex items-center gap-2 text-xs font-medium">
            {active && (
              <CircleNotch
                weight="bold"
                aria-hidden="true"
                className="size-3.5 animate-spin text-sky-deep motion-reduce:animate-none"
              />
            )}
            {job.status === "pending"
              ? "queued. you can keep writing."
              : job.status === "running"
                ? "reading your words"
                : job.status === "failed"
                  ? "the request didn't finish."
                  : "a few things to consider"}
          </p>
          {job.result && (
            <>
              <div className="flex gap-2.5 rounded-xl bg-background p-3">
                <Critter kind="letter" className="size-6 shrink-0" />
                <label className="grid min-w-0 flex-1 gap-1.5 text-xs text-muted-foreground">
                  suggested changes
                  <Textarea
                    value={job.result}
                    readOnly
                    className="max-h-[50svh] min-h-48 resize-y bg-white text-sm leading-6 text-foreground"
                  />
                </label>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(job.result || "");
                    setCopied(true);
                  } catch {
                    setError(
                      "copy couldn't reach your clipboard. select and copy the suggestion above.",
                    );
                  }
                }}
              >
                <Copy weight="bold" />
                {copied ? "copied" : "copy suggestion"}
              </Button>
              <p className="text-xs leading-5 text-muted-foreground">
                nothing in your draft changed. make any edits yourself.
              </p>
            </>
          )}
          <details className="group text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none rounded outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky">
              the text that was sent
            </summary>
            <Textarea
              value={source}
              readOnly
              aria-label="Requested text"
              className="mt-2 max-h-64 text-xs leading-5"
            />
          </details>
        </div>
      )}
    </section>
  );
}
