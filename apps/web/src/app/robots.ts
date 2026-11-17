import type { MetadataRoute } from "next";
import { publicOrigin } from "@/lib/post-metadata";
export default async function robots(): Promise<MetadataRoute.Robots> {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Shared drafts stay crawlable so crawlers can read their own noindex.
      disallow: ["/dashboard", "/editor", "/settings"],
    },
    sitemap: `${await publicOrigin()}/sitemap.xml`,
  };
}
