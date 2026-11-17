import type { PostSummary, User } from "@jot/contracts";
import { notFound } from "next/navigation";
import { normalizePublicUsername } from "@/lib/public-route";
import { publicApi } from "@/lib/public-api";
import { appLinkOrigin } from "@/lib/post-metadata";
import { Header, Footer } from "@/components/shell";
import { PageBody, SceneHeader } from "@/components/app";
import { Avatar } from "@/components/post-parts";
import { Subscribe } from "@/components/subscribe";
import { Button } from "@/components/ui/button";
import { ProfilePosts } from "./profile-posts";
export const dynamic = "force-dynamic";
const pageSize = 20;
export default async function Profile({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const username = normalizePublicUsername(handle);
  if (!username) notFound();
  const data = await publicApi<{ author: User; posts: PostSummary[] }>(
    `/authors/${encodeURIComponent(username)}?offset=0&limit=${pageSize}`,
  );
  const author = data.author;
  const appOrigin = await appLinkOrigin();
  return (
    <>
      <Header appOrigin={appOrigin} />
      <main className="min-h-[70vh]">
        <SceneHeader
          cast={["book", "letter", "heart"]}
          title={
            <span className="flex flex-wrap items-center gap-x-5 gap-y-4">
              <Avatar
                user={author}
                size="large"
                className="ring-4 ring-white shadow-[0_4px_0_rgba(0,50,120,.18)]"
              />
              <span className="min-w-0">{author.name || author.username}</span>
            </span>
          }
          subtitle={author.bio || undefined}
          actions={
            <Button variant="outline" asChild>
              <a href="#subscribe">get new pages by email</a>
            </Button>
          }
        />
        <PageBody>
          <ProfilePosts
            username={author.username}
            initial={data.posts}
            pageSize={pageSize}
            appOrigin={appOrigin}
          />
          <div className="mt-14">
            <Subscribe username={author.username} name={author.name} />
          </div>
        </PageBody>
      </main>
      <Footer appOrigin={appOrigin} />
    </>
  );
}
