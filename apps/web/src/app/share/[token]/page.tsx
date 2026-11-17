import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { SharedDraft } from "@jot/contracts";
import { publicApi } from "@/lib/public-api";
import { cn } from "@/lib/utils";
import { Header, Footer } from "@/components/shell";
import { Article, appearanceClass } from "@/components/document";
import { NotchedCard } from "@/components/app";
import { Critter } from "@/components/world/critters";
import "@/app/[handle]/[slug]/page-theme.css";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Private draft",
  robots: { index: false, follow: false },
};
export default async function SharedDraftPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(token)) notFound();
  const draft = await publicApi<SharedDraft>(`/shared/${token}`);
  return (
    <div
      className={cn(
        "min-h-screen bg-background text-foreground",
        appearanceClass(draft.appearance),
      )}
    >
      <Header />
      <div role="note" className="px-5 pt-6 font-sans sm:px-8">
        <NotchedCard
          stripe="sun"
          className="mx-auto flex max-w-2xl items-start gap-3 px-4 pb-7 pt-3.5 text-sm"
        >
          <Critter kind="page" className="size-8" />
          <p className="min-w-0 leading-6">
            <span className="font-medium">private draft link, not published.</span>{" "}
            <span className="text-muted-foreground">
              {draft.author.name || draft.author.username} shared this draft with you. it may change
              before it goes live, and search engines don&apos;t see it.
            </span>
          </p>
        </NotchedCard>
      </div>
      <main className="min-h-[70vh]">
        <Article snapshot={draft} author={draft.author} />
      </main>
      <Footer />
    </div>
  );
}
