"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search, ArrowRight, PenLine } from "lucide-react";
import { usePostCollection } from "@/hooks/use-post-collection";
import { Page, Loading } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Input, ErrorMessage } from "@/components/ui/fields";
import { PostCard } from "@/components/post-card";
import { useSession } from "@/components/providers";
export default function Home() {
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
      <section className="grid gap-10 border-b border-border pb-16 pt-4 md:grid-cols-[1fr_280px] md:pb-20">
        <div>
          <p className="mb-6 text-[11px] font-semibold uppercase tracking-[.2em] text-primary">
            For the love of the written word
          </p>
          <h1 className="max-w-3xl font-serif text-6xl leading-[1.02] tracking-[-.05em] md:text-8xl">
            Good ideas deserve
            <br />
            <span className="italic text-primary">a little space.</span>
          </h1>
          <p className="mt-7 max-w-lg text-base leading-7 text-muted-foreground">
            Thoughtful stories. Unfinished questions. A different point of view. Find something
            worth slowing down for.
          </p>
          <Button asChild className="mt-8">
            <Link href={user ? "/dashboard?new=1" : "/signup"}>
              Make room for your words <ArrowUpRight />
            </Link>
          </Button>
        </div>
        <aside className="self-end border-l border-primary/30 pl-6">
          <PenLine className="mb-6 text-primary" size={27} strokeWidth={1} />
          <p className="font-serif text-2xl leading-9">
            Your ideas.
            <br />
            Your own page.
            <br />A little room to grow.
          </p>
          <p className="mt-5 text-xs text-muted-foreground">An empty page is a good beginning.</p>
        </aside>
      </section>
      <section className="pt-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-6">
            <h2 className="text-xl font-semibold tracking-tight">The reading room</h2>
            <div className="flex gap-1">
              {["latest", "popular"].map((item) => (
                <Button
                  key={item}
                  variant={sort === item ? "outline" : "ghost"}
                  size="sm"
                  onClick={() => {
                    setSort(item);
                  }}
                >
                  {item === "latest" ? "Latest" : "Popular"}
                </Button>
              ))}
            </div>
          </div>
          <label className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-3.5 text-muted-foreground" size={15} />
            <span className="sr-only">Search stories</span>
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder="Find your next read"
              className="pl-9"
            />
          </label>
        </div>
        <ErrorMessage message={error} />
        {error && !posts.length && (
          <Button variant="outline" onClick={loadMore} disabled={loading}>
            Retry loading stories
          </Button>
        )}
        {loading && posts.length === 0 ? (
          <Loading />
        ) : posts.length ? (
          <>
            <div className="grid gap-x-10 lg:grid-cols-2">
              {posts.map((post, i) => (
                <PostCard key={post.id} post={post} index={i} />
              ))}
            </div>
            {hasMore && (
              <div className="py-10 text-center">
                <Button variant="outline" disabled={loading} onClick={loadMore}>
                  Read a little more <ArrowRight />
                </Button>
              </div>
            )}
          </>
        ) : (
          !error && (
            <div className="py-20 text-center">
              <p className="font-serif text-3xl">
                {query ? "No stories found." : "The room is quiet. For now."}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">
                {query
                  ? "Try another word or a different title."
                  : "Every good publication starts with a first story. Make it yours."}
              </p>
              <Button asChild className="mt-6">
                <Link href={user ? "/dashboard?new=1" : "/signup"}>
                  Write the first story <ArrowUpRight />
                </Link>
              </Button>
            </div>
          )
        )}
      </section>
    </Page>
  );
}
