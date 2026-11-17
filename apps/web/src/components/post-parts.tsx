import Link from "next/link";
import type { Post, Snapshot, User } from "@jot/contracts";
import { cn, date, safeUrl } from "@/lib/utils";
/** Post pieces that client components share. Kept apart from document.tsx so the code
 * highlighter and its grammars stay out of client bundles. */
const avatarSizes = {
  small: "size-7 text-xs",
  normal: "size-9 text-sm",
  large: "size-20 text-3xl",
};
export function Avatar({
  user,
  size = "normal",
  className,
}: {
  user: User;
  size?: keyof typeof avatarSizes;
  className?: string;
}) {
  const src = safeUrl(user.avatar, true);
  return src ? (
    <img
      src={src}
      alt=""
      className={cn("shrink-0 rounded-full bg-muted object-cover", avatarSizes[size], className)}
      referrerPolicy="no-referrer"
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full bg-sky font-display font-semibold text-white",
        avatarSizes[size],
        className,
      )}
    >
      {(user.name || user.username).slice(0, 1).toUpperCase()}
    </span>
  );
}
export function AuthorLine({ author, publishedAt }: { author: User; publishedAt?: string }) {
  return (
    <Link
      href={`/@${encodeURIComponent(author.username)}`}
      className="group/author inline-flex min-w-0 items-center gap-2.5 text-sm"
    >
      <Avatar user={author} size="small" />
      <span className="min-w-0">
        <span className="block truncate font-medium transition-colors group-hover/author:text-sky-deep">
          {author.name || author.username}
        </span>
        {publishedAt && (
          <span className="block text-xs text-muted-foreground">
            {date(publishedAt).toLowerCase()}
          </span>
        )}
      </span>
    </Link>
  );
}
export function publicSnapshot(post: Post): Snapshot {
  return post.published || post;
}
