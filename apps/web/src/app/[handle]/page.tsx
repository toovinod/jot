import type { PostSummary, User } from "@jot/contracts";
import { notFound } from "next/navigation";
import { normalizePublicUsername } from "@/lib/public-route";
import { publicApi } from "@/lib/public-api";
import { Page } from "@/components/shell";
import { Avatar } from "@/components/document";
import { PostCard } from "@/components/post-card";
import { Subscribe } from "@/components/subscribe";
import { SkyScene } from "@/components/world/sky";
export const dynamic = "force-dynamic";
export default async function Profile({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const username = normalizePublicUsername(handle);
  if (!username) notFound();
  const data = await publicApi<{ author: User; posts: PostSummary[] }>(
    `/authors/${encodeURIComponent(username)}`,
  );
  return (
    <Page>
      <div className="mx-auto max-w-4xl">
        <SkyScene variant="banner" className="rounded-[28px] px-6 pb-16 pt-10 sm:px-10">
          <header className="flex flex-col gap-6 sm:flex-row sm:items-center">
            <span className="w-fit rounded-full bg-white p-1 shadow-[0_4px_0_rgba(0,50,120,.18)]">
              <Avatar user={data.author} size="large" />
            </span>
            <div>
              <p className="mb-2 font-mono text-sm text-white/90">/@{data.author.username}</p>
              <h1 className="font-display text-5xl font-extrabold tracking-[-0.05em] [text-shadow:0_4px_0_rgba(0,50,120,.18)]">
                {data.author.name || data.author.username}
              </h1>
              <p className="on-sky mt-3 max-w-xl text-base font-medium leading-7 text-white">
                {data.author.bio || "A space for thoughts, stories, and things worth sharing."}
              </p>
            </div>
          </header>
        </SkyScene>
        <p className="mb-4 mt-10 font-mono text-xs text-muted-foreground">
          {data.posts.length} {data.posts.length === 1 ? "page" : "pages"} published
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {data.posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
        {!data.posts.length && (
          <p className="rounded-3xl border border-dashed border-border bg-white py-16 text-center font-serif text-2xl italic text-muted-foreground">
            a first page is still taking shape.
          </p>
        )}
        <div className="mt-12">
          <Subscribe username={data.author.username} name={data.author.name} />
        </div>
      </div>
    </Page>
  );
}
