import Link from "next/link";
import { ArrowUpRight, ChatCircle, Heart } from "@phosphor-icons/react/dist/ssr";
import { postPath, type PostSummary } from "@jot/contracts";
import { AuthorLine } from "./document";
import { safeUrl } from "@/lib/utils";
export function PostCard({ post, index }: { post: PostSummary; index?: number }) {
  const cover = safeUrl(post.cover, true);
  const path = postPath(post.author.username, post.slug);
  return (
    <article className="group flex h-full flex-col rounded-3xl border border-border bg-white p-6 shadow-[0_4px_0_var(--border)] transition-transform duration-200 hover:-translate-y-1 hover:-rotate-[0.3deg] motion-reduce:transform-none">
      <div className="mb-5 flex items-center justify-between">
        <AuthorLine author={post.author} publishedAt={post.publishedAt} />
        {index !== undefined && (
          <span className="font-mono text-xs text-muted-foreground">
            {String(index + 1).padStart(2, "0")}
          </span>
        )}
      </div>
      <Link href={path} className="flex flex-1 gap-5">
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-[26px] leading-tight tracking-[-0.01em] transition-colors group-hover:text-sky-deep">
            {post.title || "Untitled"}
          </h2>
          <p className="mt-2.5 line-clamp-2 text-sm leading-6 text-muted-foreground">
            {post.subtitle || post.excerpt}
          </p>
        </div>
        {cover && (
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="size-24 rounded-2xl object-cover sm:size-28"
            referrerPolicy="no-referrer"
          />
        )}
      </Link>
      <div className="mt-6 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="truncate font-mono">{path}</span>
        <span className="flex shrink-0 items-center gap-3.5">
          <span>{post.readingMinutes} min read</span>
          <span className="flex items-center gap-1">
            <Heart weight="fill" className="size-3.5 text-rose" />
            {post.likes || 0}
          </span>
          <span className="flex items-center gap-1">
            <ChatCircle weight="duotone" className="size-3.5" />
            {post.comments || 0}
          </span>
          <ArrowUpRight
            weight="bold"
            className="size-4 text-sky-deep transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          />
        </span>
      </div>
    </article>
  );
}
