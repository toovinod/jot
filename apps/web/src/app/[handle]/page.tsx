import type { PostSummary, User } from "@jot/contracts";
import { notFound } from "next/navigation";
import { normalizePublicUsername } from "@/lib/public-route";
import { publicApi } from "@/lib/public-api";
import { Page } from "@/components/shell";
import { Avatar } from "@/components/document";
import { PostCard } from "@/components/post-card";
import { Subscribe } from "@/components/subscribe";
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
        <header className="flex flex-col gap-7 border-b border-border py-5 pb-12 sm:flex-row">
          <Avatar user={data.author} size="large" />
          <div>
            <p className="mb-3 text-xs text-primary">@{data.author.username}</p>
            <h1 className="font-serif text-5xl tracking-tight">
              {data.author.name || data.author.username}
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-muted-foreground">
              {data.author.bio || "A space for thoughts, stories, and things worth sharing."}
            </p>
          </div>
        </header>
        <p className="mt-9 text-xs uppercase tracking-[.16em] text-muted-foreground">
          Collected writing · {data.posts.length} stories
        </p>
        <div className="grid gap-x-10 md:grid-cols-2">
          {data.posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
        {!data.posts.length && (
          <p className="py-16 font-serif text-2xl text-muted-foreground">
            A first story is still taking shape.
          </p>
        )}
        <div className="mt-12">
          <Subscribe username={data.author.username} name={data.author.name} />
        </div>
      </div>
    </Page>
  );
}
