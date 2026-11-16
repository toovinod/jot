"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Heart, Bookmark, Trash2 } from "lucide-react";
import type { Comment, Post } from "@jot/contracts";
import { api, send } from "@/lib/api";
import { date } from "@/lib/utils";
import { useSession } from "./providers";
import { Avatar } from "./document";
import { Button } from "./ui/button";
import { Textarea, ErrorMessage } from "./ui/fields";
type Engagement = { liked: boolean; bookmarked: boolean; likes: number; comments: Comment[] };
export function EngagementPanel({ post }: { post: Post }) {
  const { user } = useSession();
  return <EngagementContent key={`${post.id}:${user?.id || "anonymous"}`} post={post} />;
}
function EngagementContent({ post }: { post: Post }) {
  const { user } = useSession();
  const [data, setData] = useState<Engagement>({
      liked: false,
      bookmarked: false,
      likes: post.likes,
      comments: [],
    }),
    [body, setBody] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const mounted = useRef(true);
  async function refresh() {
    const next = await api<Engagement>(`/posts/${post.id}/engagement`);
    if (mounted.current) setData(next);
  }
  useEffect(() => {
    mounted.current = true;
    refresh()
      .catch((error) => {
        if (mounted.current) setError(error.message);
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, [post.id, user?.id]);
  async function toggle(kind: "like" | "bookmark") {
    setBusy(true);
    setError("");
    try {
      await api(`/posts/${post.id}/${kind}`, {
        method: "PUT",
        body: send({ active: kind === "like" ? !data.liked : !data.bookmarked }),
      });
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-8">
      <div className="flex gap-3 border-y border-border py-5">
        {user ? (
          <>
            <Button
              disabled={busy || loading}
              variant="outline"
              onClick={() => toggle("like")}
              aria-pressed={data.liked}
            >
              <Heart fill={data.liked ? "currentColor" : "none"} />
              {data.likes} {data.likes === 1 ? "like" : "likes"}
            </Button>
            <Button
              disabled={busy || loading}
              variant="outline"
              onClick={() => toggle("bookmark")}
              aria-pressed={data.bookmarked}
            >
              <Bookmark fill={data.bookmarked ? "currentColor" : "none"} />
              {data.bookmarked ? "Saved" : "Save for later"}
            </Button>
          </>
        ) : (
          <Button variant="outline" asChild>
            <Link href="/login">
              <Heart />
              {data.likes} likes · Log in to join in
            </Link>
          </Button>
        )}
      </div>
      <ErrorMessage message={error} />
      <div>
        <h2 className="font-serif text-3xl">Continue the conversation.</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          A thoughtful reply can be the start of something.
        </p>
      </div>
      {user ? (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(`/posts/${post.id}/comments`, { method: "POST", body: send({ body }) });
              setBody("");
              await refresh();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor="comment" className="sr-only">
            Your comment
          </label>
          <Textarea
            id="comment"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            maxLength={3000}
            placeholder="Add a thoughtful note…"
          />
          <Button disabled={busy || loading || !body.trim()} className="justify-self-end">
            Post comment
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="text-primary underline">
            Log in
          </Link>{" "}
          to leave a comment.
        </p>
      )}
      <div className="divide-y divide-border">
        {data.comments.map((comment) => (
          <article key={comment.id} className="py-6">
            <div className="flex justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar user={comment.author} />
                <div>
                  <Link href={`/@${comment.author.username}`} className="text-sm font-medium">
                    {comment.author.name || comment.author.username}
                  </Link>
                  <p className="text-xs text-muted-foreground">{date(comment.createdAt)}</p>
                </div>
              </div>
              {user && (user.id === comment.author.id || user.id === post.author.id) && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Delete comment"
                  disabled={busy || loading}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      await api(`/posts/${post.id}/comments/${comment.id}`, { method: "DELETE" });
                      await refresh();
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7">{comment.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
