import type { Metadata } from "next";
import { headers } from "next/headers";
import { postPath, type Post } from "@jot/contracts";
import { appOrigin, customDomainHeader } from "./app-origin";
import { safeUrl } from "./utils";
/** The origin the current request came in on, which may be an author's custom domain. */
export async function requestOrigin() {
  const list = await headers();
  const host = (list.get("x-forwarded-host") || list.get("host") || "").split(",")[0].trim();
  const proto =
    (list.get("x-forwarded-proto") || "").split(",")[0].trim() ||
    (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  try {
    return new URL(`${proto}://${host}`).origin;
  } catch {
    return "http://localhost:3000";
  }
}
/** The canonical origin for absolute URLs in metadata and sitemaps: APP_ORIGIN when it is set,
 * so a post served on a custom domain still names one address. */
export async function publicOrigin() {
  return appOrigin() ?? (await requestOrigin());
}
/** True when the proxy served this request for an author's custom domain. */
export async function onCustomDomain() {
  return !!(await headers()).get(customDomainHeader);
}
/** The origin app links must use: APP_ORIGIN on a custom domain, else none (links stay relative). */
export async function appLinkOrigin() {
  return (await onCustomDomain()) ? (appOrigin() ?? undefined) : undefined;
}
export function publishedPostMetadata(post: Post, origin: string): Metadata {
  const value = post.published || post;
  const title = value.title || "Untitled",
    description = value.subtitle || undefined,
    url = new URL(postPath(post.author.username, value.slug), origin).toString(),
    cover = safeUrl(value.cover, true),
    images = cover ? [new URL(cover, origin).toString()] : undefined;
  return {
    title,
    description,
    robots: value.visibility === "unlisted" ? { index: false, follow: false } : undefined,
    alternates: {
      canonical: url,
      types: {
        "application/rss+xml": new URL(
          `/@${encodeURIComponent(post.author.username)}/rss.xml`,
          origin,
        ).toString(),
      },
    },
    openGraph: {
      type: "article",
      url,
      title,
      description,
      images,
      publishedTime: post.publishedAt,
      authors: [post.author.name || post.author.username],
    },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, images },
  };
}
