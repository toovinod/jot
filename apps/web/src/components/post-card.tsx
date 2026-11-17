import Link from "next/link";
import { ArrowUpRight, ChatCircle, Heart } from "@phosphor-icons/react/dist/ssr";
import { postPath, type PostSummary } from "@jot/contracts";
import { AuthorLine } from "./post-parts";
import { NotchedCard, type Stripe } from "./app/notched-card";
import { appHref } from "@/lib/app-origin";
import { safeUrl } from "@/lib/utils";
const stripeCycle: Stripe[] = ["sky", "sun", "rose", "grass", "violet"];
/** Each post keeps one stripe color wherever its card shows up. */
function stripeFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return stripeCycle[hash % stripeCycle.length];
}
/** `appOrigin` is set on a custom domain, so tag links open discover on the app. */
export function PostCard({ post, appOrigin }: { post: PostSummary; appOrigin?: string }) {
  const cover = safeUrl(post.cover, true);
  const path = postPath(post.author.username, post.slug);
  const summary = post.subtitle || post.excerpt;
  return (
    <article className="group h-full">
      <NotchedCard
        stripe={stripeFor(post.id)}
        className="flex h-full flex-col p-5 pb-9 transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transform-none"
      >
        <div className="relative z-10 flex items-center justify-between gap-3">
          <AuthorLine author={post.author} publishedAt={post.publishedAt} />
          <span className="shrink-0 text-xs text-muted-foreground">
            {post.readingMinutes} min read
          </span>
        </div>
        <div className="mt-4 flex flex-1 gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-balance font-display text-xl font-semibold leading-snug tracking-[-0.03em] transition-colors group-hover:text-sky-deep">
              {/* The title link stretches over the card; author and tag links sit above it. */}
              <Link
                href={path}
                className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:underline"
              >
                {post.title || "untitled"}
              </Link>
            </h2>
            {summary && (
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{summary}</p>
            )}
          </div>
          {cover && (
            <img
              src={cover}
              alt=""
              loading="lazy"
              className="notched size-20 shrink-0 bg-muted object-cover sm:size-24"
              referrerPolicy="no-referrer"
            />
          )}
        </div>
        {post.tags?.length > 0 && (
          <div className="relative z-10 mt-4 flex flex-wrap gap-1.5">
            {post.tags.map((tag) => (
              <Link
                key={tag}
                href={appHref(`/discover?tag=${encodeURIComponent(tag)}`, appOrigin)}
                className="rounded-full bg-sky-soft px-2 py-0.5 font-mono text-[11px] text-sky-deep transition-colors hover:bg-sky hover:text-white"
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}
        <div className="mt-5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span className="truncate font-mono">{path}</span>
          <span className="flex shrink-0 items-center gap-3">
            <span className="flex items-center gap-1" title="likes">
              <Heart weight="fill" aria-hidden="true" className="size-3.5 text-rose" />
              {post.likes || 0}
              <span className="sr-only">likes</span>
            </span>
            <span className="flex items-center gap-1" title="comments">
              <ChatCircle weight="fill" aria-hidden="true" className="size-3.5 text-sky" />
              {post.comments || 0}
              <span className="sr-only">comments</span>
            </span>
            <ArrowUpRight
              weight="bold"
              aria-hidden="true"
              className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-sky-deep motion-reduce:transform-none"
            />
          </span>
        </div>
      </NotchedCard>
    </article>
  );
}
