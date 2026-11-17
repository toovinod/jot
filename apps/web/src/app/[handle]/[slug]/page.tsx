import { getPublishedPost } from "@/lib/public-post";
import { postPath } from "@jot/contracts";
import {
  appLinkOrigin,
  onCustomDomain,
  publicOrigin,
  publishedPostMetadata,
} from "@/lib/post-metadata";
import { cn } from "@/lib/utils";
import { Header, Footer } from "@/components/shell";
import { Article, appearanceClass } from "@/components/document";
import { publicSnapshot } from "@/components/post-parts";
import { EngagementPanel } from "@/components/engagement";
import { Subscribe } from "@/components/subscribe";
import { ViewBeacon } from "./view-beacon";
import "./page-theme.css";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const { handle, slug } = await params;
  return publishedPostMetadata(await getPublishedPost(handle, slug), await publicOrigin());
}
export default async function Reading({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const { handle, slug } = await params;
  const post = await getPublishedPost(handle, slug);
  const snapshot = publicSnapshot(post);
  // A custom domain has no session, so likes, saves and comments happen on the app's copy.
  const appPostUrl = (await onCustomDomain())
    ? new URL(postPath(post.author.username, snapshot.slug), await publicOrigin()).toString()
    : undefined;
  const appOrigin = await appLinkOrigin();
  return (
    <div
      className={cn(
        "min-h-screen bg-background text-foreground",
        appearanceClass(snapshot.appearance),
      )}
    >
      <div aria-hidden="true" className="reading-progress" />
      <Header appOrigin={appOrigin} />
      <main className="min-h-[70vh]">
        <Article
          snapshot={snapshot}
          author={post.author}
          publishedAt={post.publishedAt}
          appOrigin={appOrigin}
        />
        <div className="px-5 pb-24 sm:px-8">
          <div className="mx-auto max-w-2xl space-y-12">
            <EngagementPanel post={post} appPostUrl={appPostUrl} />
            <Subscribe username={post.author.username} name={post.author.name} />
          </div>
        </div>
      </main>
      <Footer appOrigin={appOrigin} />
      <ViewBeacon postId={post.id} authorId={post.author.id} />
    </div>
  );
}
