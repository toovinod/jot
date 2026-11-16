import "server-only";
import type { Post } from "@jot/contracts";
import { cache } from "react";
import { notFound } from "next/navigation";
import { publicApi } from "./public-api";
import { normalizePublicSlug, normalizePublicUsername } from "./public-route";
export const getPublishedPost = cache(async (handle: string, slug: string) => {
  const username = normalizePublicUsername(handle),
    normalizedSlug = normalizePublicSlug(slug);
  if (!username || !normalizedSlug) notFound();
  return publicApi<Post>(
    `/public/${encodeURIComponent(username)}/${encodeURIComponent(normalizedSlug)}`,
  );
});
