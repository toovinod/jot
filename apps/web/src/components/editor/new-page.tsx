"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Post } from "@jot/contracts";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { EmptyState } from "../app/empty-state";
import { Button } from "../ui/button";
import { LoadingFrame } from "./editor-loader";

/**
 * Makes a blank page and opens it, showing the editor's loading frame meanwhile, so "new page"
 * goes straight to the editor. It replaces itself in history, so Back never makes another page.
 */
export function NewPage() {
  const router = useRouter();
  const [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  // Strict mode runs effects twice; each attempt posts once. Leaving first cancels the redirect.
  const started = useRef(-1),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;
    api<Post>("/posts", { method: "POST" })
      .then((post) => {
        if (mounted.current) router.replace(`/editor/${post.id}`);
      })
      .catch((e) => {
        if (mounted.current) setError(friendlyError(e, { auto: false }).message);
      });
  }, [attempt, router]);
  if (error)
    return (
      <div className="mx-auto max-w-xl px-5 py-20">
        <EmptyState
          critter="page"
          title="a new page wouldn't open."
          body={<span role="alert">{error}</span>}
          action={
            <div className="flex flex-wrap justify-center gap-2.5">
              <Button
                onClick={() => {
                  setError("");
                  setAttempt((n) => n + 1);
                }}
              >
                try again
              </Button>
              <Button asChild variant="outline">
                <Link href="/dashboard">back to your library</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  return <LoadingFrame />;
}
