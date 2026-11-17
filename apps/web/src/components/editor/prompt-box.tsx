"use client";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import type { Editor } from "@tiptap/react";
import {
  ArrowUp,
  CaretDown,
  Check,
  Copy,
  FileText,
  Paperclip,
  PencilSimple,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import { aiChatLimits, type AIChatRequest, type AIChatResult, type Snapshot } from "@jot/contracts";
import { api, ApiError, send } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { writingRequestLimit } from "@/lib/writing-request";
import { cn, slugify } from "@/lib/utils";
import type { Job } from "./ai-panel";
import { useEditorController } from "./editor-controller";
import { appendMarkdown } from "./rich-editor";
import { chip, chipShadow, hues } from "./page-look";
import {
  byteLength,
  chatHistory,
  chatTarget,
  clipBytes,
  countWords,
  hasMention,
  mention,
  mentionAt,
  readResult,
  replaceWithMarkdown,
  targetHolds,
  withoutMention,
  type ChatTarget,
} from "./jotai";

export const offMessage = "jot ai isn't set up on this server";

/** One question to jot ai and what came back. A finished answer may carry an edit to propose. */
type Turn = {
  id: number;
  prompt: string;
  request: AIChatRequest;
  target: ChatTarget;
  state: "sending" | "waiting" | "done" | "failed";
  job?: string;
  polls?: number;
  error?: string;
  result?: AIChatResult;
  proposal?: "open" | "stale" | "applied" | "discarded";
  notice?: string;
};
type Context = { text: string; name?: string };
// Each page keeps its conversation and context while the tab is open, never on the server.
const threads = new Map<string, Turn[]>(),
  contexts = new Map<string, Context>();
let nextId = 1;
const limits = { title: 200, subtitle: 500 } as const;
const proposes = (result: AIChatResult) =>
  result.edit !== null || result.title !== null || result.subtitle !== null;

/** How far the on-screen keyboard covers the window, so the box can sit above it. */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const update = () =>
      setInset(Math.max(0, Math.round(window.innerHeight - view.height - view.offsetTop)));
    view.addEventListener("resize", update);
    view.addEventListener("scroll", update);
    return () => {
      view.removeEventListener("resize", update);
      view.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

const smallButton =
  "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-xs font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-sky/50 disabled:cursor-not-allowed disabled:opacity-50";
const quietButton = cn(
  smallButton,
  "text-muted-foreground hover:bg-sky-soft hover:text-foreground",
);
const darkButton = cn(smallButton, "bg-ink text-white hover:bg-ink/85");
const roundIcon = cn(
  "grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-white outline-none transition-colors hover:bg-sky-soft focus-visible:ring-3 focus-visible:ring-sky/50",
  chipShadow,
);
// The box and its highlight layer must lay text out the same way.
const field = "whitespace-pre-wrap break-words py-1.5 text-sm leading-5";

/**
 * The box pinned under the page, as in the landing demo: a line typed here goes to the end of
 * the page, and a line with @jotai asks jot ai, whose answers and proposed edits show above it.
 */
export function PromptDock({
  editorRef,
  scroller,
  className,
  hidden,
}: {
  editorRef: RefObject<Editor | null>;
  /** The scrolling page, which shows a new line once it lands at the end. */
  scroller: RefObject<HTMLElement | null>;
  className?: string;
  hidden?: boolean;
}) {
  const {
    post,
    snapshot,
    busy,
    isOperationBlocked,
    updateDraft,
    markdownView,
    showMarkdown,
    beginPendingWork,
    text,
    config,
  } = useEditorController();
  const [draft, setDraft] = useState(""),
    [note, setNote] = useState(""),
    [menu, setMenu] = useState<{ start: number; end: number } | null>(null),
    [turns, setTurns] = useState<Turn[]>(() => threads.get(post.id) ?? []),
    [open, setOpen] = useState(true),
    [context, setContext] = useState<Context | null>(() => contexts.get(post.id) ?? null),
    [contextOpen, setContextOpen] = useState(false),
    [contextNote, setContextNote] = useState("");
  const box = useRef<HTMLTextAreaElement>(null),
    mirror = useRef<HTMLDivElement>(null),
    list = useRef<HTMLOListElement>(null);
  // The page as it stood after each applied proposal, so "undo" only steps back over that one.
  const undos = useRef(
    new Map<number, { doc: Editor["state"]["doc"] | null; header: Partial<Snapshot> }>(),
  );
  const inset = useKeyboardInset();
  const emptyPage = !text.trim();
  useEffect(() => {
    threads.set(post.id, turns);
  }, [post.id, turns]);
  useEffect(() => {
    if (context) contexts.set(post.id, context);
    else contexts.delete(post.id);
  }, [post.id, context]);
  useLayoutEffect(() => {
    const element = box.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [draft]);
  useEffect(() => {
    const element = list.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [turns.length, open]);

  function update(id: number, patch: Partial<Turn>) {
    setTurns((all) => all.map((turn) => (turn.id === id ? { ...turn, ...patch } : turn)));
  }
  const waiting = turns.find((turn) => turn.state === "waiting");
  const thinking = turns.some((turn) => turn.state === "waiting" || turn.state === "sending");
  // Checks on the request the way assist does, a little sooner at first since chats are short.
  useEffect(() => {
    if (!waiting?.job) return;
    let active = true;
    const { id, job, polls = 0 } = waiting;
    const timer = setTimeout(
      () => {
        api<Job>(`/ai/jobs/${job}`).then(
          (value) => {
            if (!active) return;
            if (value.status === "completed") {
              const result = readResult(value.result);
              update(id, {
                state: "done",
                result,
                proposal: proposes(result) ? "open" : undefined,
              });
            } else if (value.status === "failed")
              update(id, {
                state: "failed",
                job: undefined,
                error: value.error || "jot ai couldn't finish that. try again.",
              });
            else update(id, { polls: polls + 1 });
          },
          (error) => {
            if (!active) return;
            if (error instanceof ApiError && error.status === 404)
              update(id, {
                state: "failed",
                job: undefined,
                error: "this request expired. you can ask again.",
              });
            // The job may still finish, so retry goes back to checking on it.
            else
              update(id, { state: "failed", error: friendlyError(error, { auto: false }).message });
          },
        );
      },
      polls ? 1500 : 700,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [waiting]);

  async function sendTurn(turn: Turn) {
    const finish = beginPendingWork();
    try {
      const { id } = await api<{ id: string }>("/ai/jobs", {
        method: "POST",
        body: send(turn.request),
      });
      update(turn.id, { state: "waiting", job: id, polls: 0 });
    } catch (error) {
      update(turn.id, { state: "failed", error: friendlyError(error, { auto: false }).message });
    } finally {
      finish();
    }
  }
  function retry(turn: Turn) {
    if (turn.job) return update(turn.id, { state: "waiting", error: undefined, polls: 1 });
    update(turn.id, { state: "sending", error: undefined });
    void sendTurn(turn);
  }

  function ask(value: string) {
    if (!config.aiEnabled) return (setNote(offMessage), false);
    const prompt = withoutMention(value);
    if (!prompt) return (setNote("ask jot ai something after @jotai."), false);
    if (byteLength(prompt) > aiChatLimits.prompt)
      return (setNote("that's a long question. try a shorter one."), false);
    if (thinking) return (setNote("jot ai is still on the last one."), false);
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) return false;
    const { target, text } = chatTarget(editor);
    if (byteLength(text) > writingRequestLimit)
      return (
        setNote(
          target.scope === "page"
            ? "this page is too long for jot ai. select a part and ask about that."
            : "that selection is too long for jot ai. select less.",
        ),
        false
      );
    const done = turns.filter((turn) => turn.state === "done");
    const turn: Turn = {
      id: nextId++,
      prompt,
      target,
      state: "sending",
      request: {
        postId: post.id,
        mode: "chat",
        prompt,
        context: context?.text ?? "",
        text,
        title: snapshot.title,
        subtitle: snapshot.subtitle,
        scope: target.scope,
        history: chatHistory(
          done.map((item) => ({ prompt: item.prompt, reply: item.result?.reply })),
        ),
      },
    };
    setTurns((all) => [...all, turn]);
    setOpen(true);
    void sendTurn(turn);
    return true;
  }

  function addLine(value: string) {
    const editor = editorRef.current;
    if (!editor || editor.isDestroyed) return false;
    if (busy || isOperationBlocked())
      return (setNote("the page is busy. try again in a moment."), false);
    appendMarkdown(editor, value);
    if (markdownView) showMarkdown(false);
    requestAnimationFrame(() => {
      const page = scroller.current;
      page?.scrollTo?.({
        top: page.scrollHeight,
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
      });
    });
    return true;
  }

  function submit() {
    const value = draft.trim();
    if (!value) return;
    if (hasMention(value) ? ask(value) : addLine(value)) {
      setDraft("");
      setNote("");
      setMenu(null);
    }
  }

  function apply(turn: Turn, whole = false) {
    const editor = editorRef.current,
      result = turn.result;
    if (!editor || editor.isDestroyed || !result) return;
    if (busy || isOperationBlocked())
      return update(turn.id, { notice: "the page is busy. try again in a moment." });
    if (result.edit !== null && !whole && !targetHolds(editor, turn.target, turn.request.text))
      return update(turn.id, { proposal: "stale", notice: undefined });
    const patch: Partial<Snapshot> = {};
    if (result.title !== null) {
      patch.title = result.title.replace(/\s+/g, " ").trim().slice(0, limits.title);
      // An unpublished page's address follows its title, as typing a title does.
      if (
        !(post.reservedSlug || post.published?.slug) &&
        (!snapshot.slug || snapshot.slug === slugify(snapshot.title))
      )
        patch.slug = slugify(patch.title);
    }
    if (result.subtitle !== null) patch.subtitle = result.subtitle.slice(0, limits.subtitle);
    const header = Object.fromEntries(
      Object.keys(patch).map((key) => [key, snapshot[key as keyof Snapshot]]),
    ) as Partial<Snapshot>;
    if (result.edit !== null)
      replaceWithMarkdown(editor, whole ? { scope: "page" } : turn.target, result.edit);
    if (Object.keys(patch).length) updateDraft(patch);
    undos.current.set(turn.id, { doc: result.edit !== null ? editor.state.doc : null, header });
    update(turn.id, { proposal: "applied", notice: undefined });
  }
  function undo(turn: Turn) {
    const editor = editorRef.current,
      saved = undos.current.get(turn.id);
    if (!editor || editor.isDestroyed || !saved) return;
    if (saved.doc && editor.state.doc !== saved.doc)
      return update(turn.id, { notice: "the page changed since. press cmd+z to step back." });
    if (saved.doc) editor.commands.undo();
    if (Object.keys(saved.header).length) updateDraft(saved.header);
    undos.current.delete(turn.id);
    update(turn.id, { proposal: "open", notice: undefined });
  }
  function copy(turn: Turn) {
    const result = turn.result;
    const value = [result?.title, result?.subtitle, result?.edit].filter(Boolean).join("\n\n");
    void navigator.clipboard
      ?.writeText(value)
      .then(() => update(turn.id, { notice: "copied" }))
      .catch(() => update(turn.id, { notice: "couldn't copy. select the preview and copy it." }));
  }

  function keepContext(value: string, name?: string) {
    const clipped = clipBytes(value, aiChatLimits.context);
    setContextNote(
      clipped.length < value.length
        ? `context keeps its first ${aiChatLimits.context.toLocaleString("en")} bytes.`
        : "",
    );
    setContext(clipped.trim() ? { text: clipped, name } : null);
  }
  async function attach(file: File) {
    if (!/\.(md|markdown|txt)$/i.test(file.name))
      return setContextNote("attach a .md or .txt file.");
    // Far past the limit, as Markdown imports are; reading it would only be cut down again.
    if (file.size > 1024 * 1024) return setContextNote("context files must be smaller than 1 MB.");
    try {
      const value = await file.text();
      keepContext(
        context?.text ? `${context.text}\n\n${value}` : value,
        context?.text ? undefined : file.name,
      );
    } catch {
      setContextNote("couldn't read that file.");
    }
  }

  function pick() {
    if (!menu) return;
    const next = `${draft.slice(0, menu.start)}${mention} ${draft.slice(menu.end).replace(/^\s+/, "")}`;
    const caret = menu.start + mention.length + 1;
    setDraft(next);
    setMenu(null);
    setNote("");
    requestAnimationFrame(() => {
      box.current?.focus();
      box.current?.setSelectionRange(caret, caret);
    });
  }
  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent?.isComposing) return;
    if (menu) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") return event.preventDefault();
      if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey) {
        event.preventDefault();
        return pick();
      }
      if (event.key === "Escape") {
        event.preventDefault();
        return setMenu(null);
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") event.currentTarget.blur();
  }

  const chat = hasMention(draft);
  const contextWords = context ? countWords(context.text) : 0;
  return (
    <div
      hidden={hidden}
      style={inset ? { bottom: inset } : undefined}
      className="pointer-events-none absolute inset-x-0 bottom-0 z-10 px-3 pb-3 sm:px-6 sm:pb-5"
    >
      <div className={cn("pointer-events-auto mx-auto w-full", className)}>
        {turns.length > 0 && (
          <section
            aria-label="jot ai"
            className={cn("mb-2 overflow-hidden rounded-2xl bg-white", chipShadow)}
          >
            <div className="flex items-center gap-1 py-1 pl-3 pr-1">
              <Sparkle
                weight="fill"
                aria-hidden="true"
                className="size-3.5"
                style={{ color: hues.violet }}
              />
              <span className="mr-auto text-xs font-semibold">jot ai</span>
              <button
                type="button"
                aria-label={open ? "Collapse chat" : "Expand chat"}
                aria-expanded={open}
                aria-controls="jotai-thread"
                onClick={() => setOpen(!open)}
                className={cn(quietButton, "size-7 justify-center px-0")}
              >
                <CaretDown
                  weight="bold"
                  aria-hidden="true"
                  className={cn("size-3.5 transition-transform", !open && "rotate-180")}
                />
              </button>
              <button
                type="button"
                aria-label="Clear chat"
                onClick={() => {
                  setTurns([]);
                  undos.current.clear();
                }}
                className={cn(quietButton, "size-7 justify-center px-0")}
              >
                <X weight="bold" aria-hidden="true" className="size-3.5" />
              </button>
            </div>
            <ol
              ref={list}
              id="jotai-thread"
              hidden={!open}
              aria-live="polite"
              className="max-h-[min(38svh,26rem)] space-y-3 overflow-y-auto overscroll-contain border-t border-border px-3 py-3 sm:max-h-[min(45svh,26rem)]"
            >
              {turns.map((turn) => (
                <li key={turn.id} className="space-y-2">
                  <div className="flex flex-col items-end gap-1">
                    {turn.target.scope === "selection" && (
                      <span className="text-[11px] text-muted-foreground">about the selection</span>
                    )}
                    <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-ink px-3 py-1.5 text-sm leading-6 text-white">
                      {turn.prompt}
                    </p>
                  </div>
                  <Answer
                    turn={turn}
                    onRetry={() => retry(turn)}
                    onApply={(whole) => apply(turn, whole)}
                    onDiscard={() => update(turn.id, { proposal: "discarded", notice: undefined })}
                    onUndo={() => undo(turn)}
                    onCopy={() => copy(turn)}
                  />
                </li>
              ))}
            </ol>
          </section>
        )}
        {contextOpen ? (
          <div className={cn("mb-2 rounded-2xl bg-white p-1.5", chipShadow)}>
            <label className="sr-only" htmlFor="jotai-context">
              context for jot ai
            </label>
            <textarea
              id="jotai-context"
              autoFocus
              value={context?.text ?? ""}
              rows={4}
              onChange={(event) => keepContext(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                setContextOpen(false);
                box.current?.focus();
              }}
              placeholder="paste notes, an outline or a transcript"
              className="block max-h-40 w-full resize-none bg-transparent px-2.5 py-2 text-sm leading-6 outline-none placeholder:text-muted-foreground"
            />
            <div className="flex flex-wrap items-center gap-1.5 px-1 pt-1">
              <label className={cn(quietButton, "focus-within:ring-3 focus-within:ring-sky/50")}>
                <FileText
                  weight="bold"
                  aria-hidden="true"
                  className="size-3.5"
                  style={{ color: hues.grass }}
                />
                attach .md or .txt
                <input
                  type="file"
                  aria-label="Attach a context file"
                  accept=".md,.markdown,.txt,text/markdown,text/plain"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void attach(file);
                    event.target.value = "";
                  }}
                />
              </label>
              {contextNote && (
                <span role="status" className="text-xs text-muted-foreground">
                  {contextNote}
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  setContextOpen(false);
                  box.current?.focus();
                }}
                className={cn(darkButton, "ml-auto")}
              >
                done
              </button>
            </div>
          </div>
        ) : (
          (context || contextNote) && (
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {context && (
                <span className={cn(chip, "h-7 max-w-full pl-1 pr-1 text-xs")}>
                  <button
                    type="button"
                    onClick={() => setContextOpen(true)}
                    className="inline-flex min-w-0 cursor-pointer items-center gap-1.5 rounded-full px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-sky"
                  >
                    <Paperclip
                      weight="bold"
                      aria-hidden="true"
                      className="size-3.5 shrink-0"
                      style={{ color: hues.grass }}
                    />
                    <span className="truncate font-medium">
                      {context.name ||
                        `context · ${contextWords.toLocaleString("en")} ${contextWords === 1 ? "word" : "words"}`}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Remove context"
                    onClick={() => {
                      setContext(null);
                      setContextNote("");
                    }}
                    className="grid size-5 shrink-0 cursor-pointer place-items-center rounded-full outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-sky"
                  >
                    <X weight="bold" aria-hidden="true" className="size-3" />
                  </button>
                </span>
              )}
              {contextNote && (
                <span role="status" className="text-xs text-muted-foreground">
                  {contextNote}
                </span>
              )}
            </div>
          )
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="relative"
        >
          {menu && (
            <ul
              id="jotai-menu"
              role="listbox"
              aria-label="Mentions"
              className={cn(
                "absolute bottom-full left-10 mb-2 w-64 max-w-[calc(100%-3rem)] rounded-2xl bg-white p-1",
                chipShadow,
              )}
            >
              <li
                id="jotai-option"
                role="option"
                aria-selected="true"
                aria-disabled={!config.aiEnabled || undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={pick}
                className="flex cursor-pointer items-start gap-2 rounded-xl bg-sky-soft/70 px-2.5 py-2"
              >
                <Sparkle
                  weight="fill"
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                  style={{ color: hues.violet }}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold" style={{ color: hues.violet }}>
                    {mention}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {!config.aiEnabled
                      ? offMessage
                      : emptyPage
                        ? "have it write the post, or ask anything"
                        : "ask about the page or the selection"}
                  </span>
                </span>
              </li>
            </ul>
          )}
          {note && (
            <p role="status" className="mb-2 px-2 text-xs font-medium text-muted-foreground">
              {note}
            </p>
          )}
          <div
            className={cn(
              "flex items-end gap-1.5 rounded-3xl bg-white p-1.5 transition-shadow focus-within:shadow-[0_0_0_2px_var(--sky),0_4px_12px_-4px_rgba(0,0,0,.18)]",
              chipShadow,
            )}
          >
            <button
              type="button"
              aria-label="Add context"
              title="add context"
              aria-expanded={contextOpen}
              onClick={() => setContextOpen(!contextOpen)}
              className={roundIcon}
            >
              <Paperclip
                weight="bold"
                aria-hidden="true"
                className="size-4"
                style={{ color: hues.grass }}
              />
            </button>
            <label className="relative min-w-0 flex-1 px-1">
              <span className="sr-only">add a line to the page, or ask @jotai</span>
              {chat && (
                <div
                  ref={mirror}
                  aria-hidden="true"
                  className={cn(
                    field,
                    "pointer-events-none absolute inset-0 overflow-hidden px-1 text-ink",
                  )}
                >
                  {draft.split(/((?<=^|\s)@jotai(?![\w-]))/i).map((part, index) =>
                    index % 2 ? (
                      <span
                        key={index}
                        className="rounded-[4px] bg-[#7c4dcc]/12 text-[#7c4dcc] shadow-[0_0_0_2px_rgba(124,77,204,.12)]"
                      >
                        {part}
                      </span>
                    ) : (
                      part
                    ),
                  )}{" "}
                </div>
              )}
              <textarea
                ref={box}
                rows={1}
                value={draft}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={!!menu}
                aria-controls={menu ? "jotai-menu" : undefined}
                aria-activedescendant={menu ? "jotai-option" : undefined}
                onChange={(event) => {
                  const value = event.target.value;
                  setDraft(value);
                  setNote("");
                  setMenu(mentionAt(value, event.target.selectionStart ?? value.length));
                }}
                onKeyDown={keyDown}
                onBlur={() => setMenu(null)}
                onScroll={(event) => {
                  if (mirror.current) mirror.current.scrollTop = event.currentTarget.scrollTop;
                }}
                placeholder={
                  emptyPage
                    ? "type a line, or @jotai write a post about..."
                    : "type a line, or ask @jotai"
                }
                className={cn(
                  field,
                  "relative block max-h-32 w-full resize-none overflow-y-auto bg-transparent outline-none placeholder:text-muted-foreground",
                  chat && "text-transparent caret-ink [scrollbar-width:none]",
                )}
              />
            </label>
            <button
              type="submit"
              aria-label={chat ? "Ask jot ai" : "Add to page"}
              disabled={!draft.trim()}
              className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-ink text-white outline-none transition-[opacity,transform] focus-visible:ring-3 focus-visible:ring-sky/50 active:scale-90 disabled:cursor-default disabled:opacity-35 motion-reduce:active:scale-100"
            >
              {chat ? (
                <Sparkle weight="fill" aria-hidden="true" className="size-4" />
              ) : (
                <ArrowUp weight="bold" aria-hidden="true" className="size-4" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** jot ai's side of one turn: thinking, an error with retry, or the reply and any proposal. */
function Answer({
  turn,
  onRetry,
  onApply,
  onDiscard,
  onUndo,
  onCopy,
}: {
  turn: Turn;
  onRetry: () => void;
  onApply: (whole?: boolean) => void;
  onDiscard: () => void;
  onUndo: () => void;
  onCopy: () => void;
}) {
  const result = turn.result;
  return (
    <div className="flex gap-2">
      <span className={cn(chip, "mt-0.5 size-6 justify-center")}>
        <Sparkle
          weight="fill"
          aria-hidden="true"
          className="size-3.5"
          style={{ color: hues.violet }}
        />
      </span>
      <div className="min-w-0 flex-1 text-sm leading-6">
        {turn.state === "sending" || turn.state === "waiting" ? (
          <p role="status" className="flex items-center gap-1.5 text-muted-foreground">
            thinking
            <span aria-hidden="true" className="flex gap-0.5">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="size-1 animate-pulse rounded-full bg-[#7c4dcc] motion-reduce:animate-none"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </span>
          </p>
        ) : turn.state === "failed" ? (
          <div className="flex flex-wrap items-center gap-2">
            <p role="alert" className="text-destructive">
              {turn.error}
            </p>
            <button type="button" onClick={onRetry} className={quietButton}>
              retry
            </button>
          </div>
        ) : (
          <>
            {result?.reply && <p className="whitespace-pre-wrap break-words">{result.reply}</p>}
            {result && turn.proposal && (
              <Proposal
                turn={turn}
                result={result}
                onApply={onApply}
                onDiscard={onDiscard}
                onUndo={onUndo}
                onCopy={onCopy}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** A proposed change: what it touches and how long it runs, a preview, and apply or discard. */
function Proposal({
  turn,
  result,
  onApply,
  onDiscard,
  onUndo,
  onCopy,
}: {
  turn: Turn;
  result: AIChatResult;
  onApply: (whole?: boolean) => void;
  onDiscard: () => void;
  onUndo: () => void;
  onCopy: () => void;
}) {
  const scope = turn.target.scope === "selection" ? "selection" : "page";
  const parts = [
    result.title !== null && "title",
    result.subtitle !== null && "subtitle",
    result.edit !== null && scope,
  ].filter(Boolean);
  const before = countWords(turn.request.text),
    after = result.edit === null ? 0 : countWords(result.edit);
  return (
    <div aria-label="Proposed edit" role="group" className="mt-2 rounded-xl bg-background p-2.5">
      <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
        <PencilSimple
          weight="bold"
          aria-hidden="true"
          className="size-3.5"
          style={{ color: hues.violet }}
        />
        <span className="font-semibold">edit for the {parts.join(" and ")}</span>
        {result.edit !== null && (
          <span className="text-muted-foreground">
            · {before.toLocaleString("en")} → {after.toLocaleString("en")} words
          </span>
        )}
      </p>
      <details className="group mt-1.5">
        <summary className="inline-flex cursor-pointer select-none items-center gap-1 rounded text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-sky">
          <CaretDown
            weight="bold"
            aria-hidden="true"
            className="size-3 -rotate-90 transition-transform group-open:rotate-0"
          />
          preview
        </summary>
        <div className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-white p-2.5 text-[13px] leading-5">
          {result.title !== null && <p className="font-semibold">{result.title}</p>}
          {result.subtitle !== null && <p className="text-muted-foreground">{result.subtitle}</p>}
          {result.edit !== null && (
            <p className={cn((result.title !== null || result.subtitle !== null) && "mt-2")}>
              {result.edit}
            </p>
          )}
        </div>
      </details>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {turn.proposal === "open" && (
          <>
            <button type="button" onClick={() => onApply()} className={darkButton}>
              apply
            </button>
            <button type="button" onClick={onDiscard} className={quietButton}>
              discard
            </button>
          </>
        )}
        {turn.proposal === "stale" && (
          <>
            <p className="w-full text-xs text-muted-foreground">
              the page changed since you asked.
            </p>
            {/* A selection's edit covers only that part, so it never replaces the page. */}
            {turn.request.scope === "page" && (
              <button type="button" onClick={() => onApply(true)} className={darkButton}>
                replace the whole page
              </button>
            )}
            <button type="button" onClick={onCopy} className={quietButton}>
              <Copy weight="bold" aria-hidden="true" className="size-3.5" />
              copy
            </button>
            <button type="button" onClick={onDiscard} className={quietButton}>
              discard
            </button>
          </>
        )}
        {turn.proposal === "applied" && (
          <>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-grass-3">
              <Check weight="bold" aria-hidden="true" className="size-3.5" />
              applied
            </span>
            <button type="button" onClick={onUndo} className={quietButton}>
              undo
            </button>
          </>
        )}
        {turn.proposal === "discarded" && (
          <span className="text-xs text-muted-foreground">discarded</span>
        )}
        {turn.notice && (
          <span role="status" className="text-xs text-muted-foreground">
            {turn.notice}
          </span>
        )}
      </div>
    </div>
  );
}
