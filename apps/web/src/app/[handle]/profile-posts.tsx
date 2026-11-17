"use client";
import { useState } from "react";
import { ArrowDown, Rss } from "@phosphor-icons/react";
import type { PostSummary } from "@jot/contracts";
import { getAuthorPage } from "@/lib/account-api";
import { PostCard } from "@/components/post-card";
import { EmptyState, NotchedCard, SectionHeader } from "@/components/app";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/fields";

export function ProfilePosts({
  username,
  initial,
  pageSize,
  appOrigin,
}: {
  username: string;
  initial: PostSummary[];
  pageSize: number;
  appOrigin?: string;
}) {
  const [posts, setPosts] = useState(initial),
    [hasMore, setHasMore] = useState(initial.length === pageSize),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  async function loadMore() {
    setLoading(true);
    setError("");
    try {
      const page = (await getAuthorPage(username, posts.length, pageSize)).posts;
      setPosts((current) => {
        const seen = new Set(current.map((post) => post.id));
        return [...current, ...page.filter((post) => !seen.has(post.id))];
      });
      setHasMore(page.length === pageSize);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      <NotchedCard className="relative -mt-14 flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="font-mono text-sky-deep">/@{username}</span>
          <span className="text-muted-foreground">
            {posts.length}
            {hasMore ? "+" : ""} {posts.length === 1 && !hasMore ? "page" : "pages"} published
          </span>
        </p>
        <a
          href={`/@${encodeURIComponent(username)}/rss.xml`}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#fff1e6] px-3 text-xs font-medium text-terra transition-colors hover:bg-terra hover:text-white"
        >
          <Rss weight="bold" className="size-3.5" />
          rss feed
        </a>
      </NotchedCard>
      <SectionHeader className="mt-12" title="pages" description="newest first." />
      {posts.length > 0 ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {posts.map((post) => (
            <PostCard key={post.id} post={post} appOrigin={appOrigin} />
          ))}
        </div>
      ) : (
        <EmptyState
          className="mt-5"
          critter="page"
          title="no pages yet."
          body="a first page is still taking shape."
        />
      )}
      <div className="mt-4 empty:hidden">
        <ErrorMessage message={error} />
      </div>
      {(hasMore || error) && (
        <div className="py-8 text-center">
          <Button variant="outline" disabled={loading} onClick={loadMore}>
            {loading ? "loading pages…" : error ? "try again" : "load more pages"}
            {!loading && !error && <ArrowDown weight="bold" />}
          </Button>
        </div>
      )}
    </>
  );
}
