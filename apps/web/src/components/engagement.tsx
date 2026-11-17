"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowBendDownRight,
  BookmarkSimple,
  ChatCircle,
  Heart,
  Prohibit,
  Trash,
} from "@phosphor-icons/react";
import type { Comment, Engagement, Post, User } from "@jot/contracts";
import { api, ApiError, send } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { cn, date } from "@/lib/utils";
import { useSession } from "./providers";
import { Avatar, publicSnapshot } from "./post-parts";
import { NotchedCard } from "./app/notched-card";
import { SectionHeader } from "./app/section-header";
import { Critter, type CritterKind } from "./world/critters";
import { Button } from "./ui/button";
import { Textarea, ErrorMessage } from "./ui/fields";
import { Skeleton } from "./ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
/** appPostUrl is set on a custom domain, where there is no session: likes, saves and comments
 * link to the post on the app instead. */
export function EngagementPanel({ post, appPostUrl }: { post: Post; appPostUrl?: string }) {
  const { user } = useSession();
  return (
    <EngagementContent
      key={`${post.id}:${user?.id || "anonymous"}`}
      post={post}
      appPostUrl={appPostUrl}
    />
  );
}
const displayName = (user: User) => user.name || user.username;
/** A soft card in place of the comment form: comments off, blocked, or signed out. */
function Notice({ critter, children }: { critter: CritterKind; children: ReactNode }) {
  return (
    <NotchedCard tone="tint" role="status" className="flex items-center gap-3 px-4 py-3.5 text-sm">
      <Critter kind={critter} className="size-7" />
      <p className="text-muted-foreground">{children}</p>
    </NotchedCard>
  );
}
function EngagementContent({ post, appPostUrl }: { post: Post; appPostUrl?: string }) {
  const session = useSession();
  const user = appPostUrl ? null : session.user;
  const app = appPostUrl ? new URL(appPostUrl).origin : "";
  const isAuthor = !!user && user.id === post.author.id;
  const [data, setData] = useState<Engagement>({
      liked: false,
      bookmarked: false,
      likes: post.likes,
      comments: [],
      commentsOff: !!publicSnapshot(post).commentsOff,
    }),
    [body, setBody] = useState(""),
    [replyTo, setReplyTo] = useState<string | null>(null),
    [reply, setReply] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    // Set when the post's author blocked this reader, from a 403 `blocked` on commenting.
    [blockedHere, setBlockedHere] = useState(false),
    [blocking, setBlocking] = useState<User | null>(null),
    [blockBusy, setBlockBusy] = useState(false),
    [blockError, setBlockError] = useState(""),
    [notice, setNotice] = useState("");
  const mounted = useRef(true);
  async function refresh() {
    const next = await api<Engagement>(`/posts/${post.id}/engagement`);
    if (mounted.current) setData(next);
  }
  useEffect(() => {
    mounted.current = true;
    refresh()
      .catch((error) => {
        if (mounted.current) setError(friendlyError(error, { auto: false }).message);
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
      setError(friendlyError(e, { auto: false }).message);
    } finally {
      setBusy(false);
    }
  }
  async function addComment(text: string, parentId?: string) {
    setBusy(true);
    setError("");
    try {
      await api(`/posts/${post.id}/comments`, {
        method: "POST",
        body: send({ body: text, ...(parentId ? { parentId } : {}) }),
      });
      await refresh();
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.code === "blocked") {
        setBlockedHere(true);
        setReplyTo(null);
      } else if (e instanceof ApiError && e.code === "comments_off")
        setData((current) => ({ ...current, commentsOff: true }));
      else setError(friendlyError(e, { auto: false }).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function remove(comment: Comment) {
    setBusy(true);
    setError("");
    try {
      await api(`/posts/${post.id}/comments/${comment.id}`, { method: "DELETE" });
      await refresh();
    } catch (e) {
      setError(friendlyError(e, { auto: false }).message);
    } finally {
      setBusy(false);
    }
  }
  /** Blocks a reader from all of the author's pages, then hides their comments, and the replies
   * to them, right here the way the API will on the next load. */
  async function block(reader: User) {
    setBlockBusy(true);
    setBlockError("");
    try {
      await api("/me/blocked", { method: "POST", body: send({ userId: reader.id }) });
      setData((current) => {
        const hidden = new Set(
          current.comments.filter((c) => c.author.id === reader.id).map((c) => c.id),
        );
        return {
          ...current,
          comments: current.comments.filter(
            (c) => !hidden.has(c.id) && !(c.parentId && hidden.has(c.parentId)),
          ),
        };
      });
      setReplyTo(null);
      setBlocking(null);
      setNotice(`${displayName(reader)} is blocked. their comments are hidden from your pages.`);
    } catch (e) {
      setBlockError(friendlyError(e, { auto: false }).message);
    } finally {
      setBlockBusy(false);
    }
  }
  const canComment = !!user && !data.commentsOff && !blockedHere;
  function renderComment(comment: Comment, nested: boolean) {
    const mine = user?.id === comment.author.id;
    const canDelete = mine || isAuthor;
    const canBlock = isAuthor && !mine;
    const canReply = canComment && !nested;
    return (
      <div className="flex gap-3">
        <Avatar user={comment.author} size={nested ? "small" : "normal"} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm leading-5">
            <Link
              href={`${app}/@${comment.author.username}`}
              className="font-medium transition-colors hover:text-primary"
            >
              {displayName(comment.author)}
            </Link>
            {comment.author.id === post.author.id && (
              <span className="rounded-full bg-primary/10 px-2 py-px text-[11px] font-medium text-primary">
                author
              </span>
            )}
            <time dateTime={comment.createdAt} className="text-xs text-muted-foreground">
              {date(comment.createdAt).toLowerCase()}
            </time>
          </p>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-[15px] leading-7">
            {comment.body}
          </p>
          {(canReply || canDelete || canBlock) && (
            <div className="-ml-2.5 mt-1 flex items-center gap-0.5">
              {canReply && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  aria-expanded={replyTo === comment.id}
                  onClick={() => {
                    setReplyTo(replyTo === comment.id ? null : comment.id);
                    setReply("");
                  }}
                >
                  <ArrowBendDownRight weight="bold" />
                  reply
                </Button>
              )}
              {canBlock && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  aria-label={`Block ${displayName(comment.author)}`}
                  title="block this reader from commenting on your pages"
                  disabled={busy || loading}
                  onClick={() => {
                    setBlockError("");
                    setBlocking(comment.author);
                  }}
                >
                  <Prohibit weight="bold" />
                  block
                </Button>
              )}
              {canDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  aria-label="Delete comment"
                  title="delete comment"
                  disabled={busy || loading}
                  onClick={() => remove(comment)}
                >
                  <Trash weight="bold" />
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
  const topLevel = data.comments.filter((comment) => !comment.parentId);
  const count = loading ? post.comments : data.comments.length;
  const join = appPostUrl || "/login";
  return (
    <section aria-label="Likes and comments" className="space-y-10">
      <NotchedCard className="flex flex-wrap items-center justify-between gap-2 p-2.5">
        <div className="flex flex-wrap items-center gap-1">
          {user ? (
            <>
              <Button
                variant="ghost"
                disabled={busy || loading}
                onClick={() => toggle("like")}
                aria-pressed={data.liked}
                className="relative"
              >
                <motion.span
                  key={String(data.liked)}
                  initial={{ scale: data.liked ? 0.4 : 1 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 12 }}
                  className="grid"
                >
                  <Heart
                    weight={data.liked ? "fill" : "bold"}
                    className={cn(data.liked && "text-rose")}
                  />
                </motion.span>
                {data.likes} {data.likes === 1 ? "like" : "likes"}
                <AnimatePresence>
                  {data.liked && (
                    <motion.span
                      aria-hidden="true"
                      initial={{ opacity: 1, y: 0, scale: 0.6 }}
                      animate={{ opacity: 0, y: -28, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.8 }}
                      className="pointer-events-none absolute -top-1 left-3"
                    >
                      <Critter kind="heart" className="size-5" />
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
              <Button
                variant="ghost"
                disabled={busy || loading}
                onClick={() => toggle("bookmark")}
                aria-pressed={data.bookmarked}
              >
                <BookmarkSimple
                  weight={data.bookmarked ? "fill" : "bold"}
                  className={cn(data.bookmarked && "text-[#7c5cff]")}
                />
                {data.bookmarked ? "saved" : "save for later"}
              </Button>
            </>
          ) : (
            <span className="inline-flex h-10 items-center gap-2 px-4 text-sm font-medium">
              <Heart weight="fill" className="size-4 text-rose" />
              {data.likes} {data.likes === 1 ? "like" : "likes"}
            </span>
          )}
          <Button variant="ghost" asChild>
            <a href="#comments">
              <ChatCircle weight="bold" />
              {count} {count === 1 ? "comment" : "comments"}
            </a>
          </Button>
        </div>
        {!user && (
          <Button size="sm" asChild className="mr-1">
            <Link href={join}>{appPostUrl ? "join in on jot" : "log in to join in"}</Link>
          </Button>
        )}
      </NotchedCard>
      <ErrorMessage message={error} />
      <div id="comments" className="scroll-mt-24 space-y-6">
        <SectionHeader
          title="comments"
          description="a thoughtful reply can be the start of something."
        />
        {notice && (
          <p role="status" className="text-sm text-grass-3">
            {notice}{" "}
            <Link href="/settings" className="underline underline-offset-4 hover:text-foreground">
              manage blocked readers
            </Link>
          </p>
        )}
        {data.commentsOff ? (
          <Notice critter="letter">comments are off for this page.</Notice>
        ) : blockedHere ? (
          <Notice critter="page">the author has turned off comments from you.</Notice>
        ) : user ? (
          <form
            className="flex gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await addComment(body)) setBody("");
            }}
          >
            <Avatar user={user} />
            <div className="grid min-w-0 flex-1 gap-2.5">
              <label htmlFor="comment" className="sr-only">
                Your comment
              </label>
              <Textarea
                id="comment"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                maxLength={3000}
                placeholder="add a thoughtful note…"
              />
              <Button disabled={busy || loading || !body.trim()} className="justify-self-end">
                post comment
              </Button>
            </div>
          </form>
        ) : (
          <Notice critter="book">
            <Link
              href={join}
              className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
            >
              {appPostUrl ? "open this page on jot" : "log in"}
            </Link>{" "}
            to leave a comment.
          </Notice>
        )}
        {loading ? (
          <div className="grid gap-3">
            {Array.from({ length: 2 }, (_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : (
          !topLevel.length &&
          !data.commentsOff && <p className="text-sm text-muted-foreground">no comments yet.</p>
        )}
        {topLevel.length > 0 && (
          <div className="divide-y divide-border border-t border-border">
            {topLevel.map((comment) => {
              const replies = data.comments.filter((child) => child.parentId === comment.id);
              return (
                <article key={comment.id} className="py-6">
                  {renderComment(comment, false)}
                  {replyTo === comment.id && canComment && (
                    <form
                      className="ml-12 mt-3 grid gap-2.5"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (await addComment(reply, comment.id)) {
                          setReply("");
                          setReplyTo(null);
                        }
                      }}
                    >
                      <label htmlFor={`reply-${comment.id}`} className="sr-only">
                        Your reply
                      </label>
                      <Textarea
                        id={`reply-${comment.id}`}
                        autoFocus
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        required
                        maxLength={3000}
                        placeholder={`reply to ${displayName(comment.author)}…`}
                      />
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" onClick={() => setReplyTo(null)}>
                          cancel
                        </Button>
                        <Button disabled={busy || loading || !reply.trim()}>post reply</Button>
                      </div>
                    </form>
                  )}
                  {replies.length > 0 && (
                    <div className="ml-12 mt-5 space-y-5 border-l-2 border-border pl-5">
                      {replies.map((child) => (
                        <article key={child.id}>{renderComment(child, true)}</article>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
      <Dialog
        open={!!blocking}
        onOpenChange={(open) => {
          if (!open && !blockBusy) setBlocking(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>block {blocking ? displayName(blocking) : "this reader"}?</DialogTitle>
            <DialogDescription>
              they won&apos;t be able to comment on any of your pages, and their comments, with the
              replies to them, will be hidden. they can still read and like your pages. you can
              unblock them in settings.
            </DialogDescription>
          </DialogHeader>
          <ErrorMessage message={blockError} />
          <DialogFooter>
            <Button variant="outline" disabled={blockBusy} onClick={() => setBlocking(null)}>
              cancel
            </Button>
            <Button
              variant="destructive"
              disabled={blockBusy}
              onClick={() => blocking && block(blocking)}
            >
              {blockBusy ? "blocking…" : "block reader"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
