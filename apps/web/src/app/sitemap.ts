import type { MetadataRoute } from "next";
import { postPath, type SitemapEntry } from "@jot/contracts";
import { publicOrigin } from "@/lib/post-metadata";
const api = process.env.API_INTERNAL_URL || "http://127.0.0.1:8080";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await publicOrigin();
  const pages = ["/", "/discover", "/privacy", "/terms"].map((path) => ({ url: origin + path }));
  // A missing or failing API leaves the static pages, so the sitemap never breaks a build or crawl.
  try {
    const response = await fetch(`${api}/api/sitemap`, {
      cache: "no-store",
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return pages;
    const entries = (await response.json()) as SitemapEntry[];
    return [
      ...pages,
      ...entries.map((entry) => ({
        url: origin + postPath(entry.username, entry.slug),
        lastModified: entry.updatedAt,
      })),
    ];
  } catch {
    return pages;
  }
}
