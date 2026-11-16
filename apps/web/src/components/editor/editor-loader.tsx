"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Post } from "@jot/contracts";
import { getPost } from "@/lib/api";
import { Loading } from "../shell";
import { ErrorMessage } from "../ui/fields";
import { Button } from "../ui/button";
import { EditorWorkspace } from "./editor-workspace";
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
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  if (error)
    return (
      <div className="mx-auto max-w-xl px-5 py-20">
        <ErrorMessage message={error} />
        <Button asChild variant="outline" className="mt-5">
          <Link href="/dashboard">Back to your library</Link>
        </Button>
      </div>
    );
  if (!post) return <Loading />;
  return <EditorWorkspace initial={post} />;
}
