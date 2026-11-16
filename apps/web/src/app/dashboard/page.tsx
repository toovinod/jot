"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { postPath, type Post, type PostSummary } from "@jot/contracts";
import type { Icon } from "@phosphor-icons/react";
import {
  ArrowUpRight,
  BookmarkSimple,
  FileDashed,
  Globe,
  Heart,
  NotePencil,
  Plus,
} from "@phosphor-icons/react";
import { api } from "@/lib/api";
import { usePostCollection } from "@/hooks/use-post-collection";
import { cn, date } from "@/lib/utils";
import { greeting, loadAllMine, summarize, type DashboardStats } from "@/lib/dashboard-stats";
import { useSession } from "@/components/providers";
import { AppShell, Private, Loading } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/fields";
import { Skeleton } from "@/components/ui/skeleton";
import { PostCard } from "@/components/post-card";
import { JotMark } from "@/components/brand/logo";
import { SkyScene } from "@/components/world/sky";

export default function Dashboard() {
  return (
    <Suspense fallback={<Loading />}>
      <Private>
        <DashboardContent />
      </Private>
    </Suspense>
  );
}

const filters = [
  { value: "all", label: "All" },
  { value: "live", label: "Live" },
  { value: "drafts", label: "Drafts" },
  { value: "unlisted", label: "Unlisted" },
] as const;
type Filter = (typeof filters)[number]["value"];

function matches(post: PostSummary, filter: Filter) {
  if (filter === "live") return post.isPublished;
  if (filter === "drafts") return !post.isPublished;
  if (filter === "unlisted") return post.visibility === "unlisted";
  return true;
}

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

function Stat({
  icon: StatIcon,
  value,
  label,
  tint,
  failed,
}: {
  icon: Icon;
  value: number | undefined;
  label: string;
  tint: string;
  failed: boolean;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-[0_3px_0_var(--border)]">
      <span className={cn("grid size-11 place-items-center rounded-xl", tint)}>
        <StatIcon weight="duotone" className="size-6" />
      </span>
      <div>
        {value === undefined && !failed ? (
          <Skeleton className="h-8 w-12" />
        ) : (
          <p className="font-display text-3xl font-bold leading-none tracking-[-0.04em]">
            {failed ? "-" : value!.toLocaleString()}
          </p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function DashboardContent() {
  const { user } = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const tab = search.get("tab") === "bookmarks" ? "bookmarks" : "mine";
  const [filter, setFilter] = useState<Filter>("all"),
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
      setError((e as Error).message);
      setBusy(false);
      creatingStory.current = false;
    }
  }
  const {
    items: posts,
    loading,
    error: loadError,
    hasMore,
    loadMore,
  } = usePostCollection(`scope=${tab}`);
  const { stats, failed } = useStats(tab === "mine");
  useEffect(() => {
    if (new URLSearchParams(location.search).get("new") === "1") {
      history.replaceState(null, "", "/dashboard");
      void createStory();
    }
  }, [search]);
  const visible = posts.filter((post) => matches(post, filter));
  const firstName = (user?.name || user?.username || "").split(" ")[0];
  const status =
    tab === "bookmarks"
      ? "pages you saved to come back to."
      : !stats
        ? "here's everything you've been writing."
        : stats.drafts
          ? `${stats.drafts} ${stats.drafts === 1 ? "draft" : "drafts"} waiting.`
          : stats.live
            ? "everything you wrote is live."
            : "a blank page is a good beginning.";

  return (
    <AppShell active={tab}>
      <SkyScene variant="banner" className="px-5 pb-14 pt-8 md:px-10">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <h1 className="font-display text-4xl font-extrabold tracking-[-0.05em] md:text-5xl">
              {tab === "bookmarks" ? (
                "your bookmarks."
              ) : (
                <>
                  {greeting(new Date())},{" "}
                  <em className="font-serif font-normal italic tracking-[-0.03em] [font-variation-settings:'SOFT'_100]">
                    {firstName.toLowerCase()}.
                  </em>
                </>
              )}
            </h1>
            <p className="on-sky mt-2 font-medium text-white">{status}</p>
          </div>
          {tab === "mine" && (
            <Button onClick={createStory} disabled={busy}>
              <Plus weight="bold" />
              {busy ? "opening a blank page…" : "new page"}
            </Button>
          )}
        </div>
      </SkyScene>
      <div className="px-5 pb-16 md:px-10">
        {tab === "mine" && (
          <div className="-mt-4 grid gap-3 sm:grid-cols-3">
            <Stat
              icon={Globe}
              value={stats?.live}
              label="pages live"
              tint="bg-[#dff5e3] text-grass-3"
              failed={failed}
            />
            <Stat
              icon={NotePencil}
              value={stats?.drafts}
              label="drafts"
              tint="bg-[#fff1c7] text-[#b07d00]"
              failed={failed}
            />
            <Stat
              icon={Heart}
              value={stats?.likes}
              label="likes on your pages"
              tint="bg-[#ffe4ec] text-rose"
              failed={failed}
            />
          </div>
        )}
        {failed && tab === "mine" && (
          <p className="mt-2 text-xs text-muted-foreground">
            couldn&apos;t load your totals right now.
          </p>
        )}
        <div className="mt-8">
          <ErrorMessage message={error || loadError} />
        </div>
        {loading && !posts.length ? (
          <div className="grid gap-3">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-2xl bg-white" />
            ))}
          </div>
        ) : tab === "bookmarks" ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          posts.length > 0 && (
            <>
              <div role="tablist" aria-label="Filter pages" className="mb-4 flex flex-wrap gap-1.5">
                {filters.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    role="tab"
                    aria-selected={filter === item.value}
                    onClick={() => setFilter(item.value)}
                    className={cn(
                      "cursor-pointer rounded-full px-3.5 py-1.5 text-sm transition-colors",
                      filter === item.value
                        ? "bg-ink text-white"
                        : "text-muted-foreground hover:bg-white hover:text-foreground",
                    )}
                  >
                    {item.label}
                    {item.value === "all" && (
                      <span className="ml-1.5 font-mono text-xs opacity-60">
                        {posts.length}
                        {hasMore ? "+" : ""}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="grid gap-2.5">
                {visible.map((post) => (
                  <Link
                    key={post.id}
                    href={`/editor/${post.id}`}
                    aria-label={`Edit ${post.title || "untitled page"}`}
                    className="group grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-4 rounded-2xl border border-border bg-white p-3.5 transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_5px_0_var(--border)] motion-reduce:transform-none"
                  >
                    <span
                      className={cn(
                        "grid size-11 place-items-center rounded-xl",
                        post.isPublished ? "bg-[#dff5e3]" : "bg-sky-soft",
                      )}
                    >
                      <JotMark className="size-6 text-ink" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-serif text-xl tracking-[-0.01em]">
                        {post.title || "an untitled thought"}
                      </span>
                      <span className="block truncate font-mono text-xs text-muted-foreground">
                        {post.isPublished
                          ? postPath(post.author.username, post.slug)
                          : "not published yet"}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium sm:inline-flex",
                          post.isPublished
                            ? post.visibility === "unlisted"
                              ? "bg-sky-soft text-sky-deep"
                              : "bg-[#dff5e3] text-[#22803a]"
                            : "bg-[#eef1f5] text-muted-foreground",
                        )}
                      >
                        <span className="size-1.5 rounded-full bg-current" />
                        {post.isPublished
                          ? post.visibility === "unlisted"
                            ? "Unlisted"
                            : "Live"
                          : "Draft"}
                      </span>
                      <span className="hidden w-24 text-right text-xs text-muted-foreground md:block">
                        {date(post.updatedAt)}
                      </span>
                      <ArrowUpRight
                        weight="bold"
                        aria-hidden="true"
                        className="size-4 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-sky-deep"
                      />
                    </span>
                  </Link>
                ))}
                {!visible.length && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    nothing in this filter yet.
                  </p>
                )}
              </div>
            </>
          )
        )}
        {(hasMore || loadError) && (
          <div className="py-7 text-center">
            <Button variant="outline" disabled={loading} onClick={loadMore}>
              {loading ? "loading pages…" : loadError ? "try again" : "load more pages"}
            </Button>
          </div>
        )}
        {!loading && !posts.length && !error && !loadError && (
          <div className="rounded-3xl border border-dashed border-border bg-white px-6 py-16 text-center">
            {tab === "bookmarks" ? (
              <BookmarkSimple weight="duotone" className="mx-auto mb-4 size-10 text-sky-deep" />
            ) : (
              <FileDashed weight="duotone" className="mx-auto mb-4 size-10 text-sky-deep" />
            )}
            <h2 className="font-display text-2xl font-bold tracking-[-0.04em]">
              {tab === "bookmarks" ? "nothing saved yet." : "your first page starts here."}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              {tab === "bookmarks"
                ? "use the bookmark on any page to keep it here."
                : "bring an idea, paste a draft, or let the blank page lead the way."}
            </p>
            {tab === "mine" && (
              <Button onClick={createStory} disabled={busy} className="mt-6">
                <Plus weight="bold" />
                write something
              </Button>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
