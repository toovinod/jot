"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { postPath, type Post, type PostSummary } from "@jot/contracts";
import {
  ArrowUpRight,
  BookmarkSimple,
  Eye,
  Globe,
  Heart,
  MagnifyingGlass,
  NotePencil,
  PencilSimpleLine,
  Plus,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { usePostCollection } from "@/hooks/use-post-collection";
import { cn, date } from "@/lib/utils";
import {
  liveStatus,
  loadAllMine,
  matches,
  summarize,
  type DashboardStats,
  type Filter,
} from "@/lib/dashboard-stats";
import { useSession } from "@/components/providers";
import { AppShell, Private, Loading } from "@/components/shell";
import {
  EmptyState,
  NotchedCard,
  PageBody,
  SceneHeader,
  SectionHeader,
  StatTile,
  StatusBadge,
  Toolbar,
  ToolbarButton,
} from "@/components/app";
import { Button } from "@/components/ui/button";
import { ErrorMessage, Input } from "@/components/ui/fields";
import { Skeleton } from "@/components/ui/skeleton";
import { PostCard } from "@/components/post-card";
import { raised } from "@/components/app/pill";
import { Critter } from "@/components/world/critters";
import { greetings, pick, rotate, rotationMs, rowLook, standing, tabTitles } from "./flavor";

/** Why a scheduled publish was refused; owner-only, read defensively until contracts carry it. */
const scheduleError = (post: PostSummary) => post.scheduleError;

export default function Dashboard() {
  return (
    <Suspense fallback={<Loading />}>
      <Private>
        <DashboardContent />
      </Private>
    </Suspense>
  );
}

// Each filter wears its status pill's dot.
const filters: { value: Filter; label: string; dot?: string }[] = [
  { value: "all", label: "all" },
  { value: "live", label: "live", dot: "bg-grass-2" },
  { value: "drafts", label: "drafts", dot: "bg-[#ffb020]" },
  { value: "unlisted", label: "unlisted", dot: "bg-[#7c4ddb]" },
];

function useStats(enabled: boolean) {
  const [state, setState] = useState<{ stats: DashboardStats | null; failed: boolean }>({
    stats: null,
    failed: false,
  });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    loadAllMine(
      async (offset, limit) =>
        (
          await api<{ posts: PostSummary[] }>(`/posts?scope=mine&offset=${offset}&limit=${limit}`, {
            signal: controller.signal,
          })
        ).posts,
    ).then(
      (posts) => setState({ stats: summarize(posts), failed: false }),
      () => !controller.signal.aborted && setState({ stats: null, failed: true }),
    );
    return () => controller.abort();
  }, [enabled]);
  return state;
}

/** One of the writer's pages: its own critter, title and address, tags, then badges and reads. */
function PageRow({ post }: { post: PostSummary }) {
  const status = liveStatus(post);
  const look = rowLook(post.id);
  const failure = scheduleError(post);
  return (
    <Link
      href={`/editor/${post.id}`}
      aria-label={`Edit ${post.title || "untitled page"}`}
      className="group grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 outline-none transition-colors hover:bg-background focus-visible:bg-sky-soft/60 md:px-5"
    >
      <span
        className="grid size-11 place-items-center rounded-xl shadow-[inset_0_-2px_0_rgba(0,0,0,.05)]"
        style={{ background: look.tint }}
      >
        <Critter
          kind={look.kind}
          className="size-7 transition-transform duration-300 ease-[cubic-bezier(.3,.7,.4,1.6)] group-hover:-translate-y-0.5 group-hover:-rotate-12 group-hover:scale-110 motion-reduce:transform-none"
        />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-medium tracking-[-0.01em] transition-colors group-hover:text-sky-deep">
          {post.title || "untitled"}
        </span>
        <span className="mt-1 flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate font-mono">
            {post.isPublished ? postPath(post.author.username, post.slug) : "not published yet"}
          </span>
          {post.tags?.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="hidden shrink-0 rounded-full bg-[#eaf6ff] px-2 py-0.5 font-mono text-[11px] text-[#1677c9] lg:inline"
            >
              #{tag}
            </span>
          ))}
        </span>
      </span>
      <span className="flex items-center gap-2.5">
        {failure && (
          <StatusBadge status="failed" title={failure}>
            schedule failed
          </StatusBadge>
        )}
        {post.scheduledAt && (
          <StatusBadge status="scheduled">
            scheduled {date(post.scheduledAt).toLowerCase()}
          </StatusBadge>
        )}
        <StatusBadge status={status} className="hidden sm:inline-flex" />
        {post.isPublished && (
          <span
            title="reads"
            className="hidden w-14 items-center justify-end gap-1 font-mono text-xs text-muted-foreground sm:inline-flex"
          >
            <Eye weight="bold" aria-hidden="true" className="size-3.5 text-[#1677c9]" />
            {(post.views || 0).toLocaleString()}
            <span className="sr-only">reads</span>
          </span>
        )}
        <span className="hidden w-24 text-right text-xs text-muted-foreground md:block">
          {date(post.updatedAt).toLowerCase()}
        </span>
        <ArrowUpRight
          weight="bold"
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-sky-deep motion-reduce:transform-none"
        />
      </span>
    </Link>
  );
}

function DashboardContent() {
  const { user } = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const tab = search.get("tab") === "bookmarks" ? "bookmarks" : "mine";
  const [filter, setFilter] = useState<Filter>("all"),
    [query, setQuery] = useState(""),
    [searched, setSearched] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const creatingStory = useRef(false);
  async function createStory() {
    if (creatingStory.current) return;
    creatingStory.current = true;
    setBusy(true);
    setError("");
    try {
      const post = await api<Post>("/posts", { method: "POST" });
      router.push(`/editor/${post.id}`);
    } catch (e) {
      setError(friendlyError(e, { auto: false }).message);
      setBusy(false);
      creatingStory.current = false;
    }
  }
  const term = tab === "mine" ? query.trim() : "";
  const {
    items: posts,
    loading,
    error: loadError,
    hasMore,
    loadMore,
  } = usePostCollection(
    term ? `scope=mine&q=${encodeURIComponent(term)}` : `scope=${tab}`,
    20,
    term ? 250 : 0,
  );
  const { stats, failed } = useStats(tab === "mine");
  useEffect(() => {
    if (new URLSearchParams(location.search).get("new") === "1") {
      history.replaceState(null, "", "/dashboard");
      void createStory();
    }
  }, [search]);
  const visible = posts.filter((post) => matches(post, filter));
  // Once the writer searches, keep the search box mounted so typing never loses focus.
  const toolbar = tab === "mine" && (posts.length > 0 || searched);
  const firstName = (user?.name || user?.username || "").split(" ")[0].toLowerCase();
  // Rolled on arrival, then a new one every few seconds, like the tab title. Private renders
  // this only after the session loads in the browser, so no server render can disagree.
  const [hello, setHello] = useState(() => pick(greetings(firstName, new Date()), Math.random()));
  const [roll] = useState(Math.random);
  useEffect(() => {
    const previous = document.title;
    document.title = pick(tabTitles, Math.random());
    const timer = setInterval(() => {
      setHello((current) => rotate(greetings(firstName, new Date()), current, Math.random()));
      document.title = rotate(tabTitles, document.title, Math.random());
    }, rotationMs);
    return () => {
      clearInterval(timer);
      // The next page may have set its own title already; only put back what this replaced.
      if ((tabTitles as readonly string[]).includes(document.title)) document.title = previous;
    };
  }, [firstName]);
  const status =
    tab === "bookmarks"
      ? "pages you saved to come back to."
      : stats
        ? pick(standing(stats), roll)
        : "here's everything you've been writing.";
  const count = `${posts.length}${hasMore ? "+" : ""}`;

  return (
    <AppShell active={tab}>
      <SceneHeader
        title={
          tab === "bookmarks" ? (
            "your bookmarks."
          ) : (
            <span
              key={hello}
              aria-live="off"
              className="inline-block motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500"
            >
              {hello}
            </span>
          )
        }
        subtitle={status}
        cast={
          tab === "bookmarks"
            ? ["bookmark", "heart", "book", "star"]
            : ["pencil", "plane", "page", "cloud"]
        }
        actions={
          tab === "mine" ? (
            <Button onClick={createStory} disabled={busy}>
              <Plus weight="bold" />
              {busy ? "opening a blank page…" : "new page"}
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link href="/discover">find more to read</Link>
            </Button>
          )
        }
      />
      <PageBody>
        {tab === "mine" && (
          <div className="relative -mt-14 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              icon={Globe}
              tone="grass"
              label="pages live"
              value={stats?.live}
              failed={failed}
              critter="plane"
            />
            <StatTile
              icon={NotePencil}
              tone="sun"
              label="drafts"
              value={stats?.drafts}
              failed={failed}
              critter="pencil"
            />
            <StatTile
              icon={Eye}
              tone="sky"
              label="reads"
              value={stats?.reads}
              failed={failed}
              critter="cloud"
            />
            <StatTile
              icon={Heart}
              tone="rose"
              label="likes"
              value={stats?.likes}
              failed={failed}
              critter="heart"
            />
          </div>
        )}
        {failed && tab === "mine" && (
          <p className="mt-2 text-xs text-muted-foreground">
            couldn&apos;t load your totals right now.
          </p>
        )}
        <SectionHeader
          className={tab === "mine" ? "mt-12" : "mt-2"}
          title={tab === "bookmarks" ? "saved pages" : "your pages"}
          action={
            <Toolbar aria-label="Sections" className={raised}>
              <ToolbarButton asChild active={tab === "mine"}>
                <Link href="/dashboard">
                  <PencilSimpleLine weight="bold" />
                  writing
                </Link>
              </ToolbarButton>
              <ToolbarButton asChild active={tab === "bookmarks"}>
                <Link href="/dashboard?tab=bookmarks">
                  <BookmarkSimple weight="bold" />
                  bookmarks
                </Link>
              </ToolbarButton>
            </Toolbar>
          }
        />
        {toolbar && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <Toolbar aria-label="Filter pages" className={raised}>
              {filters.map((item) => (
                <ToolbarButton
                  key={item.value}
                  active={filter === item.value}
                  onClick={() => setFilter(item.value)}
                >
                  {item.dot && (
                    <span aria-hidden="true" className={cn("size-1.5 rounded-full", item.dot)} />
                  )}
                  {item.label}
                  {item.value === "all" && (
                    <span className="font-mono text-[11px] opacity-60">{count}</span>
                  )}
                </ToolbarButton>
              ))}
            </Toolbar>
            <label className="relative w-full sm:w-64">
              <MagnifyingGlass
                weight="bold"
                aria-hidden="true"
                className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <span className="sr-only">Search your pages</span>
              <Input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSearched(true);
                }}
                placeholder="search your pages"
                className={cn(raised, "h-10 rounded-full border-transparent pl-10")}
              />
            </label>
          </div>
        )}
        <div className="mt-5 empty:hidden">
          <ErrorMessage message={error || loadError} />
        </div>
        <div className="mt-5 empty:hidden">
          {loading && !posts.length && !toolbar ? (
            <div className="grid gap-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-[72px]" />
              ))}
            </div>
          ) : tab === "bookmarks" ? (
            posts.length > 0 && (
              <div className="grid gap-4 lg:grid-cols-2">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            )
          ) : (
            toolbar &&
            (visible.length ? (
              <NotchedCard className="p-px">
                <div className="divide-y divide-border">
                  {visible.map((post) => (
                    <PageRow key={post.id} post={post} />
                  ))}
                </div>
              </NotchedCard>
            ) : (
              !loading &&
              (term ? (
                <EmptyState
                  critter="cloud"
                  title="no pages match that search."
                  action={
                    <Button variant="outline" onClick={() => setQuery("")}>
                      clear search
                    </Button>
                  }
                />
              ) : (
                posts.length > 0 && (
                  <EmptyState
                    critter="cup"
                    title="nothing in this filter yet."
                    action={
                      <Button variant="outline" onClick={() => setFilter("all")}>
                        show all pages
                      </Button>
                    }
                  />
                )
              ))
            ))
          )}
        </div>
        {(hasMore || loadError) && (
          <div className="py-7 text-center">
            <Button variant="outline" disabled={loading} onClick={loadMore}>
              {loading ? "loading pages…" : loadError ? "try again" : "load more pages"}
            </Button>
          </div>
        )}
        {!loading && !posts.length && !term && !error && !loadError && (
          <EmptyState
            className="mt-5"
            critter={tab === "bookmarks" ? "bookmark" : "pencil"}
            title={tab === "bookmarks" ? "nothing saved yet." : "your first page starts here."}
            body={tab === "bookmarks" ? "use the bookmark on any page to keep it here." : undefined}
            action={
              tab === "mine" ? (
                <Button onClick={createStory} disabled={busy}>
                  <Plus weight="bold" />
                  write something
                </Button>
              ) : (
                <Button variant="outline" asChild>
                  <Link href="/discover">browse discover</Link>
                </Button>
              )
            }
          />
        )}
      </PageBody>
    </AppShell>
  );
}
