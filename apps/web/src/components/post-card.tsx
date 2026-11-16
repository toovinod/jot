import Link from "next/link";
import { ArrowUpRight, Heart, MessageCircle } from "lucide-react";
import { postPath, type PostSummary } from "@jot/contracts";
import { AuthorLine } from "./document";
import { safeUrl } from "@/lib/utils";
export function PostCard({ post, index }: { post: PostSummary; index?: number }) {
  const cover = safeUrl(post.cover, true);
  return (
    <article className="group flex flex-col border-b border-border py-8">
      <div className="mb-5 flex items-center justify-between">
        <AuthorLine author={post.author} publishedAt={post.publishedAt} />
        {index !== undefined && (
          <span className="font-mono text-xs text-muted-foreground">
            {String(index + 1).padStart(2, "0")}
          </span>
        )}
      </div>
      <Link href={postPath(post.author.username, post.slug)} className="flex flex-1 gap-6">
        <div className="flex-1">
          <h2 className="font-serif text-3xl leading-tight tracking-tight transition-colors group-hover:text-primary">
            {post.title || "Untitled"}
          </h2>
          <p className="mt-3 line-clamp-2 text-sm leading-6 text-muted-foreground">
            {post.subtitle || post.excerpt}
          </p>
        </div>
        {cover && (
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="size-24 rounded-lg object-cover sm:size-28"
            referrerPolicy="no-referrer"
          />
        )}
      </Link>
      <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
        <span>{post.readingMinutes} min read</span>
        <span className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Heart size={13} />
            {post.likes || 0}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle size={13} />
            {post.comments || 0}
          </span>
          <ArrowUpRight size={15} className="text-primary" />
        </span>
      </div>
    </article>
  );
}
