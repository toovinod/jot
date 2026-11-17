"use client";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { MagnifyingGlass, Plus, X } from "@phosphor-icons/react";
import type { Post, PostSummary } from "@jot/contracts";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { liveStatus, loadAllMine } from "@/lib/dashboard-stats";
import { cn } from "@/lib/utils";
import { useSession } from "../providers";
import { JotMark } from "../brand/logo";
import { Avatar } from "../post-parts";
import { Sheet, SheetContent, SheetTitle } from "../ui/sheet";
import { Skeleton } from "../ui/skeleton";
import { Critter } from "../world/critters";
import {
  StatusDot,
  chip,
  chipShadow,
  critterFor,
  pageLine,
  useWide,
  type PageState,
} from "./page-look";

type LiveRow = { title: string; status: PageState; line: string };
// The writer's pages stay here between editor pages, so switching shows the list at once. `live`
// keeps what the open pages became since the list loaded, until the next load brings it.
let cached: { user: string; posts: PostSummary[]; live: Record<string, LiveRow> } | null = null;

/** Every one of the writer's pages, the way the dashboard loads them for its totals. */
function useMyPages(user: string | undefined) {
  const [posts, setPosts] = useState(() => (cached && cached.user === user ? cached.posts : null));
  const [kept, setKept] = useState(() => (cached && cached.user === user ? cached.live : {}));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!user) return;
    setFailed(false);
    const controller = new AbortController();
    loadAllMine(
      async (offset, limit) =>
        (
          await api<{ posts: PostSummary[] }>(`/posts?scope=mine&offset=${offset}&limit=${limit}`, {
            signal: controller.signal,
          })
        ).posts,
    ).then(
      (list) => {
        cached = { user, posts: list, live: {} };
        setPosts(list);
        setKept({});
        setFailed(false);
      },
      () => !controller.signal.aborted && setFailed(true),
    );
    return () => controller.abort();
  }, [user, attempt]);
  return { posts, kept, failed, reload: () => setAttempt((value) => value + 1) };
}

const stateOf = (post: PostSummary): PageState =>
  !post.isPublished && post.scheduledAt ? "scheduled" : liveStatus(post);

const roundButton = cn(
  "grid size-8 shrink-0 cursor-pointer place-items-center rounded-full bg-white text-ink outline-none transition-colors hover:bg-sky-soft focus-visible:ring-3 focus-visible:ring-sky/50 disabled:cursor-not-allowed disabled:opacity-50",
  chipShadow,
);

export type PagesPaneProps = {
  currentId: string;
  /** The open page as it is now, so its row follows the title being typed. */
  live?: LiveRow;
  /** Leaves for another page; the editor saves first. */
  navigate: (path: string) => void;
  /** Saves the open page before a new one is made, so a failed save stops it. */
  prepare?: () => Promise<void>;
  /** True while the open page can't be left, such as during an upload. */
  disabled?: boolean;
};

/** The writer's pages, as in the landing demo: search, a new page, and one row per page. */
export function PagesPane({
  currentId,
  live,
  navigate,
  prepare,
  disabled = false,
  onPick,
}: PagesPaneProps & { onPick?: () => void }) {
  const { user } = useSession();
  const { posts, kept, failed, reload } = useMyPages(user?.id);
  const [searching, setSearching] = useState(false),
    [query, setQuery] = useState(""),
    [creating, setCreating] = useState(false),
    [error, setError] = useState("");
  const busy = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // The list kept for the next page shows what the open page became, until a load brings it.
  // The next page renders before this one leaves, so this keeps up as the title changes.
  useEffect(() => {
    if (live && cached && cached.user === user?.id)
      cached = { ...cached, live: { ...cached.live, [currentId]: live } };
  }, [posts, currentId, user?.id, live?.title, live?.status, live?.line]);
  // While a new page is being made, the other rows wait, so only one move can win.
  const locked = disabled || creating;
  function go(event: MouseEvent, path: string) {
    // A modified click opens a new tab and leaves this page alone.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    if (locked || path === `/editor/${currentId}`) return;
    onPick?.();
    navigate(path);
  }
  async function create() {
    if (busy.current || disabled) return;
    busy.current = true;
    setCreating(true);
    setError("");
    try {
      try {
        await prepare?.();
      } catch (e) {
        // The save notice sits outside the sheet on small screens, so say it here too.
        if (mounted.current)
          setError(
            `this page didn't save, so no new page yet. ${friendlyError(e, { auto: false }).message}`,
          );
        return;
      }
      const post = await api<Post>("/posts", { method: "POST" });
      // Closed or replaced while the page was being made: the new page waits in the list.
      if (!mounted.current) return;
      onPick?.();
      navigate(`/editor/${post.id}`);
    } catch (e) {
      if (mounted.current) setError(friendlyError(e, { auto: false }).message);
    } finally {
      busy.current = false;
      if (mounted.current) setCreating(false);
    }
  }
  const term = query.trim().toLowerCase();
  const rows = (posts || [])
    .map((post) => {
      const current = (post.id === currentId && live) || kept[post.id];
      return {
        id: post.id,
        title: (current ? current.title : post.title).trim(),
        status: current ? current.status : stateOf(post),
        line: current
          ? current.line
          : pageLine({
              status: stateOf(post),
              views: post.views,
              scheduledAt: post.scheduledAt,
              updatedAt: post.updatedAt,
            }),
      };
    })
    .filter((row) => (row.title || "untitled").toLowerCase().includes(term));
  return (
    <nav aria-label="Your pages" className="flex h-full min-h-0 flex-col gap-1 p-3">
      <div className="mb-1 flex h-9 shrink-0 items-center gap-1.5">
        <a
          href="/dashboard"
          aria-label="Back to your library"
          title="your library"
          onClick={(event) => go(event, "/dashboard")}
          className={cn(
            "mr-auto grid size-8 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-sky/50",
            searching && "hidden",
          )}
        >
          <JotMark className="size-6 text-ink" />
        </a>
        <AnimatePresence initial={false} mode="popLayout">
          {searching ? (
            <motion.label
              key="search"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              className={cn(
                "flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-white pl-2.5 pr-1 focus-within:shadow-[0_0_0_2px_var(--sky)]",
                chipShadow,
              )}
            >
              <MagnifyingGlass
                weight="bold"
                aria-hidden="true"
                className="size-4 shrink-0 text-[#1677c9]"
              />
              <span className="sr-only">Search pages</span>
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Escape") return;
                  event.stopPropagation();
                  setSearching(false);
                  setQuery("");
                }}
                placeholder="search"
                className="min-w-0 flex-1 bg-transparent text-sm outline-none"
              />
              <button
                type="button"
                aria-label="Close search"
                onClick={() => {
                  setSearching(false);
                  setQuery("");
                }}
                className="grid size-6 cursor-pointer place-items-center rounded-full outline-none hover:bg-background focus-visible:ring-2 focus-visible:ring-sky"
              >
                <X weight="bold" className="size-3" />
              </button>
            </motion.label>
          ) : (
            <motion.button
              key="open"
              type="button"
              aria-label="Search pages"
              title="search"
              onClick={() => setSearching(true)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={roundButton}
            >
              <MagnifyingGlass weight="bold" className="size-4 text-[#1677c9]" />
            </motion.button>
          )}
        </AnimatePresence>
        <button
          type="button"
          aria-label="New page"
          title="new page"
          disabled={creating || disabled}
          onClick={() => void create()}
          className={cn(
            roundButton,
            "transition-[background-color,transform] hover:rotate-90 motion-reduce:transform-none",
          )}
        >
          <Plus weight="bold" className="size-4 text-[#ff4f8b]" />
        </button>
      </div>
      {error && (
        <p role="alert" className="px-2 pb-1 text-xs text-destructive">
          {error}
        </p>
      )}
      <ul className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 py-0.5">
        {!posts && !failed
          ? Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="flex items-center gap-3 p-2">
                <Skeleton className="size-10 shrink-0" />
                <Skeleton className="h-8 flex-1" />
              </li>
            ))
          : rows.map((row) => {
              const on = row.id === currentId;
              const path = `/editor/${row.id}`;
              return (
                <li key={row.id}>
                  <Link
                    href={path}
                    aria-current={on ? "page" : undefined}
                    aria-disabled={(locked && !on) || undefined}
                    onClick={(event) => go(event, path)}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-xl p-2 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-sky/50",
                      on
                        ? "bg-white shadow-[0_0_0_1px_var(--border),0_2px_0_var(--border)]"
                        : "hover:bg-white/70",
                      locked && !on && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-xl bg-white",
                        chipShadow,
                      )}
                    >
                      <Critter
                        kind={critterFor(row.id)}
                        className="size-7 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:-rotate-6 motion-reduce:transform-none"
                      />
                    </span>
                    <span className="min-w-0">
                      <span
                        className={cn(
                          "block truncate text-sm font-medium",
                          !row.title && "text-muted-foreground",
                        )}
                      >
                        {row.title || "untitled"}
                      </span>
                      <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        <StatusDot status={row.status} />
                        <span className="truncate">{row.line}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
      </ul>
      {failed && (
        <p
          role="status"
          className="flex items-center gap-1 px-2 py-2 text-xs text-muted-foreground"
        >
          {posts ? "couldn't refresh your pages." : "couldn't load your pages."}
          <button
            type="button"
            onClick={reload}
            className="cursor-pointer rounded-full px-1.5 font-medium text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-sky"
          >
            retry
          </button>
        </p>
      )}
      {posts && !rows.length && term && (
        <p className="px-2 py-3 text-sm text-muted-foreground">
          no page called &quot;{query.trim()}&quot;.
        </p>
      )}
      {user && (
        <div className={cn(chip, "mt-2 shrink-0 p-1.5 pr-3 text-xs")}>
          <Avatar user={user} size="small" />
          <span className="min-w-0 truncate font-medium">{user.username}</span>
          {posts && (
            <span className="ml-auto shrink-0 text-muted-foreground">
              {posts.length} {posts.length === 1 ? "page" : "pages"}
            </span>
          )}
        </div>
      )}
    </nav>
  );
}

/**
 * The pages pane at the window's left edge: a column on wide screens that can be hidden, and a
 * sheet from the left on smaller ones, so the writing keeps the room.
 */
export function PagesColumn({
  open,
  onOpenChange,
  ...props
}: PagesPaneProps & {
  /** Wide screens: whether the column shows. Smaller ones: whether the sheet is open. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const wide = useWide();
  const opener = useRef<HTMLElement | null>(null);
  if (wide)
    return (
      <aside
        id="editor-pages"
        hidden={!open}
        className="h-full w-[248px] shrink-0 border-r border-border bg-background/50"
      >
        <PagesPane {...props} />
      </aside>
    );
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        id="editor-pages"
        side="left"
        showCloseButton={false}
        aria-describedby={undefined}
        // Closing hands focus back to the button that opened the sheet, as the settings sheet does.
        onOpenAutoFocus={() => {
          opener.current = document.activeElement as HTMLElement | null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          opener.current?.focus();
        }}
        className="w-[288px] gap-0 bg-background p-0"
      >
        <SheetTitle className="sr-only">Your pages</SheetTitle>
        <PagesPane {...props} onPick={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}
