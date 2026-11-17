"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Post } from "@jot/contracts";
import { getPost } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { Loading } from "../shell";
import { EmptyState } from "../app/empty-state";
import { Button } from "../ui/button";
import { EditorWorkspace, dotted, usePagesPane } from "./editor-workspace";
import { PagesColumn } from "./pages-pane";
export function EditorLoader({ id }: { id: string }) {
  const [post, setPost] = useState<Post | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    getPost(id)
      .then((value) => {
        if (active) setPost(value);
      })
      .catch((error) => {
        if (active) setError(friendlyError(error, { auto: false }).message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  if (error)
    return (
      <div className="mx-auto max-w-xl px-5 py-20">
        <EmptyState
          critter="page"
          title="this page wouldn't open."
          body={<span role="alert">{error}</span>}
          action={
            <Button asChild variant="outline">
              <Link href="/dashboard">back to your library</Link>
            </Button>
          }
        />
      </div>
    );
  if (!post) return <LoadingFrame id={id} />;
  return <EditorWorkspace initial={post} />;
}
/** While a page opens, the pages pane already shows, so moving between pages doesn't blink. */
export function LoadingFrame({ id = "" }: { id?: string }) {
  const router = useRouter();
  const pages = usePagesPane();
  return (
    <div className="flex h-svh overflow-hidden bg-white text-ink">
      <PagesColumn
        open={pages.open}
        onOpenChange={pages.setOpen}
        currentId={id}
        navigate={(path) => router.push(path)}
      />
      <div className={`grid min-w-0 flex-1 place-items-center bg-white ${dotted}`}>
        <Loading />
      </div>
    </div>
  );
}
