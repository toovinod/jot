"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowDown, MagnifyingGlass } from "@phosphor-icons/react";
import { usePostCollection } from "@/hooks/use-post-collection";
import { Page } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input, ErrorMessage } from "@/components/ui/fields";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { PostCard } from "@/components/post-card";
import { useSession } from "@/components/providers";

export default function Discover() {
  const { user } = useSession();
  const [query, setQuery] = useState(""),
    [sort, setSort] = useState("latest");
  const {
    items: posts,
    loading,
    error,
    hasMore,
    loadMore,
  } = usePostCollection(`q=${encodeURIComponent(query)}&sort=${sort}`, 12, 200);
  return (
    <Page>
      <section className="mb-10 flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="mb-3 font-mono text-xs text-sky-deep">discover</p>
          <h1 className="font-display text-4xl font-extrabold tracking-[-0.05em] md:text-6xl">
            read what people are{" "}
            <em className="font-serif font-normal italic tracking-[-0.03em] [font-variation-settings:'SOFT'_100]">
              publishing.
            </em>
          </h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
          <Tabs value={sort} onValueChange={setSort}>
            <TabsList className="rounded-full bg-white p-1 shadow-[0_0_0_1px_var(--border)]">
              <TabsTrigger
                value="latest"
                className="rounded-full px-4 data-[state=active]:bg-ink data-[state=active]:text-white"
              >
                latest
              </TabsTrigger>
              <TabsTrigger
                value="popular"
                className="rounded-full px-4 data-[state=active]:bg-ink data-[state=active]:text-white"
              >
                popular
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <label className="relative w-full sm:w-72">
            <MagnifyingGlass
              weight="bold"
              className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <span className="sr-only">Search stories</span>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="find your next read"
              className="pl-10"
            />
          </label>
        </div>
      </section>
      <ErrorMessage message={error} />
      {error && !posts.length && (
        <Button variant="outline" onClick={loadMore} disabled={loading} className="mt-4">
          try again
        </Button>
      )}
      {loading && posts.length === 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl bg-white" />
          ))}
        </div>
      ) : posts.length ? (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {posts.map((post, i) => (
              <PostCard key={post.id} post={post} index={i} />
            ))}
          </div>
          {hasMore && (
            <div className="py-10 text-center">
              <Button variant="outline" disabled={loading} onClick={loadMore}>
                read a little more <ArrowDown weight="bold" />
              </Button>
            </div>
          )}
        </>
      ) : (
        !error && (
          <div className="rounded-3xl border border-dashed border-border bg-white py-20 text-center">
            <p className="font-display text-3xl font-bold tracking-[-0.04em]">
              {query ? "no pages found." : "nothing here yet."}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              {query ? "try another word or a different title." : "be the first to publish."}
            </p>
            <Button asChild className="mt-6">
              <Link href={user ? "/dashboard?new=1" : "/signup"}>start writing</Link>
            </Button>
          </div>
        )
      )}
    </Page>
  );
}
