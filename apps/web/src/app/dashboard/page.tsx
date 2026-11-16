"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Post } from "@jot/contracts";
import { Plus, ArrowUpRight, FileText } from "lucide-react";
import { api } from "@/lib/api";
import { usePostCollection } from "@/hooks/use-post-collection";
import { date } from "@/lib/utils";
import { useSession } from "@/components/providers";
import { Page, Private, LibraryNav, Loading } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/fields";
import { PostCard } from "@/components/post-card";
export default function Dashboard() {
  return (
    <Suspense
      fallback={
        <Page>
          <Loading />
        </Page>
      }
    >
      <Private>
        <DashboardContent />
      </Private>
    </Suspense>
  );
}
function DashboardContent() {
  const { user } = useSession();
  const router = useRouter();
  const search = useSearchParams();
  const tab = search.get("tab") === "bookmarks" ? "bookmarks" : "mine";
  const [filter, setFilter] = useState("all"),
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
  useEffect(() => {
    if (new URLSearchParams(location.search).get("new") === "1") {
      history.replaceState(null, "", "/dashboard");
      void createStory();
    }
  }, [search]);
  const visible = posts.filter(
    (p) => filter === "all" || (filter === "published" ? p.isPublished : !p.isPublished),
  );
  return (
    <Page>
      <div className="flex flex-col gap-10 md:flex-row">
        <LibraryNav tab={tab} />
        <div className="min-w-0 flex-1">
          <div className="mb-10 flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="mb-3 text-xs uppercase tracking-[.15em] text-primary">
                {user?.name ? `Welcome back, ${user.name.split(" ")[0]}` : "Your quiet corner"}
              </p>
              <h1 className="font-serif text-4xl tracking-tight sm:text-5xl">
                {tab === "bookmarks" ? "For a quieter moment." : "A home for your thoughts."}
              </h1>
              <p className="mt-4 text-sm text-muted-foreground">
                {tab === "bookmarks"
                  ? "Stories you saved to come back to."
                  : "A collection of beginnings, works in progress, and words out in the world."}
              </p>
            </div>
            {tab === "mine" && (
              <Button onClick={createStory} disabled={busy}>
                <Plus />
                {busy ? "Opening a blank page…" : "New story"}
              </Button>
            )}
          </div>
          <ErrorMessage message={error || loadError} />
          {loading && !posts.length ? (
            <Loading />
          ) : tab === "bookmarks" ? (
            <div className="grid gap-x-8 lg:grid-cols-2">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <>
              <div className="mb-3 flex items-center gap-1 border-b border-border pb-3">
                {["all", "drafts", "published"].map((value) => (
                  <Button
                    variant={filter === value ? "outline" : "ghost"}
                    size="sm"
                    key={value}
                    onClick={() => setFilter(value)}
                  >
                    {value.charAt(0).toUpperCase() + value.slice(1)}
                    {value === "all" && ` (${posts.length}${hasMore ? "+" : ""})`}
                  </Button>
                ))}
              </div>
              {visible.map((post) => (
                <article
                  key={post.id}
                  className="flex items-center justify-between gap-4 border-b border-border py-7"
                >
                  <Link href={`/editor/${post.id}`} className="min-w-0 flex-1">
                    <div className="mb-2 flex items-center gap-3 text-[10px] uppercase tracking-[.12em]">
                      <span className={post.isPublished ? "text-primary" : "text-muted-foreground"}>
                        {post.isPublished ? "Published" : "Draft"}
                      </span>
                      <span className="text-muted-foreground">Edited {date(post.updatedAt)}</span>
                    </div>
                    <h2 className="truncate font-serif text-2xl hover:text-primary">
                      {post.title || "An untitled thought"}
                    </h2>
                    <p className="mt-2 truncate text-sm text-muted-foreground">
                      {post.subtitle || "Every story starts somewhere."}
                    </p>
                  </Link>
                  <Button variant="ghost" size="icon" asChild>
                    <Link
                      href={`/editor/${post.id}`}
                      aria-label={`Edit ${post.title || "untitled story"}`}
                    >
                      <ArrowUpRight />
                    </Link>
                  </Button>
                </article>
              ))}
            </>
          )}
          {(hasMore || loadError) && (
            <div className="py-7 text-center">
              <Button variant="outline" disabled={loading} onClick={loadMore}>
                {loading
                  ? "Loading stories…"
                  : loadError
                    ? "Retry loading stories"
                    : "Load more stories"}
              </Button>
            </div>
          )}
          {!loading && !posts.length && !error && !loadError && (
            <div className="rounded-xl border border-dashed border-border px-6 py-20 text-center">
              <FileText className="mx-auto mb-5 text-primary" size={30} strokeWidth={1} />
              <h2 className="font-serif text-3xl">
                {tab === "bookmarks"
                  ? "Keep a little inspiration."
                  : "Your next story starts here."}
              </h2>
              <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
                {tab === "bookmarks"
                  ? "Use the bookmark on any story to save it here."
                  : "Bring an idea, paste a draft, or let the blank page lead the way."}
              </p>
              {tab === "mine" && (
                <Button onClick={createStory} disabled={busy} className="mt-6">
                  <Plus />
                  Write something
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </Page>
  );
}
