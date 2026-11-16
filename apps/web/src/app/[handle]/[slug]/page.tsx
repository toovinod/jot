import { getPublishedPost } from "@/lib/public-post";
import { publishedPostMetadata } from "@/lib/post-metadata";
import { Header, Footer } from "@/components/shell";
import { Article, publicSnapshot } from "@/components/document";
import { EngagementPanel } from "@/components/engagement";
import { Subscribe } from "@/components/subscribe";
export const dynamic = "force-dynamic";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const { handle, slug } = await params;
  return publishedPostMetadata(await getPublishedPost(handle, slug));
}
export default async function Reading({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const { handle, slug } = await params;
  const post = await getPublishedPost(handle, slug);
  return (
    <>
      <Header />
      <main className="min-h-[70vh]">
        <Article
          snapshot={publicSnapshot(post)}
          author={post.author}
          publishedAt={post.publishedAt}
        />
        <div className="mx-auto max-w-2xl space-y-12 px-5 pb-16">
          <EngagementPanel post={post} />
          <Subscribe username={post.author.username} name={post.author.name} />
        </div>
      </main>
      <Footer />
    </>
  );
}
