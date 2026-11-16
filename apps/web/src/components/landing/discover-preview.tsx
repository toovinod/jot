"use client";
import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { usePostCollection } from "@/hooks/use-post-collection";
import { PostCard } from "@/components/post-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal, SectionTitle, softItalic, useStartHref } from "./reveal";

export function DiscoverPreview() {
  const start = useStartHref();
  const { items, loading, error } = usePostCollection("q=&sort=latest", 4);
  if (error && !items.length) return null;
  const posts = items.slice(0, 4);
  return (
    <section className="mx-auto max-w-7xl px-4 py-24 md:px-8">
      <Reveal className="flex flex-wrap items-end justify-between gap-6">
        <SectionTitle eyebrow="discover">
          read what people are <em className={softItalic}>publishing.</em>
        </SectionTitle>
        <Button variant="outline" asChild>
          <Link href="/discover">
            see everything <ArrowRight weight="bold" />
          </Link>
        </Button>
      </Reveal>
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {loading && !posts.length ? (
          Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-44 rounded-3xl bg-white" />
          ))
        ) : posts.length ? (
          posts.map((post) => <PostCard key={post.id} post={post} />)
        ) : (
          <div className="rounded-3xl border border-dashed border-border bg-white p-10 text-center md:col-span-2">
            <p className="font-display text-2xl font-bold tracking-[-0.04em]">nothing here yet.</p>
            <p className="mt-2 text-muted-foreground">be the first to publish.</p>
            <Button asChild className="mt-5">
              <Link href={start}>start writing</Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
