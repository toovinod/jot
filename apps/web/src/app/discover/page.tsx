"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDown, Clock, Fire, MagnifyingGlass, X } from "@phosphor-icons/react";
import { tagPattern } from "@jot/contracts";
import { usePostCollection } from "@/hooks/use-post-collection";
import { cn } from "@/lib/utils";
import { Footer, Header, Loading } from "@/components/shell";
import {
  EmptyState,
  NotchedCard,
  PageBody,
  SceneHeader,
  Toolbar,
  ToolbarButton,
} from "@/components/app";
import { Button } from "@/components/ui/button";
import { Input, ErrorMessage } from "@/components/ui/fields";
import { Skeleton } from "@/components/ui/skeleton";
import { PostCard } from "@/components/post-card";
import { useSession } from "@/components/providers";

export default function Discover() {
  return (
    <>
      <Header />
      <main className="min-h-[70vh]">
        <SceneHeader
          title="discover."
          subtitle="read what people are publishing on jot."
          cast={["book", "plane", "letter", "cloud"]}
        />
        <PageBody>
          <Suspense fallback={<Loading />}>
            <DiscoverContent />
          </Suspense>
        </PageBody>
      </main>
      <Footer />
    </>
  );
}

const sorts = [
  { value: "latest", label: "latest", icon: Clock },
  { value: "popular", label: "popular", icon: Fire },
] as const;

/** The most used tags among the loaded pages, for quick filtering without another request. */
function topTags(posts: { tags?: string[] }[], limit = 8) {
  const counts = new Map<string, number>();
  for (const post of posts)
    for (const tag of post.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([tag]) => tag);
}

const chip =
  "inline-flex h-8 items-center gap-1.5 rounded-full px-3 font-mono text-xs transition-colors";

function DiscoverContent() {
  const { user } = useSession();
  const raw = useSearchParams().get("tag") || "";
  const tag = tagPattern.test(raw) ? raw : "";
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState<(typeof sorts)[number]["value"]>("latest");
  const {
    items: posts,
    loading,
    error,
    hasMore,
    loadMore,
  } = usePostCollection(
    `q=${encodeURIComponent(query)}&sort=${sort}${tag ? `&tag=${tag}` : ""}`,
    12,
    200,
  );
  const tags = tag ? [] : topTags(posts);
  return (
    <>
      <NotchedCard className="relative -mt-14 flex flex-wrap items-center justify-between gap-3 p-3">
        <Toolbar aria-label="Sort pages">
          {sorts.map((item) => (
            <ToolbarButton
              key={item.value}
              active={sort === item.value}
              onClick={() => setSort(item.value)}
            >
              <item.icon weight="bold" />
              {item.label}
            </ToolbarButton>
          ))}
        </Toolbar>
        <label className="relative w-full sm:w-80">
          <MagnifyingGlass
            weight="bold"
            aria-hidden="true"
            className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <span className="sr-only">Search pages</span>
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="find your next read"
            className="h-10 rounded-full pl-10"
          />
        </label>
      </NotchedCard>
      {(tag || tags.length > 0) && (
        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {tag ? (
            <>
              pages tagged
              <Link
                href="/discover"
                aria-label={`Clear tag ${tag}`}
                className={cn(chip, "bg-ink text-white hover:bg-ink/85")}
              >
                #{tag}
                <X weight="bold" className="size-3" />
              </Link>
            </>
          ) : (
            <>
              <span className="mr-1">tags</span>
              {tags.map((name) => (
                <Link
                  key={name}
                  href={`/discover?tag=${encodeURIComponent(name)}`}
                  className={cn(chip, "bg-sky-soft text-sky-deep hover:bg-sky hover:text-white")}
                >
                  #{name}
                </Link>
              ))}
            </>
          )}
        </div>
      )}
      <div className="mt-5 empty:hidden">
        <ErrorMessage message={error} />
      </div>
      {error && !posts.length && (
        <Button variant="outline" onClick={loadMore} disabled={loading} className="mt-4">
          try again
        </Button>
      )}
      <div className="mt-6">
        {loading && posts.length === 0 ? (
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        ) : posts.length ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
            {hasMore && (
              <div className="py-10 text-center">
                <Button variant="outline" disabled={loading} onClick={loadMore}>
                  {loading ? "loading pages…" : "read a little more"}
                  {!loading && <ArrowDown weight="bold" />}
                </Button>
              </div>
            )}
          </>
        ) : (
          !error &&
          (query || tag ? (
            <EmptyState
              critter="star"
              title="no pages found."
              body={
                query
                  ? "try another word, or part of a title."
                  : "no one has published with this tag yet."
              }
              action={
                query ? (
                  <Button variant="outline" onClick={() => setQuery("")}>
                    clear search
                  </Button>
                ) : (
                  <Button variant="outline" asChild>
                    <Link href="/discover">see every page</Link>
                  </Button>
                )
              }
            />
          ) : (
            <EmptyState
              critter="page"
              title="nothing here yet."
              body="be the first to publish something worth reading."
              action={
                <Button asChild>
                  <Link href={user ? "/dashboard?new=1" : "/signup"}>start writing</Link>
                </Button>
              }
            />
          ))
        )}
      </div>
    </>
  );
}
