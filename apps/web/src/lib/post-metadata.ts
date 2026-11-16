import type { Metadata } from "next";
import type { Post } from "@jot/contracts";
export function publishedPostMetadata(post: Post): Metadata {
  const value = post.published || post;
  return {
    title: value.title || "Untitled",
    description: value.subtitle || undefined,
    robots: value.visibility === "unlisted" ? { index: false, follow: false } : undefined,
  };
}
